// Fiche d'une carte (carte.html?id=sv08.5-074) : image, variantes avec le nombre d'exemplaires,
// informations, prix Cardmarket de la variante choisie et sa courbe.

import { getCarte, getSet, setDeCarte, variantesDeCarte, resumeCarte, numeroLisible, imageDeSecours, getSerie, ErreurTcgdex } from "../tcgdex.js";
import { getCarteDeCollection, ajouterCarte, retirerCarte, getBinders, placerCarte, nombreDeCartes, nombreExemplaires,
  placementsDe, ErreurBinder } from "../donnees.js";
import { visuelCarte, illustration } from "../visuel-carte.js";
import { echapper, normaliser, formaterPrix, formaterMois, annoncer } from "../outils.js";

const zone = document.getElementById("fiche-page");
const squelette = zone.innerHTML;
const id = new URLSearchParams(location.search).get("id") ?? "";

const TYPES = ["feu", "eau", "plante", "electrique", "psy", "combat", "obscurite", "metal", "fee", "dragon", "incolore"];

// Page de recherche d'où l'on vient (avec ses paramètres, ex. « recherche.html?q=salameche »), ou null.
const recherchePrecedente = (() => {
  try {
    const precedente = new URL(document.referrer);
    const page = precedente.pathname.split("/").pop();
    return precedente.origin === location.origin && /^recherche(\.html)?$/.test(page) ? page + precedente.search : null;
  } catch (erreur) {
    return null;
  }
})();

let carte = null;    // réponse de TCGdex
let variantes = [];  // voir variantesDeCarte dans tcgdex.js
let entree = null;   // la carte dans la collection, ou null
let choisie = "";    // variante affichée dans l'encadré des prix

const icone = (dessin) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${dessin}</svg>`;
const ICONE_PLUS = icone('<path d="M12 6v12M6 12h12"/>');
const ICONE_MOINS = icone('<path d="M6 12h12"/>');

const pourcentage = new Intl.NumberFormat("fr-FR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
const jourEtMois = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

// ---------- Morceaux de la fiche ----------

function ligneVariante(variante) {
  if (!variante.existe) {
    return `<li class="variante absente">${variante.nom} <small>· n'existe pas pour cette carte</small></li>`;
  }
  const prix = variante.prix
    ? `<span class="variante-prix num">${formaterPrix(variante.prix.tendance)}</span>`
    : '<span class="variante-prix indisponible">Prix indisponible</span>';
  return `<li class="variante" data-variante="${variante.cle}">
      <button class="variante-choix" type="button" aria-pressed="false" data-choisir="${variante.cle}">
        <span>${variante.nom}</span>${prix}
      </button>
      <div class="quantite" role="group" aria-label="Exemplaires ${variante.nom}">
        <button type="button" data-retirer="${variante.cle}" aria-label="Retirer un exemplaire (${variante.nom})">${ICONE_MOINS}</button>
        <span class="num" data-quantite="${variante.cle}">0</span>
        <button type="button" data-ajouter="${variante.cle}" aria-label="Ajouter un exemplaire (${variante.nom})">${ICONE_PLUS}</button>
      </div>
    </li>`;
}

function types() {
  const liste = (carte.types ?? []).map((type) => {
    const cle = normaliser(type);
    const image = TYPES.includes(cle) ? `<img src="img/energies/energie-${cle}.png" alt="" width="20" height="20">` : "";
    return `<span class="type">${image}${echapper(type)}</span>`;
  });
  return liste.join("") || "—";
}

function faits(numero, set) {
  const lignes = [
    ["Numéro", `<span class="num">${echapper(numero)}</span>`],
    ["Rareté", echapper(carte.rarity ?? "—")],
    carte.category === "Pokémon"
      ? ["Type", types()]
      : ["Catégorie", echapper([carte.category, carte.trainerType ?? carte.energyType].filter(Boolean).join(" · ") || "—")],
    ["Sortie du set", echapper(formaterMois(set?.releaseDate) || "—")],
  ];
  return lignes.map(([titre, valeur]) => `<div><dt class="surtitre">${titre}</dt><dd>${valeur}</dd></div>`).join("");
}

