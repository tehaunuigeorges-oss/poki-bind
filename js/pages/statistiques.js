// Statistiques : valeur de la collection (cartes et scellé), son évolution, et sa composition
// (sets, types d'énergie, raretés, sets complétés, cartes les plus chères).
// À l'ouverture, les prix de plus d'un jour sont remis à jour depuis TCGdex, puis la valeur du jour
// est enregistrée : c'est ce relevé quotidien qui dessine la courbe (TCGdex n'a pas d'historique).

import { getCollection, majCarte, nombreExemplaires, valeurEntree, getScelle, valeurScelle,
  getHistorique, enregistrerValeur } from "../donnees.js";
import { getCarte, getIndex, resumeCarte, estOfficielle, VARIANTES, imageCarte } from "../tcgdex.js";
import { illustration } from "../visuel-carte.js";
import { echapper, normaliser, formaterNombre, formaterPrix, initiales } from "../outils.js";

const UN_JOUR = 20 * 60 * 60 * 1000; // un prix de plus de 20 h est remis à jour
const EN_PARALLELE = 4;
const TYPES = ["plante", "eau", "feu", "psy", "incolore", "electrique", "combat", "obscurite", "metal", "dragon", "fee"];

const zone = document.getElementById("stats");
const etatMaj = document.getElementById("maj-prix");
const graphique = document.getElementById("graphique");
const pourcentage = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
const pourcentEntier = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const euroSigne = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", signDisplay: "exceptZero" });
const jourCourt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const jourLong = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

let collection = [];
let scelle = [];
let historique = [];
let index = null;
let jours = 365;

const pluriel = (nombre, mot, motPluriel = `${mot}s`) => `${formaterNombre(nombre)} ${nombre > 1 ? motPluriel : mot}`;
const dateDe = (texte) => { const [a, m, j] = texte.split("-").map(Number); return new Date(a, m - 1, j); };

// ---------- Calculs ----------

function parSet() {
  const sets = new Map();
  for (const entree of collection) {
    const id = entree.set?.id ?? "";
    if (!sets.has(id)) {
      const infos = index?.sets.get(id);
      sets.set(id, { id, nom: infos?.nom ?? entree.set?.nom ?? id, logo: infos?.logo ?? null,
        officiel: infos?.officiel ?? entree.set?.officiel ?? 0, cartes: 0, officielles: 0 });
    }
    const set = sets.get(id);
    set.cartes += 1;
    if (estOfficielle(entree.numero, set.officiel)) set.officielles += 1;
  }
  return [...sets.values()];
}

// Variation estimée sur 30 jours : tendance du jour comparée à la moyenne des 30 derniers jours
function variation30() {
  let ecart = 0;
  let connue = false;
  for (const entree of collection) {
    for (const [cle, nombre] of Object.entries(entree.variantes)) {
      const actuel = entree.prix?.[cle];
      const avant = entree.prix30?.[cle];
      if (actuel && avant) {
        ecart += nombre * (actuel - avant);
        connue = true;
      }
    }
  }
  return connue ? ecart : null;
}

function compter(cle) {
  const totaux = new Map();
  for (const entree of collection) {
    const valeur = cle(entree);
    if (valeur) totaux.set(valeur, (totaux.get(valeur) ?? 0) + 1);
  }
  return [...totaux.entries()].sort((a, b) => b[1] - a[1]);
}

// ---------- Affichage ----------

function barres(idListe, lignes, icone = () => "") {
  const max = Math.max(1, ...lignes.map(([, nombre]) => nombre));
  document.getElementById(idListe).innerHTML = lignes.length
    ? lignes.map(([nom, nombre]) => `<li>
        <span class="barre-nom">${icone(nom)}<span>${echapper(nom)}</span></span>
        <span class="barre" aria-hidden="true"><span style="width: ${Math.max(2, (nombre / max) * 100).toFixed(1)}%"></span></span>
        <span class="barre-valeur num">${formaterNombre(nombre)}</span>
      </li>`).join("")
    : '<li class="aide-resultats">Pas encore de données : elles arrivent avec la mise à jour des prix.</li>';
}

function iconeType(nom) {
  const cle = normaliser(nom);
  return TYPES.includes(cle) ? `<img src="img/energies/energie-${cle}.png" alt="" width="18" height="18">` : "";
}

