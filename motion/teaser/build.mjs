#!/usr/bin/env node
// Assemble motion/teaser/src/ en un seul fichier autonome motion/teaser/seren-teaser.html.
// Réutilise les polices et GSAP déjà vendored dans motion/src/ (zéro duplication binaire).
// Zéro dépendance, zéro requête réseau. Usage : node motion/teaser/build.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");
const SHARED = join(ROOT, "..", "src"); // motion/src (fonts + vendor communs à l'ambient loop et au teaser)

const FAMILY = { inter: "Inter", intertight: "Inter Tight" };

function fontsCss() {
  const dir = readdirSync(join(SHARED, "fonts")).filter(f => f.endsWith(".woff2")).sort();
  return dir.map(f => {
    const [slug, weight] = f.replace(".woff2", "").split("-");
    if (!FAMILY[slug] || !/^\d+$/.test(weight)) throw new Error("nom de police inattendu : " + f);
    const b64 = readFileSync(join(SHARED, "fonts", f)).toString("base64");
    return `@font-face{font-family:"${FAMILY[slug]}";font-style:normal;font-weight:${weight};` +
      `src:url(data:font/woff2;base64,${b64}) format("woff2");font-display:block;}`;
  }).join("\n");
}

function resolveInline(p) {
  // vendor/gsap.min.js vient du dossier partagé motion/src ; le reste (css/js) est local au teaser
  if (p.startsWith("vendor/")) return readFileSync(join(SHARED, p), "utf8");
  return readFileSync(join(SRC, p), "utf8");
}

let html = readFileSync(join(SRC, "template.html"), "utf8");
html = html.replaceAll(/\{\{INLINE:([^}]+)\}\}/g, (_, p) => resolveInline(p.trim()));
html = html.replace("{{FONTS_CSS}}", () => fontsCss());
writeFileSync(join(ROOT, "seren-teaser.html"), html);
console.log(`OK seren-teaser.html (${Math.round(html.length / 1024)} KB)`);
