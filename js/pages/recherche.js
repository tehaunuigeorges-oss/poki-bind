// Recherche de cartes. La liste complète des cartes françaises est téléchargée une fois par semaine
// (voir tcgdex.js), puis la recherche se fait dans le navigateur, sans tenir compte des accents.

import { getIndex, chercherCartes, getCarte, variantesDeCarte, resumeCarte, ErreurTcgdex } from "../tcgdex.js";
import { getCollection, ajouterCarte } from "../donnees.js";
import { visuelCarte } from "../visuel-carte.js";
import { echapper, formaterNombre, annoncer } from "../outils.js";

const PAR_PAGE = 60;
const DELAI_FRAPPE = 250; // ms sans frappe avant de chercher

const formulaire = document.getElementById("formulaire-recherche");
const champ = document.getElementById("requete");
const choixSerie = document.getElementById("serie");
const resume = document.getElementById("resume-resultats");
const aucunResultat = document.getElementById("aucun-resultat");
const grille = document.getElementById("resultats");
const boutonPlus = document.getElementById("voir-plus");
const encartErreur = document.getElementById("erreur-recherche");
const texteErreur = document.getElementById("texte-erreur");

const parametres = new URLSearchParams(location.search);
const serieDemandee = parametres.get("serie") ?? "";
champ.value = parametres.get("q") ?? "";

let index = null;
let resultats = [];
let affichees = 0;
let possedees = new Set();
let minuterie = 0;

