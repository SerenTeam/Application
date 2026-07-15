# i18n FR/EN — détection + bascule à l'exécution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'app détecte la langue du device (EN → anglais, sinon français), offre un toggle FR/EN persistant, et sert questionnaire + roadmap + UI dans la langue active — les courriers restent français.

**Architecture:** Dictionnaires TS typés maison (parité des clés garantie par `tsc`), catalogues d'étapes FR/EN jumeaux protégés par un invariant de parité structurelle, catalogue de questions serveur à champs textuels bilingues `{ fr, en }`, langue de session figée au `/start` (colonne `lang`), résolution des textes de roadmap par `template_id` à l'affichage (les roadmaps déjà en base basculent sans régénération). Spec : `docs/design-i18n.md`.

**Tech Stack:** identique (React 18 + contexte, Express, Vitest ; **zéro nouvelle dépendance**).

**Source des traductions** : branche `demo-en` — `git show demo-en:<fichier>` (commits `84281de` serveur, `88bceb1` catalogue étapes, `be3fbc2`+`b330e25` UI). Ne JAMAIS retraduire : récolter.

**Baseline attendue au départ** : `npm test` → 72 passed sur `main`.

---

### Task 0 : Branche

- [x] **Step 1**
```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git checkout main && git checkout -b feat/i18n
npm test   # 72 passed attendus
```

---

### Task 1 : Cœur i18n frontend (détection, contexte, toggle)

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/LanguageContext.tsx`, `src/components/layout/LanguageSwitch.tsx`
- Modify: `src/App.tsx` (Provider), le header commun (localiser le composant header réel — voir Step 4)
- Test: `tests/i18n.test.ts`

- [x] **Step 1 : Tests rouges** — `tests/i18n.test.ts` :
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { detectLang, fmt } from '../src/i18n'

describe('detectLang', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() })
    vi.stubGlobal('navigator', { language: 'fr-FR' })
  })
  it('device anglais → en (en-US, en-GB)', () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    expect(detectLang()).toBe('en')
    vi.stubGlobal('navigator', { language: 'en-GB' })
    expect(detectLang()).toBe('en')
  })
  it('device français ou autre → fr', () => {
    expect(detectLang()).toBe('fr')
    vi.stubGlobal('navigator', { language: 'de-DE' })
    expect(detectLang()).toBe('fr')
  })
  it('le choix persisté prime sur le device', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('fr'), setItem: vi.fn() })
    vi.stubGlobal('navigator', { language: 'en-US' })
    expect(detectLang()).toBe('fr')
  })
  it('environnement sans navigator (SSR/tests) → fr sans crash', () => {
    vi.stubGlobal('navigator', undefined)
    vi.stubGlobal('localStorage', undefined)
    expect(detectLang()).toBe('fr')
  })
})

describe('fmt', () => {
  it('interpole {name} et laisse les accolades inconnues', () => {
    expect(fmt('Hello {name}, {n} steps', { name: 'Pierre', n: 40 })).toBe('Hello Pierre, 40 steps')
    expect(fmt('Rien à faire', {})).toBe('Rien à faire')
  })
})
```
Run : `npx vitest run tests/i18n.test.ts` → FAIL (module absent).

- [x] **Step 2 : Implémenter `src/i18n/index.ts`**
```typescript
export type Lang = 'fr' | 'en'

const STORAGE_KEY = 'seren_lang'

export function detectLang(): Lang {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (saved === 'fr' || saved === 'en') return saved
    const nav = typeof navigator !== 'undefined' ? navigator.language : undefined
    return nav?.toLowerCase().startsWith('en') ? 'en' : 'fr'
  } catch {
    return 'fr'
  }
}

export function persistLang(lang: Lang): void {
  try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* stockage indisponible : tant pis */ }
}

// Interpolation minimaliste : remplace {clé} par vars[clé] ; laisse intact si absent.
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}
```

- [x] **Step 3 : Contexte + toggle** — `src/i18n/LanguageContext.tsx` :
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { detectLang, persistLang, type Lang } from './index'

const LanguageContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'fr', setLang: () => {} })

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang())
  const setLang = (l: Lang) => { persistLang(l); setLangState(l) }
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
}

