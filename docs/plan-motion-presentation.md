# Motion de présentation — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produire `motion/seren-motion.html` — un motion design de 30 s en boucle invisible, bilingue FR/EN, 100 % autonome (GSAP + polices + logos embarqués), joué en plein écran navigateur pendant les pitchs.

**Architecture:** Sources lisibles dans `motion/src/` (template HTML, CSS, JSON de chaînes, JS timeline) assemblées en un fichier unique par `motion/build.mjs` (node pur, zéro dépendance). Une timeline GSAP maître `repeat:-1` de 30 s : 5 scènes en fonctions, transitions continues chevauchantes, rebouclage par fondu blanc. `motion/verify.mjs` vérifie mécaniquement poids/parité i18n/absence de réseau à chaque task.

**Tech Stack:** HTML/CSS/JS vanilla + GSAP 3.12 (vendored, minifié), polices Inter & Inter Tight woff2 base64, Node ≥ 18 pour les scripts build/verify (aucune dépendance npm).

**Spec de référence :** `docs/design-motion-presentation.md` (storyboard, textes exacts, critères d'acceptation). `DESIGN.md` pour les tokens.

**⚠️ Règles repo pour ce chantier :**
- Travailler sur la branche `feature/motion-presentation` (créée en Task 1). Merge fast-forward dans `main` à la fin ; Arnaud pushe lui-même.
- Le working tree contient des modifs **hors périmètre** d'un autre chantier (`src/data/letter-templates.ts`, `tests/letter-templates.test.ts`) : **ne jamais `git add -A` / `git add .`** — toujours des chemins explicites.
- Ne toucher à AUCUN fichier hors `motion/` et `docs/` (critère d'acceptation n° 7 : `npm run build` et `npm test` strictement inchangés).
- Code : identifiants en anglais, commentaires en français (convention CLAUDE.md).

---

## Notes post-revue

- **Task 1 (implémentation)** : le check n° 5 de `verify.mjs` tel que planifié flaggait le `<title>` du template (« Seren — Motion de présentation »). Décision : le `<title>` est du chrome navigateur, invisible pendant la lecture — il est **exempté** du check (dont l'objet est qu'aucun texte de *scène* ne contourne l'i18n). Le code du Step 6 ci-dessous intègre le correctif (`.replace(/<title>…/`). Le title reste en dur, non i18n (YAGNI).
- **Task 3 (revue qualité)** : deux arbitrages éditoriaux. ① `en.s3_title` « Your tasks » → **« Your steps »** (le produit et la landing disent "step(s)"/"roadmap", jamais "tasks" — l'intention de la spec est de réutiliser le vocabulaire maison) ; spec mise à jour. ② **Réconciliation storyboard S3** : la barre passait 25 % → 50 % alors que le libellé « 2 sur 8 complétées » reste statique et que l'étape passe « en cours » (pas « complétée ») → barre **25 % → ~31 %** (progression douce, sémantiquement cohérente) ; spec + Task 7 mises à jour. Conservés en l'état : "Closing bank accounts" (libellé exact de la landing, prime sur le parallélisme), "Someone else close" (mineur). Heads-up Task 6 : vérifier visuellement que `s2_q` ne wrap pas mal dans la carte (l'espace ASCII avant « ? » est un point de coupe valide).
- **Task 2 (revue qualité)** : approuvée sans correctif. Couverture des glyphes français vérifiée par décodage des cmap woff2 (à è é ê ô ç É — ' '). Contrainte propagée à la **Task 3** : espaces ASCII uniquement dans les chaînes (pas d'espace fine insécable U+202F, absente du subset latin). Mineurs acceptés sans action (robustesse de `fetch-fonts.mjs`, outil dev ponctuel — polices déjà committées). Ajout en **Task 11** : garde-fou de fraîcheur du build.
- **Task 1 (revue qualité)** : ajout de `.sort()` sur la liste des woff2 dans `fontsCss()` (`build.mjs`) — `readdirSync` ne garantit pas l'ordre selon le filesystem, ce qui aurait cassé le déterminisme byte-identique du livrable dès la Task 2. Corrigé dans le code du Step 2. Reportés en Task 2 (mineurs de revue) : garde sur l'absence du bloc strings dans verify (message lisible au lieu d'un TypeError), durcissement du check réseau (`//`, `import(`, `WebSocket`) avec exclusion du bloc GSAP vendored si faux positif, suppression du filtre mort `startsWith("{{")`, validation du slug de police dans `fontsCss()` (throw explicite), remplacement `{{FONTS_CSS}}` par fonction.

---

## Structure de fichiers cible

```
motion/
├── src/
│   ├── template.html        # squelette : #stage, 5 scènes, logos SVG, marqueurs {{INLINE:...}}
│   ├── motion.css           # composition 1920×1080 + styles des éléments
│   ├── strings.json         # { fr: {...}, en: {...} } — TOUTES les chaînes affichées
│   ├── motion.js            # scale/letterbox, i18n, 5 scènes GSAP, master timeline, contrôles
│   ├── vendor/gsap.min.js   # GSAP 3.12.5 vendored (Task 2)
│   └── fonts/               # inter-400.woff2, intertight-500.woff2, intertight-600.woff2 (Task 2)
├── build.mjs                # assemble src/ → seren-motion.html (inline + base64 fonts)
├── fetch-fonts.mjs          # télécharge les woff2 latin depuis Google Fonts (usage ponctuel)
├── verify.mjs               # poids < 500 KB, parité i18n, data-i18n couverts, zéro réseau
└── seren-motion.html        # LIVRABLE généré — committé, régénérable à tout moment
```

**Timeline maître (positions en secondes, transitions chevauchantes) :**

| Scène | `tl.add(...)` à | Fenêtre visible | Sortie |
|---|---|---|---|
| scene1 (papiers) | 0 | 0 → 5,5 | converge vers le centre 4,9 → 5,6 |
| scene2 (questionnaire) | 5,2 | 5,5 → 11 | fondu/translation 10,4 → 11 |
| scene3 (roadmap) | 10,7 | 11 → 17,5 | 16,9 → 17,5 |
| scene4 (courrier) | 17,2 | 17,5 → 24 | repli vers le centre 23,4 → 24 |
| scene5 (signature bleue) | 23,7 | 24 → 30 | overlay blanc 28,8 → 30 |

Boucle invisible : dernier frame = blanc pur (overlay opacity 1), premier frame = blanc pur (tous éléments resetés opacity 0 par les `tl.set()` d'ouverture de chaque scène + overlay resеté à 0 à t=0).

---

### Task 1 : Branche + squelette + build + verify v1

**Files:**
- Create: `motion/src/template.html`
- Create: `motion/src/motion.css`
- Create: `motion/src/motion.js`
- Create: `motion/build.mjs`
- Create: `motion/verify.mjs`

- [ ] **Step 1 : Créer la branche**

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git checkout -b feature/motion-presentation
```

- [ ] **Step 2 : Écrire `motion/build.mjs`**

```js
#!/usr/bin/env node
// Assemble motion/src/ en un seul fichier autonome motion/seren-motion.html.
// Zéro dépendance. Usage : node motion/build.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");

// Police ← nom de fichier : inter-400.woff2 → family "Inter" weight 400, intertight-500 → "Inter Tight" 500
const FAMILY = { inter: "Inter", intertight: "Inter Tight" };

function fontsCss() {
  let dir;
  try { dir = readdirSync(join(SRC, "fonts")).filter(f => f.endsWith(".woff2")).sort(); } // sort : déterminisme inter-plateformes
  catch { return "/* pas de polices embarquées (Task 2) */"; }
  return dir.map(f => {
    const [slug, weight] = f.replace(".woff2", "").split("-");
    const b64 = readFileSync(join(SRC, "fonts", f)).toString("base64");
    return `@font-face{font-family:"${FAMILY[slug]}";font-style:normal;font-weight:${weight};` +
      `src:url(data:font/woff2;base64,${b64}) format("woff2");font-display:block;}`;
  }).join("\n");
}

let html = readFileSync(join(SRC, "template.html"), "utf8");
html = html.replaceAll(/\{\{INLINE:([^}]+)\}\}/g, (_, p) => readFileSync(join(SRC, p.trim()), "utf8"));
html = html.replace("{{FONTS_CSS}}", fontsCss());
writeFileSync(join(ROOT, "seren-motion.html"), html);
console.log(`OK seren-motion.html (${Math.round(html.length / 1024)} KB)`);
```

- [ ] **Step 3 : Écrire `motion/src/template.html`** (squelette minimal — les scènes arrivent en Task 4)

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Seren — Motion de présentation</title>
<style>{{FONTS_CSS}}</style>
<style>{{INLINE:motion.css}}</style>
</head>
<body>
<div id="stage">
  <!-- Scènes injectées en Task 4 -->
  <div id="white-overlay"></div>
</div>
<script>{{INLINE:vendor/gsap.min.js}}</script>
<script type="application/json" id="strings">{{INLINE:strings.json}}</script>
<script>{{INLINE:motion.js}}</script>
</body>
</html>
```

Note : `vendor/gsap.min.js` et `strings.json` n'existent pas encore — créer des **stubs** pour que le build passe :

```bash
mkdir -p motion/src/vendor
echo "/* GSAP vendored en Task 2 */" > motion/src/vendor/gsap.min.js
echo '{ "fr": {}, "en": {} }' > motion/src/strings.json
```

- [ ] **Step 4 : Écrire `motion/src/motion.css`** (composition + letterbox uniquement pour l'instant)

```css
/* Composition fixe 1920×1080, letterbox blanc (jamais de rognage) */
* { box-sizing: border-box; margin: 0; }
html, body { height: 100%; overflow: hidden; background: #fff; }
body.idle { cursor: none; }
#stage {
  position: absolute; left: 50%; top: 50%;
  width: 1920px; height: 1080px;
  transform-origin: 0 0; /* le scale est posé par fit() dans motion.js */
  background: #fff; overflow: hidden;
  font-family: "Inter Tight", system-ui, sans-serif;
}
#white-overlay { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; z-index: 90; }
```

- [ ] **Step 5 : Écrire `motion/src/motion.js`** (i18n + scale ; la timeline arrive avec les scènes)

```js
"use strict";
// ---------- i18n ----------
const STRINGS = JSON.parse(document.getElementById("strings").textContent);
let lang = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "fr";
function applyLang(l) {
  lang = l;
  document.documentElement.lang = l;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (STRINGS[l][key] === undefined) console.warn("clé i18n manquante :", key);
    else el.textContent = STRINGS[l][key];
  });
}
applyLang(lang);

// ---------- mise à l'échelle letterbox ----------
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  const stage = document.getElementById("stage");
  stage.style.transform =
    `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
  stage.style.left = "0"; stage.style.top = "0";
}
addEventListener("resize", fit);
fit();
```

- [ ] **Step 6 : Écrire `motion/verify.mjs`**

```js
#!/usr/bin/env node
// Vérifications mécaniques du livrable. Usage : node motion/verify.mjs — exit 1 si échec.
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "seren-motion.html");
const html = readFileSync(OUT, "utf8");
let fail = 0;
const check = (ok, label) => { console.log(`${ok ? "✅" : "❌"} ${label}`); if (!ok) fail = 1; };

// 1. Poids < 500 KB
check(statSync(OUT).size < 500 * 1024, `poids ${Math.round(statSync(OUT).size / 1024)} KB < 500 KB`);

// 2. Zéro requête réseau (xmlns est un namespace, pas une requête)
const network = /(src|href)\s*=\s*["']https?:|url\(\s*["']?https?:|@import|fetch\(|XMLHttpRequest|navigator\.sendBeacon/;
check(!network.test(html), "aucune référence réseau");

// 3. Parité i18n fr/en (mêmes clés, aucune valeur vide)
const strings = JSON.parse(html.match(/<script type="application\/json" id="strings">([\s\S]*?)<\/script>/)[1]);
const fr = Object.keys(strings.fr).sort(), en = Object.keys(strings.en).sort();
check(JSON.stringify(fr) === JSON.stringify(en), `parité des clés fr/en (${fr.length} clés)`);
check([...Object.values(strings.fr), ...Object.values(strings.en)].every(v => typeof v === "string" && v.length > 0),
  "aucune valeur i18n vide");

// 4. Chaque data-i18n du DOM a sa clé dans fr ET en
const used = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);
const missing = used.filter(k => !(k in strings.fr) || !(k in strings.en));
check(missing.length === 0, `data-i18n tous couverts${missing.length ? " — manquants : " + missing.join(", ") : ""}`);

// 5. Aucun texte visible en dur dans le template (tout passe par data-i18n)
// — le <title> est exempté : chrome navigateur, invisible dans la composition (note post-revue Task 1)
const template = readFileSync(join(ROOT, "src/template.html"), "utf8")
  .replace(/<title>[\s\S]*?<\/title>/, "<title></title>");
const hardcoded = [...template.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ]{3,}[^<>{}]*)</g)]
  .map(m => m[1].trim()).filter(t => t && !t.startsWith("{{"));
check(hardcoded.length === 0, `aucun texte en dur dans template.html${hardcoded.length ? " — trouvé : " + hardcoded.slice(0, 3).join(" | ") : ""}`);

process.exit(fail);
```

- [ ] **Step 7 : Builder et vérifier**

```bash
node motion/build.mjs && node motion/verify.mjs
```

Attendu : `OK seren-motion.html (~1 KB)` puis 6 lignes ✅ (les checks i18n passent à vide : 0 clé = parité), exit 0.

- [ ] **Step 8 : Vérification visuelle du letterbox**

Ouvrir `motion/seren-motion.html` dans un navigateur, redimensionner la fenêtre : la zone `#stage` (inspecteur) reste centrée au ratio 16:9, fond blanc partout.

- [ ] **Step 9 : Commit**

```bash
git add motion/
git commit -m "feat(motion): squelette autonome — build, verify, composition letterbox 1920×1080"
```

---

### Task 2 : Vendoring GSAP + polices embarquées

**Files:**
- Create: `motion/fetch-fonts.mjs`
- Create: `motion/src/vendor/gsap.min.js` (remplace le stub)
- Create: `motion/src/fonts/inter-400.woff2`, `intertight-500.woff2`, `intertight-600.woff2`

**Seule task nécessitant le réseau.**

- [ ] **Step 1 : Télécharger GSAP 3.12.5 minifié**

```bash
curl -fsSL -o motion/src/vendor/gsap.min.js https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js
grep -c "gsap" motion/src/vendor/gsap.min.js   # attendu : > 0
ls -lh motion/src/vendor/gsap.min.js            # attendu : ~70 KB
```

- [ ] **Step 2 : Écrire `motion/fetch-fonts.mjs`**

```js
#!/usr/bin/env node
// Télécharge les woff2 (subset latin) depuis Google Fonts. Usage ponctuel : node motion/fetch-fonts.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FONTS = [
  { css: "https://fonts.googleapis.com/css2?family=Inter:wght@400&display=block", out: "inter-400.woff2" },
  { css: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500&display=block", out: "intertight-500.woff2" },
  { css: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600&display=block", out: "intertight-600.woff2" },
];
// User-Agent moderne requis pour obtenir du woff2 (sinon Google sert du ttf)
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const dir = join(dirname(fileURLToPath(import.meta.url)), "src/fonts");
mkdirSync(dir, { recursive: true });

for (const { css, out } of FONTS) {
  const cssText = await (await fetch(css, { headers: { "User-Agent": UA } })).text();
  // Le bloc /* latin */ est le dernier ; on prend sa dernière URL woff2
  const urls = [...cssText.matchAll(/url\((https:[^)]+\.woff2)\)/g)].map(m => m[1]);
  const latinBlock = cssText.split("/* latin */").pop();
  const url = ([...latinBlock.matchAll(/url\((https:[^)]+\.woff2)\)/g)].map(m => m[1])[0]) ?? urls.at(-1);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(join(dir, out), buf);
  console.log(`OK ${out} (${Math.round(buf.length / 1024)} KB)`);
}
```

- [ ] **Step 3 : Télécharger les polices**

```bash
node motion/fetch-fonts.mjs
```

Attendu : 3 lignes `OK ... (15–40 KB)`.

- [ ] **Step 4 : Brancher les polices dans le CSS** — dans `motion/src/motion.css`, remplacer la ligne `font-family` de `#stage` et ajouter les familles utilitaires :

```css
#stage { font-family: "Inter Tight", system-ui, sans-serif; }
.font-display { font-family: "Inter", system-ui, sans-serif; } /* captions/titres, graisse 400 */
```

- [ ] **Step 5 : Builder et vérifier**

```bash
node motion/build.mjs && node motion/verify.mjs
```

Attendu : `OK seren-motion.html (~150–250 KB)`, 6 ✅ (dont « aucune référence réseau » — les woff2 sont en base64), exit 0.

- [ ] **Step 6 : Vérification visuelle des polices**

Ouvrir le fichier buildé, ajouter temporairement du texte via la console :
`document.getElementById("stage").insertAdjacentHTML("beforeend", '<p class="font-display" style="font-size:60px">Inter 400 — Après la perte</p>')`
→ la police rendue est Inter (comparer avec system-ui en désactivant la @font-face dans l'inspecteur). Onglet Network : **0 requête** après chargement.

- [ ] **Step 7 : Commit**

```bash
git add motion/src/vendor/gsap.min.js motion/src/fonts/ motion/fetch-fonts.mjs motion/src/motion.css motion/seren-motion.html
git commit -m "feat(motion): GSAP 3.12.5 vendored + Inter/Inter Tight woff2 embarquées (offline)"
```

---

### Task 3 : Chaînes FR/EN complètes

**Files:**
- Modify: `motion/src/strings.json` (remplace le stub)

- [ ] **Step 1 : Écrire `motion/src/strings.json`** — textes exacts de la spec (§ Storyboard, § Contenus exacts) :

```json
{
  "fr": {
    "s1_l1": "Après la perte d'un proche,",
    "s1_l2": "les démarches s'accumulent.",
    "s2_cap": "Seren commence par quelques questions.",
    "s2_q": "Quel était votre lien avec la personne ?",
    "s2_o1": "Mon père ou ma mère",
    "s2_o2": "Mon conjoint ou ma conjointe",
    "s2_o3": "Un autre proche",
    "s3_cap": "Votre parcours, dans le bon ordre.",
    "s3_title": "Vos démarches",
    "s3_count": "2 sur 8 complétées",
    "s3_r1": "Acte de décès",
    "s3_r2": "Clôture bancaire",
    "s3_r3": "Caisse de retraite",
    "s3_r4": "Mutuelle santé",
    "s3_done": "Complété",
    "s3_prog": "En cours",
    "s4_cap": "Les courriers sont déjà rédigés, avec les bons mots.",
    "s4_subject": "Objet : Clôture du compte — succession",
    "s4_btn": "Télécharger en PDF",
    "s4_sent": "Envoyé",
    "s5_tag": "On s'occupe du reste."
  },
  "en": {
    "s1_l1": "After losing someone close,",
    "s1_l2": "the paperwork piles up.",
    "s2_cap": "Seren starts with a few questions.",
    "s2_q": "What was your relationship to them?",
    "s2_o1": "My father or mother",
    "s2_o2": "My spouse or partner",
    "s2_o3": "Someone else close",
    "s3_cap": "Your path, in the right order.",
    "s3_title": "Your steps",
    "s3_count": "2 of 8 completed",
    "s3_r1": "Death certificate",
    "s3_r2": "Closing bank accounts",
    "s3_r3": "Pension fund",
    "s3_r4": "Health insurance",
    "s3_done": "Completed",
    "s3_prog": "In progress",
    "s4_cap": "Letters already written, with the right words.",
    "s4_subject": "Subject: Account closure — estate",
    "s4_btn": "Download as PDF",
    "s4_sent": "Sent",
    "s5_tag": "We'll handle the rest."
  }
}
```

- [ ] **Step 2 : Builder et vérifier**

```bash
node motion/build.mjs && node motion/verify.mjs
```

Attendu : `parité des clés fr/en (21 clés)` ✅, exit 0.

- [ ] **Step 3 : Commit**

```bash
git add motion/src/strings.json motion/seren-motion.html
git commit -m "feat(motion): chaînes FR/EN complètes (21 clés, vocabulaire landing)"
```

---

### Task 4 : DOM des 5 scènes + styles + mode debug `?scene=`

**Files:**
- Modify: `motion/src/template.html` (scènes complètes)
- Modify: `motion/src/motion.css` (styles des éléments)
- Modify: `motion/src/motion.js` (mode debug)

- [ ] **Step 1 : Remplacer le contenu de `#stage` dans `motion/src/template.html`** (garder `#white-overlay` en dernier)

```html
<div id="stage">
  <!-- S1 : le débordement, en douceur -->
  <section id="s1" class="scene">
    <div class="paper p1"><i></i><i></i></div>
    <div class="paper p2"><i></i><i></i></div>
    <div class="paper p3"><i></i><i></i></div>
    <div class="paper p4"><i></i><i></i></div>
    <div class="paper sm p5"><i></i><i></i></div>
    <div class="paper sm p6"><i></i><i></i></div>
    <div class="paper sm p7"><i></i><i></i></div>
    <div class="paper p8"><i></i><i></i></div>
    <div class="paper sm p9"><i></i><i></i></div>
    <div class="paper sm p10"><i></i><i></i></div>
    <div class="paper xs p11"><i></i><i></i></div>
    <div class="paper xs p12"><i></i><i></i></div>
    <div class="paper xs p13"><i></i><i></i></div>
    <div class="paper xs p14"><i></i><i></i></div>
    <p class="caption font-display"><span id="s1-l1" data-i18n="s1_l1"></span><span id="s1-l2" class="line2" data-i18n="s1_l2"></span></p>
  </section>

  <!-- S2 : le questionnaire -->
  <section id="s2" class="scene">
    <p id="s2-cap" class="caption sub font-display" data-i18n="s2_cap"></p>
    <div id="s2-card" class="ucard">
      <h3 data-i18n="s2_q"></h3>
      <div class="opt sel"><span class="ring"></span><span data-i18n="s2_o1"></span></div>
      <div class="opt"><span class="ring"></span><span data-i18n="s2_o2"></span></div>
      <div class="opt"><span class="ring"></span><span data-i18n="s2_o3"></span></div>
    </div>
  </section>

  <!-- S3 : la roadmap -->
  <section id="s3" class="scene">
    <p id="s3-cap" class="caption sub font-display" data-i18n="s3_cap"></p>
    <div id="s3-card" class="ucard">
      <div class="rhead"><span data-i18n="s3_title"></span><small data-i18n="s3_count"></small></div>
      <div class="track"><b id="s3-bar"></b></div>
      <div class="row">
        <span class="dot ok"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
        <span data-i18n="s3_r1"></span><span class="tag done" data-i18n="s3_done"></span>
      </div>
      <div class="row" id="s3-row2">
        <span class="dot" id="s3-dot2"></span>
        <span data-i18n="s3_r2"></span><span class="tag prog" id="s3-tag2" data-i18n="s3_prog"></span>
      </div>
      <div class="row"><span class="dot todo"></span><span data-i18n="s3_r3"></span></div>
      <div class="row"><span class="dot todo"></span><span data-i18n="s3_r4"></span></div>
    </div>
  </section>

  <!-- S4 : les courriers -->
  <section id="s4" class="scene">
    <p id="s4-cap" class="caption sub font-display" data-i18n="s4_cap"></p>
    <div id="s4-card" class="ucard">
      <h3 data-i18n="s4_subject"></h3>
      <div class="wline w1"></div>
      <div class="wline w2"></div>
      <div class="wline w3"></div>
      <div class="wline w4"></div>
      <div class="lfoot">
        <span class="btn-pdf"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span data-i18n="s4_btn"></span></span>
        <span id="s4-sent" class="sent"><svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span data-i18n="s4_sent"></span></span>
      </div>
    </div>
  </section>

  <!-- S5 : signature sur fond bleu -->
  <section id="s5" class="scene">
    <div id="s5-bg"></div>
    <svg id="s5-logo" viewBox="0 0 208 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Copié depuis ../landing/public/logo-full.svg avec recoloration :
           path 1 (le « S ») : fill #297FF3 → #F3EEDD ; path 2 (wordmark) : fill #1C1916 → #FFFFFF.
           Commande depuis la racine du repo Application :
           sed -e 's/fill="#297FF3"/fill="#F3EEDD"/' -e 's/fill="#1C1916"/fill="#FFFFFF"/' \
               ../landing/public/logo-full.svg
           puis coller ici les DEUX <path> internes (sans la balise <svg> externe). -->
    </svg>
    <div id="s5-tag" class="font-display" data-i18n="s5_tag"></div>
  </section>

  <div id="white-overlay"></div>
</div>
```

- [ ] **Step 2 : Exécuter la recoloration du logo et coller les paths**

```bash
sed -e 's/fill="#297FF3"/fill="#F3EEDD"/' -e 's/fill="#1C1916"/fill="#FFFFFF"/' \
  /Users/arnaudgay/Documents/git/Seren/landing/public/logo-full.svg
```

Copier les deux `<path …/>` de la sortie à l'intérieur de `<svg id="s5-logo">` (remplacer le commentaire). Vérifier : `grep -c "F3EEDD" motion/src/template.html` → 1, `grep -c "FFFFFF\"" motion/src/template.html` → ≥ 1.

- [ ] **Step 3 : Ajouter les styles des éléments à `motion/src/motion.css`** (après le bloc composition)

```css
/* ---------- scènes ---------- */
.scene { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; visibility: hidden; }
.caption { font-size: 68px; font-weight: 400; letter-spacing: -1.2px; color: #1D1D1D; text-align: center; line-height: 1.25; z-index: 2; }
.caption .line2 { display: block; color: #42424A; }
.caption.sub { font-size: 60px; margin-bottom: 62px; }
.ucard { background: #fff; border: 2px solid #F2F0FF; border-radius: 52px; box-shadow: 0 10px 53px rgba(135,126,135,.14); }

/* ---------- S1 : papiers ---------- */
.paper { position: absolute; width: 178px; height: 226px; background: #fff; border: 2px solid #EFEFF3; border-radius: 24px; box-shadow: 0 10px 34px rgba(79,79,79,.13); }
.paper i { display: block; height: 14px; border-radius: 99px; background: #E4E6EA; margin: 31px 29px 0; }
.paper i:nth-child(2) { width: 55%; }
.paper.sm { width: 144px; height: 182px; } .paper.sm i { height: 12px; margin: 24px 24px 0; }
.paper.xs { width: 115px; height: 146px; } .paper.xs i { height: 10px; margin: 19px 19px 0; }
.p1 { left: 13%; top: 19%; }  .p2 { right: 15%; top: 14%; }  .p3 { left: 19%; bottom: 12%; }
.p4 { right: 18%; bottom: 15%; } .p5 { left: 6%; top: 44%; } .p6 { right: 5%; top: 40%; }
.p7 { left: 30%; top: 7%; }   .p8 { right: 31%; bottom: 5%; } .p9 { left: 44%; top: 74%; }
.p10 { left: 44%; top: 5%; }  .p11 { right: 34%; top: 12%; }  .p12 { left: 7%; bottom: 7%; }
.p13 { right: 7%; bottom: 30%; } .p14 { left: 23%; top: 32%; }

/* ---------- S2 : questionnaire ---------- */
#s2-card { width: 960px; padding: 62px 67px; }
#s2-card h3 { font-size: 41px; font-weight: 500; color: #1D1D1D; margin-bottom: 38px; }
.opt { display: flex; align-items: center; gap: 24px; height: 106px; border: 2px solid #D9DBE0; border-radius: 99px; padding: 0 38px; font-size: 35px; font-weight: 500; color: #42424A; margin-top: 22px; background: #fff; }
.opt .ring { width: 41px; height: 41px; border-radius: 50%; border: 3px solid #D9DBE0; flex: none; position: relative; }
.opt .ring::after { content: ""; position: absolute; inset: 6px; border-radius: 50%; background: #006BFA; transform: scale(0); }

/* ---------- S3 : roadmap ---------- */
#s3-card { width: 1060px; padding: 58px 67px; }
.rhead { display: flex; justify-content: space-between; align-items: center; font-size: 36px; font-weight: 600; color: #1D1D1D; margin-bottom: 19px; }
.rhead small { color: #666676; font-size: 30px; font-weight: 500; }
.track { height: 17px; border-radius: 99px; background: #EAF3FE; overflow: hidden; margin-bottom: 43px; }
#s3-bar { display: block; height: 100%; border-radius: 99px; background: #006BFA; width: 25%; }
.row { display: flex; align-items: center; gap: 29px; padding: 22px 0; font-size: 35px; font-weight: 500; color: #42424A; }
.dot { width: 53px; height: 53px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; border: 3px solid #D9DBE0; background: #fff; }
.dot svg { width: 26px; height: 26px; }
.dot.ok { background: #16A34A; border-color: #16A34A; }
.dot.todo { background: #fff; }
.tag { margin-left: auto; font-size: 26px; font-weight: 600; letter-spacing: 1.4px; text-transform: uppercase; border-radius: 99px; padding: 7px 24px; }
.tag.done { background: #E9F7EF; color: #16A34A; }
.tag.prog { background: #F2F0FF; color: #6B5CE7; }

/* ---------- S4 : courrier ---------- */
#s4-card { width: 990px; padding: 58px 67px; }
#s4-card h3 { font-size: 35px; font-weight: 600; color: #1D1D1D; margin-bottom: 34px; }
.wline { height: 17px; border-radius: 99px; background: #E4E6EA; margin-top: 24px; width: 0; }
.lfoot { display: flex; align-items: center; gap: 24px; margin-top: 48px; }
.btn-pdf { height: 92px; border-radius: 99px; background: #006BFA; color: #fff; font-size: 32px; font-weight: 500; display: inline-flex; align-items: center; padding: 0 43px; gap: 17px; }
.btn-pdf svg { width: 34px; height: 34px; }
.sent { display: inline-flex; align-items: center; gap: 14px; font-size: 29px; font-weight: 600; color: #16A34A; }
.sent svg { width: 31px; height: 31px; }

/* ---------- S5 : signature ---------- */
#s5-bg { position: absolute; left: 50%; top: 50%; width: 2600px; height: 2600px; margin: -1300px 0 0 -1300px; border-radius: 50%; background: #297FF3; }
#s5-logo { width: 500px; z-index: 2; }
#s5-tag { font-size: 64px; font-weight: 400; letter-spacing: -1px; color: #fff; margin-top: 53px; z-index: 2; }
```

- [ ] **Step 4 : Ajouter le mode debug `?scene=` à la fin de `motion/src/motion.js`**

```js
// ---------- mode debug : ?scene=s3 affiche une scène statique (aucune animation) ----------
const debugScene = new URLSearchParams(location.search).get("scene");
if (debugScene && document.getElementById(debugScene)) {
  document.getElementById(debugScene).style.visibility = "visible";
  // état "milieu de scène" pour contrôler les styles
  if (debugScene === "s1") document.querySelectorAll("#s1 .paper").forEach((p, i) => { p.style.transform = `rotate(${[-11,9,7,-14,5,-7,15,-5,3,-8,6,12,4,-18][i]}deg)`; });
  if (debugScene === "s2") document.querySelector(".opt.sel .ring").style.setProperty("--sel", "1");
  if (debugScene === "s5") document.getElementById("s5-bg").style.transform = "scale(1)";
}
```

- [ ] **Step 5 : Builder et vérifier**

```bash
node motion/build.mjs && node motion/verify.mjs
```

Attendu : 7 ✅ (dont « data-i18n tous couverts », « aucun texte en dur ») — exit 0. (7 checks depuis le durcissement de la Task 2.)

- [ ] **Step 6 : Vérification visuelle de chaque scène statique**

Ouvrir `motion/seren-motion.html?scene=s1`, puis `?scene=s2` … `?scene=s5`. Attendu : chaque scène correctement composée (S1 : 14 papiers inclinés autour du texte ; S2 : carte 960px, 1re pilule non sélectionnée pour l'instant ; S3 : roadmap 4 lignes, coche verte, tags ; S4 : courrier, bouton bleu ; S5 : fond bleu plein écran, logo crème/blanc lisible, tagline blanche). Textes en FR ; ajouter `&lang=en` sur une scène → textes EN.

- [ ] **Step 7 : Commit**

```bash
git add motion/src/template.html motion/src/motion.css motion/src/motion.js motion/seren-motion.html
git commit -m "feat(motion): DOM et styles des 5 scènes (1920×1080) + mode debug ?scene="
```

---

### Task 5 : Scène 1 — cascade des papiers + master timeline

**Files:**
- Modify: `motion/src/motion.js`

- [ ] **Step 1 : Ajouter scene1 + le début de la master timeline** (avant le bloc debug ; le bloc debug doit désormais faire `tl.pause()` quand `?scene=` est actif — voir step 2)

```js
// ---------- utilitaires scènes ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const ROTATIONS = [-11, 9, 7, -14, 5, -7, 15, -5, 3, -8, 6, 12, 4, -18]; // p1..p14

// S1 (0 → 5,6 s) : cascade accélérée de 14 papiers, captions, puis convergence vers le centre
function scene1() {
  const tl = gsap.timeline();
  const papers = $$("#s1 .paper");
  // reset (rejoué à chaque cycle → premier frame toujours identique)
  tl.set("#s1", { visibility: "visible" }, 0);
  tl.set(papers, { opacity: 0, scale: 0.94, y: 22, rotation: i => ROTATIONS[i] }, 0);
  tl.set(["#s1-l1", "#s1-l2"], { opacity: 0, y: 24 }, 0);
  tl.set("#white-overlay", { opacity: 0 }, 0);

  tl.to("#s1-l1", { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 0.3);
  tl.to("#s1-l2", { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 1.1);
  // cascade qui s'accélère : gaps décroissants de 0,5 s → 0,12 s (dernier papier posé avant la convergence)
  const gaps = [0, .5, .45, .4, .36, .32, .28, .25, .22, .19, .17, .15, .13, .12];
  let t = 0.8;
  papers.forEach((p, i) => {
    t += gaps[i];
    tl.to(p, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "power2.out" }, t);
    // micro-flottement sur les premiers papiers seulement (les derniers arrivent trop tard dans la scène)
    if (i < 8) tl.to(p, { y: "-=7", duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: 1 }, t + 0.5);
  });
  // sortie : tout converge vers le centre et se fond (4,9 → 5,6) — overwrite tue les flottements encore actifs
  tl.to(papers, {
    x: (i, el) => 960 - el.offsetLeft - el.offsetWidth / 2,
    y: (i, el) => 540 - el.offsetTop - el.offsetHeight / 2,
    scale: 0.22, opacity: 0, duration: 0.7, ease: "power3.in", stagger: 0.012, overwrite: "auto",
  }, 4.9);
  tl.to(["#s1-l1", "#s1-l2"], { opacity: 0, y: -18, duration: 0.45, ease: "power2.in" }, 4.95);
  tl.set("#s1", { visibility: "hidden" }, 5.65);
  // remet x/y/scale pour le cycle suivant (le set d'ouverture ne couvre pas x)
  tl.set(papers, { x: 0 }, 5.66);
  return tl;
}

// ---------- master ----------
const tl = gsap.timeline({ repeat: -1 });
tl.add(scene1(), 0);
// scene2..5 ajoutées dans les tasks suivantes
window.SEREN_MOTION = { tl, applyLang }; // API debug/vérification
```

- [ ] **Step 2 : Remplacer le bloc debug en entier** (celui de la Task 4) — la master pose des `set()` à t=0 (opacity 0 partout) qu'il faut neutraliser en mode debug :

```js
// ---------- mode debug : ?scene=s3 fige une scène (contrôle des styles/composition) ----------
const debugScene = new URLSearchParams(location.search).get("scene");
if (debugScene && document.getElementById(debugScene)) {
  tl.pause(0);
  // annule les resets GSAP posés à t=0 par la master, puis montre la scène
  gsap.set("#" + debugScene + ", #" + debugScene + " *", { clearProps: "all" });
  document.getElementById(debugScene).style.visibility = "visible";
  // états « milieu de scène » utiles au contrôle visuel
  if (debugScene === "s1") $$("#s1 .paper").forEach((p, i) => { p.style.transform = `rotate(${ROTATIONS[i]}deg)`; });
  if (debugScene === "s2") $(".opt.sel").style.setProperty("--sel", "1");
  if (debugScene === "s5") $("#s5-bg").style.transform = "scale(1)";
}
```

- [ ] **Step 3 : Builder, vérifier, contrôle visuel**

```bash
node motion/build.mjs && node motion/verify.mjs
```

Ouvrir le fichier. Console : `SEREN_MOTION.tl.pause(2.5)` → ~8 papiers visibles, 2 lignes de texte. `SEREN_MOTION.tl.pause(4.5)` → 14 papiers. `SEREN_MOTION.tl.pause(5.3)` → papiers en convergence centrale, presque fondus. `SEREN_MOTION.tl.play()` → la cascade s'accélère visiblement, flottement doux, aucun à-coup.

- [ ] **Step 4 : Commit**

```bash
git add motion/src/motion.js motion/seren-motion.html
git commit -m "feat(motion): scène 1 — cascade accélérée de 14 papiers, convergence de sortie, master repeat:-1"
```

---

### Task 6 : Scène 2 — questionnaire

**Files:**
- Modify: `motion/src/motion.js`

- [ ] **Step 1 : Ajouter scene2 après scene1** et l'accrocher à la master

```js
// S2 (posée à 5,2 s ; visible 5,5 → 11) : la carte accueille les papiers convergés, une réponse se choisit
function scene2() {
  const tl = gsap.timeline();
  tl.set("#s2", { visibility: "visible" }, 0);
  tl.set("#s2-cap", { opacity: 0, y: 20 }, 0);
  tl.set("#s2-card", { opacity: 0, y: 46, scale: 0.96 }, 0);
  tl.set(".opt.sel", { background: "#fff", borderColor: "#D9DBE0", "--sel": 0 }, 0);

  // entrée dans la continuité de la convergence des papiers (ils « deviennent » la carte)
  tl.to("#s2-card", { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out" }, 0.45);
  tl.to("#s2-cap", { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.75);
  // sélection de la 1re réponse à ~8,5 s master (3,3 s locale)
  tl.to(".opt.sel", { background: "#EAF3FE", borderColor: "#006BFA", duration: 0.4, ease: "power1.inOut" }, 3.3);
  tl.to(".opt.sel", { "--sel": 1, duration: 0.35, ease: "back.out(2)" }, 3.45);
  // sortie 10,4 → 11 (master) = 5,2 → 5,8 locale
  tl.to(["#s2-cap", "#s2-card"], { opacity: 0, y: -26, duration: 0.55, ease: "power2.in", stagger: 0.06 }, 5.2);
  tl.set("#s2", { visibility: "hidden" }, 5.85);
  return tl;
}
tl.add(scene2(), 5.2);   // ← ajouter après tl.add(scene1(), 0)
```

- [ ] **Step 2 : Piloter le point du radio via CSS var** — dans `motion/src/motion.css`, modifier la règle du `::after` :

```css
.opt .ring::after { content: ""; position: absolute; inset: 6px; border-radius: 50%; background: #006BFA; transform: scale(var(--sel, 0)); transition: none; }
```

(GSAP anime `--sel` sur `.opt.sel`, le `::after` suit.)

- [ ] **Step 3 : Builder, vérifier, contrôle visuel**

```bash
node motion/build.mjs && node motion/verify.mjs
```

Console : `SEREN_MOTION.tl.pause(6.4)` → carte questionnaire visible, aucune sélection. `pause(9)` → 1re pilule fond bleu clair + point bleu. `pause(10.8)` → carte en sortie. Enchaînement `play()` depuis 4,5 s : les papiers convergent PUIS la carte surgit du même point — continuité lisible.

- [ ] **Step 4 : Commit**

```bash
git add motion/src/motion.js motion/src/motion.css motion/seren-motion.html
git commit -m "feat(motion): scène 2 — carte questionnaire, sélection pilule (CSS var --sel)"
```

---

### Task 7 : Scène 3 — roadmap

**Files:**
- Modify: `motion/src/motion.js`

- [ ] **Step 1 : Ajouter scene3 et l'accrocher**

```js
// S3 (posée à 10,7 s ; visible 11 → 17,5) : la carte s'étire en roadmap, la progression avance
function scene3() {
  const tl = gsap.timeline();
  tl.set("#s3", { visibility: "visible" }, 0);
  tl.set("#s3-cap", { opacity: 0, y: 20 }, 0);
  tl.set("#s3-card", { opacity: 0, y: 40, scaleY: 0.9, transformOrigin: "50% 30%" }, 0);
  tl.set("#s3-bar", { width: "25%" }, 0);
  tl.set("#s3-dot2", { background: "#ffffff", borderColor: "#D9DBE0" }, 0);
  tl.set("#s3-tag2", { opacity: 0, scale: 0.8 }, 0);

  // la carte « s'étire » (continuité avec la carte S2 qui vient de sortir au même endroit)
  tl.to("#s3-card", { opacity: 1, y: 0, scaleY: 1, duration: 0.85, ease: "power3.out" }, 0.35);
  tl.to("#s3-cap", { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.65);
  // progression 25 % → ~31 % (douce, cohérente avec « 2 sur 8 complétées » : l'étape passe « en cours », pas « complétée »)
  // et passage « En cours » à ~13,5 s master (2,8 s locale)
  tl.to("#s3-bar", { width: "31%", duration: 1.3, ease: "power2.inOut" }, 2.5);
  tl.to("#s3-dot2", { background: "#6B5CE7", borderColor: "#6B5CE7", duration: 0.4 }, 2.8);
  tl.to("#s3-tag2", { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.8)" }, 2.95);
  // sortie 16,9 → 17,5 master = 6,2 → 6,8 locale
  tl.to(["#s3-cap", "#s3-card"], { opacity: 0, y: -26, duration: 0.55, ease: "power2.in", stagger: 0.06 }, 6.2);
  tl.set("#s3", { visibility: "hidden" }, 6.85);
  return tl;
}
tl.add(scene3(), 10.7);
```

- [ ] **Step 2 : Builder, vérifier, contrôle visuel**

```bash
node motion/build.mjs && node motion/verify.mjs
```

Console : `pause(12.2)` → roadmap posée, barre à 25 %, ligne 2 pastille grise SANS badge. `pause(14.5)` → barre à ~31 %, pastille violette, badge « EN COURS » violet. `pause(17.2)` → carte en sortie. La coche verte « Acte de décès / COMPLÉTÉ » est visible dès l'entrée.

- [ ] **Step 3 : Commit**

```bash
git add motion/src/motion.js motion/seren-motion.html
git commit -m "feat(motion): scène 3 — roadmap, progression 25→50 %, statut En cours violet"
```

---

### Task 8 : Scène 4 — le courrier s'écrit

**Files:**
- Modify: `motion/src/motion.js`

- [ ] **Step 1 : Ajouter scene4 et l'accrocher**

```js
// S4 (posée à 17,2 s ; visible 17,5 → 24) : le courrier s'écrit, PDF + « Envoyé »
function scene4() {
  const tl = gsap.timeline();
  tl.set("#s4", { visibility: "visible" }, 0);
  tl.set("#s4-cap", { opacity: 0, y: 20 }, 0);
  tl.set("#s4-card", { opacity: 0, y: 40, scale: 0.94, transformOrigin: "50% 50%" }, 0);
  tl.set($$("#s4 .wline"), { width: 0 }, 0);
  tl.set("#s4-sent", { opacity: 0, x: -14 }, 0);

  tl.to("#s4-card", { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out" }, 0.4);
  tl.to("#s4-cap", { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.7);
  // les lignes « s'écrivent » (largeurs finales variées), 19 → 21,3 s master
  const widths = ["96%", "88%", "92%", "58%"];
  $$("#s4 .wline").forEach((l, i) => {
    tl.to(l, { width: widths[i], duration: 0.75, ease: "power1.inOut" }, 1.8 + i * 0.55);
  });
  tl.to("#s4-sent", { opacity: 1, x: 0, duration: 0.5, ease: "power2.out" }, 4.4);
  // sortie : repli vers le centre (le cercle bleu de S5 partira de ce point), 23,4 → 24
  tl.to(["#s4-cap", "#s4-card"], { opacity: 0, scale: 0.36, y: 30, duration: 0.65, ease: "power3.in" }, 6.2);
  tl.set("#s4", { visibility: "hidden" }, 6.9);
  return tl;
}
tl.add(scene4(), 17.2);
```

(`#s4-cap` n'a pas de scale initial ≠ 1 : le `scale: 0.36` de sortie s'applique depuis 1, effet de repli groupé voulu.)

- [ ] **Step 2 : Builder, vérifier, contrôle visuel**

```bash
node motion/build.mjs && node motion/verify.mjs
```

Console : `pause(18.6)` → courrier posé, 4 lignes vides. `pause(21.5)` → 4 lignes écrites (96/88/92/58 %). `pause(22.3)` → badge vert « Envoyé » affiché. `pause(23.8)` → carte en repli réduit vers le centre.

- [ ] **Step 3 : Commit**

```bash
git add motion/src/motion.js motion/seren-motion.html
git commit -m "feat(motion): scène 4 — courrier qui s'écrit, PDF, badge Envoyé, repli central"
```

---

### Task 9 : Scène 5 — signature bleue + rebouclage invisible

**Files:**
- Modify: `motion/src/motion.js`

- [ ] **Step 1 : Ajouter scene5, l'accrocher, et verrouiller la durée totale à 30 s**

```js
// S5 (posée à 23,7 s ; visible 24 → 30) : cercle bleu depuis le centre, logo, tagline, fondu blanc
function scene5() {
  const tl = gsap.timeline();
  tl.set("#s5", { visibility: "visible" }, 0);
  tl.set("#s5-bg", { scale: 0, transformOrigin: "50% 50%" }, 0);
  tl.set("#s5-logo", { opacity: 0, scale: 0.82 }, 0);
  tl.set("#s5-tag", { opacity: 0, y: 22 }, 0);

  // le cercle part du point de repli du courrier (centre) — 24 → 25,1 s master
  tl.to("#s5-bg", { scale: 1, duration: 1.1, ease: "power3.inOut" }, 0.3);
  tl.to("#s5-logo", { opacity: 1, scale: 1, duration: 0.8, ease: "power2.out" }, 1.1);
  tl.to("#s5-tag", { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 2.1);
  // hold ~3 s puis fondu blanc de rebouclage 28,8 → 30 (master)
  tl.to("#white-overlay", { opacity: 1, duration: 1.2, ease: "power1.inOut" }, 5.1);
  tl.set("#s5", { visibility: "hidden" }, 6.3);
  return tl;
}
tl.add(scene5(), 23.7);
// La master doit durer exactement 30 s (le fondu blanc se termine à 30,0)
console.assert(Math.abs(tl.duration() - 30) < 0.15, "durée master ≈ 30 s, obtenu : " + tl.duration());
```

- [ ] **Step 2 : Builder, vérifier, contrôle du rebouclage**

```bash
node motion/build.mjs && node motion/verify.mjs
```

Console : `pause(25.5)` → écran bleu plein, logo crème/blanc. `pause(27)` → tagline « On s'occupe du reste. ». `pause(29.6)` → quasi blanc. `pause(29.98)` puis `pause(0.02)` → **les deux frames sont blanches** (raccord invisible). `SEREN_MOTION.tl.duration()` → 30 ± 0,15. Laisser tourner 3 cycles complets (`play()`) : aucune couture perceptible, aucun élément fantôme d'un cycle précédent.

- [ ] **Step 3 : Commit**

```bash
git add motion/src/motion.js motion/seren-motion.html
git commit -m "feat(motion): scène 5 — reveal bleu, logo, tagline, fondu blanc de rebouclage (30 s)"
```

---

### Task 10 : Contrôles clavier + curseur auto-masqué

**Files:**
- Modify: `motion/src/motion.js`

- [ ] **Step 1 : Ajouter les contrôles à la fin du fichier** (avant le bloc debug)

```js
// ---------- contrôles (aucune UI visible) : Espace pause · F plein écran · L langue ----------
addEventListener("keydown", e => {
  if (e.code === "Space") { e.preventDefault(); tl.paused(!tl.paused()); }
  else if (e.key === "f" || e.key === "F") {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  }
  else if (e.key === "l" || e.key === "L") applyLang(lang === "fr" ? "en" : "fr");
});

// curseur masqué après 3 s d'inactivité (fond de salle)
let idleTimer;
function wakeCursor() {
  document.body.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add("idle"), 3000);
}
addEventListener("mousemove", wakeCursor);
wakeCursor();
```

- [ ] **Step 2 : Builder, vérifier, contrôle manuel**

```bash
node motion/build.mjs && node motion/verify.mjs
```

Dans le navigateur : **Espace** fige/reprend l'animation. **F** passe en plein écran (letterbox blanc), **F** à nouveau en sort. **L** bascule TOUTES les chaînes en EN pendant que l'animation continue (re-**L** → FR). Ne plus bouger la souris 3 s → curseur disparaît ; bouger → réapparaît. `?lang=en` au chargement → démarre en EN.

- [ ] **Step 3 : Commit**

```bash
git add motion/src/motion.js motion/seren-motion.html
git commit -m "feat(motion): contrôles Espace/F/L + curseur auto-masqué"
```

---

### Task 11 : Vérification finale des 8 critères d'acceptation + merge

Aucun nouveau fichier — validation systématique de `docs/design-motion-presentation.md` § Critères d'acceptation.

- [ ] **Critère 1 — boucle** : regarder 3 cycles complets ; raccord S5→S1 invisible (et test frames : `pause(29.98)` / `pause(0.02)` toutes deux blanches).
- [ ] **Critère 2 — sans son** : les 5 captions font ≥ 60 px (`getComputedStyle($(".caption")).fontSize` ≥ 60) et le parcours se comprend sans narration (jugement visuel).
- [ ] **Critère 3 — i18n** : `node motion/verify.mjs` ✅ parité ; visuellement, mode EN : parcourir les 5 scènes (`pause()` à 3/8/14/21/26 s) → zéro chaîne FR résiduelle ; idem FR.
- [ ] **Critère 4 — offline** : ouvrir en `file://` ; onglet Network : 0 requête après chargement. `verify.mjs` ✅ « aucune référence réseau ».
- [ ] **Critère 5 — écrans** : fenêtre 16:9 plein écran → aucune bande ; fenêtre 16:10 (MacBook) → letterbox blanc haut/bas, aucun rognage ni scrollbar.
- [ ] **Critère 6 — contrôles** : Espace/F/L + curseur 3 s (revalidés).
- [ ] **Critère 7 — isolation** :

```bash
npm run build && npm test
git status --porcelain -- src/ server/ tests/ package.json vite.config.ts
```

Attendu : build + tests verts, la commande `git status` ci-dessus ne liste **que** les fichiers du chantier courriers déjà présents avant (letter-templates), rien causé par ce chantier.

- [ ] **Critère 8 — poids & fluidité** : `verify.mjs` ✅ poids ; visuellement aucune saccade sur un cycle complet (60 fps perçu ; en cas de doute, onglet Performance du navigateur, pas de long frame > 32 ms hors chargement).
- [ ] **Fraîcheur du build** (note post-revue Task 2) : `node motion/build.mjs && git diff --exit-code -- motion/seren-motion.html` → diff vide (le livrable committé correspond bien aux sources).
- [ ] **Documenter** : si des valeurs (timings, tailles) ont été ajustées en cours d'exécution, les reporter en « note post-revue » en tête de ce plan.
- [ ] **Merge fast-forward dans main** (ne pas pousser — Arnaud le fait) :

```bash
git checkout main && git merge --ff-only feature/motion-presentation && git log --oneline -3
```

---

## Auto-revue du plan (faite à l'écriture)

- **Couverture spec** : storyboard 5 scènes → Tasks 5-9 ; transitions continues → sorties/entrées chevauchantes (convergence S1→carte S2, étirement S2→S3, repli S4→cercle S5, fondu blanc S5→S1) ; i18n → Tasks 3/10 + verify ; offline/vendoring → Task 2 ; composition/letterbox → Task 1 ; contrôles → Task 10 ; 8 critères → Task 11. Direction artistique (tokens, tailles, eases doux) → CSS Task 4 + eases `power*/sine` dans les scènes.
- **Placeholders** : le seul contenu non inliné est le SVG du logo (asset existant, commande `sed` exacte fournie, Task 4 Step 2) — délibéré.
- **Cohérence des types/noms** : `SEREN_MOTION.{tl, applyLang}` (Tasks 5/10/11), ids `#s1…#s5`, `#s3-bar/dot2/tag2`, `#s4-sent`, `#s5-bg/logo/tag`, `#white-overlay` cohérents entre template (Task 4), CSS (Task 4) et scènes (Tasks 5-9). `--sel` définie Task 6 Step 2 et utilisée Task 6 Step 1.
