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
