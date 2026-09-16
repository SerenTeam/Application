# Textes bêta v2 — CGU, confidentialité, données sensibles, art. 14, engagement PF, support

## 0. En-tête

**Objet.** Textes destinés à la bêta pilote du modèle v2 (la pompe funèbre partenaire ouvre le dossier de la famille) : conditions générales d'utilisation, politique de confidentialité, notice « données sensibles », information de l'article 14 du RGPD envoyée dans l'e-mail d'invitation, lettre d'engagement de la pompe funèbre partenaire avec sa clause de sous-traitance (art. 28), et informations de support.

**Date.** 2026-09-16. **Statut global : brouillon.** Ces textes n'ont pas encore été relus par un conseil juridique.

**Référence.** `docs/design-v2-demonstrateur.md` §9.2 (RGPD), §9.3 (risques résiduels assumés), §1.3 D3 et D8, §10.3 (conditions GNG6 (4) et (8), prérequis P6 à P8, P10).

**Deux validations distinctes, à ne pas confondre :**

| Validation | Qui | Quand | Ce qu'elle couvre |
|---|---|---|---|
| Ton et offre | Arnaud, 10 min | créneau U2 (mer. 16/09, 12h30-13h25) | grille §7 : lisibilité, justesse de l'offre, formulations |
| Relecture juridique | conseil juridique | **hors créneau, échéance jeudi 12h** (P7) | CGU, confidentialité, données sensibles, art. 14 — condition **GNG6 (4)** |

**Informations à fournir par Arnaud — liste fermée.** Sans elles, les textes restent des brouillons et ne peuvent pas être publiés :

| # | Information | Valeur retenue (à confirmer) |
|---|---|---|
| A | Dénomination et forme sociale de Seren | *à fournir* |
| B | SIREN | *à fournir* |
| C | Adresse du siège | *à fournir* |
| D | Directeur de la publication | *à fournir* |
| E | Adresse du support (H9, P10) | `support@seren-app.fr` — boîte à relever (défaut retenu) |
| F | Durée de conservation retenue | proposition : **12 mois après la dernière connexion**, alignée sur la purge à 1 an prévue au chantier T |
| G | Durée de la phase pilote PF | *à fournir* (proposition : 3 mois à compter de la signature) |
| H | Conditions tarifaires hors pilote | *à fournir* (référence : 220 € TTC facturés par Seren à la PF par dossier) |

Dans les textes ci-dessous, ces valeurs apparaissent en `[A]`, `[B]`, … tant qu'elles ne sont pas fournies.

Statut : brouillon bêta — à valider (U2) — relecture juridique requise avant ouverture prod

---

## 1. Conditions générales d'utilisation (bêta)

### 1.1 Objet

Seren est un service en ligne qui aide les proches d'une personne décédée à identifier et à réaliser les démarches administratives qui suivent un décès. Le service propose un questionnaire, une liste personnalisée de démarches, des modèles de courriers pré-remplis et, lorsque cette fonction est ouverte, leur envoi postal.

Le service est édité par `[A]`, SIREN `[B]`, dont le siège est `[C]`. Directeur de la publication : `[D]`.

Ces conditions s'appliquent à la **version bêta** du service, ouverte à un nombre limité de familles.

### 1.2 Accès sur invitation

L'accès à Seren est ouvert par une pompe funèbre partenaire, à l'occasion de l'organisation des obsèques. La pompe funèbre crée le dossier et Seren envoie à la personne désignée un e-mail contenant un lien d'activation personnel, **valable 7 jours**.

Le compte est personnel. Le lien d'activation ne doit pas être transféré. Une fois le mot de passe choisi, l'accès n'est plus limité dans le temps.

Si le lien a expiré, la pompe funèbre peut en envoyer un nouveau. Si l'adresse e-mail est déjà utilisée par un compte existant, il faut se connecter à ce compte ou écrire au support (`[E]`).

### 1.3 Version bêta : informations indicatives

Seren est en version bêta. Les informations affichées, la liste des démarches et les modèles de courriers sont **indicatifs** et **en cours de relecture juridique**. Ils ne remplacent pas l'avis d'un professionnel (notaire, avocat, conseiller) ni les informations officielles des organismes.

Avant toute démarche engageante, il revient à l'utilisateur de vérifier auprès de l'organisme concerné les pièces attendues, les délais et les conditions. Un bandeau le rappelle sur la liste des démarches.

