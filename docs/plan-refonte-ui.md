# Refonte UI — concordance landing (DESIGN.md) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'app adopte intégralement le design system de la landing (`DESIGN.md`) : bleu #006BFA, Inter/Inter Tight, pilules, cartes 32px, ombres douces, header sticky blur, accent violet « en cours ».

**Architecture:** Refonte purement visuelle en 5 lots : fondations (tokens `@theme` + polices + Shadcn vars), primitives (Button pilule, formulaires, IconBadge, SectionHeading, badges), header unifié `AppHeader`, puis passes écran par écran (questionnaire/auth, dashboard/roadmap/courriers). Aucune logique, aucun fichier `server/`, aucun test modifié. Spec : `docs/design-refonte-ui.md` ; valeurs : `DESIGN.md` (fait foi).

**Tech Stack:** identique + 2 deps front : `@fontsource-variable/inter`, `@fontsource-variable/inter-tight`. `lucide-react` déjà présent.

**Baseline au départ** : `npm test` → 86 passed ; les 86 restent verts à CHAQUE task (aucun test ne teste le visuel).

**Vérification visuelle** : à chaque task, dev servers (`seren-vite`/`seren-api` via launch.json) + screenshots des écrans touchés (desktop 1280 + mobile 375), FR et EN. Les implémenteurs des Tasks 4-5 invoquent la skill `frontend-design` avant de coder (calibrage qualité visuelle).

---

### Task 0 : Branche

- [x] **Step 1**
```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git checkout main && git checkout -b feat/design-landing
npm test   # 86 passed attendus
```

---

### Task 1 : Fondations — polices, tokens, variables Shadcn

