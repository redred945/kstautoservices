# KST AutoServices — site statique

Site vitrine et demande de devis de **KST AutoServices / KST Auto Loc'** (location de voitures de luxe avec chauffeur, Paris et Région Parisienne). HTML, CSS et JavaScript purs : aucun build, aucun framework.

## Structure

```
index.html              page d'accueil (ancres : #accueil #marques #evenements #flotte #reservation #zone #contact)
nos-vehicules/<slug>/index.html   une page par véhicule (GÉNÉRÉES, voir « Pages véhicule »)
nos-vehicules/index.html          redirection vers /#flotte (l'adresse /nos-vehicules/ doit répondre)
mentions-legales.html   mentions légales (champs « à compléter » marqués)
assets/css/style.css    tous les styles (tokens en tête de fichier ; § 22 = pages véhicule, préfixe .vp-)
assets/js/app.js        logique de l'accueil (voir ci-dessous)
assets/js/vehicle.js    logique des pages véhicule (galerie, agrandissement, partage) ; n'utilise PAS app.js
assets/favicon.svg      favicon dérivé du logo (couronne dorée)
assets/img/             photos, logos, vidéo (ne pas modifier)
assets/img/og/<slug>.jpg  images de partage des pages véhicule (1200×630)
og.html, og-vehicle.html  sources des images de partage (accueil / véhicules), rendues en capture d'écran
tools/                  build-vehicles.mjs (pages + sitemap) et capture-og.mjs (images de partage), non publiés
robots.txt, sitemap.xml (sitemap.xml est généré par tools/build-vehicles.mjs)
vercel.json             redirections 301 des anciennes URLs + en-têtes
.vercelignore           exclut tools/ de la publication Vercel
```

Pour prévisualiser en local : `npx serve .` (ou tout serveur statique). Ouvrir `index.html` directement fonctionne aussi, sauf la vidéo selon le navigateur ; les pages véhicule, elles, utilisent des chemins absolus (`/assets/…`) et demandent un serveur.

## Pages véhicule (`/nos-vehicules/<slug>/`)

Chaque véhicule a sa page, avec une adresse à partager : `https://kstautoloc.fr/nos-vehicules/rolls-royce-ghost/` (avec barre oblique finale partout : liens, canonical, og:url, sitemap, bouton Partager).

| Véhicule | Adresse | `data-vehicle` |
|---|---|---|
| Rolls-Royce Ghost | `/nos-vehicules/rolls-royce-ghost/` | `ghost` |
| Mercedes Classe S Maybach Authentique | `/nos-vehicules/mercedes-classe-s-maybach/` | `classe-s` |
| Mercedes Classe G 6.3 AMG Authentique | `/nos-vehicules/mercedes-classe-g-63-amg/` | `classe-g` |
| Mercedes GLE Coupé 4.3 AMG | `/nos-vehicules/mercedes-gle-coupe-43-amg/` | `gle` |
| Porsche Cayenne Coupé | `/nos-vehicules/porsche-cayenne-coupe/` | `cayenne` |
| Maserati Ghibli | `/nos-vehicules/maserati-ghibli/` | `ghibli` |
| Mercedes Classe C | `/nos-vehicules/mercedes-classe-c/` | `classe-c` |

**Régénérer les pages et le sitemap** (Node 18+, aucune dépendance) :

```
node tools/build-vehicles.mjs
```

Le générateur lit les 7 blocs `data-vehicle-json` de `index.html` (photos, textes alternatifs, marque, type, cadrage) : pour changer une photo ou un alt, modifier `index.html` puis relancer la commande. Les textes propres à chaque véhicule (étiquette « Signature » / « Authentique », texte de marque, adresse) sont dans la table `VEHICLES` en tête de `tools/build-vehicles.mjs`. Il reprend aussi le `?v=` de `style.css` de `index.html`. Les pages générées sont commitées (le site reste 100 % statique) ; ne pas les modifier à la main.

Contenu : uniquement du réel (aucun prix, avis ni caractéristique technique) : photos, étiquette, marque, type, 5 places, 1 bagage, avec chauffeur, tarif sur devis, forfait 5 h à 10 h (ou autre durée), inclus (eau, bouquet artificiel, 130 km), options (prix sur demande), boutons Devis / Appeler / WhatsApp / Partager. « Demander un devis pour ce véhicule » renvoie vers `/?vehicule=<id>#reservation` : `app.js` ajoute le véhicule à la demande, amène le visiteur à l'étape logique du formulaire, puis nettoie l'URL.

