// Mes binders : deux rayons de couvertures (binders libres, binders de set) ; un clic ouvre le binder
// en double page de 3 × 3 pochettes (une seule page sur téléphone).
// Binder libre : les cartes placées depuis leur fiche, dans l'ordre. Binder de set : tout le set par
// numéro, en couleur les cartes possédées, en gris les autres.

import { getBinders, creerBinder, modifierBinder, supprimerBinder, retirerDuBinder, choisirCouvertureDeSet,
  getCouverturesDebloquees, getCollection } from "../donnees.js";
import { getIndex, getSet, imageDeSecours, numeroLisible, estOfficielle } from "../tcgdex.js";
import { COUVERTURES, couverture, estDebloquee, couleurParDefaut } from "../couvertures.js";
import { visuelCarte, illustration } from "../visuel-carte.js";
import { echapper, formaterNombre, annoncer } from "../outils.js";

const PAR_PAGE = 9;
const etagereLibres = document.getElementById("etagere-libres");
const etagereSets = document.getElementById("etagere-sets");
const panneau = document.getElementById("binder-ouvert");
const fenetre = document.getElementById("fenetre-binder");
const formulaire = document.getElementById("formulaire-binder");
const champNom = document.getElementById("nom-binder");
const erreurNom = document.getElementById("erreur-nom");
const doublePage = matchMedia("(min-width: 760px)");

let libres = [];
let reglagesSets = {};
let sets = [];             // sets de la collection : { id, nom, logo, officiel, possedees }
let collection = [];
let debloquees = [];
let ouvert = null;         // { genre: "libre" | "set", id, cartes, nom, couverture, logo }
let premierePage = 0;
let enEdition = null;      // binder en cours de modification dans la fenêtre (null : création)

const pluriel = (nombre, mot) => `${formaterNombre(nombre)} ${mot}${nombre > 1 ? "s" : ""}`;

// ---------- Couvertures ----------

function couvertureHtml(idCouverture, logoSet = null) {
  const choix = couverture(idCouverture);
  if (choix.type === "illustre") {
    return `<span class="couverture illustree"><img src="${choix.image}-couverture.webp" alt="" loading="lazy" decoding="async"></span>`;
  }
  return `<span class="couverture" style="--teinte: var(--${choix.couleur})">
      ${logoSet ? `<span class="couverture-set">${illustration(logoSet)}</span>` : ""}
      <img class="couverture-pokibind" src="img/logos/logo-icone.png" alt="" width="204" height="256">
    </span>`;
}

const cleBinder = (genre, id) => `${genre}:${id}`;

function boutonCouverture({ genre, id, nom, couverture: idCouverture, logo, infos }) {
  const actif = ouvert && ouvert.genre === genre && ouvert.id === id;
  return `<li>
      <button class="binder-couverture" type="button" data-binder="${echapper(cleBinder(genre, id))}" aria-expanded="${actif}" aria-controls="binder-ouvert">
        ${couvertureHtml(idCouverture, logo)}
        <span class="binder-nom">${echapper(nom)}</span>
        <span class="binder-infos num">${echapper(infos)}</span>
      </button>
    </li>`;
}

function afficherEtageres() {
  etagereLibres.innerHTML = libres.map((binder) => boutonCouverture({
    genre: "libre", id: binder.id, nom: binder.nom, couverture: binder.couverture, infos: pluriel(binder.cartes.length, "carte"),
  })).join("") + `<li><button class="binder-nouveau" type="button" data-action="nouveau"><span aria-hidden="true">+</span> Nouveau binder</button></li>`;

  etagereSets.innerHTML = sets.map((set) => boutonCouverture({
    genre: "set", id: set.id, nom: set.nom, couverture: reglagesSets[set.id]?.couverture ?? couleurParDefaut(set.id), logo: set.logo,
    infos: set.officiel ? `${formaterNombre(set.possedees)} / ${pluriel(set.officiel, "carte")}` : pluriel(set.possedees, "carte"),
  })).join("");
  etagereSets.removeAttribute("aria-busy");
  document.getElementById("aucun-set").hidden = sets.length > 0;
}

// ---------- Binder ouvert ----------

const pagesVisibles = () => (doublePage.matches ? 2 : 1);
const nombrePages = () => Math.max(2, Math.ceil(ouvert.cartes.length / PAR_PAGE));

