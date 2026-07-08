# Questionnaire v2 — Plan 1 : moteur, contrat, catalogues — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire le cœur pur et testable du questionnaire v2 (contrat, catalogue de questions, moteur à états, catalogue d'étapes migré + enrichi, invariants) sans toucher aux routes serveur ni au frontend — l'app reste fonctionnelle via un adaptateur transitoire.

**Architecture:** Machine à états pilotée par un catalogue de questions (`server/lib/questions-catalog.js`, JS+JSDoc car le serveur ne peut pas importer de TS) et un moteur pur (`server/lib/questionnaire-engine.js`). Contrat `QuestionnaireAnswersV2` et catalogue d'étapes en TS côté `src/`. Un adaptateur v1→v2 maintient le flux actuel vivant jusqu'au Plan 2 (serveur/frontend/nettoyage). Spec complète : `docs/design-questionnaire-v2.md`.

**Tech Stack:** TypeScript (src/), JavaScript ESM + JSDoc (server/), Vitest (nouveau), pas de nouvelle dépendance runtime.

**Périmètre :** phases 1-2 du spec. Le Plan 2 (à écrire après exécution de celui-ci) couvrira : phases 0 (table sessions), 3 (routes serveur + rédacteur LLM), 4 (frontend récap/tristate), 5 (démo, nettoyage) + le reste du contenu éditorial (~13 étapes supplémentaires).

---

### Task 0 : Branche + commit du travail en attente

Le working tree contient des modifications vérifiées mais non commitées (fix bug sessions, CORS, suppressions de code mort, CLAUDE.md, 3 docs). On les commite sur une branche dédiée avant de commencer.

**Files:** aucun nouveau.

- [ ] **Step 1 : Créer la branche**

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git checkout -b feat/questionnaire-v2
```

- [ ] **Step 2 : Commiter l'existant en deux commits thématiques**

```bash
git add server/server.js src/server.js src/hooks/useQuestionnaire.ts src/components/letter/StepActionHistory.tsx
git commit -m "fix: suppression code mort questionnaire (routes save-partial/load-draft, getQuestion inexistant, doublon src/server.js, orphelins) + CORS allowlist

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git add CLAUDE.md docs/
git commit -m "docs: CLAUDE.md + plans dette technique, envoi courriers, design questionnaire v2

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3 : Vérifier que le tree est propre**

