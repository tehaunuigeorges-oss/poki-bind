// Ma collection scellée : produits jamais ouverts, ajoutés à la main par l'utilisateur (nom, type,
// série, quantité, prix d'achat et revente estimée). Pokibind ne propose aucun produit ni aucun prix.

import { getScelle, ajouterScelle, modifierScelle, retirerScelle, valeurScelle, getCollection, nombreExemplaires, valeurEntree } from "../donnees.js";
import { getSeries } from "../tcgdex.js";
import { echapper, formaterNombre, formaterPrix, annoncer } from "../outils.js";

const TYPES = ["Booster", "Display", "Tripack", "Coffret Dresseur d'Élite", "Coffret", "Pokébox", "Autre"];
const PLURIELS = { Booster: "Boosters", Display: "Displays", Tripack: "Tripacks", "Coffret Dresseur d'Élite": "Coffrets Dresseur d'Élite", Coffret: "Coffrets", "Pokébox": "Pokébox", Autre: "Autres" };
const FORMES = { Booster: "booster", Display: "display", Tripack: "tripack", "Coffret Dresseur d'Élite": "etb", Coffret: "coffret", "Pokébox": "pokebox" };
const COULEURS = ["eau", "plante", "feu", "electrique", "psy", "fee", "obscurite", "metal", "combat", "dragon"];

const grille = document.getElementById("grille-scelle");
const filtre = document.getElementById("filtre-types");
const fenetre = document.getElementById("fenetre-produit");
const champNom = document.getElementById("nom-produit");
const champType = document.getElementById("type-produit");
const champSerie = document.getElementById("serie-produit");
const champQuantite = document.getElementById("quantite-produit");
const champAchat = document.getElementById("achat-produit");
const champRevente = document.getElementById("revente-produit");

let produits = [];
let series = [];
let valeurCartes = 0;
let typeChoisi = "";
let enEdition = null; // produit modifié dans la fenêtre (null : ajout)

const pluriel = (nombre, mot, motPluriel = `${mot}s`) => `${formaterNombre(nombre)} ${nombre > 1 ? motPluriel : mot}`;
const prix = (valeur) => (valeur == null ? "—" : `${formaterPrix(valeur)} / pièce`);
const nomSerie = (id) => series.find((serie) => serie.id === id)?.nom ?? "";

// Couleur de la boîte dessinée : la même pour un même produit
function couleur(produit) {
  let somme = 0;
  for (const caractere of produit.nom) somme = (somme * 31 + caractere.charCodeAt(0)) % 9973;
  return COULEURS[somme % COULEURS.length];
}

// ---------- Produits ----------

