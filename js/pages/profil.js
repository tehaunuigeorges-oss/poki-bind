// Mon profil. À la première visite : création du profil (pseudo, nom affiché, bio, bannière).
// Ensuite : bannière, avatar, nom, badge mis en avant, bio, chiffres, et quatre onglets (activité,
// binders, badges, chase cards) ; à côté, les prochains badges, les cartes favorites, la visibilité
// et le compte (déconnexion, suppression des données).

import { getSession, getProfil, enregistrerProfil, getRecompenses, getCollection, nombreExemplaires,
  getBinders, getChaseCards, seDeconnecter, supprimerMesDonnees } from "../donnees.js";
import { BADGES, mesures, prochainsBadges, setsCompletes, verifierRecompenses } from "../recompenses.js";
import { couverture } from "../couvertures.js";
import { imageCarte } from "../tcgdex.js";
import { echapper, formaterNombre, formaterPrix, initiales, annoncer } from "../outils.js";

const zone = document.getElementById("zone-profil");
const fenetre = document.getElementById("fenetre-profil");

// Bannières de base (les bannières illustrées arriveront avec la boutique)
const BANNIERES = [
  { id: "lagune", nom: "Lagune", couleurs: ["eau", "psy"] },
  { id: "prairie", nom: "Prairie", couleurs: ["plante", "electrique"] },
  { id: "braise", nom: "Braise", couleurs: ["feu", "fee"] },
  { id: "nuit", nom: "Nuit", couleurs: ["obscurite", "psy"] },
  { id: "acier", nom: "Acier", couleurs: ["metal", "eau"] },
];
const PSEUDO = /^[a-z0-9._-]{2,20}$/i;

const moisAnnee = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const relatif = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });
const pluriel = (nombre, mot, motPluriel = `${mot}s`) => `${formaterNombre(nombre)} ${nombre > 1 ? motPluriel : mot}`;

let profil = null;
let recompenses = null;
let valeurs = null;
let collection = [];
let binders = [];
let chase = [];
let onglet = "activite";

const fondBanniere = (id) => {
  const banniere = BANNIERES.find((b) => b.id === id) ?? BANNIERES[0];
  return `linear-gradient(120deg, var(--${banniere.couleurs[0]}), var(--${banniere.couleurs[1]}))`;
};

function ilYA(date) {
  const ecart = (new Date(date).getTime() - Date.now()) / 1000;
  if (ecart > -3600) return relatif.format(Math.round(Math.min(-1, ecart / 60)), "minute");
  if (ecart > -86400) return relatif.format(Math.round(ecart / 3600), "hour");
  if (ecart > -86400 * 30) return relatif.format(Math.round(ecart / 86400), "day");
  return relatif.format(Math.round(ecart / (86400 * 30)), "month");
}

const miniCarte = (carte) => {
  const image = imageCarte(carte.image, "low");
  return `<a class="mini-carte-lien" href="carte.html?id=${encodeURIComponent(carte.id)}">
      ${image ? `<img class="mini-carte grande" src="${echapper(image)}" alt="${echapper(carte.nom)}" loading="lazy">` : `<span class="mini-carte grande sans-image">${echapper(carte.nom)}</span>`}
    </a>`;
};

const imageBadge = (badge, taille = 40) => `<img class="image-badge" src="img/badges/${badge.image}.webp" alt="" width="${taille}" height="${taille}" loading="lazy">`;

// ---------- Activité : construite à partir des données (cartes, binders, chase cards, récompenses) ----------

