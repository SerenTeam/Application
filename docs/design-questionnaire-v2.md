# Design — Questionnaire v2 : machine à états + LLM rédacteur

> Document de conception destiné à un agent d'implémentation.
> Rédigé le 2026-07-08. Contexte projet : voir `CLAUDE.md`.
> Prérequis : `docs/plan-points-attention.md` §1 (migrations Supabase CLI) et §2 (table `questionnaire_sessions`).
> Remplace l'architecture décrite dans `docs/questionnaire-agent-prompt.md` (à archiver en phase 5).

## Objectif

Refondre le questionnaire conversationnel pour :
1. **Fiabilité** — supprimer structurellement le parsing fragile, les hallucinations d'options et les défauts silencieux à l'extraction
2. **Coût** — diviser ~10× la consommation de tokens Mistral
3. **Richesse** — enrichir le modèle d'information (9 → ~16 champs) et le catalogue (30 → ~50 étapes) pour des roadmaps réellement personnalisées

Le rendu conversationnel (ton empathique, personnalisation au prénom, transitions) est **conservé** — c'est le différenciateur produit.

## Décisions verrouillées (issues du brainstorming)

- **Inversion de contrôle** : le serveur possède le flux (machine à états) et les données ; le LLM ne fait que *rédiger* les textes affichés. Il ne produit jamais de données ni d'options.
- **Réponses typées uniquement** : l'utilisateur répond via boutons/sélecteurs/champs (comme aujourd'hui). Pas de saisie libre vers l'agent.
- **Enrichissement dans la même refonte** : contrat v2 + catalogue enrichi livrés ensemble (pas de v1 iso-fonctionnelle).
- ~~Mode démo rebasculé sur le moteur~~ **CORRIGÉ (2026-07-08, exploration du code)** : `DemoPage`/`AccessPage` ne sont PAS une démo du questionnaire post-décès mais le produit distinct « transmission de son vivant » (questionnaire préparatoire + Stripe + code d'accès proches, table `transmissions`). Décision : **ne pas y toucher** — il conserve l'ancien agent générique (`MISTRAL_AGENT_ID`), ses routes `/api/demo/*` et `/api/transmission/*`, et la `Map()` de sessions en mémoire. Sa refonte éventuelle est un chantier séparé.
- **Périmètre exclu** : décès à l'étranger (branche rare et complexe — refonte ultérieure).
- **Plafond UX** : ≤ 15 questions vues par utilisateur, quel que soit le profil.

## Règle d'or (issue du bug « organismes »)

> **Pas de question sans étape, pas d'étape conditionnelle sans question.**

Contexte : le système actuel pose la question « organismes déjà contactés » mais `isApplicable()` (`src/lib/roadmap-generator.ts`) ne teste jamais `applicable_when.organismes` — la réponse est collectée puis ignorée. Cette règle devient un **test unitaire d'invariant** (voir §Tests) qui rend ce bug structurellement impossible.

Corollaire : si une condition peut être expliquée dans le texte de l'étape (ex. « si vous avez 55 ans ou plus »), on n'ajoute **pas** de question — on économise la charge cognitive de l'utilisateur.

---

## Section 1 — Modèle d'information v2

### Contrat `QuestionnaireAnswersV2` (`src/types/questionnaire.ts`)

```typescript
type TriState = 'oui' | 'non' | 'ne_sait_pas'

interface QuestionnaireAnswersV2 {
  // ── Tronc commun (toujours demandé, ~9 questions) ──
  relation: 'conjoint_marie' | 'pacse' | 'concubin' | 'parent' | 'enfant' | 'frere_soeur' | 'autre'
  deceased_firstname: string
  deceased_lastname: string
  deceased_dod: string                    // YYYY-MM-DD
  statut_professionnel: 'salarie' | 'fonctionnaire' | 'independant' | 'retraite' | 'demandeur_emploi' | 'sans_activite'
  logement: 'locataire' | 'proprietaire' | 'heberge_ou_autre'
  enfants: 'aucun' | 'majeurs' | 'mineurs'   // 'mineurs' = au moins un enfant mineur
  has_notary: boolean
  has_life_insurance: TriState

  // ── Questions complémentaires (universelles, sauf has_joint_account qui est conditionnel) ──
  has_joint_account?: boolean             // demandé seulement si relation ∈ {conjoint_marie, pacse, concubin}
  has_vehicle: boolean
  has_credits: boolean                    // crédit immobilier ou consommation en cours
  employait_aide_domicile: boolean        // défunt particulier employeur
  contrat_obseques: TriState
  organismes_contactes: ('banque'|'assurance'|'caf'|'retraite'|'employeur'|'mutuelle'|'cpam'|'impots')[]
}
```

**Évolutions vs v1** :
- `relation` s'affine (la pension de réversion dépend du **mariage**, pas du couple)
- `deceased_was_employed: boolean` → `statut_professionnel` (enum 6 valeurs)
- `deceased_was_tenant: boolean` → `logement` (enum 3 valeurs, `proprietaire` ouvre la branche immobilier)
- Tri-états `ne_sait_pas` : déclenchent les étapes de **recherche** (AGIRA) au lieu des étapes de contact
- `organismes_contactes` enfin branché : les étapes correspondantes sont créées avec `status: 'done'`

**Comptage questions par profil** : tronc 9 + universelles 5 (`has_vehicle`, `has_credits`, `employait_aide_domicile`, `contrat_obseques`, `organismes_contactes`) = 14 ; profil conjoint : +1 (`has_joint_account`) = **15**. Plafond respecté.

### Nouvelles étapes du catalogue (~20, sourcées)

Liste indicative — la liste définitive et la rédaction FR complète (description, when/why/what, sources) sont un livrable de la phase 2. Chaque étape porte l'URL de sa source officielle dans un nouveau champ `source_url`.

| Étape | Condition (`applicable_when`) | Source |
|---|---|---|
| Débloquer jusqu'à 5 965 € pour les frais d'obsèques | toujours | service-public F16507 |
| Rechercher les comptes bancaires (Ficoba) | toujours | service-public F16507 |
| Faire établir l'acte de notoriété | toujours | service-public F16507 |
| Demander le capital décès (CPAM/MSA) | `statut_professionnel: ['salarie']` | service-public F16507 |
| Demander la réversion Agirc-Arrco (60 %, sans condition de ressources) | `relation: ['conjoint_marie']` | service-public F16507 |
| Demander l'allocation veuvage | `relation: ['conjoint_marie']` | service-public F16507 |
| Allocation de soutien familial (CAF) | `relation: ['conjoint_marie','pacse','concubin']` + `enfants: ['mineurs','majeurs']` | service-public F16507 |
| Pension d'orphelin | `enfants: ['mineurs','majeurs']` | à sourcer (phase 2) |
| Saisir le juge des tutelles (enfant mineur héritier) | `enfants: ['mineurs']` | à sourcer (phase 2) |
| Déclarer à l'URSSAF / radiation d'activité | `statut_professionnel: ['independant']` | à sourcer (phase 2 — non couvert par F16507) |
| Prévenir France Travail | `statut_professionnel: ['demandeur_emploi']` | service-public |
| Documents de fin de contrat de l'aide à domicile (30 j) | `employait_aide_domicile: true` | service-public F16507 |
| Transférer/céder la carte grise du véhicule | `has_vehicle: true` | à sourcer (phase 2) |
| Gérer l'assurance auto | `has_vehicle: true` | à sourcer (phase 2) |
| Activer l'assurance emprunteur des crédits | `has_credits: true` | service-public F16507 |
| ⚠️ NE PAS résilier eau/gaz/assurance habitation avant accord des héritiers | toujours (étape « warning ») | service-public F16507 |
| Attestation immobilière notariée | `logement: ['proprietaire']` | à sourcer (phase 2) |
| Rechercher un contrat obsèques (AGIRA) | `contrat_obseques: ['ne_sait_pas']` | service-public R63577 |
| Utiliser le contrat obsèques pour financer les funérailles | `contrat_obseques: ['oui']` | à sourcer (phase 2) |
| Rechercher un testament (FCDDV) | `has_notary: false` | à sourcer (phase 2) |
| Signaler le décès aux réseaux sociaux (compte commémoratif FB/Instagram/LinkedIn) | toujours (enrichit l'étape existante) | CNIL mort numérique |
| Clôturer les comptes en ligne / s'opposer au traitement (droit des héritiers) | toujours | CNIL mort numérique |
| Résilier les abonnements (SaaS, presse, streaming, télécom) | toujours (enrichit l'existant) | CNIL |
| Poser votre congé de deuil (3 j minimum, plus si enfant) | toujours — étape pour **l'utilisateur** | service-public F16507 |

**Étape existante mise à jour** : « Contacter l'assurance vie » passe de `has_life_insurance: true` à `has_life_insurance: ['oui']` ; nouvelle étape « Recherche AGIRA assurance vie » pour `['ne_sait_pas']`.

---

## Section 2 — Architecture

### Composant 1 : catalogue de questions — `server/lib/questions-catalog.js`

> **Correction d'implémentation** : le serveur Express est du JS pur exécuté par `node --watch` — il ne peut pas importer de `.ts`. Le catalogue de questions et le moteur (consommés uniquement côté serveur) vivent donc dans `server/lib/*.js` avec types JSDoc. Le contrat `QuestionnaireAnswersV2` et le catalogue d'étapes restent en TypeScript côté `src/` (consommés par le frontend).

Données pures, même patron que `steps-catalog.ts` (interface donnée en pseudo-TS, implémentée en JSDoc) :

```typescript
interface QuestionSpec {
  id: keyof QuestionnaireAnswersV2      // clé du champ rempli
  type: 'select' | 'multiselect' | 'boolean' | 'tristate' | 'text' | 'date'
  options?: { value: string; label: string }[]   // canoniques — JAMAIS générées par le LLM
  applicable_when: ApplicableWhen        // même mécanique que steps-catalog
  obligatoire: boolean                   // false = skippable (traité comme ne_sait_pas/valeur neutre)
  fallback_text: { question: string; aide?: string }  // filet de sécurité, interpolation {prenom}
  writer_hints?: string                  // contexte métier pour le rédacteur LLM
  categorie: string
  order: number
}
```

Le contenu empathique de `docs/questionnaire-agent-prompt.md` (séquence idéale Q1-Q10, « conseils à glisser ») est **recyclé** dans les `fallback_text` et `writer_hints`.

### Composant 2 : moteur — `server/lib/questionnaire-engine.js`

Fonctions **pures** (zéro I/O, testables unitairement) :

```
nextQuestion(answers)          → QuestionSpec | null   // 1ʳᵉ applicable non répondue, ordre croissant ; null = fini
validateAnswer(spec, value)    → { ok: true } | { ok: false, error }  // type + appartenance aux options canoniques
progress(answers)              → { current, total }    // nb de questions applicables restantes (vraie barre de progression)
```

État de session : `{ answers: Partial<QuestionnaireAnswersV2> }` — persisté dans `questionnaire_sessions` (jsonb `answers` remplace `messages`) à chaque réponse. Reprise après crash/redémarrage : `nextQuestion(answers)` repart exactement où on en était, par construction.

### Composant 3 : rédacteur — `server/lib/question-writer.js`

Seul point de contact LLM. À chaque question :

- **Entrée** : `QuestionSpec` + contexte court (`{ prenom, relation, derniere_question, derniere_reponse }`)
- **Appel** : `client.chat.complete()` avec `response_format: { type: 'json_schema' }` → `{ question: string, aide?: string }`. Modèle : `process.env.MISTRAL_MODEL` (défaut `mistral-small-latest`). Prompt système ~200 tokens versionné dans le repo (`server/lib/writer-prompt.js`), recyclant la section « TON ET POSTURE » du prompt agent actuel.
- **Garde-fous** : timeout 3 s ; JSON invalide ou champs manquants → `fallback_text` interpolé. **Le questionnaire ne peut jamais être bloqué ni corrompu par l'IA.**
- Le rédacteur ne reçoit **jamais** l'historique complet : contexte constant ~400 tokens/appel (vs ~3-5 k aujourd'hui).

### Contrat API (routes existantes conservées, payloads simplifiés)

| Route | Entrée | Sortie |
|---|---|---|
| `POST /api/questionnaire/start` | — | `{ session_id, data: RenderedQuestion }` |
| `POST /api/questionnaire/answer` | `{ session_id, question_id, value }` | `{ data: RenderedQuestion }` ou `{ data: { action: 'recap', answers, labels } }` |
| `POST /api/questionnaire/reask` | `{ session_id, question_id }` | `{ data: RenderedQuestion }` pour une question déjà répondue et applicable (bouton « Modifier » du récap) ; `400` sinon |
| `POST /api/questionnaire/complete` | `{ session_id }` | `{ answers: QuestionnaireAnswersV2 }` — **aucune extraction, aucun LLM** ; `409` si le questionnaire n'est pas fini ; supprime la session |

```typescript
interface RenderedQuestion {
  action: 'question'
  question_id: string
  question: string                 // rédigé par le LLM (ou fallback)
  aide?: string
  type: QuestionSpec['type']
  options?: { value: string; label: string }[]  // depuis le catalogue
  obligatoire: boolean
  categorie: string
  progress: { current: number; total: number }
}
```

`validateAnswer` échoue → `400` avec message, le client repose la même question. Correction depuis le récap : le client renvoie `POST /answer` avec le champ corrigé (le moteur accepte une réponse à une question déjà répondue et recalcule les branches en aval : si la correction invalide des réponses de branches devenues inapplicables, elles sont purgées et le questionnaire reprend à `nextQuestion`).

### Frontend

- `QuestionCard` : inchangé (même forme de question) + support du type `tristate` (3 boutons : Oui / Non / Je ne sais pas)
- `CompletionScreen` : gagne l'écran **récapitulatif confirmable** — liste Q→réponse avec bouton « Modifier » par champ, puis « Confirmer et générer mon parcours ». Supprime le risque de roadmap fausse silencieuse.
- Barre de progression en **pourcentage approximatif** (calculé depuis `progress.current/total`), jamais « question X sur Y » : le total peut varier quand une branche s'ouvre, on assume le flou (décision validée)

### `isApplicable()` v2 — `src/lib/roadmap-generator.ts`

Conditions sur enums par appartenance (`relation: ['conjoint_marie']`), tri-états par appartenance (`has_life_insurance: ['oui','ne_sait_pas']`), booléens par égalité. `organismes_contactes` : les étapes dont l'organisme a déjà été contacté sont créées avec `status: 'done'` (elles restent visibles — l'utilisateur voit ce qui est couvert).

### Ce qui est supprimé

- `sanitizeQuestionData` + `VARIABLE_LABEL_MAP` (les options ne viennent plus du LLM)
- `parseMistralJson` / `extractMistralText` du flux questionnaire (le seul JSON LLM restant est schéma-contraint avec fallback)
- Garde `MAX_QUESTIONS`, extraction forcée de `/complete`, défauts silencieux (`?? false`)
- L'agent Mistral console (`MISTRAL_AGENT_ID`, `MISTRAL_QUESTIONNAIRE_AGENT_ID`) → remplacé par `MISTRAL_MODEL` + prompt versionné
- Route `/api/roadmap/:code` (stub désactivé qui simule 2 s d'attente puis renvoie `use_default: true`) et `MISTRAL_ROADMAP_AGENT_ID`

### Gestion d'erreurs

| Panne | Comportement |
|---|---|
| Mistral down / lent / JSON invalide | `fallback_text` — transparent pour l'utilisateur |
| Valeur hors options canoniques | `400`, question reposée |
| Session perdue / serveur redémarré | `answers` persisté à chaque réponse → reprise à `nextQuestion(answers)` |
| Correction au récap invalidant une branche | réponses des branches inapplicables purgées, questionnaire reprend |

---

## Section 3 — Migration

### Constat simplificateur

Le dashboard lit les étapes **matérialisées** (`roadmaps` + `steps`), pas les réponses brutes → les roadmaps existantes restent valides. Remplacement franc, pas de double pipeline. (Hypothèse : pas d'utilisateurs en production. Si faux : ajouter un champ `version` sur `questionnaires`.)

### Phases (chacune livrable et testable seule)

| Phase | Contenu | Dépend de |
|---|---|---|
| **0. Socle** | `plan-points-attention.md` §1 (migrations CLI) + §2 (table `questionnaire_sessions`, avec `answers jsonb` au lieu de `messages`) | — |
| **1. Moteur + catalogue questions** | `questionnaire-engine.js`, `questions-catalog.ts`, tests unitaires par profil | — (code pur) |
| **2. Contrat & catalogue étapes** | `QuestionnaireAnswersV2`, nouvelles étapes sourcées + rédigées (7 étapes « structurantes » exigées par l'invariant dès cette phase, le reste du contenu peut suivre), `isApplicable()` v2, branchement `organismes_contactes`. Un **adaptateur transitoire** `adaptAnswersV1toV2()` maintient l'ancien questionnaire fonctionnel jusqu'à la phase 3 | 1 |
| **3. Serveur** | Recâblage `start`/`answer`/`complete` sur le moteur, `question-writer.js` + prompt versionné, suppression du legacy | 1, 2 |
| **4. Frontend** | Écran récap, type `tristate`, barre de progression réelle | 3 |
| **5. Nettoyage** | Démo sur le moteur (`is_demo: true` : même séquence, pas de sauvegarde de roadmap ; la sauvegarde `transmissions`/code d'accès existante est conservée), suppression `MISTRAL_AGENT_ID`/`MISTRAL_ROADMAP_AGENT_ID` et de `/api/roadmap/:code`, archivage `docs/questionnaire-agent-prompt.md` → `docs/legacy/`, mise à jour `CLAUDE.md` (env vars, flux principal) | 3, 4 |

La **rédaction du contenu** (étapes sourcées, fallback_texts, writer_hints) est parallélisable dès la phase 1.

### Tests

1. **Invariant anti-question-morte** (le garde-fou central, en CI) :
   - ∀ question conditionnelle du catalogue → ≥ 1 étape dont `applicable_when` dépend de son champ
   - ∀ étape conditionnelle → son champ existe dans le catalogue de questions
2. **Moteur** : séquences complètes par profil type (conjoint marié locataire avec enfants mineurs, enfant d'un retraité propriétaire, etc.) → suite de questions attendue, ≤ 15
3. **`isApplicable` v2** : chaque étape atteignable par au moins un profil ; tri-états
4. **Rédacteur** : timeout → fallback ; JSON invalide → fallback ; interpolation `{prenom}`
5. **Manuel (fin phase 4)** : parcours complets par profil dans le navigateur, ton et fluidité

### Risques résiduels

- **Exactitude juridique** des nouvelles étapes → chaque étape porte `source_url` ; relecture humaine avant mise en ligne ; les entrées « à sourcer (phase 2) » doivent être vérifiées sur service-public.fr avant rédaction
- **Qualité du ton** du rédacteur → prompt versionné dans git, itérable par diff/review
- **UX de séquence** → validation manuelle par profil

## Variables d'environnement

```env
# Ajouté
MISTRAL_MODEL=mistral-small-latest   # modèle du rédacteur

# Supprimés (phase 5)
# MISTRAL_AGENT_ID, MISTRAL_QUESTIONNAIRE_AGENT_ID, MISTRAL_ROADMAP_AGENT_ID
```

`MISTRAL_API_KEY` inchangé. Mettre à jour `CLAUDE.md` en phase 5.

## Sources

- [Un proche est décédé — service-public.fr (F16507)](https://www.service-public.gouv.fr/particuliers/vosdroits/F16507)
- [Mort numérique : droits du défunt et des héritiers — CNIL](https://www.cnil.fr/fr/mort-numerique-effacement-informations-personne-decedee)
- Recherche contrat obsèques : téléservice AGIRA (service-public R63577)
- La fiche F16507 exclut explicitement : décès d'un mineur, travailleur indépendant → sourcing complémentaire en phase 2

## Décisions reportées après l'implémentation (validé le 2026-07-08)

- **Relecture juridique** : la validation du contenu des ~20 nouvelles étapes se fera après implémentation, avant mise en ligne
- **Choix du modèle rédacteur** : `mistral-small-latest` par défaut, ajustable après essais de ton en conditions réelles

### Points obligatoires pour la relecture juridique/éditoriale (issus des revues de code, 2026-07-08)

1. **`famille-juge-tutelles`** : formulation corrigée en exécution (juge aux affaires familiales / juge des tutelles des mineurs, réforme 2019) — faire valider par un juriste.
2. **Sourcing par étape** : 6 des 7 nouvelles étapes citent la fiche générique F16507 ; remplacer par les fiches spécifiques et vérifier les faits : délais AGIRA (15 j de traitement, 1 mois de réponse assureur), 30 jours aide à domicile, ~18 € FCDDV, URLs `formulaireagira.fr` et `adsn.notaires.fr`.
3. **`patrimoine-assurance-emprunteur`** : « obligatoire pour l'immobilier » → juridiquement inexact, écrire « quasi systématiquement exigée par les banques ».
4. **Décision produit à confirmer** : `has_joint_account` limité aux couples — les comptes joints parent/enfant sont fréquents dans cette démographie ; élargir la question à tous les profils ?
5. **Limite du modèle (à documenter)** : le questionnaire est centré sur le répondant — un enfant répondant pour un parent veuf ne verra pas la pension de réversion ; l'ex-conjoint divorcé (éligible à réversion) est inexprimable.
6. **`statut_professionnel: 'fonctionnaire'`** : couvert partiellement en exécution (notification employeur) ; le capital décès fonction publique reste à ajouter au catalogue (Plan 2 éditorial).
7. **Frontend Plan 2 (cosmétique)** : `CompletionScreen` — afficher « X démarches, dont N déjà faites » quand des étapes sont pré-cochées.

### Premières actions techniques du Plan 2 (issues de la revue finale de branche, 2026-07-08)

- **Invariant de parité des valeurs inter-catalogues** : la dernière couture non gardée — vérifier que chaque valeur d'une condition en tableau (dans les deux catalogues) correspond à une option de la question du même champ. Un typo dans une `value` d'option du catalogue JS passerait aujourd'hui silencieusement.
- **`validateAnswer` : valider la longueur du texte trimé** (aligné sur le trim de `setAnswer`).
- **Routes** : utiliser `matchesWhen` exporté pour le 400-sur-question-inapplicable ; ne PAS exposer `writer_hints`/`fallback_text` dans `RenderedQuestion` (champs serveur).
- **Sémantique du skip** : à définir avant toute question `obligatoire: false` (le flag est inerte tant que les 15 questions sont obligatoires).
- **Suppression de l'adaptateur** : `src/lib/answers-adapter.ts` + son test, interface v1 dans `roadmap-generator.ts`, `normalizeAnswers`/`normalizeRelation`/`normalizeOrganismes` dans `QuestionnairePage.tsx` (~lignes 261-290).
- **Après le lot éditorial** : passer le test d'atteignabilité au niveau *option* (chaque valeur d'enum influence ≥ 1 étape).

## Décision tranchée

- **Barre de progression** : pourcentage approximatif, pas de compte exact « X sur Y » (le total varie à l'ouverture d'une branche — on assume le flou)
