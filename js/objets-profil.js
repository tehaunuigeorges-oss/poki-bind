// Bannières et cadres du profil. Les objets « gratuits » sont toujours disponibles ; les autres se
// débloquent dans la boutique avec des pièces (prix provisoires).
// Deux sortes de dessins : en CSS (dégradés, anneaux colorés) ou en image (img/bannieres/, img/cadres/).

import { echapper } from "./outils.js";

const degrade = (...couleurs) => `linear-gradient(120deg, ${couleurs.map((c) => `var(--${c})`).join(", ")})`;
const anneau = (...couleurs) => `conic-gradient(from 210deg, ${[...couleurs, couleurs[0]].map((c) => (c.startsWith("#") ? c : `var(--${c})`)).join(", ")})`;
const imageBanniere = (id, nom, prix) => ({ id, nom, image: `img/bannieres/${id}.webp`, fond: `center / cover no-repeat url('img/bannieres/${id}.webp')`, prix });

export const BANNIERES = [
  { id: "lagune", nom: "Lagune", fond: degrade("eau", "psy") },
  { id: "prairie", nom: "Prairie", fond: degrade("plante", "electrique") },
  { id: "braise", nom: "Braise", fond: degrade("feu", "fee") },
  { id: "nuit", nom: "Nuit", fond: degrade("obscurite", "psy") },
  { id: "acier", nom: "Acier", fond: degrade("metal", "eau") },
  imageBanniere("ectoplasma-cerisier", "Ectoplasma sous les cerisiers", 700),
  imageBanniere("mew-neons", "Mew dans la ville", 700),
  imageBanniere("fete-halloween", "Fête d'Halloween", 700),
  imageBanniere("jirachi-nuit-etoilee", "Jirachi, nuit étoilée", 700),
  imageBanniere("pikachu-plage", "Pikachu à la plage", 700),
  imageBanniere("ho-oh-lugia", "Ho-Oh et Lugia", 700),
  imageBanniere("primo-groudon", "Primo-Groudon", 700),
  imageBanniere("mega-rayquaza", "Méga-Rayquaza", 700),
  { id: "aurore", nom: "Aurore", fond: degrade("eau", "psy", "fee"), prix: 400 },
  { id: "crepuscule", nom: "Crépuscule", fond: degrade("feu", "electrique", "fee"), prix: 400 },
  { id: "abysses", nom: "Abysses", fond: degrade("eau", "obscurite", "dragon"), prix: 400 },
  { id: "foret", nom: "Forêt ancienne", fond: degrade("plante", "dragon", "obscurite"), prix: 400 },
  { id: "galaxie", nom: "Galaxie", fond: `radial-gradient(circle at 80% 20%, rgb(255 255 255 / .35) 0 2%, transparent 3%), radial-gradient(circle at 30% 70%, rgb(255 255 255 / .3) 0 1.5%, transparent 2.5%), ${degrade("obscurite", "psy", "eau")}`, prix: 600 },
  { id: "arc-en-ciel", nom: "Arc-en-ciel", fond: degrade("feu", "electrique", "plante", "eau", "psy"), prix: 800 },
];

// Cadres en image : « trou » mesuré sur l'image (centre et rayon en fraction de la largeur, ratio hauteur / largeur)
const imageCadre = (id, nom, geometrie, prix) => ({ id, nom, image: `img/cadres/${id}.webp`, geometrie, anneau: "transparent", prix });

export const CADRES = [
  { id: "classique", nom: "Classique", anneau: "var(--electrique)" },
  imageCadre("pikachu", "Cadre Pikachu", { ratio: 1.4141, centreX: 0.499, centreY: 0.6643, rayon: 0.4 }, 700),
  imageCadre("etincelle", "Cadre étincelle", { ratio: 1, centreX: 0.4993, centreY: 0.4986, rayon: 0.3682 }, 700),
  imageCadre("pinceau", "Cadre coup de pinceau", { ratio: 1, centreX: 0.4721, centreY: 0.4757, rayon: 0.4182 }, 700),
  { id: "dore", nom: "Cadre doré", anneau: anneau("#F6D365", "#C9971C", "#FBE7A1", "#B8860B"), prix: 500 },
  { id: "argent", nom: "Cadre argent", anneau: anneau("#F2F4F7", "#9AA3AD", "#DDE2E8", "#7D8791"), prix: 400 },
  { id: "flamme", nom: "Cadre flamme", anneau: anneau("feu", "electrique", "feu-fonce"), prix: 500 },
  { id: "ocean", nom: "Cadre océan", anneau: anneau("eau", "psy", "eau-fonce"), prix: 500 },
  { id: "foret-cadre", nom: "Cadre forêt", anneau: anneau("plante", "electrique", "plante-fonce"), prix: 500 },
  { id: "prisme", nom: "Cadre prisme", anneau: anneau("feu", "electrique", "plante", "eau", "psy", "fee"), prix: 800 },
];

export const estGratuit = (objet) => !objet.prix;
export const estDebloque = (objet, debloques) => estGratuit(objet) || debloques.includes(objet.id);

export const banniere = (id) => BANNIERES.find((b) => b.id === id) ?? BANNIERES[0];
export const cadre = (id) => CADRES.find((c) => c.id === id) ?? CADRES[0];

// Un avatar (ou un aperçu rond) avec son cadre. contenu : ce qu'il y a dans le rond (initiales…).
// Cadre en image : l'image est posée par-dessus, son trou centré sur le rond et un peu plus petit que lui,
// pour cacher le bord du rond.
export function avecCadre(objet, contenu, classe, attributs = "") {
  if (!objet.image) return `<span class="${classe}" style="--cadre: ${objet.anneau}"${attributs}>${contenu}</span>`;
  const { ratio, centreX, centreY, rayon } = objet.geometrie;
  const largeur = (0.47 * 100) / rayon; // en % du diamètre du rond
  const style = `width: ${largeur.toFixed(2)}%; left: ${(50 - centreX * largeur).toFixed(2)}%; top: ${(50 - centreY * largeur * ratio).toFixed(2)}%`;
  return `<span class="${classe} cadre-en-image" style="--cadre: transparent"${attributs}>${contenu}<img class="cadre-image" src="${echapper(objet.image)}" alt="" style="${style}"></span>`;
}
