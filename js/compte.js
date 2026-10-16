// Comptes Pokibind avec Supabase : inscription, connexion (email ou Google), double authentification
// obligatoire par application (TOTP), mot de passe oublié, déconnexion.
// Seule la clé PUBLIQUE est ici : elle est faite pour être visible. La sécurité des données repose
// sur les règles d'accès de la base (supabase/schema.sql). Ne jamais mettre la clé « service_role » ou « secret » ici.

import { createClient } from "./vendor/supabase.js";

const URL_SUPABASE = "https://wjnqmdkfyvmndnwsxpul.supabase.co";
const CLE_PUBLIQUE = "sb_publishable__OVboj1Vfvc9r6fWbVfJ4g_Ky4Av_4t";
const CLE_RESTER = "pokibind-rester-connecte";

// « Rester connecté » coché : session gardée après la fermeture du navigateur (localStorage) ;
// décoché : seulement le temps de la visite (sessionStorage).
function stockage() {
  try {
    return localStorage.getItem(CLE_RESTER) === "non" ? sessionStorage : localStorage;
  } catch (erreur) {
    return null;
  }
}
const stockageSession = {
  getItem: (cle) => {
    try {
      return sessionStorage.getItem(cle) ?? localStorage.getItem(cle);
    } catch (erreur) {
      return null;
    }
  },
  setItem: (cle, valeur) => {
    const choisi = stockage();
    if (!choisi) return;
    choisi.setItem(cle, valeur);
    (choisi === localStorage ? sessionStorage : localStorage).removeItem(cle);
  },
  removeItem: (cle) => {
    try {
      localStorage.removeItem(cle);
      sessionStorage.removeItem(cle);
    } catch (erreur) {
      // Stockage indisponible : rien à effacer.
    }
  },
};

export const supabase = createClient(URL_SUPABASE, CLE_PUBLIQUE, {
  auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: stockageSession },
});

export function choisirResterConnecte(rester) {
  try {
    localStorage.setItem(CLE_RESTER, rester ? "oui" : "non");
  } catch (erreur) {
    // Stockage bloqué : la session ne pourra pas être gardée.
  }
}

// Adresse de retour des liens envoyés par email et de Google : la page de connexion du site actuel
const adresse = (parametres = "") => new URL(`connexion.html${parametres}`, location.href).href;

// ---------- État de la session ----------

// « verifie » : connecté ET double authentification passée (aal2) ; c'est le seul état qui donne accès aux données.
// « code » : mot de passe ou Google OK, il reste le code à 6 chiffres ; « activation » : aucune application liée encore.
export async function etatSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { etat: "deconnecte" };
  const { data: niveau, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return { etat: "deconnecte" };
  const utilisateur = data.session.user;
  if (niveau.currentLevel === "aal2") return { etat: "verifie", utilisateur };
  return { etat: niveau.nextLevel === "aal2" ? "code" : "activation", utilisateur };
}

// ---------- Inscription, connexion ----------

export async function inscrire({ email, motDePasse, pseudo }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password: motDePasse,
    options: { data: { pseudo }, emailRedirectTo: adresse("?confirme=1") },
  });
  if (error) throw error;
  return data;
}

export async function connecter({ email, motDePasse }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
  if (error) throw error;
}

export async function connecterAvecGoogle(retour = "") {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: adresse(retour ? `?retour=${encodeURIComponent(retour)}` : "") },
  });
  if (error) throw error;
}

export async function demanderNouveauMotDePasse(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: adresse("?mode=nouveau") });
  if (error) throw error;
}

export async function changerMotDePasse(motDePasse) {
  const { error } = await supabase.auth.updateUser({ password: motDePasse });
  if (error) throw error;
}

// tous : déconnecte aussi tous les autres appareils
export async function deconnecter(tous = false) {
  await supabase.auth.signOut({ scope: tous ? "global" : "local" });
}

// ---------- Double authentification (application : Google Authenticator, 2FAS, Authy…) ----------

// Lie une nouvelle application : renvoie le QR code (image SVG) et la clé à saisir à la main.
// Une tentative précédente non terminée est d'abord supprimée.
export async function commencerActivation() {
  const { data: facteurs } = await supabase.auth.mfa.listFactors();
  for (const facteur of facteurs?.all ?? []) {
    if (facteur.factor_type === "totp" && facteur.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: facteur.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Pokibind ${new Date().toLocaleDateString("fr-FR")}` });
  if (error) throw error;
  return { facteur: data.id, qr: data.totp.qr_code, cle: data.totp.secret };
}

// Vérifie le code à 6 chiffres. facteur : celui en cours d'activation, sinon l'application déjà liée.
export async function verifierCode(code, facteur = null) {
  let id = facteur;
  if (!id) {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    id = data.totp[0]?.id;
    if (!id) throw new Error("aucune application");
  }
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code });
  if (error) throw error;
}

// Traduit les erreurs de Supabase en messages clairs
export function messageErreur(erreur) {
  const code = erreur?.code ?? "";
  const texte = String(erreur?.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || texte.includes("invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (code === "email_not_confirmed" || texte.includes("email not confirmed")) return "Confirme d'abord ton adresse : clique sur le lien reçu par email.";
  if (code === "user_already_exists" || texte.includes("already registered")) return "Un compte existe déjà avec cet email. Connecte-toi, ou utilise « Mot de passe oublié ».";
  if (code === "weak_password" || texte.includes("password should")) return "Mot de passe trop faible : choisis-en un plus long, avec des lettres et des chiffres.";
  if (code === "same_password") return "Choisis un mot de passe différent de l'ancien.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || texte.includes("rate limit")) return "Trop de tentatives. Attends quelques minutes avant de réessayer.";
  if (code === "mfa_verification_failed" || texte.includes("invalid totp") || texte.includes("invalid mfa")) return "Code incorrect ou expiré. Entre le code affiché maintenant dans ton application.";
  if (texte.includes("failed to fetch") || texte.includes("network")) return "Connexion impossible : vérifie ta connexion internet.";
  if (code === "validation_failed" && texte.includes("provider")) return "La connexion avec Google n'est pas encore activée.";
  return "Une erreur est survenue. Réessaie dans un instant.";
}