function pochette(carte, position) {
  if (!carte) return `<li class="pochette vide"></li>`;
  const manquante = ouvert.genre === "set" && !carte.possedee;
  const retirer = ouvert.genre === "libre"
    ? `<button class="retirer-carte" type="button" data-position="${position}" aria-label="Retirer ${echapper(carte.nom)} du binder">×</button>`
    : "";
  return `<li class="pochette${manquante ? " manquante" : ""}">
      <a href="carte.html?id=${encodeURIComponent(carte.id)}" class="pochette-lien">
        ${visuelCarte(carte)}
        <span class="sr-only">${echapper(`${carte.nom}, ${carte.numero}${manquante ? ", manquante" : ""}`)}</span>
      </a>
      ${retirer}
    </li>`;
}

function page(numero, cote) {
  const debut = numero * PAR_PAGE;
  const cases = Array.from({ length: PAR_PAGE }, (_, i) => pochette(ouvert.cartes[debut + i], debut + i)).join("");
  return `<div class="page-binder ${cote}"><ol class="pochettes" start="${debut + 1}" aria-label="Page ${numero + 1}">${cases}</ol></div>`;
}

function afficherBinder() {
  const choix = couverture(ouvert.couverture);
  const total = nombrePages();
  premierePage = Math.min(premierePage, total - 1);
  if (pagesVisibles() === 2) premierePage -= premierePage % 2;
  const derniere = Math.min(premierePage + pagesVisibles(), total);
  const textePages = derniere - premierePage > 1 ? `Pages ${premierePage + 1}–${derniere} sur ${total}` : `Page ${premierePage + 1} sur ${total}`;
  const placees = ouvert.genre === "set"
    ? `${formaterNombre(ouvert.cartes.filter((c) => c.possedee).length)} sur ${pluriel(ouvert.cartes.length, "carte")}`
    : `${formaterNombre(ouvert.cartes.length)} ${ouvert.cartes.length > 1 ? "cartes placées" : "carte placée"}`;
  const fond = choix.type === "illustre"
    ? `style="--fond: url('${choix.image}-interieur.webp')"`
    : `style="--teinte: var(--${choix.couleur})"`;

  panneau.innerHTML = `
    <div class="binder-tete">
      <div class="tete-page">
        <h2 id="titre-binder">${echapper(ouvert.nom)}</h2>
        <p class="num" id="pages-binder" aria-live="polite">${textePages} · ${placees}</p>
      </div>
      <div class="binder-commandes">
        <button class="bouton bouton-secondaire bouton-petit" type="button" data-action="modifier">Modifier</button>
        <button class="bouton-icone" type="button" data-action="precedente" aria-label="Pages précédentes"${premierePage === 0 ? " disabled" : ""}>‹</button>
        <button class="bouton-icone" type="button" data-action="suivante" aria-label="Pages suivantes"${derniere >= total ? " disabled" : ""}>›</button>
      </div>
    </div>
    <div class="double-page${choix.type === "illustre" ? " illustree" : ""}" ${fond}>
      ${page(premierePage, "gauche")}
      ${pagesVisibles() === 2 ? `<div class="anneaux" aria-hidden="true"><i></i><i></i><i></i></div>${page(premierePage + 1, "droite")}` : ""}
    </div>
    <p class="note-page">${ouvert.genre === "set"
      ? `Les cartes en gris te manquent encore. <a href="set.html?id=${encodeURIComponent(ouvert.id)}">Voir la page du set</a>`
      : `Pour ajouter une carte, ouvre sa fiche et choisis « Placer dans un binder ». <a href="recherche.html">Chercher une carte</a>`}</p>`;
}

function memoriserDansAdresse() {
  const reglages = new URLSearchParams();
  if (ouvert) {
    reglages.set("binder", cleBinder(ouvert.genre, ouvert.id));
    if (premierePage) reglages.set("page", String(premierePage + 1));
  }
  const texte = reglages.toString();
  history.replaceState(null, "", texte ? `?${texte}` : location.pathname);
}