function activite() {
  const evenements = [];
  // Cartes ajoutées, regroupées par jour et par set
  const groupes = new Map();
  for (const entree of collection) {
    if (!entree.ajouteeLe) continue;
    const cle = `${entree.ajouteeLe.slice(0, 10)}|${entree.set?.id}`;
    const groupe = groupes.get(cle) ?? { date: entree.ajouteeLe, set: entree.set?.nom ?? "", cartes: [] };
    groupe.cartes.push(entree);
    if (entree.ajouteeLe > groupe.date) groupe.date = entree.ajouteeLe;
    groupes.set(cle, groupe);
  }
  for (const groupe of groupes.values()) {
    evenements.push({ date: groupe.date, html: `<p>a ajouté ${pluriel(groupe.cartes.length, "carte")} à <b>${echapper(groupe.set)}</b>.</p>
      <div class="activite-cartes">${groupe.cartes.slice(0, 4).map(miniCarte).join("")}</div>` });
  }
  for (const binder of binders) {
    if (!binder.creeLe) continue;
    const choix = couverture(binder.couverture);
    const visuel = choix.type === "illustre"
      ? `<img class="activite-couverture" src="${choix.image}-couverture.webp" alt="" loading="lazy">`
      : `<span class="activite-couverture" style="--teinte: var(--${choix.couleur})"></span>`;
    evenements.push({ date: binder.creeLe, html: `<p>a créé le binder <b>${echapper(binder.nom)}</b>.</p>
      <a class="activite-lien" href="binders.html?binder=${encodeURIComponent(binder.id)}">${visuel}<span class="sr-only">Ouvrir le binder ${echapper(binder.nom)}</span></a>` });
  }
  const possedees = new Map(collection.map((entree) => [entree.id, entree]));
  for (const carte of chase) {
    const entree = possedees.get(carte.id);
    if (!entree?.ajouteeLe) continue;
    evenements.push({ date: entree.ajouteeLe, html: `<p>a trouvé une chase card : <b>${echapper(carte.nom)}</b> (${echapper(carte.set?.nom ?? "")}).</p>
      <div class="activite-cartes">${miniCarte(carte)}</div>` });
  }
  for (const ligne of recompenses.journal) {
    const badge = BADGES.find((b) => b.cle === ligne.cle);
    const encart = badge
      ? `<span class="activite-badge">${imageBadge(badge)}<span><b>${echapper(badge.nom)}</b><small>${ligne.pieces ? `+${formaterNombre(ligne.pieces)} pièces` : "Badge"}</small></span></span>`
      : `<span class="activite-badge"><span class="pastille-set" aria-hidden="true">✓</span><span><b>Set complété</b><small>+${formaterNombre(ligne.pieces)} pièces</small></span></span>`;
    evenements.push({ date: ligne.date, html: `<p>${badge ? `a débloqué le badge <b>${echapper(badge.nom)}</b>.` : `a complété le set <b>${echapper(ligne.texte.replace(/^Set | complété$/g, ""))}</b>.`}</p>${encart}` });
  }
  evenements.sort((a, b) => b.date.localeCompare(a.date));
  if (!evenements.length) return '<p class="aide-resultats onglet-vide">Pas encore d\'activité : ajoute des cartes, crée un binder ou suis une chase card.</p>';
  const lettres = echapper(initiales(profil.nom) || "?");
  return `<ol class="fil">${evenements.slice(0, 25).map((evenement) => `<li class="fil-ligne">
      <span class="avatar-fil" aria-hidden="true">${lettres}</span>
      <div class="fil-contenu">
        <p class="fil-tete"><b>${echapper(profil.nom)}</b> <span>@${echapper(profil.pseudo)} · <time datetime="${echapper(evenement.date)}">${ilYA(evenement.date)}</time></span></p>
        ${evenement.html}
      </div>
    </li>`).join("")}</ol>`;
}

function ongletBinders() {
  if (!binders.length) return '<p class="aide-resultats onglet-vide">Aucun binder pour l\'instant. <a href="binders.html?nouveau">Créer un binder</a></p>';
  return `<ul class="grille-profil-binders">${binders.map((binder) => {
    const choix = couverture(binder.couverture);
    const visuel = choix.type === "illustre"
      ? `<img class="activite-couverture" src="${choix.image}-couverture.webp" alt="" loading="lazy">`
      : `<span class="activite-couverture" style="--teinte: var(--${choix.couleur})"></span>`;
    return `<li><a href="binders.html?binder=${encodeURIComponent(binder.id)}">${visuel}<span>${echapper(binder.nom)}</span><small>${pluriel(binder.cartes.filter(Boolean).length, "carte")}</small></a></li>`;
  }).join("")}</ul>`;
}

