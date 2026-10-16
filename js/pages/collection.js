// Ma collection : valeur totale, nombre de cartes, et un résumé par set possédé
// (progression vers le set complet), filtrable par série.

import { getCollection, nombreExemplaires, valeurEntree, getScelle, valeurScelle } from "../donnees.js";
import { getIndex, estOfficielle } from "../tcgdex.js";
import { illustration } from "../visuel-carte.js";
import { echapper, formaterNombre, formaterPrix, initiales } from "../outils.js";

const liste = document.getElementById("liste-sets");
const filtre = document.getElementById("filtre-series");
const pourcentage = new Intl.NumberFormat("fr-FR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

const collection = await getCollection();
let serieChoisie = new URLSearchParams(location.search).get("serie") ?? "";
let sets = [];

// ---------- Résumé ----------

const exemplaires = collection.reduce((somme, entree) => somme + nombreExemplaires(entree), 0);
// Valeur totale : cartes (prix Cardmarket) + scellé (ta revente estimée)
const scelle = await getScelle();
const valeur = collection.reduce((somme, entree) => somme + valeurEntree(entree), 0) + valeurScelle(scelle);
const produitsScelles = scelle.reduce((somme, produit) => somme + (Number(produit.quantite) || 0), 0);
document.getElementById("onglet-scelle").textContent = produitsScelles ? formaterNombre(produitsScelles) : "";
document.getElementById("valeur-totale").textContent = formaterPrix(valeur);
document.getElementById("nombre-cartes").textContent = formaterNombre(exemplaires);
document.getElementById("onglet-cartes").textContent = formaterNombre(exemplaires);

// ---------- Sets possédés ----------

// Regroupe les cartes par set. index : la liste TCGdex (série, logo, ordre des sets), ou null sans connexion.
function regrouper(index) {
  const groupes = new Map();
  for (const entree of collection) {
    const idSet = entree.set?.id ?? "";
    const infos = index?.sets.get(idSet);
    if (!groupes.has(idSet)) {
      groupes.set(idSet, {
        id: idSet,
        nom: infos?.nom ?? entree.set?.nom ?? idSet,
        officiel: infos?.officiel ?? entree.set?.officiel ?? 0,
        serie: infos?.serie ?? null,
        logo: infos?.logo ?? null,
        rang: infos?.rang ?? 0,
        officielles: 0,
        secretes: 0,
      });
    }
    const groupe = groupes.get(idSet);
    if (estOfficielle(entree.numero, groupe.officiel)) groupe.officielles += 1;
    else groupe.secretes += 1;
  }
  return [...groupes.values()].sort((a, b) => b.rang - a.rang || a.nom.localeCompare(b.nom, "fr"));
}

function sigle(nom) {
  return /^\d+$/.test(nom) ? nom : initiales(nom);
}

function carteSet(groupe) {
  const complet = groupe.officiel > 0 && groupe.officielles >= groupe.officiel;
  const part = groupe.officiel ? Math.min(1, groupe.officielles / groupe.officiel) : 0;
  const secretes = groupe.secretes ? ` · +${formaterNombre(groupe.secretes)} ${groupe.secretes > 1 ? "secrètes" : "secrète"}` : "";
  const compte = groupe.officiel
    ? `${formaterNombre(groupe.officielles)} / ${formaterNombre(groupe.officiel)} cartes${secretes}`
    : `${formaterNombre(groupe.officielles + groupe.secretes)} cartes`;
  return `<li>
      <a class="carte-set${complet ? " complet" : ""}" href="set.html?id=${encodeURIComponent(groupe.id)}">
        <span class="carte-set-haut">
          <span class="vignette-set" data-sigle="${echapper(sigle(groupe.nom))}">${illustration(groupe.logo)}</span>
          <span class="carte-set-titre">
            <span class="carte-set-nom">${echapper(groupe.nom)}</span>
            <span class="carte-set-serie">${echapper(groupe.serie?.nom ?? "")}</span>
          </span>
        </span>
        ${groupe.officiel ? `<span class="progression" aria-hidden="true"><span style="width: ${(part * 100).toFixed(1)}%"></span></span>` : ""}
        <span class="carte-set-chiffres">
          <span class="num">${compte}</span>
          <span class="num">${complet ? "Complet" : groupe.officiel ? pourcentage.format(part) : ""}</span>
        </span>
      </a>
    </li>`;
}

function afficherSets() {
  const visibles = serieChoisie ? sets.filter((groupe) => groupe.serie?.id === serieChoisie) : sets;
  liste.innerHTML = visibles.map(carteSet).join("");
  liste.removeAttribute("aria-busy");
  for (const bouton of filtre.querySelectorAll("button")) {
    bouton.setAttribute("aria-pressed", String(bouton.dataset.serie === serieChoisie));
  }
}

// Une puce par série présente dans la collection, de la plus récente à la plus ancienne
function afficherFiltre(index) {
  const presentes = new Map();
  for (const groupe of sets) if (groupe.serie) presentes.set(groupe.serie.id, groupe.serie);
  const ordre = index?.series.map((serie) => serie.id) ?? [];
  const series = [...presentes.values()].sort((a, b) => ordre.indexOf(a.id) - ordre.indexOf(b.id));
  if (!series.some((serie) => serie.id === serieChoisie)) serieChoisie = "";
  filtre.hidden = series.length < 2;
  filtre.innerHTML = `<button type="button" data-serie="">Toutes</button>` + series.map((serie) =>
    `<button type="button" class="avec-illustration" data-serie="${echapper(serie.id)}">${illustration(serie.logo)}<span>${echapper(serie.nom)}</span></button>`
  ).join("");
}

filtre.addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("button[data-serie]");
  if (!bouton) return;
  serieChoisie = bouton.dataset.serie;
  history.replaceState(null, "", serieChoisie ? `?serie=${encodeURIComponent(serieChoisie)}` : location.pathname);
  afficherSets();
});

if (collection.length === 0) {
  liste.hidden = true;
  filtre.hidden = true;
  document.getElementById("collection-vide").hidden = false;
} else {
  // Sans la liste TCGdex (pas de connexion), les sets s'affichent quand même, sans série ni logo.
  const index = await getIndex().catch(() => null);
  sets = regrouper(index);
  afficherFiltre(index);
  afficherSets();
}
