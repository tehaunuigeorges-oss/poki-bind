// Boutique « bientôt disponible » : tes pièces, des exemples d'objets à venir, comment gagner des pièces,
// et les couvertures illustrées qui seront à débloquer. Rien ne s'achète encore.

import { getPieces, getSession } from "../donnees.js";
import { BADGES, GAINS, verifierRecompenses } from "../recompenses.js";
import { COUVERTURES } from "../couvertures.js";
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
