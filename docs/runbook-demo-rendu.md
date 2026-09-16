# Runbook — Démo investisseurs (jeudi 18/09, 15h) et créneaux du démonstrateur v2

> Réécrit le 2026-09-16 pour le modèle v2 (la pompe funèbre ouvre et la famille active son dossier).
> Contrat : `docs/design-v2-demonstrateur.md`. Plans : `docs/plan-v2-app.md`, `docs/plan-v2-sql.md`.
> Démo **sur la préproduction** (`preprod-app.seren-app.fr`, Basic Auth). Bêta pilote **en production** le
> même soir, 16h30-18h30 : `docs/runbook-beta-prod.md`.

---

## 0. État, paliers et replis

| Palier | Contenu | Repli déjà construit |
|---|---|---|
| **PLANCHER** | 2a en préprod, paywall forfait retiré, `/signup` fermé, euros de la page PF v0 masqués, textes v2, LLM coupé, papier en clé TEST. **Aucune migration v2.** | tag local `preprod-plancher` |
| **MINIMUM** | Parcours v2 complet en live : correctif F1, hook « Before User Created », gate fail-closed, consentements persistés, probes v2, vue admin Seren, compteurs PF explicites | Render « **Rollback** » vers le **deploy ID de U1** (la RPC `partner_dashboard` v0 reste intacte) |
| **CIBLE** | Bloc « Ce mois : N dossiers activés · N × 220 € TTC à facturer (estimation) » derrière `PARTNER_BILLING_PREVIEW`, **préprod seulement** | slide |

Tags de repli, dans l'ordre où ils sont posés : `preprod-plancher` → `preprod-v2-rc1` → `preprod-v2-rc2` → `preprod-v2-rc3` (si retenu) → `demo-2026-09-18`. Les deploy IDs de U1, rc1, rc2 et rc3 sont **notés à chaque push** : c'est ce qui rend le rollback possible en 2 clics.

> 🛑 **La production est intouchée jusqu'à U4** (jeudi 16h30) : aucun déploiement, aucune migration, aucun réglage Auth.
> 🛑 **Et aucun commit sur `main` jusqu'à U4** : la promotion prod est un *fast-forward* de `demo-2026-09-18`. Un simple commit de documentation sur `main`, une heure après la démo, ferait échouer l'étape 6 de U4. Les correctifs de la semaine vont sur `pre-prod` ou sur une branche de travail.

**Prérequis hors créneaux.** Douze points (P1 à P12) ne tiennent pas dans les créneaux d'Arnaud : voir le tableau **§10.3 du contrat**, repris en tête de `docs/runbook-beta-prod.md` §0. Deux d'entre eux pèsent sur jeudi :

- **P1 — 2 à 3 plis de contrôle envoyés par Arnaud depuis son compte MySendingBox LIVE, au plus tard mercredi 9h.** Condition GNG6 (12), qui se lit « plis **acceptés ou imprimés** dans le dashboard MySendingBox » ; la réception papier est contrôlée après coup (surveillance J+1 à J+7). Sans P1, le papier live n'ouvre pas jeudi.
- **P12 — aucun commit sur `main` jusqu'à U4** (ci-dessus).

---

## 1. Deux profils de navigateur — obligatoire

La session Supabase est stockée dans le `localStorage` de l'origine : **deux onglets du même profil partagent la même session**. Activer le compte famille dans un second onglet déconnecterait donc la pompe funèbre en plein milieu de la démo.

1. Chrome → menu profil → **Ajouter** → créer « **Seren PF** » puis « **Seren Famille** » (deux fenêtres distinctes, pas deux onglets).
2. Dans **chaque** profil, ouvrir `https://preprod-app.seren-app.fr`, saisir la **Basic Auth** de la préprod et **cocher la mémorisation**.
3. Profil **PF** : connecté au gérant PF-X, page `/partenaire` déjà chargée.
4. Profil **Famille** : la boîte e-mail de démo ouverte dans un onglet, le compte famille pré-activé connecté dans un autre.

