// Page d'un set (set.html?id=sv08.5) : toutes ses cartes, possédées ou manquantes (en pointillés),
// avec tri, filtre, variantes possédées et ajout rapide.

import { getSet, getSerie, imageDeSecours, numeroLisible, estOfficielle, VARIANTES, ErreurTcgdex } from "../tcgdex.js";
import { getCollection, nombreExemplaires, valeurEntree } from "../donnees.js";
import { visuelCarte, illustration } from "../visuel-carte.js";
import { ajouterVarianteCourante, messageErreurAjout } from "../ajout-rapide.js";
import { echapper, formaterNombre, formaterPrix, initiales, annoncer } from "../outils.js";

const zone = document.getElementById("set-page");
const squelette = zone.innerHTML;
const parametres = new URLSearchParams(location.search);
const id = parametres.get("id") ?? "";
let tri = parametres.get("tri") === "nom" ? "nom" : "numero";
let voir = ["possedees", "manquantes"].includes(parametres.get("voir")) ? parametres.get("voir") : "toutes";

let set = null;          // réponse de TCGdex
let cartes = [];         // cartes du set, prêtes à afficher
let possedees = new Map(); // id de carte → entrée de la collection

const FILTRES = [["toutes", "Toutes"], ["possedees", "Possédées"], ["manquantes", "Manquantes"]];
const ICONE_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

const officiel = () => set.cardCount?.official ?? 0;
const numeroComplet = (carte) => (officiel() ? `${carte.numero}/${officiel()}` : carte.numero);
const pluriel = (nombre, mot, motPluriel = `${mot}s`) => `${formaterNombre(nombre)} ${nombre > 1 ? motPluriel : mot}`;

// ---------- Cartes ----------

function tuile(carte) {
  const entree = possedees.get(carte.id);
  const numero = numeroComplet(carte);
  const visuel = entree
    ? visuelCarte({ ...carte, numero })
    : `<span class="visuel-carte manquante"><span class="carte-remplacement" aria-hidden="true"><span>${echapper(carte.nom)}</span><span class="num">${echapper(numero)}</span></span></span>`;
  const etat = entree ? `possédée, ${pluriel(nombreExemplaires(entree), "exemplaire")}` : "manquante";
  const puces = entree
    ? VARIANTES.filter((v) => entree.variantes[v.cle]).map((v) => {
      const nombre = entree.variantes[v.cle];
      return `<span class="puce-variante" title="${v.nom}">${v.court}${nombre > 1 ? `<small>×${nombre}</small>` : ""}</span>`;
    }).join("")
    : "";
  return `<li class="tuile${entree ? "" : " manquante"}">
      <a class="tuile-lien" href="carte.html?id=${encodeURIComponent(carte.id)}">
        ${visuel}
        <span class="sr-only">${echapper(`${carte.nom}, ${numero}, ${etat}`)}</span>
      </a>
      <div class="tuile-pied">
        <span class="puces-variantes" aria-hidden="true">${puces}</span>
        <button class="ajout-rapide" type="button" data-id="${echapper(carte.id)}" aria-label="Ajouter un exemplaire de ${echapper(`${carte.nom} ${numero}`)}">${ICONE_PLUS}</button>
      </div>
    </li>`;
}

function cartesVisibles() {
  const liste = cartes.filter((carte) =>
    voir === "toutes" || (voir === "possedees") === possedees.has(carte.id));
  return tri === "nom"
    ? liste.sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.numero.localeCompare(b.numero, "fr", { numeric: true }))
    : liste.sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }));
}

