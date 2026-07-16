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

// ---------- mode debug : ?scene=s3 affiche une scène statique (aucune animation) ----------
const debugScene = new URLSearchParams(location.search).get("scene");
if (debugScene && document.getElementById(debugScene)) {
  document.getElementById(debugScene).style.visibility = "visible";
  // état "milieu de scène" pour contrôler les styles
  if (debugScene === "s1") document.querySelectorAll("#s1 .paper").forEach((p, i) => { p.style.transform = `rotate(${[-11,9,7,-14,5,-7,15,-5,3,-8,6,12,4,-18][i]}deg)`; });
  if (debugScene === "s2") document.querySelector(".opt.sel").style.setProperty("--sel", "1");
  if (debugScene === "s5") document.getElementById("s5-bg").style.transform = "scale(1)";
}
