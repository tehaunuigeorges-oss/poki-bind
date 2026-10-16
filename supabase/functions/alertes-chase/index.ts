// Alertes email des chase cards (Supabase Edge Function, lancée une fois par jour par pg_cron).
// Pour chaque personne qui a activé les alertes : prix Cardmarket (via TCGdex) de ses chase cards pas encore
// trouvées ; si une carte passe sous son prix max, un email est envoyé avec Brevo. Une seule alerte par carte
// tant que son prix ne repasse pas au-dessus du prix max.
//
// Secrets (Edge Functions → Secrets), jamais dans le code :
//   BREVO_API_KEY   clé API Brevo (commence par xkeysib-)
//   EXPEDITEUR      adresse d'envoi validée dans Brevo
//   ALERTES_SECRET  même valeur que le secret « alertes_secret » du Vault (voir supabase/alertes.sql)
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase.
// « Verify JWT » doit être désactivé : l'appel est protégé par ALERTES_SECRET.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://poki-bind.netlify.app";
const API = "https://api.tcgdex.net/v2/fr/cards/";
const NOMS = { normale: "Normale", reverse: "Reverse", holo: "Holo", pokeball: "Reverse Poké Ball", masterball: "Reverse Master Ball" };

// Mêmes règles que variantesDeCarte dans js/tcgdex.js : prix « trend » de Cardmarket,
// « -holo » pour une reverse, détail par variante quand TCGdex le donne.
const normaliser = (texte) => String(texte ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function lirePrix(cardmarket, reverse) {
  const valeur = cardmarket?.[reverse ? "trend-holo" : "trend"];
  return typeof valeur === "number" && valeur > 0 ? valeur : null;
}

export function prixVariante(carte, variante) {
  const details = Array.isArray(carte.variants_detailed) ? carte.variants_detailed : [];
  const chercher = (type, motif = "") => details.find((d) => normaliser(d.type) === type && normaliser(d.foil) === motif && !d.stamp?.length);
  const general = carte.pricing?.cardmarket;
  const motif = (detail) => (detail ? lirePrix(detail.pricing?.cardmarket, true) ?? lirePrix(detail.pricing?.cardmarket, false) : null);
  switch (variante) {
    case "normale": return lirePrix(chercher("normal")?.pricing?.cardmarket ?? general, false);
    case "reverse": return lirePrix(chercher("reverse")?.pricing?.cardmarket ?? general, true);
    case "holo": return lirePrix(chercher("holo")?.pricing?.cardmarket ?? general, false);
    case "pokeball": return motif(chercher("reverse", "pokeball"));
    case "masterball": return motif(chercher("reverse", "masterball"));
    default: return null;
  }
}

const echapper = (texte) => String(texte ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const euros = (nombre) => `${nombre.toFixed(2).replace(".", ",")} €`;

function email(cartes) {
  const lignes = cartes.map((c) => ({
    texte: `${c.nom} (${c.set}, ${NOMS[c.variante] ?? c.variante}) : ${euros(c.prix)}, ton prix max ${euros(c.prixMax)}`,
    html: `<li><a href="${SITE}/carte.html?id=${encodeURIComponent(c.id)}">${echapper(c.nom)}</a> (${echapper(c.set)}, ${echapper(NOMS[c.variante] ?? c.variante)}) : <b>${euros(c.prix)}</b>, ton prix max ${euros(c.prixMax)}</li>`,
  }));
  const sujet = cartes.length > 1 ? `${cartes.length} chase cards sous ton prix max` : `${cartes[0].nom} est sous ton prix max`;
  return {
    sujet,
    texte: `Bonne nouvelle ! Sur Cardmarket :\n\n${lignes.map((l) => `- ${l.texte}`).join("\n")}\n\nTes chase cards : ${SITE}/chase-cards.html\n`
      + `Pour ne plus recevoir ces emails, décoche les alertes sur cette page.\n`,
    html: `<p>Bonne nouvelle ! Sur Cardmarket :</p><ul>${lignes.map((l) => l.html).join("")}</ul>`
      + `<p><a href="${SITE}/chase-cards.html">Voir mes chase cards</a></p>`
      + `<p style="color:#666;font-size:13px">Pour ne plus recevoir ces emails, décoche les alertes sur la page Chase cards.</p>`,
  };
}

async function envoyer(destinataire, { sujet, texte, html }) {
  const reponse = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": Deno.env.get("BREVO_API_KEY"), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Pokibind", email: Deno.env.get("EXPEDITEUR") },
      to: [{ email: destinataire }],
      subject: sujet, textContent: texte, htmlContent: html,
    }),
  });
  if (!reponse.ok) throw new Error(`Brevo ${reponse.status}`);
}

