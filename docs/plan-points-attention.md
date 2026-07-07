# Plan — Points d'attention (dette technique)

> Document de conception destiné à un agent d'implémentation.
> Rédigé le 2026-07-07. Contexte projet : voir `CLAUDE.md` à la racine.
> Stack : React 18 + TS + Vite, Express (`server/server.js`), Supabase (PostgreSQL + Auth + RLS), Mistral AI.

## Objectif

Traiter les 4 points d'attention listés dans `CLAUDE.md` :
1. Gestion du schema SQL (migrations)
2. Sessions questionnaire en mémoire (persistance)
3. Absence de tests
4. Vérification des policies RLS

## Ordre recommandé

```
1. Migrations SQL   ← socle, à faire avant toute nouvelle table
2. Sessions         ← corrige aussi un bug d'incohérence (voir §2)
3. Tests            ← démarrer tôt, en continu
4. RLS              ← après les migrations (policies versionnées)
```

Traiter 1 et 2 **avant** la feature « envoi de courriers » (voir `design-envoi-courriers.md`), qui ajoute des tables et de la logique serveur.

---

## Chantier 1 — Migrations SQL versionnées

### Contexte
Aujourd'hui : deux fichiers à la racine (`supabase_v1_schema.sql`, `supabase_auth_setup.sql`), appliqués manuellement dans le SQL Editor Supabase. Risque de drift entre l'état réel de la BDD et le code.

