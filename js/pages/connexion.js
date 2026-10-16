// Connexion et création de compte avec Supabase (voir js/compte.js).
// Parcours : email + mot de passe (ou Google) → code à 6 chiffres de l'application d'authentification.
// À la première connexion, l'application est liée en scannant un QR code. Sans ce code, pas d'accès aux données.
// Sécurité : les messages ne révèlent jamais si une adresse a déjà un compte.

import { etatSession, inscrire, connecter, connecterAvecGoogle, demanderNouveauMotDePasse, changerMotDePasse,
  deconnecter, commencerActivation, verifierCode, choisirResterConnecte, messageErreur } from "../compte.js";

const auth = document.getElementById("auth");
const etapeIdentifiants = document.getElementById("etape-identifiants");
const formulaire = document.getElementById("formulaire-identifiants");
const etapeCode = document.getElementById("etape-code");
const etapeMessage = document.getElementById("etape-message");
const etapeNouveau = document.getElementById("etape-nouveau");
const chiffres = [...etapeCode.querySelectorAll(".code input")];
const champPseudo = document.getElementById("pseudo");
const champEmail = document.getElementById("email");
const champMotDePasse = document.getElementById("mot-de-passe");
const parametres = new URLSearchParams(location.search);

const TEXTES = {
  connexion: { titre: "Se connecter à Pokibind", bouton: "Se connecter" },
  inscription: { titre: "Créer un compte Pokibind", bouton: "Créer mon compte" },
};
const MOT_DE_PASSE_SOLIDE = (mdp) => mdp.length >= 10 && /[a-zA-Z]/.test(mdp) && /\d/.test(mdp);

let facteurEnActivation = null; // application en cours de liaison (première connexion)
let apresLeCode = "entrer";      // « entrer » : ouvrir le site ; « nouveau » : choisir un nouveau mot de passe

const modeActuel = () => auth.dataset.mode;

// ---------- Écrans ----------

function montrer(etape) {
  for (const zone of [etapeIdentifiants, etapeCode, etapeMessage, etapeNouveau]) zone.hidden = zone !== etape;
}

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
  montrer(etapeIdentifiants);
  // L'adresse garde le mode et la page à rouvrir après la connexion
  const reglages = new URLSearchParams(location.search);
  if (inscription) reglages.set("mode", "inscription");
  else reglages.delete("mode");
  for (const cle of ["confirme", "code", "error", "error_code", "error_description"]) reglages.delete(cle);
  const texte = reglages.toString();
  history.replaceState(null, "", texte ? `?${texte}` : location.pathname);
}

function afficherMessage(titre, texte) {
  document.getElementById("titre-message").textContent = titre;
  document.getElementById("texte-message").textContent = texte;
  montrer(etapeMessage);
  etapeMessage.querySelector("h2").setAttribute("tabindex", "-1");
  etapeMessage.querySelector("h2").focus();
}

// ---------- Vérification des champs ----------

