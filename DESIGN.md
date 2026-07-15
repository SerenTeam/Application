# Seren — Design System

Référence unique du design de Seren. Ce document décrit les fondations visuelles de la landing page et sert de **base réutilisable pour les autres parties du projet** (web app, dashboard, emails…).

- **Source de vérité des tokens** : [`src/app/globals.css`](src/app/globals.css) (bloc `@theme` Tailwind v4). Ne jamais coder une couleur/rayon/ombre en dur sans passer par un token.
- **Stack de référence** : Next.js (App Router) · Tailwind CSS v4 · TypeScript · fonts via `next/font`.
- **Convention** : ✅ = existant (dans le code aujourd'hui) · ➕ = extension recommandée pour la web app (à ajouter, pas encore présent).

---

## 1. Principes de marque & ton

Seren accompagne des personnes après la perte d'un proche. Le design doit **rassurer, clarifier, apaiser** — jamais impressionner.

- **Empathique, clair, sans jargon.** Une action visible à la fois, jamais de surcharge.
- **Apaisant, pas anxiogène.** Ni froid, ni religieux, ni dramatique.
- **Chaleur maîtrisée.** Beaucoup d'espace blanc, angles très arrondis, ombres douces et diffuses, bleu de confiance comme seule couleur forte.
- **Vocabulaire** : jamais « décès » dans les titres d'accroche → « perte d'un proche ». (voir [`CLAUDE.md`](CLAUDE.md) pour le ton éditorial complet)

**Traduction visuelle :** fonds clairs et neutres, une seule couleur d'action (bleu), un accent violet ponctuel, typo à deux graisses lisibles, cartes très arrondies posées sur des ombres légères.

---

## 2. Couleurs

### ✅ Palette (source de vérité)

| Rôle | Token Tailwind | Hex | Usage |
|------|----------------|-----|-------|
| **Primary** | `primary` | `#006BFA` | Couleur d'action unique : boutons, liens, accents, focus |
| Primary hover | `primary-hover` | `#0057D0` | Survol des éléments primary |
| Primary light | `primary-light` | `#EAF3FE` | Fonds de badges, pastilles d'icônes, surbrillances |
| Primary border | `primary-border` | `#B5D4F4` | Bordures teintées bleu |
| **Accent violet** | `violet` | `#6B5CE7` | Accent secondaire ponctuel (étapes « en cours ») |
| Violet light | `violet-light` | `#F2F0FF` | Fond des pastilles d'icônes violettes (souvent `/50`) |
| Page background | `page-bg` | `#F8F8F8` | Fond des pages secondaires (légal, inscription) |
| White | `white` | `#FFFFFF` | Fond principal, cartes |
| Surface | `surface` | `#FAFAFA` | Fond de section alterné, encarts discrets |
| **Ink** | `ink` | `#1D1D1D` | Fond des sections sombres (CTA, Footer) |
| Text | `text` | `#1D1D1D` | Corps de texte par défaut |
| Text heading | `text-heading` | `#333333` | Titres de cartes (h3) |
| Text secondary | `text-secondary` | `#42424A` | Sous-titres, leads, labels |
| Text muted | `text-muted` | `#666676` | Texte secondaire, légendes, placeholders |
| Border | `border` | `#D9DBE0` | Bordures neutres (inputs, séparateurs) |
| Border card | `border-card` | `#F2F0FF` | Bordure très douce des cartes claires |

**Règles d'emploi**
- **Une seule couleur d'action** : le bleu `primary`. Le violet reste un accent rare (jamais un second bouton d'action).
- Sur fond sombre (`ink`), le texte utilise des blancs semi-opaques : `text-white`, `text-white/80`, `/70`, `/60`, `/35`, `/25` selon la hiérarchie.
- Ne pas multiplier les gris : `text` / `text-secondary` / `text-muted` couvrent 99 % des besoins.

### ➕ Couleurs sémantiques (à définir pour la web app)

