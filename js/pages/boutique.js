// Boutique : débloquer des bannières, des cadres et des couvertures de binders avec ses pièces.
// Un objet débloqué reste acquis ; il se choisit ensuite dans le profil ou dans les réglages d'un binder.

import { getPieces, getObjetsDebloques, getCouverturesDebloquees, acheterObjet } from "../donnees.js";
import { BADGES, GAINS, verifierRecompenses } from "../recompenses.js";
import { COUVERTURES } from "../couvertures.js";
import { BANNIERES, CADRES, estGratuit, avecCadre } from "../objets-profil.js";
import { echapper, formaterNombre, annoncer } from "../outils.js";

const fenetre = document.getElementById("fenetre-achat");
const pluriel = (nombre, mot) => `${formaterNombre(nombre)} ${mot}${Math.abs(nombre) > 1 ? "s" : ""}`;
const piecesBadge = (cle) => BADGES.find((badge) => badge.cle === cle)?.pieces ?? 0;
const PIECE = (taille) => `<img src="img/badges/piece.webp" alt="" width="${taille}" height="${taille}">`;

let pieces = 0;
let objetsDebloques = [];
let couverturesDebloquees = [];
let enCours = null; // objet en cours d'achat

// Tous les objets à vendre, avec leur rayon et leur aperçu
const RAYONS = {
  bannieres: BANNIERES.filter((b) => !estGratuit(b)).map((b) => ({ ...b, categorie: "objets", rayon: "bannieres",
    apercu: () => `<span class="objet-banniere" style="background: ${b.fond}"></span>` })),
  cadres: CADRES.filter((c) => !estGratuit(c)).map((c) => ({ ...c, categorie: "objets", rayon: "cadres",
    apercu: () => avecCadre(c, '<span class="objet-cadre-centre">Avatar</span>', "objet-cadre") })),
  couvertures: COUVERTURES.filter((c) => c.type === "illustre").map((c) => ({ ...c, categorie: "couvertures", rayon: "couvertures",
    apercu: () => `<span class="couverture illustree"><img src="${c.image}-couverture.webp" alt="" loading="lazy"></span>` })),
};
const tous = () => Object.values(RAYONS).flat();
const estAchete = (objet) => (objet.categorie === "objets" ? objetsDebloques : couverturesDebloquees).includes(objet.id);

function tuile(objet) {
  const achete = estAchete(objet);
  const manque = objet.prix - pieces;
  const action = achete
    ? '<span class="pilule bonne">Débloqué</span>'
    : `<button class="bouton bouton-petit${manque > 0 ? " bouton-secondaire" : ""}" type="button" data-acheter="${echapper(objet.id)}"${manque > 0 ? ' aria-disabled="true"' : ""}
        aria-label="Débloquer ${echapper(objet.nom)} pour ${objet.prix} pièces">Débloquer</button>`;
  return `<li class="objet${objet.rayon === "cadres" ? " objet-rond" : ""}${achete ? " achete" : ""}">
      ${objet.apercu()}
      <span class="binder-nom">${echapper(objet.nom)}</span>
      <span class="binder-infos avec-illustration num">${PIECE(14)}${formaterNombre(objet.prix)} pièces</span>
      ${!achete && manque > 0 ? `<span class="objet-manque num">Il te manque ${pluriel(manque, "pièce")}</span>` : ""}
      ${action}
    </li>`;
}

function afficher() {
  document.getElementById("solde").textContent = pluriel(pieces, "pièce");
  // Le compteur de l'en-tête suit le solde
  const compteur = document.querySelector(".entete .pieces");
  if (compteur) {
    compteur.querySelector("span").textContent = formaterNombre(pieces);
    compteur.setAttribute("aria-label", `${pluriel(pieces, "pièce")}, voir la boutique`);
  }
  document.getElementById("liste-bannieres").innerHTML = RAYONS.bannieres.map(tuile).join("");
  document.getElementById("liste-cadres").innerHTML = RAYONS.cadres.map(tuile).join("");
  document.getElementById("liste-couvertures").innerHTML = RAYONS.couvertures.map(tuile).join("");
}

