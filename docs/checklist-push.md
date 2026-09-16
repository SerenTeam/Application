# Checklist U1 — Déploiement du chantier 2a en préprod (~1 h 30)

> Créneau 1 d'Arnaud du plan v2-démonstrateur. Objectif : la préprod tourne le code `preprod-2a-base`
> (2a envoi papier + dashboard PF v0 + socle L0) sur une base à 14/14 migrations, **avant** le créneau U2
> qui pousse les migrations v2. À dérouler dès que tu es disponible — **au plus tard mercredi 16/09 à 11h**,
> sinon U2 devra pousser 2a + v2 ensemble (12 fichiers au lieu de 4, liste recalculée par la session).
> Aucune action sur la prod hormis une **lecture** (étape B).
>
> Règles : chaque étape a une **sortie attendue** et une condition **STOP** (on s'arrête et on colle la sortie
> dans la session). Ne jamais coller de clé, de mot de passe ni de contenu de `.env` dans le chat.
> `preprod-2a-base` est un tag local posé sur `integration/v2-demo` (commit `4510a61`, gate vert : tsc, 484 tests, build).
>
> *Révision du 16/09 00h20 : plan B Storage corrigé (l'ancien ne pouvait pas aboutir), attente de la CI rendue
> bloquante, 2 contrôles `attributions` ajoutés, `SUPPORT_EMAIL` et `FORFAIT_INCLUDED_SENDS` ajoutés au tableau.*

---

## A. Supabase Auth — PRÉPROD (`kvtzhyxlqouvpwasedbe`) · ~10 min

Dashboard Supabase → projet **Seren_app_preprod** :

1. **Authentication → Sign In / Providers → Email** : décocher **Confirm email**. Laisser **Allow new users to sign up** activé.
2. **Authentication → URL Configuration** :
   - Site URL = `https://preprod-app.seren-app.fr`
   - Redirect URLs : ajouter `https://preprod-app.seren-app.fr/**` et `http://localhost:5173/**`
3. **Authentication → Emails → SMTP Settings** : activer le SMTP custom
   - Host `smtp.resend.com` · Port `465` · User `resend` · Password = clé API Resend · Sender = adresse du domaine vérifié (ex. `noreply@seren-app.fr`)
   - puis **Authentication → Rate Limits** : e-mails/heure → `30`
4. **Authentication → Hooks** : **constater** que « Before User Created » est proposé. **Ne pas l'activer** (la fonction n'existe pas encore — U2).

✅ Attendu : 4 réglages enregistrés, écran Hooks présent. 🛑 STOP si l'écran Hooks n'existe pas → le dire à la session (bascule du plan).

---

## B. PROD (`oltwzvfjazwjvghpzhia`) — LECTURE SEULE · ~5 min

Dashboard Supabase → projet **prod** → SQL Editor. Coller **uniquement** ces requêtes (aucune écriture) :

```sql
select version from supabase_migrations.schema_migrations order by 1;
```

```sql
select count(*) filter (where email ilike '%@seren-test.fr') as comptes_test,
       count(*) filter (where email not ilike '%@seren-test.fr') as comptes_reels,
       count(*) as total
from auth.users;
```

```sql
select id from webhook_config;
```

Render → service **préprod** → Settings : noter le **type d'instance** (Free = spin-down → warm-up jeudi).

✅ Attendu : liste des versions + 3 compteurs + présence ou non d'une ligne `webhook_config`, **collés dans la session**.
(La ligne `webhook_config` en prod décide si le secret sera réutilisé ou généré lors de la promotion de jeudi.)

---

## C. Git — pousser la base de déploiement et lancer la CI · ~5 min (+ ~5 min d'attente CI)

Depuis le dépôt principal (pas besoin de changer de branche : on pousse des refs) :

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git fetch origin
git rev-parse preprod-2a-base
```

✅ Attendu : un SHA (le tag existe). 🛑 STOP si `unknown revision`.

```bash
git push origin preprod-2a-base
```

```bash
git push origin preprod-2a-base:refs/heads/integration/v2-demo
```

```bash
gh run list --branch integration/v2-demo --limit 1
```

✅ Attendu : le run CI (tsc + vitest + build) passe à `completed success` en ~5 min.
**Attendre ce vert avant de passer à D** : les migrations sont irréversibles, et une CI rouge doit pouvoir annuler le déploiement avant qu'on touche à la base. 🛑 STOP si la CI échoue → coller le lien du run.

---

## D. Migrations PRÉPROD depuis un worktree dédié · ~15 min

⚠️ Jamais depuis le checkout principal (branche `main`, sans les migrations 2a/PF).

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git worktree add --detach ../push-preprod preprod-2a-base
cd ../push-preprod
supabase link --project-ref kvtzhyxlqouvpwasedbe
```

(Demande le mot de passe BDD préprod : Dashboard → Project Settings → Database.)

