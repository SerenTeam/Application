# Runbook — Environnement de staging (Supabase + Render)

> Chantier 0, lot D. Objectif : un projet Supabase et un service Render de staging,
> séparés de la prod — indispensable avant de manipuler paiements (chantier 1) et
> envois réels (chantier 2). Durée totale : ~30 min, majoritairement des clics.

## 1. Projet Supabase de staging (user step, ~10 min)

1. https://supabase.com/dashboard → New project : nom `seren-staging`, région `eu-west`
   (même région que la prod), mot de passe BDD généré → **le noter** (gestionnaire de
   mots de passe).
2. Noter le `project-ref` (dans l'URL du dashboard : `https://supabase.com/dashboard/project/<ref>`).
3. Authentication → Sign In / Providers → activer **Email** (mot de passe). Pour les
   tests E2E : désactiver « Confirm email ».
4. Authentication → URL Configuration : Site URL = l'URL Render staging (étape 3),
   à compléter après sa création.

## 2. Schéma : un seul push (CLI)

```bash
supabase link --project-ref <ref-staging>    # demande le mot de passe BDD noté en 1.
supabase db push                             # déroule TOUT : baseline v1 + migrations v2
supabase migration list                      # → 6 migrations applied Local + Remote
```

Si `create extension pg_cron` échoue : Dashboard → Database → Extensions → activer
pg_cron → relancer `supabase db push`.

⚠️ `link` ne retient qu'un projet à la fois : relancer `supabase link --project-ref
oltwzvfjazwjvghpzhia` pour revenir au projet principal ensuite.

## 3. Service Render de staging (user step, ~10 min)

1. Dashboard Render → New → Web Service → même repo GitHub, branche `main` (ou une
   branche `staging` dédiée si souhaité plus tard).
2. Build : `npm ci && npm run build` · Start : `npm start` (mêmes valeurs que la prod).
3. Variables d'environnement (Settings → Environment) :
   - `SUPABASE_URL` / `VITE_SUPABASE_URL` = `https://<ref-staging>.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` = clé publishable du
     projet staging (Dashboard Supabase → Settings → API Keys)
   - `MISTRAL_API_KEY` = la même clé qu'en prod (ou une clé dédiée si créée)
   - `MISTRAL_MODEL` = `mistral-small-latest`
   - `CORS_ORIGIN` = l'URL du service staging (ex. `https://seren-staging.onrender.com`)
   - `SENTRY_DSN` / `VITE_SENTRY_DSN` : facultatif (projet Sentry séparé recommandé si activé)
   - Resend (`RESEND_*`, `WEBHOOK_RPC_SECRET`) : NE PAS configurer en staging pour
     l'instant (la feature reste inerte → 503 propre) — sauf test dédié du canal email.
4. Reporter l'URL du service dans Supabase → Authentication → URL Configuration (étape 1.4).

## 4. Vérification

- `https://<staging>.onrender.com/api/health` → `{"status":"ok"}`
- Créer un compte jetable sur le staging → dérouler le questionnaire → roadmap OK.
- Le compte test E2E (`test.e2e.claude@seren-test.fr`) peut être recréé sur le projet
  staging si besoin (il n'existe que sur le projet principal).

## Rappels

- Les `VITE_*` sont figées au build → tout changement d'env front = redéploiement.
- La prod reste sur le projet Supabase `oltwzvfjazwjvghpzhia` — ne jamais pousser de
  migration de test dessus : staging d'abord, prod ensuite (`supabase link` + `db push`).