### 1.4 Envois postaux

L'accompagnement comprend **10 envois postaux**, réalisés pour le compte de l'utilisateur par un prestataire d'impression et d'affranchissement.

- Le contenu du courrier est produit à partir d'un modèle et des informations saisies par l'utilisateur. **L'utilisateur reste responsable de ce qu'il envoie** : il lui appartient de relire le courrier avant de demander l'envoi.
- **Un courrier envoyé ne peut plus être modifié ni rappelé.** La demande d'envoi est définitive.
- Les envois sont décomptés des 10 envois inclus. Une fois ces envois utilisés, le service affiche un message invitant à contacter le support ; aucun paiement n'est proposé dans l'application pendant la bêta.
- Seren n'est pas responsable des délais d'acheminement postal, ni des suites données par les organismes destinataires.
- Lorsque la fonction d'envoi n'est pas ouverte, le courrier reste téléchargeable en PDF pour un envoi par l'utilisateur lui-même.

### 1.5 Ce que la pompe funèbre voit, et ne voit pas

La pompe funèbre qui a ouvert le dossier voit :

- l'identité et les coordonnées qu'elle a elle-même saisies (prénom, nom, e-mail, téléphone éventuel de la personne accompagnée) ;
- le prénom, le nom et la date de décès du défunt, qu'elle a également saisis ;
- l'état du dossier : invitation envoyée, invitation expirée, accès activé, dossier annulé, avec les dates correspondantes.

La pompe funèbre **ne voit jamais** : les réponses au questionnaire, la liste des démarches et leur avancement, le contenu des courriers, les documents déposés, les envois réalisés et leur suivi.

Cette séparation est appliquée par le service lui-même, et non par une simple règle d'affichage.

### 1.6 Responsabilité

Seren s'engage à mettre en œuvre les moyens raisonnables pour que le service soit disponible et pour que les informations proposées soient exactes et à jour. Il s'agit d'une **obligation de moyens**.

Seren ne fournit **ni conseil juridique, ni conseil fiscal, ni conseil en investissement**. Le service n'effectue aucune démarche à la place de l'utilisateur en dehors des envois postaux qu'il demande expressément.

Le service peut être interrompu pour maintenance ou pour corriger un défaut, en particulier pendant la phase bêta.

### 1.7 Données personnelles

Le traitement des données personnelles est décrit dans la **politique de confidentialité** (section 2), qui fait partie intégrante des présentes conditions.

### 1.8 Fin d'utilisation et effacement

L'utilisateur peut cesser d'utiliser le service à tout moment et demander l'effacement de son compte et de ses données en écrivant à `[E]`. La demande est traitée **sous 30 jours**.

Sont alors supprimés : le compte, les réponses au questionnaire, les démarches, les courriers, les documents déposés et l'historique des envois. Seren conserve une trace du dossier **sans aucune donnée d'identification** (pompe funèbre émettrice, dates, montants), nécessaire à sa facturation et à ses obligations comptables.

### 1.9 Droit applicable

Les présentes conditions sont soumises au **droit français**. En cas de différend, une solution amiable sera recherchée avant toute action contentieuse. À défaut, les tribunaux français sont compétents.

### 1.10 Contact

Pour toute question sur le service, sur vos données ou pour demander l'effacement de votre compte : `[E]`. Réponse sous 5 jours ouvrés.

Statut : brouillon bêta — à valider (U2) — relecture juridique requise avant ouverture prod

---

## 2. Politique de confidentialité (bêta)

### 2.1 Responsable de traitement

`[A]`, SIREN `[B]`, `[C]`, est responsable du traitement des données décrites ci-dessous. Contact : `[E]`.

### 2.2 Données reçues de la pompe funèbre

Pour ouvrir votre accompagnement, la pompe funèbre transmet à Seren :

- votre **prénom**, votre **nom**, votre **adresse e-mail** et, le cas échéant, votre **numéro de téléphone** ;
- le **prénom**, le **nom** et la **date de décès** de votre proche.

Vous en êtes informé dès le premier message que Seren vous adresse (section 4).

### 2.3 Données que vous saisissez

