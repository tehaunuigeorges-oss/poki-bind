// Petites fonctions partagées par toutes les pages.

// Rend un texte saisi par l'utilisateur sans danger avant de l'insérer dans du HTML
// (un pseudo comme « <script> » s'affichera tel quel au lieu d'être exécuté).
export function echapper(texte) {
  const entites = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(texte ?? "").replace(/[&<>"']/g, (caractere) => entites[caractere]);
}

const nombres = new Intl.NumberFormat("fr-FR");

// 1240 → « 1 240 »
export function formaterNombre(nombre) {
  return nombres.format(nombre);
}

// « Tehaunui Georges » → « TG »
export function initiales(nom) {
  return String(nom ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => Array.from(mot)[0].toUpperCase())
    .join("");
}

// Texte comparable, sans accents, majuscules ni ponctuation :
// « Évoli-ex » → « evoli ex », « Nidoran♀ » → « nidoran f », « Électrique » → « electrique »
export function normaliser(texte) {
  return String(texte ?? "")
    .replace(/[œŒ]/g, "oe")
    .replace(/[æÆ]/g, "ae")
    .replace(/♀/g, " f")
    .replace(/♂/g, " m")
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // accents séparés de leur lettre par NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

// 0.8 → « 0,80 € »
export function formaterPrix(montant) {
  return euros.format(montant);
}

const moisEtAnnee = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

// « 2025-01-17 » → « janvier 2025 » (une date sans heure est lue comme une date locale)
export function formaterMois(date) {
  const jour = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
  const valeur = jour ? new Date(jour[1], jour[2] - 1, jour[3]) : new Date(date);
  return Number.isNaN(valeur.getTime()) ? "" : moisEtAnnee.format(valeur);
}

let minuterieAnnonce = 0;

// Petit message en bas de l'écran (« Évoli est maintenant dans ta collection »), lu aussi par les
// lecteurs d'écran. La page doit contenir <p class="annonce" id="annonce" role="status"></p>.
export function annoncer(texte) {
  const zone = document.getElementById("annonce");
  zone.textContent = texte;
  clearTimeout(minuterieAnnonce);
  minuterieAnnonce = setTimeout(() => { zone.textContent = ""; }, 5000);
}
