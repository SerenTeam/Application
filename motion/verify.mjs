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
// Couvre aussi les URLs protocol-relative (//host), l'import() dynamique et WebSocket.
// Vérifié : gsap.min.js (vendored) ne déclenche aucun faux positif sur ce regex — 0 occurrence de
// "fetch(", "XMLHttpRequest", "WebSocket", "@import" ou "import(" ; ses occurrences de "http://" sont
// un message d'avertissement textuel et deux URI de namespace XML/SVG passées à createElementNS,
// jamais précédées de url(/src=/href=.
const network = /(src|href)\s*=\s*["'](https?:)?\/\/|url\(\s*["']?(https?:)?\/\/|@import|fetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon|[^\w.]import\(/;
check(!network.test(html), "aucune référence réseau");

// 3. Parité i18n fr/en (mêmes clés, aucune valeur vide)
const stringsMatch = html.match(/<script type="application\/json" id="strings">([\s\S]*?)<\/script>/);
check(!!stringsMatch, "bloc strings présent");
if (!stringsMatch) process.exit(1);
const strings = JSON.parse(stringsMatch[1]);
const fr = Object.keys(strings.fr).sort(), en = Object.keys(strings.en).sort();
check(JSON.stringify(fr) === JSON.stringify(en), `parité des clés fr/en (${fr.length} clés)`);
check([...Object.values(strings.fr), ...Object.values(strings.en)].every(v => typeof v === "string" && v.length > 0),
  "aucune valeur i18n vide");

// 4. Chaque data-i18n du DOM a sa clé dans fr ET en
const used = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);
const missing = used.filter(k => !(k in strings.fr) || !(k in strings.en));
check(missing.length === 0, `data-i18n tous couverts${missing.length ? " — manquants : " + missing.join(", ") : ""}`);

// 5. Aucun texte visible en dur dans le template (tout passe par data-i18n)
// — le <title> est exempté : chrome navigateur, invisible dans la composition
const template = readFileSync(join(ROOT, "src/template.html"), "utf8")
  .replace(/<title>[\s\S]*?<\/title>/, "<title></title>");
const hardcoded = [...template.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ]{3,}[^<>{}]*)</g)]
  .map(m => m[1].trim()).filter(t => t);
check(hardcoded.length === 0, `aucun texte en dur dans template.html${hardcoded.length ? " — trouvé : " + hardcoded.slice(0, 3).join(" | ") : ""}`);

process.exit(fail);
