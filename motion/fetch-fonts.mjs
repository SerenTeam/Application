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
