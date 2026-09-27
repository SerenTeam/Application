#!/usr/bin/env node
// Exporte motion/demo/seren-demo.html en .mp4 (H.264, 1920×1080, 30 fps).
// Rendu déterministe image par image (pas de lecture temps réel) : chaque frame fige la
// timeline GSAP à l'instant exact (?t=…), donc zéro frame perdue/saccade quelle que soit la
// machine. Prérequis, absents des dépendances npm du repo (outillage ponctuel, pas un besoin
// de l'app) : Playwright (headless Chromium) et un ffmpeg avec libx264.
// Usage : node motion/demo/build.mjs && node motion/demo/render.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const HTML = join(ROOT, "seren-demo.html");
const OUT_DIR = join(ROOT, "export");
const FRAMES_DIR = join(OUT_DIR, "_frames");
const OUT_MP4 = join(OUT_DIR, "seren-demo.mp4");
const FPS = 30;

if (!existsSync(HTML)) throw new Error("seren-demo.html introuvable — lancer d'abord build.mjs");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  const globalCandidates = ["/opt/node22/lib/node_modules/playwright/index.mjs"];
  const found = globalCandidates.find(existsSync);
  if (!found) throw new Error("Playwright introuvable — `npm install playwright` (local ou global)");
  ({ chromium } = await import(`file://${found}`));
}

rmSync(FRAMES_DIR, { recursive: true, force: true });
mkdirSync(FRAMES_DIR, { recursive: true });

const browser = await chromium.launch();

// Durée : une première page jetable suffit à la lire (repartir d'une page fraîche
// ensuite pour chaque frame — cf. note ci-dessous).
{
  const probe = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await probe.goto(`file://${HTML}?t=0`, { waitUntil: "load" });
  await probe.evaluate(() => document.fonts.ready);
  globalThis.__DURATION__ = await probe.evaluate(() => window.SEREN_DEMO.tl.duration());
  await probe.close();
}
const duration = globalThis.__DURATION__;
const totalFrames = Math.round(duration * FPS);
console.log(`durée ${duration.toFixed(3)}s → ${totalFrames} frames @ ${FPS}fps`);

// Rendu par rechargement de page (une navigation `?t=…` par frame) plutôt que par relecture
// d'une même page longue durée : le DOM de la démo est lourd (~20 écrans complets superposés) et
// un `page.evaluate` répété sur la même page fait planter le renderer Chromium headless dans cet
// environnement (constaté empiriquement — aucune erreur, juste "Target page ... has been closed").
// Chaque page.goto est un aller simple : coût mesuré ~150-200ms/frame, stable sur 1000+ frames.
let page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
for (let i = 0; i < totalFrames; i++) {
  const t = Math.min(i / FPS, duration);
  await page.goto(`file://${HTML}?t=${t}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(FRAMES_DIR, `f${String(i).padStart(5, "0")}.png`) });
  if (i > 0 && i % 300 === 0) {
    // Recycle la page périodiquement par précaution (fuite mémoire éventuelle sur un aussi long tirage).
    await page.close();
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    console.log(`  …frame ${i}/${totalFrames}`);
  }
}
await page.close();
await browser.close();
console.log(`${totalFrames} frames rendues → encodage ffmpeg…`);

execFileSync("ffmpeg", [
  "-y", "-framerate", String(FPS), "-i", join(FRAMES_DIR, "f%05d.png"),
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow",
  "-movflags", "+faststart", OUT_MP4,
], { stdio: "inherit" });

rmSync(FRAMES_DIR, { recursive: true, force: true });
console.log(`OK ${OUT_MP4}`);
