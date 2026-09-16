# Checklist U1+U2 fusionnée — déploiement complet en préprod (~1 h 45)

> **Remplace `docs/checklist-push.md`** (qui découpait en deux créneaux). Tout le code v2 est intégré et
> vérifié sur `integration/v2-demo`, tag **`preprod-v2-rc1`** : on déploie donc 2a **et** v2 en une seule passe,
> soit **12 migrations** au lieu de 8 + 4.
>
> Écrit le 16/09 à 11h05, après le constat qu'U1 n'avait pas été déroulé. Aucune action sur la prod hormis
> une **lecture** (étape B). Chaque étape a une sortie attendue et une condition 🛑 STOP : on s'arrête et on
> colle la sortie dans la session. Ne jamais coller de clé, de mot de passe ni de `.env` dans le chat.
>
> **État vérifié du code** : tsc OK · 779 tests / 44 fichiers · build OK · 18 migrations rejouées depuis zéro ·
> 253 assertions SQL · 9 invariants de sécurité sur 9 tenus.

---

## A. Supabase Auth — PRÉPROD (`kvtzhyxlqouvpwasedbe`) · ~10 min

1. **Authentication → Sign In / Providers → Email** : décocher **Confirm email**. Laisser **Allow new users to sign up** activé (le hook fera le tri, étape I).
2. **Authentication → URL Configuration** : Site URL `https://preprod-app.seren-app.fr` ; Redirect URLs `https://preprod-app.seren-app.fr/**` et `http://localhost:5173/**`.
3. **Authentication → Emails → SMTP Settings** : SMTP custom Resend — host `smtp.resend.com`, port `465`, user `resend`, password = clé API Resend, sender sur le domaine vérifié. Puis **Rate Limits** : e-mails/heure → `30`.
4. **Authentication → Hooks** : vérifier que « Before User Created » est proposé. **Ne pas l'activer maintenant** (la fonction arrive avec les migrations, étape D) — activation à l'étape I.

🛑 STOP si l'écran Hooks n'existe pas → me le dire (le plan bascule sur la fermeture par gate seul).

---

## B. PROD (`oltwzvfjazwjvghpzhia`) — LECTURE SEULE · ~5 min

SQL Editor du projet **prod**, uniquement ces lectures (elles préparent la promotion de jeudi) :

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

✅ Les trois résultats **collés dans la session**.

---

## C. Git — pousser et lancer la CI · ~5 min + ~5 min d'attente

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git fetch origin
git rev-parse preprod-v2-rc1
```

✅ Un SHA. 🛑 STOP si `unknown revision`.

```bash
git push origin preprod-v2-rc1
git push origin 'preprod-v2-rc1^{commit}:refs/heads/integration/v2-demo'
gh run list --branch integration/v2-demo --limit 1
```

> ⚠️ `preprod-v2-rc1` est un tag **annoté** : la forme `^{commit}` est obligatoire pour écrire sur une branche,
> sinon le serveur refuse (« trying to write non-commit object »).

✅ La CI (tsc + vitest + build) passe à `completed success` en ~5 min. **Attendre ce vert avant D** : les migrations sont irréversibles. 🛑 STOP si rouge → coller le lien du run.

---

## D. Migrations PRÉPROD — 12 fichiers · ~20 min

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git worktree add --detach ../push-preprod preprod-v2-rc1
cd ../push-preprod
supabase link --project-ref kvtzhyxlqouvpwasedbe
cat supabase/.temp/project-ref
```

✅ `kvtzhyxlqouvpwasedbe`. 🛑 STOP sinon.

```bash
supabase migration list
supabase db push --dry-run
```

✅ Attendu : **exactement 12 fichiers**, dans l'ordre —

