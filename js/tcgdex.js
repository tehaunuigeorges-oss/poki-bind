// Données des cartes : API TCGdex, en français (https://tcgdex.dev).
// Les réponses sont gardées dans le cache du navigateur (Cache API) pendant une durée choisie :
// la liste complète des cartes et les séries une semaine, le détail d'une carte un jour
// (ses prix changent chaque jour). Sans connexion, on se sert des anciennes réponses.

import { normaliser } from "./outils.js";

export const LANGUE = "fr";
const API = `https://api.tcgdex.net/v2/${LANGUE}/`;
const NOM_CACHE = "pokibind-tcgdex-v1";
const JOUR = 24 * 60 * 60 * 1000;
const SEMAINE = 7 * JOUR;

// Pokémon TCG Pocket n'existe qu'en jeu vidéo : ses cartes ne se collectionnent pas.
const SERIES_IGNOREES = new Set(["tcgp"]);

// Les trois grandes familles de cartes (« category » dans TCGdex). À elles trois, elles contiennent
// toutes les cartes : on télécharge leurs listes au lieu de la liste complète, pour le même poids.
export const FAMILLES = ["Pokémon", "Dresseur", "Énergie"];
const cheminFamille = (famille) => `cards?category=${encodeURIComponent(famille)}`;

// Erreur avec sa raison : "reseau" (TCGdex injoignable), "introuvable" (404) ou "serveur".
export class ErreurTcgdex extends Error {
  constructor(raison) {
    super(`TCGdex : ${raison}`);
    this.raison = raison;
  }
}

// ---------- Cache ----------

let cacheOuvert = null;

// Le cache n'existe que sur un site sécurisé (https ou localhost) : sinon, tout passe par le réseau.
function ouvrirCache() {
  cacheOuvert ??= typeof caches === "undefined" ? Promise.resolve(null) : caches.open(NOM_CACHE).catch(() => null);
  return cacheOuvert;
}

async function charger(chemin, duree) {
  const adresse = API + chemin;
  let cache = null;
  let ancienne = null;
  try {
    cache = await ouvrirCache();
    const enCache = cache && (await cache.match(adresse));
    if (enCache) {
      const age = Date.now() - Number(enCache.headers.get("x-pokibind-date"));
      if (age < duree) return await enCache.json();
      ancienne = enCache;
    }
  } catch (erreur) {
    // Cache indisponible ou illisible : on passe par le réseau.
  }

  let reponse;
  try {
    reponse = await fetch(adresse);
  } catch (erreur) {
    if (ancienne) return ancienne.json();
    throw new ErreurTcgdex("reseau");
  }
  if (!reponse.ok) {
    if (ancienne && reponse.status >= 500) return ancienne.json();
    throw new ErreurTcgdex(reponse.status === 404 ? "introuvable" : "serveur");
  }

  let texte;
  let donnees;
  try {
    texte = await reponse.text();
    donnees = JSON.parse(texte);
  } catch (erreur) {
    throw new ErreurTcgdex("serveur");
  }
  if (cache) {
    const aGarder = new Response(texte, {
      headers: { "Content-Type": "application/json", "x-pokibind-date": String(Date.now()) },
    });
    cache.put(adresse, aGarder).catch(() => {});
    // Les listes de cartes se téléchargent une fois par semaine : on en profite pour effacer les vieilles réponses.
    if (chemin === cheminFamille(FAMILLES[0])) nettoyer(cache);
  }
  return donnees;
}

async function nettoyer(cache) {
  try {
    for (const requete of await cache.keys()) {
      const reponse = await cache.match(requete);
      const date = Number(reponse?.headers.get("x-pokibind-date"));
      if (!date || Date.now() - date > SEMAINE) await cache.delete(requete);
    }
  } catch (erreur) {
    // Pas grave : on réessaiera la semaine prochaine.
  }
}

// ---------- Cartes, sets et séries ----------

export const getCarte = (id) => charger(`cards/${encodeURIComponent(id)}`, JOUR);
export const getSet = (id) => charger(`sets/${encodeURIComponent(id)}`, SEMAINE);
export const getSerie = (id) => charger(`series/${encodeURIComponent(id)}`, SEMAINE);

