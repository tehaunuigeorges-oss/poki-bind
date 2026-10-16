// Ma collection scellée : produits jamais ouverts, avec quantité, prix d'achat et revente estimée saisis
// par l'utilisateur (Pokibind ne donne aucun prix pour le scellé). Les produits viennent du catalogue
// js/catalogue-scelle.js, ou sont ajoutés à la main (« produit libre »).

import { getScelle, ajouterScelle, modifierScelle, retirerScelle, valeurScelle, getCollection, nombreExemplaires, valeurEntree } from "../donnees.js";
import { CATALOGUE_SCELLE, TYPES_SCELLE } from "../catalogue-scelle.js";
import { echapper, normaliser, formaterNombre, formaterPrix, annoncer } from "../outils.js";

const PAR_LOT = 40;
const COULEURS = ["eau", "plante", "feu", "electrique", "psy", "fee", "obscurite", "metal", "combat", "dragon"];
const PLURIELS = { Booster: "Boosters", Display: "Displays", Tripack: "Tripacks", "Coffret Dresseur d'Élite": "Coffrets Dresseur d'Élite", Coffret: "Coffrets", "Pokébox": "Pokébox" };

const grille = document.getElementById("grille-scelle");
const filtre = document.getElementById("filtre-types");
const fenetreAjout = document.getElementById("fenetre-ajout");
const fenetreProduit = document.getElementById("fenetre-produit");
const champRecherche = document.getElementById("requete-scelle");
const choixType = document.getElementById("type-scelle");
const listeCatalogue = document.getElementById("liste-catalogue");
const plusCatalogue = document.getElementById("plus-catalogue");

let produits = [];
let valeurCartes = 0;
let typeChoisi = "";
let trouves = [];
let montres = 0;
let enCours = null; // { mode: "ajout" | "modif", produit }
let minuterie = 0;

const pluriel = (nombre, mot, motPluriel = `${mot}s`) => `${formaterNombre(nombre)} ${nombre > 1 ? motPluriel : mot}`;
const prix = (valeur) => (valeur == null ? "—" : `${formaterPrix(valeur)} / pièce`);

// Couleur de la boîte dessinée : la même pour un même produit
function couleur(produit) {
  let somme = 0;
  for (const caractere of produit.set || produit.nom) somme = (somme * 31 + caractere.charCodeAt(0)) % 9973;
  return COULEURS[somme % COULEURS.length];
}

const formeDe = (type) => ({ Booster: "booster", Display: "display", Tripack: "tripack", "Coffret Dresseur d'Élite": "etb", Coffret: "coffret", "Pokébox": "pokebox" })[type] ?? "coffret";

// ---------- Produits ----------

function tuile(produit) {
  const gain = produit.achat != null && produit.revente != null ? (produit.revente - produit.achat) * produit.quantite : null;
  return `<li class="produit">
      <div class="produit-visuel">
        <span class="pilule num quantite-pilule">× ${formaterNombre(produit.quantite)}</span>
        <span class="boite ${formeDe(produit.type)}" style="--teinte: var(--${couleur(produit)})" aria-hidden="true"></span>
      </div>
      <div class="produit-corps">
        <div class="produit-titre">
          <h2 class="produit-nom">${echapper(produit.nom)}</h2>
          <p class="produit-type">${echapper(produit.type)}${produit.catalogue ? "" : " · ajouté à la main"}</p>
        </div>
        <dl class="produit-prix num">
          <div><dt class="surtitre">Prix d'achat</dt><dd>${prix(produit.achat)}</dd></div>
          <div><dt class="surtitre">Ta revente estimée</dt><dd>${prix(produit.revente)}</dd></div>
        </dl>
        <div class="produit-pied">
          <span class="num ${gain > 0 ? "hausse" : gain < 0 ? "baisse" : ""}">${gain == null ? "" : `${gain >= 0 ? "+" : "−"}${formaterPrix(Math.abs(gain))} au total`}</span>
          <button class="bouton bouton-secondaire bouton-mini" type="button" data-modifier="${echapper(produit.id)}" aria-label="Modifier ${echapper(produit.nom)}">Modifier</button>
        </div>
      </div>
    </li>`;
}