const REGLES = {
  pseudo: (champ) => (/^[a-zA-Z0-9._-]{2,20}$/.test(champ.value.trim()) ? "" : "Choisis un pseudo de 2 à 20 caractères : lettres sans accent, chiffres, point, tiret ou tiret bas."),
  email: (champ) => {
    if (!champ.value.trim()) return "Entre ton adresse email.";
    if (champ.validity.typeMismatch) return "Cette adresse email ne semble pas valide.";
    return "";
  },
  "mot-de-passe": (champ) => {
    if (!champ.value) return "Entre ton mot de passe.";
    if (modeActuel() === "inscription" && !MOT_DE_PASSE_SOLIDE(champ.value)) return "10 caractères minimum, avec des lettres et des chiffres.";
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

function verifierFormulaire() {
  const champs = Object.keys(REGLES).map((id) => document.getElementById(id)).filter((champ) => !champ.disabled);
  const invalides = champs.filter((champ) => !verifier(champ));
  invalides[0]?.focus();
  return invalides.length === 0;
}

function effacerMessages() {
  auth.querySelectorAll(".champ-erreur, #info-identifiants").forEach((zone) => {
    zone.textContent = "";
  });
  auth.querySelectorAll("[aria-invalid]").forEach((champ) => champ.removeAttribute("aria-invalid"));
}

const informer = (texte) => { document.getElementById("info-identifiants").textContent = texte; };

// Désactive un bouton pendant une requête (évite les doubles envois)
async function occupe(bouton, action) {
  bouton.disabled = true;
  bouton.setAttribute("aria-busy", "true");
  try {
    return await action();
  } finally {
    bouton.disabled = false;
    bouton.removeAttribute("aria-busy");
  }
}

// ---------- Code à 6 chiffres ----------

async function afficherEtapeCode(etat) {
  chiffres.forEach((champ) => { champ.value = ""; });
  document.getElementById("erreur-code").textContent = "";
  const activation = etat === "activation";
  document.getElementById("activation").hidden = !activation;
  document.getElementById("titre-code").textContent = activation ? "Active la double authentification" : "Vérifie que c'est bien toi";
  document.getElementById("texte-code").textContent = activation
    ? "Elle protège ta collection : même avec ton mot de passe, personne ne pourra entrer sans ton téléphone."
    : apresLeCode === "nouveau"
      ? "Avant de changer ton mot de passe, entre le code à 6 chiffres affiché dans ton application d'authentification."
      : "Entre le code à 6 chiffres affiché dans ton application d'authentification.";
  montrer(etapeCode);
  if (activation) {
    try {
      const { facteur, qr, cle } = await commencerActivation();
      facteurEnActivation = facteur;
      document.getElementById("activation-qr").src = qr;
      document.getElementById("activation-cle").textContent = cle.replace(/(.{4})/g, "$1 ").trim();
    } catch (erreur) {
      document.getElementById("erreur-code").textContent = messageErreur(erreur);
    }
  } else {
    facteurEnActivation = null;
  }
  chiffres[0].focus();
}

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

// Page à rouvrir après la connexion (?retour=binders.html), sinon la collection.
// Seuls des noms de pages du site sont acceptés (jamais l'adresse d'un autre site).
function adresseDeRetour() {
  const retour = parametres.get("retour") ?? "";
  return /^[a-z0-9-]+(\.html)?(\?[\w=&.%-]*)?$/i.test(retour) ? retour : "collection.html";
}

etapeCode.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const code = chiffres.map((champ) => champ.value).join("");
  const erreur = document.getElementById("erreur-code");
  if (!/^\d{6}$/.test(code)) {
    erreur.textContent = "Entre les 6 chiffres du code.";
    chiffres.find((champ) => !champ.value)?.focus();
    return;
  }
  await occupe(etapeCode.querySelector("button[type=submit]"), async () => {
    try {
      await verifierCode(code, facteurEnActivation);
    } catch (probleme) {
      erreur.textContent = messageErreur(probleme);
      chiffres.forEach((champ) => { champ.value = ""; });
      chiffres[0].focus();
      return;
    }
    if (apresLeCode === "nouveau") {
      montrer(etapeNouveau);
      document.getElementById("nouveau-mot-de-passe").focus();
    } else {
      location.href = adresseDeRetour();
    }
  });
});

document.getElementById("bouton-retour").addEventListener("click", async () => {
  await deconnecter();
  apresLeCode = "entrer";
  changerMode("connexion");
  champEmail.focus();
});

// ---------- Identifiants ----------

auth.querySelectorAll("[data-choix-mode]").forEach((bouton) => {
  bouton.addEventListener("click", () => {
    changerMode(bouton.dataset.choixMode);
    (modeActuel() === "inscription" ? champPseudo : champEmail).focus();
  });
});

formulaire.addEventListener("input", (evenement) => {
  if (evenement.target.getAttribute("aria-invalid") === "true") verifier(evenement.target);
});