### Étapes
1. Installer le CLI Supabase (`npm i -D supabase` ou binaire) et `supabase init` → crée `supabase/`.
2. Baseline : créer `supabase/migrations/0000_init.sql` à partir du contenu **fusionné et vérifié** de `supabase_v1_schema.sql` + `supabase_auth_setup.sql` (dédupliquer, ordonner : extensions → tables → indexes → policies RLS → triggers).
3. Lier le projet : `supabase link --project-ref <ref>` (le `<ref>` vient de l'URL Supabase).
4. Vérifier que la baseline correspond à la BDD réelle : `supabase db diff` doit renvoyer vide. Corriger la migration jusqu'à diff nul.
5. Workflow désormais : `supabase migration new <nom>` → éditer le `.sql` → `supabase db push`.
6. Dev local optionnel : `supabase start` (Docker) pour une BDD locale.
7. Déplacer les anciens `.sql` racine dans `docs/legacy/` ou les supprimer une fois la baseline validée. Mettre à jour la section « Schema SQL » de `CLAUDE.md`.

### Fichiers touchés
- Nouveau : `supabase/config.toml`, `supabase/migrations/*.sql`
- `CLAUDE.md` (mettre à jour « Points d'attention » → schema)
- Racine : retirer/déplacer `supabase_v1_schema.sql`, `supabase_auth_setup.sql`

### Critères d'acceptation
- `supabase db diff` renvoie vide sur la BDD de prod après application de la baseline.
- Toute évolution future de schéma passe par un fichier dans `supabase/migrations/` versionné dans git.

---

## Chantier 2 — Persistance des sessions questionnaire

### Contexte
Les sessions sont dans une `Map()` en mémoire (`server/server.js`, ~ligne 98). Conséquences : perdues au redémarrage, non partagées entre process, fuite mémoire potentielle (pas d'expiration).

### ⚠️ Bug à corriger dans le même chantier : incohérence du modèle de session
Deux formes de session coexistent selon la route :
- Flux questionnaire principal (`/api/questionnaire/start` et `/answer`) stocke **`session.messages`** (historique conversationnel Mistral).
- `/api/demo/*`, `/api/questionnaire/save-partial`, `/api/questionnaire/load-draft` et `/api/debug/session/:id` lisent **`session.historique`**.

Une session créée par le flux questionnaire n'a **pas** de `session.historique` → ces routes plantent (`Cannot read length of undefined`) ou renvoient des données incohérentes. `getNextQuestionAfterHistory()` / `getQuestion()` référencent aussi un modèle de questions par règles (`q_start`, `suivant`) qui n'existe plus (le questionnaire est piloté par l'agent Mistral). **Décider** : soit supprimer les routes mortes (`save-partial`, `load-draft`, `getNextQuestionAfterHistory`, `getQuestion`, `/api/debug/session`), soit les réaligner sur le modèle `messages`. Recommandation : supprimer le code mort, garder un modèle de session unique basé sur `messages`.

### Solution retenue : table Supabase `questionnaire_sessions`
Reste dans la stack existante, RLS gratuite, persistant. (Alternative si scaling horizontal : Redis Upstash avec TTL natif.)

Schéma (à créer via une migration — voir Chantier 1) :
```sql
create table questionnaire_sessions (
  id            text primary key,              -- session_id ('sess_...')
  user_id       uuid not null references auth.users(id) on delete cascade,
  messages      jsonb not null default '[]',   -- historique Mistral [{role, content}]
  question_count int not null default 0,
  is_demo       boolean not null default false,
  extracted_answers jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours'
);
alter table questionnaire_sessions enable row level security;
create policy "own sessions" on questionnaire_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Étapes
1. Créer la table + policy RLS via migration.
2. Dans `server/server.js`, remplacer les accès à la `Map()` par des lectures/écritures sur `questionnaire_sessions` via `req.supabaseClient` (client authentifié, respecte la RLS).
3. Unifier sur `messages` ; supprimer le code mort lié à `historique` (voir bug ci-dessus).
4. Ajouter l'expiration : filtrer `expires_at > now()` à la lecture ; job de cleanup (cron Supabase `pg_cron` ou suppression paresseuse à la lecture).
5. Vérifier que le flux complet fonctionne : `start` → plusieurs `answer` → `complete` → roadmap générée.

### Fichiers touchés
- `server/server.js` (routes questionnaire, suppression code mort demo/draft)
- Nouvelle migration `supabase/migrations/*_questionnaire_sessions.sql`

### Critères d'acceptation
- Un questionnaire survit à un redémarrage du serveur (session relue depuis Supabase).
- Aucune route ne référence plus `session.historique` sans que le champ existe.
- Un utilisateur ne peut pas lire la session d'un autre (RLS).

---

## Chantier 3 — Tests automatisés (Vitest)

### Contexte
Aucun framework de test configuré. Validation uniquement manuelle via navigateur.

### Stack
- **Vitest** (intégration native Vite) — runner + assertions
- **@testing-library/react** + **@testing-library/jest-dom** + **jsdom** — tests de composants
- **Supertest** — tests des routes Express

Ajouter à `package.json` :
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```
Config : `vitest.config.ts` (ou étendre `vite.config.ts`) avec `environment: 'jsdom'`, `globals: true`, setup `@testing-library/jest-dom`.

### Cibles prioritaires (logique pure, fort ROI, sujette aux bugs)
1. `src/lib/roadmap-generator.ts` — `generateRoadmap()` : filtrage des étapes par `applicable_when` selon `QuestionnaireAnswers`. Cas : chaque `relation`, présence/absence d'organismes, booléens.
2. `src/hooks/useLetterGenerator.ts` — résolution des variables `{{...}}`, `isComplete`, `missingVariables`, formatage de dates.
3. `server/server.js` — extraire dans un module testable les helpers `parseMistralJson`, `sanitizeQuestionData`, `extractMistralText` (parsing fragile des réponses Mistral, mode thinking + blocs markdown). Les tester avec des payloads réalistes (string, array `[{type:'text'}]`, JSON dans ```` ```json ````).
4. `src/utils/validation.ts`.

### Étapes
1. Installer les deps, config Vitest, script `test`.
2. Écrire les tests unitaires des cibles 1→4.
3. (Optionnel) Tests de composants smoke (ex. `QuestionCard`, `LetterPreview`).
4. CI : GitHub Actions `.github/workflows/ci.yml` → `npm ci` → `npx tsc --noEmit` → `npm test`.

### Note
Pour tester les helpers du serveur, il faudra probablement les extraire de `server/server.js` vers `server/lib/mistral-parsing.js` (export nommé) — refactor léger, sans changement de comportement.

### Critères d'acceptation
- `npm test` passe en local et en CI.
- `generateRoadmap` et `useLetterGenerator` ont une couverture des branches principales.

---

## Chantier 4 — Audit et tests RLS

### Contexte
Les policies RLS sont actives. Les requêtes serveur utilisent le token utilisateur via `getSupabaseClient(token)`. Aucune vérification automatisée qu'une policy ne fuit pas.

### Étapes
1. Documenter, table par table, les policies attendues (qui peut lire/écrire quoi). Livrable : `docs/rls-policies.md`.
2. Écrire un test d'isolation : créer 2 utilisateurs de test, insérer des lignes pour A, vérifier que B (avec son propre token) ne peut ni lire ni modifier les lignes de A pour chaque table (`transmissions`, `questionnaires`, `roadmaps`, `steps`, `step_actions`, `documents`, `questionnaire_sessions`, et les futures `letter_sends`, `attachments`). Outil : script Node avec `@supabase/supabase-js` et 2 tokens, ou pgTAP.
3. Vérifier qu'aucune route serveur n'utilise une clé `service_role` (qui contournerait la RLS). État actuel : seule la clé anon est configurée → OK, à préserver.

### Critères d'acceptation
- `docs/rls-policies.md` liste chaque table et sa policy.
- Le test d'isolation passe : aucun accès cross-user.

---

## Récapitulatif des dépendances à ajouter

| Chantier | Dépendances |
|---|---|
| Migrations | `supabase` (CLI, devDep) |
| Sessions | aucune (utilise Supabase déjà présent) |
| Tests | `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `supertest` (devDeps) |
| RLS | aucune (script de test avec deps existantes) |