function vignette(set) {
  const sigle = /^\d+$/.test(set.nom) ? set.nom : initiales(set.nom);
  return `<span class="vignette-set petite" data-sigle="${echapper(sigle)}">${illustration(set.logo)}</span>`;
}

function afficherChiffres() {
  const valeurCartes = collection.reduce((somme, entree) => somme + valeurEntree(entree), 0);
  const valeurDuScelle = valeurScelle(scelle);
  const total = valeurCartes + valeurDuScelle;
  const exemplaires = collection.reduce((somme, entree) => somme + nombreExemplaires(entree), 0);
  const ecart = variation30();

  document.getElementById("kpi-total").textContent = formaterPrix(total);
  const detail = document.getElementById("kpi-total-detail");
  detail.textContent = ecart === null ? "variation sur 30 jours bientôt disponible" : `${euroSigne.format(ecart)} sur 30 jours`;
  detail.className = `kpi-detail num${ecart > 0 ? " hausse" : ecart < 0 ? " baisse" : ""}`;
  document.getElementById("kpi-cartes").textContent = formaterPrix(valeurCartes);
  document.getElementById("kpi-cartes-detail").textContent = `${pluriel(exemplaires, "carte")} · prix Cardmarket`;
  document.getElementById("kpi-scelle").textContent = formaterPrix(valeurDuScelle);
  document.getElementById("kpi-scelle-detail").textContent = scelle.length
    ? `${pluriel(scelle.length, "produit")} · ton estimation`
    : "aucun produit scellé pour l'instant";

  const sets = parSet();
  const complets = sets.filter((set) => set.officiel && set.officielles >= set.officiel);
  const enCours = sets.filter((set) => set.officiel && set.officielles < set.officiel)
    .sort((a, b) => b.officielles / b.officiel - a.officielles / a.officiel);
  const prochain = enCours[0];
  document.getElementById("kpi-sets").textContent = `${formaterNombre(complets.length)} / ${formaterNombre(sets.length)}`;
  document.getElementById("kpi-sets-detail").textContent = prochain
    ? `prochain : ${prochain.nom} (${pourcentEntier.format(prochain.officielles / prochain.officiel)})` : "";

  // Répartition cartes / scellé
  const partCartes = total ? valeurCartes / total : 1;
  document.getElementById("repartition").innerHTML = `
    <div class="barre-repartition" aria-hidden="true">
      <span class="serie-cartes" style="flex-grow: ${partCartes}"></span>
      ${valeurDuScelle ? `<span class="serie-scelle" style="flex-grow: ${1 - partCartes}"></span>` : ""}
    </div>
    <div class="legende num">
      <span class="avec-pastille"><span class="pastille serie-cartes" aria-hidden="true"></span>Cartes ${formaterPrix(valeurCartes)} · ${pourcentEntier.format(partCartes)}</span>
      <span class="avec-pastille"><span class="pastille serie-scelle" aria-hidden="true"></span>Scellé ${formaterPrix(valeurDuScelle)} · ${pourcentEntier.format(1 - partCartes)}</span>
      <span class="legende-total">Total ${formaterPrix(total)}</span>
    </div>`;

  // Barres
  barres("barres-sets", [...sets].sort((a, b) => b.cartes - a.cartes).slice(0, 6).map((set) => [set.nom, set.cartes]));
  barres("barres-types", compter((entree) => (entree.categorie === "Pokémon" ? entree.types?.[0] : "")), iconeType);
  barres("barres-raretes", compter((entree) => entree.rarete));

  // Sets complétés, puis le plus proche
  document.getElementById("complets-compte").textContent = `${formaterNombre(complets.length)} sur ${formaterNombre(sets.length)}`;
  const ligne = (set, texte, classe = "") => `<li${classe ? ` class="${classe}"` : ""}>
      <a href="set.html?id=${encodeURIComponent(set.id)}">${vignette(set)}<span class="complet-nom">${texte}</span></a>
      <span class="num">${formaterNombre(set.officielles)} / ${formaterNombre(set.officiel)}${classe ? ` · encore ${formaterNombre(set.officiel - set.officielles)}` : ""}</span>
    </li>`;
  document.getElementById("liste-complets").innerHTML =
    complets.map((set) => ligne(set, echapper(set.nom))).join("")
    + (prochain ? ligne(prochain, `Le plus proche : ${echapper(prochain.nom)}`, "le-plus-proche") : "")
    || '<li class="aide-resultats">Aucun set pour l\'instant.</li>';

  // Cartes les plus chères : la variante possédée la plus chère de chaque carte
  const cheres = collection.map((entree) => {
    const [cle, prix] = Object.keys(entree.variantes)
      .map((v) => [v, entree.prix?.[v] ?? 0]).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    return { entree, cle, prix, avant: entree.prix30?.[cle] ?? null };
  }).filter((c) => c.prix > 0).sort((a, b) => b.prix - a.prix).slice(0, 5);
  document.querySelector("#cartes-cheres tbody").innerHTML = cheres.length
    ? cheres.map(({ entree, cle, prix, avant }) => {
      const evolution = avant ? (prix - avant) / avant : null;
      const variante = VARIANTES.find((v) => v.cle === cle);
      const numero = entree.set?.officiel ? `${entree.numero}/${entree.set.officiel}` : entree.numero;
      const image = imageCarte(entree.image, "low");
      return `<tr>
          <td>${image ? `<img class="mini-carte" src="${echapper(image)}" alt="" width="40" height="55" loading="lazy">` : '<span class="mini-carte"></span>'}</td>
          <td><a href="carte.html?id=${encodeURIComponent(entree.id)}">${echapper(entree.nom)}</a>${variante && cle !== "normale" ? ` <small>· ${variante.nom}</small>` : ""}</td>
          <td class="secondaire">${echapper(`${entree.set?.nom ?? ""} · ${numero}`)}</td>
          <td class="nombre num">${formaterPrix(prix)}</td>
          <td class="nombre num${evolution > 0 ? " hausse" : evolution < 0 ? " baisse" : ""}">${evolution === null ? "—" : pourcentage.format(evolution)}</td>
        </tr>`;
    }).join("")
    : '<tr><td colspan="5" class="aide-resultats">Aucune carte avec un prix connu pour l\'instant.</td></tr>';
}