**Files:**
- Modify: `package.json` (2 deps fontsource), `src/index.css` (imports polices + `@theme` + `:root` Shadcn + focus global), `index.html` (retirer les `<link>` Google Fonts Cormorant/DM Sans s'il y en a)

- [x] **Step 1 : Polices** — `npm install @fontsource-variable/inter @fontsource-variable/inter-tight` ; en tête de `src/index.css` :
```css
@import '@fontsource-variable/inter';
@import '@fontsource-variable/inter-tight';
```
Retirer tout chargement Cormorant Garamond / DM Sans (chercher dans `index.html` et `index.css`).

- [x] **Step 2 : `@theme`** — remplacer le bloc par celui de la spec §1 (`docs/design-refonte-ui.md`), en copiant les ombres **verbatim depuis `DESIGN.md` §3**. Les alias historiques (`--color-accent` → `var(--color-primary)`, etc.) font basculer TOUTE l'app d'un coup. `--font-display` = `'Inter Variable'` (titres), `--font-body` = `'Inter Tight Variable'` (corps).

- [x] **Step 3 : Variables Shadcn `:root`** — remapper en HSL : `--primary: 213 100% 49%` (#006BFA), `--primary-foreground: 0 0% 100%`, `--ring: 213 100% 49%`, `--radius: 1rem`, `--background: 0 0% 100%`, `--destructive: 0 72% 51%` (#DC2626), `--secondary`/`--accent`: `211 89% 96%` (#EAF3FE) avec foreground `213 100% 49%`, `--muted: 0 0% 98%`, `--muted-foreground: 240 7% 43%` (#666676), `--border`/`--input: 220 8% 86%` (#D9DBE0).

- [x] **Step 4 : Focus accessible global** — dans `index.css`, règle utilitaire : les interactifs reçoivent au focus clavier `outline-none ring-2 ring-primary/40 ring-offset-2` (via `@layer base` sur `:focus-visible` ou classes des primitives — choisir l'implémentation la plus propre avec Tailwind v4 et documenter).

- [x] **Step 5 : Vérifier** — `npm test` (86) ; `npx tsc --noEmit` ; `npx vite build` ; navigateur : l'app entière a déjà changé de peau (bleu vif, Inter, fonds froids) sans rien casser — screenshots login + dashboard + questionnaire, noter les zones où l'ancien design transparaît encore (guide des tasks suivantes).

- [x] **Step 6 : Commit** — `feat(design): fondations landing — polices Inter, tokens DESIGN.md, variables Shadcn`

---

### Task 2 : Primitives — pilules, formulaires, IconBadge, SectionHeading, badges

**Files:**
- Modify: `src/components/ui/button.tsx`, `src/components/ui/input.tsx` (+ label/select/textarea s'ils existent)
- Create: `src/components/ui/icon-badge.tsx`, `src/components/ui/section-heading.tsx`, `src/components/ui/pill-badge.tsx`

- [x] **Step 1 : Button pilule** — dans `button.tsx` (cva) : base `rounded-full font-body font-medium transition-all gap-2 active:scale-[0.98] disabled:opacity-50`, variantes/tailles de la spec §2 (default h-[51px] px-8 text-[18px] `bg-primary hover:bg-primary-hover text-white` ; `secondary` blanc `shadow-pill` ; `sm` h-[42px] px-6 text-[16px] ; conserver les variantes Shadcn existantes utilisées ailleurs — `ghost`, `outline`, `destructive` — en les re-stylant pilule cohérente). Vérifier chaque usage cassé potentiel (`asChild`, icônes).
- [x] **Step 2 : Formulaires** — `input.tsx` & co : `h-[52px] rounded-2xl border-border bg-white px-4 text-[16px] focus:border-primary` + ring.
- [x] **Step 3 : IconBadge / SectionHeading / PillBadge** — créer selon spec §2 (props `size`, `tone` ; lucide-react pour les icônes ; suivre le style d'API des composants ui/ existants).
- [x] **Step 4 : Vérifier** — tests/tsc/build + navigateur : boutons pilule sur login/questionnaire/dashboard, inputs 52px sur login. Screenshots.
- [x] **Step 5 : Commit** — `feat(design): primitives landing — boutons pilule, formulaires 52px, IconBadge, SectionHeading`

---

### Task 3 : AppHeader unifié (sticky blur)

**Files:**
- Create: `src/components/layout/AppHeader.tsx`
- Modify: `src/pages/DashboardPage.tsx`, `src/pages/QuestionnairePage.tsx`, `src/pages/ProfilePage.tsx`, `src/pages/DocumentsPage.tsx`, `src/components/auth/AuthLayout.tsx`

- [x] **Step 1 : Composant** — `AppHeader` : `sticky top-0 z-50 h-[82px] bg-white/80 backdrop-blur-[16px]` + ombre douce sur-mesure (reprendre la recette Navbar de DESIGN.md §6), wordmark « Seren. » en `font-display` (Inter) `text-primary`, à droite : liens contextuels (props `children` ou API simple), `LanguageSwitch`, Déconnexion. Variante `minimal` pour AuthLayout (logo + LanguageSwitch seulement).
- [x] **Step 2 : Remplacer les 5 headers** — les 4 pages + AuthLayout consomment AppHeader ; supprimer le JSX dupliqué. **NE PAS toucher AccessPage/DemoPage.** Attention aux liens contextuels existants (Tableau de bord vs Courriers selon la page) — préserver la navigation actuelle et les clés i18n.
- [x] **Step 3 : Vérifier** — tests/tsc/build + navigateur : header identique sur toutes les pages, sticky au scroll, toggle FR/EN fonctionnel partout, mobile 375px sans débordement. Screenshots.
- [x] **Step 4 : Commit** — `feat(design): AppHeader unifié sticky blur (5 headers dédupliqués)`

---

### Task 4 : Écrans questionnaire + auth

**Files:**
- Modify: `src/components/questionnaire/{WelcomeScreen,QuestionCard,RecapScreen,CompletionScreen,QuestionnaireProgress}.tsx`, `src/pages/{LoginPage,SignupPage,ResetPassword*}.tsx`, `src/components/auth/*.tsx`, pages d'erreur

⚠️ Invoquer la skill `frontend-design` avant de coder. Suivre la spec §4 : Welcome/Completion en carte héro `rounded-card shadow-card` + IconBadge + italiques de réassurance ; QuestionCard recette B avec options `rounded-2xl` sélection `border-primary bg-primary-light/50`, progression `bg-primary` sur `primary-light`, catégorie en eyebrow ; récap aéré avec Edit pilule sm ; auth en carte `p-10` recette B. **Ne modifier AUCUNE logique ni clé i18n — uniquement classes et structure de présentation.**

- [x] **Step 1 : Questionnaire** (4 composants + progress)
- [x] **Step 2 : Auth + erreurs**
- [x] **Step 3 : Vérifier** — tests/tsc/build ; navigateur : parcours questionnaire réel (compte de test) jusqu'au récap en FR, screenshots de chaque type de question (select/text/date/tristate/multiselect), auth logout/login, mobile. Accessibilité : focus visible sur options et boutons.
- [x] **Step 4 : Commit** — `feat(design): écrans questionnaire et auth au design landing`

---

### Task 5 : Dashboard, roadmap, courriers

**Files:**
- Modify: `src/pages/DashboardPage.tsx`, `src/components/dashboard/{Sidebar,ProgressHero,QuickAccess,RoadmapView,PriorityActions}.tsx`, `src/pages/DocumentsPage.tsx`, `src/components/documents/DocumentCard.tsx`, `src/components/letter/*.tsx`

⚠️ Invoquer la skill `frontend-design` avant de coder. Spec §4 : ProgressHero sur fond `ink` (blancs semi-opaques, barre `primary`) ; Sidebar avec IconBadge sm et actif `bg-primary-light text-primary` ; QuickAccess cartes recette B + IconBadge md (les emoji disparaissent au profit de lucide) ; RoadmapView : SectionHeading par urgence, étapes en cartes denses `rounded-lg`, badges pilule, **violet uniquement pour « en cours »**, check `success` pour complété ; courriers : cartes denses + boutons pilule sm (contenu des lettres INTACT).

- [x] **Step 1 : Dashboard** (hero ink, sidebar, quick access)
- [x] **Step 2 : RoadmapView + PriorityActions**
- [x] **Step 3 : Courriers**
- [x] **Step 4 : Vérifier** — tests/tsc/build ; navigateur : dashboard avec roadmap réelle (compte de test), toggle FR/EN, un courrier ouvert (corps français intact), mobile. Screenshots.
- [x] **Step 5 : Commit** — `feat(design): dashboard, roadmap et courriers au design landing`

---

### Task 6 : Nettoyage, E2E visuel, revue globale, merge

- [x] **Step 1 : Grep anti-résidus** — `grep -rn "3B5998\|FAF9F7\|Cormorant\|DM Sans" src/ index.html` → 0 hors DemoPage/AccessPage (et si ces deux pages ont des hex en dur, les LAISSER). Retirer les alias de transition devenus inutiles si plus aucun consommateur (sinon les garder, documenté).
- [x] **Step 2 : Suite complète** — `npx tsc --noEmit && npm test && npx vite build` (86 verts).
- [x] **Step 3 : E2E visuel navigateur** — parcours complet FR puis toggle EN : auth → questionnaire (2-3 questions) → dashboard → roadmap → courrier. Desktop + 375px. Vérifier : aucun texte illisible, focus clavier visibles, transmission (AccessPage) fonctionnelle avec sa nouvelle peau.
- [x] **Step 4 : Docs** — CLAUDE.md : ligne « Styling » des Conventions mise à jour (palette #006BFA, Inter/Inter Tight, renvoi à `DESIGN.md` et `docs/design-refonte-ui.md`) + état du projet.
- [ ] **Step 5 : Revue globale de branche** (contrôleur) puis `superpowers:finishing-a-development-branch` (merge local dans `main` — Arnaud pushe).
