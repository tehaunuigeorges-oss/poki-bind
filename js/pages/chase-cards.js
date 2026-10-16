// Mes chase cards : les cartes recherchées, rangées par priorité, avec leur prix actuel, ton prix max
// et ton budget. Une carte sous ton prix max est une « bonne affaire » ; une carte entrée dans la
// collection passe en « Trouvées ». Les prix de plus d'un jour sont remis à jour depuis TCGdex.

import { getChaseCards, modifierChaseCard, retirerChaseCard, choisirBudgetChase, getCollection, PRIORITES } from "../donnees.js";
import { getCarte, variantesDeCarte, imageCarte, VARIANTES } from "../tcgdex.js";
import { echapper, formaterNombre, formaterPrix, annoncer } from "../outils.js";

const UN_JOUR = 20 * 60 * 60 * 1000;
const EN_PARALLELE = 4;

const groupes = document.getElementById("groupes-chase");
const etatMaj = document.getElementById("maj-prix");
const fenetre = document.getElementById("fenetre-modifier");
const champPrixMax = document.getElementById("modifier-prix-max");
const erreurModifier = document.getElementById("erreur-modifier");

let cartes = [];
let budget = null;
let possedees = new Set();
let filtre = "toutes";
let enEdition = null;

const pluriel = (nombre, mot) => `${formaterNombre(nombre)} ${mot}${nombre > 1 ? "s" : ""}`;
const estAffaire = (carte) => carte.prix != null && carte.prix <= carte.prixMax;
const trouvee = (carte) => possedees.has(carte.id);

// ---------- Affichage ----------

function ligne(carte) {
  const numero = carte.set?.officiel ? `${carte.numero}/${carte.set.officiel}` : carte.numero;
  const variante = VARIANTES.find((v) => v.cle === carte.variante);
  const image = imageCarte(carte.image, "low");
  const cardmarket = `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(carte.nom)}`;
  let etat;
  if (trouvee(carte)) {
    etat = '<span class="pilule bonne">Dans ta collection</span>';
  } else if (carte.prix == null) {
    etat = '<span class="pilule">Prix indisponible</span>';
  } else if (estAffaire(carte)) {
    etat = `<span class="pilule bonne"><span aria-hidden="true">↓</span> Sous ton prix max</span>
      <a class="lien-externe" href="${cardmarket}" target="_blank" rel="noopener noreferrer">Voir sur Cardmarket <span aria-hidden="true">↗</span><span class="sr-only"> (nouvel onglet)</span></a>`;
  } else {
    etat = `<span class="pilule chere">+${formaterPrix(carte.prix - carte.prixMax)} au-dessus</span>`;
  }
  return `<li class="ligne-chase${!trouvee(carte) && estAffaire(carte) ? " affaire" : ""}">
      <a class="ligne-chase-carte" href="carte.html?id=${encodeURIComponent(carte.id)}">
        ${image ? `<img class="mini-carte" src="${echapper(image)}" alt="" width="40" height="55" loading="lazy">` : '<span class="mini-carte"></span>'}
        <span class="ligne-chase-texte">
          <span class="ligne-chase-nom">${echapper(carte.nom)}</span>
          <span class="ligne-chase-set">${echapper(`${carte.set?.nom ?? ""} · ${numero}`)}${variante && variante.cle !== "normale" ? ` · ${variante.nom}` : ""}</span>
        </span>
      </a>
      <span class="ligne-chase-valeur"><span class="surtitre">Prix actuel</span><span class="num">${carte.prix == null ? "—" : formaterPrix(carte.prix)}</span></span>
      <span class="ligne-chase-valeur"><span class="surtitre">Ton prix max</span>
        <span class="avec-bouton"><span class="num">${formaterPrix(carte.prixMax)}</span>
          <button class="bouton-crayon" type="button" data-modifier="${echapper(carte.id)}" aria-label="Modifier le prix max et la priorité de ${echapper(carte.nom)}">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/></svg>
          </button></span></span>
      <span class="ligne-chase-etat">${etat}</span>
    </li>`;
}