**Images de partage** (`assets/img/og/<slug>.jpg`, 1200×630) : source `og-vehicle.html#<slug>` (ou `?v=<slug>`), rendue par `tools/capture-og.mjs` (nécessite `npm i --no-save playwright-core sharp` et le site servi en local, voir l'en-tête du script). À relancer si une photo d'avant ou un nom change (la table de `og-vehicle.html` doit rester d'accord avec `VEHICLES`).

**Serveur** : rien à configurer côté nginx (`try_files $uri $uri/ =404` sert `nos-vehicules/<slug>/index.html`). Sur l'aperçu Vercel, `trailingSlash: false` (inchangé) redirige très probablement `/nos-vehicules/<slug>/` vers la même adresse sans barre finale (non testé en ligne) ; les pages restent valides (chemins absolus, canonical avec barre) et la production nginx garde la barre. Penser à inclure `nos-vehicules/` et `assets/img/og/` dans le paquet FileZilla.

## Ce que fait `app.js`

- Menu mobile, en-tête verre dépoli au scroll, reveals et parallax (désactivés avec `prefers-reduced-motion`).
- Flotte : filtres par marque, sélection multiple ; la photo, le nom et « Voir le véhicule » de chaque carte mènent à la page du véhicule. À l'arrivée avec `?vehicule=<id>` (bouton « Demander un devis pour ce véhicule »), le véhicule est ajouté à la demande, le formulaire s'ouvre à l'étape logique et l'URL est nettoyée.
- **Module de demande** (formulaire unique) : 6 étapes : occasion, date et heure de prise en charge (calendrier maison, jour ou plage, lundi en premier, clavier), trajet (trois blocs sur une timeline : départ avec adresse + heure, arrivée obligatoire toujours en dernier, et jusqu'à 6 étapes facultatives insérées entre les deux, réordonnables ; 8 points au total ; autocomplétion via la Base Adresse Nationale, saisie libre toujours possible ; l'ancien état `localStorage` est migré : le dernier point devient l'arrivée ; envoi : champs `depart`, `arrivee`, `etapes`, `heure_prise_en_charge`), véhicules, **forfait et options** (durée 5 h à 10 h ou « Autre » en champ libre ; inclus : eau, bouquet artificiel, 130 km ; options à cocher : champagne 150 €, bouquet floral 150 €, plaque personnalisée 100 €, poteau + tapis rouge 120 € avec sous-total en direct ; km supplémentaires à 3 €/km calculés par KST, non sélectionnables ; forfait toujours sur devis, prix des options dans le tableau `OPTIONS` en tête de la section État de `app.js`), coordonnées. À l'étape 6, le visiteur ne voit que le faire-part « Votre demande en cours » (dans la colonne de droite sur ordinateur ; sur mobile, intégré à la page au-dessus des champs nom / téléphone / e-mail, alors qu'aux étapes 1 à 5 il reste dans le tiroir « Ma demande ») ; le message complet est généré en direct dans un champ masqué (`#f-message`, ni affiché ni modifiable), complété par une « précision » facultative du client (champ replié, 500 caractères, envoyée aussi dans le champ `precision`) ; il alimente l'e-mail (Web3Forms ou mailto) et WhatsApp. Forfait, options et sous-total alimentent ce message, le faire-part et l'envoi (champs `forfait`, `options`, `total_options`). État sauvegardé dans `localStorage`, effacé après un envoi réussi.
- Récapitulatif sticky (bureau) ou tiroir (mobile), barre d'action fixe sur mobile.

## Brancher l'envoi des demandes (Web3Forms)

1. Créer une clé gratuite sur https://web3forms.com avec l'adresse `contact@kstautoloc.fr`.
2. Dans `assets/js/app.js`, remplacer la valeur de `WEB3FORMS_ACCESS_KEY` (en haut du fichier) par la clé reçue.

Tant que la clé n'est pas renseignée, le formulaire bascule automatiquement sur `mailto:` (ouvre la messagerie du visiteur avec sujet et message préremplis). Les boutons « Appeler » et « WhatsApp » (`wa.me/33648480558`, texte prérempli) sont toujours proposés.

## Déploiement (Vercel)

Déployer le dossier tel quel (projet statique, sans commande de build). `vercel.json` gère :

- `/location-voiture-luxe-paris` et `/location-voiture-luxe-paris/:brand*` → `/#flotte` (301)
- `/devis-location-voiture-luxe-avec-chauffeur-paris` → `/#reservation` (301)

Après un changement de `style.css` ou `app.js`, incrémenter `?v=1` dans les balises de `index.html` pour purger le cache navigateur.

## À compléter avant la mise en ligne

- [ ] `mentions-legales.html` : identité de l'exploitant, forme juridique, SIREN/SIRET, TVA, adresse, directeur de publication, hébergeur, durée de conservation des données. Puis retirer la balise `<meta name="robots" content="noindex">` et ajouter la page au `sitemap.xml`.
- [ ] Clé `WEB3FORMS_ACCESS_KEY` (voir ci-dessus).
- [ ] Adresse exacte : seule « Région Parisienne » est affichée. Si le client souhaite une adresse, l'ajouter au pied de page, aux mentions légales et au JSON-LD (`address`).
- [ ] Avis Google : aucun avis n'est affiché. À ajouter uniquement s'ils existent et sont vérifiables (ne jamais inventer de note).
- [ ] Réseaux sociaux : aucun lien affiché (les icônes de l'ancien site ne menaient nulle part). Ajouter les vrais comptes s'ils existent.
- [ ] Tarifs : partout « Sur devis ». Aucun prix n'est affiché.
- [ ] Textes des marques Porsche et Maserati : pas de texte d'origine, volontairement sobres.
- [ ] Icône iOS (`apple-touch-icon`) : utilise le logo non carré ; fournir un PNG carré 180×180 si souhaité.
- [ ] Vérifier le nom de domaine dans `canonical`, `og:url`, `sitemap.xml` (`https://kstautoloc.fr`).

## Vidéo du hero

`assets/img/Home/hero-loop.mp4` est une boucle sans son (25 s, sans la carte de fin de la vidéo d'origine), chargée après le premier affichage et ignorée en mode économie de données ou si l'appareil limite les animations. `video-presentation.mp4` (complète, avec son) s'ouvre via « Voir la présentation ».

## Cache

CSS et JS sont mis en cache 1 h par Vercel : à chaque modification, changer le `?v=` (AAAAMMJJHHMM) de `style.css` et `app.js` dans `index.html` et `mentions-legales.html`, puis relancer `node tools/build-vehicles.mjs` (les pages véhicule reprennent la valeur de `index.html` pour `style.css` et `vehicle.js`), sinon les visiteurs récents gardent l'ancienne version avec la nouvelle page.

## Image de partage

`assets/img/og-kst.jpg` (1200×630) est générée depuis `og.html` (capture d'écran à 1200×630). Les balises `og:image` pointent vers `kstautoservices.vercel.app`, qui reste valable après le branchement du domaine.