```
20260725120000_purchases.sql
20260913200000_pf_dashboard_demo.sql
20260914100000_sender_profiles_organisations.sql
20260914110000_organisations_seed.sql
20260914120000_letter_sends_papier.sql
20260914150000_purchases_kind_writer.sql
20260914160000_attachments.sql
20260914170000_resync_reader.sql
20260915200000_v2_core.sql
20260915201000_v2_partner_rpc.sql
20260915202000_v2_admin.sql
20260915210000_transmissions_f1.sql
```

🛑 STOP si la liste diffère → coller la sortie.

```bash
supabase db push
supabase migration list
```

✅ 18/18 Local = Remote.

🟠 **Plan B si erreur 42501 « must be owner of table objects »** (policies Storage de `20260914160000`) — relancer ne suffit pas, le fichier commence par des `drop policy … on storage.objects` :
1. Dashboard → Storage → bucket `documents` → Policies : créer à la main les 3 policies de la section `storage.objects` du fichier.
2. SQL Editor : exécuter la partie **non-Storage** du même fichier.
3. `supabase migration repair --status applied 20260914160000` (exception documentée, coller la sortie).
4. `supabase db push` → les 4 migrations v2 restent à appliquer.

---

## E. Secret RPC + contrôles de données · ~5 min

```bash
openssl rand -hex 32
```

SQL Editor préprod :

```sql
select id from webhook_config;
```

Aucune ligne → `insert into webhook_config (id, rpc_secret) values (1, '<valeur openssl>');`
Une ligne → réutiliser **sa** valeur à l'étape F, ne pas la réécrire.

> ⚠️ Sans accord exact entre `webhook_config.rpc_secret` et `WEBHOOK_RPC_SECRET`, **l'ouverture de dossier par la PF échoue** (`invalid_secret`) : c'est la garde qui empêche une PF de choisir le jeton d'invitation.

Contrôle de la reprise des `attributions` (la migration v2 les copie vers `dossiers`, avec contrainte de format) :

```sql
select count(*) as emails_invalides
from public.attributions a
join auth.users u on u.id = a.user_id
where lower(btrim(u.email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
   or char_length(u.email) > 254;
```

✅ `0`. 🛑 STOP sinon (la migration échouerait).

---

## F. Render PRÉPROD — variables puis déploiement · ~20 min

