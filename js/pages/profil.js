// Profil (la page complète arrive à l'étape 10). Pour l'instant : la déconnexion.

import { seDeconnecter } from "../donnees.js";

document.getElementById("bouton-deconnexion").addEventListener("click", async () => {
  await seDeconnecter();
  location.href = "index.html";
});