// ---------- Rayons ----------

document.getElementById("rayons").addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("button[data-rayon]");
  if (!bouton) return;
  for (const b of document.querySelectorAll("#rayons button")) b.setAttribute("aria-pressed", String(b === bouton));
  for (const rayon of document.querySelectorAll(".rayon")) rayon.hidden = Boolean(bouton.dataset.rayon) && rayon.id !== `rayon-${bouton.dataset.rayon}`;
});

// ---------- Achat ----------

document.getElementById("contenu").addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("[data-acheter]");
  if (!bouton) return;
  const objet = tous().find((o) => o.id === bouton.dataset.acheter);
  if (bouton.getAttribute("aria-disabled") === "true") {
    annoncer(`Il te manque ${pluriel(objet.prix - pieces, "pièce")} pour débloquer ${objet.nom}.`);
    return;
  }
  enCours = objet;
  document.getElementById("titre-achat").textContent = `Débloquer « ${objet.nom} » ?`;
  document.getElementById("achat-apercu").innerHTML = objet.apercu();
  document.getElementById("achat-texte").textContent = `Prix : ${pluriel(objet.prix, "pièce")}. Il te restera ${pluriel(pieces - objet.prix, "pièce")}.`;
  fenetre.showModal();
  document.getElementById("confirmer-achat").focus();
});

fenetre.addEventListener("close", async () => {
  const objet = enCours;
  enCours = null;
  if (!objet || fenetre.returnValue !== "oui") return;
  let resultat;
  try {
    resultat = await acheterObjet({ categorie: objet.categorie, id: objet.id, nom: objet.nom, prix: objet.prix });
  } catch (erreur) {
    annoncer("Impossible d'enregistrer : le stockage de ton navigateur est bloqué ou plein.");
    return;
  }
  pieces = resultat.pieces;
  if (resultat.ok) {
    (objet.categorie === "objets" ? objetsDebloques : couverturesDebloquees).push(objet.id);
    const ou = objet.categorie === "objets" ? "« Modifier le profil »" : "les réglages de tes binders";
    annoncer(`${objet.nom} est débloqué : choisis-le dans ${ou}.`);
  } else {
    annoncer(resultat.raison === "deja" ? `${objet.nom} est déjà débloqué.` : `Il te manque des pièces pour débloquer ${objet.nom}.`);
  }
  afficher();
  document.getElementById("titre-boutique").setAttribute("tabindex", "-1");
  document.getElementById("titre-boutique").focus({ preventScroll: true });
});

// ---------- Comment gagner des pièces ----------

document.getElementById("gains").innerHTML = [
  ["Bienvenue", `+${GAINS.bienvenue} pièces offertes à ta première connexion`],
  ["Connexion quotidienne", `+${GAINS.connexion} pièces par jour, plus ${piecesBadge("connexion-7")} pièces au bout de 7 jours d'affilée et ${piecesBadge("connexion-30")} au bout de 30 jours`],
  ["Ajout de cartes", `+${piecesBadge("cartes-10")} pièces à 10, 50, 100 et 500 cartes, +${piecesBadge("cartes-1000")} à 1 000`],
  ["Set complété", `+${GAINS.setComplete} pièces pour chaque set terminé, +${piecesBadge("sets-5")} au 5ᵉ`],
  ["Binders et chase cards", `+${piecesBadge("premier-binder")} pièces pour ton premier binder et ta première chase card`],
].map(([titre, texte]) => `<li class="panneau"><h3>${titre}</h3><p>${texte}</p></li>`).join("");

// ---------- Chargement ----------

await verifierRecompenses().catch(() => null);
[pieces, objetsDebloques, couverturesDebloquees] = await Promise.all([getPieces(), getObjetsDebloques(), getCouverturesDebloquees()]);
afficher();