> ⚠️ Si le navigateur perd le fragment `#t=` du lien d'activation après le défi Basic Auth (hypothèse H8), ouvrir le lien **après** avoir saisi la Basic Auth dans le profil. La production n'est pas concernée (pas de Basic Auth).

---

## 2. Créneaux d'Arnaud

Règles communes : toute sortie inattendue = **STOP**, on la colle dans la session. **Aucune clé, aucun mot de passe, aucun secret dans le chat.** Les tags `rc*` sont **locaux** au dépôt (posés par les agents dans le worktree d'intégration) : ils sont donc visibles depuis `../push-preprod`, qui est un worktree du même dépôt.

### U1 — mercredi 16/09, au plus tard 11h

`docs/checklist-push.md`, intégralement (rien n'en est repris ici) : Auth préprod, inventaire prod en lecture, CI, 8 migrations 2a, `webhook_config`, variables Render, bundle. **GNG1 est rendu en fin de créneau** et décide du nombre de fichiers attendus au dry-run de U2.

### U2 — mercredi 12h30-13h25 (55 min)

Dans cet ordre, sans en sauter un.

**1. CI sur le commit qu'on va déployer** (dépôt principal) :

```bash
git push origin integration/v2-demo
gh run list --branch integration/v2-demo --limit 1
```

✅ `completed success` **avant** tout `db push` (les migrations sont irréversibles). 🛑 CI rouge → ne rien pousser en base, coller le lien du run.

**2. Worktree de push et cible :**

```bash
cd /Users/arnaudgay/Documents/git/Seren/push-preprod
git checkout --detach preprod-v2-rc1
cat supabase/.temp/project-ref
```

✅ `kvtzhyxlqouvpwasedbe`. 🛑 Toute autre valeur — et en particulier le project-ref de la **PRODUCTION** (`oltwzvfjazwjvghpzhia`) : STOP immédiat, on ne pousse rien.

**3. Contrôle E7 — AVANT le `db push`** (SQL Editor préprod). La migration v2 copie `attributions` → `dossiers` avec une contrainte de format sur l'e-mail : **une seule adresse invalide ferait échouer tout le push**.

```sql
select count(*) as emails_invalides
from public.attributions a
join auth.users u on u.id = a.user_id
where lower(btrim(u.email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
   or char_length(u.email) > 254;
```

✅ `0`. 🛑 Sinon : corriger ou supprimer ces lignes d'`attributions` avant de pousser (normalement déjà fait en U1, étape E).

**4. Dry-run — liste CONDITIONNELLE :**

```bash
supabase migration list
supabase db push --dry-run
```

- **GNG1 vert** (U1 a poussé les 8 migrations 2a) → **exactement 4 fichiers** : `20260915200000_v2_core.sql`, `20260915201000_v2_partner_rpc.sql`, `20260915202000_v2_admin.sql`, `20260915210000_transmissions_f1.sql`.
- **GNG1 NO-GO** (U1 n'a pas poussé) → **exactement 12 fichiers** : les 8 de `docs/checklist-push.md` §D (`20260725120000_purchases.sql`, `20260913200000_pf_dashboard_demo.sql`, `20260914100000_sender_profiles_organisations.sql`, `20260914110000_organisations_seed.sql`, `20260914120000_letter_sends_papier.sql`, `20260914150000_purchases_kind_writer.sql`, `20260914160000_attachments.sql`, `20260914170000_resync_reader.sql`) **puis** les 4 v2 ci-dessus.

🛑 Toute autre liste = STOP.

**5. Push des migrations :**

```bash
supabase db push
supabase migration list
```

✅ **18/18** dans les deux cas. Plans B :
- **H6** (le `alter function … owner to postgres` ou le `grant … to supabase_auth_admin` est refusé) → dans le SQL Editor : `alter function public.hook_before_user_created(jsonb) owner to postgres;` puis `grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;`
- **42501 « must be owner of table objects »** (seulement dans le cas 12 fichiers) → procédure en 4 étapes de `docs/checklist-push.md` §D. **Relancer `db push` tel quel ne suffit pas** : le fichier commence par des `drop policy … on storage.objects`, qui exigent eux aussi d'être propriétaire.

**6. Seed partie 1** (SQL Editor) — `scripts/seed-demo-v2.sql`, bloc entre `-- >>> PARTIE 1` et `-- <<< FIN PARTIE 1` : partenaires PF-X et PF-Y, enrôlement des gérants et de l'admin. ✅ la liste d'enrôlements affichée par le script (colonne `lie` à `false`, c'est normal à ce stade).

**7. Hook** : Authentication → Hooks → **Before User Created** → Postgres → `public.hook_before_user_created` → **activer**.

**8. Code préprod** — forme **pelée** obligatoire (`preprod-v2-rc1` est un tag **annoté** ; `rc1:pre-prod` serait rejeté par le serveur) :

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git fetch origin
git merge-base --is-ancestor origin/pre-prod 'preprod-v2-rc1^{commit}' && echo "fast-forward possible"
git push origin 'preprod-v2-rc1^{commit}:refs/heads/pre-prod'
git push origin preprod-v2-rc1
```

✅ fast-forward, Render déploie, **deploy ID noté**. 🛑 `rejected (non-fast-forward)` : ne jamais forcer — si `preprod-plancher` avait été poussé, la session doit d'abord exécuter l'étape 39.8 de `docs/plan-v2-app.md`.

**9. Comptes internes — créés par Arnaud, jamais par un script.** Authentication → Users → **« Add user » (auto-confirm)** pour les gérants PF-X, PF-Y et l'admin, **en posant le mot de passe à la création** (valeur générée par `openssl rand -base64 18`, conservée dans le gestionnaire de mots de passe d'Arnaud — jamais dans le dépôt ni dans le chat). Cela évite l'aller-retour par « Send password recovery », qui dépend du SMTP et reste réservé au **gérant de PF réel** en production ; le compte reste « jamais connecté », ce qu'exige `link_enrollments`.

🛑 **Le bouton doit CRÉER le compte : « already registered » = STOP et enquête** (l'adresse enrôlée est déjà détenue par quelqu'un). Puis **copier les 3 UUID** (colonne UID).

⚠️ **Ne se connecter à aucun de ces comptes avant l'étape 10** — ni par l'application, ni par un script : la partie 2 refuse un compte déjà connecté.

**10. Seed partie 2 — appariement explicite e-mail ↔ UUID** (SQL Editor) :

```sql
select public.link_enrollments('[{"email":"pf.demo@seren-test.fr","user_id":"<UUID PF-X>"},
                                {"email":"pf.temoin@seren-test.fr","user_id":"<UUID PF-Y>"},
                                {"email":"admin.demo@seren-test.fr","user_id":"<UUID admin>"}]'::jsonb);
```

✅ `partner_users_linked: 2`, `seren_admins_linked: 1`, **`pending: 0` et `untrusted: 0`**.
🛑 `untrusted > 0` : un compte portant une adresse enrôlée n'est pas fiable (créé avant l'enrôlement, déjà connecté, changement d'e-mail en attente, ou UUID d'un autre compte) → enquête. Aucun rôle n'a été donné.
🛑 `enrollment_conflict_family` : une adresse enrôlée porte un dossier famille → corriger la partie 1.

**11. Provisionnement des comptes de probes et de démo — APRÈS l'étape 10, jamais avant** (le script se connecte réellement : lancé avant la partie 2, il poserait `last_sign_in_at` et `link_enrollments` refuserait les comptes). Depuis `../push-preprod`, qui contient le script (le dépôt principal est sur `main` et ne l'a pas). Les dossiers passent par `POST /api/partner/dossiers` : la RPC exige le secret serveur.

```bash
cd /Users/arnaudgay/Documents/git/Seren/push-preprod
E2E_TARGET=preprod \
PROBE_SUPABASE_URL=https://kvtzhyxlqouvpwasedbe.supabase.co \
PROBE_SUPABASE_KEY='<clé publishable préprod>' \
PROVISION_API_URL=https://preprod-app.seren-app.fr \
PROVISION_PFX_EMAIL=pf.demo@seren-test.fr PROVISION_PFY_EMAIL=pf.temoin@seren-test.fr \
PROVISION_ADMIN_EMAIL=admin.demo@seren-test.fr PROVISION_DEMO_EMAIL=famille.demo@seren-test.fr \
PROVISION_PFX_PASSWORD='<mdp PF-X>' PROVISION_PFY_PASSWORD='<mdp PF-Y>' PROVISION_ADMIN_PASSWORD='<mdp admin>' \
PROBE_ENV_FILE="$HOME/.seren-probes.env" \
node scripts/provision-v2.mjs
```

✅ sortie sans erreur, identifiants écrits dans `~/.seren-probes.env` (mode 600, hors dépôt). **Code de sortie 2** = action d'Arnaud requise : le message nomme l'étape manquante (« Add user » non fait, partie 2 non jouée, ou mot de passe non fourni) — la corriger et relancer **la même commande**.
🛑 Échec persistant → **seed partie 3** (`scripts/seed-demo-v2.sql`, bloc `-- >>> PARTIE 3`) : elle crée en SQL le dossier de démo actif, ses 3 consentements et le pont des 10 envois. La démo est sauvée, les probes sont reportées en U3. ⚠️ Le hook étant actif, un « Add user » non invité est refusé : Auth → Hooks → désactiver, Add user (auto-confirm), **réactiver aussitôt**, puis lancer la partie 3.

**12. Vérification :**

```bash
cd /Users/arnaudgay/Documents/git/Seren/push-preprod
E2E_TARGET=preprod PROBE_SUPABASE_URL=https://kvtzhyxlqouvpwasedbe.supabase.co \
PROBE_SUPABASE_KEY='<clé publishable préprod>' PROVISION_API_URL=https://preprod-app.seren-app.fr \
node --env-file="$HOME/.seren-probes.env" scripts/provision-v2.mjs --verify
```

✅ `# 12/12 ok`.

**13. Validation des textes, 10 min — TON ET OFFRE seulement** : grille §7 de `docs/textes-beta-v2.md`, formulations du catalogue épicène et de l'offre. La **relecture juridique** (CGU, confidentialité, données sensibles, art. 14, corps de courriers) est un prérequis **hors créneau** (P6 et P7, échéance jeudi 12h) : elle conditionne GNG6 (4), pas ce créneau.

> ⚠️ **Pièges de ce créneau.**
> - Un compte famille dont le dossier est **actif** ne peut plus être supprimé depuis le Dashboard (`Delete user` bloqué) : clore d'abord le dossier avec la **partie B** de `scripts/erase-family.sql`.
> - Le provisionnement fait **réellement** partir les invitations vers `rls-probe-*@seren-test.fr` : c'est accepté. Pour l'éviter, retirer temporairement `RESEND_API_KEY` de Render (les dossiers sont créés quand même, avec `email_sent:false`).
> - L'unicité de l'e-mail famille est **globale** : une adresse déjà utilisée renvoie `EMAIL_UNAVAILABLE`. Prévoir des adresses neuves pour chaque répétition.

### U3 — mercredi 20h30-21h15

Push de `preprod-v2-rc2` **en forme pelée** (commandes exactes fournies par la session, étape 41.3 du plan app), deploy ID noté. Si l'E2E et les probes ont été refusés aux agents l'après-midi, les lancer ici, depuis `../push-preprod` — **un seul nom de variable pour le mode écriture : `PROBE_WRITE=1`** (`--write` n'existe pas et serait ignoré silencieusement) :

```bash
cd /Users/arnaudgay/Documents/git/Seren/push-preprod
set -a && . "$HOME/.seren-probes.env" && set +a
E2E_TARGET=preprod E2E_API_URL=https://preprod-app.seren-app.fr \
  E2E_SUPABASE_URL=https://kvtzhyxlqouvpwasedbe.supabase.co E2E_SUPABASE_KEY="$PROBE_SUPABASE_KEY" \
  node scripts/e2e-v2.mjs
node --env-file="$HOME/.seren-probes.env" scripts/rls-probes.mjs
PROBE_WRITE=1 PROBE_API_URL=https://preprod-app.seren-app.fr \
  node --env-file="$HOME/.seren-probes.env" scripts/rls-probes.mjs
```

✅ `1..13` sans `not ok` pour l'E2E ; aucune ligne `not ok` pour les probes (en lecture seule, les sondes d'écriture sortent en SKIP). Puis **répétition chronométrée** (2 profils, vraie boîte e-mail) et verdict des défauts — GNG5.

### Jeudi 9h-9h25

Push de `rc3` s'il est retenu, puis **tag de démo** : commandes exactes fournies par la session (41.5), **toutes en forme pelée**, tag `demo-2026-09-18` **annoté** et poussé séparément. Deploy IDs rc2 et rc3 notés. Puis checklist du jour J (§4). **Gel dur à 10h45.**

---

## 3. Scénario chronométré (8 min 30)

| Top | Profil | Ce qu'on montre | Ce qu'on dit |
|---|---|---|---|
| **0:00** | slide | Le modèle : la famille paie **290 € TTC** dans la facture de la pompe funèbre, la PF garde **70 € TTC** de commission, Seren lui facture **220 € TTC**. | « La PF vend, nous exécutons. Et la PF ne voit **jamais** le contenu du dossier. » |
| **0:45** | **PF** | `/partenaire` : compteurs explicites (créés ce mois, créés au total, activés par la famille, en attente d'activation) et, si livrée, l'estimation « N × 220 € TTC à facturer ». Création d'un dossier en direct avec une adresse **neuve** de la boîte de démo. | « Trente secondes au comptoir, pendant l'organisation des obsèques. » |
| **1:30** | **PF** | Ressaisie du **même défunt** → avertissement de doublon, confirmation explicite. | « Deux conseillers, une même famille : on ne crée pas deux dossiers par accident. » |
| **2:00** | **Famille** | L'e-mail d'invitation arrive → `/activation` → choix du mot de passe → `/bienvenue` : trois cases, « proposé par Pompes Funèbres Démo », prénom du défunt. | « L'information de l'article 14 est dans le premier e-mail : qui a transmis quoi, pourquoi, et vos droits. » |
| **3:15** | **Famille** | Deux ou trois questions du questionnaire (textes statiques, LLM coupé), puis bascule sur le compte **pré-activé** du même profil. | « Le questionnaire s'adapte ; on saute à un dossier déjà rempli. » |
| **4:30** | **Famille** | Écran de fin « **N courriers prêts** » → roadmap avec le bandeau de relecture → courrier bailleur pré-rempli → PJ PDF fictive → **envoi papier en clé TEST** → « Pris en charge » → badge « **9 envois inclus restants sur 10** ». | « En test, l'imprimeur accepte le pli sans l'imprimer ; en production le suivi est réel. » |
| **6:30** | **PF** | Le dossier créé à 0:45 est passé « **Activé** ». Aucune réponse, aucun courrier, aucun document visible. | « Voilà tout ce que la pompe funèbre voit. » |
| **7:15** | mixte | Sécurité : `/signup` redirigé, sortie du scénario de hook (inscription non invitée refusée), sortie des probes (PF-X ne lit pas le contenu de sa propre famille), flags fermés (LLM, e-mail aux organismes, mini-paiement). | « L'isolation est prouvée par des sondes rejouables, pas par une promesse. » |
| **8:15** | slide | Ce qui ouvre **ce soir** en bêta pilote réelle, et la suite : LRAR, file de validation, relances, facturation SEPA, coffre complet. | |

---

## 4. Checklist du jour J

| Heure | Geste |
|---|---|
| 14h00 | Warm-up automatique : les agents appellent `/api/health` toutes les 5 minutes jusqu'à 15h30 (instance Render préprod éventuellement en spin-down). |
| 14h50 | Ouvrir les **deux profils** de navigateur ; la page `/partenaire` doit s'afficher en **moins de 3 secondes**. |
| 14h50 | **Invitation de secours prête** : un dossier créé à 14h45, son lien d'activation copié hors écran (flag `SHOW_ACTIVATION_LINK`, préprod seulement). |
| 14h55 | Compte pré-activé vérifié : `/api/me` → quota **10/10**, consentement à jour. |
| 14h55 | Captures de secours ouvertes dans un dossier local (§7) ; Sentry préprod ouvert dans un onglet. |

---

## 5. Replis pendant la démo

| Incident | Repli |
|---|---|
| L'e-mail d'invitation n'arrive pas | lien copiable « préproduction » affiché côté PF, collé dans le profil Famille |
| L'activation échoue | basculer sur le compte **pré-activé** (déjà connecté dans le profil Famille) |
| L'envoi papier répond 502 ou 503 | télécharger le PDF et montrer les captures du chantier 2a |
| La préprod est rouge à 10h45 | Render → **Rollback** vers le deploy **rc2** |
| Une migration v2 est fautive | Render → **Rollback** vers le deploy de **U1** (la RPC `partner_dashboard` v0 est restée intacte, la page PF v0 refonctionne) |
| Le hook refuse tout | Authentication → Hooks → désactiver (1 clic). Le gate serveur maintient les 403. |

> ⚠️ **Render ne déploie pas un tag.** Le rollback se fait par « Rollback » sur un deploy existant, ou « Deploy specific commit ».

---

## 6. Pièges connus

- **`dedup_key` papier** : même modèle + même adresse sur un même compte → 409 `SEND_ALREADY_EXISTS`. Utiliser un compte neuf à chaque répétition.
- **Plafonds d'envoi** : 10 par utilisateur et 50 par jour au global. Avant la répétition, en préprod : `update public.send_limits set max_user_daily = 30, max_global_daily = 200 where id = 1;`
- **Statut figé « Pris en charge »** en clé TEST : le fournisseur n'émet pas d'événement de suivi. C'est normal, le dire à l'oral.
- **Fragment `#t=` et Basic Auth** (H8) : si le navigateur perd le fragment après le défi Basic Auth, ouvrir le lien **après** avoir saisi la Basic Auth dans le profil.
- **Unicité globale de l'e-mail famille** (H17) : une adresse = un dossier ouvert, toutes PF confondues. Une adresse déjà prise renvoie `EMAIL_UNAVAILABLE`.
- **Suppression d'un compte de test** : `Delete user` est bloqué tant que le dossier est **actif** — clore d'abord le dossier (partie B de `scripts/erase-family.sql`).

---

## 7. Captures de secours

Les **14 captures sont réalisées par les agents** pendant la recette visuelle (étape 41.1 du plan app), en **français, largeur desktop**, dans un dossier local nommé dans le rapport de recette. Arnaud ne refait en U3 que les captures manquantes ou fausses (5 minutes maximum).

Liste des 14 écrans : `/login` · `/activation` (prêt) · `/activation` (lien expiré) · `/bienvenue` · une question du questionnaire · écran de fin · roadmap avec bandeau · panneau d'envoi papier · envoi « Pris en charge » avec quota 9/10 · 402 « contactez le support » · `/partenaire` (compteurs + formulaire) · avertissement de doublon · carte « Activé » · `/admin`.