function ongletBadges() {
  return `<ul class="grille-badges">${BADGES.map((badge) => {
    const obtenu = recompenses.obtenus[badge.cle];
    const actuel = Math.min(valeurs[badge.mesure], badge.objectif);
    return `<li class="${obtenu ? "obtenu" : "verrouille"}">
        ${imageBadge(badge, 64)}
        <b>${echapper(badge.nom)}</b>
        <small class="num">${obtenu ? "Débloqué" : `${formaterNombre(actuel)} / ${formaterNombre(badge.objectif)}`}</small>
        ${obtenu ? "" : `<span class="progression" aria-hidden="true"><span style="width: ${((actuel / badge.objectif) * 100).toFixed(1)}%"></span></span>`}
      </li>`;
  }).join("")}</ul>`;
}

function ongletChase() {
  if (!chase.length) return '<p class="aide-resultats onglet-vide">Aucune chase card pour l\'instant. Ouvre la fiche d\'une carte et choisis « ☆ Ajouter aux chase cards ».</p>';
  const possedees = new Set(collection.map((entree) => entree.id));
  return `<ul class="liste-profil-chase">${chase.map((carte) => `<li>
      ${miniCarte(carte)}
      <span><b>${echapper(carte.nom)}</b><small>${echapper(carte.set?.nom ?? "")} · prix max ${formaterPrix(carte.prixMax)}</small></span>
      ${possedees.has(carte.id) ? '<span class="pilule bonne">Trouvée</span>' : ""}
    </li>`).join("")}</ul>`;
}

const ONGLETS = [
  ["activite", "Activité", activite],
  ["binders", "Binders", ongletBinders],
  ["badges", "Badges", ongletBadges],
  ["chase", "Chase cards", ongletChase],
];

function afficherOnglet() {
  for (const bouton of zone.querySelectorAll("[role=tab]")) {
    const actif = bouton.dataset.onglet === onglet;
    bouton.setAttribute("aria-selected", String(actif));
    bouton.tabIndex = actif ? 0 : -1;
  }
  const [, , contenu] = ONGLETS.find(([cle]) => cle === onglet);
  const panneau = zone.querySelector("[role=tabpanel]");
  panneau.setAttribute("aria-labelledby", `onglet-${onglet}`);
  panneau.innerHTML = contenu();
}

// ---------- Profil ----------

