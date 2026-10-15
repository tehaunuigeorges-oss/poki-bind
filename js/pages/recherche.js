// Recherche de cartes. Les listes des cartes françaises sont téléchargées une fois par semaine
// (voir tcgdex.js), puis la recherche se fait dans le navigateur, sans tenir compte des accents.
// Sans texte cherché, la page sert à parcourir les cartes par famille et par série, set par set.

import { getIndex, chercherCartes, cartesParSet, FAMILLES, getCarte, variantesDeCarte, resumeCarte, ErreurTcgdex } from "../tcgdex.js";
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
const boutonsFamille = [...document.querySelectorAll("#familles [data-famille]")];
const parcours = document.getElementById("parcours");

const parametres = new URLSearchParams(location.search);
const serieDemandee = parametres.get("serie") ?? "";
champ.value = parametres.get("q") ?? "";
let famille = FAMILLES.includes(parametres.get("famille")) ? parametres.get("famille") : "";

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

// Un nombre suivi de la famille et de la série choisies (« 12 résultats · Pokémon · Écarlate et Violet »)
function avecFiltres(texte) {
  const serie = index.series.find((s) => s.id === choixSerie.value);
  return [texte, famille, serie?.nom].filter(Boolean).join(" · ");
}

const pluriel = (nombre, mot) => `${formaterNombre(nombre)} ${mot}${nombre > 1 ? "s" : ""}`;

function texteResume(nombre) {
  return avecFiltres(nombre === 0 ? "Aucune carte trouvée" : pluriel(nombre, "résultat"));
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
  if (famille) reglages.set("famille", famille);
  const texte = reglages.toString();
  history.replaceState(null, "", texte ? `?${texte}` : location.pathname);
}

function afficherResultats() {
  clearTimeout(minuterie);
  const requete = champ.value.trim();
  memoriserDansAdresse(requete);
  aucunResultat.hidden = true;
  boutonPlus.hidden = true;

  resultats = [];
  grille.innerHTML = "";
  parcours.innerHTML = "";

  if (!index) {
    if (!encartErreur.hidden) return;
    resume.textContent = "Chargement de la liste des cartes…";
    grille.innerHTML = SQUELETTES;
    return;
  }
  if (!requete) {
    afficherParcours();
    return;
  }

  resultats = chercherCartes(index, requete, choixSerie.value, famille);
  affichees = Math.min(PAR_PAGE, resultats.length);
  resume.textContent = texteResume(resultats.length);
  aucunResultat.hidden = resultats.length > 0;
  grille.innerHTML = resultats.slice(0, affichees).map(tuile).join("");
  majBoutonPlus();
}

// ---------- Parcours set par set (rien n'est cherché) ----------
// Chaque set est une section repliable, avec son titre et son nombre de cartes ;
// ses cartes ne sont créées qu'à l'ouverture, pour garder la page légère.

let groupes = [];

function afficherParcours() {
  groupes = cartesParSet(index, choixSerie.value, famille);
  const total = groupes.reduce((somme, groupe) => somme + groupe.cartes.length, 0);
  resume.textContent = avecFiltres(`${pluriel(groupes.length, "set")}, ${pluriel(total, "carte")}`);
  parcours.innerHTML = groupes.map((groupe) => `
    <details class="groupe-set" data-set="${echapper(groupe.id)}">
      <summary>
        <h2 class="groupe-set-titre">${echapper(groupe.nom)}</h2>
        <span class="groupe-set-infos">${echapper([groupe.serie?.nom, pluriel(groupe.cartes.length, "carte")].filter(Boolean).join(" · "))}</span>
      </summary>
      <ul class="grille-cartes"></ul>
    </details>`).join("");
}

function remplirSet(details) {
  const grilleSet = details.querySelector(".grille-cartes");
  if (grilleSet.childElementCount) return;
  const groupe = groupes.find((g) => g.id === details.dataset.set);
  grilleSet.innerHTML = groupe ? groupe.cartes.map(tuile).join("") : "";
}

// L'événement toggle ne remonte pas : on l'écoute en phase de capture.
parcours.addEventListener("toggle", (evenement) => {
  if (evenement.target.open) remplirSet(evenement.target);
}, true);

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
    const ouverts = [...parcours.querySelectorAll("details[open]")].map((details) => details.dataset.set);
    sessionStorage.setItem(CLE_POSITION, JSON.stringify({ adresse: location.search, affichees, ouverts, hauteur: scrollY }));
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
    for (const details of parcours.querySelectorAll("details")) {
      if (position.ouverts?.includes(details.dataset.set)) {
        remplirSet(details);
        details.open = true;
      }
    }
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

function choisirFamille(nouvelle) {
  famille = nouvelle;
  for (const bouton of boutonsFamille) bouton.setAttribute("aria-pressed", String(bouton.dataset.famille === famille));
}
for (const bouton of boutonsFamille) {
  bouton.addEventListener("click", () => {
    choisirFamille(bouton.dataset.famille);
    afficherResultats();
  });
}
choisirFamille(famille);
formulaire.addEventListener("submit", (evenement) => {
  evenement.preventDefault();
  afficherResultats();
  // Sur téléphone, on range le clavier pour laisser la place aux résultats
  if (matchMedia("(pointer: coarse)").matches) champ.blur();
});

// ---------- Ajout rapide : la variante la plus courante (normale, sinon reverse, sinon holo…) ----------

async function ajoutRapide(evenement) {
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
}
grille.addEventListener("click", ajoutRapide);
parcours.addEventListener("click", ajoutRapide);

// ---------- Chargement de la liste des cartes ----------

// Journal dans la console (touche F12) : familles et sets trouvés dans les données TCGdex.
function journaliser() {
  console.groupCollapsed(`Pokibind · ${pluriel(index.cartes.length, "carte")}, ${pluriel(index.sets.size, "set")}, ${pluriel(index.series.length, "série")}`);
  for (const nom of FAMILLES) {
    const sets = cartesParSet(index, "", nom);
    const total = sets.reduce((somme, groupe) => somme + groupe.cartes.length, 0);
    console.groupCollapsed(`${nom} : ${pluriel(total, "carte")} dans ${pluriel(sets.length, "set")}`);
    console.table(sets.map((groupe) => ({ set: groupe.nom, id: groupe.id, serie: groupe.serie?.nom ?? "inconnue", cartes: groupe.cartes.length })));
    console.groupEnd();
  }
  const inconnus = [...new Set(index.cartes.filter((carte) => !index.sets.has(carte.set)).map((carte) => carte.set))];
  console.info(inconnus.length ? `Sets absents de la liste des séries : ${inconnus.join(", ")}` : "Tous les sets des cartes sont connus.");
  console.groupEnd();
}

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
  journaliser();
  afficherResultats();
  replacerLaPage();
}

document.getElementById("bouton-reessayer").addEventListener("click", chargerIndex);

possedees = new Set((await getCollection()).map((carte) => carte.id));
if (!champ.value) champ.focus();
chargerIndex();
