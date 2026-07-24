# Runbook — Migrations Supabase via CLI (`supabase db push`)

> Clôture du §1 de `docs/plan-points-attention.md`. Rédigé le 2026-07-16.
> État : CLI installée (`brew install supabase/tap/supabase`, v2.109.1), `supabase init` fait (`supabase/config.toml` versionné). Reste l'authentification et le lien par projet — **étapes utilisateur** (~5 min, une seule fois).

## Pourquoi

Jusqu'ici chaque migration devait être collée à la main dans le SQL Editor de CHAQUE projet (dev, préprod, prod) — c'est ce qui a fait échouer le déploiement i18n quand la colonne `lang` manquait sur un projet. Avec la CLI : `supabase db push` applique tout ce qui manque, dans l'ordre, par projet.

## Mise en place (une fois, par Arnaud)

```bash
# 1. S'authentifier (ouvre le navigateur)
supabase login

# 2. Lier le projet de DEV (celui du .env local)
supabase link --project-ref oltwzvfjazwjvghpzhia
# (demande le mot de passe BDD du projet — Dashboard → Settings → Database)
```

## ⚠️ Baseline (fait le 2026-07-24 sur le projet principal)

Les migrations posées à la main avant la CLI sont marquées `applied` une fois pour
toutes (`supabase migration repair`). Depuis le chantier 0, la baseline v1
(`20260701000000_baseline_v1.sql`) versionne aussi les 5 tables historiques :
**un projet NEUF se monte par `supabase link` + `supabase db push`, sans SQL Editor.**

État de référence du projet principal (`oltwzvfjazwjvghpzhia`) : les 6 migrations
applied Local + Remote (`supabase migration list` pour contrôler).

## Pour un nouveau projet (ex. staging)

```bash
supabase link --project-ref <ref-du-projet>
supabase db push          # déroule tout : baseline v1 + migrations v2
```

Si `create extension pg_cron` échoue : Dashboard → Database → Extensions → activer
pg_cron, puis relancer. Voir `docs/runbook-staging.md` pour le parcours complet.

Astuce multi-projets : `supabase link` ne retient qu'un projet à la fois — relancer
`link` pour basculer.

## Au quotidien (nouveau workflow)

1. Écrire la migration dans `supabase/migrations/<timestamp>_nom.sql` (comme aujourd'hui).
2. `supabase db push` sur dev → tester → `link` préprod → `db push` → idem prod **avant** de déployer le code qui en dépend.
3. Plus jamais de SQL Editor pour les migrations (il reste utile pour les requêtes ad hoc).

## Notes

- `supabase/config.toml` est versionné ; `supabase/.temp/` (créé par `link`) est ignoré par git (déjà couvert par le .gitignore de la CLI).
- La clé `sb_publishable_…` du `.env` ne suffit pas pour les migrations — c'est normal et voulu : la CLI utilise ton authentification personnelle + le mot de passe BDD.
