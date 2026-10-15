// Mes binders : un rayon de couvertures ; un clic ouvre le binder en double page de 3 × 3 pochettes
// (une seule page sur téléphone). Les cartes s'ajoutent depuis le binder (« Ajouter des cartes »)
// ou depuis la fiche d'une carte (« Placer dans un binder »), et se rangent dans l'ordre d'ajout.

import { getBinders, creerBinder, modifierBinder, supprimerBinder, placerCarte, retirerDuBinder,
  getCouverturesDebloquees } from "../donnees.js";
import { getIndex, chercherCartes, ErreurTcgdex } from "../tcgdex.js";
import { COUVERTURES, couverture, estDebloquee } from "../couvertures.js";
import { visuelCarte, illustration } from "../visuel-carte.js";
import { echapper, formaterNombre, annoncer } from "../outils.js";

const PAR_PAGE = 9;
const etagere = document.getElementById("etagere");
const panneau = document.getElementById("binder-ouvert");
const fenetre = document.getElementById("fenetre-binder");
const formulaire = document.getElementById("formulaire-binder");
const champNom = document.getElementById("nom-binder");
const erreurNom = document.getElementById("erreur-nom");
const doublePage = matchMedia("(min-width: 760px)");

let libres = [];
let debloquees = [];
let ouvert = null;         // le binder ouvert (objet de « libres »)
let premierePage = 0;
let enEdition = null;      // binder modifié dans la fenêtre (null : création)

const pluriel = (nombre, mot) => `${formaterNombre(nombre)} ${mot}${nombre > 1 ? "s" : ""}`;
const lisible = (nombre) => `${formaterNombre(nombre)} ${nombre > 1 ? "cartes placées" : "carte placée"}`;

// ---------- Couvertures ----------

function couvertureHtml(idCouverture) {
  const choix = couverture(idCouverture);
  if (choix.type === "illustre") {
    return `<span class="couverture illustree"><img src="${choix.image}-couverture.webp" alt="" loading="lazy" decoding="async"></span>`;
  }
  return `<span class="couverture" style="--teinte: var(--${choix.couleur})">
      <img class="couverture-pokibind" src="img/logos/logo-icone.png" alt="" width="204" height="256">
    </span>`;
}

function afficherEtagere() {
  etagere.innerHTML = libres.map((binder) => `<li>
      <button class="binder-couverture" type="button" data-binder="${echapper(binder.id)}" aria-expanded="${ouvert?.id === binder.id}" aria-controls="binder-ouvert">
        ${couvertureHtml(binder.couverture)}
        <span class="binder-nom">${echapper(binder.nom)}</span>
        <span class="binder-infos num">${pluriel(binder.cartes.length, "carte")}</span>
      </button>
    </li>`).join("") + `<li><button class="binder-nouveau" type="button" data-action="nouveau"><span aria-hidden="true">+</span> Nouveau binder</button></li>`;
}

// ---------- Binder ouvert ----------

const pagesVisibles = () => (doublePage.matches ? 2 : 1);
const nombrePages = () => Math.max(2, Math.ceil(ouvert.cartes.length / PAR_PAGE));

function pochette(carte, position) {
  if (!carte) return `<li class="pochette vide"></li>`;
  return `<li class="pochette">
      <a href="carte.html?id=${encodeURIComponent(carte.id)}" class="pochette-lien">
        ${visuelCarte(carte)}
        <span class="sr-only">${echapper(`${carte.nom}, ${carte.numero}`)}</span>
      </a>
      <button class="retirer-carte" type="button" data-position="${position}" aria-label="Retirer ${echapper(carte.nom)} du binder">×</button>
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
  const fond = choix.type === "illustre"
    ? `style="--fond: url('${choix.image}-interieur.webp')"`
    : `style="--teinte: var(--${choix.couleur})"`;

  panneau.innerHTML = `
    <div class="binder-tete">
      <div class="tete-page">
        <h2 id="titre-binder" tabindex="-1">${echapper(ouvert.nom)}</h2>
        <p class="num" id="pages-binder" aria-live="polite">${textePages} · ${lisible(ouvert.cartes.length)}</p>
      </div>
      <div class="binder-commandes">
        <button class="bouton bouton-petit" type="button" data-action="ajouter"><span aria-hidden="true">+</span> Ajouter des cartes</button>
        <button class="bouton bouton-secondaire bouton-petit" type="button" data-action="modifier">Modifier</button>
        <button class="bouton-icone" type="button" data-action="precedente" aria-label="Pages précédentes"${premierePage === 0 ? " disabled" : ""}>‹</button>
        <button class="bouton-icone" type="button" data-action="suivante" aria-label="Pages suivantes"${derniere >= total ? " disabled" : ""}>›</button>
      </div>
    </div>
    <div class="double-page${choix.type === "illustre" ? " illustree" : ""}" ${fond}>
      ${page(premierePage, "gauche")}
      ${pagesVisibles() === 2 ? `<div class="anneaux" aria-hidden="true"><i></i><i></i><i></i></div>${page(premierePage + 1, "droite")}` : ""}
    </div>
    <p class="note-page">Tu peux aussi placer une carte depuis sa fiche, avec « Placer dans un binder ». Le « × » d'une pochette retire la carte du binder, sans toucher à ta collection.</p>`;
}

