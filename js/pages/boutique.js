// Boutique « bientôt disponible » : tes pièces, des exemples d'objets à venir, comment gagner des pièces,
// et les couvertures illustrées qui seront à débloquer. Rien ne s'achète encore.

import { getPieces, getSession } from "../donnees.js";
import { BADGES, GAINS, verifierRecompenses } from "../recompenses.js";
import { COUVERTURES } from "../couvertures.js";
import { BANNIERES, CADRES, estGratuit } from "../objets-profil.js";
import { formaterNombre } from "../outils.js";

const pluriel = (nombre, mot) => `${formaterNombre(nombre)} ${mot}${nombre > 1 ? "s" : ""}`;
const piecesBadge = (cle) => BADGES.find((badge) => badge.cle === cle)?.pieces ?? 0;

await verifierRecompenses().catch(() => null);
document.getElementById("solde").textContent = `Tu as déjà ${pluriel(await getPieces(), "pièce")}`;

const gains = [
  ["Connexion quotidienne", `+${GAINS.connexion} pièces par jour, plus ${piecesBadge("connexion-7")} pièces au bout de 7 jours d'affilée et ${piecesBadge("connexion-30")} au bout de 30 jours`],
  ["Ajout de cartes", `+${piecesBadge("cartes-10")} pièces à 10, 50, 100 et 500 cartes, +${piecesBadge("cartes-1000")} à 1 000`],
  ["Set complété", `+${GAINS.setComplete} pièces pour chaque set terminé, +${piecesBadge("sets-5")} au 5ᵉ`],
  ["Binders et chase cards", `+${piecesBadge("premier-binder")} pièces pour ton premier binder et ta première chase card`],
];
document.getElementById("gains").innerHTML = gains.map(([titre, texte]) => `<li class="panneau"><h3>${titre}</h3><p>${texte}</p></li>`).join("");

document.getElementById("couvertures-a-venir").innerHTML = COUVERTURES.filter((c) => c.type === "illustre").map((c) => `<li class="couverture-a-venir">
    <span class="couverture illustree"><img src="${c.image}-couverture.webp" alt="" loading="lazy"><span class="cadenas" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span></span>
    <span class="binder-nom">${c.nom}</span>
    <span class="binder-infos avec-illustration num"><img src="img/badges/piece.webp" alt="" width="14" height="14">${formaterNombre(c.prix)} pièces · verrouillée</span>
  </li>`).join("");

// Bannières et cadres de profil (seuls ceux de la boutique, pas les gratuits)
const CADENAS = '<span class="cadenas" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>';
const prix = (objet) => `<span class="binder-infos avec-illustration num"><img src="img/badges/piece.webp" alt="" width="14" height="14">${formaterNombre(objet.prix)} pièces · verrouillé</span>`;
const apercuBanniere = (objet) => `<span class="objet-banniere" style="background: ${objet.fond}">${CADENAS}</span>`;
const apercuCadre = (objet) => `<span class="objet-cadre" style="--cadre: ${objet.anneau}"><span class="objet-cadre-centre">Avatar</span>${CADENAS}</span>`;

document.getElementById("bannieres-a-venir").innerHTML = BANNIERES.filter((b) => !estGratuit(b))
  .map((b) => `<li class="objet">${apercuBanniere(b)}<span class="binder-nom">${b.nom}</span>${prix(b)}</li>`).join("");
document.getElementById("cadres-a-venir").innerHTML = CADRES.filter((c) => !estGratuit(c))
  .map((c) => `<li class="objet objet-rond">${apercuCadre(c)}<span class="binder-nom">${c.nom}</span>${prix(c)}</li>`).join("");

// En haut : une couverture, un cadre et une bannière en vedette
const vitrail = COUVERTURES.find((c) => c.id === "vitrail");
const dore = CADRES.find((c) => c.id === "dore");
const aurore = BANNIERES.find((b) => b.id === "aurore");
const prixVedette = (objet) => `<span class="avec-illustration num"><img src="img/badges/piece.webp" alt="" width="16" height="16">${formaterNombre(objet.prix)} pièces</span>`;
document.getElementById("objets-vedette").innerHTML = `
  <li><img class="objet-couverture" src="${vitrail.image}-couverture.webp" alt="" loading="lazy"><span>Couverture ${vitrail.nom}</span>${prixVedette(vitrail)}</li>
  <li><span class="objet-cadre grand" style="--cadre: ${dore.anneau}" aria-hidden="true"><span class="objet-cadre-centre">Avatar</span></span><span>${dore.nom}</span>${prixVedette(dore)}</li>
  <li><span class="objet-banniere vedette" style="background: ${aurore.fond}" aria-hidden="true"></span><span>Bannière ${aurore.nom}</span>${prixVedette(aurore)}</li>`;

// « Me prévenir » : rien n'est envoyé en v1 ; l'email sera utilisé avec les vrais comptes.
const champ = document.getElementById("email-prevenir");
const message = document.getElementById("message-prevenir");
champ.value = (await getSession())?.email ?? "";
document.getElementById("formulaire-prevenir").addEventListener("submit", (evenement) => {
  evenement.preventDefault();
  if (!champ.value.trim() || !champ.checkValidity()) {
    champ.setAttribute("aria-invalid", "true");
    message.textContent = "Entre une adresse email valide.";
    champ.focus();
    return;
  }
  champ.removeAttribute("aria-invalid");
  message.textContent = "C'est noté ! Version de test : rien n'est envoyé, l'alerte par email arrivera avec les vrais comptes.";
});
