"use strict";
// Teaser Seren — 1 lecture (pas de boucle), coupes "zoom punch" (Vox-style), FR uniquement.

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

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

// ---------- respiration continue du fond (indépendante des coupes) ----------
gsap.to("#blob-a", { x: 60, y: 40, duration: 9, ease: "sine.inOut", yoyo: true, repeat: -1 });
gsap.to("#blob-b", { x: -50, y: -35, duration: 10.5, ease: "sine.inOut", yoyo: true, repeat: -1 });

// ---------- helper : coupe "zoom punch" (Vox-style) — la scène sortante part en avant
// (zoom + flou de vitesse + fondu) pendant que la suivante s'amorce déjà en dessous
// (chevauchement de 0,18 s) : jamais de cache plein écran, l'énergie ne retombe jamais à zéro.
// La scène entrante garde sa propre chorégraphie (stagger de mots, pop de carte…) sans
// animation générique superposée, pour rester nette plutôt que de s'additionner au flou sortant.
const OUT_DUR = 0.26, OVERLAP = 0.12;
function cut(tl, at, outSel, inSel) {
  tl.to(outSel, { scale: 1.22, opacity: 0, filter: "blur(14px)", duration: OUT_DUR, ease: "power2.in" }, at);
  tl.set(outSel, { visibility: "hidden" }, at + OUT_DUR);
  const entry = at + OUT_DUR - OVERLAP, next = at + OUT_DUR;
  tl.set(inSel, { visibility: "visible" }, entry);
  return { cover: entry, next };
}

const tl = gsap.timeline({ paused: true });

// ================= T1 : "Après la perte d'un proche." =================
const T1_START = 0, T1_DUR = 1.35;
tl.set("#t1", { visibility: "visible" }, T1_START);
tl.set("#t1 .w", { opacity: 0, y: 30, skewY: 4 }, T1_START);
tl.to("#t1 .w", { opacity: 1, y: 0, skewY: 0, duration: 0.55, ease: "power3.out", stagger: 0.055 }, T1_START + 0.05);

let c = cut(tl, T1_START + T1_DUR, "#t1", "#v1");

// ================= V1 : débordement de papiers =================
const V1_START = c.next, V1_DUR = 2.5;
const ROT = [-9, 7, -13, 6, -6, 11, -8, 5, -12, 8];
tl.set("#v1 .paper", { opacity: 0, scale: 0.9, y: 26, rotation: i => ROT[i] }, c.cover);
const gaps = [0, .12, .1, .09, .08, .08, .07, .07, .06, .06];
let pt = 0.02;
$$("#v1 .paper").forEach((p, i) => {
  pt += gaps[i];
  tl.to(p, { opacity: 1, scale: 1, y: 0, duration: 0.42, ease: "power2.out" }, V1_START + pt);
  tl.to(p, { y: "-=6", duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: 1 }, V1_START + pt + 0.5);
});

c = cut(tl, V1_START + V1_DUR, "#v1", "#t2");

// ================= T2 : "Quelques questions." =================
const T2_START = c.next, T2_DUR = 1.1;
tl.set("#t2 .w", { opacity: 0, y: 30, skewY: 4 }, c.cover);
tl.to("#t2 .w", { opacity: 1, y: 0, skewY: 0, duration: 0.5, ease: "power3.out", stagger: 0.06 }, T2_START + 0.04);

c = cut(tl, T2_START + T2_DUR, "#t2", "#v2");

