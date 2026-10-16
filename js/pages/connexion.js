// Connexion et création de compte, en façade pour la v1.
// Rien n'est vérifié : n'importe quel email et n'importe quel code à 6 chiffres sont acceptés,
// et le mot de passe n'est enregistré nulle part. La vraie connexion arrivera avec Supabase.

import { seConnecter } from "../donnees.js";

const auth = document.getElementById("auth");
const etapeIdentifiants = document.getElementById("etape-identifiants");
const formulaire = document.getElementById("formulaire-identifiants");
const etapeCode = document.getElementById("etape-code");
const chiffres = [...etapeCode.querySelectorAll(".code input")];
const champPseudo = document.getElementById("pseudo");
const champEmail = document.getElementById("email");
const champMotDePasse = document.getElementById("mot-de-passe");

const TEXTES = {
  connexion: { titre: "Se connecter à Pokibind", bouton: "Se connecter" },
  inscription: { titre: "Créer un compte Pokibind", bouton: "Créer mon compte" },
};

// Ce qui a été saisi à l'étape 1, utilisé une fois le code validé
let identite = null;

const modeActuel = () => auth.dataset.mode;

// ---------- Connexion ou création de compte ----------

function changerMode(mode) {
  auth.dataset.mode = mode;
  const inscription = mode === "inscription";
  document.getElementById("titre-auth").textContent = TEXTES[mode].titre;
  document.getElementById("bouton-valider").textContent = TEXTES[mode].bouton;
  auth.querySelectorAll(".segments [data-choix-mode]").forEach((bouton) => {
    bouton.setAttribute("aria-pressed", String(bouton.dataset.choixMode === mode));
  });

  // Les zones de l'autre mode sont cachées et leurs champs désactivés (ils ne bloquent pas l'envoi)
  auth.querySelectorAll("[data-pour]").forEach((zone) => {
    const visible = zone.dataset.pour === mode;
    zone.hidden = !visible;
    zone.querySelectorAll("input").forEach((champ) => {
      champ.disabled = !visible;
    });
  });

  champEmail.autocomplete = inscription ? "email" : "username";
  champMotDePasse.autocomplete = inscription ? "new-password" : "current-password";
  champMotDePasse.setAttribute("aria-describedby", inscription ? "aide-mot-de-passe erreur-mot-de-passe" : "erreur-mot-de-passe");
  effacerMessages();

  // L'adresse garde le mode (utile si tu recharges la page) et la page à rouvrir après la connexion
  const parametres = new URLSearchParams(location.search);
  if (inscription) parametres.set("mode", "inscription");
  else parametres.delete("mode");
  const texte = parametres.toString();
  history.replaceState(null, "", texte ? `?${texte}` : location.pathname);
}

// ---------- Vérification des champs ----------

const REGLES = {
  pseudo: (champ) => (champ.value.trim().length >= 2 ? "" : "Choisis un pseudo d'au moins 2 caractères."),
  email: (champ) => {
    if (!champ.value.trim()) return "Entre ton adresse email.";
    if (champ.validity.typeMismatch) return "Cette adresse email ne semble pas valide.";
    return "";
  },
  "mot-de-passe": (champ) => {
    if (!champ.value) return "Entre ton mot de passe.";
    const tropFaible = champ.value.length < 8 || !/\d/.test(champ.value);
    if (modeActuel() === "inscription" && tropFaible) return "8 caractères minimum, avec au moins un chiffre.";
    return "";
  },
  conditions: (champ) => (champ.checked ? "" : "Accepte les conditions pour créer ton compte."),
};

function afficherErreur(champ, message) {
  document.getElementById(`erreur-${champ.id}`).textContent = message;
  if (message) champ.setAttribute("aria-invalid", "true");
  else champ.removeAttribute("aria-invalid");
}

function verifier(champ) {
  const message = REGLES[champ.id](champ);
  afficherErreur(champ, message);
  return !message;
}

// Vérifie tous les champs actifs, affiche les erreurs et place le curseur sur la première
function verifierFormulaire() {
  const champs = Object.keys(REGLES)
    .map((id) => document.getElementById(id))
    .filter((champ) => !champ.disabled);
  const invalides = champs.filter((champ) => !verifier(champ));
  invalides[0]?.focus();
  return invalides.length === 0;
}

function effacerMessages() {
  auth.querySelectorAll(".champ-erreur, .auth-info").forEach((zone) => {
    zone.textContent = "";
  });
  auth.querySelectorAll("[aria-invalid]").forEach((champ) => champ.removeAttribute("aria-invalid"));
}

// ---------- Passage d'une étape à l'autre ----------

function afficherEtapeCode() {
  effacerMessages();
  chiffres.forEach((champ) => {
    champ.value = "";
  });
  etapeIdentifiants.hidden = true;
  etapeCode.hidden = false;
  chiffres[0].focus();
}