// Courbe à 4 points : moyennes sur 30 jours, 7 jours et 1 jour, puis tendance du jour
// (TCGdex ne donne pas d'historique plus détaillé).
function courbe(prix, sens) {
  const valeurs = [prix.moyenne30, prix.moyenne7, prix.moyenne1, prix.tendance];
  const points = valeurs.map((valeur, rang) => [rang, valeur]).filter(([, valeur]) => valeur !== null);
  if (points.length < 2) return "";
  const nombres = points.map(([, valeur]) => valeur);
  const min = Math.min(...nombres);
  const ecart = Math.max(...nombres) - min;
  const x = (rang) => rang * 100;
  const y = (valeur) => (ecart ? 60 - ((valeur - min) / ecart) * 50 : 35).toFixed(1);
  const trace = points.map(([rang, valeur], n) => `${n ? "L" : "M"}${x(rang)} ${y(valeur)}`).join(" ");
  const [premier] = points;
  const [dernier, valeurFin] = points.at(-1);
  const libelles = ["moyenne sur 30 jours", "sur 7 jours", "sur 1 jour", "tendance du jour"];
  const description = valeurs
    .map((valeur, rang) => (valeur === null ? "" : `${libelles[rang]} ${formaterPrix(valeur)}`))
    .filter(Boolean).join(", ");
  return `<svg class="courbe ${sens}" viewBox="0 0 300 70" preserveAspectRatio="none" role="img" aria-label="Évolution du prix : ${description}">
      <path class="courbe-grille" d="M0 10H300M0 35H300M0 60H300"/>
      <path class="courbe-aire" d="${trace} L${x(dernier)} 70 L${x(premier[0])} 70Z"/>
      <path class="courbe-ligne" d="${trace}"/>
      <path class="courbe-point" d="M${x(dernier)} ${y(valeurFin)}h0"/>
    </svg>`;
}

function texteMiseAJour(date) {
  const jour = new Date(date);
  if (!date || Number.isNaN(jour.getTime())) return "";
  const minuit = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const ecart = Math.round((minuit(new Date()) - minuit(jour)) / 86400000);
  if (ecart <= 0) return "mis à jour aujourd'hui";
  if (ecart === 1) return "mis à jour hier";
  return `mis à jour le ${jourEtMois.format(jour)}`;
}

function afficherPrix() {
  const variante = variantes.find((v) => v.cle === choisie);
  const boite = document.getElementById("prix");
  const titre = `<h2 class="surtitre" id="titre-prix">Prix Cardmarket · ${variante.nom}</h2>`;
  const prix = variante.prix;
  if (!prix) {
    boite.innerHTML = `${titre}
      <p class="prix-valeur indisponible">Prix indisponible</p>
      <p class="prix-note">Pas assez de ventes récentes sur Cardmarket pour cette variante.</p>`;
    return;
  }
  const evolution = prix.moyenne30 ? (prix.tendance - prix.moyenne30) / prix.moyenne30 : null;
  const sens = evolution !== null && evolution < 0 ? "baisse" : "hausse";
  boite.innerHTML = `
    <div class="prix-ligne">
      ${titre}
      ${evolution === null ? "" : `<span class="${sens} num">${pourcentage.format(evolution)} sur 30 jours</span>`}
    </div>
    <div class="prix-ligne">
      <p class="prix-valeur num">${formaterPrix(prix.tendance)}</p>
      <p class="prix-note">${texteMiseAJour(prix.majLe)}</p>
    </div>
    ${courbe(prix, sens)}
    <p class="prix-note">Tendance du jour, comparée aux moyennes des ventes sur 30 jours, 7 jours et 1 jour.</p>`;
}

function majQuantites() {
  const quantites = entree?.variantes ?? {};
  const total = Object.values(quantites).reduce((somme, nombre) => somme + nombre, 0);
  document.getElementById("titre-variantes").textContent =
    total ? `Variantes · tu en as ${total}` : "Variantes · tu ne l'as pas encore";
  for (const variante of variantes.filter((v) => v.existe)) {
    const nombre = quantites[variante.cle] ?? 0;
    zone.querySelector(`[data-quantite="${variante.cle}"]`).textContent = nombre;
    zone.querySelector(`[data-retirer="${variante.cle}"]`).setAttribute("aria-disabled", String(nombre === 0));
    zone.querySelector(`[data-variante="${variante.cle}"]`).classList.toggle("possedee", nombre > 0);
  }
}

function choisir(cle) {
  choisie = cle;
  for (const bouton of zone.querySelectorAll("[data-choisir]")) {
    const active = bouton.dataset.choisir === cle;
    bouton.setAttribute("aria-pressed", String(active));
    bouton.closest(".variante").classList.toggle("est-choisie", active);
  }
  afficherPrix();
}

