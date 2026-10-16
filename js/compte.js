// Comptes Pokibind avec Supabase : inscription, connexion (email ou Google), mot de passe oublié, déconnexion.
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

// « connecte » (avec l'utilisateur) ou « deconnecte »
export async function etatSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { etat: "deconnecte" };
  return { etat: "connecte", utilisateur: data.session.user };
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
  if (texte.includes("failed to fetch") || texte.includes("network")) return "Connexion impossible : vérifie ta connexion internet.";
  if (code === "validation_failed" && texte.includes("provider")) return "La connexion avec Google n'est pas encore activée.";
  return "Une erreur est survenue. Réessaie dans un instant.";
}
