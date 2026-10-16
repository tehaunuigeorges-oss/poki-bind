// Toutes les données de l'utilisateur passent par ce fichier.
// Version 1 : elles sont gardées dans le navigateur (localStorage).
// Plus tard, ces mêmes fonctions liront et écriront dans Supabase.
// Elles sont déjà asynchrones (à utiliser avec await) : les pages n'auront pas à changer.

const PREFIXE = "pokibind-";

function lire(cle, valeurParDefaut) {
  try {
    const texte = localStorage.getItem(PREFIXE + cle);
    return texte === null ? valeurParDefaut : JSON.parse(texte);
  } catch (erreur) {
    return valeurParDefaut;
  }
}

// Lève une erreur si le navigateur refuse d'enregistrer (stockage bloqué ou plein).
function ecrire(cle, valeur) {
  localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur));
}

// ---------- Session (façade en v1 : aucun mot de passe n'est vérifié ni enregistré) ----------
// « Rester connecté » coché : la session est gardée dans localStorage (elle survit à la fermeture
// du navigateur) ; sinon dans sessionStorage (elle disparaît quand on ferme le navigateur).

const CLE_SESSION = PREFIXE + "session";

function lireSession() {
  for (const stockage of ["localStorage", "sessionStorage"]) {
    try {
      const texte = window[stockage].getItem(CLE_SESSION);
      if (texte) return JSON.parse(texte);
    } catch (erreur) {
      // Stockage bloqué (navigation privée…) : on essaie le suivant.
    }
  }
  return null;
}

export async function estConnecte() {
  return lireSession() !== null;
}

// Lève une erreur si le navigateur refuse d'enregistrer (stockage bloqué).
export async function seConnecter({ email = "", pseudo = "", resterConnecte = true } = {}) {
  const session = { email, pseudo, connecteLe: new Date().toISOString() };
  window[resterConnecte ? "localStorage" : "sessionStorage"].setItem(CLE_SESSION, JSON.stringify(session));
  return session;
}

export async function seDeconnecter() {
  for (const stockage of ["localStorage", "sessionStorage"]) {
    try {
      window[stockage].removeItem(CLE_SESSION);
    } catch (erreur) {
      // Rien à effacer dans ce stockage.
    }
  }
}

// ---------- Profil ----------

// null tant que le profil n'a pas été créé (étape 10).
export async function getProfil() {
  return lire("profil", null);
}

// ---------- Pièces ----------

export async function getPieces() {
  return lire("pieces", 0);
}

// ---------- Collection ----------
// Une entrée par carte, avec le nombre d'exemplaires de chaque variante :
// { "sv08.5-074": { id, nom, numero, image, set: { id, nom, officiel }, langue: "fr",
//                   variantes: { normale: 1, reverse: 2 }, prix: { normale: 0.02, … }, prixLe, ajouteeLe } }
// Variantes : normale, reverse, holo, pokeball, masterball (voir VARIANTES dans tcgdex.js).

const MAX_EXEMPLAIRES = 999;

export async function getCollection() {
  return Object.values(lire("collection", {}));
}

// L'entrée d'une carte, ou null si elle n'est pas dans la collection.
export async function getCarteDeCollection(id) {
  return lire("collection", {})[id] ?? null;
}

// Ajoute des exemplaires d'une variante. « carte » : le résumé de la carte (resumeCarte dans tcgdex.js),
// qui remet aussi à jour ses informations et ses prix. Renvoie l'entrée mise à jour.
export async function ajouterCarte(carte, variante, nombre = 1) {
  return modifierExemplaires(carte.id, variante, nombre, carte);
}

// Retire des exemplaires d'une variante ; la carte quitte la collection quand il n'en reste aucun.
// Renvoie l'entrée mise à jour, ou null si la carte n'est plus dans la collection.
export async function retirerCarte(id, variante, nombre = 1) {
  return modifierExemplaires(id, variante, -nombre);
}

// Remet à jour les informations et les prix d'une carte de la collection, sans toucher à ses exemplaires.
export async function majCarte(resume) {
  const collection = lire("collection", {});
  const entree = collection[resume.id];
  if (!entree) return null;
  Object.assign(entree, resume, { variantes: entree.variantes, ajouteeLe: entree.ajouteeLe });
  ecrire("collection", collection);
  return entree;
}