function memoriserDansAdresse() {
  const reglages = new URLSearchParams();
  if (ouvert) {
    reglages.set("binder", ouvert.id);
    if (premierePage) reglages.set("page", String(premierePage + 1));
  }
  const texte = reglages.toString();
  history.replaceState(null, "", texte ? `?${texte}` : location.pathname);
}

function ouvrir(id, { page: numeroPage = 0, defiler = true } = {}) {
  ouvert = libres.find((binder) => binder.id === id) ?? null;
  if (!ouvert) return;
  premierePage = numeroPage;
  panneau.hidden = false;
  afficherEtagere();
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

// Recharge un binder depuis le stockage après une modification
function remplacer(binder) {
  const rang = libres.findIndex((b) => b.id === binder.id);
  if (rang >= 0) libres[rang] = binder;
  if (ouvert?.id === binder.id) ouvert = binder;
}

// ---------- Fenêtre : créer ou modifier un binder ----------

function choixCouvertures(selection) {
  return COUVERTURES.map((choix) => {
    const libre = estDebloquee(choix, debloquees);
    const apercu = choix.type === "illustre" ? `<img src="${choix.image}-couverture.webp" alt="" loading="lazy">` : "";
    return `<label class="choix${libre ? "" : " verrouille"}"${choix.type === "couleur" ? ` style="--teinte: var(--${choix.couleur})"` : ""}>
        <input type="radio" name="couverture" value="${choix.id}"${choix.id === selection ? " checked" : ""}${libre ? "" : " disabled"}>
        <span class="choix-apercu ${choix.type}">${apercu}${libre ? "" : '<span class="cadenas" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>'}</span>
        <span class="choix-nom">${choix.nom}${libre ? "" : `<small>${choix.prix} pièces, bientôt dans la boutique</small>`}</span>
      </label>`;
  }).join("");
}

function ouvrirFenetre(binder = null) {
  enEdition = binder;
  document.getElementById("titre-fenetre").textContent = binder ? "Modifier le binder" : "Nouveau binder";
  document.getElementById("bouton-supprimer").hidden = !binder;
  document.getElementById("bouton-enregistrer").textContent = binder ? "Enregistrer" : "Créer le binder";
  champNom.value = binder?.nom ?? "";
  champNom.removeAttribute("aria-invalid");
  erreurNom.textContent = "";
  document.getElementById("couvertures-choix").innerHTML = choixCouvertures(binder?.couverture ?? "eau");
  fenetre.showModal();
  champNom.focus();
}

formulaire.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const nom = champNom.value.trim();
  const choix = formulaire.querySelector("input[name=couverture]:checked")?.value ?? "eau";
  if (!nom) {
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
      ouvrir(binder.id);
      panneau.querySelector("h2").focus({ preventScroll: true });
    } else {
      remplacer(await modifierBinder(enEdition.id, { nom, couverture: choix }));
      fenetre.close();
      afficherEtagere();
      afficherBinder();
      annoncer("Binder modifié.");
      panneau.querySelector('[data-action="modifier"]').focus();
    }
  } catch (erreur) {
    erreurNom.textContent = "Impossible d'enregistrer : le stockage de ton navigateur est bloqué ou plein.";
  }
});

document.getElementById("bouton-annuler").addEventListener("click", () => fenetre.close());

