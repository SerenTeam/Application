"use strict";
// ---------- i18n ----------
const STRINGS = JSON.parse(document.getElementById("strings").textContent);
let lang = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "fr";
function applyLang(l) {
  lang = l;
  document.documentElement.lang = l;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (STRINGS[l][key] === undefined) console.warn("clé i18n manquante :", key);
    else el.textContent = STRINGS[l][key];
  });
}
applyLang(lang);

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

// ---------- utilitaires scènes ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const ROTATIONS = [-11, 9, 7, -14, 5, -7, 15, -5, 3, -8, 6, 12, 4, -18]; // p1..p14

// S1 (0 → 5,6 s) : cascade accélérée de 14 papiers, captions, puis convergence vers le centre
function scene1() {
  const tl = gsap.timeline();
  const papers = $$("#s1 .paper");
  // reset (rejoué à chaque cycle → premier frame toujours identique)
  tl.set("#s1", { visibility: "visible" }, 0);
  tl.set(papers, { opacity: 0, scale: 0.94, y: 22, rotation: i => ROTATIONS[i] }, 0);
  tl.set(["#s1-l1", "#s1-l2"], { opacity: 0, y: 24 }, 0);
  tl.set("#white-overlay", { opacity: 0 }, 0);

  tl.to("#s1-l1", { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 0.3);
  tl.to("#s1-l2", { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 1.1);
  // cascade qui s'accélère : gaps décroissants de 0,5 s → 0,12 s (dernier papier posé avant la convergence)
  const gaps = [0, .5, .45, .4, .36, .32, .28, .25, .22, .19, .17, .15, .13, .12];
  let t = 0.8;
  papers.forEach((p, i) => {
    t += gaps[i];
    tl.to(p, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "power2.out" }, t);
    // micro-flottement calé sur la fenêtre restante : chaque papier redescend pile à 4,9 s
    // (départ de la convergence) → la scène garde une durée structurelle exacte de 5,66 s
    const floatSpan = 4.9 - (t + 0.5);
    if (floatSpan > 0.8) tl.to(p, { y: "-=7", duration: floatSpan / 2, ease: "sine.inOut", yoyo: true, repeat: 1 }, t + 0.5);
  });
  // sortie : tout converge vers le centre et se fond (4,9 → 5,6) — overwrite tue les flottements encore actifs
  tl.to(papers, {
    x: (i, el) => 960 - el.offsetLeft - el.offsetWidth / 2,
    y: (i, el) => 540 - el.offsetTop - el.offsetHeight / 2,
    scale: 0.22, opacity: 0, duration: 0.7, ease: "power3.in", stagger: 0.012, overwrite: "auto",
  }, 4.9);
  tl.to(["#s1-l1", "#s1-l2"], { opacity: 0, y: -18, duration: 0.45, ease: "power2.in" }, 4.95);
  tl.set("#s1", { visibility: "hidden" }, 5.65);
  // remet x/y/scale pour le cycle suivant (le set d'ouverture ne couvre pas x)
  tl.set(papers, { x: 0 }, 5.66);
  return tl;
}

// ---------- master ----------
const tl = gsap.timeline({ repeat: -1 });
tl.add(scene1(), 0);
// scene2..5 ajoutées dans les tasks suivantes
window.SEREN_MOTION = { tl, applyLang }; // API debug/vérification

// ---------- mode debug : ?scene=s3 fige une scène (contrôle des styles/composition) ----------
const debugScene = new URLSearchParams(location.search).get("scene");
if (debugScene && document.getElementById(debugScene)) {
  tl.pause(0);
  // annule les resets GSAP posés à t=0 par la master, puis montre la scène
  gsap.set("#" + debugScene + ", #" + debugScene + " *", { clearProps: "all" });
  document.getElementById(debugScene).style.visibility = "visible";
  // états « milieu de scène » utiles au contrôle visuel
  if (debugScene === "s1") $$("#s1 .paper").forEach((p, i) => { p.style.transform = `rotate(${ROTATIONS[i]}deg)`; });
  if (debugScene === "s2") $(".opt.sel").style.setProperty("--sel", "1");
  if (debugScene === "s5") $("#s5-bg").style.transform = "scale(1)";
}
