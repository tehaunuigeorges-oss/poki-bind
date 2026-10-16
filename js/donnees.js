// Toutes les données de l'utilisateur passent par ce fichier : elles sont enregistrées dans Supabase
// (tables décrites dans supabase/schema.sql). Les règles d'accès de la base garantissent que chacun
// ne lit et ne modifie que ses propres données ; les pièces, badges et achats ne s'écrivent que par
// les fonctions de la base (rpc), jamais directement depuis le site.
// Les fonctions sont asynchrones (à utiliser avec await) et lèvent une erreur si l'enregistrement échoue.

import { supabase, etatSession, deconnecter } from "./compte.js";

// Lance une requête Supabase et renvoie ses données, ou lève son erreur.
async function requete(promesse) {
  const { data, error } = await promesse;
  if (error) throw error;
  return data;
}

// Identifiant de l'utilisateur connecté. Toujours filtrer dessus : certaines tables sont aussi
// lisibles pour les profils partagés (profils, binders), pas seulement pour leur propriétaire.
async function moi() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Session expirée : reconnecte-toi.");
  return id;
}

// ---------- Session (comptes Supabase, voir js/compte.js) ----------

// Connecté (email confirmé ou Google) : seul état qui ouvre l'espace membre.
export async function estConnecte() {
  try {
    return (await etatSession()).etat === "connecte";
  } catch (erreur) {
    return false;
  }
}

// La session en cours (email et pseudo choisis à l'inscription), ou null.
export async function getSession() {
  try {
    const { etat, utilisateur } = await etatSession();
    if (etat === "deconnecte") return null;
    return { email: utilisateur.email ?? "", pseudo: utilisateur.user_metadata?.pseudo ?? "" };
  } catch (erreur) {
    return null;
  }
}

// tous : déconnecte aussi les autres appareils
export async function seDeconnecter(tous = false) {
  try {
    await deconnecter(tous);
  } catch (erreur) {
    // Hors connexion : la session locale est quand même effacée par Supabase.
  }
}

// ---------- Copie locale (version 1 du site, et favorites choisies avant de créer son profil) ----------

const PREFIXE = "pokibind-";

function lireLocal(cle, valeurParDefaut) {
  try {
    const texte = localStorage.getItem(PREFIXE + cle);
    return texte === null ? valeurParDefaut : JSON.parse(texte);
  } catch (erreur) {
    return valeurParDefaut;
  }
}

function ecrireLocal(cle, valeur) {
  localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur));
}

function effacerLocal(cle) {
  try {
    localStorage.removeItem(PREFIXE + cle);
  } catch (erreur) {
    // Stockage indisponible : rien à effacer.
  }
}

// ---------- Profil ----------
// profil : { pseudo, nom, bio, banniere, cadre, badge, favorites: [résumé de carte, …] (3 au plus), visibilite, creeLe }
// null tant que l'utilisateur ne l'a pas créé (à sa première visite de la page Profil). Les favorites
// choisies avant restent dans le navigateur : { favorites } sans pseudo, reprises à la création du profil.

const versProfil = (ligne) => ({
  pseudo: ligne.pseudo, nom: ligne.nom, bio: ligne.bio, banniere: ligne.banniere, cadre: ligne.cadre,
  badge: ligne.badge, favorites: ligne.favorites ?? [], visibilite: ligne.visibilite, creeLe: ligne.cree_le,
});

async function lireProfil() {
  const ligne = await requete(supabase.from("profils").select("*").eq("id", await moi()).maybeSingle());
  return ligne ? versProfil(ligne) : null;
}

export async function getProfil() {
  const profil = await lireProfil();
  if (profil) return profil;
  const enAttente = lireLocal("profil", null);
  return Array.isArray(enAttente?.favorites) && !enAttente.pseudo ? { favorites: enAttente.favorites } : null;
}

export const MAX_FAVORITES = 3;

// Ajoute la carte aux favorites, ou l'en retire si elle y est déjà.
// Renvoie { favorite: true | false, plein: true si les 3 places sont déjà prises }.
export async function basculerFavorite(carte) {
  const profil = await getProfil();
  const favorites = profil?.favorites ?? [];
  let nouvelles;
  if (favorites.some((f) => f.id === carte.id)) {
    nouvelles = favorites.filter((f) => f.id !== carte.id);
  } else {
    if (favorites.length >= MAX_FAVORITES) return { favorite: false, plein: true };
    const { id, nom, numero, image, set } = carte;
    nouvelles = [...favorites, { id, nom, numero, image, set }];
  }
  if (profil?.pseudo) await requete(supabase.from("profils").update({ favorites: nouvelles }).eq("id", await moi()));
  else ecrireLocal("profil", { favorites: nouvelles });
  return { favorite: nouvelles.length > favorites.length, plein: false };
}