// ================= V2 : questionnaire =================
const V2_START = c.next, V2_DUR = 2.9;
tl.set("#v2-card", { opacity: 0, y: 40, scale: 0.9 }, c.cover);
tl.set("#v2 .opt", { opacity: 0, x: -22 }, c.cover);
tl.set(".opt.sel", { background: "#fff", borderColor: "#D9DBE0", "--sel": 0 }, c.cover);
tl.to("#v2-card", { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(1.5)" }, V2_START);
tl.to("#v2 .opt", { opacity: 1, x: 0, duration: 0.4, ease: "power2.out", stagger: 0.13 }, V2_START + 0.32);
tl.to(".opt.sel", { background: "#EAF3FE", borderColor: "#006BFA", duration: 0.35, ease: "power1.inOut" }, V2_START + 1.55);
tl.to(".opt.sel", { "--sel": 1, duration: 0.32, ease: "back.out(2.2)" }, V2_START + 1.68);

c = cut(tl, V2_START + V2_DUR, "#v2", "#t3");

// ================= T3 : "Votre parcours, dans le bon ordre." =================
const T3_START = c.next, T3_DUR = 1.3;
tl.set("#t3 .w", { opacity: 0, y: 30, skewY: 4 }, c.cover);
tl.to("#t3 .w", { opacity: 1, y: 0, skewY: 0, duration: 0.45, ease: "power3.out", stagger: 0.045 }, T3_START + 0.04);

c = cut(tl, T3_START + T3_DUR, "#t3", "#v3");

// ================= V3 : roadmap =================
const V3_START = c.next, V3_DUR = 2.9;
tl.set("#v3-card", { opacity: 0, y: 40, scaleY: 0.88, transformOrigin: "50% 30%" }, c.cover);
tl.set("#v3 .row", { opacity: 0, x: -22 }, c.cover);
tl.set("#v3-bar", { width: "25%" }, c.cover);
tl.set("#v3-dot2", { background: "#ffffff", borderColor: "#D9DBE0" }, c.cover);
tl.set("#v3-tag2", { opacity: 0, scale: 0.8 }, c.cover);
tl.to("#v3-card", { opacity: 1, y: 0, scaleY: 1, duration: 0.55, ease: "back.out(1.4)" }, V3_START);
tl.to("#v3 .row", { opacity: 1, x: 0, duration: 0.38, ease: "power2.out", stagger: 0.12 }, V3_START + 0.3);
tl.to("#v3-bar", { width: "31%", duration: 0.75, ease: "power2.inOut" }, V3_START + 1.05);
tl.to("#v3-dot2", { background: "#6B5CE7", borderColor: "#6B5CE7", duration: 0.3 }, V3_START + 1.35);
tl.to("#v3-tag2", { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.8)" }, V3_START + 1.5);

c = cut(tl, V3_START + V3_DUR, "#v3", "#t4");

// ================= T4 : "Rédigés. Envoyés partout." =================
const T4_START = c.next, T4_DUR = 1.1;
tl.set("#t4 .w", { opacity: 0, y: 30, skewY: 4 }, c.cover);
tl.to("#t4 .w", { opacity: 1, y: 0, skewY: 0, duration: 0.5, ease: "power3.out", stagger: 0.06 }, T4_START + 0.04);

c = cut(tl, T4_START + T4_DUR, "#t4", "#v4");

// ================= V4 : le courrier part vers CHAQUE organisme — la plus-value Seren =================
// (aucun nom de prestataire : "Banque", "Caisse de retraite", "Mutuelle santé", "Énergie" sont des
// catégories d'organismes, pas des marques — cohérent avec la décision produit "envoi générique")
const V4_START = c.next, V4_DUR = 4.2;
tl.set("#v4-card", { opacity: 0, y: 40, scale: 0.92 }, c.cover);
tl.set($$("#v4 .wline"), { width: 0 }, c.cover);
tl.set("#v4-sent", { opacity: 0, x: -14 }, c.cover);
tl.set(".org-pill", { opacity: 0, y: 20, scale: 0.9 }, c.cover);
tl.set(".org-check", { opacity: 0, scale: 0.4 }, c.cover);
tl.set(".v4-env", { opacity: 0, scale: 0.3, xPercent: -50, yPercent: -50, x: 0, y: 0, rotation: -6 }, c.cover);

tl.to("#v4-card", { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.4)" }, V4_START);
const widths = ["96%", "88%", "70%"];
$$("#v4 .wline").forEach((l, i) => {
  tl.to(l, { width: widths[i], duration: 0.36, ease: "power1.inOut" }, V4_START + 0.3 + i * 0.24);
});
tl.to("#v4-sent", { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }, V4_START + 1.15);
// les 4 organismes apparaissent autour du courrier
tl.to(".org-pill", { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.6)", stagger: 0.09 }, V4_START + 1.35);
// une enveloppe part du courrier vers chaque organisme, en cascade — le geste central du teaser
const ORG_TARGETS = [
  { env: "#env1", pill: "#org1", x: -660, y: -340, rot: -14 },
  { env: "#env2", pill: "#org2", x: 660, y: -340, rot: 12 },
  { env: "#env3", pill: "#org3", x: -660, y: 360, rot: 10 },
  { env: "#env4", pill: "#org4", x: 660, y: 360, rot: -10 },
];
ORG_TARGETS.forEach((o, i) => {
  const t0 = V4_START + 1.85 + i * 0.18;
  tl.to(o.env, { opacity: 1, scale: 1, duration: 0.16, ease: "power1.out" }, t0);
  tl.to(o.env, { x: o.x, y: o.y, rotation: o.rot, scale: 0.5, opacity: 0, duration: 0.5, ease: "power2.in" }, t0 + 0.05);
  tl.to(o.pill, { scale: 1.06, duration: 0.16, ease: "power2.out", yoyo: true, repeat: 1 }, t0 + 0.46);
  tl.to(o.pill + " .org-check", { opacity: 1, scale: 1, duration: 0.34, ease: "back.out(2.2)" }, t0 + 0.5);
});

c = cut(tl, V4_START + V4_DUR, "#v4", "#sig");

// ================= SIGNATURE : cercle bleu, logo, tagline =================
const SIG_START = c.next, SIG_DUR = 4.4;
tl.set("#sig-bg", { scale: 0, transformOrigin: "50% 50%" }, c.cover);
tl.set("#sig-logo", { opacity: 0, scale: 0.8 }, c.cover);
tl.set("#sig-tag", { opacity: 0, y: 22 }, c.cover);

tl.to("#sig-bg", { scale: 0.15, duration: 0.16, ease: "power1.out" }, SIG_START);
tl.to("#sig-bg", { scale: 1, duration: 0.85, ease: "power2.inOut" }, SIG_START + 0.16);
tl.to("#sig-logo", { opacity: 1, scale: 1, duration: 0.7, ease: "power2.out" }, SIG_START + 0.95);
tl.to("#sig-tag", { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, SIG_START + 1.35);
// respiration finale très lente (le plan reste posé, prêt à être coupé net en régie)
tl.to("#sig-logo, #sig-tag", { scale: 1.015, duration: SIG_DUR - 2.1, ease: "sine.inOut" }, SIG_START + 2.1);

tl.set({}, {}, SIG_START + SIG_DUR); // borne explicite de fin de timeline

window.SEREN_TEASER = { tl };
tl.play(0);

// ---------- debug : ?t=12.3 fige le montage à un instant donné ----------
const dbgT = new URLSearchParams(location.search).get("t");
if (dbgT !== null) tl.pause(parseFloat(dbgT));

// Espace = pause/reprise · F = plein écran (aucune UI visible)
addEventListener("keydown", e => {
  if (e.repeat) return;
  if (e.code === "Space") { e.preventDefault(); tl.paused(!tl.paused()); }
  else if (e.key === "f" || e.key === "F") {
    document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : document.documentElement.requestFullscreen().catch(() => {});
  }
});
