# Audit — Row Level Security (RLS) Supabase

> Audit défensif de la sécurité d'accès BDD du projet Seren.
> Réalisé le 2026-07-16 (§4 de `docs/plan-points-attention.md`). Contexte projet : voir `CLAUDE.md`.
> Périmètre : 7 tables `public` — `questionnaires`, `roadmaps`, `steps`, `step_actions`, `documents`, `transmissions`, `questionnaire_sessions`.
> Sources de vérité : `supabase/schema_full.sql` (consolidé), `supabase/migrations/*.sql`, et les fichiers historiques racine `supabase_v1_schema.sql` / `supabase_auth_setup.sql` (état v1).

## Méthodologie

1. **Analyse statique** — extraction des policies de chaque table depuis `schema_full.sql`, contrôle de dérive vs migrations et vs fichiers v1, construction d'une matrice de couverture (opérations autorisées / silencieusement interdites).
2. **Cartographie des accès réels** — `grep '\.from(' / '\.rpc('` sur `src/` (client, token utilisateur) et `server/` (serveur, token utilisateur via `getSupabaseClient`, plus client publishable « nu »). Pour chaque chemin de code : la RLS autorise-t-elle **exactement** ce dont le code a besoin, et **rien de plus** ?
3. **Sondes live** — projet de dev (`oltwzvfjazwjvghpzhia`), clé publishable, compte de test jetable. Toutes les sondes inter-utilisateurs sont des lectures attendues-refusées ou des écritures no-op ; aucune donnée non possédée par le compte de test n'est modifiée ou supprimée. Le contenu du champ `data` des transmissions n'est **jamais** exfiltré (comptage de lignes uniquement).

### Modèle d'accès du code

| Chemin | Client Supabase | Isolation |
|--------|-----------------|-----------|
| Front React (`src/`) | client publishable + session utilisateur (`supabase.auth`) | RLS via `auth.uid()` |
| API questionnaire v2 / transmissions (`server/`) | `getSupabaseClient(token)` — publishable + `Authorization: Bearer <token utilisateur>` | RLS via `auth.uid()` |
| `requireAuth` (validation token) | client publishable « nu » (`supabase.auth.getUser(token)`) | validation Auth uniquement, aucune lecture de table |