export function useLang() { return useContext(LanguageContext) }
```
`src/components/layout/LanguageSwitch.tsx` :
```tsx
import { useLang } from '@/i18n/LanguageContext'

// Toggle FR/EN : la langue choisie persiste (localStorage) et prime sur la langue du device.
export function LanguageSwitch() {
  const { lang, setLang } = useLang()
  return (
    <div className="flex items-center gap-1 text-sm" role="group" aria-label="Language">
      {(['fr', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`px-2 py-1 rounded uppercase transition-colors ${lang === l ? 'font-semibold text-accent' : 'text-text-soft hover:text-text'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
```

- [x] **Step 4 : Brancher** — envelopper l'app dans `<LanguageProvider>` (dans `src/App.tsx`, autour du router, sous les providers existants) ; repérer le header commun (chercher le composant qui rend « Tableau de bord »/« Déconnexion » — probablement un layout partagé ou dupliqué par page) et y insérer `<LanguageSwitch />` à côté du bouton Déconnexion. Si le header est dupliqué par page, l'insérer dans chaque occurrence (noter le constat dans le rapport).

- [x] **Step 5 : Vérifier** — `npx vitest run tests/i18n.test.ts` → 6 passed ; `npm test` (rien de cassé) ; `npx tsc --noEmit` ; `npx vite build`.

- [x] **Step 6 : Commit**
```bash
git add src/i18n tests/i18n.test.ts src/components/layout/LanguageSwitch.tsx src/App.tsx <fichiers header>
git commit -m "feat(i18n): détection de langue, contexte, toggle FR/EN persistant"
```

> **Note post-revue Task 1 (exécution)** : (a) le plan annonçait « 6 passed » mais son bloc de
> tests littéral ne contient que **5 `it()`** (4 detectLang + 1 fmt) — le code a été suivi à la
> lettre, les compteurs réels sont donc **77 après Task 1** (baseline 72 + 5) ; les jalons
> suivants deviennent **78 pour la Task 3** et **81 pour la Task 4** (au lieu de 79 et 82).
> (b) Il n'existe pas de header commun : le header est dupliqué inline dans **4 pages**
> (`DashboardPage`, `QuestionnairePage`, `ProfilePage`, `AccessPage`). Le `<LanguageSwitch />`
> a été branché dans les **3 premières** et délibérément PAS dans `AccessPage` — produit
> transmission gelé, hors périmètre (CLAUDE.md + `docs/design-i18n.md`), et le toggle y serait
> une affordance morte puisque le contenu de cette page reste français dans les deux langues.

---

### Task 2 : Dictionnaires UI + extraction des chaînes React

**Files:**
- Create: `src/i18n/strings.fr.ts`, `src/i18n/strings.en.ts`, `src/i18n/useT.ts`
- Modify: tous les composants/pages à chaînes en dur (~37 fichiers — la liste exacte = les fichiers touchés par `git show --stat demo-en~2` commit `be3fbc2`, plus `QuickAccess.tsx` de `b330e25`)

**EXCLUSIONS (restent français, ne pas toucher)** : `src/data/letter-templates*` (courriers), `src/pages/DemoPage.tsx`, `src/pages/AccessPage.tsx` (+ composants du produit transmission), commentaires de code.

- [x] **Step 1 : Squelette typé** — `src/i18n/strings.fr.ts` définit la forme, organisée par domaine :
```typescript
export const STRINGS_FR = {
  layout: { dashboard: 'Tableau de bord', signOut: 'Déconnexion', letters: 'Courriers' /* … */ },
  welcome: { /* … */ }, auth: { /* … */ }, validation: { /* … */ },
  questionnaire: { /* … */ }, recap: { /* … */ }, completion: { /* … */ },
  dashboardPage: { /* … */ }, roadmap: { /* … */ }, lettersPage: { /* … */ },
  errors: { /* … */ },
} as const

export type Strings = typeof STRINGS_FR
```
`src/i18n/strings.en.ts` : `export const STRINGS_EN: Strings = { … }` — **tsc échoue si une clé manque : c'est l'invariant de parité UI, aucun test runtime nécessaire**.
`src/i18n/useT.ts` :
```typescript
import { useLang } from './LanguageContext'
import { STRINGS_FR, type Strings } from './strings.fr'
import { STRINGS_EN } from './strings.en'

const ALL: Record<'fr' | 'en', Strings> = { fr: STRINGS_FR, en: STRINGS_EN }
export function useT(): Strings { return ALL[useLang().lang] }
```

- [x] **Step 2 : Extraction, domaine par domaine** — pour chaque fichier : les chaînes FR viennent du fichier actuel sur `main`, les EN de `git show demo-en:<même chemin>`. Remplacer chaque chaîne en dur par `t.domaine.clé` (via `const t = useT()`), les interpolations par `fmt(t.x.y, { … })`. Ordre conseillé (un commit par lot) : (a) layout + auth + validation + pages simples ; (b) questionnaire (WelcomeScreen, QuestionCard, RecapScreen, CompletionScreen, QuestionnaireProgress, QuestionnairePage — y compris message de session expirée et placeholders) ; (c) dashboard (Sidebar, ProgressHero, QuickAccess, RoadmapView, DashboardPage) + habillage courriers (boutons Copier/Télécharger/Marquer envoyé — le CONTENU des lettres et les labels de variables restent FR).
  ⚠️ Balayer AUSSI les échappements unicode : `grep -rn '\\u00' src/` (leçon `QuickAccess.tsx`). ⚠️ `src/utils/validation.ts` : transformer les schémas zod en fonctions `makeSchemas(t)` (les messages ne peuvent pas être figés à l'import).

- [x] **Step 3 : Balayage final**
```bash
grep -rnE '["'\''`][^"'\''`]*[éèêàçÉÈ]' src/components src/pages --include='*.tsx' | grep -v -iE 'demo|access|letter-templates' | grep -v '//'
```
Résultat attendu : uniquement des faux positifs documentés (commentaires, données courriers). Lister les restes délibérés dans le rapport.

- [x] **Step 4 : Vérifier** — `npx tsc --noEmit` (la parité des clés se joue ici) ; `npm test` → 78 (72 + 6 de Task 1) ; `npx vite build`.

- [x] **Step 5 : Commit(s)**
```bash
git add -A -- src
git commit -m "feat(i18n): dictionnaires FR/EN typés et extraction des chaînes UI"
```

---

### Task 3 : Catalogue d'étapes bilingue + résolution par template_id

**Files:**
- Create: `src/data/steps-catalog.fr.ts`, `src/data/steps-catalog.en.ts`
- Modify: `src/data/steps-catalog.ts` (devient interface + getter), `src/lib/roadmap-generator.ts`, le composant d'affichage roadmap/dashboard (résolution des titres), `tests/invariants.test.ts`

- [x] **Step 1 : Scinder les données** — `steps-catalog.fr.ts` reçoit le tableau actuel (`export const STEPS_CATALOG_FR: StepTemplate[] = [ …contenu actuel de main… ]`) ; `steps-catalog.en.ts` reçoit le tableau de `git show demo-en:src/data/steps-catalog.ts` (`STEPS_CATALOG_EN`). `steps-catalog.ts` conserve l'interface `StepTemplate` et devient :
```typescript
import type { Lang } from '@/i18n'
import { STEPS_CATALOG_FR } from './steps-catalog.fr'
import { STEPS_CATALOG_EN } from './steps-catalog.en'

export interface StepTemplate { /* — inchangée, contenu actuel — */ }

export function getStepsCatalog(lang: Lang): StepTemplate[] {
  return lang === 'en' ? STEPS_CATALOG_EN : STEPS_CATALOG_FR
}

// Compatibilité : les consommateurs structurels (invariants, générateur par défaut) restent sur le FR.
export const STEPS_CATALOG = STEPS_CATALOG_FR
```

- [x] **Step 2 : Invariant de parité (test rouge d'abord)** — dans `tests/invariants.test.ts` :
```typescript
it('catalogues FR/EN : parité structurelle totale (seuls les textes diffèrent)', () => {
  expect(STEPS_CATALOG_EN.length).toBe(STEPS_CATALOG_FR.length)
  STEPS_CATALOG_FR.forEach((fr, i) => {
    const en = STEPS_CATALOG_EN[i]
    expect(en.id, `ordre/id divergent à l'index ${i}`).toBe(fr.id)
    for (const field of ['theme', 'urgency', 'responsable', 'requires_notary', 'organisme_key', 'source_url', 'letter_template_id', 'display_order'] as const) {
      expect(en[field], `${fr.id}.${field}`).toEqual(fr[field])
    }
    expect(en.applicable_when, `${fr.id}.applicable_when`).toEqual(fr.applicable_when)
    expect(en.what_you_do.length, `${fr.id}: nombre d'actions`).toBe(fr.what_you_do.length)
  })
})
```
(Importer `STEPS_CATALOG_FR`/`STEPS_CATALOG_EN`.) Ce test doit passer dès que le Step 1 est correct — s'il échoue, c'est une divergence RÉELLE à corriger dans le catalogue EN, jamais en affaiblissant le test.

- [x] **Step 3 : Génération dans la langue active** — `generateRoadmap()` (`src/lib/roadmap-generator.ts`) prend un paramètre `lang: Lang = 'fr'` et lit `getStepsCatalog(lang)` au lieu de la constante. L'appelant (flux de complétion dans `QuestionnairePage.tsx`) passe la langue active de `useLang()`.

- [x] **Step 4 : Résolution à l'affichage** — dans le composant dashboard/roadmap qui affiche les étapes stockées : construire `const catalogById = new Map(getStepsCatalog(lang).map((s) => [s.id, s]))` et afficher `catalogById.get(step.template_id)?.title ?? step.title` (idem `urgency_label` ; description/what_you_do étaient déjà résolus — vérifier qu'ils utilisent bien le catalogue de la langue active). Effet attendu : une roadmap générée en FR s'affiche en EN quand le toggle passe à EN, sans régénération.

- [x] **Step 5 : Vérifier** — `npm test` → 79 ; `npx tsc --noEmit` ; `npx vite build`.

- [x] **Step 6 : Commit**
```bash
git add src/data src/lib/roadmap-generator.ts src/pages src/components tests/invariants.test.ts
git commit -m "feat(i18n): catalogue d'étapes FR/EN, invariant de parité, roadmap résolue par template_id"
```

---

### Task 4 : Serveur bilingue (questions, rédacteur, sessions, erreurs)

**Files:**
- Modify: `server/lib/questions-catalog.js`, `server/lib/writer-prompt.js`, `server/lib/question-writer.js`, `server/lib/sessions-store.js`, `server/lib/questionnaire-engine.js`, `server/routes/questionnaire.js`, `server/lib/rate-limit.js`
- Create: `server/lib/messages.js`, `supabase/migrations/20260713120000_sessions_lang.sql`
- Test: `tests/questionnaire-routes.test.ts` (+2), `tests/question-writer.test.ts` (+1), `tests/questionnaire-engine.test.ts` (adaptations)

- [x] **Step 1 : Migration**
```sql
-- Langue du questionnaire, figée au /start : le rédacteur Mistral écrit dans cette langue
-- pour toute la session (y compris /resume et /reask).
alter table questionnaire_sessions
  add column if not exists lang text not null default 'fr' check (lang in ('fr', 'en'));
```
⚠️ USER STEP (fin de plan) : appliquer dans le SQL Editor Supabase.

- [x] **Step 2 : Catalogue de questions bilingue** — dans `server/lib/questions-catalog.js`, chaque champ textuel devient `{ fr, en }` : `fallback_text`, `aide`, `writer_hints`, `label` de chaque option (les `value`, `id`, `applicable_when`, `type` sont INTACTS — le moteur ne lit pas les textes). FR = contenu actuel de `main` ; EN = `git show demo-en:server/lib/questions-catalog.js` (commit `84281de`). Introduire un helper exporté :
```javascript
// Résout un champ textuel bilingue { fr, en } (chaîne brute acceptée par tolérance).
export function textIn(field, lang) {
  if (field == null || typeof field === 'string') return field
  return field[lang] ?? field.fr
}
```
Adapter TOUS les lecteurs de textes (writer-prompt, question-writer fallback, routes : labels d'options renvoyés au client, récap) pour passer par `textIn(x, lang)`. Les tests existants qui lisent des textes FR passent `lang: 'fr'`.

- [x] **Step 3 : Test rouge writer EN** — `tests/question-writer.test.ts` :
```typescript
it('buildWriterMessages en anglais : instructions EN et libellés EN', () => {
  const spec = { ...SPEC, type: 'select', options: [{ value: 'a', label: { fr: 'Premier choix', en: 'First choice' } }] }
  const messages = buildWriterMessages(spec, {}, 'en')
  expect(messages[0].content).toMatch(/English/i)
  expect(messages[1].content).toContain('First choice')
  expect(messages[1].content).not.toContain('Premier choix')
})
```
Puis implémenter : `buildWriterMessages(spec, context, lang = 'fr')` — deux jeux d'instructions (FR actuelles ; EN récoltées de `git show demo-en:server/lib/writer-prompt.js`), textes du spec résolus via `textIn(…, lang)`. Mêmes contraintes dans les deux langues (formulation ouverte, jamais de placeholder prénom : « your loved one »).

- [x] **Step 4 : Sessions + routes (tests rouges d'abord)** — `tests/questionnaire-routes.test.ts` :
```typescript
it('start avec lang:en → session en anglais, textes EN, resume conserve la langue', async () => {
  const { app } = makeApp()
  const start = await request(app).post('/api/questionnaire/start').send({ lang: 'en' })
  expect(start.status).toBe(200)
  const q = start.body.data
  expect(q.options[0].label).toBe('My husband / my wife')
  const resume = await request(app).post('/api/questionnaire/resume').send({ session_id: start.body.session_id })
  expect(resume.body.data.options[0].label).toBe('My husband / my wife')
})
it('start avec lang invalide → 400', async () => {
  const { app } = makeApp()
  const res = await request(app).post('/api/questionnaire/start').send({ lang: 'de' })
  expect(res.status).toBe(400)
})
```
Implémenter : `createSession(client, userId, lang)` persiste la colonne ; `/start` valide `lang ∈ {fr,en}` (défaut `'fr'`, 400 sinon) ; `renderNext`/`/reask`/récap lisent `session.lang` et résolvent tous les textes via `textIn`. Adapter le fake `store` de `makeApp()` pour porter `lang`.

- [x] **Step 5 : Messages d'erreur** — créer `server/lib/messages.js` :
```javascript
// Messages utilisateur bilingues. Clés stables ; le moteur renvoie des clés, les routes traduisent.
export const MESSAGES = {
  fr: { session_required: 'session_id requis', session_not_found: 'Session non trouvée ou expirée', resume_error: 'Erreur lors de la reprise', too_many_requests: 'Trop de requêtes, réessayez dans quelques minutes.', unknown_option: 'Option inconnue', yes_no_expected: 'Réponse oui/non attendue', tristate_expected: 'Valeur attendue : oui, non ou ne_sait_pas', duplicates: 'Doublons dans la sélection', unknown_option_in_selection: 'Option inconnue dans la sélection', text_required: 'Texte requis', date_future: 'La date ne peut pas être dans le futur' /* + les clés restantes rencontrées dans routes/moteur */ },
  en: { session_required: 'session_id required', session_not_found: 'Session not found or expired', resume_error: 'Error while resuming', too_many_requests: 'Too many requests, please try again in a few minutes.', unknown_option: 'Unknown option', yes_no_expected: 'A yes/no answer is expected', tristate_expected: 'Expected value: oui, non or ne_sait_pas', duplicates: 'Duplicate values in selection', unknown_option_in_selection: 'Unknown option in selection', text_required: 'Text required', date_future: 'The date cannot be in the future' },
}
export function msg(lang, key) { return MESSAGES[lang]?.[key] ?? MESSAGES.fr[key] ?? key }
```
Le moteur (`questionnaire-engine.js`) : `fail('Option inconnue')` → `fail('unknown_option')` (etc. pour les 7 chaînes) ; les routes traduisent `check.error` via `msg(session.lang, check.error)`. Adapter `tests/questionnaire-engine.test.ts` (asserte les clés) et le test route « Option inconnue » (asserte le FR traduit). `rate-limit.js` : `message` accepte une fonction `(req) => string` ; `/start` passe `(req) => msg(req.body?.lang === 'en' ? 'en' : 'fr', 'too_many_requests')`.

- [x] **Step 6 : Frontend envoie la langue** — dans `QuestionnairePage.tsx`, le `/start` envoie `{ lang }` (de `useLang()`).

- [x] **Step 7 : Vérifier** — `npm test` → 82 (79 + 2 routes + 1 writer) ; `npx tsc --noEmit` ; `node --check` sur les 6 fichiers serveur ; `npx vite build`. Spot-check Mistral réel (3 générations `statut_professionnel`, `lang: 'en'`, contexte `{ prenom: 'Pierre', relation: 'conjoint_marie' }`) : questions en anglais, ouvertes.

- [x] **Step 8 : Commit**
```bash
git add server supabase/migrations tests src/pages/QuestionnairePage.tsx
git commit -m "feat(i18n): serveur bilingue — catalogue questions {fr,en}, rédacteur EN, langue de session, messages traduits"
```

---

### Task 5 : Vérification finale, E2E, docs

- [x] **Step 1 : Suite complète**
```bash
npx tsc --noEmit && npm test && npx vite build && node --check server/server.js && node --check server/routes/questionnaire.js
```

- [x] **Step 2 : E2E navigateur** (compte de test CLAUDE.md) —
  (a) localStorage vidé + device FR → app en français ;
  (b) toggle → EN : dashboard + **roadmap existante bascule en anglais sans régénération** (vérifier titres d'étapes) ;
  (c) questionnaire complet en EN (questions Mistral en anglais, récap EN, roadmap EN) ;
  (d) un courrier : habillage EN, corps de lettre FRANÇAIS ;
  (e) retour toggle FR : tout rebascule.

- [x] **Step 3 : ⚠️ USER STEP** — appliquer `supabase/migrations/20260713120000_sessions_lang.sql` dans le SQL Editor Supabase (vérif : `select column_name from information_schema.columns where table_name = 'questionnaire_sessions';` liste `lang`).

- [x] **Step 4 : Docs** — CLAUDE.md : ajouter la convention i18n (dictionnaires `src/i18n/`, catalogues jumeaux, langue de session, courriers toujours FR) dans « Conventions » et mettre à jour « Workflow & état du projet ». La branche `demo-en` devient obsolète après merge — noter qu'elle peut être supprimée une fois la présentation passée.

- [x] **Step 5 : Revue globale de branche** (contrôleur) puis `superpowers:finishing-a-development-branch` (merge local dans `main` — Arnaud pushe).

> **Note post-revue Task 5 (revue globale, exécution)** : correctifs appliqués suite à la revue —
> (a) le toggle manquait sur les pages auth et Courriers (déviation de la spec « visible sur toutes
> les pages ») : ajouté dans `AuthLayout` (couvre Login/Signup/Reset) et dans le header de
> `DocumentsPage` ; il reste absent des pages d'erreur et du produit transmission (assumé).
> (b) `document.title` bascule désormais avec la langue (`DOCUMENT_TITLES` dans `src/i18n/index.ts`) ;
> au passage le titre statique d'`index.html` « Seren - Transmission patrimoniale » (slogan de
> l'ancien produit) devient « Seren – Accompagnement après un décès » — **wording produit à valider
> par Arnaud**. (c) accents restaurés dans `legalTitle`/`securityTitle`/contenus du dictionnaire FR ;
> commentaire unicode de `types.ts` réécrit en clair. (d) CLAUDE.md réellement mis à jour
> (convention i18n + état du projet + USER STEP migration marqué bloquant avant déploiement).
> Restent non cochés : E2E questionnaire complet et merge — bloqués sur la migration `lang`
> (USER STEP), le `/start` échouant sans la colonne.

---

**Backlog exclu** (cf. spec) : emails Supabase Auth, locale des montants, traduction des courriers, produit transmission, 3ᵉ locale, re-génération de la question courante lors d'un toggle en pleine session.
