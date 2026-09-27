"use strict";
// Démo produit Seren — parcours complet rejoué à l'identique (mêmes écrans, même rythme),
// sans aucun sous-titre : le curseur simulé et la frappe progressive portent seuls le récit.
// Rendu déterministe (voir render.mjs) : chaque frame fige la timeline GSAP à l'instant exact.

function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  const stage = document.getElementById("stage");
  stage.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
  stage.style.left = "0"; stage.style.top = "0";
}
addEventListener("resize", fit);
fit();

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const cursor = $("#cursor");
const ring = $("#click-ring");

const tl = gsap.timeline({ paused: true });

// ---------- curseur simulé ----------
function cursorTo(at, x, y, dur = 0.55) {
  tl.to(cursor, { left: x, top: y, duration: dur, ease: "power2.inOut" }, at);
}
function clickAt(at, x, y) {
  tl.set(ring, { left: x, top: y, opacity: 1, scale: 0.4 }, at);
  tl.to(ring, { scale: 1.4, opacity: 0, duration: 0.4, ease: "power1.out" }, at);
}
function pressBtn(at, sel, dur = 0.16) {
  tl.to(sel, { scale: 0.97, filter: "brightness(0.92)", duration: dur, ease: "power1.in" }, at);
  tl.to(sel, { scale: 1, filter: "brightness(1)", duration: dur, ease: "power1.out" }, at + dur);
}

// ---------- frappe progressive (aucun plugin requis : tween d'un compteur) ----------
function typeText(at, sel, text, dur) {
  const el = document.querySelector(sel);
  const proxy = { n: 0 };
  tl.set(el.parentElement, { borderColor: "#006BFA", boxShadow: "0 0 0 4px #EAF3FE" }, at);
  tl.to(proxy, {
    n: text.length, duration: dur, ease: "none",
    onUpdate: () => { el.textContent = text.slice(0, Math.round(proxy.n)); },
  }, at);
  tl.set(el.parentElement, { borderColor: "#D9DBE0", boxShadow: "none" }, at + dur + 0.35);
}

// ---------- transition : fondu enchaîné entre deux scènes plein écran ----------
function cut(at, outId, inId, dur = 0.45, overlap = 0.18) {
  if (outId) {
    tl.to(`#${outId}`, { opacity: 0, duration: dur, ease: "power1.inOut" }, at);
    tl.set(`#${outId}`, { visibility: "hidden" }, at + dur);
  }
  const inStart = at + dur - overlap;
  tl.set(`#${inId}`, { opacity: 0, visibility: "visible" }, inStart);
  tl.to(`#${inId}`, { opacity: 1, duration: dur, ease: "power1.inOut" }, inStart);
  return inStart + dur;
}

let t = 0; // curseur temporel courant

// Le curseur simulé n'apparaît que sur les écrans applicatifs (jamais sur les cartes-titres).
tl.set(cursor, { left: 960, top: 344, opacity: 0 }, 0);