function afficher() {
  const enCours = cartes.filter((carte) => !trouvee(carte));
  const trouvees = cartes.filter(trouvee);
  const affaires = enCours.filter(estAffaire);
  const total = enCours.reduce((somme, carte) => somme + (carte.prix ?? 0), 0);

  document.getElementById("chase-vide").hidden = cartes.length > 0;
  document.getElementById("chase").hidden = cartes.length === 0;

  document.getElementById("kpi-recherchees").textContent = formaterNombre(enCours.length);
  const hautes = enCours.filter((carte) => carte.priorite === "haute").length;
  document.getElementById("kpi-recherchees-detail").textContent = hautes ? `dont ${formaterNombre(hautes)} en priorité haute` : "aucune en priorité haute";
  document.getElementById("valeur-budget").textContent = budget == null ? "Non fixé" : formaterPrix(budget);
  document.getElementById("kpi-total").textContent = formaterPrix(total);
  const ecart = document.getElementById("kpi-total-detail");
  ecart.className = "kpi-detail";
  if (budget == null) {
    ecart.textContent = "fixe un budget pour comparer";
  } else if (total <= budget) {
    ecart.textContent = `${formaterPrix(budget - total)} sous ton budget`;
    ecart.classList.add("hausse");
  } else {
    ecart.textContent = `${formaterPrix(total - budget)} au-dessus de ton budget`;
    ecart.classList.add("baisse");
  }
  document.getElementById("kpi-affaires").textContent = formaterNombre(affaires.length);

  const visibles = filtre === "affaires" ? affaires : enCours;
  groupes.innerHTML = PRIORITES.map(({ cle, nom }) => {
    const liste = visibles.filter((carte) => carte.priorite === cle)
      .sort((a, b) => Number(estAffaire(b)) - Number(estAffaire(a)) || a.nom.localeCompare(b.nom, "fr"));
    if (!liste.length) return "";
    return `<section class="groupe-chase" aria-labelledby="titre-${cle}">
        <h2 class="titre-priorite" id="titre-${cle}"><span class="pilule${cle === "haute" ? " forte" : ""}">${nom}</span> <span class="num">${pluriel(liste.length, "carte")}</span></h2>
        <ul class="liste-chase">${liste.map(ligne).join("")}</ul>
      </section>`;
  }).join("") || `<p class="aide-resultats">${filtre === "affaires" ? "Aucune carte sous ton prix max pour l'instant." : "Toutes tes chase cards sont trouvées."}</p>`;

  document.getElementById("trouvees").hidden = trouvees.length === 0;
  document.getElementById("nombre-trouvees").textContent = `(${formaterNombre(trouvees.length)})`;
  document.getElementById("liste-trouvees").innerHTML = trouvees.map(ligne).join("");
}

document.getElementById("filtre-chase").addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("button[data-filtre]");
  if (!bouton) return;
  filtre = bouton.dataset.filtre;
  for (const b of document.querySelectorAll("#filtre-chase button")) b.setAttribute("aria-pressed", String(b === bouton));
  afficher();
});

// ---------- Budget ----------

const formulaireBudget = document.getElementById("formulaire-budget");
const champBudget = document.getElementById("champ-budget");
const boutonBudget = document.getElementById("bouton-budget");

function editerBudget(oui) {
  formulaireBudget.hidden = !oui;
  document.getElementById("valeur-budget").hidden = oui;
  boutonBudget.hidden = oui;
  if (oui) {
    champBudget.value = budget ?? "";
    champBudget.focus();
  } else {
    boutonBudget.focus();
  }
}
boutonBudget.addEventListener("click", () => editerBudget(true));
document.getElementById("annuler-budget").addEventListener("click", () => editerBudget(false));
formulaireBudget.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const valeur = Number(String(champBudget.value).replace(",", "."));
  budget = champBudget.value === "" ? null : Math.max(0, Math.round(valeur * 100) / 100);
  if (Number.isNaN(budget)) budget = null;
  await choisirBudgetChase(budget);
  editerBudget(false);
  afficher();
  annoncer(budget == null ? "Budget retiré." : `Budget fixé à ${formaterPrix(budget)}.`);
});