// Toutes les séries, de la plus récente à la plus ancienne (sans Pokémon TCG Pocket).
export async function getSeries() {
  const series = await charger("series", SEMAINE);
  return series.filter((serie) => !SERIES_IGNOREES.has(serie.id)).reverse().map((serie) => ({ id: serie.id, nom: serie.name }));
}

// Logo ou symbole d'un set ou d'une série (adresse TCGdex sans extension).
// TCGdex donne les symboles sous « /univ/ », qui répond toujours « 400 » : les fichiers
// sont en réalité sous « /fr/ » (pour une partie des sets seulement).
export function illustrationTcgdex(base) {
  if (typeof base !== "string" || !base.startsWith("https://")) return null;
  return `${base.replace("assets.tcgdex.net/univ/", "assets.tcgdex.net/fr/")}.webp`;
}

// Le numéro d'une carte ne contient jamais de tiret : « sv08.5-074 » → set « sv08.5 »
export const setDeCarte = (id) => String(id).slice(0, String(id).lastIndexOf("-"));

// Carte de la numérotation officielle du set (« 074/131 ») : c'est elle qui compte pour compléter
// un set. Au-delà (« 167/131 ») ou avec des lettres (« TG01 »), c'est une carte secrète, en bonus.
export function estOfficielle(numero, officiel) {
  return /^\d+$/.test(numero) && (!officiel || Number(numero) <= officiel);
}

// Numéro lisible (« %3F » dans TCGdex → « ? »)
export function numeroLisible(numero) {
  try {
    return decodeURIComponent(numero);
  } catch (erreur) {
    return String(numero);
  }
}

// Image d'une carte : « low » (245 px de large) dans les grilles, « high » (600 px) en grand.
export function imageCarte(base, taille = "low") {
  return typeof base === "string" && base.startsWith("https://") ? `${base}/${taille}.webp` : null;
}

// TCGdex n'a pas d'image française pour environ une carte sur six, mais il a parfois l'anglaise,
// rangée de la même façon (série, set, numéro). Si elle n'existe pas non plus, l'image ne se charge
// pas et la carte de remplacement s'affiche (voir visuel-carte.js).
export function imageDeSecours(serie, set, numero) {
  if (!serie || !set) return null;
  return `https://assets.tcgdex.net/en/${[serie, set, numero].map(encodeURIComponent).join("/")}`;
}

// Numéro comparable : « 074 » → « 74 », « TG01 » → « tg1 »
const cleNumero = (numero) => normaliser(numeroLisible(numero)).replace(/(^|\D)0+(?=\d)/g, "$1");

let indexEnCours = null;

// Toutes les cartes françaises, prêtes pour la recherche, avec leurs sets et leurs séries.
// Le premier appel télécharge (ou relit dans le cache) ; les suivants réutilisent le résultat.
export function getIndex() {
  indexEnCours ??= construireIndex().catch((erreur) => {
    indexEnCours = null;
    throw erreur;
  });
  return indexEnCours;
}

