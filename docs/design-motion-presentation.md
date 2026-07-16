# Design — Motion de présentation (30 s, boucle)

> Document de conception destiné à un agent d'implémentation.
> Rédigé le 2026-07-16. Contexte projet : voir `CLAUDE.md` ; design system : voir `DESIGN.md`.
> Storyboard validé sur animatique interactive (v3) pendant le brainstorming — la description ci-dessous en est la source de vérité versionnée.

## Objectif

Un motion design de présentation du produit d'environ **30 secondes**, qui tourne **en boucle silencieuse** sur un écran pendant les pitchs et présentations (fond de salle, stand, salle d'attente). Il doit être compréhensible **sans son**, sans début/fin marqués (boucle invisible), et exister en **FR et EN**.

## Décisions verrouillées (issues du brainstorming)

- **Usage** : pitch / présentation, joué en fond, en boucle, silencieux.
- **Narratif** : mixte — ouverture « problème » (l'accumulation de démarches), puis **parcours produit** (questionnaire → roadmap → courriers), signature finale.
- **Direction visuelle** : hybride — métaphore des papiers qui s'apaisent, puis UI produit stylisée, puis signature logo.
- **Langues** : FR + EN dans le même fichier, bascule instantanée ; FR par défaut.
- **Lecture le jour J** : navigateur en plein écran — **un seul fichier HTML autonome**, fonctionnel **sans internet**.
- **Technique** : GSAP 3 minifié inliné (licence standard, gratuite y compris usage commercial), timeline maître `repeat: -1`.
- **Final (S5)** : fond **bleu logo `#297FF3`** en reveal circulaire, « S » crème `#F3EEDD`, wordmark et tagline **blancs**.
- **S1 densifiée** : ~14 documents en cascade accélérée — effet « ça déborde », sans jamais être anxiogène.

## Livrable

```
motion/seren-motion.html        (nouveau dossier à la racine du repo)
```

- Hors de `src/` : **invisible pour le build Vite, les tests et le serveur Express** — zéro impact sur l'app.
- Autonome : GSAP, polices et logos embarqués dans le fichier. Aucune requête réseau à l'ouverture.
- Poids cible : **< 500 KB**.

## Storyboard (validé, animatique v3)

Cycle de 30 s. Les fenêtres indicatives peuvent glisser de ±0,5 s à l'implémentation si le rythme le demande.

| # | Fenêtre | Scène | Contenu visuel | Texte FR (caption) | Texte EN |
|---|---------|-------|----------------|--------------------|----------|
| S1 | 0 – 5,5 s | Le débordement, en douceur | ~14 documents (3 tailles) apparaissent en cascade **qui s'accélère** (~0,9 s entre les premiers, ~0,3 s entre les derniers), inclinaisons variées, jusqu'à cerner le message central. Flottement continu très léger (±2 px). | « Après la perte d'un proche, les démarches s'accumulent. » | "After losing someone close, the paperwork piles up." |
| S2 | 5,5 – 11 s | Le questionnaire | Les papiers glissent et se rangent **dans** une carte blanche arrondie qui devient l'écran du questionnaire : une question, 3 réponses en pilules, la première se sélectionne (fond `#EAF3FE`, bord `#006BFA`, point radio). | « Seren commence par quelques questions. » | "Seren starts with a few questions." |
| S3 | 11 – 17,5 s | La roadmap | La carte s'étire et devient le parcours : en-tête « Vos démarches » + « 2 sur 8 complétées », barre de progression 25 % → ~31 % (progression douce, cohérente avec le libellé statique — l'étape passe « en cours », pas « complétée »), 4 étapes. « Clôture bancaire » passe **En cours** (pastille et badge violets). | « Votre parcours, dans le bon ordre. » | "Your path, in the right order." |
| S4 | 17,5 – 24 s | Les courriers | L'étape « Clôture bancaire » s'ouvre en courrier : objet visible, 4 lignes skeleton qui « s'écrivent », bouton pilule bleu « Télécharger en PDF », puis badge vert « Envoyé ». | « Les courriers sont déjà rédigés, avec les bons mots. » | "Letters already written, with the right words." |
| S5 | 24 – 30 s | Signature bleue | Le courrier se replie ; un **cercle bleu `#297FF3`** envahit l'écran depuis le centre. Logo : « S » crème + wordmark blanc, puis tagline blanche. En toute fin : fondu doux vers le blanc. | « On s'occupe du reste. » | "We'll handle the rest." |

