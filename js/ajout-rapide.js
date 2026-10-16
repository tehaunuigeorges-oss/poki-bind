// Ajout rapide d'une carte (le « + » des grilles) : un exemplaire de sa variante la plus courante,
// normale, sinon reverse, sinon holo… Les autres variantes se gèrent sur la fiche de la carte.

import { getCarte, variantesDeCarte, resumeCarte, ErreurTcgdex } from "./tcgdex.js";
import { ajouterCarte } from "./donnees.js";

// Renvoie { nom, variante, entree } ; lève une erreur si TCGdex ou le stockage refusent.
export async function ajouterVarianteCourante(id) {
  const carte = await getCarte(id);
  const variante = variantesDeCarte(carte).find((v) => v.existe);
  const entree = await ajouterCarte(resumeCarte(carte), variante.cle);
  return { nom: carte.name, variante, entree };
}

export function messageErreurAjout(erreur) {
  return erreur instanceof ErreurTcgdex
    ? "Impossible d'ajouter la carte : la base de cartes ne répond pas. Réessaie dans un instant."
    : "Impossible d'enregistrer : le stockage de ton navigateur est bloqué ou plein.";
}