document.getElementById("bouton-supprimer").addEventListener("click", async () => {
  if (!enEdition || !confirm(`Supprimer le binder « ${enEdition.nom} » ? Ta collection ne change pas.`)) return;
  await supprimerBinder(enEdition.id);
  libres = libres.filter((b) => b.id !== enEdition.id);
  fenetre.close();
  ouvert = null;
  panneau.hidden = true;
  afficherEtagere();
  memoriserDansAdresse();
  annoncer(`Binder « ${enEdition.nom} » supprimé.`);
  document.getElementById("bouton-nouveau").focus();
});

// ---------- Fenêtre : ajouter des cartes au binder ouvert ----------
// Même recherche que la page Rechercher (sans accents, par nom ou numéro), dans le binder.

const fenetreAjout = document.getElementById("fenetre-ajout");
const champAjout = document.getElementById("requete-ajout");
const resumeAjout = document.getElementById("resume-ajout");
const resultatsAjout = document.getElementById("resultats-ajout");
const plusAjout = document.getElementById("plus-ajout");
const annonceAjout = document.getElementById("annonce-ajout");
const PAR_LOT = 30;
let index = null;
let trouvees = [];
let montrees = 0;
let ajoutees = 0;
let minuterie = 0;

function infosSet(carte) {
  const set = index.sets.get(carte.set);
  return { set, nomSet: set?.nom ?? carte.set.toUpperCase(), numero: set?.officiel ? `${carte.numero}/${set.officiel}` : carte.numero };
}

function dansLeBinder(id) {
  return ouvert.cartes.filter((carte) => carte.id === id).length;
}

function texteBouton(id) {
  const nombre = dansLeBinder(id);
  return nombre ? `Ajoutée ×${nombre}` : "Ajouter";
}

function tuileAjout(carte) {
  const { set, nomSet, numero } = infosSet(carte);
  return `<li class="tuile-ajout">
      ${visuelCarte(carte)}
      <span class="tuile-texte">
        <span class="tuile-nom">${echapper(carte.nom)}</span>
        <span class="avec-illustration" title="${echapper(nomSet)}">${illustration(set?.symbole, "symbole")}<span>${echapper(nomSet)}</span></span>
        <span class="num">${echapper(numero)}</span>
      </span>
      <button class="bouton bouton-petit${dansLeBinder(carte.id) ? " bouton-secondaire" : ""}" type="button" data-ajouter="${echapper(carte.id)}"
        aria-label="Ajouter ${echapper(`${carte.nom}, ${nomSet} ${numero}`)} au binder">${texteBouton(carte.id)}</button>
    </li>`;
}

function montrerJusqua(nombre) {
  const debut = montrees;
  montrees = Math.min(nombre, trouvees.length);
  resultatsAjout.insertAdjacentHTML("beforeend", trouvees.slice(debut, montrees).map(tuileAjout).join(""));
  plusAjout.hidden = montrees >= trouvees.length;
  return debut;
}

function chercherDansFenetre() {
  clearTimeout(minuterie);
  const requete = champAjout.value.trim();
  resultatsAjout.innerHTML = "";
  plusAjout.hidden = true;
  montrees = 0;
  if (!index) return;
  if (!requete) {
    resumeAjout.textContent = "";
    return;
  }
  trouvees = chercherCartes(index, requete);
  resumeAjout.textContent = trouvees.length ? pluriel(trouvees.length, "résultat") : "Aucune carte trouvée";
  montrerJusqua(PAR_LOT);
}

async function ouvrirFenetreAjout() {
  document.getElementById("titre-ajout").textContent = `Ajouter des cartes à « ${ouvert.nom} »`;
  annonceAjout.textContent = "";
  ajoutees = 0;
  fenetreAjout.showModal();
  champAjout.focus();
  champAjout.select();
  if (index) {
    chercherDansFenetre();
    return;
  }
  resumeAjout.textContent = "Chargement de la liste des cartes…";
  try {
    index = await getIndex();
    resumeAjout.textContent = "";
    chercherDansFenetre();
  } catch (erreur) {
    resumeAjout.textContent = erreur instanceof ErreurTcgdex && erreur.raison === "reseau"
      ? "Impossible de joindre la base de cartes TCGdex. Vérifie ta connexion internet, puis réessaie."
      : "La base de cartes TCGdex ne répond pas correctement pour le moment. Réessaie dans quelques minutes.";
  }
}

