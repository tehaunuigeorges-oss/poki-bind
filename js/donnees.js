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