// Comparaison en temps constant (le secret ne se devine pas caractère par caractère)
function memeSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function verifierAlertes(sb) {
  const bilan = { personnes: 0, cartes: 0, emails: 0, erreurs: 0 };
  const cartesTcgdex = new Map(); // une seule requête par carte, même suivie par plusieurs personnes
  const carteTcgdex = async (id) => {
    if (!cartesTcgdex.has(id)) {
      cartesTcgdex.set(id, fetch(API + encodeURIComponent(id)).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    }
    return cartesTcgdex.get(id);
  };

  const { data: inscrits, error } = await sb.from("reglages").select("user_id").eq("alertes_email", true);
  if (error) throw error;
  for (const { user_id: utilisateur } of inscrits) {
    try {
      bilan.personnes += 1;
      const [{ data: chase }, { data: possedees }] = await Promise.all([
        sb.from("chase_cards").select("*").eq("user_id", utilisateur),
        sb.from("collection").select("carte_id").eq("user_id", utilisateur),
      ]);
      const trouvees = new Set((possedees ?? []).map((ligne) => ligne.carte_id));
      const bonnes = [];
      const maintenant = new Date().toISOString();
      for (const suivie of chase ?? []) {
        if (trouvees.has(suivie.carte_id)) continue;
        const carte = await carteTcgdex(suivie.carte_id);
        if (!carte) continue;
        bilan.cartes += 1;
        const prix = prixVariante(carte, suivie.variante);
        const sous = prix !== null && prix <= Number(suivie.prix_max);
        const changements = { prix, prix_le: maintenant };
        if (sous && !suivie.alerte_envoyee_le) {
          bonnes.push({ id: suivie.carte_id, nom: suivie.carte?.nom ?? carte.name, set: suivie.carte?.set?.nom ?? carte.set?.name ?? "", variante: suivie.variante, prix, prixMax: Number(suivie.prix_max) });
        } else if (!sous && suivie.alerte_envoyee_le) {
          changements.alerte_envoyee_le = null; // repassée au-dessus : une nouvelle baisse donnera une nouvelle alerte
        }
        await sb.from("chase_cards").update(changements).eq("user_id", utilisateur).eq("carte_id", suivie.carte_id);
      }
      if (!bonnes.length) continue;
      const { data: compte } = await sb.auth.admin.getUserById(utilisateur);
      if (!compte?.user?.email) continue;
      await envoyer(compte.user.email, email(bonnes));
      bilan.emails += 1;
      for (const bonne of bonnes) {
        await sb.from("chase_cards").update({ alerte_envoyee_le: maintenant }).eq("user_id", utilisateur).eq("carte_id", bonne.id);
      }
    } catch (erreur) {
      bilan.erreurs += 1;
      console.error("alerte non envoyée :", erreur.message);
    }
  }
  return bilan;
}

if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(async (requete) => {
    if (requete.method !== "POST" || !memeSecret(requete.headers.get("x-alertes-secret"), Deno.env.get("ALERTES_SECRET"))) {
      return new Response("Interdit", { status: 401 });
    }
    const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    try {
      // Bilan en nombres seulement : aucune donnée personnelle dans la réponse ni dans les journaux
      return Response.json(await verifierAlertes(sb));
    } catch (erreur) {
      console.error(erreur.message);
      return new Response("Erreur", { status: 500 });
    }
  });
}
