#!/usr/bin/env node
// Assemble motion/demo/src/ en un seul fichier autonome motion/demo/seren-demo.html.
// Réutilise les polices et GSAP déjà vendored dans motion/src/ (zéro duplication binaire).
// Zéro dépendance, zéro requête réseau. Usage : node motion/demo/build.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");
const SHARED = join(ROOT, "..", "src"); // motion/src (fonts + vendor communs à l'ambient loop et à la démo)

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
  if (p.startsWith("vendor/")) return readFileSync(join(SHARED, p), "utf8");
  return readFileSync(join(SRC, p), "utf8");
}

// Logo Seren réel (public/seren-logo.svg), icône + wordmark — jamais redessiné à la main.
const LOGO_SVG = readFileSync(join(ROOT, "..", "..", "public", "seren-logo.svg"), "utf8").trim();
const logoFull = (height) => `<svg viewBox="0 0 208 80" style="height:${height}px;width:auto;" xmlns="http://www.w3.org/2000/svg">${LOGO_SVG.match(/<path[^>]*\/>/g).join("")}</svg>`;

// Icônes Lucide (traits, 20×20 viewBox 24) — mêmes familles que l'app (lucide-react).
const ICONS = {
  ICO_GRID: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>`,
  ICO_MAP: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>`,
  ICO_DOC: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>`,
  ICO_PHONE: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  ICO_CLIPBOARD: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>`,
  ICO_SHIELD: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
  ICO_RECEIPT: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h16v20l-3-2-2 2-2-2-2 2-2-2-2 2-3-2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/></svg>`,
};

let html = readFileSync(join(SRC, "template.html"), "utf8");
html = html.replaceAll(/\{\{INLINE:([^}]+)\}\}/g, (_, p) => resolveInline(p.trim()));
html = html.replace("{{FONTS_CSS}}", () => fontsCss());
html = html.replaceAll("{{LOGO_FULL}}", () => logoFull(32));
for (const [key, svg] of Object.entries(ICONS)) {
  html = html.replaceAll(`{{${key}}}`, svg);
}

writeFileSync(join(ROOT, "seren-demo.html"), html);
console.log(`OK seren-demo.html (${Math.round(html.length / 1024)} KB)`);