// ================= INTRO =================
tl.set("#intro", { visibility: "visible" }, t);
tl.set(".tlogo, .ttitle, .tpill", { opacity: 0, y: 22 }, t);
tl.to(".tlogo", { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, t + 0.1);
tl.to(".ttitle", { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" }, t + 0.32);
tl.to(".tpill", { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, t + 0.62);
t += 4.0;

// ================= PF LOGIN =================
t = cut(t, "intro", "pf-login");
tl.to(cursor, { opacity: 1, duration: 0.3 }, t);
cursorTo(t + 0.2, 960, 344, 0.5);
typeText(t + 0.75, "#pf-email-in .txt", "gerant@pf-delmas.example", 1.0);
cursorTo(t + 1.9, 960, 444, 0.4);
typeText(t + 2.35, "#pf-pwd-in .txt", "••••••••", 0.7);
cursorTo(t + 3.2, 960, 519, 0.4);
clickAt(t + 3.65, 960, 519);
pressBtn(t + 3.65, "#pf-login-btn");
t += 5.4;

// ================= PF DOSSIERS (1) =================
t = cut(t, "pf-login", "pf-dossiers-1");
tl.set("#pf-dossiers-1 .dossier-card", { opacity: 0, y: 24 }, t);
tl.to("#pf-dossiers-1 .dossier-card", { opacity: 1, y: 0, duration: 0.42, ease: "power2.out", stagger: 0.18 }, t + 0.15);
cursorTo(t + 1.4, 960, 520, 0.6);
t += 4.4;

// ================= PF OUVRIR DOSSIER (formulaire) =================
t = cut(t, "pf-dossiers-1", "pf-open-form");
cursorTo(t + 0.15, 700, 260, 0.4);
typeText(t + 0.5, "#f-prenom .txt", "Camille", 0.55);
cursorTo(t + 1.15, 1150, 260, 0.35);
typeText(t + 1.45, "#f-nom .txt", "Roussel", 0.55);
cursorTo(t + 2.1, 900, 350, 0.35);
typeText(t + 2.4, "#f-email .txt", "camille.roussel@famille.example", 1.05);
cursorTo(t + 3.6, 700, 470, 0.35);
typeText(t + 3.9, "#f-dprenom .txt", "Bernard", 0.55);
cursorTo(t + 4.55, 1150, 470, 0.35);
typeText(t + 4.85, "#f-dnom .txt", "Roussel", 0.55);
cursorTo(t + 5.55, 750, 560, 0.4);
clickAt(t + 6.0, 750, 560);
pressBtn(t + 6.0, "#f-submit");
t += 6.8;

// ================= PF INVITATION ENVOYÉE =================
t = cut(t, "pf-open-form", "pf-invite-sent");
tl.set("#pf-invite-sent div[style*='success-light'], #pf-invite-sent div > button.btn-outline", { opacity: 0, y: 14 }, t);
tl.to("#pf-invite-sent div[style*='success-light']", { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, t + 0.15);
tl.to("#pf-invite-sent div > button.btn-outline", { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, t + 0.5);
t += 3.0;

// ================= PF DOSSIERS (2) =================
t = cut(t, "pf-invite-sent", "pf-dossiers-2");
tl.set("#pf-dossiers-2 .dossier-card:first-child", { scale: 1.02 }, t);
tl.to("#pf-dossiers-2 .dossier-card:first-child", { scale: 1, duration: 0.5, ease: "back.out(1.6)" }, t + 0.1);
t += 3.4;

// ================= FAMILLE : ACTIVATION =================
t = cut(t, "pf-dossiers-2", "fam-activate");
cursorTo(t + 0.2, 960, 528, 0.4);
typeText(t + 0.6, "#pwd1 .txt", "••••••••••", 0.75);
cursorTo(t + 1.55, 960, 595, 0.35);
typeText(t + 1.85, "#pwd2 .txt", "••••••••••", 0.6);
cursorTo(t + 2.6, 960, 660, 0.4);
clickAt(t + 3.0, 960, 660);
pressBtn(t + 3.0, "#activate-btn");
t += 4.0;

// ================= FAMILLE : CONSENTEMENT =================
t = cut(t, "fam-activate", "fam-consent");
tl.set(["#c1", "#c2", "#c3"], { backgroundColor: "#ffffff", borderColor: "#D9DBE0" }, t);
tl.set(["#c1 svg", "#c2 svg", "#c3 svg"], { opacity: 0 }, t);
cursorTo(t + 0.2, 850, 470, 0.35);
tl.to("#c1", { backgroundColor: "#006BFA", borderColor: "#006BFA", duration: 0.2 }, t + 0.5);
tl.to("#c1 svg", { opacity: 1, duration: 0.2 }, t + 0.5);
cursorTo(t + 0.85, 850, 545, 0.35);
tl.to("#c2", { backgroundColor: "#006BFA", borderColor: "#006BFA", duration: 0.2 }, t + 1.15);
tl.to("#c2 svg", { opacity: 1, duration: 0.2 }, t + 1.15);
cursorTo(t + 1.5, 850, 630, 0.35);
tl.to("#c3", { backgroundColor: "#006BFA", borderColor: "#006BFA", duration: 0.2 }, t + 1.8);
tl.to("#c3 svg", { opacity: 1, duration: 0.2 }, t + 1.8);
cursorTo(t + 2.4, 960, 800, 0.4);
clickAt(t + 2.85, 960, 800);
pressBtn(t + 2.85, "#consent-btn");
t += 3.8;

// ================= QUESTIONNAIRE Q1 =================
t = cut(t, "fam-consent", "q1");
tl.set("#q1-sel .q-radio", { borderColor: "#D9DBE0" }, t);
tl.set("#q1-sel", { borderColor: "#D9DBE0", backgroundColor: "#ffffff" }, t);
cursorTo(t + 0.3, 960, 713, 0.45);
tl.to("#q1-sel", { borderColor: "#006BFA", backgroundColor: "#EAF3FE", duration: 0.3 }, t + 0.75);
tl.to("#q1-sel .q-radio", { borderColor: "#006BFA", duration: 0.3 }, t + 0.75);
cursorTo(t + 1.3, 1200, 963, 0.4);
clickAt(t + 1.75, 1200, 963);
pressBtn(t + 1.75, "#q1-btn");
t += 3.8;

// ================= QUESTIONNAIRE Q2 =================
t = cut(t, "q1", "q2");
tl.set("#q2-sel", { borderColor: "#D9DBE0", backgroundColor: "#ffffff", color: "#42424A" }, t);
cursorTo(t + 0.3, 960, 706, 0.45);
tl.to("#q2-sel", { borderColor: "#006BFA", backgroundColor: "#EAF3FE", color: "#1D1D1D", duration: 0.3 }, t + 0.75);
cursorTo(t + 1.3, 1200, 913, 0.4);
clickAt(t + 1.75, 1200, 913);
pressBtn(t + 1.75, "#q2-btn");
t += 3.6;

// ================= QUESTIONNAIRE Q3 =================
t = cut(t, "q2", "q3");
cursorTo(t + 0.3, 1200, 833, 0.4);
clickAt(t + 0.8, 1200, 833);
pressBtn(t + 0.8, "#q3-btn");
t += 3.2;

// ================= RÉCAP =================
t = cut(t, "q3", "recap");
tl.to(cursor, { opacity: 0, duration: 0.25 }, t);
tl.set(".recap-check", { scale: 0 }, t);
tl.set(".recap-card p, .recap-count, .recap-tags span, .recap-card button", { opacity: 0, y: 14 }, t);
tl.to(".recap-check", { scale: 1, duration: 0.4, ease: "back.out(2)" }, t + 0.1);
tl.to(".recap-card p", { opacity: 1, y: 0, duration: 0.35, ease: "power2.out", stagger: 0.12 }, t + 0.4);
tl.to(".recap-count", { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }, t + 0.95);
tl.to(".recap-tags span", { opacity: 1, y: 0, duration: 0.3, ease: "power2.out", stagger: 0.08 }, t + 1.2);
tl.to(".recap-card button", { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }, t + 1.6);
t += 5.2;

// ================= DASHBOARD =================
t = cut(t, "recap", "dashboard");
tl.to(cursor, { opacity: 1, duration: 0.25 }, t);
tl.set("#dashboard .hero-bar", { width: "0%" }, t);
tl.set("#dashboard .action-card", { opacity: 0, y: 18 }, t);
tl.to("#dashboard .hero-bar", { width: "3%", duration: 0.6, ease: "power2.inOut" }, t + 0.2);
tl.to("#dashboard .action-card", { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", stagger: 0.15 }, t + 0.6);
t += 5.0;

// ================= ROADMAP LIST =================
t = cut(t, "dashboard", "roadmap-list");
tl.set("#roadmap-list .rm-row", { opacity: 0, x: -18 }, t);
tl.to("#roadmap-list .rm-row", { opacity: 1, x: 0, duration: 0.36, ease: "power2.out", stagger: 0.13 }, t + 0.15);
cursorTo(t + 1.6, 1600, 480, 0.5);
t += 4.4;

// ================= ROADMAP EXPAND =================
t = cut(t, "roadmap-list", "roadmap-expand");
tl.from("#roadmap-expand .rm-expand", { opacity: 0, y: -14, duration: 0.35, ease: "power2.out" }, t + 0.1);
cursorTo(t + 0.9, 700, 660, 0.35);
typeText(t + 1.2, "#carsat-org .txt", "Bordeaux", 0.55);
cursorTo(t + 1.9, 1470, 660, 0.35);
typeText(t + 2.2, "#carsat-lien .txt", "fille", 0.4);
t += 4.2;

// ================= LETTER FILL (aperçu) =================
t = cut(t, "roadmap-expand", "letter-fill");
tl.set("#letter-fill .letter-text", { opacity: 0, y: 16 }, t);
tl.to("#letter-fill .letter-text", { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" }, t + 0.15);
t += 4.0;

// ================= LETTER FINAL =================
t = cut(t, "letter-fill", "letter-final");
tl.set("#letter-final .mini-btn", { opacity: 0, y: 12 }, t);
tl.to("#letter-final .mini-btn", { opacity: 1, y: 0, duration: 0.32, ease: "power2.out", stagger: 0.1 }, t + 0.2);
t += 3.3;

// ================= ADRESSE EXPÉDITEUR =================
t = cut(t, "letter-final", "sender-address");
cursorTo(t + 0.15, 700, 300, 0.35);
typeText(t + 0.45, "#sa-nom .txt", "Camille Roussel", 0.6);
cursorTo(t + 1.15, 1470, 300, 0.35);
typeText(t + 1.45, "#sa-adr .txt", "8 allée des Mimosas", 0.65);
cursorTo(t + 2.2, 700, 405, 0.3);
typeText(t + 2.45, "#sa-cp .txt", "33200", 0.35);
cursorTo(t + 2.9, 1470, 405, 0.3);
typeText(t + 3.15, "#sa-ville .txt", "Bordeaux", 0.45);
t += 4.2;

// ================= ADRESSE DESTINATAIRE + ENVOI =================
t = cut(t, "sender-address", "recipient-address");
cursorTo(t + 0.15, 700, 300, 0.35);
typeText(t + 0.45, "#ra-nom .txt", "Carsat Aquitaine", 0.6);
cursorTo(t + 1.15, 1470, 300, 0.35);
typeText(t + 1.45, "#ra-adr .txt", "80 avenue de la Jallère", 0.7);
cursorTo(t + 2.25, 700, 405, 0.3);
typeText(t + 2.5, "#ra-cp .txt", "33053", 0.35);
cursorTo(t + 2.95, 1470, 405, 0.3);
typeText(t + 3.2, "#ra-ville .txt", "Bordeaux Cedex", 0.55);
cursorTo(t + 3.9, 1750, 495, 0.4);
clickAt(t + 4.35, 1750, 495);
pressBtn(t + 4.35, "#send-btn");
t += 5.2;

// ================= NOUVEAU : MES COURRIERS (historique) =================
// Le clic sur « Envoyer » amène directement à l'historique des courriers envoyés.
cursorTo(t, 1780, 66, 0.45); // remonte vers le lien de nav « Courriers »
t += 0.5;
t = cut(t, "recipient-address", "mes-courriers", 0.5, 0.2);
tl.set("#mes-courriers .doc-card", { opacity: 0, y: 20 }, t);
tl.to("#mes-courriers .doc-card", { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", stagger: 0.16 }, t + 0.2);
tl.set("#carsat-sent-pill", { opacity: 0, scale: 0.6 }, t + 0.55);
tl.to("#carsat-sent-pill", { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.2)" }, t + 0.85);
tl.set("#doc-carsat", { boxShadow: "0 0 0 0px #EAF3FE" }, t + 0.55);
tl.to("#doc-carsat", { boxShadow: "0 0 0 6px #EAF3FE", duration: 0.3, ease: "power1.out" }, t + 0.85);
tl.to("#doc-carsat", { boxShadow: "0 0 0 4px #EAF3FE", duration: 0.3, ease: "power1.in" }, t + 1.4);
t += 6.4;

// ================= PF DOSSIERS (3) — Roussel activé =================
t = cut(t, "mes-courriers", "pf-dossiers-3");
tl.set("#pf-dossiers-3 p", { opacity: 0, y: 12 }, t);
tl.to("#pf-dossiers-3 p", { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, t + 0.35);
t += 3.4;

// ================= ADMIN SEREN =================
t = cut(t, "pf-dossiers-3", "admin");
tl.set("#admin tbody tr", { opacity: 0, y: 12 }, t);
tl.to("#admin tbody tr", { opacity: 1, y: 0, duration: 0.32, ease: "power2.out", stagger: 0.14 }, t + 0.2);
t += 3.4;

// ================= SUMMARY (modèle économique) =================
t = cut(t, "admin", "summary");
tl.to(cursor, { opacity: 0, duration: 0.25 }, t);
tl.set(["#sum1", "#sum2", "#sum3"], { opacity: 0, y: 14 }, t);
tl.to("#sum1", { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, t + 0.25);
tl.to("#sum2", { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, t + 1.15);
tl.to("#sum3", { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, t + 2.05);
t += 7.2;

tl.set({}, {}, t); // borne explicite de fin de timeline

window.SEREN_DEMO = { tl };
tl.play(0);
tl.pause(0);
// Un .set() positionné exactement à t=0 ne se rend pas tout seul (particularité GSAP :
// play(0) puis pause(0) ne déclenchent pas de rendu quand le temps ne change pas) — on force
// donc le premier rendu explicitement, ici et à chaque frame demandée par render.mjs.
tl.render(0, false, true);

// ---------- debug : ?t=12.3 fige le montage à un instant donné ----------
const dbgT = new URLSearchParams(location.search).get("t");
if (dbgT !== null) tl.render(parseFloat(dbgT), false, true);

// Espace = pause/reprise · F = plein écran (aucune UI visible)
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code === "Space") { e.preventDefault(); tl.paused(!tl.paused()); }
  else if (e.key === "f" || e.key === "F") {
    document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : document.documentElement.requestFullscreen().catch(() => {});
  }
});