function afficher() {
  const quantite = produits.reduce((somme, p) => somme + p.quantite, 0);
  const achat = produits.reduce((somme, p) => somme + p.quantite * (p.achat ?? 0), 0);
  const valeur = valeurScelle(produits);
  document.getElementById("kpi-produits").textContent = formaterNombre(quantite);
  document.getElementById("kpi-produits-detail").textContent = pluriel(produits.length, "référence différente", "références différentes");
  document.getElementById("kpi-achat").textContent = formaterPrix(achat);
  document.getElementById("kpi-valeur").textContent = formaterPrix(valeur);
  document.getElementById("kpi-valeur-detail").textContent = `ta revente estimée · comptée dans ta valeur totale (${formaterPrix(valeur + valeurCartes)})`;
  document.getElementById("onglet-scelle").textContent = quantite ? formaterNombre(quantite) : "";

  const presents = TYPES_SCELLE.filter((type) => produits.some((p) => p.type === type));
  if (!presents.includes(typeChoisi)) typeChoisi = "";
  filtre.hidden = presents.length < 2;
  filtre.innerHTML = `<button type="button" data-type="" aria-pressed="${typeChoisi === ""}">Tout</button>`
    + presents.map((type) => `<button type="button" data-type="${echapper(type)}" aria-pressed="${type === typeChoisi}">${PLURIELS[type] ?? type}</button>`).join("");

  const visibles = produits.filter((p) => !typeChoisi || p.type === typeChoisi)
    .sort((a, b) => TYPES_SCELLE.indexOf(a.type) - TYPES_SCELLE.indexOf(b.type) || a.nom.localeCompare(b.nom, "fr"));
  grille.innerHTML = visibles.map(tuile).join("");
  grille.hidden = produits.length === 0;
  document.getElementById("scelle-vide").hidden = produits.length > 0;
}

filtre.addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("button[data-type]");
  if (!bouton) return;
  typeChoisi = bouton.dataset.type;
  afficher();
  filtre.querySelector(`[data-type="${CSS.escape(typeChoisi)}"]`)?.focus();
});

// ---------- Choisir un produit dans le catalogue ----------

choixType.insertAdjacentHTML("beforeend", TYPES_SCELLE.map((type) => `<option value="${echapper(type)}">${PLURIELS[type] ?? type}</option>`).join(""));
document.getElementById("type-libre").innerHTML = TYPES_SCELLE.map((type) => `<option>${echapper(type)}</option>`).join("");
const cles = new Map(CATALOGUE_SCELLE.map((p) => [p.id, normaliser(`${p.nom} ${p.type}`)]));

function ligneCatalogue(produit) {
  const deja = produits.some((p) => p.catalogue === produit.id);
  return `<li><button class="choix-catalogue" type="button" data-catalogue="${produit.id}">
      <span class="boite mini ${formeDe(produit.type)}" style="--teinte: var(--${couleur(produit)})" aria-hidden="true"></span>
      <span class="choix-catalogue-texte"><span>${echapper(produit.nom)}</span><small>${echapper(produit.type)}${deja ? " · déjà dans ta collection" : ""}</small></span>
    </button></li>`;
}

function montrerJusqua(nombre) {
  const debut = montres;
  montres = Math.min(nombre, trouves.length);
  listeCatalogue.insertAdjacentHTML("beforeend", trouves.slice(debut, montres).map(ligneCatalogue).join(""));
  plusCatalogue.hidden = montres >= trouves.length;
  return debut;
}

function chercher() {
  clearTimeout(minuterie);
  const mots = normaliser(champRecherche.value).split(" ").filter(Boolean);
  trouves = CATALOGUE_SCELLE.filter((p) => (!choixType.value || p.type === choixType.value) && mots.every((mot) => cles.get(p.id).includes(mot)));
  document.getElementById("resume-catalogue").textContent = trouves.length ? pluriel(trouves.length, "produit") : "Aucun produit trouvé";
  listeCatalogue.innerHTML = "";
  montres = 0;
  montrerJusqua(PAR_LOT);
}

function ouvrirCatalogue() {
  champRecherche.value = "";
  fenetreAjout.showModal();
  champRecherche.focus();
  chercher();
}

champRecherche.addEventListener("input", () => {
  clearTimeout(minuterie);
  minuterie = setTimeout(chercher, 200);
});
choixType.addEventListener("change", chercher);
document.getElementById("recherche-scelle").addEventListener("submit", (evenement) => {
  evenement.preventDefault();
  chercher();
});
plusCatalogue.addEventListener("click", () => {
  const debut = montrerJusqua(montres + PAR_LOT);
  listeCatalogue.children[debut]?.querySelector("button")?.focus();
});
listeCatalogue.addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("[data-catalogue]");
  if (!bouton) return;
  const produit = CATALOGUE_SCELLE.find((p) => p.id === bouton.dataset.catalogue);
  fenetreAjout.close();
  ouvrirFiche({ mode: "ajout", produit: { catalogue: produit.id, nom: produit.nom, type: produit.type, set: produit.set, quantite: 1, achat: null, revente: null } });
});
document.getElementById("produit-libre").addEventListener("click", () => {
  fenetreAjout.close();
  ouvrirFiche({ mode: "ajout", produit: { catalogue: "", nom: champRecherche.value.trim(), type: choixType.value || "Coffret", set: "", quantite: 1, achat: null, revente: null } });
});
document.getElementById("fermer-ajout").addEventListener("click", () => fenetreAjout.close());

// ---------- Quantité et prix d'un produit ----------

const champNom = document.getElementById("nom-libre");
const champTypeLibre = document.getElementById("type-libre");
const champQuantite = document.getElementById("quantite-produit");
const champAchat = document.getElementById("achat-produit");
const champRevente = document.getElementById("revente-produit");