// Résumé, barre de progression et grille (l'en-tête et ses réglages ne bougent pas)
function majCartes() {
  let officielles = 0;
  let secretes = 0;
  let valeur = 0;
  for (const carte of cartes) {
    const entree = possedees.get(carte.id);
    if (!entree) continue;
    if (estOfficielle(carte.numero, officiel())) officielles += 1;
    else secretes += 1;
    valeur += valeurEntree(entree);
  }
  const total = officiel() || cartes.length;
  const morceaux = [`${formaterNombre(officielles + (officiel() ? 0 : secretes))} ${officielles > 1 ? "cartes" : "carte"} sur ${formaterNombre(total)}`];
  if (officiel() && secretes) morceaux.push(`+${pluriel(secretes, "secrète")}`);
  morceaux.push(`tes cartes ${formaterPrix(valeur)}`);
  document.getElementById("resume-set").textContent = morceaux.join(" · ");
  const part = total ? Math.min(1, (officiel() ? officielles : officielles + secretes) / total) : 0;
  document.querySelector("#barre-set > span").style.width = `${(part * 100).toFixed(1)}%`;
  document.getElementById("barre-set").classList.toggle("complet", part >= 1);

  const visibles = cartesVisibles();
  document.getElementById("grille-set").innerHTML = visibles.map(tuile).join("");
  document.getElementById("rien-a-voir").hidden = visibles.length > 0;
}

function memoriserDansAdresse() {
  const reglages = new URLSearchParams({ id });
  if (tri !== "numero") reglages.set("tri", tri);
  if (voir !== "toutes") reglages.set("voir", voir);
  history.replaceState(null, "", `?${reglages}`);
}

function afficher(serie) {
  const sigle = set.abbreviation?.official ?? (/^\d+$/.test(set.name) ? set.name : initiales(set.name));
  document.title = `${set.name} · Pokibind`;
  zone.removeAttribute("aria-busy");
  zone.innerHTML = `
    <a class="retour" href="collection.html">← Ma collection</a>
    <div class="tete-set">
      <span class="vignette-set grande" data-sigle="${echapper(sigle)}">${illustration(set.logo)}</span>
      <div class="tete-set-texte">
        <p class="surtitre avec-illustration">${set.serie ? `${illustration(serie?.logo)}<span>${echapper(set.serie.name)}</span>` : ""}</p>
        <h1>${echapper(set.name)}</h1>
        <p class="tete-set-resume num" id="resume-set"></p>
      </div>
      <div class="tete-set-reglages">
        <label class="sr-only" for="tri">Ordre des cartes</label>
        <select class="champ champ-petit" id="tri">
          <option value="numero"${tri === "numero" ? " selected" : ""}>Trier par numéro</option>
          <option value="nom"${tri === "nom" ? " selected" : ""}>Trier par nom</option>
        </select>
        <div class="segments" role="group" aria-label="Cartes à afficher">
          ${FILTRES.map(([cle, texte]) => `<button type="button" data-voir="${cle}" aria-pressed="${cle === voir}">${texte}</button>`).join("")}
        </div>
      </div>
    </div>
    <div class="progression grande" id="barre-set" aria-hidden="true"><span></span></div>
    <ul class="grille-cartes grille-set" id="grille-set"></ul>
    <p class="aide-resultats" id="rien-a-voir" hidden>Aucune carte à afficher avec ce choix.</p>
    <p class="note-page">Les cartes manquantes restent visibles en pointillés. Les lettres sous une carte indiquent les variantes que tu possèdes : N normale, R reverse, H holo, PB Poké Ball, MB Master Ball. Le « + » ajoute un exemplaire sans passer par la recherche.</p>`;
  majCartes();
}

function afficherMessage(titre, texte, { erreur = false, reessayer = false } = {}) {
  zone.removeAttribute("aria-busy");
  zone.innerHTML = `<div class="encart${erreur ? " encart-erreur" : ""}"${erreur ? ' role="alert"' : ""}>
      <h1>${titre}</h1>
      <p>${texte}</p>
      <div class="boutons">
        ${reessayer ? '<button class="bouton bouton-petit" id="bouton-reessayer" type="button">Réessayer</button>' : ""}
        <a class="bouton bouton-petit bouton-secondaire" href="collection.html">Ma collection</a>
      </div>
    </div>`;
}

// ---------- Actions ----------