### Transitions continues (règle d'or)

**Jamais de fondu sec entre scènes** : chaque scène se transforme en la suivante (c'est ce qui distingue le motion d'un diaporama).

- S1 → S2 : les papiers convergent et glissent dans la carte questionnaire.
- S2 → S3 : la carte s'étire ; la question sort, les étapes entrent.
- S3 → S4 : la ligne « Clôture bancaire » s'ouvre et devient le courrier.
- S4 → S5 : le courrier se replie au centre ; le cercle bleu part de ce point.
- S5 → S1 : fondu vers blanc + réapparition du premier papier = **raccord de boucle invisible**.

### Contenus exacts des écrans produit

Toutes ces chaînes sont dans `STRINGS` (FR/EN). Les libellés réutilisent le vocabulaire de la landing (`../landing/src/i18n/dictionaries.ts`) :

- **S2 — question** : « Quel était votre lien avec la personne ? » / "What was your relationship to them?" — options : « Mon père ou ma mère » (sélectionnée), « Mon conjoint ou ma conjointe », « Un autre proche » / "My father or mother", "My spouse or partner", "Someone else close".
- **S3 — roadmap** : « Vos démarches » / "Your steps" (vocabulaire produit — jamais "tasks") ; « 2 sur 8 complétées » / "2 of 8 completed" ; étapes : « Acte de décès » (Complété, vert) / "Death certificate" (Completed) ; « Clôture bancaire » (→ En cours, violet) / "Closing bank accounts" (In progress) ; « Caisse de retraite » / "Pension fund" ; « Mutuelle santé » / "Health insurance".
- **S4 — courrier** : « Objet : Clôture du compte — succession » / "Subject: Account closure — estate" ; « Télécharger en PDF » / "Download as PDF" ; « Envoyé » / "Sent".
- **S5 — tagline** : « On s'occupe du reste. » / "We'll handle the rest." (ligne 3 du hero landing).

## Direction artistique

- **Couleurs** (tokens `DESIGN.md`) : fonds `#FFFFFF`/`#F8F8F8` ; texte `#1D1D1D`, secondaire `#42424A` ; action `#006BFA` + `#EAF3FE` ; **violet `#6B5CE7` réservé à l'état « en cours »** ; succès `#16A34A` / fond `#E9F7EF` ; bordures `#D9DBE0` et `#F2F0FF`. Le **bleu logo `#297FF3`** et le **crème `#F3EEDD`** sont réservés à la S5 (identité logo).
- **Typo** : Inter (captions, graisse 400, tracking −0,5 px — jamais de bold lourd), Inter Tight (textes UI des cartes, 500). Captions ≥ 60 px dans la composition 1920×1080 (lisible à 4–5 m).
- **Formes** : cartes très arrondies (22–32 px), pilules, ombres multi-couches douces (recettes `DESIGN.md` §5).
- **Rythme** : lent, apaisé. Eases GSAP `power2.out` / `power3.inOut` ; pas de bounce nerveux, pas d'overshoot appuyé. Micro-flottements continus sur les éléments posés pour que l'écran ne semble jamais figé.
- **Ton** : jamais anxiogène — pas de rouge, pas de secousses, pas de vibration ; l'accumulation de S1 reste feutrée (ombres douces, apparitions en fondu + translation 9 px).

## Architecture technique

Un seul fichier, structuré en blocs :