async function ouvrir(cle, { page: numeroPage = 0, defiler = true } = {}) {
  const [genre, ...reste] = cle.split(":");
  const id = reste.join(":");
  if (genre === "libre") {
    const binder = libres.find((b) => b.id === id);
    if (!binder) return;
    ouvert = { genre, id, nom: binder.nom, couverture: binder.couverture, cartes: binder.cartes };
  } else if (genre === "set") {
    const infos = sets.find((s) => s.id === id);
    if (!infos) return;
    ouvert = { genre, id, nom: infos.nom, couverture: reglagesSets[id]?.couverture ?? couleurParDefaut(id), cartes: [] };
    panneau.hidden = false;
    panneau.innerHTML = '<span class="squelette courte"></span><span class="squelette titre"></span>';
    try {
      const set = await getSet(id);
      const possedees = new Set(collection.filter((entree) => entree.set?.id === id).map((entree) => entree.id));
      ouvert.cartes = (set.cards ?? []).map((carte) => {
        const numero = numeroLisible(carte.localId);
        return {
          id: carte.id, nom: carte.name, numero, image: carte.image ?? null,
          imageSecours: carte.image ? null : imageDeSecours(set.serie?.id, set.id, numero),
          possedee: possedees.has(carte.id),
        };
      }).sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }));
    } catch (erreur) {
      panneau.innerHTML = `<div class="encart encart-erreur" role="alert"><p>Impossible de charger les cartes de ce set : la base de cartes TCGdex ne répond pas. Réessaie dans un instant.</p></div>`;
      return;
    }
  } else {
    return;
  }
  premierePage = numeroPage;
  // Le binder s'ouvre juste sous son rayon
  document.getElementById(genre === "libre" ? "rayon-libres" : "rayon-sets").after(panneau);
  panneau.hidden = false;
  afficherEtageres();
  afficherBinder();
  memoriserDansAdresse();
  if (defiler) panneau.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

function changerDePage(sens) {
  premierePage = Math.max(0, premierePage + sens * pagesVisibles());
  afficherBinder();
  memoriserDansAdresse();
  // Garde le focus sur le bouton utilisé (ou l'autre s'il est désormais désactivé)
  const bouton = panneau.querySelector(`[data-action="${sens > 0 ? "suivante" : "precedente"}"]`);
  (bouton.disabled ? panneau.querySelector(`[data-action="${sens > 0 ? "precedente" : "suivante"}"]`) : bouton)?.focus();
}

doublePage.addEventListener("change", () => { if (ouvert) afficherBinder(); });

// ---------- Fenêtre : créer ou modifier un binder ----------

function choixCouvertures(selection) {
  return COUVERTURES.map((choix) => {
    const libre = estDebloquee(choix, debloquees);
    const apercu = choix.type === "illustre"
      ? `<img src="${choix.image}-couverture.webp" alt="" loading="lazy">`
      : "";
    return `<label class="choix${libre ? "" : " verrouille"}"${choix.type === "couleur" ? ` style="--teinte: var(--${choix.couleur})"` : ""}>
        <input type="radio" name="couverture" value="${choix.id}"${choix.id === selection ? " checked" : ""}${libre ? "" : " disabled"}>
        <span class="choix-apercu ${choix.type}">${apercu}${libre ? "" : '<span class="cadenas" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>'}</span>
        <span class="choix-nom">${choix.nom}${libre ? "" : `<small>${choix.prix} pièces, bientôt dans la boutique</small>`}</span>
      </label>`;
  }).join("");
}

// binder : null (création), ou le binder ouvert (modification)
function ouvrirFenetre(binder = null) {
  enEdition = binder;
  const deSet = binder?.genre === "set";
  document.getElementById("titre-fenetre").textContent = binder ? (deSet ? `Couverture du binder ${binder.nom}` : "Modifier le binder") : "Nouveau binder";
  document.getElementById("groupe-nom").hidden = deSet;
  document.getElementById("bouton-supprimer").hidden = !binder || deSet;
  document.getElementById("bouton-enregistrer").textContent = binder ? "Enregistrer" : "Créer le binder";
  champNom.value = binder && !deSet ? binder.nom : "";
  champNom.removeAttribute("aria-invalid");
  erreurNom.textContent = "";
  document.getElementById("couvertures-choix").innerHTML = choixCouvertures(binder?.couverture ?? "eau");
  fenetre.showModal();
  (deSet ? fenetre.querySelector("input[name=couverture]:checked") : champNom).focus();
}