// Pseudo déjà choisi par quelqu'un d'autre (les pseudos sont uniques, sans tenir compte des majuscules)
export class ErreurPseudoPris extends Error {
  constructor() {
    super("Ce pseudo est déjà pris.");
  }
}

export async function enregistrerProfil(profil) {
  const id = await moi();
  const actuel = await getProfil();
  const nouveau = { visibilite: "prive", favorites: [], ...actuel, ...profil };
  const colonnes = {
    pseudo: nouveau.pseudo, nom: nouveau.nom, bio: nouveau.bio ?? "", banniere: nouveau.banniere ?? "lagune",
    cadre: nouveau.cadre ?? "classique", badge: nouveau.badge ?? "", favorites: nouveau.favorites, visibilite: nouveau.visibilite,
  };
  const { data, error } = actuel?.pseudo
    ? await supabase.from("profils").update(colonnes).eq("id", id).select().single()
    : await supabase.from("profils").insert({ id, ...colonnes }).select().single();
  if (error?.code === "23505") throw new ErreurPseudoPris();
  if (error) throw error;
  if (!actuel?.pseudo) effacerLocal("profil");
  return versProfil(data);
}

// ---------- Pièces et récompenses ----------
// recompenses : { pieces, serie, meilleureSerie, obtenus: { cle: date }, journal: [{ date, cle, texte, pieces }] }
// Les gains sont calculés par la base (fonction verifier_recompenses) ; les montants affichés sont dans js/recompenses.js.

export async function getRecompenses() {
  const id = await moi();
  const [ligne, journal] = await Promise.all([
    requete(supabase.from("recompenses").select("*").eq("user_id", id).maybeSingle()),
    requete(supabase.from("journal_recompenses").select("date, cle, texte, pieces").eq("user_id", id).order("date", { ascending: false }).limit(200)),
  ]);
  return {
    pieces: ligne?.pieces ?? 0,
    serie: ligne?.serie ?? 0,
    meilleureSerie: ligne?.meilleure_serie ?? 0,
    obtenus: ligne?.obtenus ?? {},
    journal: journal.reverse(),
  };
}

// Connexion du jour, sets complétés et badges : la base donne les pièces méritées.
// Renvoie { pieces, nouveautes: [texte, …] }.
export async function compterRecompenses() {
  return requete(supabase.rpc("verifier_recompenses"));
}

export async function getPieces() {
  const ligne = await requete(supabase.from("recompenses").select("pieces").eq("user_id", await moi()).maybeSingle());
  return ligne?.pieces ?? 0;
}

// ---------- Collection ----------
// Une entrée par carte, avec le nombre d'exemplaires de chaque variante :
// { id, nom, numero, image, set: { id, nom, officiel }, langue: "fr",
//   variantes: { normale: 1, reverse: 2 }, prix: { normale: 0.02, … }, prixLe, ajouteeLe }
// Variantes : normale, reverse, holo, pokeball, masterball (voir VARIANTES dans tcgdex.js).
// Dans la base : colonne carte (tout le résumé), variantes et ajoutee_le à part.

const MAX_EXEMPLAIRES = 999;

const versEntree = (ligne) => ({ ...ligne.carte, id: ligne.carte_id, variantes: ligne.variantes, ajouteeLe: ligne.ajoutee_le });
const resumeSeul = ({ variantes, ajouteeLe, ...carte }) => carte;

export async function getCollection() {
  const lignes = await requete(supabase.from("collection").select("carte_id, carte, variantes, ajoutee_le").eq("user_id", await moi()));
  return lignes.map(versEntree);
}

