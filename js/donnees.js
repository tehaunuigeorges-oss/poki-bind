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

// ---------- Profil ----------

// null tant que le profil n'a pas été créé (étape 10).
export async function getProfil() {
  return lire("profil", null);
}

// ---------- Pièces ----------

export async function getPieces() {
  return lire("pieces", 0);
}
