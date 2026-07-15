# Design — Refonte UI : concordance avec la landing page (DESIGN.md)

> Document de conception destiné à un agent d'implémentation.
> Rédigé le 2026-07-15. Contexte projet : voir `CLAUDE.md`.
> **Source de vérité visuelle : `DESIGN.md`** (design system de la landing, copié à la racine du repo). Ce document ne redéfinit pas les valeurs — il spécifie la TRANSPOSITION à l'app. En cas de doute sur une valeur : `DESIGN.md` fait foi.

## Objectif

Aligner l'application (auth, questionnaire, dashboard, courriers) sur le langage visuel de la landing : bleu `#006BFA` seule couleur d'action, violet ponctuel, Inter/Inter Tight, pilules, cartes très arrondies, ombres multi-couches douces, beaucoup d'air. **Refonte profonde** : fondations (tokens) + primitives + header unifié + passes écran par écran.

## Décisions verrouillées (2026-07-15, brainstorming avec Arnaud)

- **Typo : Inter partout.** Le serif Cormorant Garamond disparaît, y compris le wordmark « Seren. ». Familles et rôles de la landing : Inter en **titres graisse normale**, Inter Tight **medium** pour corps/UI.
- **Produit transmission inclus visuellement** : il consomme les tokens partagés, son apparence suit. AUCUNE modification de sa logique, de ses routes ou de sa structure JSX au-delà de ce que les tokens propagent (règle « ne pas toucher » maintenue pour le reste).
- **Refonte profonde** : navbar sticky blur, patterns de la landing (SectionHeading, IconBadge, PillButton), pas seulement un remap de couleurs.
- Chargement des polices : **@fontsource** (Vite — pas de next/font) : `@fontsource-variable/inter` + `@fontsource-variable/inter-tight`, importées dans `index.css`. Auto-hébergées (pas de requête Google Fonts — cohérent RGPD/CSP).
- **Pas de dark mode** (explicitement hors périmètre, cf. DESIGN.md §7).
- Les **tests existants (86)** ne doivent pas bouger : la refonte est purement visuelle (classes/markup), aucune logique.

## 1. Fondations — nouveau `@theme` de `src/index.css`

Remplacer le bloc actuel par les tokens de `DESIGN.md` §3 **+ extensions §7** (sémantiques, rayons intermédiaires, z-index), **+ alias de transition** pour les noms historiques de l'app afin que tout l'existant bascule immédiatement :

```css
@theme {
  /* ── Tokens landing (DESIGN.md §3) ── */
  --color-primary:        #006BFA;
  --color-primary-hover:  #0057D0;
  --color-primary-light:  #EAF3FE;
  --color-primary-border: #B5D4F4;
  --color-violet:       #6B5CE7;
  --color-violet-light: #F2F0FF;
  --color-page-bg: #F8F8F8;
  --color-surface: #FAFAFA;
  --color-ink:     #1D1D1D;
  --color-text:           #1D1D1D;
  --color-text-heading:   #333333;
  --color-text-secondary: #42424A;
  --color-text-muted-l:   #666676;
  --color-border-l:       #D9DBE0;
  --color-border-card:    #F2F0FF;

  /* ── Sémantiques (DESIGN.md §2 ➕) ── */
  --color-success: #16A34A;  --color-success-light: #E9F7EF;
  --color-warning: #D97706;  --color-warning-light: #FDF3E7;
  --color-error:   #DC2626;  --color-error-light:   #FDECEC;

  /* ── Polices (familles/rôles landing, noms app conservés) ── */
  --font-display: 'Inter Variable', -apple-system, sans-serif;        /* TITRES, graisse normale */
  --font-body:    'Inter Tight Variable', -apple-system, sans-serif;  /* corps/UI, medium */

  /* ── Rayons (DESIGN.md §5 + ➕) ── */
  --radius-sm: 8px;  --radius-md: 0.75rem;  --radius-lg: 1rem;  --radius-card: 2rem;

  /* ── Ombres (DESIGN.md §3, verbatim) ── */
  --shadow-card: …;  --shadow-card-border: …;  --shadow-pill: …;   /* copier de DESIGN.md */

  /* ── Alias de transition (noms historiques → nouvelles valeurs) ── */
  --color-bg: #FFFFFF;                       /* fond principal : blanc (pages denses : page-bg) */
  --color-bg-card: #FFFFFF;
  --color-accent: var(--color-primary);
  --color-accent-soft: var(--color-primary-light);
  --color-accent-hover: var(--color-primary-hover);
  --color-text-soft: var(--color-text-secondary);
  --color-text-muted: var(--color-text-muted-l);
  --color-border: var(--color-border-l);
  --color-border-soft: #EDEEF2;
  --shadow-sm: var(--shadow-card-border);  --shadow-md: var(--shadow-card);  --shadow-lg: var(--shadow-card);
}
```

