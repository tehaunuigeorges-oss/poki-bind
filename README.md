# Pokibind

Classeur de cartes Pokémon en ligne (HTML/CSS + JavaScript, hébergé sur Netlify, données avec Supabase et l'API TCGdex). Projet open sources vous pouvez le recuperer et le modifier comme bon vous semble

Site statique en HTML, CSS et JavaScript « vanilla » : pas de framework, pas de npm, pas d'étape de build.
Toutes les pages sont en français, pensées d'abord pour le téléphone, en mode clair et sombre.

En ligne : https://poki-bind.netlify.app

## Lancer le site en local

Les scripts sont des modules JavaScript : ils ne marchent pas en ouvrant les fichiers directement (`file://`).
Il faut un petit serveur local, par exemple l'extension **Live Server** de VS Code : clic droit sur `index.html`, « Open with Live Server ».

La connexion est une façade pour l'instant : n'importe quel email, mot de passe et code à 6 chiffres sont acceptés.

## Pages

| Page | Rôle |
|---|---|
| `index.html` | Accueil |
| `a-propos.html` | Présentation du site |
| `connexion.html` | Connexion et création de compte (façade) |
| `collection.html` | Ma collection : valeur, sets possédés |
| `set.html?id=…` | Toutes les cartes d'un set, possédées ou en gris |
| `recherche.html` | Recherche de cartes, et parcours par famille et par set |
| `carte.html?id=…` | Fiche d'une carte : variantes, prix, binder, chase card, favorite |
| `binders.html` | Binders libres, pochettes au choix |
| `statistiques.html` | Valeur et composition de la collection |
| `chase-cards.html` | Cartes recherchées, prix max, budget |
| `scelle.html` | Produits scellés, ajoutés à la main |
| `profil.html` | Profil, activité, badges, compte |
| `boutique.html` | Bannières, cadres et couvertures à débloquer avec les pièces |
| `mentions-legales.html` | Mentions légales, conditions, confidentialité |
| `404.html` | Page introuvable (servie automatiquement par Netlify) |

## Organisation du dossier

```
*.html                 une page par écran (voir le tableau)
css/style.css          tout le style : palette (:root), mode sombre (body.dark), puis une section par page
js/entete.js           en-tête, navigation, pied de page, accès réservé aux membres
js/donnees.js          toutes les données de l'utilisateur (localStorage aujourd'hui, Supabase demain)
js/tcgdex.js           API TCGdex : cartes, sets, séries, variantes, prix, cache du navigateur
js/recompenses.js      pièces et badges (montants provisoires)
js/couvertures.js      couvertures de binders (couleurs et illustrations)
js/objets-profil.js    bannières et cadres du profil
js/outils.js           petites fonctions partagées (texte, prix, dates, messages)
js/visuel-carte.js     image d'une carte, ou carte de remplacement
js/ajout-rapide.js     le « + » qui ajoute une carte à la collection
js/theme.js            bouton du mode clair / sombre
js/pages/<page>.js     le script de chaque page
icons/                 favicons
img/badges/            badge-*.webp et piece.webp
img/bannieres/         bannières illustrées de la boutique
img/binders/           <theme>-couverture.webp / <theme>-interieur.webp
                       themes : fleurs, lagon, sieste, forge, ciel, vitrail
img/cadres/            cadres d'avatar de la boutique (fond transparent)
img/energies/          energie-<type>.png (128 px) + cercle-energies.webp
                       types : feu, eau, plante, electrique, psy, combat,
                       obscurite, metal, fee, dragon, incolore
img/logos/             logo-principal, logo-horizontal, logo-icone, logo-monochrome
img/partage/           image-de-partage.png (1200 x 630, aperçu des liens)
```

## Données

- **Utilisateur** : tout passe par `js/donnees.js`. Ses fonctions sont asynchrones, pour pouvoir brancher Supabase plus tard sans changer les pages. Aujourd'hui, tout est gardé dans le navigateur, sous des clés qui commencent par `pokibind-`.
- **Cartes** : [TCGdex](https://tcgdex.dev), en français. Les listes de cartes sont gardées une semaine dans le cache du navigateur, le détail d'une carte un jour. La recherche se fait dans le navigateur, sans tenir compte des accents.
- **Prix** : tendance Cardmarket fournie par TCGdex. Pokibind ne donne aucun prix pour le scellé : l'utilisateur saisit les siens.

## Base de données Supabase (en cours)

Les vrais comptes arrivent par étapes. Le fichier `supabase/schema.sql` crée les tables, les règles d'accès et les fonctions.
Pour l'installer : dans Supabase, ouvrir **SQL Editor**, coller tout le fichier, puis **Run**. Il peut être relancé sans perdre de données.

Sécurité :

- règles d'accès (RLS) sur toutes les tables : chacun ne lit et ne modifie que ses propres données ;
- seules les personnes connectées (email confirmé ou Google) accèdent à leurs données, jamais à celles des autres ;
- pièces, badges et achats calculés par la base ; les prix de la boutique sont dans la table `objets_boutique` ;
- le site n'utilise que la clé publique (anon / publishable) ; **la clé « service_role » ou « secret » ne doit jamais être dans le code** ;
- `_headers` : en-têtes de sécurité envoyés par Netlify (CSP, cadres interdits…) ; `_redirects` : le dossier `supabase/` n'est pas servi.

## Ajouter des objets à la boutique

- **Bannière ou cadre** : ajouter l'image dans `img/bannieres/` ou `img/cadres/`, puis une ligne dans `js/objets-profil.js` avec son prix. Pour un cadre en image, le fond doit être transparent et il faut indiquer la position du trou (centre et rayon).
- **Couverture de binder** : ajouter `<theme>-couverture.webp` et `<theme>-interieur.webp` dans `img/binders/`, puis une ligne dans `js/couvertures.js`.

## Mise en ligne

Netlify publie le dossier tel quel, depuis la racine du dépôt, sans commande de build.

## Règles

- Noms de fichiers : minuscules, sans espace ni accent, mots séparés par des tirets.
- Grandes images en .webp, moins de 200 Ko chacune.
- Images de cartes TCGdex : `low.webp` dans les grilles, `high.webp` en vue détaillée, `loading="lazy"`.
- Chemins relatifs partout (sauf `404.html`, qui a une balise `<base href="/">`).

## Licence

Le code est sous licence MIT (voir `LICENSE`). Elle ne couvre pas ce qui appartient à d'autres : Pokémon, les images des cartes (TCGdex) et les illustrations des bannières, cadres et couvertures restent à leurs auteurs.
