# Pokibind

Classeur de cartes Pokémon en ligne (HTML/CSS + JavaScript, hébergé sur Netlify, données avec Supabase et l'API TCGdex).

## Organisation du dossier

```
index.html
css/style.css          palette (:root), polices, styles
icons/                 favicons
img/binders/           <theme>-couverture.webp / <theme>-interieur.webp
                       themes : fleurs, lagon, sieste, forge, ciel, vitrail
img/energies/          energie-<type>.png (128 px) + cercle-energies.webp
                       types : feu, eau, plante, electrique, psy, combat,
                       obscurite, metal, fee, dragon, incolore
img/logos/             logo-principal, logo-horizontal, logo-icone, logo-monochrome
img/partage/           image-de-partage.png (1200 x 630, aperçu des liens)
```

## Règles

- Noms de fichiers : minuscules, sans espace ni accent, mots séparés par des tirets.
- Grandes images en .webp, moins de 200 Ko chacune.
- Images de cartes TCGdex : `low.webp` dans les grilles, `high.webp` en vue détaillée, `loading="lazy"`.