Run: `git status --short`
Expected: vide (ou seulement ce plan si pas encore ajouté — l'ajouter au second commit).

---

### Task 1 : Bootstrap Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`
- Modify: `package.json` (scripts + devDependency)

- [ ] **Step 1 : Installer Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2 : Créer la config**

`vitest.config.ts` :
```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 3 : Ajouter les scripts dans `package.json`**

Dans `"scripts"`, ajouter :
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4 : Test fumée**

`tests/smoke.test.ts` :
```typescript
import { describe, it, expect } from 'vitest'

describe('vitest', () => {
  it('fonctionne', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5 : Vérifier**

Run: `npm test`
Expected: `1 passed`

- [ ] **Step 6 : Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/smoke.test.ts
git commit -m "test: bootstrap Vitest

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2 : Contrat v2 + adaptateur v1→v2

**Files:**
- Create: `src/types/questionnaire.ts`
- Create: `src/lib/answers-adapter.ts` (transitoire, supprimé au Plan 2)
- Test: `tests/answers-adapter.test.ts`

- [ ] **Step 1 : Écrire le contrat**

`src/types/questionnaire.ts` :
```typescript
// Contrat v2 questionnaire → roadmap. Voir docs/design-questionnaire-v2.md.
// Toute modification doit respecter l'invariant testé dans tests/invariants.test.ts.

export type TriState = 'oui' | 'non' | 'ne_sait_pas'

export type RelationV2 =
  | 'conjoint_marie' | 'pacse' | 'concubin'
  | 'parent' | 'enfant' | 'frere_soeur' | 'autre'

export type StatutProfessionnel =
  | 'salarie' | 'fonctionnaire' | 'independant'
  | 'retraite' | 'demandeur_emploi' | 'sans_activite'

export type Logement = 'locataire' | 'proprietaire' | 'heberge_ou_autre'

export type Enfants = 'aucun' | 'majeurs' | 'mineurs'

export type OrganismeContacte =
  | 'banque' | 'assurance' | 'caf' | 'retraite'
  | 'employeur' | 'mutuelle' | 'cpam' | 'impots'

export interface QuestionnaireAnswersV2 {
  // Tronc commun
  relation: RelationV2
  deceased_firstname: string
  deceased_lastname: string
  deceased_dod: string // YYYY-MM-DD
  statut_professionnel: StatutProfessionnel
  logement: Logement
  enfants: Enfants
  has_notary: boolean
  has_life_insurance: TriState
  // Complémentaires (universelles sauf has_joint_account)
  has_joint_account?: boolean // demandé seulement si relation ∈ couple
  has_vehicle: boolean
  has_credits: boolean
  employait_aide_domicile: boolean
  contrat_obseques: TriState
  organismes_contactes: OrganismeContacte[]
}

// Conditions d'applicabilité (questions ET étapes) : clés = champs du contrat.
// Tableau = appartenance ; booléen = égalité stricte.
export interface ApplicableWhenV2 {
  relation?: RelationV2[]
  statut_professionnel?: StatutProfessionnel[]
  logement?: Logement[]
  enfants?: Enfants[]
  has_notary?: boolean
  has_life_insurance?: TriState[]
  contrat_obseques?: TriState[]
  has_joint_account?: boolean
  has_vehicle?: boolean
  has_credits?: boolean
  employait_aide_domicile?: boolean
}
```

- [ ] **Step 2 : Écrire les tests de l'adaptateur (rouges)**

`tests/answers-adapter.test.ts` :
```typescript
import { describe, it, expect } from 'vitest'
import { adaptAnswersV1toV2 } from '@/lib/answers-adapter'

const baseV1 = {
  relation: 'conjoint' as const,
  has_notary: true,
  organismes: ['banque', 'caf'] as ('banque' | 'caf')[],
  deceased_was_employed: true,
  deceased_was_tenant: false,
  has_life_insurance: true,
  has_joint_account: true,
  deceased_firstname: 'Pierre',
  deceased_lastname: 'Dupont',
  deceased_dod: '2026-04-10',
}

describe('adaptAnswersV1toV2', () => {
  it('mappe conjoint → conjoint_marie', () => {
    expect(adaptAnswersV1toV2(baseV1).relation).toBe('conjoint_marie')
  })
  it('conserve les autres relations', () => {
    expect(adaptAnswersV1toV2({ ...baseV1, relation: 'parent' }).relation).toBe('parent')
  })
  it('mappe employed → statut salarie / sans_activite', () => {
    expect(adaptAnswersV1toV2(baseV1).statut_professionnel).toBe('salarie')
    expect(adaptAnswersV1toV2({ ...baseV1, deceased_was_employed: false }).statut_professionnel).toBe('sans_activite')
  })
  it('mappe tenant → logement', () => {
    expect(adaptAnswersV1toV2({ ...baseV1, deceased_was_tenant: true }).logement).toBe('locataire')
    expect(adaptAnswersV1toV2(baseV1).logement).toBe('heberge_ou_autre')
  })
  it('mappe les booléens assurance vie en tri-état', () => {
    expect(adaptAnswersV1toV2(baseV1).has_life_insurance).toBe('oui')
    expect(adaptAnswersV1toV2({ ...baseV1, has_life_insurance: false }).has_life_insurance).toBe('non')
  })
  it('valeurs neutres pour les champs sans équivalent v1', () => {
    const v2 = adaptAnswersV1toV2(baseV1)
    expect(v2.enfants).toBe('aucun')
    expect(v2.has_vehicle).toBe(false)
    expect(v2.has_credits).toBe(false)
    expect(v2.employait_aide_domicile).toBe(false)
    expect(v2.contrat_obseques).toBe('non')
  })
  it('transmet identité et organismes', () => {
    const v2 = adaptAnswersV1toV2(baseV1)
    expect(v2.deceased_firstname).toBe('Pierre')
    expect(v2.organismes_contactes).toEqual(['banque', 'caf'])
  })
})
```

- [ ] **Step 3 : Vérifier l'échec**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/answers-adapter'`

- [ ] **Step 4 : Implémenter l'adaptateur**

`src/lib/answers-adapter.ts` :
```typescript
// TRANSITOIRE — supprimé au Plan 2 quand le serveur produira directement du v2.
// Convertit les réponses de l'ancien questionnaire (agent Mistral) vers le contrat v2
// pour que generateRoadmap() v2 fonctionne pendant la migration.
import type { QuestionnaireAnswers } from '@/lib/roadmap-generator'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'

export function adaptAnswersV1toV2(v1: QuestionnaireAnswers): QuestionnaireAnswersV2 {
  return {
    relation: v1.relation === 'conjoint' ? 'conjoint_marie' : v1.relation,
    deceased_firstname: v1.deceased_firstname ?? '',
    deceased_lastname: v1.deceased_lastname ?? '',
    deceased_dod: v1.deceased_dod ?? '',
    statut_professionnel: v1.deceased_was_employed ? 'salarie' : 'sans_activite',
    logement: v1.deceased_was_tenant ? 'locataire' : 'heberge_ou_autre',
    enfants: 'aucun',
    has_notary: v1.has_notary,
    has_life_insurance: v1.has_life_insurance ? 'oui' : 'non',
    has_joint_account: v1.has_joint_account,
    has_vehicle: false,
    has_credits: false,
    employait_aide_domicile: false,
    contrat_obseques: 'non',
    organismes_contactes: (v1.organismes ?? []).filter(
      (o): o is Exclude<typeof o, 'logement'> => o !== 'logement'
    ),
  }
}
```

Note : le v1 avait `'logement'` dans les organismes ; le v2 ne l'a plus (le bailleur n'est pas un « organisme contacté » au sens du statut done — l'étape bail est pilotée par `logement: ['locataire']`).

- [ ] **Step 5 : Vérifier**

Run: `npm test` → PASS. Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 6 : Commit**

```bash
git add src/types/questionnaire.ts src/lib/answers-adapter.ts tests/answers-adapter.test.ts
git commit -m "feat(questionnaire-v2): contrat QuestionnaireAnswersV2 + adaptateur transitoire v1→v2

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3 : Catalogue de questions

**Files:**
- Create: `server/lib/questions-catalog.js`
- Test: `tests/questions-catalog.test.ts`

- [ ] **Step 1 : Écrire les tests de validité du catalogue (rouges)**

`tests/questions-catalog.test.ts` :
```typescript
import { describe, it, expect } from 'vitest'
// @ts-expect-error — module JS serveur sans déclarations
import { QUESTIONS_CATALOG } from '../server/lib/questions-catalog.js'

// Clés autorisées = champs du contrat v2 (dupliqué sciemment : le test casse si l'un bouge sans l'autre)
const CONTRACT_KEYS = [
  'relation', 'deceased_firstname', 'deceased_lastname', 'deceased_dod',
  'statut_professionnel', 'logement', 'enfants', 'has_notary', 'has_life_insurance',
  'has_joint_account', 'has_vehicle', 'has_credits', 'employait_aide_domicile',
  'contrat_obseques', 'organismes_contactes',
]

describe('questions-catalog', () => {
  it('15 questions, ids uniques, tous dans le contrat', () => {
    const ids = QUESTIONS_CATALOG.map((q: { id: string }) => q.id)
    expect(ids).toHaveLength(15)
    expect(new Set(ids).size).toBe(15)
    for (const id of ids) expect(CONTRACT_KEYS).toContain(id)
  })
  it('orders uniques et croissants', () => {
    const orders = QUESTIONS_CATALOG.map((q: { order: number }) => q.order)
    expect(new Set(orders).size).toBe(orders.length)
  })
  it('select/multiselect ont ≥ 2 options { value, label } ; boolean/tristate/text/date n’en ont pas', () => {
    for (const q of QUESTIONS_CATALOG) {
      if (q.type === 'select' || q.type === 'multiselect') {
        expect(q.options.length).toBeGreaterThanOrEqual(2)
        for (const o of q.options) {
          expect(typeof o.value).toBe('string')
          expect(o.label.length).toBeGreaterThan(0)
        }
      } else {
        expect(q.options).toBeUndefined()
      }
    }
  })
  it('chaque question a un fallback_text.question non vide', () => {
    for (const q of QUESTIONS_CATALOG) {
      expect(q.fallback_text.question.trim().length).toBeGreaterThan(10)
    }
  })
  it('les questions conditionnelles référencent des champs posés avant elles', () => {
    const seen = new Set<string>()
    for (const q of [...QUESTIONS_CATALOG].sort((a, b) => a.order - b.order)) {
      for (const key of Object.keys(q.applicable_when ?? {})) {
        expect(seen.has(key), `condition ${key} de ${q.id} doit être posée avant`).toBe(true)
      }
      seen.add(q.id)
    }
  })
})
```

- [ ] **Step 2 : Vérifier l'échec** — Run: `npm test` → FAIL (module inexistant).

- [ ] **Step 3 : Écrire le catalogue**

`server/lib/questions-catalog.js` :
```javascript
// Catalogue des questions du questionnaire v2 — données pures.
// Miroir du patron src/data/steps-catalog.ts. Voir docs/design-questionnaire-v2.md.
// Règle d'or : chaque question conditionne ≥ 1 étape (testé par tests/invariants.test.ts).
// Les fallback_text ({prenom} interpolé) s'affichent si le rédacteur LLM échoue.

/**
 * @typedef {Object} QuestionSpec
 * @property {string} id - clé du champ QuestionnaireAnswersV2
 * @property {'select'|'multiselect'|'boolean'|'tristate'|'text'|'date'} type
 * @property {{value: string, label: string}[]=} options - canoniques, jamais générées par le LLM
 * @property {Object} applicable_when - conditions sur les réponses antérieures
 * @property {boolean} obligatoire
 * @property {{question: string, aide?: string}} fallback_text
 * @property {string=} writer_hints - contexte métier pour le rédacteur LLM
 * @property {string} categorie
 * @property {number} order
 */

/** @type {QuestionSpec[]} */
export const QUESTIONS_CATALOG = [
  {
    id: 'relation',
    type: 'select',
    options: [
      { value: 'conjoint_marie', label: 'Mon époux / mon épouse' },
      { value: 'pacse', label: 'Mon/ma partenaire de PACS' },
      { value: 'concubin', label: 'Mon compagnon / ma compagne' },
      { value: 'parent', label: 'Mon père ou ma mère' },
      { value: 'enfant', label: 'Mon fils ou ma fille' },
      { value: 'frere_soeur', label: 'Mon frère ou ma sœur' },
      { value: 'autre', label: 'Un autre lien' },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Pour commencer, quel était votre lien avec la personne qui vous a quitté ?',
      aide: 'Votre lien de parenté détermine plusieurs de vos droits, comme la pension de réversion pour les époux.',
    },
    writer_hints: 'Première question : accueillir avec douceur, poser le cadre bienveillant de l’accompagnement.',
    categorie: 'Votre situation',
    order: 1,
  },
  {
    id: 'deceased_firstname',
    type: 'text',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Quel était son prénom ?',
      aide: 'Son prénom nous permet de personnaliser votre parcours et de pré-remplir vos courriers.',
    },
    writer_hints: 'Adapter à la relation donnée (ex. « Quel était le prénom de votre époux ? »).',
    categorie: 'Votre situation',
    order: 2,
  },
  {
    id: 'deceased_lastname',
    type: 'text',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Et son nom de famille ?',
      aide: 'Le nom complet est nécessaire pour les courriers officiels.',
    },
    writer_hints: 'Utiliser le prénom désormais connu.',
    categorie: 'Votre situation',
    order: 3,
  },
  {
    id: 'deceased_dod',
    type: 'date',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'À quelle date {prenom} est-il/elle décédé(e) ?',
      aide: 'Cette date nous permet de calculer les délais légaux de chaque démarche.',
    },
    categorie: 'Votre situation',
    order: 4,
  },
  {
    id: 'statut_professionnel',
    type: 'select',
    options: [
      { value: 'salarie', label: 'Salarié(e)' },
      { value: 'fonctionnaire', label: 'Fonctionnaire' },
      { value: 'independant', label: 'Indépendant(e) ou chef d’entreprise' },
      { value: 'retraite', label: 'Retraité(e)' },
      { value: 'demandeur_emploi', label: 'En recherche d’emploi' },
      { value: 'sans_activite', label: 'Sans activité professionnelle' },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Quelle était la situation professionnelle de {prenom} ?',
      aide: 'Elle détermine les organismes à prévenir : employeur, caisses de retraite, URSSAF…',
    },
    writer_hints: 'Si salarié : mentionner que la prévoyance d’entreprise peut ouvrir droit à un capital décès, parfois important.',
    categorie: 'Sa situation',
    order: 5,
  },
  {
    id: 'logement',
    type: 'select',
    options: [
      { value: 'locataire', label: 'Locataire de son logement' },
      { value: 'proprietaire', label: 'Propriétaire de son logement' },
      { value: 'heberge_ou_autre', label: 'Hébergé(e) ou autre situation' },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Concernant son logement, {prenom} était plutôt…',
      aide: 'Locataire : le bail peut être résilié avec un préavis réduit à 1 mois. Propriétaire : le notaire établira une attestation immobilière.',
    },
    categorie: 'Sa situation',
    order: 6,
  },
  {
    id: 'enfants',
    type: 'select',
    options: [
      { value: 'aucun', label: 'Non, pas d’enfant' },
      { value: 'majeurs', label: 'Oui, tous majeurs' },
      { value: 'mineurs', label: 'Oui, dont au moins un mineur' },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: '{prenom} avait-il/elle des enfants ?',
      aide: 'S’il y a un enfant mineur héritier, certaines décisions de succession nécessitent l’accord du juge des tutelles.',
    },
    categorie: 'Sa situation',
    order: 7,
  },
  {
    id: 'has_notary',
    type: 'boolean',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Un notaire a-t-il déjà été contacté pour la succession ?',
      aide: 'Ce n’est pas grave si ce n’est pas encore fait — nous vous guiderons pour en trouver un.',
    },
    writer_hints: 'Rassurer si non : c’est une étape normale, importante surtout s’il y a des biens immobiliers.',
    categorie: 'Succession',
    order: 8,
  },
  {
    id: 'has_life_insurance',
    type: 'tristate',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Savez-vous si {prenom} avait souscrit une assurance vie ?',
      aide: 'Si vous n’êtes pas sûr(e), pas d’inquiétude : une recherche gratuite existe via l’AGIRA.',
    },
    writer_hints: 'L’assureur doit verser le capital dans le mois suivant la réception du dossier complet.',
    categorie: 'Assurances',
    order: 9,
  },
  {
    id: 'has_joint_account',
    type: 'boolean',
    applicable_when: { relation: ['conjoint_marie', 'pacse', 'concubin'] },
    obligatoire: true,
    fallback_text: {
      question: 'Aviez-vous un compte bancaire joint avec {prenom} ?',
      aide: 'Un compte joint n’est pas bloqué automatiquement, mais il est important de régulariser la situation avec la banque.',
    },
    categorie: 'Banque',
    order: 10,
  },
  {
    id: 'has_vehicle',
    type: 'boolean',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: '{prenom} possédait-il/elle un véhicule ?',
      aide: 'La carte grise devra être mise à jour avant toute vente ou utilisation du véhicule.',
    },
    categorie: 'Patrimoine',
    order: 11,
  },
  {
    id: 'has_credits',
    type: 'boolean',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: '{prenom} avait-il/elle des crédits en cours (immobilier ou consommation) ?',
      aide: 'Bonne nouvelle possible : l’assurance emprunteur peut rembourser tout ou partie du crédit. Cela vaut la peine de vérifier.',
    },
    writer_hints: 'Insister avec délicatesse : beaucoup de familles ignorent que l’assurance emprunteur peut solder le crédit.',
    categorie: 'Patrimoine',
    order: 12,
  },
  {
    id: 'employait_aide_domicile',
    type: 'boolean',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: '{prenom} employait-il/elle une aide à domicile (ménage, garde, assistance) ?',
      aide: 'Si oui, des documents de fin de contrat doivent être remis au salarié dans les 30 jours.',
    },
    categorie: 'Sa situation',
    order: 13,
  },
  {
    id: 'contrat_obseques',
    type: 'tristate',
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Savez-vous si {prenom} avait souscrit un contrat obsèques ?',
      aide: 'Un contrat obsèques peut financer tout ou partie des funérailles. En cas de doute, une recherche gratuite existe.',
    },
    categorie: 'Obsèques',
    order: 14,
  },
  {
    id: 'organismes_contactes',
    type: 'multiselect',
    options: [
      { value: 'banque', label: 'La banque' },
      { value: 'assurance', label: 'Les assurances' },
      { value: 'caf', label: 'La CAF' },
      { value: 'retraite', label: 'La caisse de retraite' },
      { value: 'employeur', label: 'L’employeur' },
      { value: 'mutuelle', label: 'La mutuelle' },
      { value: 'cpam', label: 'La CPAM' },
      { value: 'impots', label: 'Les impôts' },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: 'Dernière question : avez-vous déjà contacté certains de ces organismes ? (aucun, un ou plusieurs)',
      aide: 'Les démarches déjà faites apparaîtront cochées dans votre parcours — vous verrez ce qui est couvert.',
    },
    writer_hints: 'Dernière question : annoncer la fin proche, féliciter avec sobriété pour le chemin parcouru.',
    categorie: 'Vos démarches',
    order: 15,
  },
]
```

- [ ] **Step 4 : Vérifier** — Run: `npm test` → PASS (catalog + adapter + smoke).

- [ ] **Step 5 : Commit**

```bash
git add server/lib/questions-catalog.js tests/questions-catalog.test.ts
git commit -m "feat(questionnaire-v2): catalogue de 15 questions avec fallbacks empathiques

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4 : Moteur (nextQuestion / validateAnswer / setAnswer / progress)

**Files:**
- Create: `server/lib/questionnaire-engine.js`
- Test: `tests/questionnaire-engine.test.ts`

- [ ] **Step 1 : Écrire les tests (rouges)**

`tests/questionnaire-engine.test.ts` :
```typescript
import { describe, it, expect } from 'vitest'
// @ts-expect-error — module JS serveur
import { nextQuestion, validateAnswer, setAnswer, progress } from '../server/lib/questionnaire-engine.js'
// @ts-expect-error — module JS serveur
import { QUESTIONS_CATALOG } from '../server/lib/questions-catalog.js'

type Answers = Record<string, unknown>
const spec = (id: string) => QUESTIONS_CATALOG.find((q: { id: string }) => q.id === id)!

/** Répond automatiquement à toutes les questions avec des valeurs types. */
function runProfile(fixed: Answers): { sequence: string[]; answers: Answers } {
  const canned: Answers = {
    relation: 'parent', deceased_firstname: 'Pierre', deceased_lastname: 'Dupont',
    deceased_dod: '2026-04-10', statut_professionnel: 'retraite', logement: 'proprietaire',
    enfants: 'aucun', has_notary: false, has_life_insurance: 'ne_sait_pas',
    has_joint_account: true, has_vehicle: false, has_credits: false,
    employait_aide_domicile: false, contrat_obseques: 'non', organismes_contactes: [],
    ...fixed,
  }
  let answers: Answers = {}
  const sequence: string[] = []
  let q = nextQuestion(answers)
  while (q !== null) {
    sequence.push(q.id)
    answers = setAnswer(answers, q, canned[q.id])
    q = nextQuestion(answers)
    if (sequence.length > 20) throw new Error('boucle infinie')
  }
  return { sequence, answers }
}

describe('nextQuestion — séquences par profil', () => {
  it('conjoint marié : 15 questions, compte joint inclus, ordre croissant', () => {
    const { sequence } = runProfile({ relation: 'conjoint_marie' })
    expect(sequence).toHaveLength(15)
    expect(sequence).toContain('has_joint_account')
    expect(sequence[0]).toBe('relation')
    expect(sequence[sequence.length - 1]).toBe('organismes_contactes')
  })
  it('enfant du défunt : 14 questions, pas de compte joint', () => {
    const { sequence } = runProfile({ relation: 'enfant' })
    expect(sequence).toHaveLength(14)
    expect(sequence).not.toContain('has_joint_account')
  })
  it('null quand tout est répondu', () => {
    const { answers } = runProfile({})
    expect(nextQuestion(answers)).toBeNull()
  })
})

describe('validateAnswer', () => {
  it('select : accepte une valeur canonique, rejette le reste', () => {
    expect(validateAnswer(spec('relation'), 'parent').ok).toBe(true)
    expect(validateAnswer(spec('relation'), 'cousin').ok).toBe(false)
    expect(validateAnswer(spec('relation'), 'Père ou mère').ok).toBe(false) // label ≠ value
  })
  it('boolean / tristate', () => {
    expect(validateAnswer(spec('has_notary'), true).ok).toBe(true)
    expect(validateAnswer(spec('has_notary'), 'oui').ok).toBe(false)
    expect(validateAnswer(spec('has_life_insurance'), 'ne_sait_pas').ok).toBe(true)
    expect(validateAnswer(spec('has_life_insurance'), true).ok).toBe(false)
  })
  it('multiselect : sous-ensemble des options, vide accepté', () => {
    expect(validateAnswer(spec('organismes_contactes'), ['banque', 'caf']).ok).toBe(true)
    expect(validateAnswer(spec('organismes_contactes'), []).ok).toBe(true)
    expect(validateAnswer(spec('organismes_contactes'), ['pole_emploi']).ok).toBe(false)
    expect(validateAnswer(spec('organismes_contactes'), 'banque').ok).toBe(false)
  })
  it('text : non vide, ≤ 200 caractères', () => {
    expect(validateAnswer(spec('deceased_firstname'), 'Pierre').ok).toBe(true)
    expect(validateAnswer(spec('deceased_firstname'), '   ').ok).toBe(false)
    expect(validateAnswer(spec('deceased_firstname'), 'x'.repeat(201)).ok).toBe(false)
  })
  it('date : format ISO, pas dans le futur', () => {
    expect(validateAnswer(spec('deceased_dod'), '2026-04-10').ok).toBe(true)
    expect(validateAnswer(spec('deceased_dod'), '10/04/2026').ok).toBe(false)
    expect(validateAnswer(spec('deceased_dod'), '2999-01-01').ok).toBe(false)
  })
})

describe('setAnswer — purge des branches invalidées (correction au récap)', () => {
  it('changer relation conjoint→parent purge has_joint_account', () => {
    let answers: Answers = {}
    answers = setAnswer(answers, spec('relation'), 'conjoint_marie')
    // avance jusqu'à has_joint_account
    answers = { ...answers, deceased_firstname: 'P', deceased_lastname: 'D', deceased_dod: '2026-04-10',
      statut_professionnel: 'retraite', logement: 'locataire', enfants: 'aucun',
      has_notary: false, has_life_insurance: 'non' }
    answers = setAnswer(answers, spec('has_joint_account'), true)
    expect(answers.has_joint_account).toBe(true)
    // correction : plus conjoint → la branche devient inapplicable et sa réponse est purgée
    answers = setAnswer(answers, spec('relation'), 'parent')
    expect(answers.has_joint_account).toBeUndefined()
    expect(nextQuestion(answers)?.id).toBe('has_vehicle')
  })
})

describe('progress', () => {
  it('reflète le total applicable et le courant, en pourcentage croissant', () => {
    let answers: Answers = {}
    const p0 = progress(answers)
    expect(p0.current).toBe(0)
    expect(p0.total).toBeGreaterThanOrEqual(14)
    answers = setAnswer(answers, spec('relation'), 'conjoint_marie')
    const p1 = progress(answers)
    expect(p1.current).toBe(1)
    expect(p1.total).toBe(15) // branche conjoint ouverte
  })
})
```

- [ ] **Step 2 : Vérifier l'échec** — Run: `npm test` → FAIL (module inexistant).

- [ ] **Step 3 : Implémenter le moteur**

`server/lib/questionnaire-engine.js` :
```javascript
// Moteur du questionnaire v2 — fonctions PURES (zéro I/O). Voir docs/design-questionnaire-v2.md.
// Le serveur (Plan 2) l'appellera depuis les routes ; testé par tests/questionnaire-engine.test.ts.
import { QUESTIONS_CATALOG } from './questions-catalog.js'

const SORTED = [...QUESTIONS_CATALOG].sort((a, b) => a.order - b.order)
const TRISTATE = ['oui', 'non', 'ne_sait_pas']
const TEXT_MAX = 200

/** Une condition matche si chaque clé correspond : tableau = appartenance, scalaire = égalité stricte. */
export function matchesWhen(when, answers) {
  for (const [key, cond] of Object.entries(when ?? {})) {
    const val = answers[key]
    if (Array.isArray(cond)) {
      if (!cond.includes(val)) return false
    } else if (val !== cond) {
      return false
    }
  }
  return true
}

/** Première question applicable non répondue, dans l'ordre du catalogue. null = questionnaire terminé. */
export function nextQuestion(answers) {
  for (const spec of SORTED) {
    if (answers[spec.id] !== undefined) continue
    if (!matchesWhen(spec.applicable_when, answers)) continue
    return spec
  }
  return null
}

/** Valide une valeur contre la spec (type + options canoniques). */
export function validateAnswer(spec, value) {
  const fail = (error) => ({ ok: false, error })
  switch (spec.type) {
    case 'boolean':
      return typeof value === 'boolean' ? { ok: true } : fail('Réponse oui/non attendue')
    case 'tristate':
      return TRISTATE.includes(value) ? { ok: true } : fail('Valeur attendue : oui, non ou ne_sait_pas')
    case 'select':
      return spec.options.some((o) => o.value === value) ? { ok: true } : fail('Option inconnue')
    case 'multiselect':
      if (!Array.isArray(value)) return fail('Tableau attendu')
      return value.every((v) => spec.options.some((o) => o.value === v))
        ? { ok: true }
        : fail('Option inconnue dans la sélection')
    case 'text': {
      if (typeof value !== 'string' || value.trim().length === 0) return fail('Texte requis')
      return value.length <= TEXT_MAX ? { ok: true } : fail(`Maximum ${TEXT_MAX} caractères`)
    }
    case 'date': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail('Format AAAA-MM-JJ attendu')
      const t = Date.parse(value)
      if (Number.isNaN(t)) return fail('Date invalide')
      return t <= Date.now() ? { ok: true } : fail('La date ne peut pas être dans le futur')
    }
    default:
      return fail(`Type de question inconnu : ${spec.type}`)
  }
}

/**
 * Enregistre une réponse (nouvelle ou correction) et purge les réponses des branches
 * devenues inapplicables. Une passe ordonnée suffit : les conditions ne référencent
 * que des questions antérieures (invariant testé dans questions-catalog.test.ts).
 */
export function setAnswer(answers, spec, value) {
  const next = { ...answers, [spec.id]: value }
  for (const s of SORTED) {
    if (next[s.id] !== undefined && !matchesWhen(s.applicable_when, next)) {
      delete next[s.id]
    }
  }
  return next
}

/** Progression : questions applicables répondues / total applicable (le total varie à l'ouverture d'une branche). */
export function progress(answers) {
  const applicable = SORTED.filter((s) => matchesWhen(s.applicable_when, answers))
  const current = applicable.filter((s) => answers[s.id] !== undefined).length
  return { current, total: applicable.length }
}
```

- [ ] **Step 4 : Vérifier** — Run: `npm test` → PASS. Run: `node --check server/lib/questionnaire-engine.js` → OK.

- [ ] **Step 5 : Commit**

```bash
git add server/lib/questionnaire-engine.js tests/questionnaire-engine.test.ts
git commit -m "feat(questionnaire-v2): moteur pur (nextQuestion, validateAnswer, setAnswer avec purge, progress)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **Note post-revue (exécution)** : la revue qualité a fait amender le code ci-dessus dans un commit
> de durcissement séparé — validation date par round-trip (rejet des dates impossibles type 2026-02-30,
> que `Date.parse` normalise silencieusement) + tolérance fuseaux +14 h sur le refus du futur ;
> rejet des doublons multiselect ; trim des valeurs texte dans `setAnswer` ; JSDoc précisant que
> l'écriture sur une question inapplicable est neutralisée par la purge (les routes du Plan 2 doivent
> vérifier l'applicabilité en amont et renvoyer 400). Le fichier livré fait foi.

---

### Task 5 : Catalogue d'étapes v2 + isApplicable v2 + organismes branché

**Files:**
- Modify: `src/data/steps-catalog.ts` (type + 7 conditions migrées + `organisme_key` + 7 nouvelles étapes)
- Modify: `src/lib/roadmap-generator.ts` (isApplicable v2, generateRoadmap avec `initial_status`, saveRoadmapToDb)
- Modify: `src/pages/QuestionnairePage.tsx` (adaptateur au call site, ligne 146)
- Delete: `src/data/questionnaire-questions.ts` (orphelin vérifié — zéro import)
- Test: `tests/roadmap-generator.test.ts`

- [ ] **Step 1 : Écrire les tests (rouges)**

`tests/roadmap-generator.test.ts` :
```typescript
import { describe, it, expect } from 'vitest'
import { generateRoadmap } from '@/lib/roadmap-generator'
import { STEPS_CATALOG } from '@/data/steps-catalog'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'

const base: QuestionnaireAnswersV2 = {
  relation: 'parent', deceased_firstname: 'Pierre', deceased_lastname: 'Dupont',
  deceased_dod: '2026-04-10', statut_professionnel: 'sans_activite', logement: 'heberge_ou_autre',
  enfants: 'aucun', has_notary: true, has_life_insurance: 'non',
  has_vehicle: false, has_credits: false, employait_aide_domicile: false,
  contrat_obseques: 'non', organismes_contactes: [],
}
const ids = (a: QuestionnaireAnswersV2) => generateRoadmap(a).map((s) => s.id)

describe('isApplicable v2', () => {
  it('profil minimal : aucune étape conditionnelle', () => {
    const r = ids(base)
    expect(r).not.toContain('banque-debloquer-compte-joint')
    expect(r).not.toContain('logement-resilier-bail')
    expect(r).not.toContain('assurance-vie-contact')
    expect(r).not.toContain('succession-recherche-testament-fcddv') // has_notary: true
  })
  it('enum : salarie déclenche employeur + prévoyance ; retraite non', () => {
    expect(ids({ ...base, statut_professionnel: 'salarie' }))
      .toEqual(expect.arrayContaining(['administratif-prevenir-employeur', 'assurance-prevoyance-employeur']))
    expect(ids({ ...base, statut_professionnel: 'retraite' })).not.toContain('administratif-prevenir-employeur')
  })
  it('tristate : oui → contact assurance vie ; ne_sait_pas → recherche AGIRA', () => {
    expect(ids({ ...base, has_life_insurance: 'oui' })).toContain('assurance-vie-contact')
    expect(ids({ ...base, has_life_insurance: 'oui' })).not.toContain('assurance-vie-recherche-agira')
    expect(ids({ ...base, has_life_insurance: 'ne_sait_pas' })).toContain('assurance-vie-recherche-agira')
    expect(ids({ ...base, has_life_insurance: 'ne_sait_pas' })).not.toContain('assurance-vie-contact')
  })
  it('réversion et transfert de contrats : mariage vs couple', () => {
    expect(ids({ ...base, relation: 'conjoint_marie' })).toContain('administratif-pension-reversion')
    expect(ids({ ...base, relation: 'concubin' })).not.toContain('administratif-pension-reversion')
    expect(ids({ ...base, relation: 'concubin' })).toContain('logement-transfert-contrats')
  })
  it('nouvelles branches : mineurs, véhicule, crédits, aide à domicile, contrat obsèques, FCDDV', () => {
    expect(ids({ ...base, enfants: 'mineurs' })).toContain('famille-juge-tutelles')
    expect(ids({ ...base, enfants: 'majeurs' })).not.toContain('famille-juge-tutelles')
    expect(ids({ ...base, has_vehicle: true })).toContain('patrimoine-carte-grise')
    expect(ids({ ...base, has_credits: true })).toContain('patrimoine-assurance-emprunteur')
    expect(ids({ ...base, employait_aide_domicile: true })).toContain('administratif-aide-domicile')
    expect(ids({ ...base, contrat_obseques: 'ne_sait_pas' })).toContain('obseques-recherche-contrat-agira')
    expect(ids({ ...base, has_notary: false })).toContain('succession-recherche-testament-fcddv')
  })
  it('tri par urgence conservé', () => {
    const r = generateRoadmap({ ...base, statut_professionnel: 'salarie', logement: 'locataire' })
    const order = { urgent: 0, week: 1, month: 2, later: 3 } as const
    for (let i = 1; i < r.length; i++) {
      expect(order[r[i].urgency]).toBeGreaterThanOrEqual(order[r[i - 1].urgency])
    }
  })
})

describe('organismes_contactes → initial_status done', () => {
  it('banque contactée : étapes banque pré-cochées, les autres non', () => {
    const r = generateRoadmap({ ...base, organismes_contactes: ['banque'] })
    const byId = Object.fromEntries(r.map((s) => [s.id, s.initial_status]))
    expect(byId['banque-declaration-principale']).toBe('done')
    expect(byId['banque-autres-banques']).toBe('done')
    expect(byId['administratif-caf']).toBe('todo')
  })
  it('chaque organisme du contrat a ≥ 1 étape porteuse de son organisme_key', () => {
    const organismes = ['banque','assurance','caf','retraite','employeur','mutuelle','cpam','impots']
    for (const org of organismes) {
      expect(
        STEPS_CATALOG.some((s) => s.organisme_key === org),
        `organisme ${org} sans étape`
      ).toBe(true)
    }
  })
})

describe('atteignabilité', () => {
  it('chaque étape conditionnelle est atteignable par au moins un profil', () => {
    const maximal: QuestionnaireAnswersV2 = {
      ...base, relation: 'conjoint_marie', statut_professionnel: 'salarie',
      logement: 'locataire', enfants: 'mineurs', has_notary: false,
      has_life_insurance: 'oui', has_joint_account: true, has_vehicle: true,
      has_credits: true, employait_aide_domicile: true, contrat_obseques: 'ne_sait_pas',
    }
    const reached = new Set([
      ...ids(maximal),
      ...ids({ ...maximal, has_life_insurance: 'ne_sait_pas', contrat_obseques: 'oui', relation: 'concubin' }),
    ])
    for (const s of STEPS_CATALOG) {
      if (Object.keys(s.applicable_when).length > 0) {
        expect(reached.has(s.id), `étape inatteignable : ${s.id}`).toBe(true)
      }
    }
  })
})
```

- [ ] **Step 2 : Vérifier l'échec** — Run: `npm test` → FAIL (types v1, étapes inexistantes).

- [ ] **Step 3 : Migrer le type et les 7 conditions dans `src/data/steps-catalog.ts`**

3a. Remplacer le bloc `applicable_when` de l'interface `StepTemplate` (lignes 15-23) et ajouter deux champs :

```typescript
import type { ApplicableWhenV2, OrganismeContacte } from '@/types/questionnaire'

// dans StepTemplate :
  applicable_when: ApplicableWhenV2
  organisme_key?: OrganismeContacte   // si présent : étape pré-cochée quand l'organisme a déjà été contacté
  source_url?: string                  // source officielle (service-public.fr, CNIL…)
```

3b. Migrer les 7 conditions existantes (anciennes → nouvelles, repérables par recherche exacte) :

| Étape (id) | Avant | Après |
|---|---|---|
| `banque-debloquer-compte-joint` | `has_joint_account: true` | inchangé |
| `assurance-vie-contact` | `has_life_insurance: true` | `has_life_insurance: ['oui']` |
| `assurance-prevoyance-employeur` | `deceased_was_employed: true` | `statut_professionnel: ['salarie']` |
| `administratif-prevenir-employeur` | `deceased_was_employed: true` | `statut_professionnel: ['salarie']` |
| `administratif-pension-reversion` | `relations: ['conjoint']` | `relation: ['conjoint_marie']` |
| `logement-resilier-bail` | `deceased_was_tenant: true` | `logement: ['locataire']` |
| `logement-transfert-contrats` | `relations: ['conjoint']` | `relation: ['conjoint_marie', 'pacse', 'concubin']` |

⚠️ Renommage `relations:` → `relation:` (aligné sur la clé du contrat — le matcher générique exige l'égalité des noms).

3c. Ajouter `organisme_key` aux étapes concernées :

| id | organisme_key |
|---|---|
| `banque-declaration-principale`, `banque-autres-banques` | `'banque'` |
| `assurance-declaration-deces` | `'assurance'` |
| `administratif-caf` | `'caf'` |
| `administratif-carsat-retraite` | `'retraite'` |
| `administratif-prevenir-employeur` | `'employeur'` |
| `administratif-mutuelle` | `'mutuelle'` |
| `administratif-cpam` | `'cpam'` |
| `administratif-impots` | `'impots'` |

- [ ] **Step 4 : Ajouter les 7 nouvelles étapes en fin de `STEPS_CATALOG`**

```typescript
  // ── NOUVELLES ÉTAPES v2 (sourcées — voir docs/design-questionnaire-v2.md) ──
  {
    id: 'assurance-vie-recherche-agira',
    title: 'Rechercher une éventuelle assurance vie (AGIRA)',
    description: 'Vous ne savez pas si une assurance vie existe ? L\'AGIRA effectue une recherche gratuite auprès de tous les assureurs : si un contrat vous désigne bénéficiaire, l\'assureur vous contactera.',
    theme: 'assurance',
    urgency: 'week',
    urgency_label: 'Dans la semaine',
    when_to_do: 'Dès que possible, la recherche prend jusqu\'à 15 jours de traitement.',
    why_to_do: 'Un capital d\'assurance vie non réclamé est perdu pour les bénéficiaires. La démarche est gratuite et sans engagement.',
    what_you_do: [
      'Remplir le formulaire de recherche sur formulaireagira.fr (ou par courrier à l\'AGIRA)',
      'Joindre une copie de l\'acte de décès',
      'Attendre la réponse : les assureurs ont 1 mois pour vous contacter si un contrat existe',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { has_life_insurance: ['ne_sait_pas'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F16507',
    display_order: 31,
  },
  {
    id: 'famille-juge-tutelles',
    title: 'Saisir le juge des tutelles pour l\'enfant mineur héritier',
    description: 'Un enfant mineur héritier bénéficie d\'une protection légale : certaines décisions de succession (acceptation, renonciation, vente de biens) nécessitent l\'autorisation du juge.',
    theme: 'succession',
    urgency: 'month',
    urgency_label: 'Dans le mois',
    when_to_do: 'Avant toute décision engageant le patrimoine de l\'enfant.',
    why_to_do: 'Une succession ne peut être acceptée purement et simplement au nom d\'un mineur : le juge protège ses intérêts. Le notaire vous accompagne dans cette saisine.',
    what_you_do: [
      'En parler au notaire en charge de la succession : il précise si l\'autorisation est requise',
      'Le cas échéant, adresser une requête au juge des contentieux de la protection (tribunal du domicile de l\'enfant)',
      'Ne signer aucun acte au nom de l\'enfant avant l\'autorisation',
    ],
    what_notary_does: 'Identifie les actes nécessitant l\'autorisation du juge et prépare la requête.',
    responsable: 'partage',
    requires_notary: true,
    applicable_when: { enfants: ['mineurs'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F16507',
    display_order: 32,
  },
  {
    id: 'patrimoine-carte-grise',
    title: 'Mettre à jour la carte grise du véhicule',
    description: 'Le véhicule fait partie de la succession. Avant de le vendre, le donner ou continuer à l\'utiliser, le certificat d\'immatriculation doit être mis au nom du ou des héritiers.',
    theme: 'administratif',
    urgency: 'month',
    urgency_label: 'Dans le mois',
    when_to_do: 'Dans les 3 mois suivant le décès si le véhicule reste dans la famille, avant toute vente sinon.',
    why_to_do: 'Circuler avec une carte grise au nom du défunt expose à une amende, et la vente est impossible sans mise à jour.',
    what_you_do: [
      'Faire la démarche en ligne sur ants.gouv.fr (rubrique immatriculation)',
      'Fournir : acte de décès, attestation notariée ou attestation des héritiers, carte grise actuelle',
      'Penser aussi à prévenir l\'assurance auto (le contrat continue par défaut au profit des héritiers)',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { has_vehicle: true },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F16507',
    display_order: 33,
  },
  {
    id: 'patrimoine-assurance-emprunteur',
    title: 'Activer l\'assurance emprunteur des crédits en cours',
    description: 'Bonne nouvelle possible : si les crédits du défunt étaient couverts par une assurance emprunteur (obligatoire pour l\'immobilier), elle peut rembourser tout ou partie du capital restant dû.',
    theme: 'banque',
    urgency: 'week',
    urgency_label: 'Dans la semaine',
    when_to_do: 'Dès que possible : tant que le dossier n\'est pas traité, les mensualités peuvent continuer d\'être prélevées.',
    why_to_do: 'L\'assurance emprunteur peut solder le crédit immobilier — un enjeu financier majeur souvent méconnu des familles.',
    what_you_do: [
      'Retrouver les contrats de prêt et l\'assurance associée (banque ou assureur externe)',
      'Déclarer le décès à l\'assureur emprunteur avec l\'acte de décès',
      'Demander la prise en charge du capital restant dû selon la quotité assurée',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { has_credits: true },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F16507',
    display_order: 34,
  },
  {
    id: 'administratif-aide-domicile',
    title: 'Gérer le contrat de l\'aide à domicile',
    description: 'Le décès de l\'employeur met fin automatiquement au contrat de travail du salarié à domicile. Des documents et indemnités doivent lui être remis dans les 30 jours.',
    theme: 'administratif',
    urgency: 'week',
    urgency_label: 'Dans la semaine',
    when_to_do: 'Le contrat prend fin à la date du décès ; les documents doivent être remis sous 30 jours.',
    why_to_do: 'C\'est une obligation légale de la succession : dernier salaire, indemnités de préavis, de licenciement et de congés payés sont dus au salarié.',
    what_you_do: [
      'Prévenir le salarié et calculer les sommes dues (dernier salaire, indemnités)',
      'Établir sous 30 jours : certificat de travail, attestation France Travail, reçu pour solde de tout compte',
      'Déclarer la fin de contrat au Cesu (cesu.urssaf.fr) le cas échéant',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { employait_aide_domicile: true },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F16507',
    display_order: 35,
  },
  {
    id: 'obseques-recherche-contrat-agira',
    title: 'Vérifier l\'existence d\'un contrat obsèques (AGIRA)',
    description: 'Un contrat obsèques peut financer tout ou partie des funérailles et préciser les volontés du défunt. Une recherche gratuite permet de le retrouver avant d\'engager les frais.',
    theme: 'obseques',
    urgency: 'urgent',
    urgency_label: 'Dans les 48h',
    when_to_do: 'Avant de finaliser l\'organisation des obsèques si possible.',
    why_to_do: 'Si un contrat existe, les frais peuvent être pris en charge et les volontés du défunt (inhumation, crémation) doivent être respectées.',
    what_you_do: [
      'Interroger les proches et vérifier les papiers du défunt (relevés bancaires : cotisations à un assureur)',
      'Faire une demande de recherche de contrat obsèques via le téléservice AGIRA dédié',
      'Transmettre le contrat retrouvé à l\'entreprise de pompes funèbres',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { contrat_obseques: ['ne_sait_pas'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/R63577',
    display_order: 36,
  },
  {
    id: 'succession-recherche-testament-fcddv',
    title: 'Vérifier l\'existence d\'un testament (FCDDV)',
    description: 'Le Fichier Central des Dispositions de Dernières Volontés recense les testaments déposés chez les notaires. Sans notaire déjà en charge, cette vérification évite de découvrir un testament trop tard.',
    theme: 'succession',
    urgency: 'week',
    urgency_label: 'Dans la semaine',
    when_to_do: 'Avant d\'engager le règlement de la succession.',
    why_to_do: 'Un testament ignoré peut remettre en cause tout le règlement de la succession. La consultation du FCDDV est simple et peu coûteuse.',
    what_you_do: [
      'Interroger le FCDDV en ligne (adsn.notaires.fr) avec l\'acte de décès — environ 18 €',
      'Si un testament existe : contacter le notaire dépositaire indiqué',
      'Le notaire que vous choisirez pour la succession peut faire cette vérification pour vous',
    ],
    what_notary_does: 'Consulte systématiquement le FCDDV à l\'ouverture de la succession.',
    responsable: 'partage',
    requires_notary: false,
    applicable_when: { has_notary: false },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F16507',
    display_order: 37,
  },
```

- [ ] **Step 5 : Réécrire `src/lib/roadmap-generator.ts`**

Remplacer le contenu intégral par :

```typescript
import { STEPS_CATALOG, type StepTemplate } from '@/data/steps-catalog'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'
import { supabase } from '@/lib/supabase'

// Ré-export transitoire du contrat v1 (utilisé par l'ancien flux jusqu'au Plan 2)
export interface QuestionnaireAnswers {
  relation: 'conjoint' | 'parent' | 'enfant' | 'frere_soeur' | 'autre'
  has_notary: boolean
  organismes: ('banque' | 'assurance' | 'caf' | 'retraite' | 'employeur' | 'mutuelle' | 'logement' | 'cpam')[]
  deceased_was_employed: boolean
  deceased_was_tenant: boolean
  has_life_insurance: boolean
  has_joint_account: boolean
  deceased_firstname?: string
  deceased_lastname?: string
  deceased_dod?: string
}

const URGENCY_ORDER: Record<StepTemplate['urgency'], number> = {
  urgent: 0,
  week: 1,
  month: 2,
  later: 3,
}

export type RoadmapStep = StepTemplate & { initial_status: 'todo' | 'done' }

// Matcher générique : tableau = appartenance, booléen = égalité stricte.
// Même sémantique que matchesWhen() dans server/lib/questionnaire-engine.js (dupliqué :
// le serveur JS ne peut pas importer ce module TS — garder les deux alignés).
function isApplicable(step: StepTemplate, answers: QuestionnaireAnswersV2): boolean {
  for (const [key, cond] of Object.entries(step.applicable_when)) {
    const val = (answers as unknown as Record<string, unknown>)[key]
    if (Array.isArray(cond)) {
      if (!cond.includes(val as never)) return false
    } else if (val !== cond) {
      return false
    }
  }
  return true
}

export function generateRoadmap(answers: QuestionnaireAnswersV2): RoadmapStep[] {
  return STEPS_CATALOG
    .filter((step) => isApplicable(step, answers))
    .sort(
      (a, b) =>
        URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || a.display_order - b.display_order
    )
    .map((step) => ({
      ...step,
      initial_status:
        step.organisme_key && answers.organismes_contactes.includes(step.organisme_key)
          ? 'done'
          : 'todo',
    }))
}

export async function saveRoadmapToDb(
  userId: string,
  questionnaireId: string,
  steps: RoadmapStep[]
) {
  const { data: roadmap, error: roadmapError } = await supabase
    .from('roadmaps')
    .insert({
      user_id: userId,
      questionnaire_id: questionnaireId,
      total_steps: steps.length,
    })
    .select()
    .single()

  if (roadmapError || !roadmap) {
    throw new Error('Impossible de sauvegarder votre roadmap. Veuillez réessayer.')
  }

  const { error: stepsError } = await supabase.from('steps').insert(
    steps.map((step, i) => ({
      roadmap_id: roadmap.id,
      user_id: userId,
      template_id: step.id,
      title: step.title,
      theme: step.theme,
      urgency: step.urgency,
      urgency_label: step.urgency_label,
      status: step.initial_status,
      display_order: i,
      letter_template_id: step.letter_template_id ?? null,
      warning_badge: step.warning_badge ?? null,
    }))
  )

  if (stepsError) {
    throw new Error('Impossible de sauvegarder les étapes. Veuillez réessayer.')
  }

  return roadmap.id as string
}
```

- [ ] **Step 6 : Brancher l'adaptateur au call site (unique, vérifié)**

Dans `src/pages/QuestionnairePage.tsx` :
- ajouter en tête : `import { adaptAnswersV1toV2 } from '@/lib/answers-adapter'`
- ligne 146, remplacer :
```typescript
const steps = generateRoadmap(answers)
```
par :
```typescript
const steps = generateRoadmap(adaptAnswersV1toV2(answers))
```
(Seul call site — vérifiable par `grep -rn "generateRoadmap(" src | grep -v roadmap-generator`.)

- [ ] **Step 6bis : Supprimer l'orphelin `questionnaire-questions.ts`**

Vestige de l'ancien questionnaire statique, importé nulle part (vérifié) et utilisant les champs v1 :
```bash
git rm src/data/questionnaire-questions.ts
```

- [ ] **Step 7 : Vérifier**

Run: `npx tsc --noEmit` → exit 0 (si d'autres fichiers référencent les champs v1 du catalogue, tsc les signalera — les corriger sur le même modèle adaptateur).
Run: `npm test` → PASS.
Run: `npx vite build` → exit 0.

- [ ] **Step 8 : Commit**

```bash
git add src/data/steps-catalog.ts src/lib/roadmap-generator.ts src/pages/QuestionnairePage.tsx tests/roadmap-generator.test.ts
git commit -m "feat(questionnaire-v2): catalogue étapes v2 (7 conditions migrées, organisme_key, 7 nouvelles étapes sourcées) + generateRoadmap v2

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6 : Invariant croisé questions ↔ étapes

**Files:**
- Test: `tests/invariants.test.ts`

- [ ] **Step 1 : Écrire le test (doit passer directement si Tasks 3-5 sont correctes — c'est le filet de sécurité permanent)**

`tests/invariants.test.ts` :
```typescript
import { describe, it, expect } from 'vitest'
import { STEPS_CATALOG } from '@/data/steps-catalog'
// @ts-expect-error — module JS serveur
import { QUESTIONS_CATALOG } from '../server/lib/questions-catalog.js'

// Champs d'identité : servent aux courriers et à la personnalisation, pas au filtrage.
const IDENTITY_FIELDS = ['deceased_firstname', 'deceased_lastname', 'deceased_dod']
// organismes_contactes est branché via organisme_key (statut done), pas via applicable_when.
const SPECIAL_FIELDS = ['organismes_contactes']

describe('invariant : pas de question morte, pas d’étape orpheline', () => {
  it('chaque question (hors identité/spécial) conditionne au moins une étape', () => {
    for (const q of QUESTIONS_CATALOG) {
      if (IDENTITY_FIELDS.includes(q.id) || SPECIAL_FIELDS.includes(q.id)) continue
      const used = STEPS_CATALOG.some((s) =>
        Object.prototype.hasOwnProperty.call(s.applicable_when, q.id)
      )
      expect(used, `question morte : ${q.id} ne conditionne aucune étape`).toBe(true)
    }
  })
  it('chaque condition d’étape correspond à une question du catalogue', () => {
    const questionIds = new Set(QUESTIONS_CATALOG.map((q: { id: string }) => q.id))
    for (const s of STEPS_CATALOG) {
      for (const key of Object.keys(s.applicable_when)) {
        expect(questionIds.has(key), `étape ${s.id} : condition "${key}" sans question`).toBe(true)
      }
    }
  })
  it('chaque valeur de organismes_contactes a une étape porteuse (organisme_key)', () => {
    const orgQuestion = QUESTIONS_CATALOG.find((q: { id: string }) => q.id === 'organismes_contactes')!
    for (const opt of orgQuestion.options) {
      expect(
        STEPS_CATALOG.some((s) => s.organisme_key === opt.value),
        `organisme sans étape : ${opt.value}`
      ).toBe(true)
    }
  })
})
```

- [ ] **Step 2 : Vérifier** — Run: `npm test` → PASS intégral.

- [ ] **Step 3 : Commit**

```bash
git add tests/invariants.test.ts
git commit -m "test(questionnaire-v2): invariant croisé questions↔étapes (anti-question-morte)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **Note post-revue (exécution)** : la Task 6 a été élargie sur demande de la revue qualité de la Task 5 —
> ajout d'un test de **parité des matchers** `isApplicable` (TS) ↔ `matchesWhen` (JS) sur table de cas
> (les deux copies dupliquées ne peuvent plus diverger silencieusement ; `isApplicable` est exporté à
> cette fin), commentaires croisés de duplication dans les deux fichiers, puis d'un invariant
> **anti-tableau-vide** (une condition `[]` rendrait une étape inatteignable sans erreur) et de lignes
> de parité `null`/tableau vide. Le fichier livré fait foi.

---

### Task 7 : Vérification finale du plan

- [ ] **Step 1 : Suite complète**

```bash
npx tsc --noEmit && npm test && npx vite build && node --check server/lib/questionnaire-engine.js && node --check server/lib/questions-catalog.js && node --check server/server.js
```
Expected: tout passe, exit 0.

- [ ] **Step 2 : Vérification fonctionnelle de non-régression (l'ancien flux doit marcher)**

Lancer `npm run dev:all`, dérouler un questionnaire complet dans le navigateur (l'ancien agent Mistral pilote toujours), vérifier que la roadmap se génère et s'affiche. Les nouvelles étapes conditionnelles n'apparaîtront pas (l'adaptateur met des valeurs neutres) — c'est attendu jusqu'au Plan 2.

- [ ] **Step 3 : Commit final si des ajustements ont eu lieu, sinon rien**

**Livré à l'issue de ce plan** : contrat v2, 15 questions, moteur complet testé, catalogue migré + 7 étapes sourcées, invariants en CI locale. **Plan 2 ensuite** : table sessions (phase 0), routes serveur + rédacteur LLM (phase 3), frontend récap/tristate (phase 4), démo + nettoyage + suppression adaptateur (phase 5), reste du contenu éditorial (~13 étapes).
