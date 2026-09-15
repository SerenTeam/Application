# Runbook — Migrations Supabase via CLI (`supabase db push`)

> Clôture du §1 de `docs/plan-points-attention.md`. Rédigé le 2026-07-16.
> État : CLI installée (`brew install supabase/tap/supabase`, v2.109.1), `supabase init` fait (`supabase/config.toml` versionné). Authentification + lien faits le 2026-07-24 (un clone ou un worktree frais doit refaire `link` : l'état vit dans `supabase/.temp/`, gitignored).
> **Corrigé le 2026-09-15 (lot L0 du plan v2-démonstrateur)** : la version précédente appelait `oltwzvfjazwjvghpzhia` le projet « de DEV ». C'est **faux** : c'est la **PROD**. Lire § Projets et garde-fous avant toute commande.

## Projets et garde-fous (à lire avant toute commande)

| Projet Supabase | project-ref | Branche git | Service Render |
|---|---|---|---|
| **PROD** (utilisateurs réels) | `oltwzvfjazwjvghpzhia` | `main` | `https://app.seren-app.fr` |
| **Préprod** (`Seren_app_preprod`) | `kvtzhyxlqouvpwasedbe` | `pre-prod` | `https://preprod-app.seren-app.fr` (Basic Auth) |
| Dev | *aucun projet distant* | branches de travail | Supabase **local** (`supabase start`, `--local`) |

Source : `CLAUDE.md` § Architecture branches/environnements (actée le 2026-09-13).

Règles, sans exception :

1. **Jamais de `supabase db push` depuis le checkout principal** (`/Users/arnaudgay/Documents/git/Seren/Application`). Il est sur `main`, qui ne contient pas les migrations du chantier 2a ni du dashboard PF, et son `supabase/.temp/project-ref` est lié à la préprod (`kvtzhyxlqouvpwasedbe`) : un push depuis là confronterait la base à la liste de migrations d'une autre branche que celle déployée. Si la base distante est en avance, la CLI suggère `supabase migration repair` : lancé depuis la mauvaise branche, il corromprait l'historique des migrations. Ne jamais l'exécuter sans la session.
2. **Toute écriture distante part d'un worktree dédié, détaché sur le commit exact à déployer**, et lié à un seul projet :
   ```bash
   cd /Users/arnaudgay/Documents/git/Seren/Application
   git worktree add --detach ../push-preprod <tag-ou-sha>   # préprod
   git worktree add --detach ../push-prod <tag-ou-sha>      # prod (créé le jour de la promotion seulement)
   cd ../push-preprod && supabase link --project-ref kvtzhyxlqouvpwasedbe
   ```
3. **Avant chaque `db push`**, dans le worktree, et dans cet ordre :
   - `cat supabase/.temp/project-ref` → doit afficher le project-ref attendu, sinon STOP ;
   - `supabase migration list` → Local/Remote cohérents (aucune version Remote absente de Local), sinon STOP ;
   - `supabase db push --dry-run` → la liste des fichiers doit être **exactement** celle écrite d'avance dans la checklist du créneau (`docs/checklist-push.md`), sinon STOP.
4. **Jamais « oui » à une proposition de pousser la configuration locale** (`config.toml`) vers un projet distant.
5. **Sessions Claude / agents** : jamais `supabase link`, `--linked`, `db push`, `migration repair` ni SQL distant. Uniquement le Supabase local (`supabase start`, `supabase db reset --local`, `--local`). Les écritures distantes sont des USER STEPS d'Arnaud.
6. **`.env` locaux** : ne jamais pointer un `.env` de développement sur la prod. Contrôle : `npm run check:env` (variables du shell) ou `node --env-file=.env scripts/check-env-target.mjs` (fichier) — refus en code 1 si `SUPABASE_URL` ou `VITE_SUPABASE_URL` contient `oltwzvfjazwjvghpzhia`.

## Pourquoi

Jusqu'ici chaque migration devait être collée à la main dans le SQL Editor de CHAQUE projet — c'est ce qui a fait échouer le déploiement i18n quand la colonne `lang` manquait sur un projet. Avec la CLI : `supabase db push` applique tout ce qui manque, dans l'ordre, par projet.

## Mise en place (une fois par machine, par Arnaud)

```bash
# S'authentifier (ouvre le navigateur)
supabase login
```

Le `link` ne se fait **pas** ici : il se fait dans le worktree dédié du créneau (règle 2), et demande le mot de passe BDD du projet visé (Dashboard → Project Settings → Database).

## ⚠️ Baseline (faite le 2026-07-24)

Les migrations posées à la main avant la CLI sont marquées `applied` une fois pour
toutes (`supabase migration repair`). Depuis le chantier 0, la baseline v1
(`20260701000000_baseline_v1.sql`) versionne aussi les 5 tables historiques :
**un projet NEUF se monte par `supabase link` + `supabase db push`, sans SQL Editor.**

Historique des états de référence :
- `oltwzvfjazwjvghpzhia` (**PROD**, alors appelé « projet principal ») : baseline + 6 migrations applied le 2026-07-24. Son état actuel est à relire en lecture seule avant toute promotion (`select version from supabase_migrations.schema_migrations order by 1;`) — inventaire prévu au créneau U1.
- `kvtzhyxlqouvpwasedbe` (**préprod**) : aligné 6/6 le 2026-07-25 par reset + migrations.

## Pour un nouveau projet (ex. staging)

```bash
# depuis un worktree dédié, jamais le checkout principal
supabase link --project-ref <ref-du-projet>
cat supabase/.temp/project-ref   # contrôle
supabase db push --dry-run
supabase db push          # déroule tout : baseline v1 + migrations suivantes
```

Si `create extension pg_cron` échoue : Dashboard → Database → Extensions → activer
pg_cron, puis relancer. Voir `docs/runbook-staging.md` pour le parcours complet.

Astuce multi-projets : `supabase link` ne retient qu'un projet **par répertoire** (`supabase/.temp/`) — d'où un worktree par projet cible plutôt qu'un `link` qui bascule.

## Au quotidien

1. Écrire la migration dans `supabase/migrations/<timestamp>_nom.sql`.
2. La valider en **local** : `supabase start` puis `supabase db reset --local` (rejoue toutes les migrations) + scénarios SQL.
3. **Préprod** : créneau d'Arnaud, worktree `../push-preprod` détaché sur le commit validé, contrôles de la règle 3, `db push`, puis push de la branche `pre-prod` dans le même créneau (code et schéma déployés ensemble).
4. **Prod** : même geste depuis `../push-prod` (lié à `oltwzvfjazwjvghpzhia`), uniquement lors d'une promotion planifiée, **avant** de déployer le code qui en dépend.
5. Plus jamais de SQL Editor pour les migrations (il reste utile pour les requêtes ad hoc en lecture, et pour les plans B documentés dans une checklist).

## Notes

- `supabase/config.toml` est versionné ; `supabase/.temp/` (créé par `link`) est ignoré par git (`supabase/.gitignore`).
- La clé `sb_publishable_…` du `.env` ne suffit pas pour les migrations — c'est normal et voulu : la CLI utilise ton authentification personnelle + le mot de passe BDD.
- Checklist pas à pas du déploiement 2a en préprod : `docs/checklist-push.md`.
