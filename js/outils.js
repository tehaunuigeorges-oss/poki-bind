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