// ---------- Courbe de la valeur ----------
// Aire empilée : cartes en bas, scellé au-dessus ; le haut de la pile est le total.

let points = [];

function echelleY(max) {
  const brut = max / 4 || 1;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * puissance).find((p) => p >= brut);
  return { pas, haut: pas * 4 };
}

function afficherCourbe() {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  debut.setDate(debut.getDate() - jours);
  points = historique.filter((releve) => dateDe(releve.date) >= debut);
  for (const bouton of document.querySelectorAll("#periodes button")) bouton.setAttribute("aria-pressed", String(Number(bouton.dataset.jours) === jours));

  if (points.length < 2) {
    const premier = historique[0];
    graphique.innerHTML = `<div class="courbe-attente">
        <p><b>La courbe se remplit jour après jour.</b></p>
        <p>TCGdex ne garde pas l'historique des prix : Pokibind relève la valeur de ta collection à chaque visite de cette page, une fois par jour. Reviens demain pour voir le deuxième point.</p>
        ${premier ? `<p class="num">Premier relevé : ${jourLong.format(dateDe(premier.date))}, ${formaterPrix(premier.cartes + premier.scelle)}.</p>` : ""}
      </div>`;
    return;
  }

  const largeur = Math.max(280, graphique.clientWidth);
  const hauteur = largeur < 500 ? 200 : 240;
  const marge = { haut: 12, droite: largeur < 500 ? 52 : 64, bas: 26, gauche: 52 };
  const t0 = dateDe(points[0].date).getTime();
  const t1 = dateDe(points.at(-1).date).getTime();
  const { pas, haut } = echelleY(Math.max(...points.map((p) => p.cartes + p.scelle)));
  const x = (date) => marge.gauche + ((dateDe(date).getTime() - t0) / (t1 - t0)) * (largeur - marge.gauche - marge.droite);
  const y = (valeur) => marge.haut + (1 - valeur / haut) * (hauteur - marge.haut - marge.bas);
  const ligne = (valeur) => points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)} ${y(valeur(p)).toFixed(1)}`).join(" ");
  const retour = (valeur) => [...points].reverse().map((p) => `L${x(p.date).toFixed(1)} ${y(valeur(p)).toFixed(1)}`).join(" ");
  const cartes = (p) => p.cartes;
  const total = (p) => p.cartes + p.scelle;
  const aScelle = points.some((p) => p.scelle > 0);

  const grille = [0, 1, 2, 3, 4].map((i) => {
    const valeur = pas * i;
    return `<line class="axe-grille" x1="${marge.gauche}" x2="${largeur - marge.droite}" y1="${y(valeur)}" y2="${y(valeur)}"/>
      <text class="axe-texte" x="${marge.gauche - 8}" y="${y(valeur) + 4}" text-anchor="end">${formaterNombre(valeur)}</text>`;
  }).join("");
  const nbDates = Math.min(points.length, largeur < 500 ? 3 : 6);
  const dates = Array.from({ length: nbDates }, (_, i) => points[Math.round((i * (points.length - 1)) / Math.max(1, nbDates - 1))])
    .map((p) => `<text class="axe-texte" x="${x(p.date)}" y="${hauteur - 6}" text-anchor="middle">${jourCourt.format(dateDe(p.date))}</text>`).join("");
  const dernier = points.at(-1);

  graphique.innerHTML = `
    <svg class="courbe-valeur" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}" role="img"
      aria-label="Évolution de la valeur : de ${formaterPrix(total(points[0]))} le ${jourLong.format(dateDe(points[0].date))} à ${formaterPrix(total(dernier))} le ${jourLong.format(dateDe(dernier.date))}">
      ${grille}
      <path class="aire-cartes" d="${ligne(cartes)} L${x(dernier.date)} ${y(0)} L${x(points[0].date)} ${y(0)}Z"/>
      ${aScelle ? `<path class="aire-scelle" d="${ligne(total)} ${retour(cartes)}Z"/>` : ""}
      <path class="trait-cartes" d="${ligne(cartes)}"/>
      ${aScelle ? `<path class="trait-scelle" d="${ligne(total)}"/>` : ""}
      ${dates}
      <text class="etiquette-serie" x="${largeur - marge.droite + 6}" y="${y(total(dernier)) + 4}">Total</text>
      ${aScelle ? `<text class="etiquette-serie" x="${largeur - marge.droite + 6}" y="${Math.max(y(cartes(dernier)) + 4, y(total(dernier)) + 18)}">Cartes</text>` : ""}
      <g class="reperes" hidden>
        <line class="repere-ligne" y1="${marge.haut}" y2="${hauteur - marge.bas}"/>
        <circle class="repere-point serie-cartes" r="4.5"/>
        ${aScelle ? '<circle class="repere-point serie-scelle" r="4.5"/>' : ""}
      </g>
      <rect class="zone-survol" x="${marge.gauche}" y="0" width="${largeur - marge.gauche - marge.droite}" height="${hauteur}" tabindex="0"
        aria-label="Parcourir les relevés avec les flèches gauche et droite"/>
    </svg>
    <div class="info-bulle" role="status" hidden></div>
    <details class="valeurs-detail">
      <summary>Voir les valeurs</summary>
      <div class="tableau-defilant"><table class="tableau">
        <thead><tr><th scope="col">Date</th><th scope="col" class="nombre">Cartes</th><th scope="col" class="nombre">Scellé</th><th scope="col" class="nombre">Total</th></tr></thead>
        <tbody>${[...points].reverse().map((p) => `<tr><td>${jourLong.format(dateDe(p.date))}</td><td class="nombre num">${formaterPrix(p.cartes)}</td><td class="nombre num">${formaterPrix(p.scelle)}</td><td class="nombre num">${formaterPrix(total(p))}</td></tr>`).join("")}</tbody>
      </table></div>
    </details>`;

  // Survol et clavier : repère vertical, points et bulle sur le relevé le plus proche
  const svg = graphique.querySelector("svg");
  const reperes = svg.querySelector(".reperes");
  const bulle = graphique.querySelector(".info-bulle");
  const zoneSurvol = svg.querySelector(".zone-survol");
  let courant = points.length - 1;
  function montrer(i) {
    courant = Math.max(0, Math.min(points.length - 1, i));
    const p = points[courant];
    const px = x(p.date);
    reperes.hidden = false;
    reperes.querySelector(".repere-ligne").setAttribute("x1", px);
    reperes.querySelector(".repere-ligne").setAttribute("x2", px);
    reperes.querySelector(".serie-cartes").setAttribute("cx", px);
    reperes.querySelector(".serie-cartes").setAttribute("cy", y(cartes(p)));
    reperes.querySelector(".serie-scelle")?.setAttribute("cx", px);
    reperes.querySelector(".serie-scelle")?.setAttribute("cy", y(total(p)));
    bulle.hidden = false;
    bulle.innerHTML = `<b>${jourLong.format(dateDe(p.date))}</b>
      <span class="avec-pastille"><span class="pastille serie-cartes" aria-hidden="true"></span>Cartes ${formaterPrix(p.cartes)}</span>
      ${aScelle ? `<span class="avec-pastille"><span class="pastille serie-scelle" aria-hidden="true"></span>Scellé ${formaterPrix(p.scelle)}</span>` : ""}
      <span>Total ${formaterPrix(total(p))}</span>`;
    const gauche = Math.min(Math.max(px - bulle.offsetWidth / 2, 0), largeur - bulle.offsetWidth);
    bulle.style.left = `${gauche}px`;
  }
  function cacher() {
    reperes.hidden = true;
    bulle.hidden = true;
  }
  zoneSurvol.addEventListener("pointermove", (evenement) => {
    const rect = svg.getBoundingClientRect();
    const px = evenement.clientX - rect.left;
    let proche = 0;
    points.forEach((p, i) => { if (Math.abs(x(p.date) - px) < Math.abs(x(points[proche].date) - px)) proche = i; });
    montrer(proche);
  });
  zoneSurvol.addEventListener("pointerleave", cacher);
  zoneSurvol.addEventListener("focus", () => montrer(courant));
  zoneSurvol.addEventListener("blur", cacher);
  zoneSurvol.addEventListener("keydown", (evenement) => {
    if (evenement.key === "ArrowLeft") { montrer(courant - 1); evenement.preventDefault(); }
    if (evenement.key === "ArrowRight") { montrer(courant + 1); evenement.preventDefault(); }
  });
}

document.getElementById("periodes").addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("button[data-jours]");
  if (!bouton) return;
  jours = Number(bouton.dataset.jours);
  afficherCourbe();
});

let redimension = 0;
addEventListener("resize", () => {
  clearTimeout(redimension);
  redimension = setTimeout(afficherCourbe, 150);
});

// ---------- Mise à jour des prix ----------

async function mettreAJourLesPrix() {
  const maintenant = Date.now();
  const anciennes = collection.filter((entree) =>
    !entree.prixLe || maintenant - new Date(entree.prixLe).getTime() > UN_JOUR || entree.rarete === undefined);
  if (anciennes.length === 0) return;
  let faites = 0;
  let ratees = 0;
  const afficherEtat = () => { etatMaj.textContent = `Mise à jour des prix : ${formaterNombre(faites)} / ${formaterNombre(anciennes.length)}…`; };
  afficherEtat();
  const file = [...anciennes];
  async function ouvrier() {
    while (file.length) {
      const entree = file.shift();
      try {
        await majCarte(resumeCarte(await getCarte(entree.id)));
      } catch (erreur) {
        ratees += 1;
      }
      faites += 1;
      afficherEtat();
    }
  }
  await Promise.all(Array.from({ length: EN_PARALLELE }, ouvrier));
  etatMaj.textContent = ratees
    ? `${pluriel(ratees, "carte n'a", "cartes n'ont")} pas pu être mise${ratees > 1 ? "s" : ""} à jour : leur dernier prix connu est utilisé.`
    : "Prix mis à jour.";
  collection = await getCollection();
}

// ---------- Chargement ----------

[collection, scelle, historique] = await Promise.all([getCollection(), getScelle(), getHistorique()]);
if (collection.length === 0 && scelle.length === 0) {
  zone.hidden = true;
  document.getElementById("stats-vide").hidden = false;
} else {
  afficherChiffres();
  afficherCourbe();
  zone.removeAttribute("aria-busy");
  index = await getIndex().catch(() => null);
  await mettreAJourLesPrix();
  historique = await enregistrerValeur({
    cartes: collection.reduce((somme, entree) => somme + valeurEntree(entree), 0),
    scelle: valeurScelle(scelle),
  });
  afficherChiffres();
  afficherCourbe();
}