formulaire.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const nom = champNom.value.trim();
  const choix = formulaire.querySelector("input[name=couverture]:checked")?.value ?? "eau";
  if (enEdition?.genre !== "set" && !nom) {
    erreurNom.textContent = "Donne un nom à ton binder.";
    champNom.setAttribute("aria-invalid", "true");
    champNom.focus();
    return;
  }
  try {
    if (!enEdition) {
      const binder = await creerBinder({ nom, couverture: choix });
      libres.push(binder);
      fenetre.close();
      annoncer(`Binder « ${nom} » créé.`);
      await ouvrir(cleBinder("libre", binder.id));
    } else if (enEdition.genre === "set") {
      await choisirCouvertureDeSet(enEdition.id, choix);
      reglagesSets[enEdition.id] = { couverture: choix };
      ouvert.couverture = choix;
      fenetre.close();
      afficherEtageres();
      afficherBinder();
      annoncer("Couverture enregistrée.");
    } else {
      const binder = await modifierBinder(enEdition.id, { nom, couverture: choix });
      Object.assign(libres.find((b) => b.id === binder.id), binder);
      Object.assign(ouvert, { nom: binder.nom, couverture: binder.couverture });
      fenetre.close();
      afficherEtageres();
      afficherBinder();
      annoncer("Binder modifié.");
    }
  } catch (erreur) {
    erreurNom.textContent = "Impossible d'enregistrer : le stockage de ton navigateur est bloqué ou plein.";
  }
});

document.getElementById("bouton-annuler").addEventListener("click", () => fenetre.close());

document.getElementById("bouton-supprimer").addEventListener("click", async () => {
  if (!enEdition || !confirm(`Supprimer le binder « ${enEdition.nom} » ? Les cartes restent dans ta collection.`)) return;
  await supprimerBinder(enEdition.id);
  libres = libres.filter((b) => b.id !== enEdition.id);
  fenetre.close();
  ouvert = null;
  panneau.hidden = true;
  afficherEtageres();
  memoriserDansAdresse();
  annoncer(`Binder « ${enEdition.nom} » supprimé.`);
  document.getElementById("bouton-nouveau").focus();
});

// ---------- Clics ----------

document.getElementById("contenu").addEventListener("click", async (evenement) => {
  const cible = evenement.target.closest("button");
  if (!cible) return;
  if (cible.id === "bouton-nouveau" || cible.dataset.action === "nouveau") ouvrirFenetre();
  else if (cible.dataset.binder) {
    await ouvrir(cible.dataset.binder);
    panneau.querySelector("h2")?.setAttribute("tabindex", "-1");
    panneau.querySelector("h2")?.focus({ preventScroll: true });
  } else if (cible.dataset.action === "precedente") changerDePage(-1);
  else if (cible.dataset.action === "suivante") changerDePage(1);
  else if (cible.dataset.action === "modifier") ouvrirFenetre(ouvert);
  else if (cible.classList.contains("retirer-carte")) {
    const position = Number(cible.dataset.position);
    const carte = ouvert.cartes[position];
    const binder = await retirerDuBinder(ouvert.id, position);
    if (!binder) return;
    Object.assign(libres.find((b) => b.id === binder.id), binder);
    ouvert.cartes = binder.cartes;
    afficherEtageres();
    afficherBinder();
    annoncer(`${carte.nom} retirée du binder.`);
    panneau.querySelector(".retirer-carte")?.focus();
  }
});

// ---------- Chargement ----------

const [binders, collectionLue, couverturesDebloquees] = await Promise.all([getBinders(), getCollection(), getCouverturesDebloquees()]);
libres = binders.libres;
reglagesSets = binders.sets;
collection = collectionLue;
debloquees = couverturesDebloquees;

// Binders de set : un par set de la collection. Sans la liste TCGdex, ils s'affichent sans logo ;
// une fois la liste chargée, ils reçoivent leur logo et sont rangés du plus récent au plus ancien.
function calculerSets(index) {
  const parSet = new Map();
  for (const entree of collection) {
    const idSet = entree.set?.id;
    if (!idSet) continue;
    const infos = index?.sets.get(idSet);
    if (!parSet.has(idSet)) {
      parSet.set(idSet, { id: idSet, nom: infos?.nom ?? entree.set.nom ?? idSet, logo: infos?.logo ?? null,
        officiel: infos?.officiel ?? entree.set.officiel ?? 0, rang: infos?.rang ?? 0, possedees: 0 });
    }
    const set = parSet.get(idSet);
    if (estOfficielle(entree.numero, set.officiel)) set.possedees += 1;
  }
  sets = [...parSet.values()].sort((a, b) => b.rang - a.rang || a.nom.localeCompare(b.nom, "fr"));
}

calculerSets(null);
afficherEtageres();
const index = await getIndex().catch(() => null);
if (index) {
  calculerSets(index);
  afficherEtageres();
}

const parametres = new URLSearchParams(location.search);
if (parametres.get("binder")) await ouvrir(parametres.get("binder"), { page: Math.max(0, Number(parametres.get("page") ?? 1) - 1), defiler: false });
if (parametres.has("nouveau")) ouvrirFenetre();