function tuile(produit) {
  const gain = produit.achat != null && produit.revente != null ? (produit.revente - produit.achat) * produit.quantite : null;
  const details = [produit.type, nomSerie(produit.serie)].filter(Boolean).join(" · ");
  return `<li class="produit">
      <div class="produit-visuel">
        <span class="pilule num quantite-pilule">× ${formaterNombre(produit.quantite)}</span>
        <span class="boite ${FORMES[produit.type] ?? "coffret"}" style="--teinte: var(--${couleur(produit)})" aria-hidden="true"></span>
      </div>
      <div class="produit-corps">
        <div class="produit-titre">
          <h2 class="produit-nom">${echapper(produit.nom)}</h2>
          <p class="produit-type">${echapper(details)}</p>
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

  const presents = TYPES.filter((type) => produits.some((p) => p.type === type));
  if (!presents.includes(typeChoisi)) typeChoisi = "";
  filtre.hidden = presents.length < 2;
  filtre.innerHTML = `<button type="button" data-type="" aria-pressed="${typeChoisi === ""}">Tout</button>`
    + presents.map((type) => `<button type="button" data-type="${echapper(type)}" aria-pressed="${type === typeChoisi}">${PLURIELS[type]}</button>`).join("");

  const visibles = produits.filter((p) => !typeChoisi || p.type === typeChoisi)
    .sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.nom.localeCompare(b.nom, "fr"));
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

// ---------- Fenêtre : ajouter ou modifier un produit ----------

champType.innerHTML = TYPES.map((type) => `<option>${echapper(type)}</option>`).join("");

function remplirSeries(selection) {
  const connue = series.some((serie) => serie.id === selection);
  champSerie.innerHTML = `<option value="">Non précisée</option>`
    + series.map((serie) => `<option value="${echapper(serie.id)}">${echapper(serie.nom)}</option>`).join("")
    + (selection && !connue ? `<option value="${echapper(selection)}">${echapper(selection)}</option>` : "");
  champSerie.value = selection ?? "";
}

function effacerErreurs() {
  for (const id of ["erreur-nom", "erreur-quantite", "erreur-prix"]) document.getElementById(id).textContent = "";
  for (const champ of [champNom, champQuantite, champAchat, champRevente]) champ.removeAttribute("aria-invalid");
}

function ouvrirFenetre(produit = null) {
  enEdition = produit;
  document.getElementById("titre-produit").textContent = produit ? "Modifier le produit" : "Ajouter un produit scellé";
  champNom.value = produit?.nom ?? "";
  champType.value = TYPES.includes(produit?.type) ? produit.type : "Display";
  remplirSeries(produit?.serie ?? "");
  champQuantite.value = produit?.quantite ?? 1;
  champAchat.value = produit?.achat ?? "";
  champRevente.value = produit?.revente ?? "";
  effacerErreurs();
  document.getElementById("enregistrer-produit").textContent = produit ? "Enregistrer" : "Ajouter";
  document.getElementById("retirer-produit").hidden = !produit;
  fenetre.showModal();
  champNom.focus();
}

const lirePrix = (champ) => (champ.value === "" ? null : Math.round(Number(String(champ.value).replace(",", ".")) * 100) / 100);

document.getElementById("formulaire-produit").addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const nom = champNom.value.trim();
  const quantite = Number(champQuantite.value);
  const achat = lirePrix(champAchat);
  const revente = lirePrix(champRevente);
  effacerErreurs();
  let premierInvalide = null;
  const signaler = (champ, idErreur, message) => {
    document.getElementById(idErreur).textContent = message;
    champ.setAttribute("aria-invalid", "true");
    premierInvalide ??= champ;
  };
  if (!nom) signaler(champNom, "erreur-nom", "Donne un nom au produit.");
  if (!Number.isInteger(quantite) || quantite < 1 || quantite > 999) signaler(champQuantite, "erreur-quantite", "Indique une quantité entre 1 et 999.");
  if (achat != null && !(achat >= 0)) signaler(champAchat, "erreur-prix", "Les prix doivent être des nombres positifs.");
  if (revente != null && !(revente >= 0)) signaler(champRevente, "erreur-prix", "Les prix doivent être des nombres positifs.");
  if (premierInvalide) {
    premierInvalide.focus();
    return;
  }
  const donnees = { nom, type: champType.value, serie: champSerie.value, quantite, achat, revente };
  let id;
  try {
    if (enEdition) {
      Object.assign(enEdition, await modifierScelle(enEdition.id, donnees));
      id = enEdition.id;
      annoncer(`${nom} modifié.`);
    } else {
      const produit = await ajouterScelle(donnees);
      produits.push(produit);
      id = produit.id;
      annoncer(`${nom} ajouté à ta collection scellée.`);
    }
  } catch (erreur) {
    document.getElementById("erreur-prix").textContent = "Impossible d'enregistrer : le stockage de ton navigateur est bloqué ou plein.";
    return;
  }
  fenetre.close();
  afficher();
  grille.querySelector(`[data-modifier="${CSS.escape(id)}"]`)?.focus();
});

document.getElementById("annuler-produit").addEventListener("click", () => fenetre.close());
document.getElementById("retirer-produit").addEventListener("click", async () => {
  const produit = enEdition;
  if (!confirm(`Retirer « ${produit.nom} » de ta collection scellée ?`)) return;
  await retirerScelle(produit.id);
  produits = produits.filter((p) => p.id !== produit.id);
  fenetre.close();
  afficher();
  annoncer(`${produit.nom} retiré.`);
  document.getElementById("bouton-ajouter").focus();
});

grille.addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("[data-modifier]");
  if (bouton) ouvrirFenetre(produits.find((p) => p.id === bouton.dataset.modifier));
});
document.getElementById("bouton-ajouter").addEventListener("click", () => ouvrirFenetre());
document.getElementById("bouton-ajouter-vide").addEventListener("click", () => ouvrirFenetre());

// ---------- Chargement ----------

const [scelle, collection] = await Promise.all([getScelle(), getCollection()]);
produits = scelle.map((p) => ({ ...p, quantite: Number(p.quantite) || 1 }));
valeurCartes = collection.reduce((somme, entree) => somme + valeurEntree(entree), 0);
const exemplaires = collection.reduce((somme, entree) => somme + nombreExemplaires(entree), 0);
document.getElementById("onglet-cartes").textContent = exemplaires ? formaterNombre(exemplaires) : "";
afficher();
// Les noms des séries viennent de TCGdex ; sans connexion, le choix reste « Non précisée ».
series = await getSeries().catch(() => []);
afficher();