zone.addEventListener("change", (evenement) => {
  if (evenement.target.id !== "tri") return;
  tri = evenement.target.value;
  memoriserDansAdresse();
  majCartes();
});

zone.addEventListener("click", async (evenement) => {
  const filtre = evenement.target.closest("[data-voir]");
  if (filtre) {
    voir = filtre.dataset.voir;
    for (const bouton of zone.querySelectorAll("[data-voir]")) bouton.setAttribute("aria-pressed", String(bouton === filtre));
    memoriserDansAdresse();
    majCartes();
    return;
  }
  if (evenement.target.closest("#bouton-reessayer")) {
    charger();
    return;
  }
  const bouton = evenement.target.closest("button.ajout-rapide");
  if (!bouton || bouton.getAttribute("aria-disabled") === "true") return;
  const idCarte = bouton.dataset.id;
  const avaitLeFocus = document.activeElement === bouton;
  bouton.setAttribute("aria-disabled", "true");
  bouton.classList.add("en-cours");
  try {
    const { nom, variante, entree } = await ajouterVarianteCourante(idCarte);
    possedees.set(idCarte, entree);
    majCartes();
    if (avaitLeFocus) zone.querySelector(`button.ajout-rapide[data-id="${CSS.escape(idCarte)}"]`)?.focus();
    annoncer(`${nom} (${variante.nom.toLowerCase()}) : ${pluriel(entree.variantes[variante.cle], "exemplaire")} dans ta collection.`);
  } catch (erreur) {
    bouton.removeAttribute("aria-disabled");
    bouton.classList.remove("en-cours");
    annoncer(messageErreurAjout(erreur));
  }
});

// ---------- Retour depuis une fiche : même hauteur dans la grille ----------

const CLE_POSITION = "pokibind-set-position";
history.scrollRestoration = "manual";
addEventListener("pagehide", () => {
  try {
    sessionStorage.setItem(CLE_POSITION, JSON.stringify({ adresse: location.search, hauteur: scrollY }));
  } catch (erreur) {
    // Stockage bloqué : on reviendra en haut de la page.
  }
});
function replacerLaPage() {
  try {
    const position = JSON.parse(sessionStorage.getItem(CLE_POSITION));
    sessionStorage.removeItem(CLE_POSITION);
    if (position?.adresse === location.search) scrollTo(0, position.hauteur);
  } catch (erreur) {
    // Position illisible : on reste en haut.
  }
}

// ---------- Chargement ----------

async function charger() {
  if (!id) {
    afficherMessage("Aucun set choisi", "Ouvre un set depuis ta collection.");
    return;
  }
  zone.setAttribute("aria-busy", "true");
  zone.innerHTML = squelette;
  try {
    const [donnees, collection] = await Promise.all([getSet(id), getCollection()]);
    set = donnees;
    const serie = set.serie?.id ? await getSerie(set.serie.id).catch(() => null) : null;
    possedees = new Map(collection.filter((entree) => entree.set?.id === id).map((entree) => [entree.id, entree]));
    cartes = (set.cards ?? []).map((carte) => {
      const numero = numeroLisible(carte.localId);
      return {
        id: carte.id,
        nom: carte.name,
        numero,
        image: carte.image ?? null,
        imageSecours: carte.image ? null : imageDeSecours(set.serie?.id, set.id, numero),
      };
    });
    afficher(serie);
    replacerLaPage();
  } catch (erreur) {
    if (erreur instanceof ErreurTcgdex && erreur.raison === "introuvable") {
      afficherMessage("Set introuvable", "Ce set n'existe pas dans la base de cartes TCGdex.");
    } else {
      afficherMessage("Impossible de charger le set", erreur instanceof ErreurTcgdex && erreur.raison === "reseau"
        ? "La base de cartes TCGdex ne répond pas. Vérifie ta connexion internet, puis réessaie."
        : "La base de cartes TCGdex ne répond pas correctement pour le moment. Réessaie dans quelques minutes.",
      { erreur: true, reessayer: true });
    }
  }
}

charger();
