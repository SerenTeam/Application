#!/usr/bin/env node
// Vérifications mécaniques du livrable. Usage : node motion/demo/verify.mjs — exit 1 si échec.
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "seren-demo.html");
const html = readFileSync(OUT, "utf8");
let fail = 0;
const check = (ok, label) => { console.log(`${ok ? "✅" : "❌"} ${label}`); if (!ok) fail = 1; };

// 1. Poids raisonnable (polices + gsap vendored, pas de médias lourds)
check(statSync(OUT).size < 900 * 1024, `poids ${Math.round(statSync(OUT).size / 1024)} KB < 900 KB`);

// 2. Zéro requête réseau
const network = /(src|href)\s*=\s*["'](https?:)?\/\/|url\(\s*["']?(https?:)?\/\/|@import|fetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon|[^\w.]import\(/;
check(!network.test(html), "aucune référence réseau");

// 3. Aucun sous-titre : pas de bandeau de légende superposé aux écrans (demande explicite —
// le récit passe uniquement par le curseur simulé et la frappe progressive). On ne cherche que
// dans le corps de la page (hors polices vendored en base64 dans <head>, où la même sous-chaîne
// peut apparaître par hasard).
const body = html.slice(html.indexOf("<body>"));
check(!/class="caption"|<div class="cap|classe de sous-titre|bandeau de sous-titre/i.test(body), "aucun élément de sous-titrage dans le DOM");

// 4. Aucun nom de prestataire d'envoi (choix produit constant : scène générique)
const providerNames = /mysendingbox|resend/i;
check(!providerNames.test(html), "aucun nom de prestataire d'envoi cité");

// 5. La nouvelle scène « Mes courriers » (historique des envois) est bien présente
check(html.includes('id="mes-courriers"') && html.includes("Mes courriers"), "scène « Mes courriers » (historique) présente");
check(html.includes('id="carsat-sent-pill"'), "le courrier CARSAT apparaît « Envoyé » dans l'historique");

// 6. Les scènes clés du parcours sont toutes présentes
const scenes = [
  "intro", "pf-login", "pf-dossiers-1", "pf-open-form", "pf-invite-sent", "pf-dossiers-2",
  "fam-activate", "fam-consent", "q1", "q2", "q3", "recap", "dashboard",
  "roadmap-list", "roadmap-expand", "letter-fill", "letter-final",
  "sender-address", "recipient-address", "mes-courriers",
  "pf-dossiers-3", "admin", "summary",
];
check(scenes.every((id) => html.includes(`id="${id}"`)), `${scenes.length} scènes présentes (parcours complet)`);

process.exit(fail);