const icone = (dessin) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${dessin}</svg>`;
const ICONE_PLUS = icone('<path d="M12 5v14M5 12h14"/>');
const ICONE_COCHE = icone('<path d="m5 12.5 4.5 4.5L19 7.5"/>');

const SQUELETTES = Array.from({ length: 12 }, () =>
  '<li class="tuile" aria-hidden="true"><span class="visuel-carte"></span><span class="squelette"></span><span class="squelette courte"></span></li>'
).join("");

// ---------- Affichage des résultats ----------

function infosSet(carte) {
  const set = index.sets.get(carte.set);
  return {
    nomSet: set?.nom ?? carte.set.toUpperCase(),
    numero: set?.officiel ? `${carte.numero}/${set.officiel}` : carte.numero,
  };
}

const indicateurPossedee = (nom) =>
  `<span class="ajout-rapide possede" role="img" aria-label="${echapper(nom)} est dans ta collection">${ICONE_COCHE}</span>`;

function tuile(carte) {
  const { nomSet, numero } = infosSet(carte);
  const etat = possedees.has(carte.id)
    ? indicateurPossedee(carte.nom)
    : `<button class="ajout-rapide" type="button" data-id="${echapper(carte.id)}" aria-label="Ajouter ${echapper(`${carte.nom}, ${nomSet} ${numero}`)} à ma collection">${ICONE_PLUS}</button>`;
  return `<li class="tuile">
      <a class="tuile-lien" href="carte.html?id=${encodeURIComponent(carte.id)}">
        ${visuelCarte(carte)}
        <span class="tuile-texte">
          <span class="tuile-nom">${echapper(carte.nom)}</span>
          <span title="${echapper(nomSet)}">${echapper(nomSet)}</span>
          <span class="num">${echapper(numero)}</span>
        </span>
      </a>
      ${etat}
    </li>`;
}

function texteResume(nombre) {
  const serie = index.series.find((s) => s.id === choixSerie.value);
  const quantite = nombre === 0 ? "Aucune carte trouvée" : `${formaterNombre(nombre)} ${nombre > 1 ? "résultats" : "résultat"}`;
  return serie ? `${quantite} · ${serie.nom}` : quantite;
}

function majBoutonPlus() {
  const reste = resultats.length - affichees;
  boutonPlus.hidden = reste <= 0;
  boutonPlus.textContent = `Voir plus de cartes (${formaterNombre(reste)} restantes)`;
}

// La recherche reste dans l'adresse : le bouton Retour du navigateur la retrouve.
function memoriserDansAdresse(requete) {
  const reglages = new URLSearchParams();
  // Pendant le chargement, la liste des séries est encore vide : on garde la série de l'adresse.
  const serie = index ? choixSerie.value : serieDemandee;
  if (requete) reglages.set("q", requete);
  if (serie) reglages.set("serie", serie);
  const texte = reglages.toString();
  history.replaceState(null, "", texte ? `?${texte}` : location.pathname);
}

function afficherResultats() {
  clearTimeout(minuterie);
  const requete = champ.value.trim();
  memoriserDansAdresse(requete);
  aucunResultat.hidden = true;
  boutonPlus.hidden = true;

  if (!requete) {
    resultats = [];
    resume.textContent = "";
    grille.innerHTML = "";
    return;
  }
  if (!index) {
    if (!encartErreur.hidden) return;
    resume.textContent = "Chargement de la liste des cartes…";
    grille.innerHTML = SQUELETTES;
    return;
  }

  resultats = chercherCartes(index, requete, choixSerie.value);
  affichees = Math.min(PAR_PAGE, resultats.length);
  resume.textContent = texteResume(resultats.length);
  aucunResultat.hidden = resultats.length > 0;
  grille.innerHTML = resultats.slice(0, affichees).map(tuile).join("");
  majBoutonPlus();
}

// Affiche les résultats suivants jusqu'au nombre demandé ; renvoie la place de la première carte ajoutée.
function afficherJusqua(nombre) {
  const debut = affichees;
  affichees = Math.min(nombre, resultats.length);
  grille.insertAdjacentHTML("beforeend", resultats.slice(debut, affichees).map(tuile).join(""));
  majBoutonPlus();
  return debut;
}

boutonPlus.addEventListener("click", () => {
  const debut = afficherJusqua(affichees + PAR_PAGE);
  // Au clavier, on continue sur la première carte ajoutée
  grille.children[debut]?.querySelector("a")?.focus();
});

// ---------- Retour depuis une fiche : même liste, même hauteur ----------
// Le navigateur ne sait pas replacer la page tout seul : les résultats arrivent après son chargement.

const CLE_POSITION = "pokibind-recherche-position";
history.scrollRestoration = "manual";

addEventListener("pagehide", () => {
  try {
    sessionStorage.setItem(CLE_POSITION, JSON.stringify({ adresse: location.search, affichees, hauteur: scrollY }));
  } catch (erreur) {
    // Stockage bloqué : on reviendra simplement en haut de la liste.
  }
});

function replacerLaPage() {
  try {
    const position = JSON.parse(sessionStorage.getItem(CLE_POSITION));
    sessionStorage.removeItem(CLE_POSITION);
    if (!position || position.adresse !== location.search) return;
    if (position.affichees > affichees) afficherJusqua(position.affichees);
    scrollTo(0, position.hauteur);
  } catch (erreur) {
    // Position illisible : on reste en haut de la page.
  }
}

// ---------- Saisie ----------

champ.addEventListener("input", () => {
  clearTimeout(minuterie);
  minuterie = setTimeout(afficherResultats, DELAI_FRAPPE);
});
choixSerie.addEventListener("change", afficherResultats);
formulaire.addEventListener("submit", (evenement) => {
  evenement.preventDefault();
  afficherResultats();
  // Sur téléphone, on range le clavier pour laisser la place aux résultats
  if (matchMedia("(pointer: coarse)").matches) champ.blur();
});

// ---------- Ajout rapide : la variante la plus courante (normale, sinon reverse, sinon holo…) ----------

grille.addEventListener("click", async (evenement) => {
  const bouton = evenement.target.closest("button.ajout-rapide");
  if (!bouton || bouton.getAttribute("aria-disabled") === "true") return;
  const id = bouton.dataset.id;
  bouton.setAttribute("aria-disabled", "true");
  bouton.classList.add("en-cours");
  try {
    const carte = await getCarte(id);
    const variante = variantesDeCarte(carte).find((v) => v.existe);
    await ajouterCarte(resumeCarte(carte), variante.cle);
    possedees.add(id);
    const avaitLeFocus = document.activeElement === bouton;
    const lien = bouton.closest(".tuile").querySelector(".tuile-lien");
    bouton.outerHTML = indicateurPossedee(carte.name);
    if (avaitLeFocus) lien.focus();
    annoncer(`${carte.name} (${variante.nom.toLowerCase()}) est maintenant dans ta collection.`);
  } catch (erreur) {
    bouton.removeAttribute("aria-disabled");
    bouton.classList.remove("en-cours");
    annoncer(erreur instanceof ErreurTcgdex
      ? "Impossible d'ajouter la carte : la base de cartes ne répond pas. Réessaie dans un instant."
      : "Impossible d'enregistrer : le stockage de ton navigateur est bloqué ou plein.");
  }
});

// ---------- Chargement de la liste des cartes ----------

function messageErreur(erreur) {
  if (erreur instanceof ErreurTcgdex && erreur.raison === "reseau") {
    return "Impossible de joindre la base de cartes TCGdex. Vérifie ta connexion internet, puis réessaie.";
  }
  return "La base de cartes TCGdex ne répond pas correctement pour le moment. Réessaie dans quelques minutes.";
}

async function chargerIndex() {
  encartErreur.hidden = true;
  afficherResultats();
  try {
    index = await getIndex();
  } catch (erreur) {
    resume.textContent = "";
    grille.innerHTML = "";
    texteErreur.textContent = messageErreur(erreur);
    encartErreur.hidden = false;
    return;
  }
  choixSerie.insertAdjacentHTML("beforeend",
    index.series.map((serie) => `<option value="${echapper(serie.id)}">${echapper(serie.nom)}</option>`).join(""));
  if (index.series.some((serie) => serie.id === serieDemandee)) choixSerie.value = serieDemandee;
  afficherResultats();
  replacerLaPage();
}

document.getElementById("bouton-reessayer").addEventListener("click", chargerIndex);

possedees = new Set((await getCollection()).map((carte) => carte.id));
if (!champ.value) champ.focus();
chargerIndex();
