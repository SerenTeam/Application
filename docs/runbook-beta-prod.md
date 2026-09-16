# Runbook — Promotion en production de la bêta pilote (créneau U4)

> Créneau **U4 : jeudi 18/09, 16h30-18h30**. Repli : **vendredi 19/09, 9h-11h**.
> Contrat : `docs/design-v2-demonstrateur.md` (§10.3 GNG6, §11 environnements et réglages Auth, §9.2 RGPD).
> Exécutant : **Arnaud**. Les agents relisent les sorties collées et donnent un verdict GO/STOP ; ils
> n'écrivent jamais en production.
> Chaque étape porte : **Durée**, **Qui**, **Commandes**, **✅ Attendu**, **🛑 STOP si**, **↩️ Retour arrière**.
> L'ordre des étapes 3 → 5 → 7 → 8 est **imposé par la sécurité** et n'est pas négociable (§11.3 du contrat).

---

## §0. Conditions GNG6 et prérequis hors créneaux

### Les 14 conditions de GNG6 (jeudi 16h30)

| # | Condition | Preuve attendue |
|---|---|---|
| 1 | GNG5 vert et gel dur sans incident | verdict de la répétition (mer. 21h15) |
| 2 | F1, hook et gate prouvés en préprod **et**, en prod, preuve datée que l'ordre §11.3 a été tenu : `db push` → backfill → hook ON → `signUp` non invité refusé (403 `signup_requires_invitation`) → **seulement ensuite** « Confirm email » décoché | sortie du `curl` de l'étape 7, collée dans la session |
| 3 | Inventaire des migrations prod connu et dry-run conforme | sortie de `supabase migration list` + dry-run (étape 3) |
| 4 | Textes bêta relus juridiquement (CGU, confidentialité, données sensibles, art. 14) | **P7** — accord écrit du conseil |
| 5 | Domaine `RESEND_FROM` vérifié, SMTP custom Auth prod configuré | **P9** — capture Resend + écran SMTP |
| 6 | Procédure d'effacement testée en local, contact support publié | rejeu local de `scripts/erase-family.sql` + **P10** |
| 7 | Backfill prod rejoué en local sur un jeu simulé | sortie du rejeu (contre-épreuve L9) |
| **Pour ouvrir les dossiers famille** (`PARTNER_ACTIVATIONS_ENABLED=true`) | | |
| 8 | Lettre d'engagement PF art. 28 **signée** | **P8** — exemplaire signé |
| **Pour ouvrir le papier live** (`PAPER_SENDS_ENABLED=true`, dernier geste) | | |
| 9 | Compte MySendingBox **live** + moyen de paiement | **P2** |
| 10 | **DPA art. 28** MySendingBox signé | **P3** |
| 11 | Grille tarifaire écrite | **P4** |
| 12 | 2-3 plis de contrôle envoyés depuis le compte MySendingBox **LIVE**, visibles en statut « accepté » ou « imprimé » dans le dashboard MSB | **P1** — capture du dashboard |
| 13 | Relecture juridique des corps de courriers (5 modèles papier) | **P6** |
| 14 | Fenêtre d'annulation MySendingBox réglée | **P5** — capture des réglages |

**Règle de décision :**

- **(1) à (7) rouge** → la bêta ne s'ouvre pas jeudi : report au **vendredi 19/09, 9h-11h**.
- **(8) rouge** → on s'arrête après l'**étape 8** : les gérants PF ont leur accès, aucun dossier famille n'est créé.
- **(9) à (14) rouge** → **pas d'étape 10** : la bêta ouvre **sans papier**, les courriers restent téléchargeables en PDF.

### Prérequis hors créneaux (P1-P12)

