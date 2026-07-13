# Design — i18n FR/EN : détection de langue + bascule à l'exécution

> Document de conception destiné à un agent d'implémentation.
> Rédigé le 2026-07-13. Contexte projet : voir `CLAUDE.md`.
> Prérequis : les traductions anglaises existent déjà sur la branche `demo-en` (commits `84281de` serveur, `88bceb1` catalogue d'étapes, `be3fbc2` + `b330e25` UI React) — ce chantier les **réassemble** en infrastructure bilingue, il ne retraduit rien.

## Objectif

1. **Détection** : un device configuré en anglais (`navigator.language` commençant par `en`) voit l'application en anglais au premier chargement ; tout autre device voit le français.
2. **Bascule manuelle** : un toggle FR/EN dans le header permet de changer de langue à tout moment, quelle que soit la langue du device. Le choix persiste (`localStorage`).
3. **Périmètre bilingue** : UI React, catalogue d'étapes (roadmap), questionnaire (questions rédigées par Mistral, options, récap), messages d'erreur visibles.

## Décisions verrouillées (2026-07-13, brainstorming avec Arnaud)

- **Courriers TOUJOURS en français** dans les deux langues : ils sont destinés à des organismes français. Seul l'habillage UI autour (boutons, formulaire de variables) est bilingue. `src/data/letter-templates*` n'est pas touché.
- **Produit transmission** (`/api/demo/*`, `DemoPage`, `AccessPage`) : hors périmètre, reste français (produit gelé, cf. CLAUDE.md).
- **Langue de session questionnaire figée au `/start`** : le rédacteur Mistral écrit dans la langue de la session. Un toggle en cours de questionnaire change l'habillage UI immédiatement, mais le texte des questions suit la langue de session jusqu'au prochain questionnaire (simplicité ; pas de re-génération).
- **Pas de nouvelle dépendance** : dictionnaires TypeScript typés maison plutôt que react-i18next (cohérent avec la culture d'invariants du repo : la parité des clés FR/EN est garantie par `tsc`, pas par un fallback runtime). react-i18next redeviendra pertinent si >2 locales ou lazy-loading.

## Architecture

### 1. Cœur i18n frontend — `src/i18n/`

```typescript
// src/i18n/index.ts
export type Lang = 'fr' | 'en'

export function detectLang(): Lang {
  const saved = localStorage.getItem('seren_lang')
  if (saved === 'fr' || saved === 'en') return saved
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'fr'
}
```

- `LanguageProvider` (contexte React) expose `{ lang, setLang }` ; `setLang` persiste dans `localStorage('seren_lang')`.
- Hook `useLang()` + helper `useT()` qui retourne le dictionnaire de la langue active.
- Interpolation : helper `fmt(template, vars)` pour les chaînes à variables (`{name}`, `{count}`).
- Toggle `LanguageSwitch` dans le header (`FR | EN`), visible sur toutes les pages.

### 2. Dictionnaires UI typés — `src/i18n/strings.fr.ts` / `strings.en.ts`

```typescript
// strings.fr.ts définit la forme ; strings.en.ts DOIT avoir exactement les mêmes clés :
export const STRINGS_FR = { welcome: { title: 'Nous sommes là…', … }, … }
export type Strings = typeof STRINGS_FR
// strings.en.ts
export const STRINGS_EN: Strings = { … } // ← tsc échoue si une clé manque ou diverge
```

Organisation par domaine (welcome, auth, questionnaire, recap, completion, dashboard, roadmap, letters, layout, errors) — miroir de `src/components/`. Les chaînes FR sont extraites de `main`, les EN de `demo-en` (`git show demo-en:<fichier>`).

### 3. Catalogue d'étapes bilingue — `src/data/`

- `steps-catalog.ts` devient la **source structurelle** : il garde l'interface `StepTemplate` et exporte `getStepsCatalog(lang)`.
- Les données vivent dans `steps-catalog.fr.ts` (contenu actuel de `main`) et `steps-catalog.en.ts` (contenu de `demo-en`, commit `88bceb1`).
- **Invariant de parité** (nouveau test dans `tests/invariants.test.ts`) : les deux catalogues ont exactement les mêmes `id` dans le même ordre, et des champs structurels identiques (`applicable_when` deep-equal, `theme`, `urgency`, `responsable`, `requires_notary`, `organisme_key`, `source_url`, `letter_template_id`, `display_order`). Seuls les champs textuels peuvent différer.
- `generateRoadmap()` prend la langue en paramètre (langue active au moment de la génération) — le schéma BDD ne change pas.

### 4. Affichage de la roadmap : résolution par `template_id`

Constat : la table `steps` fige `title` et `urgency_label` à la génération, mais la description et les actions sont déjà résolues **à l'affichage** depuis le catalogue via `template_id`. Décision :

- Le dashboard résout **aussi** `title` et `urgency_label` depuis le catalogue de la langue active (valeurs BDD conservées en fallback si le `template_id` est inconnu).
- Effet produit : **une roadmap générée en français bascule intégralement en anglais au toggle**, sans régénération ni migration.

### 5. Serveur — questionnaire bilingue

- **Catalogue de questions** (`server/lib/questions-catalog.js`) : les champs textuels deviennent bilingues *dans le même objet* — `fallback_text: { fr: '…', en: '…' }`, idem `aide`, `writer_hints`, `label` des options. Pas de double catalogue → aucune divergence structurelle possible ; le moteur (`questionnaire-engine.js`) ne lit jamais les textes, il n'est **pas modifié**. Les textes EN viennent de `demo-en` commit `84281de`.
- **Sessions** : nouvelle colonne `lang text not null default 'fr' check (lang in ('fr','en'))` sur `questionnaire_sessions` (migration versionnée). `/start` accepte `{ lang }` (validé, défaut `fr`) et le stocke ; `renderNext`/`/reask`/`/resume` lisent la langue de la session.
- **Rédacteur** (`writer-prompt.js`) : `buildWriterMessages(spec, context, lang)` — instructions FR actuelles pour `fr`, instructions EN (de `demo-en`) pour `en`. Mêmes contraintes dans les deux langues (formulation ouverte, jamais de placeholder prénom, PII limitée).
- **Messages d'erreur visibles** (routes, moteur via `check.error`, rate-limit) : mini-helper serveur `msg(lang, key)` avec table FR/EN. Les erreurs du moteur restent des clés internes traduites au niveau route (le moteur reste agnostique).
- **Récap** : les labels de question du récap sortent du catalogue dans la langue de session.

### 6. Ce qui ne change PAS

- Schéma BDD des `steps`/`roadmaps` (aucune migration hors colonne `lang` des sessions).
- Moteur du questionnaire (ids, values, `applicable_when`, purge, invariants existants).
- Courriers (contenu FR), produit transmission, PDF, analytics.
- La règle PII vers Mistral (prénom + relation + dernière réponse fermée uniquement).

## Points de vigilance pour l'implémentation

1. **Chaînes en échappements unicode** (`è`) : le grep d'accents ne les voit pas — balayer aussi `\\u00` (leçon de la démo : `QuickAccess.tsx`).
2. **Zod/validation** (`src/utils/validation.ts`) : les messages d'erreur de formulaires doivent passer par les dictionnaires (fonction de messages paramétrée par lang, pas de constantes figées à l'import).
3. **`document.title` / `lang` HTML** : basculer `<html lang>` et le titre d'onglet avec la langue.
4. **Tests existants** : les assertions sur textes FR (routes, writer) doivent viser la langue explicite (`lang: 'fr'`) pour rester stables ; ajouter les assertions EN symétriques clés.
5. **Render** : aucun changement d'env requis (la langue est 100 % client + session).

## Tests (résumé)

- Parité structurelle FR/EN des catalogues d'étapes (nouvel invariant).
- Parité des clés de dictionnaires UI : garantie par `tsc` (`STRINGS_EN: Strings`).
- `detectLang()` : en-US → en, en-GB → en, fr-FR → fr, absent → fr, localStorage prioritaire.
- Routes : `/start` avec `lang: 'en'` → question rédigée EN (fake writer), session persiste la langue, `/resume` reprend en EN ; défaut FR inchangé.
- Writer : `buildWriterMessages(spec, ctx, 'en')` contient les instructions EN ; parité des contraintes (options fournies, pas de placeholder).
- E2E navigateur : device EN → app EN ; toggle EN→FR en cours de dashboard → roadmap bascule sans régénération ; questionnaire complet dans chaque langue.

## Backlog explicitement exclu

Emails Supabase Auth (templates dans le Dashboard, non versionnés), locale des montants (formats FR conservés : « 5 965 € »), traduction des courriers, produit transmission, 3ᵉ locale.
