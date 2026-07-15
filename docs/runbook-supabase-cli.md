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

## ⚠️ Baseline obligatoire avant le premier push

Les migrations existantes ont été appliquées à la main : la CLI ne le sait pas et tenterait de les rejouer (échec garanti sur les `create policy`, qui n'ont pas de `if not exists`). Marquer une fois pour toutes les migrations déjà appliquées :

```bash
# Sur le projet de DEV (tout est appliqué sauf pg_cron si pas encore fait) :
supabase migration repair --status applied 20260708120000
supabase migration repair --status applied 20260709090000
supabase migration repair --status applied 20260713120000
# puis appliquer ce qui manque réellement :
supabase db push        # appliquera 20260711100000 (pg_cron) s'il ne l'est pas
```

Vérification : `supabase migration list` — tout doit être `applied` des deux côtés (Local / Remote).

## Pour préprod et prod

Répéter `link` + `repair` avec le `--project-ref` de chaque projet (visible dans l'URL du Dashboard). La baseline diffère : préprod/prod ont `sessions_lang` appliquée à la main, et `purge_sessions_cron`/`transmissions` selon l'historique — vérifier avec `supabase migration list` avant de `repair`, puis `db push`.

Astuce multi-projets : `supabase link` ne retient qu'un projet à la fois. Pour basculer : relancer `link` avec l'autre ref (ou utiliser `--project-ref` directement sur les commandes qui le supportent).

## Au quotidien (nouveau workflow)

1. Écrire la migration dans `supabase/migrations/<timestamp>_nom.sql` (comme aujourd'hui).
2. `supabase db push` sur dev → tester → `link` préprod → `db push` → idem prod **avant** de déployer le code qui en dépend.
3. Plus jamais de SQL Editor pour les migrations (il reste utile pour les requêtes ad hoc).

## Notes

- `supabase/config.toml` est versionné ; `supabase/.temp/` (créé par `link`) est ignoré par git (déjà couvert par le .gitignore de la CLI).
- La clé `sb_publishable_…` du `.env` ne suffit pas pour les migrations — c'est normal et voulu : la CLI utilise ton authentification personnelle + le mot de passe BDD.