function modifierExemplaires(id, variante, difference, resume = null) {
  const collection = lire("collection", {});
  const entree = collection[id] ?? (resume && { variantes: {}, ajouteeLe: new Date().toISOString() });
  if (!entree) return null;
  if (resume) Object.assign(entree, resume);

  const quantite = Math.min(MAX_EXEMPLAIRES, Math.max(0, (entree.variantes[variante] ?? 0) + difference));
  if (quantite > 0) entree.variantes[variante] = quantite;
  else delete entree.variantes[variante];

  if (Object.keys(entree.variantes).length > 0) collection[id] = entree;
  else delete collection[id];
  ecrire("collection", collection);
  return collection[id] ?? null;
}

// Nombre d'exemplaires d'une carte de la collection, toutes variantes confondues.
export function nombreExemplaires(entree) {
  return Object.values(entree.variantes).reduce((somme, nombre) => somme + nombre, 0);
}

// Valeur d'une carte de la collection : exemplaires × dernier prix connu de chaque variante
// (les variantes sans prix comptent pour 0).
export function valeurEntree(entree) {
  return Object.entries(entree.variantes).reduce((somme, [variante, nombre]) => somme + nombre * (entree.prix?.[variante] ?? 0), 0);
}

// ---------- Binders ----------
// binders : { libres: [{ id, nom, couverture, cartes: [résumé de carte ou null, …], creeLe }] }
// cartes[i] est la pochette i (9 par page : 0 à 8 sur la page 1…) ; null = pochette vide.
// Seules les cartes de la collection vont dans un binder, et pas plus d'exemplaires que ceux possédés
// (tous binders confondus) : comme un vrai classeur.

// Erreur de placement : raison "non-possedee" (carte absente de la collection) ou "deja-placee"
// (tous ses exemplaires sont déjà dans des binders).
export class ErreurBinder extends Error {
  constructor(raison) {
    super(`Binder : ${raison}`);
    this.raison = raison;
  }
}

// Nombre de pochettes occupées par une carte, dans tous les binders.
export function placementsDe(libres, id) {
  return libres.reduce((somme, binder) => somme + binder.cartes.filter((carte) => carte?.id === id).length, 0);
}

function lireBinders() {
  const binders = lire("binders", {});
  return { libres: Array.isArray(binders.libres) ? binders.libres : [] };
}

export async function getBinders() {
  return lireBinders();
}

export async function creerBinder({ nom, couverture }) {
  const binders = lireBinders();
  const binder = { id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nom, couverture, cartes: [], creeLe: new Date().toISOString() };
  binders.libres.push(binder);
  ecrire("binders", binders);
  return binder;
}

// changements : { nom, couverture } (l'un ou l'autre). Renvoie le binder modifié, ou null s'il n'existe plus.
export async function modifierBinder(id, changements) {
  const binders = lireBinders();
  const binder = binders.libres.find((b) => b.id === id);
  if (!binder) return null;
  if (changements.nom !== undefined) binder.nom = changements.nom;
  if (changements.couverture !== undefined) binder.couverture = changements.couverture;
  ecrire("binders", binders);
  return binder;
}

export async function supprimerBinder(id) {
  const binders = lireBinders();
  binders.libres = binders.libres.filter((b) => b.id !== id);
  ecrire("binders", binders);
}

function binderModifiable(binders, idBinder) {
  const binder = binders.libres.find((b) => b.id === idBinder);
  if (!binder) throw new Error("Binder introuvable");
  binder.cartes = Array.from(binder.cartes, (carte) => carte ?? null);
  return binder;
}

// Les pochettes vides en fin de binder ne sont pas gardées.
function tasser(binder) {
  while (binder.cartes.length && !binder.cartes.at(-1)) binder.cartes.pop();
}

// Nombre de cartes d'un binder (pochettes remplies).
export function nombreDeCartes(binder) {
  return binder.cartes.filter(Boolean).length;
}

// Place une carte (résumé, voir resumeCarte dans tcgdex.js) dans la pochette demandée si elle est vide,
// sinon dans la première pochette vide. Renvoie sa position (0 = première pochette).
export async function placerCarte(idBinder, carte, position = null) {
  const binders = lireBinders();
  const binder = binderModifiable(binders, idBinder);
  const entree = lire("collection", {})[carte.id];
  if (!entree) throw new ErreurBinder("non-possedee");
  if (placementsDe(binders.libres, carte.id) >= nombreExemplaires(entree)) throw new ErreurBinder("deja-placee");
  let place = position !== null && position >= 0 && !binder.cartes[position] ? position : binder.cartes.indexOf(null);
  if (place < 0) place = binder.cartes.length;
  while (binder.cartes.length < place) binder.cartes.push(null);
  binder.cartes[place] = carte;
  ecrire("binders", binders);
  return place;
}

