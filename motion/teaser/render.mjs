#!/usr/bin/env node
// Exporte motion/teaser/seren-teaser.html en .mp4 (H.264, 1920×1080, 30 fps).
// Rendu déterministe image par image (pas de lecture temps réel) : chaque frame fige la
// timeline GSAP à l'instant exact (?t=…), donc zéro frame perdue/saccade quelle que soit la
// machine. Prérequis, absents des dépendances npm du repo (outillage ponctuel, pas un besoin
// de l'app) : Playwright (headless Chromium) et un ffmpeg avec libx264 (`apt-get install ffmpeg`
// — le ffmpeg vendored par Playwright ne fait que du webm/VP8, insuffisant pour du .mp4).
// Usage : node motion/teaser/build.mjs && node motion/teaser/render.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const HTML = join(ROOT, "seren-teaser.html");
const OUT_DIR = join(ROOT, "export");
const FRAMES_DIR = join(OUT_DIR, "_frames");
const OUT_MP4 = join(OUT_DIR, "seren-teaser.mp4");
const FPS = 30;

if (!existsSync(HTML)) throw new Error("seren-teaser.html introuvable — lancer d'abord build.mjs");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  const { createRequire } = await import("node:module");
  ({ chromium } = await import(createRequire(import.meta.url).resolve("playwright/index.mjs").replace(/^/, "file://")));
}

rmSync(FRAMES_DIR, { recursive: true, force: true });
mkdirSync(FRAMES_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`file://${HTML}?t=0`, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(150);

const duration = await page.evaluate(() => window.SEREN_TEASER.tl.duration());
const totalFrames = Math.round(duration * FPS);
console.log(`durée ${duration.toFixed(3)}s → ${totalFrames} frames @ ${FPS}fps`);

for (let i = 0; i < totalFrames; i++) {
  const t = Math.min(i / FPS, duration);
  await page.evaluate((tt) => { window.SEREN_TEASER.tl.pause(tt); }, t);
  await page.screenshot({ path: join(FRAMES_DIR, `f${String(i).padStart(5, "0")}.png`) });
}
await browser.close();
console.log(`${totalFrames} frames rendues → encodage ffmpeg…`);

execFileSync("ffmpeg", [
  "-y", "-framerate", String(FPS), "-i", join(FRAMES_DIR, "f%05d.png"),
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "15", "-preset", "slow",
  "-movflags", "+faststart", OUT_MP4,
], { stdio: "inherit" });

rmSync(FRAMES_DIR, { recursive: true, force: true });
console.log(`OK ${OUT_MP4}`);