// ---------- Modifier une chase card ----------

document.getElementById("contenu").addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("[data-modifier]");
  if (!bouton) return;
  enEdition = cartes.find((carte) => carte.id === bouton.dataset.modifier);
  document.getElementById("titre-modifier").textContent = enEdition.nom;
  champPrixMax.value = enEdition.prixMax;
  champPrixMax.removeAttribute("aria-invalid");
  erreurModifier.textContent = "";
  document.getElementById("modifier-aide").textContent = enEdition.prix == null
    ? "Prix actuel indisponible." : `Prix actuel : ${formaterPrix(enEdition.prix)}.`;
  fenetre.querySelector(`input[name=priorite][value="${enEdition.priorite}"]`).checked = true;
  fenetre.showModal();
  champPrixMax.focus();
});

document.getElementById("formulaire-modifier").addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const prixMax = Number(String(champPrixMax.value).replace(",", "."));
  if (!champPrixMax.value || !(prixMax > 0)) {
    erreurModifier.textContent = "Indique un prix maximum supérieur à 0 €.";
    champPrixMax.setAttribute("aria-invalid", "true");
    champPrixMax.focus();
    return;
  }
  const id = enEdition.id;
  Object.assign(enEdition, await modifierChaseCard(id, {
    prixMax: Math.round(prixMax * 100) / 100,
    priorite: fenetre.querySelector("input[name=priorite]:checked").value,
  }));
  fenetre.close();
  afficher();
  annoncer(`${enEdition.nom} : prix max ${formaterPrix(enEdition.prixMax)}.`);
  document.querySelector(`[data-modifier="${CSS.escape(id)}"]`)?.focus();
});

document.getElementById("annuler-modifier").addEventListener("click", () => fenetre.close());
document.getElementById("retirer-chase").addEventListener("click", async () => {
  await retirerChaseCard(enEdition.id);
  cartes = cartes.filter((carte) => carte.id !== enEdition.id);
  fenetre.close();
  afficher();
  annoncer(`${enEdition.nom} n'est plus dans tes chase cards.`);
  document.querySelector("#filtre-chase button")?.focus();
});

// ---------- Mise à jour des prix ----------

async function mettreAJourLesPrix() {
  const maintenant = Date.now();
  const anciennes = cartes.filter((carte) => !trouvee(carte) && (!carte.prixLe || maintenant - new Date(carte.prixLe).getTime() > UN_JOUR));
  if (!anciennes.length) return;
  let faites = 0;
  let ratees = 0;
  const etat = () => { etatMaj.textContent = `Mise à jour des prix : ${formaterNombre(faites)} / ${formaterNombre(anciennes.length)}…`; };
  etat();
  const file = [...anciennes];
  async function ouvrier() {
    while (file.length) {
      const carte = file.shift();
      try {
        const variante = variantesDeCarte(await getCarte(carte.id)).find((v) => v.cle === carte.variante);
        Object.assign(carte, await modifierChaseCard(carte.id, { prix: variante?.prix?.tendance ?? null, prixLe: new Date().toISOString() }));
      } catch (erreur) {
        ratees += 1;
      }
      faites += 1;
      etat();
    }
  }
  await Promise.all(Array.from({ length: EN_PARALLELE }, ouvrier));
  etatMaj.textContent = ratees
    ? `${formaterNombre(ratees)} prix n'${ratees > 1 ? "ont" : "a"} pas pu être mis à jour : le dernier prix connu est affiché.`
    : "Prix mis à jour.";
}

// ---------- Chargement ----------

const [chase, collection] = await Promise.all([getChaseCards(), getCollection()]);
cartes = chase.cartes;
budget = chase.budget;
possedees = new Set(collection.map((entree) => entree.id));
afficher();
await mettreAJourLesPrix();
afficher();