La landing n'a pas de tokens d'état (seul le rouge d'erreur de formulaire utilise `red-600` de Tailwind par défaut). Une web app en a besoin — à ajouter au `@theme` en restant dans des tons doux, cohérents avec le bleu :

```css
--color-success: #16A34A;  /* vert — confirmation, étape complétée */
--color-warning: #D97706;  /* ambre — attention, délai proche */
--color-error:   #DC2626;  /* rouge — erreur (déjà utilisé via red-600) */
--color-info:    #006BFA;  /* = primary — messages informatifs */
/* + variantes -light (fond) pour chaque, ex. success-light #E9F7EF */
```

---

## 3. Le bloc `@theme` (à copier tel quel)

Point de départ pour un nouveau projet Tailwind v4. Colle ceci dans ton `globals.css` :

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@theme {
  /* Primary */
  --color-primary:        #006BFA;
  --color-primary-hover:  #0057D0;
  --color-primary-light:  #EAF3FE;
  --color-primary-border: #B5D4F4;

  /* Accent violet */
  --color-violet:       #6B5CE7;
  --color-violet-light: #F2F0FF;

  /* Backgrounds */
  --color-page-bg: #F8F8F8;
  --color-white:   #FFFFFF;
  --color-surface: #FAFAFA;

  /* Text */
  --color-text:           #1D1D1D;
  --color-text-heading:   #333333;
  --color-text-secondary: #42424A;
  --color-text-muted:     #666676;
  --color-ink: #1D1D1D;

  /* Borders */
  --color-border:      #D9DBE0;
  --color-border-card: #F2F0FF;

  /* Fonts */
  --font-sans:    var(--font-inter);
  --font-display: var(--font-inter-display);

  /* Radius */
  --radius-card: 2rem;

  /* Shadows */
  --shadow-card:        0px 0.6px 0.6px -1.25px rgba(181,181,181,0.07), 0px 2.3px 2.3px -2.5px rgba(181,181,181,0.06), 0px 10px 10px -3.75px rgba(181,181,181,0.03), 0px 2px 4px 0px rgba(79,79,79,0.08);
  --shadow-card-border: 0px 0.36px 0.36px -1.25px rgba(135,126,135,0.18), 0px 1.37px 1.37px -2.5px rgba(135,126,135,0.16), 0px 6px 6px -3.75px rgba(135,126,135,0.06);
  --shadow-pill:        0px 0.6px 0.6px -1.25px rgba(0,0,0,0.18), 0px 2.3px 2.3px -2.5px rgba(0,0,0,0.16), 0px 10px 10px -3.75px rgba(0,0,0,0.06);
}
```

Ces tokens génèrent automatiquement les classes Tailwind : `bg-primary`, `text-text-muted`, `border-border-card`, `rounded-card`, `shadow-card`, etc.

---

## 4. Typographie

### ✅ Familles

Deux polices Google, chargées via `next/font` et exposées en variables CSS (voir [`src/app/layout.tsx`](src/app/layout.tsx)) :

| Variable | Police | Graisses | Classe | Rôle |
|----------|--------|----------|--------|------|
| `--font-inter` → `--font-sans` | **Inter** | 300, 400, 500, 600 | `font-sans` | **Grands titres** (h1, h2 de section) |
| `--font-inter-display` → `--font-display` | **Inter Tight** | 400, 500, 600 | `font-display` | **Tout le reste** : corps, leads, titres de cartes, boutons, labels, eyebrows |

> ⚠️ **Convention contre-intuitive à retenir** : ici `font-sans` (Inter) est réservé aux **grands titres** en graisse normale, et `font-display` (Inter Tight) porte le **corps de texte et l'UI**. Ne pas inverser.

Mise en place dans un nouveau projet :
```ts
import { Inter, Inter_Tight } from "next/font/google";
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["300","400","500","600"] });
const interDisplay = Inter_Tight({ variable: "--font-inter-display", subsets: ["latin"], weight: ["400","500","600"] });
// <html className={`${inter.variable} ${interDisplay.variable} antialiased`}>
```

### ✅ Échelle typographique (valeurs réelles)

| Rôle | Famille / graisse | Taille (mobile → desktop) | Détails |
|------|-------------------|---------------------------|---------|
| **Hero h1** | `font-sans` normal | 36 → 44 → 50.5px | `leading-[1.18]` `tracking-[-0.5px]` |
| **Titre de section (h2)** | `font-sans` normal | 28 → 32 → 36.5px | `leading-[1.3]` · couleur `text` (ou `white` sur ink) |
| **Eyebrow / kicker** | `font-display` medium | 11–12px | `uppercase` `tracking-[1.5px]` couleur `primary` |
| **Lead / sous-titre** | `font-display` medium | 17 → 19.5px | `leading-[1.6]` couleur `text-secondary` |
| **Titre de carte (h3)** | `font-display` medium | 22px | `leading-[1.3]` couleur `text-heading` |
| **Corps de carte** | `font-display` medium | 17.5px | `leading-[1.54]` couleur `text-muted` |
| **Citation / témoignage** | `font-display` medium *italic* | 19.5px | couleur `text-secondary` |
| **Lien de nav** | `font-sans` | 16px | couleur `text` |
| **Label de formulaire** | `font-display` medium | 14px | couleur `text-secondary` |
| **Meta / légende** | `font-display`/`font-sans` | 12–14px | couleur `text-muted` |

**Principes** : titres en graisse **normale** (jamais bold lourd), corps en **medium** (500) pour la lisibilité, interlignage généreux (1.5–1.64) partout. Les phrases de réassurance sont souvent en *italique* `text-muted`.

---

## 5. Rayons, ombres, espacement

### ✅ Rayons (border-radius)

| Élément | Classe | Valeur |
|---------|--------|--------|
| Cartes (marketing) | `rounded-card` | 2rem (32px) |
| Champs de formulaire | `rounded-2xl` | 1rem (16px) |
| Boutons, badges, pastilles | `rounded-full` | pilule |
| Pastilles d'icônes | `rounded-full` | cercle |

> ➕ **Pour la web app** : `rounded-card` (32px) est très généreux, adapté aux grandes cartes marketing. Pour une UI dense, prévoir des rayons plus petits : `--radius-md: 0.75rem` et `--radius-lg: 1rem`, en gardant 2rem pour les surfaces d'accueil / héros.

### ✅ Ombres

| Token | Usage |
|-------|-------|
| `shadow-card` | Cartes posées sur fond clair (sans bordure) — ombre très diffuse et légère |
| `shadow-card-border` | Cartes avec `border border-border-card` — ombre encore plus subtile |
| `shadow-pill` | Boutons secondaires et éléments flottants |

Style d'ombre = **multi-couches, très douce, faible opacité**. Jamais d'ombre dure ou contrastée (ce serait anxiogène). Deux recettes de carte cohabitent : *ombre seule* (`shadow-card`) ou *bordure + micro-ombre* (`border-border-card` + `shadow-card-border`).

### ✅ Espacement & layout

- **Conteneur** ([`Container`](src/components/ui/Container.tsx)) : `max-w-[1280px]`, padding horizontal `px-6 sm:px-10 lg:px-20`, centré.
- **Rythme vertical de section** : `py-16 lg:py-24` (64px mobile → 96px desktop). Le hero ajoute `sm:py-20`.
- **Marge titre → contenu** : `mb-12 lg:mb-16`.
- **Grilles** : `grid-cols-1 md:grid-cols-3 gap-6` (cartes), `md:grid-cols-2` (témoignages).
- **Alternance de fonds** entre sections pour rythmer : `white` → `surface` → dégradé `from-white to-border-card` → `white` → `ink` (CTA).

> ➕ **Pour la web app** : adopter une échelle d'espacement base 4px (`1=4 · 2=8 · 3=12 · 4=16 · 6=24 · 8=32 · 12=48 · 16=64`) et réduire le rythme (`py-8`/`py-12` en zones denses). Le `max-w-[1280px]` reste une bonne largeur de contenu ; une app avec sidebar peut viser `max-w-[1440px]`.

---

## 6. Composants (spécifications réelles)

### ✅ Boutons — `PillButton` ([source](src/components/ui/PillButton.tsx))

Base commune : `inline-flex items-center justify-center gap-2 rounded-full font-display font-medium transition-all`.

| Variante | Classes | Emploi |
|----------|---------|--------|
| `primary` | `bg-primary text-white hover:bg-primary-hover` | Action principale |
| `secondary` | `bg-white text-text-secondary shadow-pill hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]` | Action secondaire sur fond clair |
| `ghost-dark` | `bg-transparent text-white/80 border border-white/20 hover:border-white/40 hover:text-white` | Action sur fond sombre (`ink`) |

| Taille | Classes |
|--------|---------|
| `lg` (défaut) | `h-[51px] px-8 text-[18px]` |
| `md` | `h-[42px] px-6 text-[16px]` |

Détail : supporte `data-cta-label` / `data-cta-position` pour le tracking GTM ; rend un `<Link>` Next si `href` interne, un `<a>` sinon.

### ✅ Cartes / surfaces

Deux recettes :
```html
<!-- Recette A : ombre seule -->
<div class="rounded-card bg-white p-7 shadow-card">…</div>