function afficher(set, serie) {
  const numero = numeroLisible(carte.localId);
  const officiel = carte.set?.cardCount?.official;
  const numeroComplet = officiel ? `${numero}/${officiel}` : numero;
  const nomSet = carte.set?.name ?? "";
  // Série puis set, chacun avec son illustration (logo de la série, symbole du set ou à défaut son logo)
  const illustrationSet = illustration(set?.symbol ?? carte.set?.symbol, "symbole") || illustration(set?.logo ?? carte.set?.logo);
  const surtitre = [
    set?.serie?.name ? `<span class="avec-illustration">${illustration(serie?.logo)}<span>${echapper(set.serie.name)}</span></span>` : "",
    nomSet ? `<span class="avec-illustration">${illustrationSet}<span>${echapper(nomSet)}</span></span>` : "",
  ].filter(Boolean).join('<span aria-hidden="true">·</span>');
  const teinte = TYPES.find((type) => type === normaliser(carte.types?.[0])) ?? "";
  document.title = `${carte.name} · ${nomSet} · Pokibind`;

  // Venu de la recherche, le lien du haut y ramène ; sinon, il mène au set de la carte.
  const lienRetour = recherchePrecedente
    ? `<a class="retour" id="retour-recherche" href="${echapper(recherchePrecedente)}">← Retour à la recherche</a>`
    : `<a class="retour avec-illustration" href="set.html?id=${encodeURIComponent(carte.set?.id ?? setDeCarte(carte.id))}">←${illustrationSet}<span>${echapper(nomSet || "Voir le set")}</span></a>`;
  const imageSecours = carte.image ? null : imageDeSecours(set?.serie?.id, carte.set?.id ?? setDeCarte(carte.id), numero);

  zone.removeAttribute("aria-busy");
  zone.innerHTML = `
    ${lienRetour}
    <div class="fiche">
      <div class="fiche-visuel">
        ${visuelCarte({ nom: carte.name, numero: numeroComplet, image: carte.image, imageSecours },
          { taille: "high", prioritaire: true, alt: `Carte ${carte.name}, ${nomSet} ${numeroComplet}`, teinte })}
        ${imageSecours ? '<p class="note-image">Image en anglais : TCGdex n\'a pas encore l\'image française de cette carte.</p>' : ""}
      </div>
      <div class="fiche-infos">
        <div class="fiche-titre">
          <p class="surtitre fiche-surtitre">${surtitre}</p>
          <h1>${echapper(carte.name)}</h1>
        </div>
        <section class="fiche-bloc" aria-labelledby="titre-variantes">
          <h2 class="surtitre" id="titre-variantes"></h2>
          <ul class="variantes">${variantes.map(ligneVariante).join("")}</ul>
        </section>
        <dl class="fiche-faits">${faits(numeroComplet, set)}</dl>
        <section class="prix" id="prix" aria-labelledby="titre-prix"></section>
        <div class="boutons fiche-actions">
          <button class="bouton" id="bouton-ajouter" type="button"><span aria-hidden="true">+</span> Ajouter à ma collection</button>
          <button class="bouton bouton-secondaire" id="bouton-binder" type="button">Placer dans un binder</button>
          <button class="bouton bouton-secondaire" id="bouton-chase" type="button"><span aria-hidden="true">☆</span> Ajouter aux chase cards</button>
        </div>
      </div>
    </div>`;
  majQuantites();
  choisir(choisie);
}

function afficherMessage(titre, texte, { erreur = false, reessayer = false } = {}) {
  zone.removeAttribute("aria-busy");
  zone.innerHTML = `<div class="encart${erreur ? " encart-erreur" : ""}"${erreur ? ' role="alert"' : ""}>
      <h1>${titre}</h1>
      <p>${texte}</p>
      <div class="boutons">
        ${reessayer ? '<button class="bouton bouton-petit" id="bouton-reessayer" type="button">Réessayer</button>' : ""}
        <a class="bouton bouton-petit bouton-secondaire" href="recherche.html">Rechercher une carte</a>
      </div>
    </div>`;
}

// ---------- Placer dans un binder ----------


const fenetrePlacer = document.getElementById("fenetre-placer");
const choixBinders = document.getElementById("choix-binders");
const boutonPlacer = document.getElementById("bouton-placer");

async function ouvrirFenetrePlacer() {
  const { libres } = await getBinders();
  // Seules les cartes de la collection vont dans un binder, pas plus que les exemplaires possédés
  if (!entree) {
    annoncer("Ajoute d'abord cette carte à ta collection : seules tes cartes vont dans un binder.");
    return;
  }
  if (placementsDe(libres, carte.id) >= nombreExemplaires(entree)) {
    annoncer("Tous tes exemplaires de cette carte sont déjà dans un binder.");
    return;
  }
  boutonPlacer.hidden = libres.length === 0;
  choixBinders.innerHTML = libres.length
    ? `<fieldset class="liste-choix"><legend class="sr-only">Binder</legend>${libres.map((binder, rang) => `
        <label class="case"><input type="radio" name="binder" value="${echapper(binder.id)}"${rang === 0 ? " checked" : ""}>
          <span>${echapper(binder.nom)} <small>· ${nombreDeCartes(binder)} ${nombreDeCartes(binder) > 1 ? "cartes" : "carte"}</small></span></label>`).join("")}
      </fieldset>
      <p class="champ-aide"><a href="binders.html?nouveau">Créer un autre binder</a></p>`
    : `<p>Tu n'as pas encore de binder.</p><p><a class="bouton bouton-petit" href="binders.html?nouveau">Créer un binder</a></p>`;
  fenetrePlacer.showModal();
}