async function construireIndex() {
  const [resumesSeries, ...listes] = await Promise.all([
    charger("series", SEMAINE),
    ...FAMILLES.map((famille) => charger(cheminFamille(famille), SEMAINE)),
  ]);
  const liste = listes.flatMap((cartesFamille, rang) => cartesFamille.map((carte) => ({ ...carte, famille: FAMILLES[rang] })));
  // Une série introuvable n'empêche pas la recherche : ses cartes restent, sans nom de set.
  const series = (await Promise.all(
    resumesSeries.map((serie) => charger(`series/${encodeURIComponent(serie.id)}`, SEMAINE).catch(() => null))
  )).filter(Boolean);

  // Séries de la plus récente à la plus ancienne ; « rang » range les sets du plus ancien au plus récent.
  series.sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
  const sets = new Map();
  series.forEach((serie, positionSerie) => {
    (serie.sets ?? []).forEach((set, positionSet) => {
      sets.set(set.id, {
        id: set.id,
        nom: set.name,
        logo: set.logo ?? null,
        symbole: set.symbol ?? null,
        officiel: set.cardCount?.official ?? null,
        serie: { id: serie.id, nom: serie.name, logo: serie.logo ?? null },
        rang: (series.length - positionSerie) * 1000 + positionSet,
      });
    });
  });

  const cartes = [];
  for (const carte of liste) {
    const idSet = setDeCarte(carte.id);
    const set = sets.get(idSet);
    if (set && SERIES_IGNOREES.has(set.serie.id)) continue;
    const numero = numeroLisible(carte.localId);
    cartes.push({
      id: carte.id,
      nom: carte.name,
      numero,
      image: carte.image ?? null,
      imageSecours: carte.image ? null : imageDeSecours(set?.serie.id, idSet, numero),
      set: idSet,
      cle: normaliser(carte.name),
      cleNumero: cleNumero(carte.localId),
      rang: set?.rang ?? 0,
      famille: carte.famille,
    });
  }

  return {
    cartes,
    sets,
    series: series.filter((serie) => !SERIES_IGNOREES.has(serie.id)).map((serie) => ({ id: serie.id, nom: serie.name, logo: serie.logo ?? null })),
  };
}

// Cherche par nom (sans tenir compte des accents) et/ou par numéro (« 74 », « 074/131 », « TG01 »).
// Chaque mot doit se trouver dans le nom ou être le numéro de la carte.
// Résultats : noms exacts d'abord, puis noms qui commencent par la recherche, puis les sets les plus récents.
export function chercherCartes(index, texte, idSerie = "", famille = "") {
  let total = null;
  const sansTotal = String(texte ?? "").replace(/([a-z]*\d+[a-z]?)\s*\/\s*(\d+)/i, (tout, numero, sur) => {
    total = Number(sur);
    return numero;
  });
  const recherche = normaliser(sansTotal);
  const mots = recherche.split(" ").filter(Boolean);
  if (mots.length === 0) return [];
  const numeros = mots.map(cleNumero);

  const trouvees = [];
  for (const carte of index.cartes) {
    const set = index.sets.get(carte.set);
    if (idSerie && set?.serie.id !== idSerie) continue;
    if (famille && carte.famille !== famille) continue;
    if (total !== null && set?.officiel != null && set.officiel !== total) continue;
    const correspond = mots.every((mot, i) => carte.cle.includes(mot) || carte.cleNumero === numeros[i]);
    if (!correspond) continue;
    const score = carte.cle === recherche ? 3 : carte.cle.startsWith(recherche) ? 2 : ` ${carte.cle}`.includes(` ${mots[0]}`) ? 1 : 0;
    trouvees.push({ carte, score });
  }

  trouvees.sort((a, b) =>
    b.score - a.score ||
    b.carte.rang - a.carte.rang ||
    a.carte.numero.localeCompare(b.carte.numero, "fr", { numeric: true })
  );
  return trouvees.map(({ carte }) => carte);
}

// Cartes d'une famille et/ou d'une série, rangées par set : sets du plus récent au plus ancien,
// cartes par numéro. Une carte dont le set est inconnu de TCGdex garde un groupe à son nom de code.
export function cartesParSet(index, idSerie = "", famille = "") {
  const groupes = new Map();
  for (const carte of index.cartes) {
    const set = index.sets.get(carte.set);
    if (idSerie && set?.serie.id !== idSerie) continue;
    if (famille && carte.famille !== famille) continue;
    if (!groupes.has(carte.set)) {
      groupes.set(carte.set, { id: carte.set, nom: set?.nom ?? carte.set.toUpperCase(), logo: set?.logo ?? null, serie: set?.serie ?? null, rang: carte.rang, cartes: [] });
    }
    groupes.get(carte.set).cartes.push(carte);
  }
  const liste = [...groupes.values()].sort((a, b) => b.rang - a.rang || a.nom.localeCompare(b.nom, "fr"));
  for (const groupe of liste) groupe.cartes.sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }));
  return liste;
}

// ---------- Variantes et prix ----------

