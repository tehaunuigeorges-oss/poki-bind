// Connexion et création de compte avec Supabase (voir js/compte.js).
// Parcours : email + mot de passe (le compte est activé par le lien reçu par email) ou Google.
// Sécurité : les messages ne révèlent jamais si une adresse a déjà un compte.

import { etatSession, inscrire, connecter, connecterAvecGoogle, demanderNouveauMotDePasse, changerMotDePasse,
  choisirResterConnecte, messageErreur } from "../compte.js";

const auth = document.getElementById("auth");
const etapeIdentifiants = document.getElementById("etape-identifiants");
const formulaire = document.getElementById("formulaire-identifiants");
const etapeMessage = document.getElementById("etape-message");
const etapeNouveau = document.getElementById("etape-nouveau");
const champPseudo = document.getElementById("pseudo");
const champEmail = document.getElementById("email");
const champMotDePasse = document.getElementById("mot-de-passe");
const parametres = new URLSearchParams(location.search);

const TEXTES = {
  connexion: { titre: "Se connecter à Pokibind", bouton: "Se connecter" },
  inscription: { titre: "Créer un compte Pokibind", bouton: "Créer mon compte" },
};
const MOT_DE_PASSE_SOLIDE = (mdp) => mdp.length >= 10 && /[a-zA-Z]/.test(mdp) && /\d/.test(mdp);

const modeActuel = () => auth.dataset.mode;

// ---------- Écrans ----------

function montrer(etape) {
  for (const zone of [etapeIdentifiants, etapeMessage, etapeNouveau]) zone.hidden = zone !== etape;
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

// Page à rouvrir après la connexion (?retour=binders.html), sinon la collection.
// Seuls des noms de pages du site sont acceptés (jamais l'adresse d'un autre site).
function adresseDeRetour() {
  const retour = parametres.get("retour") ?? "";
  return /^[a-z0-9-]+(\.html)?(\?[\w=&.%-]*)?$/i.test(retour) ? retour : "collection.html";
}

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
    location.href = adresseDeRetour();
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
} else if (parametres.get("mode") === "nouveau" && etat === "connecte") {
  montrer(etapeNouveau);
  document.getElementById("nouveau-mot-de-passe").focus();
} else if (etat === "connecte") {
  // Déjà connecté (ou retour du lien de confirmation, de Google) : on ouvre la page demandée
  location.replace(adresseDeRetour());
}
