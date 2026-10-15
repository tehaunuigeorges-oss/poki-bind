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
// binders : {
//   libres: [{ id, nom, couverture, cartes: [résumé de carte, …], creeLe }],  (rangées dans l'ordre de placement)
//   sets: { "sv08.5": { couverture } }   (couverture choisie pour le binder d'un set ; sinon une couleur par défaut)
// }
// Les binders de set n'ont pas de cartes enregistrées : ils montrent le set entier et la collection.

function lireBinders() {
  const binders = lire("binders", {});
  return { libres: Array.isArray(binders.libres) ? binders.libres : [], sets: binders.sets ?? {} };
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

// Place une carte (résumé, voir resumeCarte dans tcgdex.js) dans la première pochette libre, à la fin.
// Renvoie sa position (0 = première pochette).
export async function placerCarte(idBinder, carte) {
  const binders = lireBinders();
  const binder = binders.libres.find((b) => b.id === idBinder);
  if (!binder) throw new Error("Binder introuvable");
  binder.cartes.push(carte);
  ecrire("binders", binders);
  return binder.cartes.length - 1;
}

export async function retirerDuBinder(idBinder, position) {
  const binders = lireBinders();
  const binder = binders.libres.find((b) => b.id === idBinder);
  if (!binder) return null;
  binder.cartes.splice(position, 1);
  ecrire("binders", binders);
  return binder;
}

export async function choisirCouvertureDeSet(idSet, couverture) {
  const binders = lireBinders();
  binders.sets[idSet] = { couverture };
  ecrire("binders", binders);
}

// Couvertures illustrées débloquées dans la boutique (aucune tant qu'elle n'est pas ouverte).
export async function getCouverturesDebloquees() {
  return lire("couvertures", []);
}