formulaire.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  informer("");
  if (!verifierFormulaire()) return;
  const email = champEmail.value.trim();
  const motDePasse = champMotDePasse.value;
  await occupe(document.getElementById("bouton-valider"), async () => {
    if (modeActuel() === "inscription") {
      try {
        await inscrire({ email, motDePasse, pseudo: champPseudo.value.trim() });
      } catch (probleme) {
        informer(messageErreur(probleme));
        return;
      }
      champMotDePasse.value = "";
      // Même message qu'une adresse soit nouvelle ou déjà inscrite (personne ne peut savoir qui est inscrit)
      afficherMessage("Vérifie ta boîte mail", `Si ${email} n'a pas encore de compte, un lien de confirmation vient d'y être envoyé. Clique dessus pour activer ton compte.`);
      return;
    }
    choisirResterConnecte(document.getElementById("rester").checked);
    try {
      await connecter({ email, motDePasse });
    } catch (probleme) {
      informer(messageErreur(probleme));
      champMotDePasse.focus();
      return;
    }
    champMotDePasse.value = "";
    const { etat } = await etatSession();
    if (etat === "verifie") location.href = adresseDeRetour();
    else await afficherEtapeCode(etat);
  });
});

document.getElementById("bouton-google").addEventListener("click", async (evenement) => {
  choisirResterConnecte(document.getElementById("rester").checked);
  await occupe(evenement.currentTarget, async () => {
    try {
      await connecterAvecGoogle(parametres.get("retour") ?? "");
    } catch (probleme) {
      informer(messageErreur(probleme));
    }
  });
});

document.getElementById("bouton-oubli").addEventListener("click", async (evenement) => {
  if (!verifier(champEmail)) {
    champEmail.focus();
    return;
  }
  const email = champEmail.value.trim();
  await occupe(evenement.currentTarget, async () => {
    try {
      await demanderNouveauMotDePasse(email);
    } catch (probleme) {
      informer(messageErreur(probleme));
      return;
    }
    afficherMessage("Vérifie ta boîte mail", `Si un compte existe avec ${email}, un lien pour choisir un nouveau mot de passe vient d'y être envoyé.`);
  });
});

// ---------- Nouveau mot de passe ----------

etapeNouveau.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const champ = document.getElementById("nouveau-mot-de-passe");
  const erreur = document.getElementById("erreur-nouveau");
  if (!MOT_DE_PASSE_SOLIDE(champ.value)) {
    erreur.textContent = "10 caractères minimum, avec des lettres et des chiffres.";
    champ.setAttribute("aria-invalid", "true");
    champ.focus();
    return;
  }
  await occupe(etapeNouveau.querySelector("button[type=submit]"), async () => {
    try {
      await changerMotDePasse(champ.value);
    } catch (probleme) {
      erreur.textContent = messageErreur(probleme);
      return;
    }
    champ.value = "";
    location.href = adresseDeRetour();
  });
});

// ---------- Arrivée sur la page ----------
// Après un lien reçu par email ou un retour de Google, Supabase ouvre la session tout seul (code dans l'adresse).

changerMode(parametres.get("mode") === "inscription" ? "inscription" : "connexion");
const erreurAdresse = parametres.get("error_description");
const { etat } = await etatSession();
if (erreurAdresse) {
  informer(parametres.get("error_code") === "otp_expired"
    ? "Ce lien a expiré ou a déjà servi. Demande un nouveau lien."
    : "La connexion n'a pas abouti. Réessaie.");
} else if (parametres.get("mode") === "nouveau" && etat !== "deconnecte") {
  apresLeCode = "nouveau";
  if (etat === "verifie") montrer(etapeNouveau);
  else await afficherEtapeCode(etat);
} else if (etat === "code" || etat === "activation") {
  if (parametres.get("confirme")) informer("Adresse confirmée.");
  await afficherEtapeCode(etat);
}