function afficherProfil() {
  const exemplaires = collection.reduce((somme, entree) => somme + nombreExemplaires(entree), 0);
  const badgesObtenus = BADGES.filter((badge) => recompenses.obtenus[badge.cle]);
  const enAvant = BADGES.find((badge) => badge.cle === profil.badge && recompenses.obtenus[badge.cle]);
  const prochains = prochainsBadges(recompenses, valeurs);
  document.title = `${profil.nom} · Pokibind`;
  zone.removeAttribute("aria-busy");
  zone.innerHTML = `<div class="profil">
    <section class="profil-principal" aria-labelledby="nom-profil">
      <div class="banniere" style="background: ${fondBanniere(profil.banniere)}"></div>
      <div class="profil-haut">
        <span class="avatar-profil" aria-hidden="true">${echapper(initiales(profil.nom) || "?")}</span>
        <div class="boutons profil-actions">
          <button class="bouton bouton-secondaire bouton-petit" type="button" disabled title="Le partage par lien arrive plus tard">Partager</button>
          <button class="bouton bouton-secondaire bouton-petit" type="button" id="modifier-profil">Modifier le profil</button>
        </div>
      </div>
      <div class="profil-infos">
        <h1 class="profil-nom" id="nom-profil">${echapper(profil.nom)}${enAvant ? `<span class="badge-en-avant" title="${echapper(enAvant.nom)}">${imageBadge(enAvant, 34)}<span class="sr-only">, badge ${echapper(enAvant.nom)}</span></span>` : ""}</h1>
        <p class="profil-pseudo">@${echapper(profil.pseudo)}</p>
        ${profil.bio ? `<p class="profil-bio">${echapper(profil.bio)}</p>` : ""}
        <p class="profil-meta">
          <span class="avec-illustration"><img src="img/energies/energie-feu.png" alt="" width="16" height="16">Série de ${pluriel(recompenses.serie, "jour")}</span>
          <span class="avec-illustration"><img src="img/badges/piece.webp" alt="" width="16" height="16">${pluriel(recompenses.pieces, "pièce")}</span>
          <span>Membre depuis ${moisAnnee.format(new Date(profil.creeLe))}</span>
        </p>
        <p class="profil-chiffres num">
          <span><b>${formaterNombre(exemplaires)}</b> ${exemplaires > 1 ? "cartes" : "carte"}</span>
          <span><b>${formaterNombre(setsCompletes(collection).length)}</b> ${setsCompletes(collection).length > 1 ? "sets complétés" : "set complété"}</span>
          <span><b>${formaterNombre(binders.length)}</b> ${binders.length > 1 ? "binders" : "binder"}</span>
          <span><b>${formaterNombre(badgesObtenus.length)}</b> ${badgesObtenus.length > 1 ? "badges" : "badge"}</span>
        </p>
      </div>
      <div class="onglets-profil" role="tablist" aria-label="Contenu du profil">
        ${ONGLETS.map(([cle, nom]) => `<button type="button" role="tab" id="onglet-${cle}" data-onglet="${cle}" aria-controls="panneau-profil">${nom}</button>`).join("")}
      </div>
      <div class="panneau-profil" id="panneau-profil" role="tabpanel" tabindex="0"></div>
    </section>

    <aside class="profil-cote">
      <section class="panneau" aria-labelledby="titre-prochains">
        <h2 id="titre-prochains">Prochains badges</h2>
        <ul class="prochains">${prochains.map((badge) => `<li>
            <span class="prochain-ligne"><span>${echapper(badge.nom)}</span><span class="num">${formaterNombre(badge.actuel)} / ${formaterNombre(badge.objectif)}</span></span>
            <span class="progression" aria-hidden="true"><span style="width: ${((badge.actuel / badge.objectif) * 100).toFixed(1)}%"></span></span>
          </li>`).join("") || "<li>Tous les badges sont débloqués !</li>"}</ul>
      </section>
      <section class="panneau" aria-labelledby="titre-favorites">
        <h2 id="titre-favorites">Cartes favorites</h2>
        ${profil.favorites?.length
          ? `<div class="favorites">${profil.favorites.map(miniCarte).join("")}</div>`
          : '<p class="aide-resultats">Choisis jusqu\'à 3 cartes de ta collection avec « Modifier le profil ».</p>'}
      </section>
      <section class="panneau" aria-labelledby="titre-visibilite">
        <h2 id="titre-visibilite">Visibilité</h2>
        <div class="segments" role="group" aria-labelledby="titre-visibilite">
          <button type="button" aria-pressed="true">Privé</button>
          <button type="button" aria-pressed="false" disabled>Amis</button>
          <button type="button" aria-pressed="false" disabled>Public</button>
        </div>
        <p class="aide-resultats">Pour l'instant, seul toi vois ton profil. Le partage par lien est prévu plus tard.</p>
      </section>
      <section class="panneau" aria-labelledby="titre-compte">
        <h2 id="titre-compte">Mon compte</h2>
        <button class="bouton bouton-secondaire bouton-petit" type="button" id="bouton-deconnexion">Se déconnecter</button>
        <button class="lien lien-danger" type="button" id="bouton-supprimer">Supprimer mes données</button>
      </section>
    </aside>
  </div>`;
  afficherOnglet();
}

// ---------- Création du profil (première visite) ----------

async function afficherCreation() {
  const session = await getSession();
  const pseudo = (session?.pseudo || session?.email?.split("@")[0] || "").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9._-]/gi, "").slice(0, 20);
  document.title = "Crée ton profil · Pokibind";
  zone.removeAttribute("aria-busy");
  zone.innerHTML = `<div class="creation-profil">
    <div class="tete-page">
      <h1>Crée ton profil</h1>
      <p>Il te faut juste un nom et un pseudo. Tu pourras tout changer plus tard.</p>
    </div>
    <form class="formulaire" id="formulaire-creation" novalidate>
      <div class="champ-groupe">
        <label for="creation-nom">Nom affiché</label>
        <input class="champ" id="creation-nom" maxlength="40" autocomplete="name" value="${echapper(session?.pseudo ?? "")}" aria-describedby="erreur-creation-nom">
        <p class="champ-erreur" id="erreur-creation-nom"></p>
      </div>
      <div class="champ-groupe">
        <label for="creation-pseudo">Pseudo</label>
        <input class="champ" id="creation-pseudo" maxlength="20" autocomplete="username" spellcheck="false" value="${echapper(pseudo)}" aria-describedby="aide-creation-pseudo erreur-creation-pseudo">
        <p class="champ-aide" id="aide-creation-pseudo">2 à 20 caractères : lettres sans accent, chiffres, point, tiret ou tiret bas.</p>
        <p class="champ-erreur" id="erreur-creation-pseudo"></p>
      </div>
      <div class="champ-groupe">
        <label for="creation-bio">Bio <span class="champ-aide">(facultatif)</span></label>
        <textarea class="champ" id="creation-bio" maxlength="160" rows="3"></textarea>
      </div>
      <fieldset class="choix-couverture">
        <legend>Bannière</legend>
        <div class="bannieres-choix">${choixBannieres("lagune", "creation-banniere")}</div>
      </fieldset>
      <button class="bouton" type="submit">Créer mon profil</button>
    </form>
  </div>`;
  zone.querySelector("#creation-nom").focus();
}

