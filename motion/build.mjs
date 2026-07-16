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
  try { dir = readdirSync(join(SRC, "fonts")).filter(f => f.endsWith(".woff2")); }
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
