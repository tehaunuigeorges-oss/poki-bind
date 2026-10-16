// Mode clair / sombre.
// Le choix enregistré est appliqué tout au début du <body> par un petit script
// écrit directement dans chaque page (pour éviter un flash blanc au chargement).
// Ce module gère seulement le bouton lune / soleil.

const CLE = "pokibind-theme";

export function estSombre() {
  return document.body.classList.contains("dark");
}

function appliquer(sombre) {
  document.body.classList.toggle("dark", sombre);
  try {
    localStorage.setItem(CLE, sombre ? "dark" : "light");
  } catch (erreur) {
    // Stockage indisponible (navigation privée…) : le choix vaut pour cette page seulement.
  }
}

export function brancherBoutonTheme(bouton) {
  const mettreAJour = () => {
    bouton.setAttribute("aria-label", estSombre() ? "Passer en mode clair" : "Passer en mode sombre");
  };
  bouton.addEventListener("click", () => {
    appliquer(!estSombre());
    mettreAJour();
  });
  mettreAJour();
}
