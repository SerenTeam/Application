# Checklist rc5 — préprod puis prod (2026-09-29)

**Remplace `docs/checklist-u1u2.md`**, écrit pour rc2 et jamais déroulé jusqu'au bout. Tag à déployer : **`preprod-v2-rc5`**. Il contient :
- le démonstrateur v2 (modèle PF) ;
- l'envoi papier (2a) ;
- la personnalisation v2 (rc4) ;
- les correctifs du 28-29/09 :
  - focus du questionnaire ;
  - mobile ;
  - roadmap idempotente ;
  - courriers (destinataires, compte joint, bailleur, nom d'enveloppe, élision, « 1er ») ;
  - contraste ;
  - Sentry (questionnaire, courriers, webhook, transmission) ;
  - tests stabilisés.

**État vérifié du code** : tsc OK · **1 230 tests / 66 fichiers**, 3 passages verts · build OK · 20 migrations.
- `origin/pre-prod` (`0df42f9`) et `origin/main` (`63c420e`) sont des ancêtres de rc5 : les deux pushs se font en avance rapide.
- Rien n'est encore poussé.

**Règles** :
- **Migrations toujours AVANT le code** (préprod comme prod).
- Jamais de `supabase db push` depuis le checkout principal : on passe par un worktree détaché sur le tag.
- Jamais de secret, de mot de passe ni de `.env` collé dans le chat.
- `preprod-v2-rc5` est un tag **annoté** : pour écrire une branche, utiliser la forme `^{commit}`.
- Chaque étape a un ✅ attendu et un 🛑 STOP : en cas de STOP, on colle la sortie dans la session.

**Les 14 migrations à appliquer sur une base restée à 6/6** (l'ordre compte) :
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
20260928120000_sender_profiles_names.sql
20260928121000_v2_dossier_identity.sql
```

---

# PARTIE 1 — PRÉPROD (~1 h 30)

## P0. Pousser et attendre la CI · ~10 min

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git fetch origin
git rev-parse preprod-v2-rc5
git push origin preprod-v2-rc4 preprod-v2-rc5
git push origin 'preprod-v2-rc5^{commit}:refs/heads/integration/v2-demo'
```

- ✅ Le push de `integration/v2-demo` se fait en avance rapide depuis rc2 (`03725d9`).
- ✅ Dans GitHub → Actions, la CI de `integration/v2-demo` finit en **success**. **Attendre ce vert avant P2** : les migrations sont irréversibles.
- 🛑 STOP si la CI est rouge : coller le lien du run.

## P1. Supabase Auth préprod (`kvtzhyxlqouvpwasedbe`) · ~10 min

Vérifier ou poser, comme dans `docs/checklist-u1u2.md` §A (déjà fait en partie le 17/09) :
- **Confirm email** : décoché en préprod.
- **URL Configuration** :
  - Site URL : `https://preprod-app.seren-app.fr` ;
  - Redirect URLs : `https://preprod-app.seren-app.fr/**`.
- **SMTP custom Resend** : facultatif en préprod ; l'invitation passe par l'API Resend du serveur.
- **Hooks** : « Before User Created » doit être proposé, mais **pas encore activé** (on l'active en P6).

## P2. Migrations préprod · ~15 min

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git worktree add --detach ../push-preprod-rc5 preprod-v2-rc5
cd ../push-preprod-rc5
supabase link --project-ref kvtzhyxlqouvpwasedbe
cat supabase/.temp/project-ref
supabase migration list
supabase db push --dry-run
```

- ✅ `project-ref` = `kvtzhyxlqouvpwasedbe`.
- ✅ Le dry-run liste une **fin** de la liste des 14 ci-dessus, dans l'ordre. L'état exact de la préprod n'est pas connu : `purchases`, puis `pf_dashboard_demo`, ont peut-être déjà été appliquées.
- 🛑 STOP si le dry-run liste un fichier **hors** de cette liste, ou si `migration list` montre une version Remote absente de Local.

```bash
supabase db push
supabase migration list
```

- ✅ **20/20** Local = Remote.
- 🟠 **Plan B** si l'erreur 42501 « must be owner of table objects » apparaît sur `20260914160000_attachments.sql` : suivre la procédure en 4 étapes de `docs/checklist-u1u2.md` §D.

## P3. Secret RPC et contrôle des données · ~5 min

SQL Editor préprod : `select id from webhook_config;`
- **Aucune ligne** : générer la valeur avec `openssl rand -hex 32`, puis `insert into webhook_config (id, rpc_secret) values (1, '<valeur>');`.
- **Une ligne existe** : réutiliser sa valeur en P4, sans la réécrire.

Contrôle des `attributions` (requête de `docs/checklist-u1u2.md` §E) : ✅ `0` e-mail invalide.

## P4. Render préprod — variables · ~10 min

Poser le tableau de `docs/checklist-u1u2.md` §F, puis **Save** :
- Supabase préprod : `kvtzhy…`, **jamais** `oltwz…`.
- `WEBHOOK_RPC_SECRET` : valeur de P3.
- `PARTNER_ACTIVATIONS_ENABLED=true`, `SHOW_ACTIVATION_LINK=true`, `PARTNER_BILLING_PREVIEW=true`.
- `RESEND_API_KEY`, `RESEND_FROM`, `SUPPORT_EMAIL`.
- `APP_URL`, `CORS_ORIGIN`.
- Envoi papier (seulement si tu as la clé **TEST**) : `MYSENDINGBOX_API_KEY` (clé TEST), `MSB_WEBHOOK_URL_SECRET` (`openssl rand -hex 32`), `PAPER_SENDS_ENABLED=true`.
- Facultatif : `SENTRY_DSN` / `VITE_SENTRY_DSN`.

**À retirer** : `FEATURE_LLM`, `EMAIL_SENDS_ENABLED`, `EXTRA_SENDS_ENABLED`, `PAYMENTS_ENABLED`, `STRIPE_PRICE_ID`, `FORFAIT_INCLUDED_SENDS`.

## P5. Code préprod · ~10 min

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git fetch origin
git merge-base --is-ancestor origin/pre-prod 'preprod-v2-rc5^{commit}' && echo "fast-forward possible"
git push origin 'preprod-v2-rc5^{commit}:refs/heads/pre-prod'
```

- Si une variable `VITE_*` a changé, lancer dans Render : Manual Deploy → **Clear build cache & deploy**. Noter le **deploy ID**.
- ✅ `fast-forward possible`, puis le push accepté.
- 🛑 STOP si le push est `non-fast-forward` : ne jamais forcer.

## P6. Vérifications, comptes et hook · ~25 min

1. Suivre `docs/checklist-u1u2.md` §G : `/api/health` → 200, et le bundle ne contient que `kvtzhy…`.
2. MySendingBox **TEST**, si la clé est posée : déclarer le webhook `https://preprod-app.seren-app.fr/api/letters/provider-webhook/<MSB_WEBHOOK_URL_SECRET>`.
3. `docs/checklist-u1u2.md` §I, **dans cet ordre strict** :
   1. seed **PARTIE 1** (`scripts/seed-demo-v2.sql`) ;
   2. **Add user** des gérants et de l'admin, mot de passe posé à la création ;
   3. seed **PARTIE 2** (UUID) → ✅ `untrusted: 0` ;
   4. **hook ON** ;
   5. preuve que `/signup` est **refusé**.

## P7. Recette préprod · ~15 min

Dans un navigateur, avec un gérant PF puis une famille de test (second profil de navigateur) :
1. La PF ouvre un dossier et copie le lien d'activation.
2. La famille active son accès et coche les 3 consentements.
3. Questionnaire : ✅ la 2ᵉ question est le **département**, l'identité n'est pas redemandée. Tester EHPAD, aides et abonnements.
4. Écran « Vos coordonnées pour les courriers » : ✅ nom et prénom déjà remplis.
5. Roadmap : ouvrir le courrier « Résilier les abonnements presse ». ✅ Seuls le titre et le numéro d'abonné restent à saisir, et l'aperçu est complet.
6. Avec la clé TEST : joindre un acte de décès fictif et **cliquer « Envoyer »**. ✅ Le pli apparaît dans le dashboard MySendingBox **test**.
7. Côté PF : ✅ le dossier est **actif**, sans aucun contenu visible.

**GO préprod** si tout est vert. **NO-GO** : Render → Rollback vers le deploy ID précédent (les migrations sont additives et restent).

---

# PARTIE 2 — PROD (`oltwzvfjazwjvghpzhia`)

On suit **`docs/runbook-beta-prod.md`**, étapes §1 à §11, **avec 3 corrections** :

| Dans le runbook | À remplacer par |
|---|---|
| `demo-2026-09-18` (worktree §4, push §7) | **`preprod-v2-rc5`** : `git worktree add --detach ../push-prod preprod-v2-rc5`, puis `git merge-base --is-ancestor origin/main 'preprod-v2-rc5^{commit}'` et `git push origin 'preprod-v2-rc5^{commit}:refs/heads/main'` |
| « N = 12 » et la liste de 12 fichiers (§4) | **N = 14**, la liste de 14 fichiers en tête de ce document (si la prod est toujours à 6/6 : vérifier avec `supabase migration list`) |
| Dates des créneaux (jeudi 18/09) | le créneau que tu choisis |

## Prérequis — ce qui bloque, et à quel niveau

Détail des conditions : `docs/runbook-beta-prod.md` §0.

| Pour… | Il faut… |
|---|---|
| Mettre la v2 en prod (§1 à §9) | Relecture juridique des **textes bêta** (CGU, confidentialité, données sensibles) et des **nouveaux contenus**, dont les 9 étapes et les 5 courriers de rc4. Domaine Resend vérifié et SMTP custom en prod. `SUPPORT_EMAIL` publié. Sauvegarde prod de moins de 24 h. |
| Ouvrir les dossiers famille (§10, `PARTNER_ACTIVATIONS_ENABLED=true`) | Lettre d'engagement PF art. 28 **signée**. |
| Ouvrir le papier live (§11, dernier geste) | Compte MySendingBox **live** avec paiement, DPA art. 28 signé, grille tarifaire, 2-3 plis de contrôle réels « acceptés », fenêtre d'annulation réglée. |

Sans les prérequis du papier live, la v2 ouvre **sans papier** : les courriers restent téléchargeables en PDF. Le papier s'active plus tard en 1 minute, sans redéploiement.

## Ordre imposé en prod (runbook, non négociable)

1. **§1 État initial.** Noter le deploy ID, vérifier la sauvegarde, lire `webhook_config`.
2. **§2 Auth.** « Confirm email » **reste coché** ; le hook n'est **pas encore** activé.
3. **§3 Variables Render prod.** Save **sans déployer**. Laisser absentes les variables de papier et d'activation.
4. **§4 Migrations.** Les 14 fichiers. ⏱️ Enchaîner §5 à §7 **dans les 20 minutes** : une migration retire l'écriture `letter_sends` de l'ancien code.
5. **§5 `webhook_config`.** Même valeur que `WEBHOOK_RPC_SECRET` dans Render.
6. **§6 Backfill** des comptes réels (`scripts/backfill-prod-beta.sql`, dry-run d'abord). Mettre les adresses des gérants et admins dans `v_excluded`.
7. **§7 Code.** Push de `preprod-v2-rc5^{commit}` sur `main`, puis `/api/health` et contrôle du bundle, qui ne doit contenir que `oltwz…`.
8. **§8 Hook ON**, puis preuve que `signUp` est refusé (403), et **seulement ensuite** décocher « Confirm email ».
9. **§9 Gérants et admins.** Seed parties 1 et 2 adaptées, `link_enrollments` → `untrusted: 0`.
10. **§10 Dossiers famille.** `PARTNER_ACTIVATIONS_ENABLED=true`, si la lettre art. 28 est signée.
11. **§11 Papier live.** `PAPER_SENDS_ENABLED=true` et clé live, si tous les prérequis du papier sont verts.

**Retour arrière** : Render → Rollback vers le deploy ID de §1. Les migrations sont additives et restent en place. Détail dans `docs/runbook-beta-prod.md` §14.

---

# PARTIE 3 — Après la mise en prod

- **Nettoyage (règle des 2 branches).** Supprimer localement et sur GitHub les branches mergées : `integration/v2-demo` une fois `main` à jour, `feature/v2-*`, `fix/*` intégrées, les worktrees `.claude/worktrees/*` et `wt-perso`. Garder les tags.
- **Non intégré à rc5, à reprendre dans un rc6 si voulu :**
  - `fix/auth-user-identity` : identité `user` stable au retour sur l'onglet, et erreur de lecture distinguée d'une absence de roadmap. Elle était encore en revue au moment du tag.
  - `fix/flaky-react-flush-tests` : **abandonnée**, redondante avec les attentes déterministes déjà intégrées.
- **Surveillance J+1 à J+7** : `docs/runbook-beta-prod.md` §12, avec Sentry, le dashboard MySendingBox et la vue admin Seren.
