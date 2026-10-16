// Visuel d'une carte : son image TCGdex, ou une carte de remplacement (nom, « Image indisponible »,
// numéro) quand l'image n'existe pas ou ne se charge pas. Pendant le chargement, le cadre clignote doucement.

import { echapper } from "./outils.js";
import { imageCarte, illustrationTcgdex } from "./tcgdex.js";

// Petite illustration d'un set ou d'une série, posée à côté de son nom (le nom suffit à la décrire :
// texte alternatif vide). genre : "logo" (large) ou "symbole" (carré). Sans image, rien n'est
// affiché ; si l'image ne se charge pas, elle disparaît et il reste le texte.
export function illustration(base, genre = "logo") {
  const adresse = illustrationTcgdex(base);
  return adresse ? `<img class="illustration illustration-${genre}" src="${echapper(adresse)}" alt="" loading="lazy" decoding="async">` : "";
}

const TAILLES = { low: [245, 337], high: [600, 825] };

// carte : { nom, numero, image, imageSecours } ; imageSecours : image anglaise, utilisée seulement
// quand il n'y a pas d'image française (une pastille « EN » le signale).
// Options : taille "low" ou "high", texte alternatif, prioritaire (image visible dès l'ouverture
// de la page), teinte (couleur de la carte de remplacement).
export function visuelCarte(carte, { taille = "low", alt = "", prioritaire = false, teinte = "" } = {}) {
  const enAnglais = !carte.image && Boolean(carte.imageSecours);
  const adresse = imageCarte(carte.image || carte.imageSecours, taille);
  const style = teinte ? ` style="--teinte: var(--${echapper(teinte)})"` : "";
  const remplacement = `<span class="carte-remplacement" aria-hidden="true">
      <span>${echapper(carte.nom)}</span>
      <span class="carte-sans-image">Image indisponible</span>
      <span class="num">${echapper(carte.numero)}</span>
    </span>`;
  if (!adresse) {
    return `<span class="visuel-carte sans-image"${style}${alt ? ` role="img" aria-label="${echapper(alt)}"` : ""}>${remplacement}</span>`;
  }
  const [largeur, hauteur] = TAILLES[taille];
  const chargement = prioritaire ? 'fetchpriority="high"' : 'loading="lazy"';
  const pastille = enAnglais
    ? '<span class="langue-image" aria-hidden="true" title="Image en anglais : TCGdex n\'a pas l\'image française">EN</span>'
    : "";
  return `<span class="visuel-carte"${style}>${remplacement}<img src="${echapper(adresse)}" alt="${echapper(alt)}" width="${largeur}" height="${hauteur}" ${chargement} decoding="async">${pastille}</span>`;
}

// Les événements load et error des images ne remontent pas : on les écoute en phase de capture.
document.addEventListener("load", (evenement) => {
  if (evenement.target.matches?.(".visuel-carte img")) evenement.target.parentElement.classList.add("chargee");
}, true);
document.addEventListener("error", (evenement) => {
  const image = evenement.target;
  if (image.matches?.("img.illustration")) {
    image.remove();
    return;
  }
  if (!image.matches?.(".visuel-carte img")) return;
  const visuel = image.parentElement;
  visuel.classList.add("sans-image");
  if (image.alt) {
    visuel.setAttribute("role", "img");
    visuel.setAttribute("aria-label", image.alt);
  }
}, true);