function choixBannieres(selection, nom) {
  return BANNIERES.map((banniere) => `<label class="choix">
      <input type="radio" name="${nom}" value="${banniere.id}"${banniere.id === selection ? " checked" : ""}>
      <span class="choix-apercu" style="background: ${fondBanniere(banniere.id)}"></span>
      <span class="choix-nom">${banniere.nom}</span>
    </label>`).join("");
}

// Vérifie nom et pseudo ; renvoie le premier champ invalide, ou null
function verifier(champNom, erreurNom, champPseudo, erreurPseudo) {
  let premier = null;
  for (const [champ, erreur, message] of [
    [champNom, erreurNom, champNom.value.trim() ? "" : "Indique le nom à afficher."],
    [champPseudo, erreurPseudo, PSEUDO.test(champPseudo.value.trim()) ? "" : "Choisis un pseudo de 2 à 20 caractères : lettres sans accent, chiffres, point, tiret ou tiret bas."],
  ]) {
    erreur.textContent = message;
    if (message) {
      champ.setAttribute("aria-invalid", "true");
      premier ??= champ;
    } else {
      champ.removeAttribute("aria-invalid");
    }
  }
  return premier;
}

zone.addEventListener("submit", async (evenement) => {
  if (evenement.target.id !== "formulaire-creation") return;
  evenement.preventDefault();
  const invalide = verifier(zone.querySelector("#creation-nom"), zone.querySelector("#erreur-creation-nom"),
    zone.querySelector("#creation-pseudo"), zone.querySelector("#erreur-creation-pseudo"));
  if (invalide) {
    invalide.focus();
    return;
  }
  profil = await enregistrerProfil({
    nom: zone.querySelector("#creation-nom").value.trim(),
    pseudo: zone.querySelector("#creation-pseudo").value.trim(),
    bio: zone.querySelector("#creation-bio").value.trim(),
    banniere: zone.querySelector("input[name=creation-banniere]:checked").value,
  });
  afficherProfil();
  zone.querySelector("h1").setAttribute("tabindex", "-1");
  zone.querySelector("h1").focus();
  annoncer("Ton profil est créé.");
  // L'avatar de l'en-tête prend tes initiales
  document.querySelector(".avatar")?.replaceChildren(document.createTextNode(initiales(profil.nom)));
});

// ---------- Modifier le profil ----------

function optionsCartes(selection) {
  const triees = [...collection].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  return '<option value="">Aucune</option>' + triees.map((entree) => {
    const numero = entree.set?.officiel ? `${entree.numero}/${entree.set.officiel}` : entree.numero;
    return `<option value="${echapper(entree.id)}"${entree.id === selection ? " selected" : ""}>${echapper(`${entree.nom} · ${entree.set?.nom ?? ""} ${numero}`)}</option>`;
  }).join("");
}