Dans le service, vous fournissez : vos **réponses au questionnaire** (situation familiale, logement, ressources, patrimoine du défunt), l'**avancement de vos démarches**, le **contenu des courriers** et leurs variables, votre **adresse d'expéditeur**, et les **documents** que vous déposez — dont l'acte de décès lorsqu'il doit être joint à un envoi.

### 2.4 Finalités et bases légales

| Finalité | Base légale |
|---|---|
| Créer votre accès et vous accompagner dans vos démarches | exécution du service proposé par votre pompe funèbre |
| Préparer, produire et envoyer vos courriers | exécution du service |
| Traiter les informations sensibles nécessaires à ces démarches (décès, situation familiale, patrimoine) | **consentement explicite** (art. 9.2.a du RGPD), recueilli à l'ouverture de votre accès |
| Assurer la sécurité et le bon fonctionnement technique | intérêt légitime |

### 2.5 Destinataires et sous-traitants

| Sous-traitant | Rôle | Localisation |
|---|---|---|
| Supabase | base de données et authentification | Union européenne (eu-west-1, Irlande) |
| Render | hébergement de l'application | Union européenne (région européenne du service) |
| Resend | envoi des e-mails d'invitation et de réinitialisation de mot de passe | **à vérifier** |
| MySendingBox | impression, mise sous pli et affranchissement des courriers | **à vérifier** |
| Sentry | remontée des erreurs techniques, sans données personnelles (jetons et contenus retirés avant envoi) | Union européenne |
| PostHog | mesure d'audience, **uniquement après acceptation des cookies** | Union européenne |

**Point à vérifier par Arnaud avant publication** : la localisation exacte des traitements de **Resend** et de **MySendingBox**, et, en cas de traitement hors Union européenne, l'encadrement des transferts (clauses contractuelles types ou décision d'adéquation).

Vos données ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires.

### 2.6 Ce que la pompe funèbre ne reçoit pas — et ce qu'aucune IA ne reçoit

La pompe funèbre qui a ouvert votre dossier **n'a accès à aucun contenu** : ni vos réponses, ni vos démarches, ni vos courriers, ni vos documents, ni vos envois (section 1.5).

Pendant la bêta, **aucune donnée n'est transmise à un modèle de langage** : la fonction de rédaction assistée est désactivée et les textes affichés sont écrits à l'avance.

### 2.7 Durée de conservation

Vos données sont conservées `[F]` (proposition : **12 mois après votre dernière connexion**), puis supprimées. Vous pouvez demander leur effacement avant ce terme (section 2.8).

Après effacement, Seren conserve la trace du dossier **sans donnée d'identification** (pompe funèbre, dates, montants), pour sa facturation et ses obligations comptables.

### 2.8 Vos droits

