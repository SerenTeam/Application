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