| # | Prérequis | Responsable | Échéance | Bloque |
|---|---|---|---|---|
| **P1** | **2-3 plis de contrôle envoyés depuis le compte MySendingBox LIVE** (dashboard MSB ou appel API manuel, vers l'adresse d'Arnaud et celle d'un proche) — option (a) retenue | Arnaud | **mer. 16/09 9h** | GNG6 (12), papier live |
| P2 | Compte MySendingBox live + moyen de paiement | Arnaud | mer. 9h (préalable à P1) | GNG6 (9) |
| P3 | DPA art. 28 MySendingBox signé | Arnaud | mer. 18h | GNG6 (10) |
| P4 | Grille tarifaire écrite (coût par pli, refacturation) | Arnaud | mer. 18h | GNG6 (11) |
| P5 | Fenêtre d'annulation MSB allongée | Arnaud | jeu. 16h30 (étape 10) | GNG6 (14) |
| P6 | Relecture juridique des corps de courriers (5 modèles) | Arnaud / conseil | **jeu. 12h** | GNG6 (13), papier live |
| P7 | Textes juridiques bêta relus (CGU, confidentialité, données sensibles, art. 14) | Arnaud / conseil | **jeu. 12h** | GNG6 (4), bêta entière |
| P8 | Lettre d'engagement PF art. 28 signée | Arnaud + PF | jeu. 16h | GNG6 (8), dossiers famille |
| P9 | Domaine `RESEND_FROM` vérifié + SMTP custom Auth | Arnaud | mer., dans U1 | GNG6 (5), invitations |
| P10 | Boîte de support relevée + `SUPPORT_EMAIL` | Arnaud | jeu. 12h | GNG6 (6), 402 et art. 14 |
| P11 | Réglage « Secure email change » lu en préprod et en prod | Arnaud | U1 puis U4 | risque résiduel §9.3-1 |
| **P12** | **Aucun commit sur `main` jusqu'à U4** | Arnaud | permanent jusqu'à jeu. 18h30 | **étape 6** (le fast-forward en dépend) |

**Option (b) de repli.** Si **P1, P3, P4 ou P6** manque jeudi, le papier live n'ouvre **pas** : la bêta ouvre sans papier (flag absent), et `PAPER_SENDS_ENABLED=true` est posé **vendredi 19/09** ou **lundi 22/09**, après réception des plis de contrôle — en 1 minute et **sans redéploiement**.

---

## §1. Étape 0 — État initial

**Durée** 5 min · **Qui** Arnaud

**Commandes / gestes :**

1. Render → service **prod** → Events : noter le **deploy ID actuel** (c'est la cible du rollback).
2. Supabase prod → Database → **Backups** : vérifier la date de la dernière sauvegarde.
3. Relire l'inventaire des migrations prod consigné en U1 (étape B de `docs/checklist-push.md`) et en déduire **N** (prod à 6/6 → **N = 12**).
4. **Lecture de `webhook_config`, ici et pas plus tard** — SQL Editor prod :

```sql
select id from webhook_config;
```

✅ **Attendu** : deploy ID noté, sauvegarde datée de moins de 24 h, N connu, et la présence ou l'absence d'une ligne `webhook_config` notée.
- **Une ligne existe** (user step de l'envoi de courriers v1) : sa valeur de `rpc_secret` est **celle à reporter** dans `WEBHOOK_RPC_SECRET` à l'étape 2, et **rien ne sera inséré** à l'étape 4.
- **Table vide** : la valeur sera générée à l'étape 2 et insérée à l'étape 4.

🛑 **STOP si** : aucune sauvegarde récente, ou inventaire des migrations inconnu (le dry-run de l'étape 3 ne pourrait pas être vérifié).
🛑 **Ne jamais écraser une ligne `webhook_config` existante** : Render et la base divergeraient, et les RPC de webhook deviendraient des no-ops silencieux (statuts d'envoi figés).

↩️ **Retour arrière** : sans objet (lecture seule).

---

## §2. Étape 1 — Réglages Supabase Auth en production

**Durée** 10 min · **Qui** Arnaud · **Gestes dans le Dashboard prod**

| Réglage | Valeur |
|---|---|
| Sign In / Providers → Email → **Confirm email** | **LAISSÉ COCHÉ à ce stade** — il ne sera décoché qu'à l'étape 7, après la preuve du hook |
| **Allow new users to sign up** | activé (c'est le hook qui filtre) |
| Anonymous sign-ins, Phone, OAuth | désactivés |
| URL Configuration → Site URL | `https://app.seren-app.fr` |
| Redirect URLs | `https://app.seren-app.fr/**` |
| Emails → SMTP Settings | custom Resend : `smtp.resend.com`, port 465, user `resend`, expéditeur du domaine vérifié |
| Rate Limits → e-mails / heure | 30 |
| Emails → Templates → « Reset password » | traduit en français |
| Mot de passe minimum | 8 (aligné sur les règles affichées à l'activation) |
| Hooks → Before User Created | **NON activé à ce stade** (étape 7) |
| Sign In / Providers → Email → « Secure email change » | **lire le réglage** et le noter (P11) |

✅ **Attendu** : les 9 réglages enregistrés, « Confirm email » **toujours coché**, hook **non** activé.

🛑 **STOP si** : le SMTP custom refuse la clé Resend (les invitations et les réinitialisations de mot de passe ne partiraient pas → GNG6 (5) rouge).

> ⚠️ **Pourquoi « Confirm email » reste coché ici.** Décocher la confirmation **avant** d'activer le hook ouvrirait, le temps de la manœuvre, l'inscription libre **sans preuve de boîte mail** : ces comptes pourraient occuper des adresses enrôlées ou invitées, et écrire dans leurs propres tables. L'ordre imposé est : migrations → backfill → hook ON → preuve du refus → **seulement alors** décocher.

↩️ **Retour arrière** : noter les réglages précédents avant de les modifier ; ils se remettent en 2 minutes.

---

## §3. Étape 2 — Variables Render en production (« Save » sans déployer)

**Durée** 10 min · **Qui** Arnaud · **Render → service prod → Environment**

**À poser :**

| Variable | Valeur |
|---|---|
| `SUPABASE_URL`, `VITE_SUPABASE_URL` | `https://oltwzvfjazwjvghpzhia.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` | clé publishable **prod** |
| `APP_URL`, `CORS_ORIGIN` | `https://app.seren-app.fr` |
| `WEBHOOK_RPC_SECRET` | **valeur lue à l'étape 0** si `webhook_config` prod a déjà une ligne ; sinon valeur neuve `openssl rand -hex 32` — jamais celle de la préprod, jamais collée dans le chat |
| `RESEND_API_KEY`, `RESEND_FROM` | clé + expéditeur du domaine vérifié |
| `SUPPORT_EMAIL` | adresse de support publiée |
| `MSB_WEBHOOK_URL_SECRET` | `openssl rand -hex 32` — **valeur distincte de la préprod** |

> ⚠️ `WEBHOOK_RPC_SECRET` est **obligatoire** depuis la revue du 16/09 : sans elle, la création et le renvoi de dossiers répondent **500** sans rien exposer.

**À laisser ABSENTES** : `PAPER_SENDS_ENABLED`, `MYSENDINGBOX_API_KEY`, `PARTNER_ACTIVATIONS_ENABLED`, `SHOW_ACTIVATION_LINK`, `PARTNER_BILLING_PREVIEW`, `FEATURE_LLM`, `EMAIL_SENDS_ENABLED`, `EXTRA_SENDS_ENABLED`, `STRIPE_PRICE_ID_EXTRA_SEND`.

**À RETIRER** : `PAYMENTS_ENABLED`, `STRIPE_PRICE_ID`, `FORFAIT_INCLUDED_SENDS` (forfait famille abandonné).

✅ **Attendu** : « Save changes » enregistré, **aucun déploiement lancé** à ce stade.

🛑 **STOP si** : une variable `VITE_*` pointe encore vers la préprod (`kvtzhyxlqouvpwasedbe`) — le bundle servirait la mauvaise base.

↩️ **Retour arrière** : Render conserve l'historique des variables ; les remettre puis redéployer.

---

## §4. Étape 3 — Migrations en production

**Durée** 20 min · **Qui** Arnaud (les agents relisent les sorties)

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git fetch origin --tags
git worktree add --detach ../push-prod demo-2026-09-18
cd ../push-prod
supabase link --project-ref oltwzvfjazwjvghpzhia
cat supabase/.temp/project-ref
supabase migration list
supabase db push --dry-run
```

✅ **Attendu** : `project-ref` = `oltwzvfjazwjvghpzhia` ; dry-run = **exactement N fichiers**, soit pour une prod à 6/6 : `20260725120000_purchases.sql`, `20260913200000_pf_dashboard_demo.sql`, `20260914100000_sender_profiles_organisations.sql`, `20260914110000_organisations_seed.sql`, `20260914120000_letter_sends_papier.sql`, `20260914150000_purchases_kind_writer.sql`, `20260914160000_attachments.sql`, `20260914170000_resync_reader.sql`, `20260915200000_v2_core.sql`, `20260915201000_v2_partner_rpc.sql`, `20260915202000_v2_admin.sql`, `20260915210000_transmissions_f1.sql`.

🛑 **STOP si** : toute autre liste, ou un project-ref différent.

```bash
supabase db push
supabase migration list
```

✅ **Attendu** : `Finished supabase db push.` puis **N/N**.

**Plans B :**
- **42501 « must be owner of table objects »** — recopier la procédure en 4 étapes de `docs/checklist-push.md` §D : (1) créer à la main les 3 policies dans Storage → Policies ; (2) exécuter la partie **non-Storage** de `20260914160000_attachments.sql` dans le SQL Editor ; (3) `supabase migration repair --status applied 20260914160000` (exception explicite et unique à la règle « jamais de repair seul », sortie collée dans la session) ; (4) `supabase db push`. ⚠️ Relancer `db push` tel quel **ne suffit pas** : le fichier commence par des `drop policy … on storage.objects`, qui exigent eux aussi d'être propriétaire.
- **H6** — dans le SQL Editor : `alter function public.hook_before_user_created(jsonb) owner to postgres;` puis `grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;`

> ⏱️ `20260914120000` retire la policy d'écriture de `letter_sends` : l'ancien code de production ne peut plus enregistrer un envoi e-mail. **Enchaîner les étapes 4 à 6 dans les 20 minutes.**

↩️ **Retour arrière** : les migrations sont additives et restent en place ; le code de production est inchangé tant que l'étape 6 n'est pas faite.

---

## §5. Étape 4 — `webhook_config` en production

**Durée** 3 min · **Qui** Arnaud · **SQL Editor prod**

- **Si une ligne existait déjà** (étape 0) : **ne rien écrire**, seulement vérifier l'accord avec Render :

```sql
select (rpc_secret = '<valeur posée dans Render>') as accord from webhook_config where id = 1;
```

- **Sinon** :

```sql
insert into webhook_config (id, rpc_secret) values (1, '<valeur de WEBHOOK_RPC_SECRET prod>');
```

✅ **Attendu** : exactement **1 ligne** `id = 1`, et `accord` = `true`.

🛑 **STOP si** : `accord` = `false` → corriger **Render** (jamais la base) puis redéployer. Ne jamais coller le secret dans le chat.

↩️ **Retour arrière** : si la ligne vient d'être insérée par erreur avec une mauvaise valeur, la corriger par `update webhook_config set rpc_secret = '<valeur Render>' where id = 1;`

---

## §6. Étape 5 — Backfill des comptes réels

**Durée** 10 min · **Qui** Arnaud · **SQL Editor prod**, fichier `scripts/backfill-prod-beta.sql`

**Invocation exacte, dans cet ordre :**

1. **SECTION 0 (lecture)** — sélectionner le bloc entre `-- >>> SECTION 0` et `-- <<< FIN SECTION 0`, puis Run. Relever `comptes_total`, `comptes_test`, `internes`, `avec_dossier` et les 3 compteurs de résidus.
2. **SECTION 1 en aperçu (DRY-RUN, mode par défaut)** — sélectionner le bloc `-- >>> SECTION 1` … `-- <<< FIN SECTION 1`, puis Run **sans rien modifier**. Le bloc se termine **volontairement par une erreur** qui porte les compteurs :

```
ERROR: DRY-RUN (rien n'est écrit) — candidats : N, conflits d'adresse ignorés : C, dossiers qui seraient créés : N-C
```

3. **Comparer** le nombre de candidats au comptage des comptes réels fait en U1 (étape B de `docs/checklist-push.md`). 🛑 **STOP si l'écart est inexpliqué.**

> ⚠️ **Avant de basculer `v_dry_run` à `false`**, lister dans `v_excluded` (en minuscules) les adresses
> des **gérants PF** et des **admins Seren** qui seront enrôlés à l'**étape 8**. En production, ces
> enrôlements n'existent pas encore au moment du backfill : l'exclusion « comptes internes » du script
> interroge `account_enrollments`, qui est encore **vide**, et ne peut donc pas les voir. Sans cette
> liste, une adresse de gérant ou d'admin qui est déjà un compte réel confirmé reçoit ici un dossier
> `direct` actif — et `link_enrollments` refusera alors **toute** la liaison de l'étape 8, pour tout le
> monde (garde `enrollment_conflict_family`, globale et évaluée avant toute écriture), pas seulement
> pour l'adresse en cause.

4. **SECTION 1 en écriture** — dans le bloc collé, remplacer **une seule ligne** :

```sql
  v_dry_run      boolean := true;             -- ← false pour écrire, après lecture du DRY-RUN
```

par `v_dry_run boolean := false;` puis Run. (Si des adresses doivent être exclues, les ajouter dans `v_excluded`, en minuscules, avant de lancer.)

✅ `NOTICE: BACKFILL ÉCRIT — dossiers créés : N-C, ponts : 0, conflits ignorés : C`

5. **SECTION 2 (contrôle)** — bloc `-- >>> SECTION 2` … `-- <<< FIN SECTION 2`.

✅ **Attendu** : `dossiers_direct_actifs` = N-C, `reconsentement_attendu` = N-C (chaque famille re-consentira sur `/bienvenue`), **`ponts_direct` = 0** (aucun envoi offert, conformément à D6).

🛑 **STOP si** : `ponts_direct` > 0, ou un compte de test / interne a reçu un dossier (le script les exclut ; un écart signalerait un défaut).

> Le rejeu est sûr : un second passage écrit `dossiers créés : 0`.
> **Offrir 10 envois aux comptes backfillés** reste une décision d'Arnaud : c'est le drapeau `v_with_bridge`, à ne passer à `true` que sur décision écrite (aucun changement de code).

↩️ **Retour arrière** (avant toute connexion d'une famille) :

```sql
delete from public.dossiers where source = 'direct' and created_at >= '<horodatage relevé juste avant l''écriture>';
```

---

## §7. Étape 6 — Code de production

**Durée** 15 min · **Qui** Arnaud

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git fetch origin
git merge-base --is-ancestor origin/main 'demo-2026-09-18^{commit}' && echo "fast-forward possible"
git push origin 'demo-2026-09-18^{commit}:refs/heads/main'
git push origin demo-2026-09-18
```

> ⚠️ **Forme pelée obligatoire.** `demo-2026-09-18` est un tag **annoté** : `git push origin demo-2026-09-18:main` serait refusé par le serveur (`trying to write non-commit object`) — une heure après la démo, en plein créneau. Le tag lui-même est poussé séparément (3ᵉ ligne).

Puis Render déploie (Manual Deploy → « **Clear build cache & deploy** » si une variable `VITE_*` a changé). Noter le **deploy ID**. Vérifications :

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.seren-app.fr/api/health
JS=$(curl -s https://app.seren-app.fr/ | grep -o '/assets/index-[^"]*\.js' | head -1) && \
  curl -s "https://app.seren-app.fr$JS" | grep -o -E 'kvtzhyxlqouvpwasedbe|oltwzvfjazwjvghpzhia' | sort | uniq -c
```

✅ **Attendu** : `fast-forward possible`, puis `… demo-2026-09-18 -> main` ; `/api/health` → `200` ; le bundle ne contient que `oltwzvfjazwjvghpzhia`.

🛑 **STOP si** : `rejected (non-fast-forward)` ou contrôle `merge-base` en échec — **ne jamais forcer**.

**Remède si quelqu'un a commité sur `main` malgré le gel (P12)** : dans le worktree d'intégration, `git fetch origin && git merge --no-ff origin/main -m "merge(v2): main dans l'intégration avant promotion"` (conflits : version d'intégration, sauf fichier appartenant à `main`), gate complet (`npx tsc --noEmit && npx vitest run && npm run build`), `git tag -a demo-2026-09-18-prod -m "Promotion prod 2026-09-18"`, puis, **après accord explicite d'Arnaud**, `git push origin 'demo-2026-09-18-prod^{commit}:refs/heads/main'` et `git push origin demo-2026-09-18-prod`. La préprod reste sur le commit de démo : ne pas y rejouer ce merge avant jeudi soir.

↩️ **Retour arrière** : Render → « Rollback » vers le deploy ID de l'étape 0 (les migrations additives restent ; prévenir le support que l'envoi e-mail v1 est indisponible).

---

## §8. Étape 7 — Hook « Before User Created », preuve, puis « Confirm email »

**Durée** 5 min · **Qui** Arnaud

**7a.** Authentication → Hooks → **Before User Created** → Postgres → `public.hook_before_user_created` → **activer**.

**7b. Preuve du refus** (terminal d'Arnaud, la clé publishable exportée dans son shell) :

```bash
curl -s -X POST 'https://oltwzvfjazwjvghpzhia.supabase.co/auth/v1/signup' \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY_PROD" -H 'Content-Type: application/json' \
  -d '{"email":"refus-hook-2026-09-18@seren-app.fr","password":"Refus-hook-2026!"}'
```

✅ **Attendu** : HTTP **403** et `signup_requires_invitation`. **Sortie collée dans la session** — c'est la preuve exigée par GNG6 (2).

🛑 **STOP si** : HTTP 200 (le compte a été créé) → Delete user immédiat, désactiver le hook, diagnostiquer. Ne pas poursuivre.

**7c. Seulement après 7b** : Sign In / Providers → Email → **décocher « Confirm email »**.

✅ **Attendu** : les trois gestes faits **dans cet ordre**, horodatés dans la session.

🛑 **Tant que 7c n'est pas fait**, l'activation d'une famille exige une confirmation par e-mail : **ne pas inviter de famille réelle entre 7a et 7c**.

↩️ **Retour arrière** : Hooks → toggle off (1 clic). L'inscription redevient libre, mais le gate serveur maintient les 403. **Dans ce cas, recocher « Confirm email » dans la foulée** : sans hook *et* sans confirmation, l'inscription est totalement libre.

---

## §9. Étape 8 — Gérants des PF pilotes et admins Seren

**Durée** 15 min · **Qui** Arnaud

**1. Un bloc par pompe funèbre** (SQL Editor prod) :

```sql
do $$
declare
  v_name    constant text := 'RAISON SOCIALE À RENSEIGNER';
  v_siret   constant text := null;                                   -- 14 chiffres ou null
  v_billing constant text := null;                                   -- e-mail de facturation ou null
  v_manager constant text := lower(btrim('gerant@a-renseigner.invalid'));
  v_pid uuid;
begin
  if v_name = 'RAISON SOCIALE À RENSEIGNER' or v_manager like '%.invalid' then
    raise exception 'renseigner la raison sociale et l''e-mail du gérant';
  end if;
  insert into public.partners (name, siret, billing_email, status, contract_signed_at)
  values (v_name, v_siret, v_billing, 'active', current_date)
  returning id into v_pid;
  insert into public.account_enrollments (email, role, partner_id) values (v_manager, 'partner_manager', v_pid);
  raise notice 'partenaire % créé, gérant enrôlé', v_pid;
end $$;
```

**2. Admins Seren** : `insert into public.account_enrollments (email, role) values (lower(btrim('<adresse de l''admin>')), 'seren_admin');`

**3. Comptes** : Authentication → Users → **« Add user » (auto-confirm)** pour chaque gérant et chaque admin, puis **copier les UUID**. 🛑 « already registered » = **STOP**, enquête : l'adresse enrôlée est déjà détenue par quelqu'un.

**4. Liaison** (SQL Editor) — **avant toute connexion à ces comptes** :

```sql
select public.link_enrollments('[{"email":"<gérant>","user_id":"<UUID>"},
                                {"email":"<admin>","user_id":"<UUID>"}]'::jsonb);
```

✅ **Attendu** : `pending: 0` **et `untrusted: 0`**.
🛑 **STOP si** `untrusted > 0` : une adresse enrôlée est déjà détenue par un compte non apparié — enquête (`created_at`, `last_sign_in_at`, `email_change`) avant toute ouverture. Aucun rôle n'a été donné.
🛑 **Erreur `enrollment_conflict_family`** : une adresse enrôlée porte un **dossier famille** — le cas le plus probable en U4 est un dossier `direct` créé par le **backfill de l'étape 5** (voir l'avertissement du §6). Cette garde est **globale** : tant qu'elle est vraie, **aucune** liaison ne passe, ni pour les gérants ni pour les admins. Remède, au choix : clore ce dossier avec la **PARTIE B** de `scripts/erase-family.sql`, ou enrôler une autre adresse pour cette personne (`delete from public.account_enrollments where email = '<adresse>';` puis rejouer le bloc 1). **Aucun rôle n'a été donné** : la garde s'évalue avant toute écriture.

**5. Mot de passe du gérant réel** : **et seulement après la liaison**, Authentication → Users → « **Send password recovery** » pour chaque gérant, qui fixe lui-même son mot de passe. (Cette procédure est réservée aux vrais gérants de PF : les comptes de démo et de probes de la préprod ont reçu le leur à la création.)

**6. Contrôle** : connexion d'un gérant sur `https://app.seren-app.fr/login` → arrivée sur `/partenaire`, formulaire affichant « création momentanément fermée » (le flag de l'étape 9 est encore absent).

✅ **Attendu** : chaque gérant voit son espace, aucun dossier, aucune création possible.

↩️ **Retour arrière** : `delete from public.account_enrollments where email = '<adresse>';` et Delete user du compte concerné (aucun dossier n'existe encore).

---

## §10. Étape 9 — Ouverture des dossiers famille

**Durée** 10 min · **Qui** Arnaud · **Condition : GNG6 (8) — lettre d'engagement PF signée**

1. Render → poser `PARTNER_ACTIVATIONS_ENABLED=true` (le service redémarre, pas de rebuild).
2. **Dossier de contrôle de bout en bout**, avec une vraie boîte d'Arnaud (**adresse dédiée, jamais réutilisée** : l'unicité de l'e-mail famille est globale) : création par un gérant → e-mail reçu (vérifier les mentions de l'article 14) → activation → `/bienvenue` → questionnaire → roadmap → PDF.
3. Effacer ensuite le compte de contrôle par la procédure du §13.

✅ **Attendu** : l'e-mail arrive, l'activation aboutit, `/api/me` renvoie un dossier actif et un quota de 10 envois.

🛑 **STOP si** : l'e-mail d'invitation ne part pas (`email_sent:false`) → vérifier `RESEND_API_KEY`, `RESEND_FROM` et le domaine vérifié avant d'ouvrir aux vraies familles.

↩️ **Retour arrière** : retirer `PARTNER_ACTIVATIONS_ENABLED` (1 minute). Les dossiers déjà activés restent actifs — aucune action PF ne coupe jamais une famille.

---

## §11. Étape 10 — Papier LIVE, dernier geste

**Durée** 15 min · **Qui** Arnaud · **Conditions : GNG6 (9) à (14)**

1. MySendingBox → réglages du compte : **fenêtre d'annulation allongée** au-delà des 15 minutes par défaut.
2. MySendingBox → Webhooks : déclarer `https://app.seren-app.fr/api/letters/provider-webhook/<MSB_WEBHOOK_URL_SECRET prod>`.
3. Render → `MYSENDINGBOX_API_KEY` = clé **LIVE**, puis `PAPER_SENDS_ENABLED=true`.
4. Contrôle : depuis le compte de contrôle, un envoi vers une adresse maîtrisée → pli visible dans le dashboard MySendingBox, annulable (`DELETE /letters/{id}`) avant la date d'envoi.

✅ **Attendu** : le pli apparaît côté fournisseur, le statut remonte dans l'application, le quota passe de 10 à 9.

🛑 **STOP si** : le pli n'apparaît pas côté fournisseur, ou si le statut ne remonte pas → retirer `PAPER_SENDS_ENABLED` et analyser (le PDF reste téléchargeable pour les familles).

↩️ **Retour arrière** : retirer `PAPER_SENDS_ENABLED` — 1 minute, **sans redéploiement** : canal papier et dépôt de pièces jointes fermés, PDF toujours disponible.

---

## §12. Surveillance J+1 à J+7

**Durée** 10 min par jour · **Qui** Arnaud

Chaque matin :

1. Dashboard MySendingBox : les plis de la veille (contrôle **a posteriori**, il n'y a pas de file de validation).
2. Sentry, projets `seren-server` et `seren-app` : nouvelles issues.
3. Boîte de support.
4. SQL Editor prod :

```sql
select count(*) from letter_sends where channel = 'papier' and created_at > now() - interval '24 hours';
```

✅ **Attendu** : un volume cohérent avec le nombre de familles activées.

🛑 **Seuil d'alerte** : plus de **20 plis par jour**, ou **un seul pli manifestement erroné** → retirer `PAPER_SENDS_ENABLED` et analyser.

---

## §13. Effacement sur demande (RGPD art. 17)

**Durée** 20 min par demande · **Qui** Arnaud · Fichier `scripts/erase-family.sql` · **Délai annoncé : 30 jours**

**Invocation exacte, dans cet ordre** (remplacer `famille@exemple.fr` par l'adresse de la demande — **une occurrence par partie**, repérée par `←`) :

1. **PARTIE A — inventaire** (lecture seule) : bloc `-- >>> PARTIE A` … `-- <<< FIN PARTIE A`. Relever notamment la dernière ligne : le nombre d'**objets Storage** sous `<user_id>/`.
2. **Dashboard → Storage → bucket `documents`** : supprimer le dossier `<user_id>/`. Le SQL ne peut pas le faire (trigger `protect_objects_delete`).
3. **PARTIE B — anonymisation et clôture** : bloc `-- >>> PARTIE B` … `-- <<< FIN PARTIE B`.
   ✅ `NOTICE: PARTIE B OK — 1 dossier(s) anonymisé(s) ; compte auth : <uuid> → Dashboard Auth → Delete user`
   🛑 `STOP : N objet(s) Storage sous <uuid>/` → revenir à l'étape 2.
   🛑 `REFUS : compte interne (PF ou admin Seren)` → ce n'est pas une famille : ne pas insister.
   🛑 `REFUS : remplacer l'adresse d'exemple` → l'adresse `famille@exemple.fr` est restée dans le bloc :
      la remplacer par celle de la demande. Cette garde est ce qui empêche d'anonymiser un dossier au hasard.
4. **Dashboard → Authentication → Users → Delete user.** La cascade supprime questionnaires, roadmaps, étapes, actions, documents, sessions, transmissions, envois (et leurs événements fournisseur), débits, achats, pièces jointes, profil d'expéditeur et consentements.
5. **PARTIE C — vérification** : bloc `-- >>> PARTIE C` … `-- <<< FIN PARTIE C`. ✅ **Attendu : `0`, `0`, `≥ 1`.**
6. Répondre à la personne sous 30 jours et **tenir la trace hors base** (date de réception, date d'exécution).

> ⚠️ **`Delete user` est bloqué par le Dashboard tant que le compte porte un dossier actif** (contrainte `dossiers_state_check`) : c'est voulu, et c'est pourquoi la partie B précède la suppression. Vaut aussi pour tout compte de test ou de contrôle créé à l'étape 9.
> La ligne `dossiers` **reste**, anonymisée : pompe funèbre, source, statut, dates et montants — sans aucune donnée d'identification. C'est la trace de facturation. La date de décès d'un dossier de PF y est remplacée par la sentinelle `1900-01-01` (une contrainte interdit la valeur nulle) : le dire dans la réponse faite à la personne.

---

## §14. Récapitulatif des retours arrière

| Étape | Geste de retour arrière | Durée | Effet |
|---|---|---|---|
| 1 — Auth | remettre les réglages notés | 2 min | inscription et e-mails comme avant |
| 2 — Render | restaurer les variables précédentes + redéployer | 5 min | code prod inchangé |
| 3 — Migrations | *aucun* : migrations additives, laissées en place | — | l'ancien code continue de tourner, sauf l'envoi e-mail v1 |
| 4 — `webhook_config` | `update webhook_config set rpc_secret = '<valeur Render>' where id = 1;` | 1 min | RPC de webhook réaccordées |
| 5 — Backfill | `delete from public.dossiers where source = 'direct' and created_at >= '<horodatage>';` | 2 min | valable **avant** toute connexion d'une famille |
| 6 — Code | Render → « Rollback » vers le deploy ID de l'étape 0 | 3 min | prod revenue au code précédent |
| 7 — Hook | Hooks → toggle off **+ recocher « Confirm email »** | 1 min | inscription filtrée par la confirmation d'e-mail |
| 8 — Gérants | supprimer l'enrôlement + Delete user | 3 min | aucun accès partenaire |
| 9 — Dossiers famille | retirer `PARTNER_ACTIVATIONS_ENABLED` | 1 min | plus aucune création ; les familles activées gardent leur accès |
| 10 — Papier live | retirer `PAPER_SENDS_ENABLED` | 1 min | canal papier et dépôt de pièces fermés, PDF disponible |