Vous disposez d'un droit d'**accès**, de **rectification**, d'**effacement**, d'**opposition**, de **limitation** et de **portabilité**, ainsi que du droit de **retirer votre consentement** au traitement des informations sensibles à tout moment (le retrait vaut demande d'effacement, le service ne pouvant plus fonctionner sans ces informations).

Pour exercer ces droits : `[E]`. Réponse sous 5 jours ouvrés, exécution sous 30 jours.

Vous pouvez également adresser une réclamation à la **CNIL** (cnil.fr, 3 place de Fontenoy, 75007 Paris).

### 2.9 Sécurité

Les échanges avec le service sont chiffrés (HTTPS). Chaque compte est **isolé des autres en base de données** par des règles appliquées par le serveur de base lui-même. Les documents que vous déposez sont stockés dans un espace **privé**, accessible uniquement depuis votre compte. Les accès techniques sont limités aux personnes qui en ont besoin, tenues à la confidentialité.

### 2.10 Limite connue de la bêta : dépôt de documents

Pendant la bêta, les documents déposés ne sont **pas analysés par un antivirus** (contrôle du type de fichier, taille limitée à 5 Mo, espace privé). Cette limite est assumée et documentée ; l'analyse antivirus et la politique de rétention sont prévues dans une version ultérieure.

**Recommandation : ne déposez que les pièces nécessaires à vos envois** (acte de décès notamment), et rien d'autre.

Statut : brouillon bêta — à valider (U2) — relecture juridique requise avant ouverture prod

---

## 3. Données sensibles

**Texte exact de la case à cocher** (clé `consent.sensitiveData`, écran `/bienvenue`) :

> J'accepte que Seren traite les informations sensibles nécessaires à mes démarches (décès, situation familiale, patrimoine)

**Notice — AFFICHÉE depuis le lot TEXTES.** La clé `consent.sensitiveDataNotice` existe en FR et en
EN, et `ConsentPage` la rend sous la case « données sensibles » (liée à la case par
`aria-describedby`). La réserve soulevée par L7 est levée : le texte soumis au conseil est bien
celui que l'utilisateur voit à l'écran.

> Ces informations sont celles que vous nous donnerez sur le décès, votre situation familiale et le patrimoine de votre proche. Elles servent uniquement à préparer vos démarches et à remplir vos courriers. Vous pouvez retirer votre accord à tout moment en demandant l'effacement de votre compte à `[E]`.

Le consentement est enregistré avec sa date et son numéro de version. Les trois cases (conditions d'utilisation, politique de confidentialité, données sensibles) sont **obligatoires** : sans elles, le service ne s'ouvre pas.

Statut : brouillon bêta — à valider (U2) — relecture juridique requise avant ouverture prod

---

## 4. Information art. 14 — e-mail d'invitation

> **Source unique : `server/lib/invitation-email.js`** (lot L2b). Toute modification demandée se fait dans `server/lib/invitation-email.js` (lot L2b, correctif P1) puis est recopiée ici. Les textes ci-dessous sont les gabarits rendus avec : pompe funèbre « Pompes Funèbres Démo », prénom « Claire », expiration « 23 septembre 2026 », support `support@seren-app.fr`, application `https://app.seren-app.fr`.

### 4.1 Français

**Objet :** `Pompes Funèbres Démo vous ouvre votre accompagnement Seren`

```
Bonjour Claire,

Pompes Funèbres Démo vous ouvre un accompagnement Seren pour vous aider dans les démarches administratives après le décès de votre proche. Cet accompagnement est compris dans les prestations de Pompes Funèbres Démo : vous n'avez rien à payer à Seren.

Pour activer votre accès, choisissez votre mot de passe en ouvrant ce lien personnel, valable 7 jours (jusqu'au 23 septembre 2026) :
https://app.seren-app.fr/activation#t=<jeton personnel>

Ce lien est personnel : ne le transférez pas.

Pourquoi recevez-vous ce message ?
Pour ouvrir ce service, Pompes Funèbres Démo a transmis à Seren votre prénom, votre nom, votre adresse e-mail et, le cas échéant, votre numéro de téléphone, ainsi que le prénom, le nom et la date de décès de votre proche. Seren utilise ces informations uniquement pour créer et préparer votre accompagnement (base : exécution du service proposé par Pompes Funèbres Démo). La durée de conservation est précisée dans notre politique de confidentialité.

Vos droits : vous pouvez demander l'accès à ces informations, leur rectification ou leur effacement, et vous opposer à leur utilisation, en écrivant à support@seren-app.fr. Vous pouvez aussi adresser une réclamation à la CNIL (cnil.fr).
Politique de confidentialité : https://app.seren-app.fr/security

Si vous ne souhaitez pas utiliser Seren, ignorez simplement ce message : sans activation, l'invitation expire le 23 septembre 2026.

L'équipe Seren
```

### 4.2 Anglais

**Subject :** `Pompes Funèbres Démo opens your Seren support`

```
Hello Claire,

Pompes Funèbres Démo is opening a Seren support account for you, to help with the administrative steps after the death of your loved one. This support is included in Pompes Funèbres Démo's services: you have nothing to pay to Seren.

To activate your access, choose your password by opening this personal link, valid for 7 days (until 23 September 2026):
https://app.seren-app.fr/activation#t=<personal token>

This link is personal: please do not forward it.

Why are you receiving this message?
To open this service, Pompes Funèbres Démo shared with Seren your first name, last name, email address and, where applicable, your phone number, as well as the first name, last name and date of death of your loved one. Seren uses this information only to create and prepare your support (basis: performance of the service offered by Pompes Funèbres Démo). The retention period is set out in our privacy policy.

Your rights: you can request access to this information, its rectification or erasure, and object to its use, by writing to support@seren-app.fr. You can also lodge a complaint with the CNIL (cnil.fr).
Privacy policy: https://app.seren-app.fr/security

If you do not wish to use Seren, simply ignore this message: without activation, the invitation expires on 23 September 2026.

The Seren team
```

**Contrôles tenus par le code** (tests L2b) : l'e-mail ne contient **ni le nom ni la date de décès du défunt**, aucune pièce jointe, et jamais le jeton en clair dans les journaux.

Statut : brouillon bêta — à valider (U2) — relecture juridique requise avant ouverture prod

---

## 5. Lettre d'engagement pilote — pompe funèbre partenaire

> ⚠️ **Condition GNG6 (8)** : sans cette lettre **signée**, `PARTNER_ACTIVATIONS_ENABLED` reste **absent** en production. Les gérants peuvent se connecter et voir leur espace, mais **aucun dossier famille ne peut être créé**.

**Entre les soussignés :**

`[A]`, SIREN `[B]`, dont le siège est `[C]`, ci-après « Seren »,

et

`<raison sociale de la pompe funèbre>`, SIREN `<…>`, dont le siège est `<…>`, représentée par `<nom, qualité>`, ci-après « le Partenaire ».

### 5.1 Objet et durée

Le Partenaire participe à la **phase pilote** du service Seren : il ouvre, pour les familles qu'il accompagne et avec leur accord oral, un accès Seren destiné aux démarches administratives qui suivent le décès.

**Pendant le pilote, Seren ne facture rien au Partenaire.** Durée du pilote : `[G]`. Au-delà du pilote, les conditions tarifaires sont celles de `[H]` ; elles ne s'appliquent qu'après accord écrit des deux parties.

### 5.2 Engagements du Partenaire

1. **Informer oralement la famille**, au moment de l'ouverture du dossier, que Seren lui ouvre un accompagnement et qu'elle recevra un e-mail d'activation.
2. **Saisir une adresse e-mail personnelle et exacte de la famille** — jamais une adresse contrôlée par le Partenaire, jamais une adresse générique de l'entreprise.
3. **Ne jamais transmettre, ouvrir ni utiliser le lien d'activation** envoyé à la famille. Ce lien vaut accès au compte.
4. **Annuler sous 48 heures** tout dossier ouvert par erreur, depuis son espace partenaire.
5. **Protéger les accès de ses gérants** (mots de passe personnels, non partagés) et **signaler à Seren sans délai** le départ d'une personne disposant d'un accès, afin que celui-ci soit fermé.
6. Ne saisir que les informations demandées par le formulaire, et rien d'autre.

### 5.3 Engagements de Seren

1. **Ne jamais donner au Partenaire accès au contenu du dossier** : réponses, démarches, courriers, documents, envois. Le Partenaire ne voit que ce qu'il a saisi et l'état d'activation.
2. **Informer la famille dès l'invitation**, conformément à l'article 14 du RGPD (section 4 du présent document).
3. Assurer la **sécurité** du service (isolation des comptes, chiffrement des échanges, stockage privé des documents) et le **support** des familles et du Partenaire.
4. **Prévenir le Partenaire** de tout incident de sécurité affectant les données qu'il a transmises.

### 5.4 Sous-traitance (article 28 du RGPD)

Pour les seules opérations réalisées **pour le compte du Partenaire** — réception des coordonnées de la famille et envoi de l'invitation —, Seren agit en qualité de **sous-traitant** du Partenaire, dans les conditions suivantes. Pour tout le reste du service (accompagnement de la famille après activation), Seren agit en qualité de **responsable de traitement**.

| # | Obligation (art. 28.3) | Engagement |
|---|---|---|
| a | **Objet et durée** | Réception des coordonnées de la famille et envoi de l'invitation, pendant la durée du pilote `[G]`. |
| b | **Nature et finalité** | Transmission d'une invitation nominative à la famille désignée par le Partenaire, et création de son accès. |
| c | **Types de données et catégories de personnes** | Prénom, nom, e-mail, téléphone éventuel de la personne accompagnée ; prénom, nom, date de décès du défunt. Personnes concernées : familles accompagnées par le Partenaire. |
| d | **Instructions documentées** | Seren ne traite ces données que sur instruction documentée du Partenaire (saisie du formulaire, demande de renvoi ou d'annulation), sauf obligation légale contraire, dont il informerait le Partenaire. |
| e | **Confidentialité** | Les personnes autorisées à traiter ces données chez Seren sont tenues à une obligation de confidentialité. |
| f | **Sécurité (art. 32)** | Isolation des comptes en base, chiffrement des échanges, jetons d'activation à usage unique et à durée limitée, accès techniques restreints, journalisation sans donnée personnelle. |
| g | **Sous-traitants ultérieurs** | Autorisation générale pour les sous-traitants listés en section 2.5. Seren informe le Partenaire préalablement de tout ajout ou remplacement, le Partenaire pouvant s'y opposer par écrit. |
| h | **Assistance aux droits des personnes** | Seren aide le Partenaire à répondre aux demandes d'accès, de rectification, d'effacement et d'opposition portant sur ces données. |
| i | **Violations de données** | Seren notifie au Partenaire toute violation affectant ces données **sans délai injustifié** après en avoir pris connaissance, avec les éléments utiles. |
| j | **Fin du contrat** | À la fin du pilote, et au choix du Partenaire, Seren supprime ou restitue les données traitées pour son compte, sous réserve des obligations légales de conservation et des données traitées par Seren en qualité de responsable de traitement. |
| k | **Informations et audits** | Seren met à disposition du Partenaire les informations nécessaires pour démontrer le respect de ces obligations et permet la réalisation d'audits, dans des conditions raisonnables et sans exposer les données d'autres partenaires ou familles. |

**Base légale de la saisie par le Partenaire, avant tout consentement de la famille** — *point à confirmer par le conseil juridique* : la saisie et la transmission des coordonnées de la famille reposent sur l'**intérêt légitime** du Partenaire à proposer un service d'accompagnement complémentaire à sa prestation, la famille étant informée oralement au moment de l'ouverture (§5.2-1) puis par écrit dès le premier e-mail (section 4), et pouvant s'opposer à tout moment.

### 5.5 Signatures

Fait en deux exemplaires, le `<date>`.

Pour Seren : `<nom, qualité, signature>` — Pour le Partenaire : `<nom, qualité, signature>`

Statut : brouillon bêta — à valider (U2) — relecture juridique requise avant ouverture prod

---

## 6. Support et effacement

**Adresse publiée** : `[E]` (défaut `support@seren-app.fr`), affichée sur l'écran « accès non activé », dans le message affiché quand les envois inclus sont épuisés, dans l'e-mail d'invitation et dans les pages `/legal` et `/security`.

**Délai de réponse annoncé** : 5 jours ouvrés.

**Demande d'effacement** : la procédure est manuelle pendant la bêta. Elle est décrite dans `docs/runbook-beta-prod.md` § « Effacement sur demande » et exécutée avec `scripts/erase-family.sql` (inventaire, suppression des documents déposés, anonymisation du dossier, suppression du compte, vérification). **Délai d'exécution : 30 jours**, conformément aux sections 1.8 et 2.8.

Chaque demande est tracée hors base (date de réception, date d'exécution, réponse envoyée).

Statut : brouillon bêta — à valider (U2) — relecture juridique requise avant ouverture prod

---

## 7. Grille de validation U2 — ton et offre (10 minutes)

> Cette grille ne porte **pas** sur la conformité juridique (prérequis P7, hors créneau, échéance jeudi 12h). Elle porte sur le ton, la justesse de l'offre et la clarté.

| Texte | Validé (oui/non) | Corrections demandées |
|---|---|---|
| 1. Conditions générales d'utilisation (1.1 à 1.10) | | |
| 2. Politique de confidentialité (2.1 à 2.10) | | |
| 3. Données sensibles (case + notice) | | |
| 4. Information art. 14 (e-mail d'invitation FR et EN) | | |
| 5. Lettre d'engagement pilote PF (dont clause art. 28) | | |
| 6. Support et effacement (adresse, délais) | | |
| Formulations du catalogue de questions (épicène, lot L5) | | |
| Textes d'offre : « Accès sans limite de durée », « 10 envois postaux inclus », « Proposé par {partenaire} » | | |
| Message « envois inclus épuisés » : « Vous avez utilisé les envois inclus dans votre accompagnement. Contactez le support pour tout envoi supplémentaire. » | | |
| Bandeau roadmap : « Informations indicatives, en cours de relecture juridique : vérifiez auprès de l'organisme concerné » | | |

**Informations attendues d'Arnaud** (section 0, `[A]` à `[H]`) : renseignées ☐ / partiellement ☐ / non ☐