// L'entrée d'une carte, ou null si elle n'est pas dans la collection.
export async function getCarteDeCollection(id) {
  const ligne = await requete(supabase.from("collection").select("carte_id, carte, variantes, ajoutee_le")
    .eq("user_id", await moi()).eq("carte_id", id).maybeSingle());
  return ligne ? versEntree(ligne) : null;
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

// Remet à jour les informations et les prix d'une carte de la collection, sans toucher à ses exemplaires.
export async function majCarte(resume) {
  const entree = await getCarteDeCollection(resume.id);
  if (!entree) return null;
  const nouvelle = { ...entree, ...resume, variantes: entree.variantes, ajouteeLe: entree.ajouteeLe };
  await requete(supabase.from("collection").update({ carte: resumeSeul(nouvelle) }).eq("user_id", await moi()).eq("carte_id", resume.id));
  return nouvelle;
}

async function modifierExemplaires(id, variante, difference, resume = null) {
  const entree = (await getCarteDeCollection(id)) ?? (resume && { id, variantes: {}, ajouteeLe: new Date().toISOString() });
  if (!entree) return null;
  if (resume) Object.assign(entree, resume);

  const quantite = Math.min(MAX_EXEMPLAIRES, Math.max(0, (entree.variantes[variante] ?? 0) + difference));
  if (quantite > 0) entree.variantes[variante] = quantite;
  else delete entree.variantes[variante];

  const utilisateur = await moi();
  if (Object.keys(entree.variantes).length === 0) {
    await requete(supabase.from("collection").delete().eq("user_id", utilisateur).eq("carte_id", id));
    return null;
  }
  await requete(supabase.from("collection").upsert({
    user_id: utilisateur, carte_id: id, carte: resumeSeul(entree), variantes: entree.variantes, ajoutee_le: entree.ajouteeLe,
  }));
  return entree;
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
// binders : { libres: [{ id, nom, couverture, cartes: [résumé de carte ou null, …], creeLe }] }
// cartes[i] est la pochette i (9 par page : 0 à 8 sur la page 1…) ; null = pochette vide.
// Seules les cartes de la collection vont dans un binder, et pas plus d'exemplaires que ceux possédés
// (tous binders confondus) : comme un vrai classeur.

// Erreur de placement : raison "non-possedee" (carte absente de la collection) ou "deja-placee"
// (tous ses exemplaires sont déjà dans des binders).
export class ErreurBinder extends Error {
  constructor(raison) {
    super(`Binder : ${raison}`);
    this.raison = raison;
  }
}

// Nombre de pochettes occupées par une carte, dans tous les binders.
export function placementsDe(libres, id) {
  return libres.reduce((somme, binder) => somme + binder.cartes.filter((carte) => carte?.id === id).length, 0);
}

const versBinder = (ligne) => ({ id: ligne.id, nom: ligne.nom, couverture: ligne.couverture, cartes: ligne.cartes ?? [], creeLe: ligne.cree_le });

export async function getBinders() {
  const lignes = await requete(supabase.from("binders").select("id, nom, couverture, cartes, cree_le")
    .eq("user_id", await moi()).order("cree_le"));
  return { libres: lignes.map(versBinder) };
}

async function lireBinder(id) {
  const ligne = await requete(supabase.from("binders").select("id, nom, couverture, cartes, cree_le")
    .eq("user_id", await moi()).eq("id", id).maybeSingle());
  return ligne ? versBinder(ligne) : null;
}

async function enregistrerBinder(id, colonnes) {
  const ligne = await requete(supabase.from("binders").update(colonnes).eq("user_id", await moi()).eq("id", id)
    .select("id, nom, couverture, cartes, cree_le").maybeSingle());
  return ligne ? versBinder(ligne) : null;
}

export async function creerBinder({ nom, couverture }) {
  return versBinder(await requete(supabase.from("binders").insert({ nom, couverture, cartes: [] })
    .select("id, nom, couverture, cartes, cree_le").single()));
}

// changements : { nom, couverture } (l'un ou l'autre). Renvoie le binder modifié, ou null s'il n'existe plus.
export async function modifierBinder(id, changements) {
  const colonnes = {};
  if (changements.nom !== undefined) colonnes.nom = changements.nom;
  if (changements.couverture !== undefined) colonnes.couverture = changements.couverture;
  return enregistrerBinder(id, colonnes);
}

export async function supprimerBinder(id) {
  await requete(supabase.from("binders").delete().eq("user_id", await moi()).eq("id", id));
}

async function binderModifiable(idBinder) {
  const binder = await lireBinder(idBinder);
  if (!binder) throw new Error("Binder introuvable");
  binder.cartes = Array.from(binder.cartes, (carte) => carte ?? null);
  return binder;
}

// Les pochettes vides en fin de binder ne sont pas gardées.
function tasser(binder) {
  while (binder.cartes.length && !binder.cartes.at(-1)) binder.cartes.pop();
}

// Nombre de cartes d'un binder (pochettes remplies).
export function nombreDeCartes(binder) {
  return binder.cartes.filter(Boolean).length;
}

// Place une carte (résumé, voir resumeCarte dans tcgdex.js) dans la pochette demandée si elle est vide,
// sinon dans la première pochette vide. Renvoie sa position (0 = première pochette).
export async function placerCarte(idBinder, carte, position = null) {
  const [{ libres }, entree] = await Promise.all([getBinders(), getCarteDeCollection(carte.id)]);
  const binder = libres.find((b) => b.id === idBinder);
  if (!binder) throw new Error("Binder introuvable");
  binder.cartes = Array.from(binder.cartes, (c) => c ?? null);
  if (!entree) throw new ErreurBinder("non-possedee");
  if (placementsDe(libres, carte.id) >= nombreExemplaires(entree)) throw new ErreurBinder("deja-placee");
  let place = position !== null && position >= 0 && !binder.cartes[position] ? position : binder.cartes.indexOf(null);
  if (place < 0) place = binder.cartes.length;
  while (binder.cartes.length < place) binder.cartes.push(null);
  binder.cartes[place] = carte;
  await enregistrerBinder(idBinder, { cartes: binder.cartes });
  return place;
}

// Déplace la carte d'une pochette vers une autre ; si l'autre est occupée, les deux cartes s'échangent.
export async function deplacerCarte(idBinder, depart, arrivee) {
  const binder = await binderModifiable(idBinder);
  while (binder.cartes.length <= Math.max(depart, arrivee)) binder.cartes.push(null);
  [binder.cartes[depart], binder.cartes[arrivee]] = [binder.cartes[arrivee], binder.cartes[depart]];
  tasser(binder);
  return enregistrerBinder(idBinder, { cartes: binder.cartes });
}

// Vide une pochette : les autres cartes ne bougent pas.
export async function retirerDuBinder(idBinder, position) {
  const binder = await binderModifiable(idBinder);
  binder.cartes[position] = null;
  tasser(binder);
  return enregistrerBinder(idBinder, { cartes: binder.cartes });
}

// ---------- Boutique ----------

async function debloques(categorie) {
  const lignes = await requete(supabase.from("deblocages").select("objet_id, objets_boutique!inner(categorie)")
    .eq("user_id", await moi()).eq("objets_boutique.categorie", categorie));
  return lignes.map((ligne) => ligne.objet_id);
}

// Couvertures illustrées de binders débloquées dans la boutique.
export async function getCouverturesDebloquees() {
  return debloques("couvertures");
}

// Bannières et cadres de profil débloqués dans la boutique.
export async function getObjetsDebloques() {
  return debloques("objets");
}

// Achat dans la boutique : le prix est celui de la base (table objets_boutique), pas celui affiché.
// Renvoie { ok: true, pieces } ; { ok: false, raison: "deja" | "pieces" | "inconnu", pieces } si l'achat est impossible.
export async function acheterObjet({ id }) {
  return requete(supabase.rpc("acheter_objet", { objet: id }));
}

// ---------- Scellé ----------
// [{ id, nom, type, serie, set, setNom, quantite, achat, revente, ajouteLe }]
// Produits ajoutés à la main : nom, type, série et set (identifiants TCGdex, "" si non précisés ; setNom garde
// le nom du set pour l'afficher sans rappeler TCGdex).
// achat et revente : prix par pièce saisis par l'utilisateur, en euros (null si non renseigné).
// Pokibind ne donne aucun prix pour le scellé.

const versProduit = (ligne) => ({
  id: ligne.id, nom: ligne.nom, type: ligne.type, serie: ligne.serie, set: ligne.set_id, setNom: ligne.set_nom,
  quantite: ligne.quantite, achat: ligne.achat === null ? null : Number(ligne.achat),
  revente: ligne.revente === null ? null : Number(ligne.revente), ajouteLe: ligne.ajoute_le,
});

function colonnesProduit(produit) {
  const colonnes = {};
  const champs = { nom: "nom", type: "type", serie: "serie", set: "set_id", setNom: "set_nom", quantite: "quantite", achat: "achat", revente: "revente" };
  for (const [cle, colonne] of Object.entries(champs)) if (produit[cle] !== undefined) colonnes[colonne] = produit[cle];
  return colonnes;
}

export async function getScelle() {
  const lignes = await requete(supabase.from("scelle").select("*").eq("user_id", await moi()).order("ajoute_le"));
  return lignes.map(versProduit);
}

export async function ajouterScelle(produit) {
  return versProduit(await requete(supabase.from("scelle").insert(colonnesProduit(produit)).select().single()));
}

export async function modifierScelle(id, changements) {
  const ligne = await requete(supabase.from("scelle").update(colonnesProduit(changements))
    .eq("user_id", await moi()).eq("id", id).select().maybeSingle());
  return ligne ? versProduit(ligne) : null;
}

export async function retirerScelle(id) {
  await requete(supabase.from("scelle").delete().eq("user_id", await moi()).eq("id", id));
}

export function valeurScelle(produits) {
  return produits.reduce((somme, produit) => somme + (Number(produit.quantite) || 0) * (Number(produit.revente) || 0), 0);
}

// ---------- Historique de la valeur ----------
// Un relevé par jour : [{ date: "2026-10-15", cartes, scelle }], du plus ancien au plus récent.
// TCGdex ne donne pas d'historique : la courbe se construit au fil des visites.

const JOURS_GARDES = 400;
const dateLocale = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export async function getHistorique() {
  const lignes = await requete(supabase.from("historique").select("jour, cartes, scelle").eq("user_id", await moi()).order("jour"));
  return lignes.map((ligne) => ({ date: ligne.jour, cartes: Number(ligne.cartes), scelle: Number(ligne.scelle) }));
}

export async function enregistrerValeur({ cartes, scelle }) {
  const utilisateur = await moi();
  const maintenant = new Date();
  await requete(supabase.from("historique").upsert({
    user_id: utilisateur, jour: dateLocale(maintenant), cartes: Math.round(cartes * 100) / 100, scelle: Math.round(scelle * 100) / 100,
  }));
  const limite = new Date(maintenant);
  limite.setDate(limite.getDate() - JOURS_GARDES);
  await requete(supabase.from("historique").delete().eq("user_id", utilisateur).lt("jour", dateLocale(limite)));
  return getHistorique();
}

// ---------- Chase cards ----------
// chase : { budget: nombre ou null, cartes: [{ id, nom, numero, image, set, langue, variante,
//           prixMax, priorite: "haute" | "moyenne" | "basse", prix, prixLe, ajouteeLe }] }
// « prix » : dernière tendance Cardmarket connue de la variante cherchée (null si inconnue).
// Une chase card est « trouvée » dès que la carte est dans la collection.

export const PRIORITES = [
  { cle: "haute", nom: "Priorité haute" },
  { cle: "moyenne", nom: "Priorité moyenne" },
  { cle: "basse", nom: "Priorité basse" },
];

const versChase = (ligne) => ({
  ...ligne.carte, id: ligne.carte_id, variante: ligne.variante, prixMax: Number(ligne.prix_max), priorite: ligne.priorite,
  prix: ligne.prix === null ? null : Number(ligne.prix), prixLe: ligne.prix_le, ajouteeLe: ligne.ajoutee_le,
});

function ligneChase(utilisateur, chase) {
  const { variante, prixMax, priorite, prix, prixLe, ajouteeLe, ...carte } = chase;
  return {
    user_id: utilisateur, carte_id: chase.id, carte, variante, prix_max: prixMax, priorite,
    prix: prix ?? null, prix_le: prixLe ?? null, ajoutee_le: ajouteeLe,
  };
}

export async function getChaseCards() {
  const utilisateur = await moi();
  const [lignes, reglages] = await Promise.all([
    requete(supabase.from("chase_cards").select("*").eq("user_id", utilisateur).order("ajoutee_le")),
    requete(supabase.from("reglages").select("budget").eq("user_id", utilisateur).maybeSingle()),
  ]);
  return { budget: reglages?.budget === null || reglages?.budget === undefined ? null : Number(reglages.budget), cartes: lignes.map(versChase) };
}

export async function getChaseCard(id) {
  const ligne = await requete(supabase.from("chase_cards").select("*").eq("user_id", await moi()).eq("carte_id", id).maybeSingle());
  return ligne ? versChase(ligne) : null;
}

// Ajoute la carte, ou remplace ses réglages si elle est déjà suivie.
export async function enregistrerChaseCard(carte) {
  const ancienne = await getChaseCard(carte.id);
  const nouvelle = { ...carte, ajouteeLe: ancienne?.ajouteeLe ?? new Date().toISOString() };
  await requete(supabase.from("chase_cards").upsert(ligneChase(await moi(), nouvelle)));
  return nouvelle;
}

// changements : { prixMax, priorite, prix, prixLe… }
export async function modifierChaseCard(id, changements) {
  const carte = await getChaseCard(id);
  if (!carte) return null;
  Object.assign(carte, changements);
  await requete(supabase.from("chase_cards").upsert(ligneChase(await moi(), carte)));
  return carte;
}

export async function retirerChaseCard(id) {
  await requete(supabase.from("chase_cards").delete().eq("user_id", await moi()).eq("carte_id", id));
}

export async function choisirBudgetChase(budget) {
  await requete(supabase.from("reglages").upsert({ user_id: await moi(), budget }));
}

// ---------- Import des données gardées dans le navigateur (version 1 du site) ----------
// Une seule fois : les données sont ajoutées au compte, puis la copie du navigateur est effacée.
// Ce qui existe déjà dans le compte est gardé tel quel. Les pièces, badges et achats ne sont pas importés :
// la base les recalcule (cadeau de bienvenue, badges et sets complétés d'après la collection importée).

const CLES_LOCALES = ["collection", "binders", "chase", "scelle", "historique", "recompenses", "couvertures", "objets", "session"];

// Ce que le navigateur garde encore : { cartes, binders, chase, scelle, profil }, ou null s'il n'y a rien à importer.
export function donneesLocales() {
  const resume = {
    cartes: Object.keys(lireLocal("collection", {}) ?? {}).length,
    binders: (lireLocal("binders", {})?.libres ?? []).length,
    chase: (lireLocal("chase", {})?.cartes ?? []).length,
    scelle: (lireLocal("scelle", []) ?? []).length,
    profil: Boolean(lireLocal("profil", null)?.pseudo),
  };
  return resume.cartes || resume.binders || resume.chase || resume.scelle || resume.profil ? resume : null;
}

const tableau = (valeur) => (Array.isArray(valeur) ? valeur : []);
const VARIANTES = ["normale", "reverse", "holo", "pokeball", "masterball"];

export async function importerDonneesLocales() {
  const utilisateur = await moi();
  const sansDoublons = { ignoreDuplicates: true };

  const cartes = Object.values(lireLocal("collection", {}) ?? {}).map((entree) => {
    const variantes = Object.fromEntries(Object.entries(entree.variantes ?? {})
      .filter(([variante, nombre]) => VARIANTES.includes(variante) && Number.isInteger(nombre) && nombre > 0)
      .map(([variante, nombre]) => [variante, Math.min(nombre, MAX_EXEMPLAIRES)]));
    return { user_id: utilisateur, carte_id: entree.id, carte: resumeSeul(entree), variantes, ajoutee_le: entree.ajouteeLe ?? new Date().toISOString() };
  }).filter((ligne) => ligne.carte_id && Object.keys(ligne.variantes).length);
  if (cartes.length) await requete(supabase.from("collection").upsert(cartes, sansDoublons));

  const binders = tableau(lireLocal("binders", {})?.libres).map((binder) => ({
    nom: String(binder.nom || "Mon binder").slice(0, 40), couverture: binder.couverture, cartes: tableau(binder.cartes).map((carte) => carte ?? null),
    cree_le: binder.creeLe ?? new Date().toISOString(),
  }));
  if (binders.length) await requete(supabase.from("binders").insert(binders));

  const chase = lireLocal("chase", {}) ?? {};
  const suivies = tableau(chase.cartes).map((carte) => ligneChase(utilisateur, carte));
  if (suivies.length) await requete(supabase.from("chase_cards").upsert(suivies, sansDoublons));
  if (typeof chase.budget === "number") await requete(supabase.from("reglages").upsert({ user_id: utilisateur, budget: chase.budget }, sansDoublons));

  const produits = tableau(lireLocal("scelle", [])).map(colonnesProduit);
  if (produits.length) await requete(supabase.from("scelle").insert(produits));

  const releves = tableau(lireLocal("historique", [])).map((releve) => ({ user_id: utilisateur, jour: releve.date, cartes: releve.cartes, scelle: releve.scelle }));
  if (releves.length) await requete(supabase.from("historique").upsert(releves, sansDoublons));

  // Profil : seulement s'il n'y en a pas déjà un en ligne (si le pseudo est pris, il sera choisi à nouveau)
  const profil = lireLocal("profil", null);
  if (profil?.pseudo && !(await lireProfil())) {
    try {
      await enregistrerProfil(profil);
    } catch (erreur) {
      if (!(erreur instanceof ErreurPseudoPris)) throw erreur;
      ecrireLocal("profil", { favorites: tableau(profil.favorites) });
    }
  } else if (profil?.pseudo) {
    effacerLocal("profil");
  }

  for (const cle of CLES_LOCALES) effacerLocal(cle);
}
