// Profil partagé d'un joueur : joueur.html?u=pseudo.
// Visible selon le choix du joueur : « Public » (tout le monde, même sans compte) ou « Amis ».
// On n'y montre que le profil et les binders : jamais la collection, le scellé, les chase cards ni les pièces.

import { getProfilPartage } from "../donnees.js";
import { BADGES } from "../recompenses.js";
import { couverture } from "../couvertures.js";
import { banniere, cadre, avecCadre } from "../objets-profil.js";
import { imageCarte } from "../tcgdex.js";
import { echapper, formaterNombre, initiales } from "../outils.js";

const zone = document.getElementById("zone-joueur");
const pseudo = new URLSearchParams(location.search).get("u") ?? "";
const moisAnnee = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const pluriel = (nombre, mot) => `${formaterNombre(nombre)} ${nombre > 1 ? `${mot}s` : mot}`;

const imageDeCarte = (carte) => {
  const image = imageCarte(carte.image, "low");
  return image
    ? `<img class="mini-carte grande" src="${echapper(image)}" alt="${echapper(carte.nom)}" loading="lazy">`
    : `<span class="mini-carte grande sans-image">${echapper(carte.nom)}</span>`;
};

function introuvable() {
  document.title = "Profil introuvable · Pokibind";
  zone.removeAttribute("aria-busy");
  zone.innerHTML = `<div class="tete-page">
      <h1>Profil introuvable</h1>
      <p>Ce profil n'existe pas, ou son propriétaire ne le partage pas avec toi. S'il est réservé à ses amis, connecte-toi et demande-le en ami depuis ton profil.</p>
    </div>
    <a class="bouton" href="index.html">Retour à l'accueil</a>`;
}

function afficher({ profil, binders, moi }) {
  const badge = BADGES.find((b) => b.cle === profil.badge);
  document.title = `${profil.nom} (@${profil.pseudo}) · Pokibind`;
  zone.removeAttribute("aria-busy");
  zone.innerHTML = `<div class="profil">
    <section class="profil-principal" aria-labelledby="nom-profil">
      <div class="banniere" style="background: ${banniere(profil.banniere).fond}"></div>
      <div class="profil-haut">
        ${avecCadre(cadre(profil.cadre), echapper(initiales(profil.nom) || "?"), "avatar-profil", ' aria-hidden="true"')}
        ${moi ? '<div class="boutons profil-actions"><a class="bouton bouton-secondaire bouton-petit" href="profil.html">Mon profil</a></div>' : ""}
      </div>
      <div class="profil-infos">
        <h1 class="profil-nom" id="nom-profil">${echapper(profil.nom)}${badge ? `<span class="badge-en-avant" title="${echapper(badge.nom)}"><img class="image-badge" src="img/badges/${badge.image}.webp" alt="" width="34" height="34"><span class="sr-only">, badge ${echapper(badge.nom)}</span></span>` : ""}</h1>
        <p class="profil-pseudo">@${echapper(profil.pseudo)}</p>
        ${profil.bio ? `<p class="profil-bio">${echapper(profil.bio)}</p>` : ""}
        <p class="profil-meta"><span>Membre depuis ${moisAnnee.format(new Date(profil.creeLe))}</span><span>${pluriel(binders.length, "binder")}</span></p>
      </div>
      <h2 class="titre-joueur">Binders</h2>
      ${binders.length ? binders.map((binder) => {
        const choix = couverture(binder.couverture);
        const visuel = choix.type === "illustre"
          ? `<img class="activite-couverture" src="${choix.image}-couverture.webp" alt="" loading="lazy">`
          : `<span class="activite-couverture" style="--teinte: var(--${choix.couleur})"></span>`;
        const cartes = binder.cartes.filter(Boolean);
        return `<section class="binder-partage" aria-label="${echapper(binder.nom)}">
          <div class="binder-partage-tete">${visuel}<span><b>${echapper(binder.nom)}</b><small>${pluriel(cartes.length, "carte")}</small></span></div>
          ${cartes.length ? `<div class="cartes-partagees">${cartes.map(imageDeCarte).join("")}</div>` : ""}
        </section>`;
      }).join("") : '<p class="aide-resultats onglet-vide">Aucun binder pour l\'instant.</p>'}
    </section>
    <aside class="profil-cote">
      <section class="panneau" aria-labelledby="titre-favorites">
        <h2 id="titre-favorites">Cartes favorites</h2>
        ${profil.favorites?.length ? `<div class="favorites">${profil.favorites.map(imageDeCarte).join("")}</div>` : '<p class="aide-resultats">Pas encore de carte favorite.</p>'}
      </section>
    </aside>
  </div>`;
}

try {
  const partage = /^[a-zA-Z0-9._-]{2,20}$/.test(pseudo) ? await getProfilPartage(pseudo) : null;
  if (partage) afficher(partage);
  else introuvable();
} catch (erreur) {
  introuvable();
}
