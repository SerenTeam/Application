# Design — Chantier 2, lot 2a · Fondations d'envoi papier

> Rédigé le 2026-08-25. Sources : roadmap technique et roadmap produit (Google Drive, source de vérité — relues ce jour via le connecteur), exploration multi-agents du repo (workflow `chantier2-context-map`), recherche comparative providers (workflow `chantier2-providers`), décisions de cadrage d'Arnaud du 2026-08-25 (§2).
> **Pré-vol du 2026-09-13** (workflow contre-vérification vs HEAD + étude doc officielle MySendingBox) : 7 amendements appliqués (AM-1 → AM-7 ci-dessous, marqués 🔧) — verdict : spec prête pour le plan. La table de mapping événements↔statuts est figée dans le plan.
> Le chantier 2 « envoi réel des courriers » est découpé en **3 lots livrables** : **2a fondations** (cette spec), 2b moment magique + relances J+15 + unification des statuts de démarche, 2c LRAR + AR probant. Chaque lot suit le cycle spec → plan → exécution → merge.

## 1. Objectif du lot 2a

Depuis une étape de sa roadmap, un utilisateur payant peut faire partir **un vrai courrier papier** (courrier simple) vers un organisme : corps regénéré et validé côté serveur, acte de décès joint, adresse du destinataire résolue par l'annuaire (caisses locales) ou saisie, quota d'envois inclus décompté, envoi supplémentaire facturable à l'acte, statuts de distribution suivis (webhook + resynchronisation), le tout sous kill switch et plafonds de dépense. Pas d'écran groupé (lot 2b), pas de LRAR (lot 2c).

## 2. Décisions de cadrage actées (Arnaud, 2026-08-25)