champAjout.addEventListener("input", () => {
  clearTimeout(minuterie);
  minuterie = setTimeout(chercherDansFenetre, 250);
});
document.getElementById("formulaire-ajout").addEventListener("submit", (evenement) => {
  evenement.preventDefault();
  chercherDansFenetre();
});
plusAjout.addEventListener("click", () => {
  const debut = montrerJusqua(montrees + PAR_LOT);
  resultatsAjout.children[debut]?.querySelector("button")?.focus();
});

resultatsAjout.addEventListener("click", async (evenement) => {
  const bouton = evenement.target.closest("button[data-ajouter]");
  if (!bouton) return;
  const carte = trouvees.find((c) => c.id === bouton.dataset.ajouter);
  const { nomSet } = infosSet(carte);
  const resume = {
    id: carte.id, nom: carte.nom, numero: carte.numero, image: carte.image, imageSecours: carte.imageSecours,
    set: { id: carte.set, nom: nomSet, officiel: index.sets.get(carte.set)?.officiel ?? null }, langue: "fr",
  };
  try {
    const position = await placerCarte(ouvert.id, resume);
    remplacer((await getBinders()).libres.find((b) => b.id === ouvert.id));
    ajoutees += 1;
    bouton.textContent = texteBouton(carte.id);
    bouton.classList.add("bouton-secondaire");
    annonceAjout.textContent = `${carte.nom} ajoutée, page ${Math.floor(position / PAR_PAGE) + 1}.`;
  } catch (erreur) {
    annonceAjout.textContent = "Impossible d'enregistrer : le stockage de ton navigateur est bloqué ou plein.";
  }
});

function fermerAjout() {
  fenetreAjout.close();
}
document.getElementById("fermer-ajout").addEventListener("click", fermerAjout);
document.getElementById("terminer-ajout").addEventListener("click", fermerAjout);

// À la fermeture : le binder montre la page de la dernière carte ajoutée
fenetreAjout.addEventListener("close", () => {
  if (ajoutees) {
    premierePage = Math.floor((ouvert.cartes.length - 1) / PAR_PAGE);
    afficherEtagere();
    afficherBinder();
    memoriserDansAdresse();
    annoncer(`${pluriel(ajoutees, "carte")} ${ajoutees > 1 ? "ajoutées" : "ajoutée"} à « ${ouvert.nom} ».`);
  }
  panneau.querySelector('[data-action="ajouter"]')?.focus();
});

// ---------- Clics ----------

document.getElementById("contenu").addEventListener("click", async (evenement) => {
  const cible = evenement.target.closest("button");
  if (!cible || cible.closest("dialog")) return;
  if (cible.id === "bouton-nouveau" || cible.dataset.action === "nouveau") ouvrirFenetre();
  else if (cible.dataset.binder) {
    ouvrir(cible.dataset.binder);
    panneau.querySelector("h2").focus({ preventScroll: true });
  } else if (cible.dataset.action === "ajouter") ouvrirFenetreAjout();
  else if (cible.dataset.action === "modifier") ouvrirFenetre(ouvert);
  else if (cible.dataset.action === "precedente") changerDePage(-1);
  else if (cible.dataset.action === "suivante") changerDePage(1);
  else if (cible.classList.contains("retirer-carte")) {
    const position = Number(cible.dataset.position);
    const carte = ouvert.cartes[position];
    const binder = await retirerDuBinder(ouvert.id, position);
    if (!binder) return;
    remplacer(binder);
    afficherEtagere();
    afficherBinder();
    annoncer(`${carte.nom} retirée du binder.`);
    (panneau.querySelector(".retirer-carte") ?? panneau.querySelector('[data-action="ajouter"]')).focus();
  }
});

// ---------- Chargement ----------

[libres, debloquees] = await Promise.all([getBinders().then((b) => b.libres), getCouverturesDebloquees()]);
afficherEtagere();

const parametres = new URLSearchParams(location.search);
if (parametres.get("binder")) ouvrir(parametres.get("binder"), { page: Math.max(0, Number(parametres.get("page") ?? 1) - 1), defiler: false });
if (parametres.has("nouveau")) ouvrirFenetre();