export const VARIANTES = [
  { cle: "normale", nom: "Normale", court: "N" },
  { cle: "reverse", nom: "Reverse", court: "R" },
  { cle: "holo", nom: "Holo", court: "H" },
  { cle: "pokeball", nom: "Reverse Poké Ball", court: "PB" },
  { cle: "masterball", nom: "Reverse Master Ball", court: "MB" },
];

// Cardmarket donne deux séries de prix pour un même produit : sans suffixe (carte normale ou holo)
// et « -holo » (sa version reverse). Un prix absent ou à 0 veut dire : pas assez de ventes.
function lirePrix(cardmarket, reverse) {
  if (!cardmarket) return null;
  const lire = (champ) => {
    const valeur = cardmarket[reverse ? `${champ}-holo` : champ];
    return typeof valeur === "number" && valeur > 0 ? valeur : null;
  };
  const tendance = lire("trend");
  if (tendance === null) return null;
  return { tendance, moyenne30: lire("avg30"), moyenne7: lire("avg7"), moyenne1: lire("avg1"), majLe: cardmarket.updated ?? null };
}

// Pour chaque variante : existe-t-elle pour cette carte, et à quel prix ?
// Normale, reverse et holo sont toujours listées (« existe: false » si la carte n'en a pas) ;
// Poké Ball et Master Ball seulement quand TCGdex les connaît.
export function variantesDeCarte(carte) {
  const details = Array.isArray(carte.variants_detailed) ? carte.variants_detailed : [];
  const chercher = (type, motif = "") =>
    details.find((d) => normaliser(d.type) === type && normaliser(d.foil) === motif && !d.stamp?.length);
  const general = carte.pricing?.cardmarket;
  const connues = carte.variants; // { normal, reverse, holo, … } ; absent pour quelques vieilles cartes

  const existe = (type, detail) => (connues ? connues[type] === true : details.length === 0 || detail !== undefined);
  const normale = chercher("normal");
  const reverse = chercher("reverse");
  const holo = chercher("holo");
  const pokeball = chercher("reverse", "pokeball");
  const masterball = chercher("reverse", "masterball");
  const prixMotif = (detail) => lirePrix(detail.pricing?.cardmarket, true) ?? lirePrix(detail.pricing?.cardmarket, false);

  const [vNormale, vReverse, vHolo, vPokeball, vMasterball] = VARIANTES;
  const liste = [
    { ...vNormale, existe: existe("normal", normale), prix: lirePrix(normale?.pricing?.cardmarket ?? general, false) },
    { ...vReverse, existe: existe("reverse", reverse), prix: lirePrix(reverse?.pricing?.cardmarket ?? general, true) },
    { ...vHolo, existe: existe("holo", holo), prix: lirePrix(holo?.pricing?.cardmarket ?? general, false) },
  ];
  if (pokeball) liste.push({ ...vPokeball, existe: true, prix: prixMotif(pokeball) });
  if (masterball) liste.push({ ...vMasterball, existe: true, prix: prixMotif(masterball) });
  // Données incomplètes (aucune variante connue) : on propose au moins la normale.
  if (!liste.some((variante) => variante.existe)) liste[0].existe = true;
  return liste;
}

// Ce que la collection garde d'une carte : de quoi l'afficher sans rappeler TCGdex,
// avec le dernier prix connu de chaque variante.
export function resumeCarte(carte) {
  const prix = {};
  const prix30 = {};
  for (const variante of variantesDeCarte(carte)) {
    if (!variante.existe || !variante.prix) continue;
    prix[variante.cle] = variante.prix.tendance;
    if (variante.prix.moyenne30) prix30[variante.cle] = variante.prix.moyenne30;
  }
  return {
    id: carte.id,
    nom: carte.name,
    numero: numeroLisible(carte.localId),
    image: carte.image ?? null,
    set: { id: carte.set?.id ?? setDeCarte(carte.id), nom: carte.set?.name ?? "", officiel: carte.set?.cardCount?.official ?? null },
    langue: LANGUE,
    categorie: carte.category ?? "",
    types: Array.isArray(carte.types) ? carte.types : [],
    rarete: carte.rarity ?? "",
    prix,
    prix30,
    prixLe: new Date().toISOString(),
  };
}
