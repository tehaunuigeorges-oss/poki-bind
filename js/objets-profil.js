// Bannières et cadres du profil. Les objets « gratuits » sont toujours disponibles ; les autres
// se débloqueront dans la boutique (prix en pièces, provisoires tant qu'elle n'est pas ouverte).
// Les dessins sont en CSS : dégradés pour les bannières, anneaux autour de l'avatar pour les cadres.

const degrade = (...couleurs) => `linear-gradient(120deg, ${couleurs.map((c) => `var(--${c})`).join(", ")})`;
const anneau = (...couleurs) => `conic-gradient(from 210deg, ${[...couleurs, couleurs[0]].map((c) => (c.startsWith("#") ? c : `var(--${c})`)).join(", ")})`;

export const BANNIERES = [
  { id: "lagune", nom: "Lagune", fond: degrade("eau", "psy") },
  { id: "prairie", nom: "Prairie", fond: degrade("plante", "electrique") },
  { id: "braise", nom: "Braise", fond: degrade("feu", "fee") },
  { id: "nuit", nom: "Nuit", fond: degrade("obscurite", "psy") },
  { id: "acier", nom: "Acier", fond: degrade("metal", "eau") },
  { id: "aurore", nom: "Aurore", fond: degrade("eau", "psy", "fee"), prix: 400 },
  { id: "crepuscule", nom: "Crépuscule", fond: degrade("feu", "electrique", "fee"), prix: 400 },
  { id: "abysses", nom: "Abysses", fond: degrade("eau", "obscurite", "dragon"), prix: 400 },
  { id: "foret", nom: "Forêt ancienne", fond: degrade("plante", "dragon", "obscurite"), prix: 400 },
  { id: "galaxie", nom: "Galaxie", fond: `radial-gradient(circle at 80% 20%, rgb(255 255 255 / .35) 0 2%, transparent 3%), radial-gradient(circle at 30% 70%, rgb(255 255 255 / .3) 0 1.5%, transparent 2.5%), ${degrade("obscurite", "psy", "eau")}`, prix: 600 },
  { id: "arc-en-ciel", nom: "Arc-en-ciel", fond: degrade("feu", "electrique", "plante", "eau", "psy"), prix: 800 },
];

export const CADRES = [
  { id: "classique", nom: "Classique", anneau: "var(--electrique)" },
  { id: "dore", nom: "Cadre doré", anneau: anneau("#F6D365", "#C9971C", "#FBE7A1", "#B8860B"), prix: 500 },
  { id: "argent", nom: "Cadre argent", anneau: anneau("#F2F4F7", "#9AA3AD", "#DDE2E8", "#7D8791"), prix: 400 },
  { id: "flamme", nom: "Cadre flamme", anneau: anneau("feu", "electrique", "feu-fonce"), prix: 500 },
  { id: "ocean", nom: "Cadre océan", anneau: anneau("eau", "psy", "eau-fonce"), prix: 500 },
  { id: "foret", nom: "Cadre forêt", anneau: anneau("plante", "electrique", "plante-fonce"), prix: 500 },
  { id: "prisme", nom: "Cadre prisme", anneau: anneau("feu", "electrique", "plante", "eau", "psy", "fee"), prix: 800 },
];

export const estGratuit = (objet) => !objet.prix;
export const estDebloque = (objet, debloques) => estGratuit(objet) || debloques.includes(objet.id);

export const banniere = (id) => BANNIERES.find((b) => b.id === id) ?? BANNIERES[0];
export const cadre = (id) => CADRES.find((c) => c.id === id) ?? CADRES[0];