// Déplace la carte d'une pochette vers une autre ; si l'autre est occupée, les deux cartes s'échangent.
export async function deplacerCarte(idBinder, depart, arrivee) {
  const binders = lireBinders();
  const binder = binderModifiable(binders, idBinder);
  while (binder.cartes.length <= Math.max(depart, arrivee)) binder.cartes.push(null);
  [binder.cartes[depart], binder.cartes[arrivee]] = [binder.cartes[arrivee], binder.cartes[depart]];
  tasser(binder);
  ecrire("binders", binders);
  return binder;
}

// Vide une pochette : les autres cartes ne bougent pas.
export async function retirerDuBinder(idBinder, position) {
  const binders = lireBinders();
  const binder = binderModifiable(binders, idBinder);
  binder.cartes[position] = null;
  tasser(binder);
  ecrire("binders", binders);
  return binder;
}

// Couvertures illustrées débloquées dans la boutique (aucune tant qu'elle n'est pas ouverte).
export async function getCouverturesDebloquees() {
  return lire("couvertures", []);
}

// ---------- Scellé (étape 9) ----------
// [{ id, nom, quantite, achat, revente }] : prix d'achat et revente estimée, saisis par l'utilisateur.

export async function getScelle() {
  const scelle = lire("scelle", []);
  return Array.isArray(scelle) ? scelle : [];
}

export function valeurScelle(produits) {
  return produits.reduce((somme, produit) => somme + (Number(produit.quantite) || 0) * (Number(produit.revente) || 0), 0);
}

// ---------- Historique de la valeur ----------
// Un relevé par jour : [{ date: "2026-10-15", cartes, scelle }], du plus ancien au plus récent.
// TCGdex ne donne pas d'historique : la courbe se construit au fil des visites.

const JOURS_GARDES = 400;

export async function getHistorique() {
  const historique = lire("historique", []);
  return Array.isArray(historique) ? historique : [];
}

export async function enregistrerValeur({ cartes, scelle }) {
  const maintenant = new Date();
  const date = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, "0")}-${String(maintenant.getDate()).padStart(2, "0")}`;
  const historique = (await getHistorique()).filter((releve) => releve.date !== date);
  historique.push({ date, cartes: Math.round(cartes * 100) / 100, scelle: Math.round(scelle * 100) / 100 });
  historique.sort((a, b) => a.date.localeCompare(b.date));
  ecrire("historique", historique.slice(-JOURS_GARDES));
  return historique;
}

// ---------- Chase cards ----------
// chase : { budget: nombre ou null, cartes: [{ id, nom, numero, image, set, langue, variante,
//           prixMax, priorite: "haute" | "moyenne" | "basse", prix, prixLe, ajouteeLe }] }
// « prix » : dernière tendance Cardmarket connue de la variante cherchée (null si inconnue).
// Une chase card est « trouvée » dès que la carte est dans la collection.

export const PRIORITES = [
  { cle: "haute", nom: "Priorité haute" },
  { cle: "moyenne", nom: "Priorité moyenne" },
  { cle: "basse", nom: "Priorité basse" },
];

function lireChase() {
  const chase = lire("chase", {});
  return { budget: typeof chase.budget === "number" ? chase.budget : null, cartes: Array.isArray(chase.cartes) ? chase.cartes : [] };
}

export async function getChaseCards() {
  return lireChase();
}

export async function getChaseCard(id) {
  return lireChase().cartes.find((carte) => carte.id === id) ?? null;
}

// Ajoute la carte, ou remplace ses réglages si elle est déjà suivie.
export async function enregistrerChaseCard(carte) {
  const chase = lireChase();
  const ancienne = chase.cartes.find((c) => c.id === carte.id);
  const nouvelle = { ...carte, ajouteeLe: ancienne?.ajouteeLe ?? new Date().toISOString() };
  chase.cartes = ancienne ? chase.cartes.map((c) => (c.id === carte.id ? nouvelle : c)) : [...chase.cartes, nouvelle];
  ecrire("chase", chase);
  return nouvelle;
}

// changements : { prixMax, priorite, prix, prixLe… }
export async function modifierChaseCard(id, changements) {
  const chase = lireChase();
  const carte = chase.cartes.find((c) => c.id === id);
  if (!carte) return null;
  Object.assign(carte, changements);
  ecrire("chase", chase);
  return carte;
}

export async function retirerChaseCard(id) {
  const chase = lireChase();
  chase.cartes = chase.cartes.filter((c) => c.id !== id);
  ecrire("chase", chase);
}

export async function choisirBudgetChase(budget) {
  const chase = lireChase();
  chase.budget = budget;
  ecrire("chase", chase);
}
