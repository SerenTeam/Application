#!/usr/bin/env node
// Vérifications mécaniques du livrable. Usage : node motion/teaser/verify.mjs — exit 1 si échec.
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "seren-teaser.html");
const html = readFileSync(OUT, "utf8");
let fail = 0;
const check = (ok, label) => { console.log(`${ok ? "✅" : "❌"} ${label}`); if (!ok) fail = 1; };

// 1. Poids < 500 KB
check(statSync(OUT).size < 500 * 1024, `poids ${Math.round(statSync(OUT).size / 1024)} KB < 500 KB`);

// 2. Zéro requête réseau
const network = /(src|href)\s*=\s*["'](https?:)?\/\/|url\(\s*["']?(https?:)?\/\/|@import|fetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon|[^\w.]import\(/;
check(!network.test(html), "aucune référence réseau");

// 3. Aucun nom de prestataire d'envoi (choix produit : scène d'envoi générique, sans marque)
const providerNames = /maileva|mysendingbox|resend/i;
check(!providerNames.test(html), "aucun nom de prestataire d'envoi cité (scène générique)");

// 4. Vocabulaire éditorial : jamais « décès » dans un titre d'accroche (règle CLAUDE.md)
const titleCards = [...html.matchAll(/<h1 class="tt">([\s\S]*?)<\/h1>/g)].map(m => m[1]);
check(titleCards.every(t => !/décès/i.test(t)), "aucun titre d'accroche ne contient « décès »");

// 5. Les 9 scènes attendues sont présentes
const scenes = ["t1", "v1", "t2", "v2", "t3", "v3", "t4", "v4", "sig"];
check(scenes.every(id => html.includes(`id="${id}"`)), `9 scènes présentes (${scenes.join(", ")})`);

process.exit(fail);