<!-- Recette B : bordure douce + micro-ombre -->
<div class="rounded-card border border-border-card bg-white p-7 shadow-card-border">…</div>
```
Padding interne usuel : `p-7` (28px), `p-10` pour les cartes de formulaire.

### ✅ Pastille d'icône — `IconBadge` ([source](src/components/ui/IconBadge.tsx))

Cercle coloré contenant une icône. Tailles `md` (`h-16 w-16` = 64px) / `sm` (`h-10 w-10` = 40px). Tons `primary` (`bg-primary-light`) / `violet` (`bg-violet-light/50`). L'icône à l'intérieur prend `text-primary` ou `text-violet`.

### ✅ En-tête de section — `SectionHeading` ([source](src/components/ui/SectionHeading.tsx))

Triptyque **eyebrow + titre + lead** :
- **eyebrow** : `text-[11px] font-display font-medium uppercase tracking-[1.5px] text-primary`
- **titre (h2)** : `font-sans font-normal`, 28 → 36.5px
- **lead** (optionnel) : `font-display font-medium text-text-secondary`, 17 → 19.5px
- largeur limitée `max-w-xl`

### ✅ Badge / pastille d'info

```html
<span class="rounded-full bg-primary-light px-3 py-1 text-[12px] font-medium uppercase tracking-[0.5px] text-primary">Disponible 24h/24</span>
```
Variante « source / crédit » : `h-[29px] rounded-full border border-border px-4 text-[14px] text-text-secondary`.

### ✅ Formulaires ([source](src/components/InscriptionContent.tsx))

| Élément | Classes |
|---------|---------|
| **Input / select** | `h-[52px] w-full rounded-2xl border border-border bg-white px-4 text-[16px] text-text outline-none transition-colors focus:border-primary` |
| **Label** | `mb-2 block font-display text-[14px] font-medium text-text-secondary` (astérisque requis en `text-primary`) |
| **Bouton submit** | `h-[51px] rounded-full bg-primary text-[18px] font-medium text-white hover:bg-primary-hover` |
| **Message d'erreur** | `text-[14px] text-red-600` |
| **Carte de formulaire** | `rounded-card border border-border-card bg-white shadow-card-border p-10` |

> ➕ La landing utilise seulement `focus:border-primary`. Pour la web app, ajouter un **anneau de focus visible** (accessibilité) — voir §7.

### ✅ Navbar ([source](src/components/layout/Navbar.tsx))

`sticky top-0 z-50`, hauteur `h-[82px]`, fond `rgba(255,255,255,0.8)` + `backdrop-blur-[16px]`, ombre douce sur-mesure. Liens `text-[16px] text-text`. Menu mobile en burger sous `lg`. Contient le sélecteur de langue FR/EN.

### ✅ Sections sombres (CTA, Footer)

Fond `bg-ink`, texte en blancs semi-opaques. Le CTA reprend la même structure titre + lead + boutons, centrée. Utiliser la variante de bouton `ghost-dark` pour les actions secondaires sur ces fonds.

### ✅ Icônes

Style **trait (outline), façon Feather/Lucide** : SVG inline `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap/linejoin="round"`. Tailles rendues : 16px (nav/inline), 20px (boutons), 28px (pastilles). La couleur suit `currentColor` → pilotée par `text-*`.

> ➕ Pour la web app, installer [`lucide-react`](https://lucide.dev) plutôt que d'inliner : même style visuel, cohérent avec l'existant.

---

## 7. Étendre à une web application

Le langage visuel de la landing (bleu, cartes arrondies, ombres douces, deux graisses Inter) se transpose directement. Voici ce qu'une **application** doit ajouter par rapport à une landing :

### ➕ États interactifs
Définir systématiquement pour chaque composant cliquable :
- **hover** : déjà couvert (`primary-hover`, ombres).
- **focus-visible** (accessibilité, manquant aujourd'hui) : `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2`.
- **active** : léger enfoncement (`active:scale-[0.98]` ou assombrissement).
- **disabled** : `opacity-50 cursor-not-allowed`.
- **loading** : spinner + bouton non cliquable.

### ➕ Accessibilité
- Contraste : `text-muted` (#666676) sur blanc passe AA pour le texte normal ; éviter les blancs `/25`–`/35` pour du texte utile (réservés au décoratif).
- Toujours un anneau de focus visible au clavier.
- Cibles tactiles ≥ 44px (les hauteurs `h-[42px]`/`h-[51px]`/`h-[52px]` conviennent).

### ➕ Composants applicatifs à créer (dans le même style)
Barre latérale de navigation · barre supérieure (topbar) · tableaux de données · modale / dialog · menu déroulant · onglets (tabs) · toasts / notifications · tooltip · avatar · champ de formulaire avec texte d'aide + erreur · pagination · états vides (empty states) · fil d'ariane.

Garder pour tous : rayons cohérents, `shadow-card` pour les surfaces surélevées, `shadow-pill`/`shadow-card-border` pour les éléments flottants (menus, popovers), transitions douces.

### ➕ Fondations à formaliser
- **Couleurs sémantiques** success/warning/error/info (voir §2).
- **Échelle d'espacement** base 4px (voir §5).
- **Rayons intermédiaires** `--radius-md`/`--radius-lg` (voir §5).
- **Z-index** : définir une échelle (base `0`, dropdown `10`, sticky `20`, overlay `40`, modal `50`, toast `60`).
- **Motion** : durées 150–200ms, `ease-out`, `transition-colors`/`transition-all`. Rester **subtil** — la marque est apaisante, pas d'animations tape-à-l'œil.
- **Dark mode** : la landing a des *sections* sombres (`ink`) mais **pas** de thème sombre complet. Une app qui en veut un devra introduire une couche de tokens `light`/`dark` (ex. via `data-theme`) — non trivial, à décider explicitement.

---

## 8. À faire / à ne pas faire

**✅ À faire**
- Passer par les tokens (`bg-primary`, `text-text-muted`…), jamais de hex en dur.
- Une seule couleur d'action (bleu) ; violet en accent rare.
- Beaucoup d'espace, ombres douces, angles arrondis.
- Titres en graisse normale (`font-sans`), corps en medium (`font-display`).
- Vérifier `globals.css` avant d'ajouter une couleur.

**🚫 À ne pas faire**
- Inverser `font-sans` / `font-display` (voir §4).
- Ombres dures, bordures épaisses, couleurs saturées multiples.
- Un second bouton d'action en violet.
- Du texte utile en blanc très transparent (`/25`, `/35`).
- Introduire une librairie de composants tierce sans vérifier la cohérence avec ces tokens.

---

*Source de vérité des valeurs : [`src/app/globals.css`](src/app/globals.css). En cas de divergence, le code fait foi — mets ce document à jour en conséquence.*