Environment → tout poser en un lot → **Save changes**.

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | `https://kvtzhyxlqouvpwasedbe.supabase.co` (**jamais** `oltwz…`) |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | clés publishable **préprod** |
| `WEBHOOK_RPC_SECRET` | valeur de l'étape E — **obligatoire** |
| `MYSENDINGBOX_API_KEY` | clé **TEST** (sinon laisser absente et ne pas poser `PAPER_SENDS_ENABLED`) |
| `MSB_WEBHOOK_URL_SECRET` | `openssl rand -hex 32` |
| `PAPER_SENDS_ENABLED` | `true` (préprod + clé TEST uniquement) |
| `PARTNER_ACTIVATIONS_ENABLED` | `true` |
| `SHOW_ACTIVATION_LINK` | `true` (préprod seulement : filet si l'e-mail ne part pas) |
| `PARTNER_BILLING_PREVIEW` | `true` |
| `SUPPORT_EMAIL` | adresse de support affichée aux familles |
| `APP_URL` / `CORS_ORIGIN` | `https://preprod-app.seren-app.fr` |
| `RESEND_API_KEY` / `RESEND_FROM` | clé + expéditeur du domaine vérifié |
| `SITE_PASSWORD` | inchangé |

**Absentes / à retirer** : `FEATURE_LLM`, `EMAIL_SENDS_ENABLED`, `EXTRA_SENDS_ENABLED`, `PAYMENTS_ENABLED`, `STRIPE_PRICE_ID`, `FORFAIT_INCLUDED_SENDS`.

Puis, CI verte et D terminé :

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git push origin 'preprod-v2-rc1^{commit}:refs/heads/pre-prod'
```

✅ Fast-forward depuis `bda6952`. 🛑 STOP si `non-fast-forward` — ne jamais forcer.

Si une variable `VITE_*` a changé : Manual Deploy → **Clear build cache & deploy**. Noter le **deploy ID**.

---

## G. Vérifications · ~5 min

```bash
curl -s https://preprod-app.seren-app.fr/api/health
```

✅ 200.

```bash
read -r -p "Basic Auth user: " BA_USER; read -r -s -p "Basic Auth password: " BA_PASS; echo
JS=$(curl -s -u "$BA_USER:$BA_PASS" https://preprod-app.seren-app.fr/ | grep -o '/assets/index-[^"]*\.js' | head -1)
curl -s -u "$BA_USER:$BA_PASS" "https://preprod-app.seren-app.fr$JS" | grep -o -E 'kvtzhyxlqouvpwasedbe|oltwzvfjazwjvghpzhia' | sort | uniq -c
```

✅ Seulement `kvtzhyxlqouvpwasedbe`.

---

## H. MySendingBox (compte TEST) · ~3 min

Webhooks → déclarer :

```
https://preprod-app.seren-app.fr/api/letters/provider-webhook/<MSB_WEBHOOK_URL_SECRET>
```

Sauter si la clé TEST n'est pas encore disponible.

---

## I. Comptes de démo et fermeture de l'inscription · ~25 min

**Dans cet ordre strict** — la partie 2 doit précéder toute connexion, sinon les comptes deviennent non liables.

1. **SQL Editor préprod** : exécuter la **PARTIE 1** de `scripts/seed-demo-v2.sql` (partenaires PF-X et PF-Y, enrôlements des gérants et de l'admin, plafonds d'envoi relevés).
2. **Authentication → Users → Add user** (auto-confirm coché) pour chaque compte interne : gérant PF-X, gérant PF-Y, admin Seren. **Poser le mot de passe à la création** (`openssl rand -base64 18`, gardé dans ton gestionnaire). 🛑 STOP si « already registered » → me le dire, ne pas lier.
3. Copier les **UUID** de ces comptes dans la **PARTIE 2** du seed, puis l'exécuter (`link_enrollments` avec les paires e-mail ↔ UUID).
   ✅ Attendu : `partner_users_linked: 2, seren_admins_linked: 1, untrusted: 0`. 🛑 STOP si `untrusted > 0` (un compte s'est connecté avant, ou l'UUID est faux).
4. **Authentication → Hooks → Before User Created** → activer sur `public.hook_before_user_created`.
5. **Preuve immédiate** : tenter une inscription depuis `/signup` avec une adresse quelconque → doit être **refusée**. 🛑 STOP si elle passe (l'inscription libre serait ouverte en bêta).
6. Se connecter comme gérant PF-X sur `/partenaire`, **ouvrir un dossier famille** de démo, récupérer le lien d'activation affiché (`SHOW_ACTIVATION_LINK=true`), l'ouvrir dans un **second profil de navigateur**, définir le mot de passe, accepter les consentements, dérouler quelques questions.
7. Vérifier que la PF voit le dossier passer **actif**, sans aucun contenu.

---

## GNG — go/no-go de fin de créneau

| Critère | OK ? |
|---|---|
| CI verte sur `integration/v2-demo` **avant** le db push | ☐ |
| `migration list` préprod : 18/18 | ☐ |
| `webhook_config` = `WEBHOOK_RPC_SECRET` Render | ☐ |
| `attributions` : 0 e-mail invalide | ☐ |
| `/api/health` 200 et bundle sur `kvtzhy…` | ☐ |
| Seed parties 1 et 2, `untrusted: 0` | ☐ |
| Hook actif et **inscription libre refusée, prouvée** | ☐ |
| Un dossier ouvert par la PF, activé par la famille, sans contenu visible côté PF | ☐ |
| Deploy ID noté (rollback Render en 2 clics) | ☐ |

**NO-GO** : Render → Rollback vers le déploiement précédent. Les migrations, elles, restent (elles sont additives) — me le dire, je recale la suite.