function revenirAuxIdentifiants() {
  etapeCode.hidden = true;
  etapeIdentifiants.hidden = false;
  effacerMessages();
  champEmail.focus();
}

// Page à rouvrir après la connexion (?retour=binders.html), sinon la collection.
// Seuls des noms de pages du site sont acceptés (jamais l'adresse d'un autre site).
function adresseDeRetour() {
  const retour = new URLSearchParams(location.search).get("retour") ?? "";
  return /^[a-z0-9-]+(\.html)?(\?[\w=&.%-]*)?$/i.test(retour) ? retour : "collection.html";
}

// ---------- Code à 6 chiffres ----------

// Écrit des chiffres à partir de la case « depart » (frappe, collage ou remplissage automatique)
function remplir(depart, texte) {
  const nombres = texte.replace(/\D/g, "").slice(0, chiffres.length - depart);
  [...nombres].forEach((chiffre, decalage) => {
    chiffres[depart + decalage].value = chiffre;
  });
  return nombres.length;
}

chiffres.forEach((champ, position) => {
  champ.addEventListener("focus", () => champ.select());

  champ.addEventListener("input", () => {
    const texte = champ.value;
    champ.value = "";
    const ecrits = remplir(position, texte);
    if (ecrits) chiffres[Math.min(position + ecrits, chiffres.length - 1)].focus();
    document.getElementById("erreur-code").textContent = "";
  });

  champ.addEventListener("keydown", (evenement) => {
    if (evenement.key === "Backspace" && !champ.value && position > 0) {
      evenement.preventDefault();
      chiffres[position - 1].value = "";
      chiffres[position - 1].focus();
    } else if (evenement.key === "ArrowLeft" && position > 0) {
      chiffres[position - 1].focus();
    } else if (evenement.key === "ArrowRight" && position < chiffres.length - 1) {
      chiffres[position + 1].focus();
    }
  });

  champ.addEventListener("paste", (evenement) => {
    evenement.preventDefault();
    const ecrits = remplir(position, evenement.clipboardData?.getData("text") ?? "");
    if (ecrits) chiffres[Math.min(position + ecrits, chiffres.length - 1)].focus();
  });
});

// ---------- Actions ----------

auth.querySelectorAll("[data-choix-mode]").forEach((bouton) => {
  bouton.addEventListener("click", () => {
    changerMode(bouton.dataset.choixMode);
    // Le lien du bas disparaît en changeant de mode : on place le curseur sur le premier champ
    if (!bouton.closest(".segments")) (modeActuel() === "inscription" ? champPseudo : champEmail).focus();
  });
});

formulaire.addEventListener("input", (evenement) => {
  const champ = evenement.target;
  if (REGLES[champ.id] && champ.hasAttribute("aria-invalid")) verifier(champ);
});

formulaire.addEventListener("submit", (evenement) => {
  evenement.preventDefault();
  if (!verifierFormulaire()) return;
  const inscription = modeActuel() === "inscription";
  identite = {
    email: champEmail.value.trim(),
    pseudo: inscription ? champPseudo.value.trim() : "",
    resterConnecte: inscription || document.getElementById("rester").checked,
  };
  champMotDePasse.value = ""; // le mot de passe n'est gardé nulle part
  afficherEtapeCode();
});

document.getElementById("bouton-google").addEventListener("click", () => {
  identite = { email: "", pseudo: "", resterConnecte: true };
  afficherEtapeCode();
});

document.getElementById("bouton-oubli").addEventListener("click", () => {
  document.getElementById("info-identifiants").textContent =
    "La récupération du mot de passe arrivera avec la vraie connexion. Pour l'instant, n'importe quel mot de passe fonctionne.";
});

document.getElementById("bouton-secours").addEventListener("click", () => {
  document.getElementById("info-code").textContent =
    "Les codes de secours arriveront avec la vraie connexion. Pour l'instant, n'importe quel code à 6 chiffres fonctionne.";
});

document.getElementById("bouton-retour").addEventListener("click", revenirAuxIdentifiants);

etapeCode.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const erreur = document.getElementById("erreur-code");
  const code = chiffres.map((champ) => champ.value).join("");
  if (!/^\d{6}$/.test(code)) {
    erreur.textContent = "Entre les 6 chiffres du code.";
    chiffres.find((champ) => !champ.value)?.focus();
    return;
  }
  try {
    await seConnecter(identite);
  } catch (probleme) {
    erreur.textContent = "Impossible d'enregistrer ta connexion : le stockage du navigateur est bloqué (navigation privée ?).";
    return;
  }
  location.href = adresseDeRetour();
});

changerMode(new URLSearchParams(location.search).get("mode") === "inscription" ? "inscription" : "connexion");
