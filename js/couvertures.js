// Couvertures des binders.
// type "couleur" : couverture et pages dessinées en CSS, toujours disponibles.
// type "illustre" : images de img/binders/ (« -couverture » et « -interieur »), à débloquer
// dans la boutique ; « prix » en pièces, provisoire tant que la boutique n'est pas ouverte.

export const COUVERTURES = [
  { id: "eau", nom: "Eau", type: "couleur", couleur: "eau" },
  { id: "plante", nom: "Plante", type: "couleur", couleur: "plante" },
  { id: "feu", nom: "Feu", type: "couleur", couleur: "feu" },
  { id: "electrique", nom: "Électrique", type: "couleur", couleur: "electrique" },
  { id: "psy", nom: "Psy", type: "couleur", couleur: "psy" },
  { id: "fee", nom: "Fée", type: "couleur", couleur: "fee" },
  { id: "obscurite", nom: "Obscurité", type: "couleur", couleur: "obscurite" },
  { id: "metal", nom: "Métal", type: "couleur", couleur: "metal" },
  { id: "lagon", nom: "Lagon", type: "illustre", image: "img/binders/lagon", prix: 500 },
  { id: "sieste", nom: "Sieste", type: "illustre", image: "img/binders/sieste", prix: 500 },
  { id: "fleurs", nom: "Fleurs", type: "illustre", image: "img/binders/fleurs", prix: 500 },
  { id: "vitrail", nom: "Vitrail", type: "illustre", image: "img/binders/vitrail", prix: 500 },
  { id: "ciel", nom: "Ciel", type: "illustre", image: "img/binders/ciel", prix: 500 },
  { id: "forge", nom: "Forge", type: "illustre", image: "img/binders/forge", prix: 500 },
];

// La couverture d'un identifiant (la première couleur si l'identifiant est inconnu).
export function couverture(id) {
  return COUVERTURES.find((c) => c.id === id) ?? COUVERTURES[0];
}

// Une couverture est utilisable si c'est une couleur, ou une illustration débloquée.
export function estDebloquee(choix, debloquees) {
  return choix.type === "couleur" || debloquees.includes(choix.id);
}