function ouvrirFiche(etat) {
  enCours = etat;
  const { produit, mode } = etat;
  const libre = !produit.catalogue;
  document.getElementById("titre-produit").textContent = mode === "ajout" ? (libre ? "Produit ajouté à la main" : "Ajouter ce produit") : "Modifier le produit";
  document.getElementById("produit-choisi").textContent = libre ? "" : `${produit.nom} · ${produit.type}`;
  document.getElementById("produit-choisi").hidden = libre;
  document.getElementById("groupe-nom-libre").hidden = !libre;
  document.getElementById("groupe-type-libre").hidden = !libre;
  champNom.value = produit.nom;
  champTypeLibre.value = produit.type;
  champQuantite.value = produit.quantite;
  champAchat.value = produit.achat ?? "";
  champRevente.value = produit.revente ?? "";
  for (const id of ["erreur-nom-libre", "erreur-quantite", "erreur-prix"]) document.getElementById(id).textContent = "";
  for (const champ of [champNom, champQuantite, champAchat, champRevente]) champ.removeAttribute("aria-invalid");
  document.getElementById("enregistrer-produit").textContent = mode === "ajout" ? "Ajouter" : "Enregistrer";
  document.getElementById("retirer-produit").hidden = mode === "ajout";
  fenetreProduit.showModal();
  (libre ? champNom : champQuantite).focus();
}

const lirePrix = (champ) => (champ.value === "" ? null : Math.round(Number(String(champ.value).replace(",", ".")) * 100) / 100);

document.getElementById("formulaire-produit").addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const libre = !enCours.produit.catalogue;
  const nom = libre ? champNom.value.trim() : enCours.produit.nom;
  const quantite = Number(champQuantite.value);
  const achat = lirePrix(champAchat);
  const revente = lirePrix(champRevente);
  let premierInvalide = null;
  const signaler = (champ, idErreur, message) => {
    document.getElementById(idErreur).textContent = message;
    champ.setAttribute("aria-invalid", "true");
    premierInvalide ??= champ;
  };
  for (const id of ["erreur-nom-libre", "erreur-quantite", "erreur-prix"]) document.getElementById(id).textContent = "";
  for (const champ of [champNom, champQuantite, champAchat, champRevente]) champ.removeAttribute("aria-invalid");
  if (libre && !nom) signaler(champNom, "erreur-nom-libre", "Donne un nom au produit.");
  if (!Number.isInteger(quantite) || quantite < 1 || quantite > 999) signaler(champQuantite, "erreur-quantite", "Indique une quantité entre 1 et 999.");
  if (achat != null && !(achat >= 0)) signaler(champAchat, "erreur-prix", "Les prix doivent être des nombres positifs.");
  if (revente != null && !(revente >= 0)) signaler(champRevente, "erreur-prix", "Les prix doivent être des nombres positifs.");
  if (premierInvalide) {
    premierInvalide.focus();
    return;
  }
  const donnees = { nom, type: libre ? champTypeLibre.value : enCours.produit.type, quantite, achat, revente };
  try {
    if (enCours.mode === "ajout") {
      produits.push(await ajouterScelle({ ...enCours.produit, ...donnees }));
      annoncer(`${nom} ajouté à ta collection scellée.`);
    } else {
      Object.assign(enCours.produit, await modifierScelle(enCours.produit.id, donnees));
      annoncer(`${nom} modifié.`);
    }
  } catch (erreur) {
    document.getElementById("erreur-prix").textContent = "Impossible d'enregistrer : le stockage de ton navigateur est bloqué ou plein.";
    return;
  }
  const id = enCours.mode === "ajout" ? produits.at(-1).id : enCours.produit.id;
  fenetreProduit.close();
  afficher();
  grille.querySelector(`[data-modifier="${CSS.escape(id)}"]`)?.focus();
});

document.getElementById("annuler-produit").addEventListener("click", () => fenetreProduit.close());
document.getElementById("retirer-produit").addEventListener("click", async () => {
  const { produit } = enCours;
  if (!confirm(`Retirer « ${produit.nom} » de ta collection scellée ?`)) return;
  await retirerScelle(produit.id);
  produits = produits.filter((p) => p.id !== produit.id);
  fenetreProduit.close();
  afficher();
  annoncer(`${produit.nom} retiré.`);
  document.getElementById("bouton-ajouter").focus();
});

grille.addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("[data-modifier]");
  if (bouton) ouvrirFiche({ mode: "modif", produit: produits.find((p) => p.id === bouton.dataset.modifier) });
});
document.getElementById("bouton-ajouter").addEventListener("click", ouvrirCatalogue);
document.getElementById("bouton-ajouter-vide").addEventListener("click", ouvrirCatalogue);

// ---------- Chargement ----------

const [scelle, collection] = await Promise.all([getScelle(), getCollection()]);
produits = scelle.map((p) => ({ ...p, quantite: Number(p.quantite) || 1 }));
valeurCartes = collection.reduce((somme, entree) => somme + valeurEntree(entree), 0);
const exemplaires = collection.reduce((somme, entree) => somme + nombreExemplaires(entree), 0);
document.getElementById("onglet-cartes").textContent = exemplaires ? formaterNombre(exemplaires) : "";
afficher();