Notes : (a) `--color-text-muted-l`/`--color-border-l` évitent la collision avec les alias historiques `text-muted`/`border` — les NOUVEAUX composants utilisent les noms landing (`text-text-muted` → valeur #666676 via l'alias, c'est identique) ; simplifier si possible en faisant pointer directement les noms historiques. (b) Mettre à jour les **variables Shadcn `:root`** en HSL équivalentes (`--primary: 213 100% 49%`, `--ring` idem, `--radius: 1rem`, backgrounds blancs/neutres froids au lieu des chauds). (c) `focus-visible` global : `focus-visible:ring-2 ring-primary/40 ring-offset-2` sur les primitives interactives.

## 2. Primitives (dans le style DESIGN.md §6)

- **`components/ui/button.tsx` (Shadcn)** : variantes remappées en **pilules** — `default` = `rounded-full bg-primary text-white hover:bg-primary-hover h-[51px] px-8 text-[18px]` (taille `default` = lg landing ; `sm` = h-[42px] px-6 text-[16px]) ; `secondary` = blanc + `shadow-pill` ; `outline` → style « ghost-dark » réservé aux fonds `ink`, sinon secondary ; `font-body font-medium` ; états focus-visible/active/disabled de DESIGN.md §7.
- **Formulaires** : inputs/selects `h-[52px] rounded-2xl border-border bg-white px-4 text-[16px] focus:border-primary` + ring accessible ; labels `font-body text-[14px] font-medium text-text-secondary` ; erreurs `text-[14px] text-error`.
- **`IconBadge`** (nouveau, `components/ui/icon-badge.tsx`) : cercle `md` 64px / `sm` 40px, fonds `primary-light` ou `violet-light/50`, icône **lucide-react** `text-primary`/`text-violet` — remplace les emoji (📊🗺️📄📞) de la Sidebar/QuickAccess.
- **`SectionHeading`** (nouveau, `components/ui/section-heading.tsx`) : eyebrow uppercase `tracking-[1.5px] text-primary text-[11px]` + titre `font-display font-normal` + lead `font-body font-medium text-text-secondary` — pour les têtes de pages/sections (Roadmap, Documents, écrans questionnaire).
- **Badges pilule** : urgence/état → `rounded-full bg-primary-light px-3 py-1 text-[12px] font-medium uppercase tracking-[0.5px] text-primary` (déclinés success/warning/violet).
- **Cartes** : recette A `rounded-card bg-white p-7 shadow-card` (surfaces d'accueil : Welcome, Completion, cartes de formulaire auth en `p-10`) ; recette B `border border-border-card shadow-card-border` ; **UI dense** (étapes roadmap, listes) : `rounded-lg` (1rem) + `shadow-card-border`.

## 3. Header unifié — `AppHeader` (nouveau)

Le header est aujourd'hui dupliqué inline dans 4 pages + `AuthLayout`. Créer `components/layout/AppHeader.tsx` : `sticky top-0 z-50 h-[82px] bg-white/80 backdrop-blur-[16px]` + ombre douce, wordmark « Seren. » en Inter (plus de serif), liens `text-[16px]`, `LanguageSwitch` intégré, bouton Déconnexion. Remplacer les headers de `DashboardPage`, `QuestionnairePage`, `ProfilePage`, `DocumentsPage` et le header d'`AuthLayout`. **Exception : `AccessPage`/`DemoPage` gardent leur header inline actuel** (produit gelé — seuls les tokens les traversent).

## 4. Passes écran par écran

- **Welcome/Completion (questionnaire)** : carte héro `rounded-card shadow-card`, IconBadge cœur/check, boutons pilule lg, phrases de réassurance en italique `text-muted`.
- **QuestionCard** : carte recette B ; options en cartes cliquables `rounded-2xl border-border hover:border-primary` + état sélectionné `border-primary bg-primary-light/50` ; barre de progression fine `bg-primary` sur `primary-light` ; catégorie en eyebrow.
- **Récap** : lignes question/réponse aérées, boutons Edit en pilule `sm` secondary, CTA final pilule primary.
- **Auth (AuthLayout + formulaires)** : carte `rounded-card border-border-card shadow-card-border p-10`, inputs 52px, submit pilule pleine largeur.
- **Dashboard** : `ProgressHero` sur fond **`ink`** (transposition des sections sombres CTA de la landing) — titres blancs, stats en blancs semi-opaques, barre de progression `primary` ; Sidebar avec IconBadges `sm`, état actif `bg-primary-light text-primary` ; QuickAccess en cartes recette B + IconBadge md.
- **RoadmapView** : sections par urgence avec SectionHeading (eyebrow) ; étapes en cartes denses `rounded-lg` ; badge d'urgence pilule ; **état « en cours » = accent violet** (bordure/pastille `violet`, fond `violet-light/50`) — seul usage du violet ; étape complétée : check `success`.
- **Courriers (DocumentsPage/letter)** : cartes denses, boutons d'action pilule `sm`, le CONTENU des lettres inchangé.
- **Pages d'erreur/404** : carte centrée recette A, CTA pilule.

## 5. Ce qui ne change PAS

Logique, routes, i18n (les dictionnaires sont du texte — intacts), tests (86), moteur/serveur (aucun fichier `server/` touché), contenu des courriers, structure JSX de `DemoPage`/`AccessPage`.

## 6. Vérification

- `npx tsc --noEmit`, `npm test` (86 — aucun test ne dépend du visuel), `npx vite build`.
- **Revue visuelle navigateur** à chaque task (screenshots) : auth, questionnaire (4 types de questions), récap, completion, dashboard, roadmap, courriers — en FR et EN, desktop + mobile (375px).
- Accessibilité : focus visible au clavier sur chaque interactif, contrastes AA (pas de texte utile sous `text-muted`), cibles ≥ 44px.
- Grep final anti-régression : aucun hex en dur hors tokens (`#3B5998`, `#FAF9F7`, `Cormorant`, `DM Sans` → 0 occurrence hors `DemoPage`/`AccessPage` si elles en avaient).

## Hors périmètre (backlog)

Dark mode complet, emails transactionnels, refonte structurelle de DemoPage/AccessPage, animations au-delà des transitions douces 150-200ms.
