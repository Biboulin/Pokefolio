# PokéFolio

Application web installable (PWA) pour suivre la valeur d'une collection de cartes Pokémon. Pensée pour iPhone, données 100 % locales.

## Fonctionnalités
- Tableau de bord : valeur estimée, plus-value latente et réalisée, meilleure et moins bonne carte
- Graphiques : valeur payée → valeur actuelle, répartition de la valeur, évolution dans le temps
- Collection : recherche, tri (+/−, valeur, %, A–Z), filtres (en stock, vendues, sans photo)
- Valeur = Réf. NM × coef langue × coef état, ou une **valeur finale** saisie à la main
- **Prix de référence NM** modifiable, version FR ou toutes langues
- Images : photo prise avec l'iPhone, lien d'image collé, ou image officielle TCGdex (FR puis EN) ; illustration par défaut en dernier recours
- Ventes : « Marquer vendue » enregistre la plus-value réalisée
- Hors ligne (service worker), sauvegarde et restauration par fichier JSON (photos incluses)

## Stockage
IndexedDB du navigateur (données + photos en blobs). Rien n'est envoyé sur un serveur.
⚠️ Exporte une sauvegarde de temps en temps (Réglages → Exporter) : effacer les données de Safari efface la collection.

## Déployer sur GitHub Pages
```bash
gh repo create pokefolio --public --source=. --push
gh api -X POST repos/{owner}/pokefolio/pages -f "source[branch]=main" -f "source[path]=/"
```
Ou depuis l'interface : Settings → Pages → Source « Deploy from a branch » → `main` / `/ (root)`.
L'app est ensuite en ligne sur `https://<ton-user>.github.io/pokefolio/`.

## Installer sur iPhone
Safari → ouvrir l'URL → Partager → « Sur l'écran d'accueil ».

## Mettre à jour l'app
Modifie les fichiers, **incrémente `VERSION` dans `sw.js`**, puis commit et push. Les données de l'iPhone ne sont pas touchées.

## Structure
| Fichier | Rôle |
|---|---|
| `index.html` | structure de l'app (3 onglets et bouton +) |
| `app.css` | styles (thème sombre, adapté aux zones sûres de l'iPhone) |
| `app.js` | logique : stockage, calculs, graphiques, fiches |
| `seed.js` | données de départ (les 6 cartes du POC) |
| `sw.js` | service worker (hors ligne, cache des images) |
| `manifest.webmanifest`, `icons/` | installation PWA |

## Feuille de route
- [ ] Mise à jour automatique des prix (GitHub Actions + API TCGdex → `prices.json`)
- [ ] Synchronisation entre appareils (petit backend)

## Classeurs (POC v2)
Nouvelle app dans `classeurs/` : classeurs de cartes animés, classeurs d'échange, wishlist, prix d'achat et prix actuel saisis à la main, liens eBay (ventes réussies) et Cardmarket, mode Vitrine pour partager une page.
En ligne sur `https://<ton-user>.github.io/Pokefolio/classeurs/` (attention à la majuscule, GitHub Pages respecte la casse du nom du repo`, à installer à part depuis Safari. Elle n'a aucun lien avec les données de la v1 (son stockage est séparé).
