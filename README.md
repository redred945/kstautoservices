# KST AutoServices — site statique

Site vitrine et demande de devis de **KST AutoServices / KST Auto Loc'** (location de voitures de luxe avec chauffeur, Paris et Région Parisienne). HTML, CSS et JavaScript purs : aucun build, aucun framework.

## Structure

```
index.html              page unique (ancres : #accueil #marques #evenements #flotte #reservation #zone #contact)
mentions-legales.html   mentions légales (champs « à compléter » marqués)
assets/css/style.css    tous les styles (tokens en tête de fichier)
assets/js/app.js        toute la logique (voir ci-dessous)
assets/favicon.svg      favicon dérivé du logo (couronne dorée)
assets/img/             photos, logos, vidéo (ne pas modifier)
robots.txt, sitemap.xml
vercel.json             redirections 301 des anciennes URLs + en-têtes
```

Pour prévisualiser en local : `npx serve .` (ou tout serveur statique). Ouvrir `index.html` directement fonctionne aussi, sauf la vidéo selon le navigateur.

## Ce que fait `app.js`

- Menu mobile, en-tête verre dépoli au scroll, reveals et parallax (désactivés avec `prefers-reduced-motion`).
- Flotte : filtres par marque, sélection multiple, galerie plein écran (clavier, flèches, Échap, swipe, piège à focus).
- **Module de demande** (formulaire unique) : occasion + ville, calendrier maison (jour ou plage, lundi en premier, clavier), heure de prise en charge, véhicules, coordonnées. Le champ « Votre demande » est rédigé en direct d'après les choix et reste modifiable. État sauvegardé dans `localStorage`, effacé après un envoi réussi.
- Récapitulatif sticky (bureau) ou tiroir (mobile), barre d'action fixe sur mobile.

## Brancher l'envoi des demandes (Web3Forms)

1. Créer une clé gratuite sur https://web3forms.com avec l'adresse `contact@kstautoservices.com`.
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
- [ ] Vérifier le nom de domaine dans `canonical`, `og:url`, `sitemap.xml` (`https://kstautoservices.com`).

## Vidéo du hero

`assets/img/Home/hero-loop.mp4` est une boucle sans son (25 s, sans la carte de fin de la vidéo d'origine), chargée après le premier affichage et ignorée en mode économie de données ou si l'appareil limite les animations. `video-presentation.mp4` (complète, avec son) s'ouvre via « Voir la présentation ».

## Cache

CSS et JS sont mis en cache 1 h par Vercel : à chaque modification, changer le `?v=` de `style.css` et `app.js` dans `index.html` et `mentions-legales.html`, sinon les visiteurs récents gardent l'ancienne version avec la nouvelle page.
