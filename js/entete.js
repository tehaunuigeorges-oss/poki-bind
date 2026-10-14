// En-tête, navigation et pied de page communs à toutes les pages.
// Chaque page indique où elle se trouve :
//   <body data-page="collection" data-espace="membre">   (ou data-espace="visiteur")

import { brancherBoutonTheme } from "./theme.js";
import { getProfil, getPieces } from "./donnees.js";
import { echapper, formaterNombre, initiales } from "./outils.js";

const icone = (dessin, classe = "") =>
  `<svg${classe ? ` class="${classe}"` : ""} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${dessin}</svg>`;

const ICONES = {
  collection: icone('<rect x="8" y="3" width="12" height="16" rx="2"/><path d="M5 6.5V19a2 2 0 0 0 2 2h9"/>'),
  binders: icone('<rect x="6" y="3" width="14" height="18" rx="2"/><path d="M10 3v18M3.5 7.5H7M3.5 12H7M3.5 16.5H7"/>'),
  chase: icone('<path d="M12 3.6l2.6 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.2 2.7 1-5.7-4.1-4 5.7-.8z"/>'),
  statistiques: icone('<path d="M4 20h16M7 16v-4M12 16V6M17 16V9.5"/>'),
  boutique: icone('<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'),
  loupe: icone('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 4.5 4.5"/>'),
  profil: icone('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
  lune: icone('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', "icone-lune"),
  soleil: icone('<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>', "icone-soleil"),
};

// Liens de la navigation principale. « pages » : pages où le lien est surligné.
const LIENS = [
  { href: "collection.html", texte: "Collection", icone: ICONES.collection, pages: ["collection", "scelle", "set", "carte"] },
  { href: "binders.html", texte: "Binders", icone: ICONES.binders, pages: ["binders"] },
  { href: "chase-cards.html", texte: "Chase cards", icone: ICONES.chase, pages: ["chase-cards"] },
  { href: "statistiques.html", texte: "Statistiques", icone: ICONES.statistiques, pages: ["statistiques"] },
  { href: "boutique.html", texte: "Boutique", icone: ICONES.boutique, pages: ["boutique"] },
];

const { page, espace } = document.body.dataset;

const courant = (actif) => (actif ? ' aria-current="page"' : "");

const boutonTheme = `<button class="bouton-icone" type="button" id="bouton-theme">${ICONES.lune}${ICONES.soleil}</button>`;

const logo = (href, texte) =>
  `<a class="marque" href="${href}"><img class="logo" src="img/logos/logo-horizontal.png" alt="${texte}" width="600" height="166"></a>`;

function enteteVisiteur() {
  const marque = page === "accueil" ? "" : logo("index.html", "Pokibind, retour à l'accueil");
  const connexion = page === "a-propos" ? '<a class="bouton bouton-petit" href="connexion.html">Se connecter</a>' : "";
  return `<div class="wrap entete-barre">${marque}<div class="entete-actions">${connexion}${boutonTheme}</div></div>`;
}

function enteteMembre(profil, pieces) {
  const liens = LIENS.map(
    (lien) => `<li><a href="${lien.href}"${courant(lien.pages.includes(page))}>${lien.icone}<span>${lien.texte}</span></a></li>`
  ).join("");
  const nombre = formaterNombre(pieces);
  const lettres = initiales(profil?.nom);

  return `<div class="wrap entete-barre">
      ${logo("collection.html", "Pokibind, ma collection")}
      <nav class="nav-principale" aria-label="Navigation principale"><ul>${liens}</ul></nav>
      <div class="entete-actions">
        ${boutonTheme}
        <a class="bouton-icone" href="recherche.html" aria-label="Rechercher une carte"${courant(page === "recherche")}>${ICONES.loupe}</a>
        <a class="pieces num" href="boutique.html" aria-label="${nombre} ${pieces > 1 ? "pièces" : "pièce"}, voir la boutique"><img src="img/badges/piece.webp" alt="" width="20" height="20"><span>${nombre}</span></a>
        <a class="avatar" href="profil.html" aria-label="Mon profil"${courant(page === "profil")}>${lettres ? echapper(lettres) : ICONES.profil}</a>
      </div>
    </div>`;
}

const piedDePage = `<div class="wrap pied-contenu">
    <p>Pokibind est un site de fans, non officiel, non affilié à Nintendo, Creatures, GAME FREAK ou The Pokémon Company.</p>
  </div>`;

async function afficher() {
  const entete = document.getElementById("entete");
  if (espace === "membre") {
    const [profil, pieces] = await Promise.all([getProfil(), getPieces()]);
    entete.innerHTML = enteteMembre(profil, pieces);
  } else {
    entete.innerHTML = enteteVisiteur();
  }
  document.getElementById("pied").innerHTML = piedDePage;
  brancherBoutonTheme(document.getElementById("bouton-theme"));
}

afficher();
