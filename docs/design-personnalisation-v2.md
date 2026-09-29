# Design — Personnalisation v2 : courriers pré-remplis et questionnaire enrichi

> Rédigé le 2026-09-28. Brainstorming avec Arnaud le même jour : 5 décisions de cadrage et 3 sections de design validées une à une (§2). Sources : exploration du code `integration/v2-demo` (tag `preprod-v2-rc3`), roadmap technique v2.0 (Drive, 15/09/2026 — source de vérité), spec du lot 2a (`docs/design-chantier-2a-envoi-papier.md` §3.1, dont une promesse n'a jamais été tenue, cf. §3).
> **Branche** : `feature/v2-personnalisation`, créée depuis `integration/v2-demo` (rc3, `aaa0603`) + la refonte de la sidebar reprise de `pre-prod` (`f9902e7`, patch identique à `96e8d98`). Branche éphémère, mergée localement dans `integration/v2-demo` après la revue finale ; Arnaud pushe.
> **Hors déploiement** : rien n'est poussé ni déployé par ce chantier. La v2 n'est encore ni en préprod ni en prod.

## 1. Objectif

Trois résultats, dans cet ordre :

1. **Les courriers se remplissent tout seuls.** Tout ce que Seren sait déjà (identité saisie par la pompe funèbre, réponses au questionnaire) ou qu'elle demande **une seule fois** (adresse de la famille, date de naissance du défunt) remplit chaque courrier. Il ne reste à saisir que ce qui est propre à un organisme : son nom et, selon le courrier, un numéro de contrat ou d'abonné.
2. **La roadmap est vraiment personnalisée.** Le questionnaire apprend les abonnements et comptes du défunt, les aides qu'il percevait et sa vie en EHPAD, et la roadmap n'affiche que les démarches qui le concernent, avec un courrier prêt quand un courrier est utile. Le plafond de 15 questions vues est respecté.
3. **Une vidéo démo v3** filme le vrai produit avec ces nouveautés.

## 2. Décisions actées (Arnaud, 2026-09-28)

| # | Sujet | Décision |
|---|---|---|
| D1 | Base de code | v2 rc3 + refonte sidebar (et non `main`) : modèle PF, produit de la vidéo, seule base qui a déjà le nom de famille, le défunt et l'adresse en base |
| D2 | Thèmes du questionnaire | Les 4 : **abonnements**, **vie numérique** (dans la même question), **EHPAD / résidence** (nouvelle option de la question logement), **aides perçues** (2ᵉ nouvelle question) |
| D3 | Saisie unique | À la **fin du questionnaire** : écran « Vos coordonnées pour les courriers » après le récapitulatif |
| D4 | Vidéo | **Captation réelle** du produit en local (Playwright), sans bandeau de sous-titres, script de voix-off à part |
| D5 | Architecture des données | **Approche 1** : `sender_profiles` devient le profil courrier unique (+ `first_name`, `last_name`), date de naissance du défunt dans les réponses du questionnaire, RPC en lecture seule `my_dossier_identity()` |
| D6 | Section 1 — pré-remplissage | Validée telle que décrite au §4 |
| D7 | Section 2 — questions, étapes, courriers | Validée telle que décrite aux §5 et §6 |
| D8 | Section 3 — vidéo et livraison | Validée telle que décrite aux §8 et §9 |

## 3. Constat (état de rc3)

- `useLetterGenerator` sait pré-remplir `user_firstname`, `user_lastname`, `user_address`, `user_relation` via son option `userProfile`, mais `StepLetterSection` (`src/components/dashboard/RoadmapView.tsx`) ne la lui passe jamais. La spec 2a (§3.1) l'annonçait (« jamais branché — on le branche ») : ce n'a pas été fait. Résultat : ces 4 champs sont vides à chaque courrier.
- Les données existent pourtant : `dossiers.family_first_name` / `family_last_name` (saisis par la PF, obligatoires au formulaire), `sender_profiles` (adresse d'expéditeur, saisie seulement au premier envoi papier), `relation` (questionnaire).
- `deceased_dob` (« né(e) le … ») figure dans 5 des 10 courriers mais n'est collectée nulle part.
- `city` (« {ville}, le {date} ») est une saisie manuelle à chaque courrier.
- Le questionnaire redemande prénom, nom et date de décès du défunt, déjà saisis par la PF (`dossiers.deceased_first_name`, `deceased_last_name`, `deceased_death_date`, tous obligatoires). `dossiers` est en RLS deny-all ; la famille n'en lit que `deceased_first_name`, via `my_account()`.
- Le questionnaire compte 16 questions, au-dessus du plafond UX de 15 de `docs/design-questionnaire-v2.md` (dépassé depuis l'ajout du département au 2a).
- Les abonnements se résument à 3 étapes génériques affichées à tous (`logement-resiliation-energies`, `logement-resiliation-telecom`, `numerique-abonnements`) ; `numerique-reseaux-sociaux` et `numerique-boite-email` sont aussi universelles. Aucune ne dépend d'une réponse.

## 4. Pré-remplissage

### 4.1 Sources de données

| Variable de courrier | Source (par priorité) | Collecte |
|---|---|---|
| `deceased_firstname`, `deceased_lastname`, `deceased_dod` | réponses du questionnaire | pré-remplies depuis le dossier PF au démarrage du questionnaire (§4.3), modifiables au récapitulatif |
| `deceased_dob` | réponses du questionnaire (`deceased_dob`, ISO) | écran de coordonnées, facultatif (§4.4) |
| `user_firstname`, `user_lastname` | `sender_profiles.first_name` / `last_name`, sinon dossier PF (`family_first_name` / `family_last_name`) | écran de coordonnées, pré-rempli depuis le dossier |
| `user_relation` | `sender_profiles.relationship`, sinon « partenaire de PACS » si `relation = pacse` (seule forme sans ambiguïté de genre), sinon vide | écran de coordonnées : forme exacte proposée d'après `relation` (§4.6) |
| `user_address` | `sender_profiles` : `address_line1`, `address_line2` (si présente), `postal_code city`, joints par « , » sur une ligne | écran de coordonnées |
| `city` | `sender_profiles.city` | écran de coordonnées |
| `today_date` | date du jour (inchangé) | — |
| `organisme_name`, numéros de contrat ou d'abonné | — | saisis dans chaque courrier (inchangé) |

### 4.2 Données — une seule migration

Fichier `supabase/migrations/20260928120000_personnalisation.sql` :

- `sender_profiles` : ajout de `first_name text` et `last_name text`, nullables (les lignes existantes n'en ont pas), chacune avec `check (char_length(...) <= 45)`. `full_name` reste `not null` et reste la donnée lue par l'envoi papier : le client l'écrit `first_name || ' ' || last_name` à chaque enregistrement. RLS inchangée (owner).
- Fonction `public.my_dossier_identity()` : `security definer`, `set search_path = ''`, noms qualifiés, `stable`, `revoke all from public, anon, authenticated` puis `grant execute to authenticated` (conventions de `20260915200000_v2_core.sql`). Retourne un `jsonb` `{ family_first_name, family_last_name, deceased_first_name, deceased_last_name, deceased_death_date }` du dossier de `auth.uid()` au statut `active` ou `closed` (le plus récemment activé), ou `null` si aucun. Lecture seule, aucune autre colonne (ni e-mail, ni téléphone, ni partenaire, ni montants).
- Le fichier est ajouté à la liste `FILES` de `tests/migrations-v2-lint.test.ts` pour hériter de ses contrôles.
- Scénarios SQL ajoutés à `scripts/sql-scenarios-v2.sql` : une famille obtient son dossier et seulement le sien ; une famille sans dossier actif obtient `null` ; un compte PF obtient `null` ; `anon` ne peut pas exécuter la fonction ; les colonnes retournées sont exactement les 5 attendues.

### 4.3 Questionnaire pré-rempli

- `POST /api/questionnaire/start`, après `createSession` : appel `rpc('my_dossier_identity')` avec le client au jeton utilisateur. Chaque valeur présente est validée par `validateAnswer` contre la spec de sa question, puis appliquée par `setAnswer`, et les réponses sont sauvées (`saveAnswers`) **avant** `renderNext`. Le moteur saute alors naturellement les 3 questions (`nextQuestion` ignore les réponses présentes).
- Une valeur invalide ou absente est ignorée : la question correspondante est posée normalement.
- Échec de la RPC : on continue sans pré-remplissage (dégradation, pas un contrôle d'accès). Log sans PII + capture Sentry.
- Le récapitulatif (`buildRecap`) affiche déjà toute réponse présente : l'identité pré-remplie y apparaît et reste modifiable par `/reask`.
- `/resume` inchangé : une session démarrée avant ce chantier continue sans pré-remplissage.
- Minimisation Mistral inchangée : le rédacteur ne reçoit que le prénom (déjà le cas), jamais le nom ni la date.

### 4.4 Écran « Vos coordonnées pour les courriers »

- Nouvelle phase `coordinates` dans `QuestionnairePage` : `recap` → confirmation → `completing` (inchangé : `/complete`, insertion de `questionnaires`, `generateRoadmap`, `saveRoadmapToDb`) → **`coordinates`** → `done`. La roadmap est enregistrée **avant** l'écran : fermer l'onglet ne perd rien.
- Titre « Dernière étape : vos coordonnées pour les courriers ». Sous-titre : elles pré-remplissent tous les courriers et restent modifiables dans Profil.
- Champs (via le formulaire unique, §4.5) :
  - prénom, nom : pré-remplis depuis `my_dossier_identity()` ;
  - lien, sous la forme « Vous signez en tant que » (§4.6) ;
  - adresse ligne 1, ligne 2 (facultative), code postal, ville ;
  - date de naissance de {prénom du défunt} (facultative).
- Validation :
  - règles actuelles de `SenderProfileForm` : 45 caractères par ligne, code postal `^[0-9]{5}$` ;
  - `first_name + ' ' + last_name` ≤ 45 caractères (contrainte d'enveloppe), sinon message dédié ;
  - date de naissance entre le 1900-01-01 et la date de décès.
- Boutons : « Enregistrer et voir mon parcours » (upsert `sender_profiles`, puis fusion de `deceased_dob` dans `questionnaires.answers` de la ligne insérée à la phase `completing`, par une mise à jour du client RLS, comme `deceased_department` aujourd'hui), et « Plus tard » (va directement à `done`).
- En cas d'erreur d'enregistrement : message, nouvelle tentative, ou « Plus tard ».
- **Filet** : tant que la famille n'a pas de ligne `sender_profiles`, l'accueil du tableau de bord affiche une carte discrète « Complétez vos coordonnées pour pré-remplir vos courriers », avec un lien vers Profil. Les courriers continuent de demander les champs manquants, comme aujourd'hui.
- Cet écran est hors session questionnaire : aucune de ces données ne passe par le serveur du questionnaire ni par Mistral.

### 4.5 Un formulaire unique

`SenderProfileForm` (`src/components/letter/`) devient `LetterProfileForm` :
- prénom et nom séparés (au lieu de `full_name`) ;
- sélecteur de lien (§4.6) ;
- date de naissance du défunt affichée seulement si le composant appelant l'active (option `withDeceasedDob` : écran de coordonnées et Profil, pas le panneau d'envoi) ;
- enregistrement `full_name = first_name + ' ' + last_name`.

Trois usages :
1. écran de coordonnées (édition directe) ;
2. panneau d'envoi papier (`PaperSendPanel`, lecture puis « Modifier », comportement actuel ; désormais déjà rempli, donc plus rien à retaper) ;
3. page Profil, nouvelle carte « Vos coordonnées pour les courriers ».

Profil n'affiche plus « Prénom : non renseigné » : le prénom vient de `sender_profiles`, sinon du dossier.

### 4.6 Lien de parenté dans les courriers

Les courriers sont toujours en français. `relation` indique qui était le défunt pour l'utilisateur ; le courrier écrit ce qu'est l'utilisateur pour le défunt.

| `relation` (réponse) | Choix proposés « Vous signez en tant que » |
|---|---|
| `conjoint_marie` | époux · épouse |
| `pacse` | partenaire de PACS (préselectionné) |
| `concubin` | concubin · concubine |
| `parent` (le défunt était mon père ou ma mère) | fils · fille |
| `enfant` (le défunt était mon fils ou ma fille) | père · mère |
| `frere_soeur` | frère · sœur |
| `autre` | saisie libre (ex. « neveu », « petite-fille ») |

En interface anglaise, chaque option affiche le mot français suivi d'une glose (« fille — daughter »). La valeur enregistrée dans `sender_profiles.relationship` est le mot français.

### 4.7 Branchement des courriers

- Nouveau module pur `src/lib/letter-autofill.ts` : `buildLetterAutofill({ profile, dossier, answers })` retourne `{ userProfile, questionnaireData }` au format de `LetterGeneratorOptions` (champ `city` ajouté à `userProfile`), selon les priorités du §4.1. Aucun accès réseau, testé unitairement.
- `useLetterGenerator` : nouveau cas `city` ; `VAR_CITY` passe à `auto_filled: true` (le champ disparaît du formulaire quand il est rempli). `deceased_dob` / `deceased_dod` restent formatées par `formatDate` (« 14 mars 1946 »).
- `DashboardPage` charge, **avant le premier rendu de la roadmap**, la ligne `sender_profiles` et `my_dossier_identity()` en plus des réponses déjà lues, puis passe le résultat de `buildLetterAutofill` à `RoadmapView` → `StepLetterSection` → `useLetterGenerator`. Ce chargement préalable est nécessaire, car `useLetterGenerator` fige ses valeurs initiales au montage.
- Aucun changement serveur pour le rendu : `server/lib/letter-render.js` régénère le corps à partir des variables reçues, qui sont simplement plus complètes.

## 5. Questionnaire enrichi

### 5.1 Parcours et plafond

Ordre du catalogue (`order` renuméroté) :
relation → *prénom, nom, date de décès du défunt (pré-remplis)* → département → situation professionnelle → logement → enfants → notaire → assurance vie → compte joint → véhicule → crédits → aide à domicile → **aides perçues** → contrat obsèques → **abonnements et comptes** → organismes déjà contactés.

Cela fait 18 questions au catalogue et **15 vues** pour tout dossier ouvert par une PF. Un dossier sans identité (cas hors PF) en verrait 18 ; ce cas est documenté et accepté. Nouveau test : aucun profil ne voit plus de 15 questions lorsque les 3 champs d'identité sont pré-remplis.

### 5.2 Nouvelle question `aides_percues` (multiselect, universelle)

Texte de repli : « Parmi ces aides, lesquelles {prenom} percevait ? ». Aide : les signaler évite de devoir rembourser des sommes versées après le décès, et certaines sont récupérées sur la succession. Réponse vide = aucune.

| Valeur | Libellé FR |
|---|---|
| `apa` | APA (allocation personnalisée d'autonomie) |
| `ash` | Aide sociale à l'hébergement (ASH), en EHPAD |
| `aspa` | Minimum vieillesse (ASPA) |
| `handicap` | AAH ou PCH (aides liées au handicap) |
| `aides_logement` | Aide au logement (APL, ALS) |

### 5.3 Nouvelle question `abonnements` (multiselect, universelle)

Texte de repli : « Parmi ces abonnements et comptes, lesquels étaient au nom de {prenom} ? ». Aide : cochez ce que vous connaissez ; une démarche vous aidera à repérer les autres prélèvements. Réponse vide = aucun connu.

| Valeur | Libellé FR |
|---|---|
| `presse` | Journaux ou magazines |
| `telephonie` | Téléphone mobile ou box internet |
| `sport_loisirs` | Salle de sport, club ou association |
| `streaming` | Streaming, musique ou vidéo (Netflix, Spotify, Canal+…) |
| `services_en_ligne` | Logiciels ou services en ligne payants (cloud, antivirus, applications) |
| `reseaux_sociaux` | Réseaux sociaux (Facebook, Instagram, LinkedIn…) |
| `email` | Boîte e-mail |
| `photos_documents` | Photos ou documents stockés en ligne (iCloud, Google Photos…) |

### 5.4 Option `ehpad` de la question `logement`

Nouvelle valeur `ehpad`, libellé « En EHPAD ou en résidence pour personnes âgées », insérée avant `heberge_ou_autre`.

### 5.5 Moteur : conditions sur une réponse à cocher

Sémantique étendue, identique dans `isApplicable` (`src/lib/roadmap-generator.ts`) et `matchesWhen` (`server/lib/questionnaire-engine.js`). Pour une condition en tableau :
- réponse tableau : vraie si au moins une valeur est commune ;
- réponse scalaire : appartenance (inchangé).

Les conditions booléennes ne changent pas. Le test de parité des deux matchers est étendu à des réponses tableau. `organismes_contactes` garde son mécanisme `organisme_key` (champ spécial, inchangé).

### 5.6 Contrat de données

`src/types/questionnaire.ts` :
- types `AidePercue` et `Abonnement` ;
- `Logement` reçoit `'ehpad'` ;
- `QuestionnaireAnswersV2` reçoit `aides_percues: AidePercue[]`, `abonnements: Abonnement[]` et `deceased_dob?: string` (champ d'identité, hors catalogue de questions) ;
- `ApplicableWhenV2` reçoit `aides_percues?: AidePercue[]` et `abonnements?: Abonnement[]`.

Côté serveur, les questions sont bilingues `{ fr, en }` (`fallback_text`, `aide`, `writer_hints`, libellés), comme les autres. Les dossiers déjà générés ne sont pas recalculés.

## 6. Étapes et courriers

### 6.1 Nouvelles étapes (catalogues FR et EN jumeaux)

| id | Titre FR | Thème | Urgence | Condition | Courrier |
|---|---|---|---|---|---|
| `abonnements-presse` | Résilier les abonnements presse | abonnements | month | `abonnements` ∋ presse | `resiliation-presse` |
| `abonnements-sport-association` | Résilier l'abonnement sportif ou l'adhésion à une association | abonnements | month | ∋ sport_loisirs | `resiliation-sport-association` |
| `abonnements-streaming` | Résilier les abonnements de streaming et de musique | abonnements | month | ∋ streaming | — (démarches en ligne) |
| `abonnements-services-en-ligne` | Résilier les logiciels et services en ligne payants | abonnements | month | ∋ services_en_ligne | — (en ligne) |
| `numerique-photos-documents` | Récupérer les photos et documents stockés en ligne | numerique | later | ∋ photos_documents | — |
| `logement-ehpad` | Libérer la chambre et clore le contrat de séjour | logement | week | `logement` = ehpad | `ehpad-fin-contrat` |
| `aides-departement` | Prévenir le département des aides qu'il versait | administratif | week | `aides_percues` ∋ apa, ash, handicap | `aides-departement` |
| `aides-recuperation-succession` | Anticiper la récupération de l'ASPA ou de l'aide sociale sur la succession | succession | month | ∋ aspa, ash | — (notaire) |
| `aides-logement` | Signaler le décès pour l'aide au logement | administratif | month | ∋ aides_logement | — |

Chaque valeur d'option des deux nouvelles questions déclenche au moins une étape (invariant « par valeur »).

### 6.2 Étapes existantes modifiées

- `logement-resiliation-telecom` : `{}` → `{ abonnements: ['telephonie'] }` + `letter_template_id: 'resiliation-telecom'`.
- `numerique-reseaux-sociaux` : `{}` → `{ abonnements: ['reseaux_sociaux'] }`.
- `numerique-boite-email` : `{}` → `{ abonnements: ['email'] }`.
- `logement-resiliation-energies` : `{}` → `{ logement: ['locataire', 'proprietaire'] }` (pas de contrat d'énergie au nom d'une personne en EHPAD ou hébergée).
- `numerique-abonnements` reste universelle mais devient le filet de sécurité : titre « Repérer les prélèvements encore actifs », texte centré sur les relevés bancaires.

### 6.3 Nouveau thème `abonnements`

Ajouté à l'union `StepTemplate['theme']`, aux `themeLabels` FR/EN (« Abonnements » / « Subscriptions »), à `THEME_ICONS` (`DocumentCard`, icône Lucide `Newspaper`) et au filtre de `DocumentsPage`.

### 6.4 Nouveaux courriers (5, tous en `papier`)

Chacun est ajouté à `src/data/letter-templates.ts` **et** à son jumeau `server/lib/letter-templates.js` avec `recipient_kind: 'user_specific'` : adresse saisie par la famille, le réseau n'étant pas dans l'annuaire. Parité texte, canal et variables garantie par `tests/letter-templates-server.test.ts`. Ton formel, français seulement, signature commune, « acte de décès joint ».

| id | Étape | Contenu demandé |
|---|---|---|
| `resiliation-presse` | `abonnements-presse` | résiliation immédiate de l'abonnement n° {abonné}, arrêt des prélèvements, remboursement des numéros non servis s'il y a lieu |
| `resiliation-telecom` | `logement-resiliation-telecom` | résiliation de la ligne ou de la box (n° client), sans frais pour motif de décès, facture de clôture, modalités de restitution du matériel |
| `resiliation-sport-association` | `abonnements-sport-association` | fin de l'abonnement ou de l'adhésion, arrêt des prélèvements, remboursement au prorata s'il y a lieu |
| `ehpad-fin-contrat` | `logement-ehpad` | fin du contrat de séjour, organisation de la libération de la chambre, facture finale dans les limites réglementaires, restitution du dépôt de garantie et des sommes versées d'avance |
| `aides-departement` | `aides-departement` | information du décès d'un bénéficiaire d'aides départementales (APA, aide sociale, PCH), arrêt des versements, montant éventuel à régulariser ; pour l'aide sociale, relevé des sommes avancées destiné au notaire |

Pour presse et télécom, le numéro d'abonné ou de client est une nouvelle variable **requise** (`subscriber_number`, libellé « Numéro d'abonné ou de client »), saisie dans le courrier. `VAR_ACCOUNT_NUMBER`, facultative, exportée mais inutilisée aujourd'hui, n'est pas réemployée : une variable facultative vide laisserait un « [LIBELLÉ] » dans un courrier envoyé.

### 6.5 Exigences de contenu

- **Sources officielles vérifiées au moment de la rédaction** et reportées dans `source_url` : service-public.fr, Légifrance, CNIL, pages « décès » officielles des plateformes. Faits à confirmer, avec leur référence présumée :
  - fin du contrat de séjour et plafond de facturation après le décès en EHPAD (art. L314-10-1 CASF) ;
  - récupération de l'ASPA sur la succession au-delà d'un seuil d'actif net (art. L815-13 CSS) ;
  - récupération de l'aide sociale à l'hébergement (art. L132-8 CASF) ;
  - non-récupération de l'APA (art. L232-19 CASF) et de la PCH ;
  - droits des héritiers sur les comptes en ligne (art. 85 loi Informatique et Libertés, fiche CNIL « mort numérique »).
  
  Un fait non confirmé par une source officielle n'est pas écrit.
- Écriture épicène, comme le lot L5 : `{prenom}` plutôt qu'un pronom.
- EN : traduction complète des étapes et des questions. Courriers en français seulement.
- **Relecture juridique** : les 9 nouvelles étapes, les 5 étapes modifiées et les 5 courriers rejoignent la relecture déjà bloquante avant l'ouverture de la vente. Le bandeau existant « Informations indicatives, en cours de relecture juridique » couvre les nouvelles étapes.

## 7. Tests et invariants

- **Unitaires**
  - `letter-autofill` : priorités du §4.1, adresse sur une ligne, lien PACS par défaut, champs absents.
  - Libellés de lien : table du §4.6.
  - `useLetterGenerator` : `city`, `VAR_CITY` automatique.
- **Moteur**
  - Sémantique tableau × tableau, dans les deux matchers, avec parité.
  - Validation des 2 multiselect et de la valeur `ehpad`.
  - Plafond de 15 questions vues avec pré-remplissage.
- **Routes** : `/start` avec pré-remplissage (3 questions sautées, récapitulatif complet), avec RPC en échec (questions posées), avec valeur invalide (ignorée). Mêmes patrons de mock que `tests/questionnaire-routes.test.ts`.
- **Invariants** (`tests/invariants.test.ts`, existants et étendus) :
  - chaque question et chaque valeur déclenche au moins une étape ;
  - chaque condition en tableau est une option valide ;
  - parité structurelle FR/EN ;
  - chaque `letter_template_id` d'étape existe, et `step_id` du courrier correspond ;
  - parité courriers client/serveur.
- **SQL** : scénarios de `my_dossier_identity()` (§4.2), linter de migrations.
- **Porte finale** : `npx tsc --noEmit`, suite Vitest complète verte, `npm run build`, rejeu local des migrations et des scénarios SQL.

## 8. Vidéo démo v3

- **Environnement** :
  - Docker, puis Supabase **local**, `db reset --local` (toutes les migrations, dont celle de ce chantier) ;
  - données de démo fictives (`scripts/seed-demo-v2.sql` + provisionnement des comptes) ;
  - app locale avec un fichier d'environnement pointé sur la base locale, vérifié par `scripts/check-env-target.mjs`. `.env.prod-NE-PAS-UTILISER` n'est jamais lu.
- **Personnages fictifs**, repris de la v2 : Pompes Funèbres Delmas ; Camille Roussel, fille de Bernard Roussel. Bernard vivait en EHPAD, percevait l'APA et l'ASH, était abonné à un quotidien régional fictif et avait un mobile, du streaming, des réseaux sociaux et des photos en ligne.
- **Scénario** (≈ 2 min 30, fondus entre séquences) :
  1. Écran-titre, avec la mention « personnes et pompe funèbre fictives ».
  2. La PF ouvre le dossier Roussel, ce qui montre l'origine des données pré-remplies.
  3. Activation et consentements de la famille (court).
  4. Questionnaire : l'identité du défunt n'est pas redemandée ; EHPAD, aides, abonnements ; le récapitulatif montre l'identité pré-remplie.
  5. Écran de coordonnées : nom déjà rempli, « fille » choisi, adresse tapée, date de naissance.
  6. Roadmap personnalisée : EHPAD, département, presse, télécom, streaming, photos.
  7. Courrier presse : seuls le titre du journal et le numéro d'abonné sont tapés ; aperçu ; panneau d'envoi papier avec l'expéditeur déjà rempli ; adresse du destinataire ; curseur sur « Envoyer ce courrier par la poste » **sans clic**, sauf si Arnaud fournit une clé **test** MySendingBox pour l'environnement local.
  8. Un 2ᵉ courrier (EHPAD) complet d'emblée.
  9. Écran de fin.
- **Technique** :
  - Playwright `recordVideo` en 1920×1080 ;
  - curseur visible en surimpression, frappe réelle avec délai ;
  - montage et encodage ffmpeg en MP4 H.264, 30 i/s, `faststart`.
  
  Le paquet npm `playwright` sera installé dans le scratchpad **après accord d'Arnaud** (téléchargement) ; les navigateurs sont déjà en cache et ffmpeg est installé.
- **Livrables** dans `~/Documents/git/Seren/demo-video/` : `seren-demo-v3.mp4`, `chapitres-v3.md` (repères exacts) et `voix-off-v3.md` (texte minuté). Les fichiers v2 restent intacts.
- **Critères** : aucune donnée réelle ; aucune requête vers une base distante ; durée entre 2 et 3 minutes ; chaque nouveauté (pré-remplissage du questionnaire, écran de coordonnées, étapes personnalisées, courrier auto-rempli, expéditeur déjà rempli) apparaît à l'écran ; défauts visibles consignés dans `chapitres-v3.md`, comme pour la v2.

## 9. Livraison

- **Documents** : spec (ce fichier), puis plan `docs/plan-personnalisation-v2.md`.
- **Exécution** par sous-agents : une tâche par sous-agent frais, revue de conformité à la spec puis revue qualité, correctifs systématiques, notes post-revue dans le plan. Revue finale de la branche, **puis** merge local (fast-forward) dans `integration/v2-demo` et tag `preprod-v2-rc4`.
- **La vidéo se tourne sur le code mergé** (rc4).
- **User steps (Arnaud)** :
  1. push de la branche et du tag ;
  2. `supabase db push` de `20260928120000_personnalisation.sql` en préprod, le jour où la v2 y est déployée ;
  3. relecture juridique des nouveaux contenus (§6.5) ;
  4. facultatif : clé test MySendingBox pour filmer le clic « Envoyer ».
- **Hors périmètre** :
  - accord « soussigné / soussignée » dans les modèles ;
  - mémorisation du nom d'un organisme d'un courrier à l'autre ;
  - nom de l'organisme pré-rempli depuis l'annuaire ;
  - toute modification du formulaire PF ;
  - recalcul des roadmaps déjà générées ;
  - tout déploiement.

## 10. Risques

| Risque | Parade |
|---|---|
| Contenu quasi juridique inexact | Sources officielles obligatoires, fait non sourcé = non écrit, relecture juridique bloquante avant la vente, bandeau existant |
| Valeurs de courrier figées avant le chargement du profil | Chargement complet dans `DashboardPage` avant le rendu de la roadmap (§4.7) |
| Divergence de parité (FR/EN, client/serveur, matchers) | Tests de parité existants, étendus plutôt que contournés |
| La v2 reste une branche non déployée qui grossit | Aucun fichier de `main` ou `pre-prod` touché hors refonte sidebar déjà présente en préprod ; le merge futur de la v2 embarque tout |
| Environnement local de tournage (Docker, harnais SQL) | Harnais documenté dans `docs/plan-v2-sql.md` Task 0 ; garde anti-prod vérifiée avant chaque lancement |

## 11. Notes post-implémentation (2026-09-29)

Ces notes **font foi** là où le code livré s'écarte du texte ci-dessus. Le détail, avec commits et justifications, est dans les notes post-revue de chaque tâche de `docs/plan-personnalisation-v2.md`.

### Données
- **Deux migrations au lieu d'une (§4.2, §9)**, pour respecter le lint des migrations v2 :
  - `20260928120000_sender_profiles_names.sql` : prénom et nom, CHECK `char_length(btrim(…)) between 1 and 45`, donc non vides ;
  - `20260928121000_v2_dossier_identity.sql` : la RPC.
- **Pas d'`order by` dans la RPC** : l'index unique et la contrainte d'état garantissent au plus un dossier `active`/`closed` par compte.
- **USER STEP** : `db push` des deux migrations **avant** le déploiement du front.

### Questionnaire (§5)
- **`logement` devient à choix multiples** (`min_selected: 1`). L'option `ehpad` couvre « EHPAD ou résidence pour personnes âgées » ; le plafond de 6 jours est propre à l'EHPAD, les résidences relevant du contrat ou du bail.
- **`aides_percues`** : AAH et PCH sont deux options distinctes, au lieu d'une option « handicap ».
- **Minimisation (données de santé et de handicap)** : `aides_percues` et `logement` sont exclus du contexte du rédacteur Mistral (`WRITER_EXCLUDED_IDS`).
- **Libellés** : téléphonie « Téléphone (fixe ou mobile) ou box internet » ; l'étape photos est à faire « dans le mois ».
- **Plafond** : les 15 questions vues sont atteintes exactement (18 au catalogue, 3 pré-remplies). Une nouvelle question universelle ferait échouer l'invariant.
- **Récapitulatif** : dates en JJ/MM/AAAA en français, « 5 March 2026 » en anglais.

### Courriers et pré-remplissage (§4, §6)
- **Destinataires et saisie** : numéro d'abonné obligatoire ; libellé « numéro client ou de ligne » pour la téléphonie ; destinataires « À l'attention du … — {organisme} ».
- **Pièce jointe** : si le courrier annonce l'acte de décès sans pièce jointe, un avertissement s'affiche, sans bloquer l'envoi.
- **Dates des courriers** : les dates seules sont formatées en UTC, sinon elles glissent à la veille en outre-mer. Une date invalide donne `''`, jamais « Invalid Date ».
- **Resynchronisation ciblée des champs auto** (`createAutoSync`) : seule une valeur dont la source change est réappliquée. Une correction manuelle survit à un changement sans rapport.
- **Lien de parenté** :
  - normalisé, casse et accents ignorés (« Fille » → « fille »), à l'enregistrement comme à la lecture ;
  - un lien hors des formes proposées passe en saisie libre, `autocapitalize="none"`.
- **Écriture des réponses** : `patchQuestionnaireAnswers`, qui relit avant d'écrire, n'écrit rien si rien ne change et exige une ligne touchée. Elle sert à la date de naissance et au département.
- **Défunt** : une seule source, `buildLetterAutofill` (réponses puis dossier), pour les courriers, le contexte et le Profil.

### Formulaire, écrans, tableau de bord (§4.4, §4.5, §4.7)
- **Accessibilité** :
  - erreurs reliées aux champs (`aria-invalid`, `aria-describedby`) ;
  - rôles alert et status ;
  - vrai `<form>`, la touche Entrée soumet ;
  - focus donné au titre des écrans et aux bascules, mais **jamais volé** (`focusIfIdle`) ;
  - contraste AA.
- **Mobile** : les boutons longs passent à la ligne ; l'écran de fin repart du haut.
- **Contrat `onSaved`** : en `panel`, dès que le profil est en base ; en `screen`, après le succès complet.
- **Carte de rappel** : affichée si `!profile?.first_name` (`needsLetterProfileReminder`), profils 2a compris. Le Profil a sa propre aide (`profileHint`, `showHeader={false}`).
- **Lectures non bloquantes** : `nullOnError` signale l'échec à Sentry au lieu de l'avaler.
- **Retour sur l'onglet** : il ne provoque plus de relecture (effets dépendants de `userId`). auth-js émet un nouvel objet `user` à chaque retour.

### Tests et recette
- **955 tests** à rc4. Les attentes à délai fixe ont été remplacées par des attentes déterministes (tests de garde d'accès, format de date, relance papier).
- **Recette navigateur 23/23** sur base locale, note d'exécution de la Task 11.

### Hors périmètre, confiés à des tâches séparées
- **Typographie des courriers et de l'interface** : élision « d’ » (« de Odette » → « d’Odette »), « 1er » ;
- **Débordements mobiles** : en-tête de page, bouton du récapitulatif ; contraste des avertissements du 2a ;
- **Focus entre les questions** ;
- **Idempotence de `saveRoadmapToDb`** ;
- **Identité de `user`** dans `useAuth` ; erreur de lecture confondue avec « pas de roadmap ».

Constats remontés à Arnaud :
- les champs `var-*` ont des ids dupliqués quand plusieurs courriers sont ouverts ;
- les `notes` des modèles de courrier restent en français dans l'interface anglaise.