```
motion/seren-motion.html
├── <style>    composition (#stage 1920×1080), classes des éléments
├── HTML       les 5 scènes (DOM statique), logos SVG inline
├── <script>   GSAP 3.x minifié (vendored tel quel)
├── <script>   STRINGS = { fr: {...}, en: {...} } + injection des textes (data-i18n)
└── <script>   timeline maître + contrôles clavier
```

- **Composition fixe** : `#stage` 1920×1080, centré, `transform: scale(min(innerWidth/1920, innerHeight/1080))` recalculé au `resize` — letterbox blanc sur écrans non 16:9, jamais de rognage.
- **Timeline** : une fonction par scène qui retourne un sous-timeline ; assemblage avec labels (`tl.add(scene2(), "s2")`) ; `repeat: -1`. Les transitions continues sont des tweens qui chevauchent les labels (`"s2-=0.6"`).
- **i18n** : chaque nœud textuel porte `data-i18n="cle"` ; `applyLang(lang)` remplit tout le DOM depuis `STRINGS` ; langue initiale `?lang=en` sinon `fr` ; touche **L** bascule à chaud (la timeline continue, seuls les textes changent).
- **Contrôles clavier** (aucune UI visible) : **Espace** = `tl.paused(!tl.paused())` ; **F** = `requestFullscreen()` ; **L** = langue. Curseur masqué après 3 s d'inactivité (`cursor: none`).
- **Performance** : uniquement `transform` + `opacity` (compositor) ; `will-change` limité aux papiers de S1 ; aucun `filter`/`blur` animé ; cible 60 fps sur laptop standard.
- **Polices embarquées** : Inter (400) + Inter Tight (500/600), subset latin, woff2 encodés base64 dans une `@font-face` inline ; fallback `system-ui`. Source des woff2 au moment de l'implémentation : Google Fonts (gstatic) ou google-webfonts-helper — c'est la seule étape de l'implémentation qui requiert le réseau.
- **Logos** : SVG inline repris de `../landing/public/logo-full.svg` (S recoloré `#F3EEDD`, wordmark recoloré `#FFFFFF` pour la S5).

## Hors scope v1

- Export MP4 (possible plus tard par capture d'écran ou script Playwright — non inclus).
- Formats portrait / carrés pour réseaux sociaux.
- `prefers-reduced-motion` (asset de pitch joué sur un écran contrôlé, pas un site public).
- Toute intégration à l'app (aucune route, aucun composant partagé, aucun import).

## Critères d'acceptation

1. **Boucle** : 30 s ±1 s ; regardée 3 cycles complets, aucun raccord visible entre S5 et S1.
2. **Sans son** : les 5 captions lisibles de loin (≥ 60 px à 1920×1080) ; le parcours produit compréhensible sans narration.
3. **i18n** : `?lang=en` et touche L basculent **100 % des chaînes** (captions + UI des cartes) ; aucune chaîne FR résiduelle en mode EN, et réciproquement.
4. **Offline** : wifi coupé, le fichier s'ouvre et s'anime intégralement ; onglet Network vide (0 requête).
5. **Écrans** : plein écran propre en 16:9 (1080p) **et** non-16:9 (16:10 MacBook) — letterbox, jamais de rognage ni de scroll.
6. **Contrôles** : Espace pause/reprend, F plein écran, L langue ; curseur disparaît après 3 s.
7. **Isolation** : `npm run build` et `npm test` strictement inchangés (aucun fichier de l'app touché).
8. **Poids & fluidité** : fichier < 500 KB ; pas de jank perceptible (60 fps).

## Références

- `DESIGN.md` — tokens couleurs/typo/ombres (source de vérité visuelle).
- `../landing/public/logo-full.svg`, `logo-bubble.svg` — logos officiels (copiés inline).
- `../landing/src/i18n/dictionaries.ts` — vocabulaire de marque FR/EN (hero) réutilisé dans les captions.
- Animatique de brainstorming (locale, gitignorée) : `.superpowers/brainstorm/*/content/storyboard-animatique-v3.html`.