| # | Sujet | Décision |
|---|---|---|
| D1 | Canaux | **Courrier simple d'abord** (2a), LRAR au lot 2c — provider choisi pour les deux d'emblée |
| D2 | Validation avant envoi | **Résolution serveur + envoi direct** : le serveur regénère le corps depuis template + variables (🔧 plus de **corps libre client** — la v1 accepte un `resolved_body` texte arbitraire ; le PDF, lui, est déjà rendu serveur) ; pas de file admin en 2a (réévaluable au 2c pour le LRAR) |
| D3 | Adresses | **Hybride département** : question « département du défunt » ajoutée au questionnaire, annuaire des caisses locales pour les 4 réseaux (CAF, CPAM, CARSAT, centres des impôts), saisie utilisateur pour les destinataires qui lui sont propres (banque, bailleur, employeur…) |
| D4 | Quota | 5 envois inclus (`purchases.included_sends`, figé à l'achat) puis **facturation à l'acte** : Checkout Stripe « envoi supplémentaire », prix piloté par le Dashboard (même modèle que le forfait) |
| D5 | Coffre | **Coffre minimal dans le 2a** : acte de décès + justificatifs, bucket privé, contrôle MIME réel, taille limitée. Le chantier 3 complet (antivirus, rétention, journal d'accès) reste séparé |
| D6 | Portails | CAF/CPAM/impôts en ligne restent des démarches guidées (présentation soignée au lot 2b) — pas d'envoi papier concurrent en 2a |
| D7 | Provider | **MySendingBox** (groupe CORUS) — self-service, clé test immédiate, simple + LRAR sur la même API, webhooks incluant le NPAI, LRAR 5,83 € ; **contact commercial Maileva engagé en parallèle** (meilleur dossier RGPD, bascule possible au 2c grâce à l'abstraction provider) |
| D8 | Structure | 3 lots livrables (2a / 2b / 2c), un cycle complet par lot |

### Comparatif providers (résumé — analyse complète du 2026-08-25)

MySendingBox : un provider pour les deux canaux (un champ d'affranchissement à changer), API REST propre avec paire de clés test/live immédiate (🔧 la clé test rend le PDF et émet `letter.created`, mais **ne simule aucun événement aval** — le cycle complet ne se valide qu'en envois réels, budgétés au user step 3, et via le simulateur interne de l'adaptateur pour les tests), webhooks couvrant le cycle **du LRAR** (le courrier simple s'arrête à `letter.sent`) dont `wrong_address` (NPAI), clés d'idempotence ; SDK Node quasi mort → **REST direct** derrière l'adaptateur. LRAR 5,83 € (le moins cher du marché). RGPD correct (CORUS, ISO 27001, production en France) mais DPA non publié. Repli : Maileva (Docaposte/La Poste — meilleur dossier RGPD, tarifs simple probablement plus bas, mais cycle commercial de plusieurs semaines incompatible avec le calendrier du 2a). Écartés : AR24 (pas de courrier simple), Merci Facteur (dossier RGPD insuffisant pour des courriers post-décès). **Trois vérifications d'Arnaud avant tout envoi réel** : grille tarifaire écrite du courrier simple (non publique) + confirmation HT/TTC du 5,83 €, DPA art. 28 + localisation + durées de conservation + effaçabilité, test réel de 2-3 courriers vers une adresse contrôlée (délais, webhooks, gabarit fenêtre, comportement NPAI).

## 3. Données — 5 migrations

### 3.1 `sender_profiles` — profil expéditeur persistant
`user_id` (PK, ref auth.users), `full_name`, `address_line1`, `address_line2` (nullable), `postal_code`, `city`, `relationship` (lien avec le défunt, nullable), timestamps. RLS owner (SELECT/INSERT/UPDATE par `auth.uid()`). Saisi/édité dans le panneau d'envoi à la première utilisation, consommé par le moteur de fusion (`useLetterGenerator` accepte déjà un `userProfile`, jamais branché — on le branche). La variable `VAR_USER_ADDRESS` des templates est éclatée en champs structurés (l'adresse postale normée l'exige).

### 3.2 Questionnaire — question « département du défunt »
Nouvelle question fermée (select des départements) dans le catalogue serveur, posée dans le bloc identité. C'est une **question de données** (comme le prénom du défunt) : elle ne conditionne aucune étape — l'invariant « toute question conditionne ≥ 1 étape » est ajusté pour reconnaître explicitement la catégorie « données » (allowlist existante des questions d'identité, étendue). Le département n'est **jamais transmis au rédacteur Mistral** (aucun changement au contrat de minimisation PII). Champ `deceased_department` ajouté à `QuestionnaireAnswersV2` + sessions. Les dossiers existants sans département : le panneau d'envoi le demande à la volée et le persiste.

### 3.3 `organisations` — l'annuaire
`id` (slug), `name`, `kind` (`caisse_locale` | `national`), `network` (`caf` | `cpam` | `carsat` | `impots` | null), `department` (nullable — renseigné pour les caisses locales), `address_line1/2`, `postal_code`, `city`, `verified_at`, `source_url`, timestamps. Lecture publique authentifiée (données publiques), écriture réservée (aucune policy — seed par migration/script). **Constitution : import automatisé depuis l'Annuaire de l'administration (open data DILA / service-public.fr, licence ouverte)** — script `scripts/import-organisations.mjs` rejouable qui extrait les 4 réseaux par département et régénère un fichier de seed versionné ; `verified_at` = date d'import. Résolution à l'envoi : `network + department` → adresse pré-remplie (modifiable par l'utilisateur). Les destinataires propres à l'utilisateur ne passent pas par l'annuaire (saisie, mémorisée par courrier).

### 3.4 `attachments` + bucket Storage privé
Bucket `documents` **privé** (aucun accès public). Table `attachments` : `id`, `user_id`, `kind` (`acte_deces` | `justificatif`), `storage_path`, `filename`, `mime`, `size_bytes`, `created_at`. RLS owner (SELECT/INSERT/DELETE). Policies Storage par préfixe `user_id/`. **Upload via le serveur** (`POST /api/attachments`, multipart, auth requise) : contrôle du type réel par **magic bytes** (PDF, JPEG, PNG uniquement), taille ≤ 5 Mo, nom de fichier assaini ; le serveur écrit dans Storage avec le client au token utilisateur (la RLS Storage s'applique). Lecture : URLs signées générées côté serveur, durée courte, jamais exposées en clair dans le front. Pas d'antivirus ni de politique de rétention en 2a (chantier 3) — la limite de types + taille + bucket privé borne le risque.

### 3.5 `letter_sends` — extension du cycle + durcissement RLS
- **Statuts étendus** (CHECK + transitions de la RPC réécrits par migration) pour le cycle papier : `prepared` → `submitted` (accepté provider) → `sent` (expédié) ; 🔧 **pour le courrier simple, `sent` est l'état final nominal** (MySendingBox n'émet aucun événement de distribution pour écopli/prioritaire — doc officielle) ; `delivered` est réservé au LRAR (2c) mais figure dès maintenant dans le CHECK. Terminaux d'échec : `failed` et `failed_address` (NPAI — peut arriver **après** `sent`, 5-10 j : transition `sent → failed_address` autorisée). Le mapping exact est figé dans le plan (table du pré-vol). Les statuts email v1 restent valides (union des cycles, `channel` discrimine).
- **Durcissement** : suppression de la policy utilisateur `FOR ALL` — il ne reste que le SELECT owner. **Toutes les écritures passent par RPC `security definer` à secret vérifié en base** (`webhook_config.rpc_secret`, modèle `purchases`) : création d'un envoi, claim de retry, mise à jour de statut. Un statut de distribution ne doit pas être falsifiable par son propriétaire — prérequis posé en 2a pour l'AR probant du 2c.
- Colonnes ajoutées : `attachment_ids` (jsonb, ids d'`attachments` joints), `cost_cents` (nullable, renseigné si connu), `provider` porte `mysendingbox`.
- Table **`provider_events`** : événement webhook brut persisté (id d'événement provider en PK — idempotence, payload jsonb, `processed_at` nullable) **avant** l'acquittement HTTP — un AR ou un NPAI ne doit jamais se perdre silencieusement (différence assumée avec le webhook email v1 « toujours 200 »).

## 4. Quota & facturation à l'acte

- Table **`send_debits`** : `send_id` (PK, réf. `letter_sends`), `user_id`, `source` (`included` | `extra`), `created_at`. **Idempotence par construction** : la PK interdit le double débit d'un même envoi (les retries `claimRetry` ne comptent jamais double).
- `purchases` gagne une colonne `kind` (`forfait` | `envoi_sup`, défaut `forfait`) : un achat « envoi supplémentaire » est une ligne `purchases` normale (Checkout + webhook existants, metadata `kind`) avec `included_sends = 1`. **Solde disponible = Σ `included_sends` des achats payés − count(`send_debits`)**.
- RPC `consume_send(send_id, …)` `security definer` (secret en base) : vérifie atomiquement le solde, insère le débit (`ON CONFLICT DO NOTHING`), refuse si épuisé → l'API répond « quota épuisé » avec l'offre d'achat à l'acte ; le front affiche le compteur (X/N inclus) et enchaîne vers le Checkout « envoi supplémentaire » (nouveau tarif Stripe, user step Dashboard, prix piloté par Stripe comme D3 du chantier 1).
- Le gating du chantier 1 (`requirePurchase`) reste le portier de la route d'envoi. 🔧 **`getPaidPurchase` filtre `kind='forfait'`** : un achat `envoi_sup` seul n'ouvre jamais le gate du produit, et le Checkout « envoi supplémentaire » **exige un forfait payé préalable** (403 sinon) — sans quoi tout le produit payant s'ouvrirait au prix d'un timbre.
- 🔧 **Le débit atomique intervient AVANT la soumission au provider** (`consume_send` : vérification du solde + INSERT `send_debits` dans la même transaction — deux envois concurrents avec 1 crédit ne passent jamais tous les deux). Sur échec de soumission, le débit est **libéré** (`release_debit(send_id)`, DELETE compensatoire) — « pas de débit sur échec » reste vrai, sans fenêtre de course. **Remboursements** : Σ sur les achats `paid` uniquement ; un solde devenu ≤ 0 fait refuser `consume_send` (jamais de créance, jamais d'annulation d'envois partis ; l'UI affiche 0, pas un négatif).
- Conséquence importante : même quand le gate est **ouvert** (`PAYMENTS_ENABLED` non défini, comportement pré-vente), un utilisateur sans achat a un **solde nul** → `consume_send` refuse → l'envoi papier n'est jamais gratuit. Le papier est doublement protégé (solde + kill switch `PAPER_SENDS_ENABLED`).

## 5. Chaîne d'envoi serveur

- **Adaptateur `paperSender`** (`server/lib/paper-sender.js`) : contrat identique à `createEmailSender` — `send({ pdf, recipient, options }) → { providerRef, status }`, `MYSENDINGBOX_API_KEY` absente → `paper_not_configured` (503 propre, feature inerte — pattern Resend/Stripe). L'abstraction rend la bascule Maileva possible sans toucher aux routes (D7).
- **Corps regénéré côté serveur** (D2) : la route d'envoi reçoit `template_id` + variables, regénère le corps depuis le catalogue serveur (les templates, aujourd'hui côté front, sont exposés au serveur — même mécanique de jumeaux que les catalogues d'étapes), valide la complétude des variables, rend le PDF. Le client n'envoie plus jamais de corps libre.
- **PDF postal** : `renderLetterPdf` étendu — page porteuse d'adresse compatible **enveloppe à fenêtre** (position normée du bloc destinataire), expéditeur depuis `sender_profiles`, pièces jointes transmises au provider (fusion multi-PDF supportée par MySendingBox).
- **Kill switch & plafonds** : `PAPER_SENDS_ENABLED` (kill switch du canal, **défaut OFF** — indépendant de `PAYMENTS_ENABLED` : même gate ouvert en pré-vente, aucun papier ne part sans activation explicite) ; plafonds en base vérifiés dans la RPC de création : max envois/utilisateur/24 h et max envois globaux/24 h (valeurs dans une table de config, modifiables sans redéploiement) ; dépassement → refus + `Sentry.captureException`.
- **Rate limiting** existant (20/h/user) conservé en amont.

## 6. Webhook provider & resynchronisation

Route `POST /api/letters/provider-webhook` sur le patron v1 : corps brut monté avant `express.json()`. 🔧 **La signature des webhooks MySendingBox n'est pas documentée publiquement** → le webhook est traité comme un **ping non fiable** : secret aléatoire dans l'URL déclarée au dashboard, **persistance de l'événement brut dans `provider_events` avant l'acquittement** (PK = id d'événement, idempotence), puis **jamais d'écriture de statut depuis le payload seul** — le traitement fait un `GET /letters/{id}` authentifié et dérive le statut de la réponse (même RPC que la resync). Si une signature existe (à confirmer avec le compte), on l'ajoute sans retirer ce dispositif. Événements inconnus : persistés + acquittés + ignorés (log). **Resynchronisation pg_cron** (nouveau job versionné, patron de la purge) : toutes les 6 h, interroger le provider sur les envois **non clos** : `submitted` > 24 h (sans limite) et `sent` **jusqu'à J+30** (🔧 couverture NPAI 5-10 j avec marge — au-delà, l'envoi est clos et sort de la resynchronisation).

## 7. Front (lot 2a — volontairement minimal)

Extension du panneau d'envoi existant (`LetterSendPanel`) pour le canal papier : formulaire adresse destinataire (pré-rempli par l'annuaire quand `network` connu, sinon saisie), édition inline du profil expéditeur à la première utilisation, sélection/upload des pièces jointes (acte de décès mis en avant), compteur de quota et enchaînement Checkout à l'acte, affichage des statuts du cycle papier, dont le NPAI avec parcours de rattrapage : corriger l'adresse et renvoyer. **Règle de débit actée** : un re-envoi suite à un échec d'adresse (NPAI) n'est **pas débité une seconde fois** (le débit initial couvre la démarche) ; tout autre renvoi volontaire est un nouvel envoi, débité normalement. 🔧 **Mécanisme** : colonne `resend_of` sur `letter_sends` (référence l'envoi original) ; `consume_send` saute le débit quand `resend_of` pointe un envoi débité et terminé en `failed_address` ; garde anti-abus : **un seul re-envoi gratuit par original** (index unique partiel) — infalsifiable puisque les statuts ne s'écrivent que par RPC (§3.5). Requalification des canaux des 10 templates (les 5 `lre` → `papier` ; les 2 `email` restent ; les 3 `portail` restent) — le test de parité protège les jumeaux. FR/EN pour toute l'UI ; les courriers restent en français.

## 8. Sécurité & RGPD

- RLS : `letter_sends` mutations par RPC uniquement (§3.5) ; `attachments`/Storage owner-only + URLs signées courtes ; `organisations` en lecture seule.
- Le provider reçoit le courrier complet (nécessaire à l'impression) → **MySendingBox entre dans la liste DPA du chantier transverse** ; DPA à obtenir avant tout envoi réel (user step). Maileva ajouté si bascule.
- Aucune donnée nouvelle vers Mistral (le rédacteur ignore le département).
- La **relecture juridique** (user step bloquant existant) couvre désormais aussi les corps des courriers : l'envoi papier réel aggrave le risque d'un texte erroné vs l'email. Aucun envoi réel en prod avant cette relecture.
- Achat en période de vulnérabilité (P11 produit) : prix de l'envoi à l'acte affiché avant tout Checkout, pas de dark pattern, remboursement via Dashboard (D4 chantier 1).

## 9. Tests

Extension de la suite (🔧 ~199 tests actuels / 19 fichiers, tous conservés) : moteur + catalogue (nouvelle question, exemption « données » de l'invariant), annuaire (seed, résolution `network+department`, entrées vérifiées datées), `paperSender` mocké (contrat, erreurs, 503 sans clé), routes (supertest : gating, quota épuisé → offre à l'acte, kill switch OFF → refus, plafonds), RPC (transitions valides/invalides, double débit impossible, solde), webhook provider (signature invalide, idempotence par événement, persistance avant ack), uploads (magic bytes, taille, types refusés). E2E préprod : clé **test** MySendingBox (🔧 rendu PDF + `letter.created` seulement — le cycle aval se valide aux 2-3 envois réels du user step 3), `PAYMENTS_ENABLED=true` + carte test Stripe pour l'achat à l'acte.

## 10. User steps (Arnaud)

1. **Début d'exécution** : compte MySendingBox (self-service) → clé test dans `.env` préprod/local. Engager le contact Maileva en parallèle.
2. **Avant les E2E préprod** : push des migrations sur la préprod (y compris `purchases` du chantier 1, toujours en attente) + `PAYMENTS_ENABLED=true` préprod + tarif Stripe « envoi supplémentaire » (mode test) → env.
3. **Avant tout envoi réel (prod)** : grille tarifaire écrite + confirmation HT/TTC, DPA art. 28 signé, test réel de 2-3 courriers vers une adresse contrôlée, relecture juridique des corps de courriers, clé live + `PAPER_SENDS_ENABLED=true` en dernier geste.

## 11. Hors scope du lot 2a (rappel)

Écran d'envoi groupé « moment magique », unification des statuts de démarche et relances J+15 (**lot 2b** — la formule d'idempotence `dedup_key` sera revue à ce moment-là pour permettre la relance d'un même courrier) ; LRAR + AR probant + éventuelle file de validation (**lot 2c**) ; antivirus, rétention, journal d'accès du coffre (**chantier 3**) ; portails améliorés (2b) ; LRE (backlog roadmap).