function ouvrirModification() {
  document.getElementById("champ-nom").value = profil.nom;
  document.getElementById("champ-pseudo").value = profil.pseudo;
  document.getElementById("champ-bio").value = profil.bio ?? "";
  document.getElementById("bannieres-choix").innerHTML = choixBannieres(profil.banniere, "banniere");
  const obtenus = BADGES.filter((badge) => recompenses.obtenus[badge.cle]);
  document.getElementById("groupe-badge").hidden = obtenus.length === 0;
  document.getElementById("champ-badge").innerHTML = '<option value="">Aucun</option>'
    + obtenus.map((badge) => `<option value="${badge.cle}"${badge.cle === profil.badge ? " selected" : ""}>${echapper(badge.nom)}</option>`).join("");
  document.getElementById("groupe-favorites").hidden = collection.length === 0;
  [1, 2, 3].forEach((rang) => {
    document.getElementById(`favorite-${rang}`).innerHTML = optionsCartes(profil.favorites?.[rang - 1]?.id);
  });
  for (const id of ["erreur-champ-nom", "erreur-champ-pseudo"]) document.getElementById(id).textContent = "";
  fenetre.showModal();
  document.getElementById("champ-nom").focus();
}

document.getElementById("formulaire-profil").addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const champNom = document.getElementById("champ-nom");
  const champPseudo = document.getElementById("champ-pseudo");
  const invalide = verifier(champNom, document.getElementById("erreur-champ-nom"), champPseudo, document.getElementById("erreur-champ-pseudo"));
  if (invalide) {
    invalide.focus();
    return;
  }
  const ids = [...new Set([1, 2, 3].map((rang) => document.getElementById(`favorite-${rang}`).value).filter(Boolean))];
  const favorites = ids.map((id) => {
    const entree = collection.find((e) => e.id === id);
    return { id: entree.id, nom: entree.nom, numero: entree.numero, image: entree.image, set: entree.set };
  });
  profil = await enregistrerProfil({
    nom: champNom.value.trim(),
    pseudo: champPseudo.value.trim(),
    bio: document.getElementById("champ-bio").value.trim(),
    banniere: fenetre.querySelector("input[name=banniere]:checked")?.value ?? profil.banniere,
    badge: document.getElementById("champ-badge").value,
    favorites,
  });
  fenetre.close();
  afficherProfil();
  document.getElementById("modifier-profil").focus();
  document.querySelector(".avatar")?.replaceChildren(document.createTextNode(initiales(profil.nom)));
  annoncer("Profil enregistré.");
});
document.getElementById("annuler-profil").addEventListener("click", () => fenetre.close());

// ---------- Clics : onglets, modifier, compte ----------

zone.addEventListener("click", async (evenement) => {
  const bouton = evenement.target.closest("button");
  if (!bouton) return;
  if (bouton.dataset.onglet) {
    onglet = bouton.dataset.onglet;
    afficherOnglet();
  } else if (bouton.id === "modifier-profil") {
    ouvrirModification();
  } else if (bouton.id === "bouton-deconnexion") {
    await seDeconnecter();
    location.href = "index.html";
  } else if (bouton.id === "bouton-supprimer") {
    const ok = confirm("Supprimer toutes tes données Pokibind ?\n\nTa collection, tes binders, tes chase cards, ton scellé, ton profil, tes pièces et tes badges seront effacés de ce navigateur. C'est définitif.");
    if (!ok) return;
    await supprimerMesDonnees();
    await seDeconnecter();
    location.href = "index.html";
  }
});

// Onglets au clavier : flèches gauche et droite
zone.addEventListener("keydown", (evenement) => {
  const actuel = evenement.target.closest("[role=tab]");
  if (!actuel || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(evenement.key)) return;
  evenement.preventDefault();
  const rang = ONGLETS.findIndex(([cle]) => cle === actuel.dataset.onglet);
  const suivant = evenement.key === "Home" ? 0 : evenement.key === "End" ? ONGLETS.length - 1
    : (rang + (evenement.key === "ArrowRight" ? 1 : -1) + ONGLETS.length) % ONGLETS.length;
  onglet = ONGLETS[suivant][0];
  afficherOnglet();
  zone.querySelector(`#onglet-${onglet}`).focus();
});

// ---------- Chargement ----------

await verifierRecompenses().catch(() => null); // connexion du jour et badges comptés avant l'affichage
let chase_;
[profil, recompenses, collection, { libres: binders }, chase_] = await Promise.all([
  getProfil(), getRecompenses(), getCollection(), getBinders(), getChaseCards(),
]);
chase = chase_.cartes;
valeurs = await mesures(recompenses);
if (profil) afficherProfil();
else afficherCreation();