document.getElementById("formulaire-placer").addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const choix = fenetrePlacer.querySelector("input[name=binder]:checked");
  if (!choix) return;
  const nom = choix.closest("label").querySelector("span").firstChild.textContent.trim();
  try {
    const position = await placerCarte(choix.value, resumeCarte(carte));
    fenetrePlacer.close();
    annoncer(`${carte.name} est dans « ${nom} », page ${Math.floor(position / 9) + 1}, pochette ${(position % 9) + 1}. Tu peux la déplacer depuis la page Binders.`);
  } catch (erreur) {
    fenetrePlacer.close();
    annoncer(erreur instanceof ErreurBinder
      ? "Tous tes exemplaires de cette carte sont déjà dans un binder."
      : "Impossible d'enregistrer : le stockage de ton navigateur est bloqué ou plein.");
  }
  document.getElementById("bouton-binder").focus();
});
document.getElementById("bouton-annuler-placer").addEventListener("click", () => fenetrePlacer.close());

// ---------- Actions ----------

async function changerQuantite(cle, difference) {
  const variante = variantes.find((v) => v.cle === cle);
  try {
    entree = difference > 0
      ? await ajouterCarte(resumeCarte(carte), cle, difference)
      : await retirerCarte(carte.id, cle, -difference);
  } catch (erreur) {
    annoncer("Impossible d'enregistrer : le stockage de ton navigateur est bloqué ou plein.");
    return;
  }
  majQuantites();
  const nombre = entree?.variantes[cle] ?? 0;
  annoncer(nombre
    ? `${variante.nom} : ${nombre} ${nombre > 1 ? "exemplaires" : "exemplaire"} dans ta collection.`
    : `${variante.nom} : plus aucun exemplaire dans ta collection.`);
}

zone.addEventListener("click", (evenement) => {
  // Retour à la recherche : comme le bouton Retour du navigateur, qui garde la place dans la liste.
  // Fiche ouverte dans un nouvel onglet : pas de page précédente, le lien s'ouvre normalement.
  const nouvelOnglet = evenement.ctrlKey || evenement.metaKey || evenement.shiftKey;
  if (evenement.target.closest("#retour-recherche") && history.length > 1 && !nouvelOnglet) {
    evenement.preventDefault();
    history.back();
    return;
  }
  const bouton = evenement.target.closest("button");
  if (!bouton || bouton.getAttribute("aria-disabled") === "true") return;
  const { choisir: aChoisir, ajouter, retirer } = bouton.dataset;
  if (aChoisir) choisir(aChoisir);
  else if (ajouter) changerQuantite(ajouter, 1);
  else if (retirer) changerQuantite(retirer, -1);
  else if (bouton.id === "bouton-ajouter") changerQuantite(choisie, 1);
  else if (bouton.id === "bouton-binder") ouvrirFenetrePlacer();
  else if (bouton.id === "bouton-chase") annoncer("Les chase cards arrivent à l'étape 8.");
  else if (bouton.id === "bouton-reessayer") charger();
});

// ---------- Chargement ----------

async function charger() {
  if (!id) {
    afficherMessage("Aucune carte choisie", "Cherche une carte pour ouvrir sa fiche.");
    return;
  }
  zone.setAttribute("aria-busy", "true");
  zone.innerHTML = squelette;
  try {
    const [donnees, set, possedee] = await Promise.all([
      getCarte(id),
      getSet(setDeCarte(id)).catch(() => null), // sans le set, la fiche s'affiche sans série ni date
      getCarteDeCollection(id),
    ]);
    carte = donnees;
    entree = possedee;
    variantes = variantesDeCarte(carte);
    const existantes = variantes.filter((v) => v.existe);
    choisie = (existantes.find((v) => entree?.variantes[v.cle]) ?? existantes[0]).cle;
    // Le logo de la série est dans sa fiche TCGdex (déjà en cache après une recherche)
    const serie = set?.serie?.id ? await getSerie(set.serie.id).catch(() => null) : null;
    afficher(set, serie);
  } catch (erreur) {
    if (erreur instanceof ErreurTcgdex && erreur.raison === "introuvable") {
      afficherMessage("Carte introuvable", "Cette carte n'existe pas dans la base de cartes TCGdex.");
    } else if (erreur instanceof ErreurTcgdex && erreur.raison === "reseau") {
      afficherMessage("Impossible de charger la carte", "La base de cartes TCGdex ne répond pas. Vérifie ta connexion internet, puis réessaie.", { erreur: true, reessayer: true });
    } else {
      afficherMessage("Impossible de charger la carte", "La base de cartes TCGdex ne répond pas correctement pour le moment. Réessaie dans quelques minutes.", { erreur: true, reessayer: true });
    }
  }
}

charger();
