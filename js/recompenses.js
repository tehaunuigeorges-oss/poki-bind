// Pièces et badges. Montants provisoires, à fixer quand la boutique ouvrira.
// verifierRecompenses() est appelée à chaque page de l'espace membre (js/entete.js) : elle compte la
// connexion du jour, puis donne les pièces et les badges mérités depuis la dernière visite.
// Un badge ou un set complété ne rapporte qu'une fois, même si on retire ensuite des cartes.

import { getRecompenses, enregistrerRecompenses, getCollection, nombreExemplaires, getBinders, getChaseCards } from "./donnees.js";
import { estOfficielle } from "./tcgdex.js";

export const GAINS = {
  bienvenue: 300,     // une seule fois, à la toute première connexion
  connexion: 10,      // par jour de connexion
  setComplete: 200,   // par set terminé
};

// Badges : image dans img/badges/, condition (valeur actuelle / objectif) et pièces gagnées
export const BADGES = [
  { cle: "cartes-10", nom: "10 cartes", image: "badge-cartes-10", mesure: "cartes", objectif: 10, pieces: 50 },
  { cle: "cartes-50", nom: "50 cartes", image: "badge-cartes-50", mesure: "cartes", objectif: 50, pieces: 50 },
  { cle: "cartes-100", nom: "100 cartes", image: "badge-cartes-100", mesure: "cartes", objectif: 100, pieces: 50 },
  { cle: "cartes-500", nom: "500 cartes", image: "badge-cartes-500", mesure: "cartes", objectif: 500, pieces: 50 },
  { cle: "cartes-1000", nom: "1 000 cartes", image: "badge-cartes-1000", mesure: "cartes", objectif: 1000, pieces: 100 },
  { cle: "connexion-7", nom: "7 jours d'affilée", image: "badge-connexion-7-jours", mesure: "serie", objectif: 7, pieces: 50 },
  { cle: "connexion-30", nom: "30 jours d'affilée", image: "badge-connexion-30-jours", mesure: "serie", objectif: 30, pieces: 150 },
  { cle: "connexion-100", nom: "100 jours d'affilée", image: "badge-connexion-100-jours", mesure: "serie", objectif: 100, pieces: 300 },
  { cle: "connexion-365", nom: "365 jours d'affilée", image: "badge-connexion-365-jours", mesure: "serie", objectif: 365, pieces: 1000 },
  { cle: "premier-binder", nom: "Premier binder", image: "badge-premier-binder", mesure: "binders", objectif: 1, pieces: 20 },
  { cle: "premiere-chase-card", nom: "Première chase card", image: "badge-premiere-chase-card", mesure: "chase", objectif: 1, pieces: 20 },
  { cle: "set-complete", nom: "Premier set complété", image: "badge-set-complete", mesure: "sets", objectif: 1, pieces: 0 },
  { cle: "sets-5", nom: "5 sets complétés", image: "badge-5-sets-completes", mesure: "sets", objectif: 5, pieces: 300 },
];

// Date du jour en heure locale : « 2026-10-16 »
export function aujourdhui(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function veille(jour) {
  const [a, m, j] = jour.split("-").map(Number);
  return aujourdhui(new Date(a, m - 1, j - 1));
}

// Sets terminés : toutes les cartes numérotées possédées (les cartes secrètes ne comptent pas)
export function setsCompletes(collection) {
  const sets = new Map();
  for (const entree of collection) {
    const officiel = entree.set?.officiel;
    if (!officiel || !estOfficielle(entree.numero, officiel)) continue;
    const set = sets.get(entree.set.id) ?? { id: entree.set.id, nom: entree.set.nom, officiel, cartes: 0 };
    set.cartes += 1;
    sets.set(entree.set.id, set);
  }
  return [...sets.values()].filter((set) => set.cartes >= set.officiel);
}

// Valeurs actuelles de chaque mesure
export async function mesures(recompenses) {
  const [collection, binders, chase] = await Promise.all([getCollection(), getBinders(), getChaseCards()]);
  return {
    cartes: collection.reduce((somme, entree) => somme + nombreExemplaires(entree), 0),
    serie: recompenses.meilleureSerie,
    binders: binders.libres.length,
    chase: chase.cartes.length,
    sets: setsCompletes(collection).length,
    collection,
  };
}

// Prochains badges à débloquer, les plus avancés d'abord
export function prochainsBadges(recompenses, valeurs, nombre = 3) {
  return BADGES.filter((badge) => !recompenses.obtenus[badge.cle])
    .map((badge) => ({ ...badge, actuel: Math.min(valeurs[badge.mesure], badge.objectif) }))
    .sort((a, b) => b.actuel / b.objectif - a.actuel / a.objectif)
    .slice(0, nombre);
}

// Renvoie { pieces, nouveautes: [texte, …] }. Une seule vérification par page, même si plusieurs scripts la demandent.
let verification = null;
export function verifierRecompenses() {
  verification ??= verifier();
  return verification;
}

async function verifier() {
  const recompenses = await getRecompenses();
  const nouveautes = [];
  const jour = aujourdhui();
  const gagner = (cle, texte, pieces) => {
    recompenses.pieces += pieces;
    recompenses.journal.push({ date: new Date().toISOString(), cle, texte, pieces });
    nouveautes.push(pieces ? `${texte} : +${pieces} pièces` : texte);
  };

  // Cadeau de bienvenue : la toute première visite de l'espace membre (une seule fois)
  if (recompenses.jours.length === 0 && !recompenses.obtenus.bienvenue) {
    recompenses.obtenus.bienvenue = jour;
    gagner("bienvenue", "Bienvenue sur Pokibind", GAINS.bienvenue);
  }

  // Connexion du jour et série de jours d'affilée
  if (!recompenses.jours.includes(jour)) {
    const precedent = recompenses.jours.at(-1);
    recompenses.serie = precedent === veille(jour) ? recompenses.serie + 1 : 1;
    recompenses.meilleureSerie = Math.max(recompenses.meilleureSerie, recompenses.serie);
    recompenses.jours.push(jour);
    recompenses.pieces += GAINS.connexion;
    nouveautes.push(`Connexion du jour : +${GAINS.connexion} pièces`);
  }

  const valeurs = await mesures(recompenses);

  // Sets complétés (une fois chacun)
  for (const set of setsCompletes(valeurs.collection)) {
    const cle = `set:${set.id}`;
    if (recompenses.obtenus[cle]) continue;
    recompenses.obtenus[cle] = jour;
    gagner(cle, `Set ${set.nom} complété`, GAINS.setComplete);
  }

  // Badges
  for (const badge of BADGES) {
    if (recompenses.obtenus[badge.cle] || valeurs[badge.mesure] < badge.objectif) continue;
    recompenses.obtenus[badge.cle] = jour;
    gagner(badge.cle, `Badge « ${badge.nom} » débloqué`, badge.pieces);
  }

  if (nouveautes.length) await enregistrerRecompenses(recompenses);
  return { pieces: recompenses.pieces, nouveautes };
}