Aucun appel `.rpc()`. Aucune utilisation de clé secrète `sb_secret_…` côté serveur (conforme au principe « la RLS s'applique toujours via le token utilisateur » du `CLAUDE.md`). C'est un bon point : il n'existe **aucun** chemin qui contourne la RLS avec des droits de service.

## Matrice de couverture par table

Convention : ✅ policy owner-scopée (`auth.uid() = user_id`) présente · ⛔ aucune policy = opération silencieusement refusée par la RLS · ⚠️ policy présente mais trop permissive.

| Table | SELECT | INSERT | UPDATE | DELETE | Remarque |
|-------|:------:|:------:|:------:|:------:|----------|
| `questionnaires` | ✅ | ✅ | ✅ | ⛔ | pas de suppression (voir F2) |
| `roadmaps` | ✅ | ✅ | ⛔ | ⛔ | insert-only (le code n'update/delete jamais) |
| `steps` | ✅ | ✅ | ✅ | ⛔ | update = bascule de statut ; pas de suppression |
| `step_actions` | ✅ | ✅ | ⛔ | ⛔ | append-only (historique d'actions) |
| `documents` | ✅ | ✅ | ✅ | ✅ | CRUD complet owner-scopé |
| `transmissions` | ✅ **+ ⚠️** | ✅ | ✅ | ✅ | policy « access_code » trop large (voir F1) |
| `questionnaire_sessions` | ✅ (FOR ALL) | ✅ | ✅ | ✅ | une policy `FOR ALL` couvre les 4 opérations |

**Ciblage des rôles.** Aucune policy ne précise de clause `TO` → elles s'appliquent à `PUBLIC` (rôles `anon` **et** `authenticated`). Pour toutes les policies owner-scopées, ce n'est pas un problème : pour un appelant `anon`, `auth.uid()` vaut `NULL`, donc `NULL = user_id` est `NULL` (jamais vrai) → la ligne est refusée (fail-closed). Seule la policy transmissions « access_code » teste `auth.role()` au lieu de la propriété — c'est précisément le défaut F1.

**Adéquation code ↔ RLS.** Chaque `.from()` du code a été confronté à la matrice :

- `src/lib/roadmap-generator.ts` → INSERT `roadmaps` + `steps` avec `user_id: userId` : couvert par les policies INSERT (`WITH CHECK auth.uid() = user_id`).
- `src/pages/DashboardPage.tsx` → SELECT `roadmaps`/`questionnaires`/`steps`, UPDATE `steps` par `.eq('id', stepId)` **sans** filtre `user_id` : l'isolation repose entièrement sur la RLS UPDATE (`USING auth.uid() = user_id`) — correct et vérifié live (sonde 3).
- `src/pages/DocumentsPage.tsx` → SELECT `documents`/`step_actions`, DELETE `documents` par `.eq('id', id)` **sans** filtre `user_id` : la policy DELETE owner-scopée garantit qu'un utilisateur ne supprime que ses propres courriers (sonde bonus : 0 ligne étrangère lisible, donc rien d'étranger n'est supprimable). Chemin légitime.
- `src/pages/QuestionnairePage.tsx`, `src/components/letter/*` → INSERT `questionnaires` / `step_actions` owner-scopés : couverts.
- `server/lib/sessions-store.js` → CRUD `questionnaire_sessions` via le client authentifié ; la policy `FOR ALL` owner-scopée assure l'isolation (les commentaires du fichier documentent d'ailleurs ce contrat).
- `server/server.js` → `/api/transmission/:code` lit `transmissions` filtré par `.eq('access_code', code)` sur le client authentifié. **C'est ici que la RLS devrait restreindre au code fourni, mais ne le fait pas** (F1) : c'est le `.eq()` applicatif, et lui seul, qui limite les lignes.

Le principe de moindre privilège est globalement respecté : `roadmaps` et `step_actions` n'exposent que ce que le code utilise (insert-only / append-only). Aucun `select('*')` ne renvoie de colonne réellement sensible au-delà du besoin (les tables produit ne stockent pas de PII étendue ; le seul champ « lourd » est `documents.content` / `transmissions.data`, tous deux owner-scopés — sauf le défaut F1 sur `transmissions`).

## Résultats des sondes live

Projet dev, 2026-07-16. Compte de test `d12f1b55-…e92d66`.

| # | Sonde | Requête | Attendu | Observé | Verdict |
|---|-------|---------|---------|---------|---------|
| 1 | ANON SELECT (7 tables) | `GET /rest/v1/<table>?select=id&limit=5` sans token | 0 ligne / 401 | `200`, **0 ligne** sur les 7 tables | ✅ fail-closed |
| 2 | Token — SELECT `transmissions` | `GET transmissions?select=id,user_id,access_code,data` | seulement les lignes du compte test | `200`, total **0** (table vide en dev) | ⚠️ non reproductible faute de données — voir F1 |
| 3 | Token — UPDATE `steps` étranger | `PATCH steps?id=eq.<uuid aléatoire>` `{status:done}` | 0 ligne modifiée | `200`, **0 ligne** renvoyée | ✅ RLS filtre |
| 4 | Token — INSERT `roadmaps` `user_id` usurpé | `POST roadmaps {user_id:<autre>}` | violation RLS | `403` `42501` « new row violates row-level security policy » | ✅ WITH CHECK bloque |
| 5 | Token — DELETE `questionnaire_sessions` étranger | `DELETE questionnaire_sessions?id=eq.<uuid aléatoire>` | 0 ligne | `200`, **0 ligne** supprimée | ✅ FOR ALL couvre le delete owner |
| 6 | Token — SELECT tables owner-scopées | `GET <table>?select=user_id` | aucune ligne étrangère | questionnaires 7/**0 étr.**, roadmaps 7/**0**, steps 227/**0**, step_actions 0, documents 0, sessions 14/**0** | ✅ isolation stricte |

**Lecture des résultats.** L'isolation par propriétaire du produit principal est **confirmée live** : aucune fuite inter-utilisateur sur les 6 tables owner-scopées, écriture usurpée rejetée (403), update/delete étrangers no-op. La sonde 2 n'a **pas pu reproduire** le défaut F1 uniquement parce que la table `transmissions` est vide sur le projet de dev — l'exposition reste **certaine par analyse statique** (démonstration ci-dessous) et se matérialiserait dès qu'une transmission existe.

## Findings

### F1 — `transmissions` : lecture de TOUTES les transmissions par n'importe quel utilisateur authentifié — **Important**

**Constat.** La policy de partage
```sql
CREATE POLICY "Authenticated users can read with access_code"
  ON transmissions FOR SELECT
  USING (auth.role() = 'authenticated' AND access_code IS NOT NULL);
```
ne vérifie **pas** le code d'accès : `access_code` étant une colonne `NOT NULL UNIQUE`, `access_code IS NOT NULL` est **vrai pour toutes les lignes**. La condition se réduit donc à `auth.role() = 'authenticated'`. En RLS PostgreSQL, plusieurs policies permissives d'une même commande se combinent en **OU** : pour un `SELECT`, une ligne est visible si `auth.uid() = user_id` **OU** `authenticated AND access_code IS NOT NULL`. Résultat : **tout utilisateur connecté peut lire l'intégralité de la table `transmissions`**, sans connaître aucun code. La restriction au code n'existe que dans le code applicatif (`server.js` : `.eq('access_code', code)`), pas dans la policy.

**Preuve.**
- Statique : la clause `USING` ne référence jamais un code fourni par l'appelant (une policy ne reçoit pas de paramètre ; elle ne peut donc pas comparer à « le code saisi »). Le filtrage par code est structurellement impossible dans cette policy.
- Live : sonde 2 — le compte de test possède 0 transmission mais la requête `SELECT * FROM transmissions` (sans filtre de code) est acceptée (`200`) et renverrait toutes les lignes existantes. La table étant vide en dev, 0 ligne remonte ; l'exposition n'est donc pas démontrable par la donnée aujourd'hui, mais la policy l'autorise sans condition de propriété ni de code.

**Risque.** Le champ `data` contient l'historique sérialisé du questionnaire « transmission » (situation familiale, enfants, patrimoine immobilier, personnes à prévenir…). Un utilisateur authentifié malveillant peut, via la clé publishable (publique) et un simple `GET /rest/v1/transmissions`, aspirer les données de transmission de **tous** les utilisateurs. Le code d'accès (8 caractères hex = 32 bits) devient hors sujet : la RLS ne l'exige pas. Confidentialité de données personnelles sensibles → enjeu RGPD.

**Facteurs atténuants.** (1) Produit transmission **gelé** (`CLAUDE.md`) et peu / pas utilisé en prod — table vide en dev. (2) L'exposition requiert un compte authentifié (pas d'accès anonyme — confirmé sonde 1). Cela réduit l'exploitabilité immédiate mais ne corrige pas le défaut.

**Correctif proposé (proposition uniquement — produit gelé, ne pas appliquer sans décision).** Remplacer la policy par un accès via fonction `SECURITY DEFINER` prenant le code en **paramètre**, qui applique elle-même l'égalité exacte et contourne la RLS de façon contrôlée :

```sql
-- 1. Supprimer la policy trop permissive
DROP POLICY IF EXISTS "Authenticated users can read with access_code" ON transmissions;

-- 2. RPC de partage : lecture d'UNE transmission par code exact, réservée aux authentifiés
CREATE OR REPLACE FUNCTION public.get_transmission_by_code(p_code text)
RETURNS TABLE (data text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.data, t.created_at
  FROM transmissions t
  WHERE t.access_code = upper(p_code)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_transmission_by_code(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_transmission_by_code(text) TO authenticated;
```

Puis, côté serveur, remplacer le `.from('transmissions').select('*').eq('access_code', …)` de `/api/transmission/:code` par `.rpc('get_transmission_by_code', { p_code: code })`. Il ne reste alors que les policies owner-scopées sur la table ; le partage passe exclusivement par la fonction, qui n'expose jamais plus d'une ligne et exige le code exact. (Amélioration optionnelle : rate-limiter l'endpoint pour contrer le brute-force du code sur 32 bits.)

> Application différée : le produit transmission est gelé (cf. `CLAUDE.md` — « ne pas toucher sans décision explicite »). Décision produit requise auprès d'Arnaud avant migration + modification serveur.

### F2 — Absence de policies DELETE sur `questionnaires`, `roadmaps`, `steps`, `step_actions` — **Mineur (décision produit / RGPD)**

**Constat.** Ces 4 tables n'ont **aucune** policy DELETE (ni UPDATE pour `roadmaps`/`step_actions`). La RLS refuse donc silencieusement toute suppression : une requête `DELETE` renvoie `200` avec 0 ligne affectée (pas d'erreur). Un utilisateur ne peut pas effacer directement ses questionnaires, roadmaps, étapes ou historique d'actions.

**Preuve.** Matrice ci-dessus ; comportement « delete silencieux » cohérent avec la sonde 5 (delete no-op côté sessions par absence de ligne, mais ici c'est l'absence de policy qui bloque).

**Risque.** Faible en intégrité (interprétation « journal immuable » plausible et volontaire), mais **droit à l'effacement RGPD** : il n'existe pas de chemin applicatif pour qu'un utilisateur purge ses données de démarches. Le cas dur est couvert par la **suppression de compte** : toutes ces tables ont `user_id … REFERENCES auth.users(id) ON DELETE CASCADE`, donc supprimer le compte Auth efface en cascade l'intégralité des données. Il manque donc surtout un flux « supprimer mon compte / mes données » dans l'app, pas nécessairement des policies DELETE table par table.

**Correctif proposé (décision produit — non appliqué).** Deux options, à trancher avec Arnaud :
- **A (préférée)** : implémenter un flux « supprimer mon compte » qui déclenche la suppression de l'utilisateur `auth.users` (via Edge Function / endpoint serveur avec clé service, hors périmètre de ce commit) → cascade automatique. N'ajoute aucune policy DELETE, préserve l'immutabilité de l'historique tant que le compte vit.
- **B** : ajouter des policies DELETE owner-scopées sur les 4 tables si l'on veut permettre l'effacement granulaire in-app. Sûr techniquement, mais change le modèle « append-only » actuel — d'où le classement « décision produit », non committé ici.

```sql
-- Option B (à n'appliquer qu'après décision produit) :
CREATE POLICY "Users can delete own questionnaires" ON questionnaires
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own roadmaps" ON roadmaps
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own steps" ON steps
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own step_actions" ON step_actions
  FOR DELETE USING (auth.uid() = user_id);
```

### F3 — API PostgREST joignable par la clé publishable en anonyme — **Info (comportement attendu)**

**Constat.** Les requêtes `anon` (sans token) renvoient `200` et non `401` (sonde 1). C'est le fonctionnement **normal** de Supabase : la clé publishable/anon est publique par conception, l'API REST est joignable, et c'est la **RLS** qui protège les données — ce qu'elle fait ici (0 ligne pour toutes les tables en anonyme). Aucune action requise. Noté pour lever toute ambiguïté : « 200 en anonyme » n'est pas une fuite tant que la RLS renvoie 0 ligne.

### F4 — Least privilege bien respecté sur le produit principal — **Info (point positif)**

`roadmaps` (insert-only), `step_actions` (append-only), `steps` (pas de delete) exposent strictement les opérations utilisées par le code — aucune policy « au cas où ». Aucun usage de clé secrète côté serveur : tous les accès BDD passent par le token utilisateur, la RLS n'est jamais contournée. L'isolation par propriétaire est confirmée live sur les 6 tables owner-scopées (sondes 3, 4, 5, 6).

## Dérive vs état v1

- `supabase_v1_schema.sql` (racine) : identique en substance à `schema_full.sql` pour les 5 tables du produit principal (mêmes policies owner-scopées). Pas de dérive.
- `supabase_auth_setup.sql` (racine) : introduit la table `transmissions` et **la policy défaillante F1** — reprise à l'identique dans la migration `20260709090000_transmissions.sql` puis dans `schema_full.sql`. Le défaut est donc historique (v1) et consolidé, pas une régression récente.

## Conclusion

**La RLS du produit principal Seren est solide.** L'isolation par propriétaire est correctement posée sur les 6 tables du parcours questionnaire → roadmap → courriers → sessions, appliquée à travers `auth.uid()`, jamais contournée par une clé de service, et **vérifiée live** : aucune fuite inter-utilisateur, écriture usurpée rejetée (403), update/delete étrangers no-op, anonyme fail-closed.

**Un seul défaut réel : F1 (transmissions).** La policy de partage par code d'accès ne vérifie pas le code et ouvre la lecture de toute la table à tout utilisateur authentifié. L'exposition est certaine par analyse statique ; elle n'a pas été reproductible live uniquement parce que la table est vide en dev. Le produit transmission étant gelé et la table quasi inutilisée, le risque opérationnel immédiat est faible, mais le correctif (RPC `SECURITY DEFINER` + endpoint serveur) doit être planifié — **proposition uniquement**, décision produit requise.

**F2 (pas de suppression) est une question RGPD à trancher**, correctement rattrapée à ce stade par la cascade `ON DELETE` à la suppression du compte Auth ; il manque surtout un flux applicatif « supprimer mon compte ».

**Aucune migration n'est ajoutée par cet audit** : le seul correctif « dur » (F1) touche un produit gelé (proposition only), et F2 relève d'une décision produit. Les deux sont documentés avec le SQL prêt à l'emploi.
