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

// S1 (0 → ~5,76 s) : cascade accélérée de 14 papiers, captions, puis convergence vers le centre
function scene1() {
  const tl = gsap.timeline();
  const papers = $$("#s1 .paper");
  // reset (rejoué à chaque cycle → premier frame toujours identique)
  tl.set("#s1", { visibility: "visible" }, 0);
  tl.set(papers, { opacity: 0, scale: 0.94, x: 0, y: 22, rotation: i => ROTATIONS[i] }, 0);
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
    // (départ de la convergence) ; la scène se termine à ~5,76 s (queue du stagger de convergence)
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
  tl.set("#s1", { visibility: "hidden" }, 5.76);
  return tl;
}

// S2 (posée à 5,2 s ; visible 5,5 → 11) : la carte accueille les papiers convergés, une réponse se choisit
function scene2() {
  const tl = gsap.timeline();
  tl.set("#s2", { visibility: "visible" }, 0);
  tl.set("#s2-cap", { opacity: 0, y: 20 }, 0);
  tl.set("#s2-card", { opacity: 0, y: 46, scale: 0.96 }, 0);
  tl.set(".opt.sel", { background: "#fff", borderColor: "#D9DBE0", "--sel": 0 }, 0);

  // entrée dans la continuité de la convergence des papiers (ils « deviennent » la carte)
  tl.to("#s2-card", { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out" }, 0.45);
  tl.to("#s2-cap", { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.75);
  // sélection de la 1re réponse à ~8,5 s master (3,3 s locale)
  tl.to(".opt.sel", { background: "#EAF3FE", borderColor: "#006BFA", duration: 0.4, ease: "power1.inOut" }, 3.3);
  tl.to(".opt.sel", { "--sel": 1, duration: 0.35, ease: "back.out(2)" }, 3.45);
  // sortie 10,4 → 11 (master) = 5,2 → 5,8 locale
  tl.to(["#s2-cap", "#s2-card"], { opacity: 0, y: -26, duration: 0.55, ease: "power2.in", stagger: 0.06 }, 5.2);
  tl.set("#s2", { visibility: "hidden" }, 5.85);
  return tl;
}

// S3 (posée à 10,7 s ; visible 11 → 17,5) : la carte s'étire en roadmap, la progression avance
function scene3() {
  const tl = gsap.timeline();
  tl.set("#s3", { visibility: "visible" }, 0);
  tl.set("#s3-cap", { opacity: 0, y: 20 }, 0);
  tl.set("#s3-card", { opacity: 0, y: 40, scaleY: 0.9, transformOrigin: "50% 30%" }, 0);
  tl.set("#s3-bar", { width: "25%" }, 0);
  tl.set("#s3-dot2", { background: "#ffffff", borderColor: "#D9DBE0" }, 0);
  tl.set("#s3-tag2", { opacity: 0, scale: 0.8 }, 0);

  // la carte « s'étire » (continuité avec la carte S2 qui vient de sortir au même endroit)
  tl.to("#s3-card", { opacity: 1, y: 0, scaleY: 1, duration: 0.85, ease: "power3.out" }, 0.35);
  tl.to("#s3-cap", { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.65);
  // progression 25 % → ~31 % (douce, cohérente avec « 2 sur 8 complétées » : l'étape passe « en cours », pas « complétée »)
  // et passage « En cours » à ~13,5 s master (2,8 s locale)
  tl.to("#s3-bar", { width: "31%", duration: 1.3, ease: "power2.inOut" }, 2.5);
  tl.to("#s3-dot2", { background: "#6B5CE7", borderColor: "#6B5CE7", duration: 0.4 }, 2.8);
  tl.to("#s3-tag2", { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.8)" }, 2.95);
  // sortie 16,9 → 17,5 master = 6,2 → 6,8 locale
  tl.to(["#s3-cap", "#s3-card"], { opacity: 0, y: -26, duration: 0.55, ease: "power2.in", stagger: 0.06 }, 6.2);
  tl.set("#s3", { visibility: "hidden" }, 6.85);
  return tl;
}

// ---------- master ----------
const tl = gsap.timeline({ repeat: -1 });
tl.add(scene1(), 0);
tl.add(scene2(), 5.2);
tl.add(scene3(), 10.7);
// scene4..5 ajoutées dans les tasks suivantes
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