```bash
cat supabase/.temp/project-ref
```

✅ Attendu : `kvtzhyxlqouvpwasedbe`. 🛑 STOP sinon.

```bash
supabase migration list
```

✅ Attendu : 14 lignes Local ; Remote renseigné **au moins** pour `20260701000000` → `20260716120000` (6 migrations) ; **aucune** version Remote absente de Local. 🛑 STOP sinon (ne JAMAIS lancer `migration repair` de sa propre initiative) → coller la sortie.

```bash
supabase db push --dry-run
```

✅ Attendu : **exactement** les migrations Local sans Remote, parmi ces 8 (dans l'ordre) :

```
20260725120000_purchases.sql
20260913200000_pf_dashboard_demo.sql
20260914100000_sender_profiles_organisations.sql
20260914110000_organisations_seed.sql
20260914120000_letter_sends_papier.sql
20260914150000_purchases_kind_writer.sql
20260914160000_attachments.sql
20260914170000_resync_reader.sql
```

🛑 STOP si un fichier hors de cette liste apparaît → coller la sortie.

```bash
supabase db push
```

✅ Attendu : `Finished supabase db push.`

🟠 **Plan B si erreur 42501 « must be owner of table objects »** (policies Storage de `20260914160000_attachments.sql`).
Relancer `db push` tel quel ne suffit pas : le fichier commence par des `drop policy … on storage.objects`, qui exigent eux aussi d'être propriétaire — l'erreur se reproduirait. Procédure :

1. Dashboard préprod → **Storage → bucket `documents` → Policies** : créer à la main les 3 policies décrites dans la section `storage.objects` de `supabase/migrations/20260914160000_attachments.sql` (lecture, insertion, suppression, toutes limitées au préfixe `user_id/`).
2. SQL Editor préprod : exécuter **la partie non-Storage** du même fichier (tout ce qui précède la section `storage.objects` : table `attachments`, index, RLS, policies de la table).
3. Dans `../push-preprod` : `supabase migration repair --status applied 20260914160000`
   *(exception explicite et unique à la règle « jamais de repair seul » — coller la sortie dans la session).*
4. `supabase db push` → seule `20260914170000` doit rester à appliquer.

```bash
supabase migration list
```

✅ Attendu : 14/14 Local = Remote.

> ⏱️ La migration `20260914120000` retire la policy FOR ALL de `letter_sends` : l'ancien code préprod ne peut plus écrire d'envoi e-mail. **Enchaîner E puis F dans le quart d'heure.**

---

## E. Secret RPC + contrôles de données PRÉPROD · ~5 min

Générer la valeur (terminal, ne pas la coller dans le chat) :

```bash
openssl rand -hex 32
```

Dashboard préprod → SQL Editor :

```sql
select id from webhook_config;
```

Si **aucune ligne** :

```sql
insert into webhook_config (id, rpc_secret) values (1, '<valeur openssl>');
```

Si une ligne existe : réutiliser **sa** valeur pour `WEBHOOK_RPC_SECRET` à l'étape F (ne pas la réécrire).

Puis deux contrôles qui conditionnent le push v2 de mercredi (la migration v2 copie `attributions` vers `dossiers`, avec une contrainte de format sur l'e-mail) :

```sql
select count(*) as nb_attributions from public.attributions;
```

```sql
select count(*) as emails_invalides
from public.attributions a
join auth.users u on u.id = a.user_id
where lower(btrim(u.email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
   or char_length(u.email) > 254;
```

```sql
select u.email from public.attributions a join auth.users u on u.id = a.user_id;
```

✅ Attendu : 1 ligne `webhook_config` ; `emails_invalides` = **0** ; la liste d'e-mails ne contient que des comptes de démo — **à coller dans la session**. 🛑 STOP si `emails_invalides` > 0 (la migration v2 échouerait mercredi).

---

## F. Render PRÉPROD — variables puis déploiement · ~15 min

Render → service **préprod** → Environment. Tout poser **en un seul lot**, bouton **Save changes** (pas de deploy manuel ici).

| Variable | Valeur | Note |
|---|---|---|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | `https://kvtzhyxlqouvpwasedbe.supabase.co` | **vérifier** (jamais `oltwz…`) |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | clé publishable **préprod** | vérifier |
| `WEBHOOK_RPC_SECRET` | valeur de l'étape E | identique à la base |
| `MYSENDINGBOX_API_KEY` | clé **TEST** MySendingBox | si pas encore de compte : laisser absente et **ne pas** poser `PAPER_SENDS_ENABLED` |
| `MSB_WEBHOOK_URL_SECRET` | `openssl rand -hex 32` | sert à l'étape H |
| `PAPER_SENDS_ENABLED` | `true` | **préprod + clé TEST uniquement** |
| `PARTNER_ACTIVATIONS_ENABLED` | `true` | inerte tant que le code v2 n'est pas déployé |
| `SHOW_ACTIVATION_LINK` | `true` | préprod seulement (secours démo) |
| `PARTNER_BILLING_PREVIEW` | `true` | préprod seulement |
| `SUPPORT_EMAIL` | adresse de support affichée aux familles | ex. `support@seren-app.fr` |
| `APP_URL` | `https://preprod-app.seren-app.fr` | |
| `CORS_ORIGIN` | `https://preprod-app.seren-app.fr` | |
| `RESEND_API_KEY` / `RESEND_FROM` | clé Resend + expéditeur du domaine vérifié | invitations v2 |
| `SITE_PASSWORD` (+ utilisateur Basic Auth existant) | inchangé | |

**À laisser absentes / retirer** : `FEATURE_LLM`, `EMAIL_SENDS_ENABLED`, `EXTRA_SENDS_ENABLED`, `PAYMENTS_ENABLED`, `STRIPE_PRICE_ID`, `FORFAIT_INCLUDED_SENDS` (forfait famille abandonné en v2).

Puis, **CI verte (C)** et **étape D terminée** :

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git push origin preprod-2a-base:pre-prod
```

✅ Attendu : fast-forward `bda6952..<sha>`. 🛑 STOP si `rejected (non-fast-forward)` → ne jamais forcer, coller la sortie.

Render lance le déploiement automatiquement. **Si une variable `VITE_*` a changé** : Manual Deploy → **Clear build cache & deploy**. Noter le **deploy ID** du déploiement réussi (sert au rollback).

---

## G. Vérifications · ~5 min

```bash
curl -s https://preprod-app.seren-app.fr/api/health
```

✅ Attendu : HTTP 200 (`/api/*` n'est pas derrière la Basic Auth).

Bundle branché sur la bonne base (identifiants Basic Auth tapés dans le terminal, jamais dans le chat) :

```bash
read -r -p "Basic Auth user: " BA_USER; read -r -s -p "Basic Auth password: " BA_PASS; echo
JS=$(curl -s -u "$BA_USER:$BA_PASS" https://preprod-app.seren-app.fr/ | grep -o '/assets/index-[^"]*\.js' | head -1)
curl -s -u "$BA_USER:$BA_PASS" "https://preprod-app.seren-app.fr$JS" | grep -o -E 'kvtzhyxlqouvpwasedbe|oltwzvfjazwjvghpzhia' | sort | uniq -c
```

✅ Attendu : seulement `kvtzhyxlqouvpwasedbe`. 🛑 STOP si `oltwzvfjazwjvghpzhia` apparaît → corriger `VITE_SUPABASE_URL` + Clear build cache & deploy.

---

## H. MySendingBox (compte TEST) · ~3 min

Dashboard MySendingBox → Webhooks : déclarer

```
https://preprod-app.seren-app.fr/api/letters/provider-webhook/<MSB_WEBHOOK_URL_SECRET>
```

(route montée sur `/api/letters/provider-webhook`, secret en dernier segment d'URL ; `/api` hors Basic Auth.)

Si la clé TEST n'est pas encore disponible : sauter H, la session relancera l'étape plus tard.

---

## I. Postes locaux · ~3 min

1. Renommer le `.env` du dépôt principal (il vise la PROD) :
   ```bash
   mv /Users/arnaudgay/Documents/git/Seren/Application/.env /Users/arnaudgay/Documents/git/Seren/Application/.env.prod-NE-PAS-UTILISER
   ```
2. Si besoin d'un `.env` local : le recréer avec les **4 variables Supabase de la préprod**, puis contrôler :
   ```bash
   cd /Users/arnaudgay/Documents/git/Seren/Application && node --env-file=.env scripts/check-env-target.mjs
   ```
   (script disponible sur `integration/v2-demo` ; depuis `main`, contrôler à l'œil : aucune URL `oltwz…`.)

---

## GNG1 — go/no-go (fin de créneau)

| Critère | OK ? |
|---|---|
| CI verte sur `integration/v2-demo` **avant** le `db push` | ☐ |
| `supabase migration list` préprod : 14/14 | ☐ |
| `webhook_config` id=1 = `WEBHOOK_RPC_SECRET` Render | ☐ |
| `attributions` : 0 e-mail invalide, liste collée | ☐ |
| `/api/health` 200 | ☐ |
| Bundle préprod → `kvtzhyxlqouvpwasedbe` uniquement | ☐ |
| Écran Auth → Hooks constaté | ☐ |
| Inventaire prod (étape B, dont `webhook_config`) collé | ☐ |
| Deploy ID préprod noté | ☐ |

**NO-GO** (un critère rouge non corrigeable dans le créneau) : ne pas insister — `pre-prod` reste sur son ancien commit si F n'a pas eu lieu ; sinon Render → Rollback vers le déploiement précédent. Le créneau U2 poussera alors 2a + v2 ensemble (12 fichiers, liste recalculée par la session).
