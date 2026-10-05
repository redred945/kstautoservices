#!/usr/bin/env node
/* ==========================================================================
   KST Auto Loc’ — générateur des pages véhicule
   --------------------------------------------------------------------------
   Usage (depuis la racine du dépôt) :   node tools/build-vehicles.mjs

   Lit les 7 blocs <script data-vehicle-json> de index.html (images, alts, marque,
   modèle, type, position de cadrage) et écrit :
     - nos-vehicules/<slug>/index.html   une page par véhicule (chemins absolus /assets/…)
     - sitemap.xml                       accueil + mentions légales + les 7 pages

   Les pages générées sont commitées : le site reste 100 % statique, sans build côté serveur.
   Le numéro de version ?v= de style.css est repris de index.html, pour que les pages
   véhicule et l'accueil partagent toujours la même version des fichiers.

   Les textes propres à chaque véhicule (étiquette, texte de marque) sont dans la table
   VEHICLES ci-dessous. Rien n'est inventé : pas de prix, pas d'avis, pas de caractéristiques
   techniques.

   Aucune dépendance : Node 18+.
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://kstautoloc.fr';
const PHONE = { tel: '+33648480558', human: '06.48.48.05.58', wa: 'https://wa.me/33648480558' };
const BRAND_NAME = 'KST Auto Loc’';
const TAGLINE = 'Location avec chauffeur · Île-de-France & régions voisines';

/* Textes de marque réels (repris du site actuel) */
const BRAND_TEXT = {
  mercedes: 'Un mariage en Mercedes : le luxe raffiné et le confort exceptionnel, symboles d’une union où chaque instant est une promesse d’élégance.',
  rolls: 'Un mariage en Rolls Royce Ghost : une célébration d’amour enveloppée dans le luxe intemporel, une promenade vers l’avenir avec élégance et grâce.'
};
/* Phrase générique : seule phrase affichée pour Porsche et Maserati (pas de texte d'origine) */
const GENERIC_TEXT = 'Disponible avec chauffeur pour votre mariage, anniversaire ou tout autre événement, en Île-de-France et dans les régions voisines.';

/* Table propre à chaque véhicule. La clé = data-vehicle de index.html.
   name   : titre h1 (nom complet)       accent : mot mis en italique doré dans le titre
   tag    : étiquette dorée (comme sur les cartes de l'accueil)
   blurb  : clé de BRAND_TEXT (absente = phrase générique seule)                              */
const VEHICLES = {
  ghost:      { slug: 'rolls-royce-ghost',          name: 'Rolls-Royce Ghost',                      tag: 'Signature',           blurb: 'rolls' },
  'classe-s': { slug: 'mercedes-classe-s-maybach',  name: 'Mercedes Classe S Maybach Authentique',  tag: 'Authentique Maybach', blurb: 'mercedes', accent: 'Authentique' },
  'classe-g': { slug: 'mercedes-classe-g-63-amg',   name: 'Mercedes Classe G 6.3 AMG Authentique',  tag: 'Authentique',         blurb: 'mercedes', accent: 'Authentique' },
  gle:        { slug: 'mercedes-gle-coupe-43-amg',  name: 'Mercedes GLE Coupé 4.3 AMG',             blurb: 'mercedes' },
  cayenne:    { slug: 'porsche-cayenne-coupe',      name: 'Porsche Cayenne Coupé' },
  ghibli:     { slug: 'maserati-ghibli',            name: 'Maserati Ghibli' },
  'classe-c': { slug: 'mercedes-classe-c',          name: 'Mercedes Classe C',                      blurb: 'mercedes' }
};

/* Contenus réels de l'étape « Forfait et options » du formulaire (aucun prix) */
const FORFAIT_HOURS = ['5 h', '6 h', '7 h', '8 h', '9 h', '10 h'];
const INCLUDED = [
  'Bouteille d’eau',
  '<strong>Bouquet artificiel</strong> inclus, sans supplément',
  'Distance : 130 km inclus'
];
const OPTIONS = ['Bouteille de champagne', 'Bouquet floral', 'Plaque d’immatriculation personnalisée', 'Poteau + tapis rouge'];

/* ---------- Utilitaires ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* espaces insécables : « Classe S », « 4.3 AMG » ne se coupent plus en fin de ligne dans les titres */
const nb = s => s.replace(/(Classe) ([SGC])(?=\s|$)/g, '$1\u00a0$2').replace(/(\d\.\d) AMG/g, '$1\u00a0AMG');
const abs = p => (p.startsWith('/') ? p : '/' + p);                  // chemin de fichier → chemin absolu depuis la racine
const url = slug => `${SITE}/nos-vehicules/${slug}/`;
const jsonLd = obj => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
const fail = msg => { console.error('Erreur : ' + msg); process.exit(1); };

/* ---------- Lecture de index.html ---------- */
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const version = (indexHtml.match(/assets\/css\/style\.css\?v=(\d+)/) || [])[1];
if (!version) fail('numéro de version ?v= de style.css introuvable dans index.html');

const blocks = [...indexHtml.matchAll(/<script type="application\/json" data-vehicle-json>\s*([\s\S]*?)\s*<\/script>/g)];
const vehicles = blocks.map(m => {
  let data;
  try { data = JSON.parse(m[1]); } catch (e) { fail('JSON de véhicule invalide dans index.html : ' + e.message); }
  const t = VEHICLES[data.id];
  if (!t) fail(`véhicule « ${data.id} » absent de la table VEHICLES`);
  if (!Array.isArray(data.images) || data.images.length < 2) fail(`${data.id} : au moins 2 images attendues`);
  data.images.forEach(im => { if (!existsSync(join(ROOT, im.src))) fail(`image introuvable : ${im.src}`); });
  return { ...data, ...t, model: t.name.slice(data.brand.length).trim() };
});
if (vehicles.length !== Object.keys(VEHICLES).length) fail(`${vehicles.length} véhicules lus dans index.html, ${Object.keys(VEHICLES).length} attendus`);

/* ---------- Gabarits ---------- */
const ico = (id, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

const SPRITE = `
  <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
    <defs>
      <symbol id="i-phone" viewBox="0 0 24 24"><path d="M5 4h3.2l1.6 4-2 1.4a11 11 0 0 0 5.8 5.8l1.4-2 4 1.6V18a2 2 0 0 1-2 2A14 14 0 0 1 3 6a2 2 0 0 1 2-2z"/></symbol>
      <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M4 12h16M14 6l6 6-6 6"/></symbol>
      <symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
      <symbol id="i-chev-l" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></symbol>
      <symbol id="i-chev-r" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></symbol>
      <symbol id="i-seat" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></symbol>
      <symbol id="i-bag" viewBox="0 0 24 24"><path d="M6 8h12l1 12H5zM9 8V6a3 3 0 0 1 6 0v2"/></symbol>
      <symbol id="i-wheel" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M3.5 10.5l6.5.5M20.5 10.5L14 11M12 14v7"/></symbol>
      <symbol id="i-chat" viewBox="0 0 24 24"><path d="M4 20l1.3-4.2A8 8 0 1 1 8.4 18.8z"/></symbol>
      <symbol id="i-share" viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 13v7h14v-7"/></symbol>
      <symbol id="i-expand" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></symbol>
    </defs>
  </svg>`;

function relatedCards(v) {
  const i = vehicles.findIndex(x => x.id === v.id);
  const others = [...vehicles.slice(i + 1), ...vehicles.slice(0, i)];   // les 6 autres, en commençant après le véhicule courant
  return others.map(o => {
    const first = o.images[0];
    const model = o.accent ? `${esc(nb(o.model.replace(o.accent, '').trim()))} <em>${esc(o.accent)}</em>` : esc(nb(o.model));
    return `
        <li>
          <a class="vp-card" href="/nos-vehicules/${o.slug}/" style="--pos:${esc(o.pos)}">
            <span class="vp-card__media"><img src="${esc(abs(first.src))}" alt="" width="${first.w}" height="${first.h}" loading="lazy" decoding="async"></span>
            <span class="vp-card__body">
              <span class="vp-card__brand">${esc(o.brand)}</span>
              <span class="vp-card__name">${model}</span>
              <span class="vp-card__go">Voir le véhicule ${ico('i-arrow')}</span>
            </span>
          </a>
        </li>`;
  }).join('');
}

function page(v) {
  const pageUrl = url(v.slug);
  const title = `${v.name} – Location avec chauffeur Île-de-France | ${BRAND_NAME}`;
  const description = `${v.name} avec chauffeur pour votre mariage ou événement en Île-de-France et régions voisines. 5 places, 1 bagage. Tarif sur devis.`;
  const ogImage = `${SITE}/assets/img/og/${v.slug}.jpg`;
  const ogAlt = `${v.name} – ${TAGLINE}`;
  const first = v.images[0];
  const n = v.images.length;
  const quote = `/?vehicule=${encodeURIComponent(v.id)}#reservation`;
  const shareTitle = `${v.name} – ${BRAND_NAME}`;
  const shareText = `${v.name} : location avec chauffeur en Île-de-France`;
  const waShare = `https://wa.me/?text=${encodeURIComponent(`${shareTitle}\n${pageUrl}`)}`;
  const titleHtml = v.accent ? `${esc(nb(v.name.replace(v.accent, '').trim()))} <em>${esc(v.accent)}</em>` : esc(nb(v.name));

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Nos véhicules', item: `${SITE}/#flotte` },
          { '@type': 'ListItem', position: 3, name: v.name, item: pageUrl }
        ]
      },
      {
        '@type': 'Product',
        name: v.name,
        url: pageUrl,
        image: v.images.map(im => `${SITE}${abs(im.src)}`),
        brand: { '@type': 'Brand', name: v.brand },
        description
      }
    ]
  };

  const slides = v.images.map((im, i) => `
          <div class="vp-slide" role="group" aria-roledescription="diapositive" aria-label="Photo ${i + 1} sur ${n}">
            <img class="vp-slide__bg" src="${esc(abs(im.src))}" alt="" aria-hidden="true" width="${im.w}" height="${im.h}"${i ? ' loading="lazy"' : ''} decoding="async">
            <button class="vp-slide__open" type="button" data-open="${i}" aria-haspopup="dialog">
              <img src="${esc(abs(im.src))}" alt="${esc(im.alt)}" width="${im.w}" height="${im.h}"${i ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async">
              <span class="vh">Agrandir la photo</span>
              <span class="vp-slide__zoom" aria-hidden="true">${ico('i-expand')}</span>
            </button>
          </div>`).join('');

  const thumbs = v.images.map((im, i) => `
          <li><button type="button" data-thumb="${i}" aria-label="Voir la photo ${i + 1} sur ${n}"${i === 0 ? ' aria-current="true"' : ''}><img src="${esc(abs(im.src))}" alt="" width="${im.w}" height="${im.h}"${i ? ' loading="lazy"' : ''} decoding="async"></button></li>`).join('');

  const chips = [
    v.type ? `<li>${esc(v.type)}</li>` : '',
    `<li>${ico('i-seat')}5 places</li>`,
    `<li>${ico('i-bag')}1 bagage</li>`,
    `<li>${ico('i-wheel')}Avec chauffeur</li>`
  ].filter(Boolean).join('\n            ');

  return `<!doctype html>
<html lang="fr" class="vp">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#f4efe6">
  <meta name="color-scheme" content="light">
  <link rel="canonical" href="${pageUrl}">

  <meta property="og:type" content="website">
  <meta property="og:locale" content="fr_FR">
  <meta property="og:site_name" content="${BRAND_NAME}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:secure_url" content="${ogImage}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(ogAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${ogImage}">
  <meta name="twitter:image:alt" content="${esc(ogAlt)}">

  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@300;400;500&display=swap">
  <link rel="preload" as="image" href="${esc(abs(first.src))}" fetchpriority="high">
  <link rel="stylesheet" href="/assets/css/style.css?v=${version}">

  <script type="application/ld+json">
${jsonLd(graph)}
  </script>
</head>

<body>
  <!-- Page générée par tools/build-vehicles.mjs : ne pas modifier à la main. -->
  <a class="skip" href="#contenu">Aller au contenu</a>
${SPRITE}

  <header class="site-header is-scrolled vp-header">
    <div class="site-header__inner">
      <a class="site-logo" href="/" aria-label="KST Auto Loc’ – retour à l’accueil">
        <img src="/assets/img/logo/logo-kst.webp" alt="KST Auto Loc’" width="873" height="676">
      </a>
      <a class="back-link vp-back" href="/#flotte">${ico('i-chev-l')}<span>Nos véhicules</span></a>
      <div class="site-header__actions">
        <a class="header-phone" href="tel:${PHONE.tel}" aria-label="Appeler le ${PHONE.human}">
          ${ico('i-phone')}
          <span>${PHONE.human}</span>
        </a>
        <a class="btn btn--gold btn--sm" href="${quote}">Demander un devis</a>
      </div>
    </div>
  </header>

  <main id="contenu" class="vp-main">
    <div class="container">

      <nav class="vp-crumbs" aria-label="Fil d’Ariane">
        <ol>
          <li><a href="/">Accueil</a></li>
          <li><a href="/#flotte">Nos véhicules</a></li>
          <li><span aria-current="page">${esc(v.name)}</span></li>
        </ol>
      </nav>

      <div class="vp-hero">

        <div class="vp-gallery" data-gallery role="group" aria-roledescription="carrousel" aria-label="Photos : ${esc(v.name)}">
          <div class="vp-stage">
            <div class="vp-track" id="vp-track" data-track>${slides}
            </div>
            <button class="vp-nav vp-nav--prev" type="button" data-prev aria-label="Photo précédente">${ico('i-chev-l')}</button>
            <button class="vp-nav vp-nav--next" type="button" data-next aria-label="Photo suivante">${ico('i-chev-r')}</button>
            <p class="vp-count" aria-hidden="true"><span data-cur>1</span> / ${n}</p>
          </div>
          <div class="vp-progress" data-progress="vp-track" aria-hidden="true"><span></span></div>
          <ul class="vp-thumbs" aria-label="Choisir une photo">${thumbs}
          </ul>
        </div>

        <div class="vp-info">
${v.tag ? `          <p class="vp-tag">${esc(v.tag)}</p>\n` : ''}          <p class="vp-brand">${esc(v.brand)}</p>
          <h1 class="vp-title" id="vp-title">${titleHtml}</h1>
          <ul class="chips vp-chips">
            ${chips}
          </ul>
          <p class="vp-price">Tarif <span>Sur devis</span></p>
          <div class="vp-text">
${v.blurb ? `            <p class="vp-quote">${esc(BRAND_TEXT[v.blurb])}</p>\n` : ''}            <p>${esc(GENERIC_TEXT)}</p>
          </div>

          <div class="vp-cta">
            <a class="btn btn--gold btn--block vp-cta__main" href="${quote}">Demander un devis pour ce véhicule</a>
            <div class="vp-cta__row">
              <a class="btn btn--ghost vp-contact" href="tel:${PHONE.tel}">${ico('i-phone')}<span><small>Appeler</small><b>${PHONE.human}</b></span></a>
              <a class="btn btn--ghost vp-contact" href="${PHONE.wa}" target="_blank" rel="noopener">${ico('i-chat')}<span><small>WhatsApp</small><b>Nous écrire</b></span></a>
            </div>
          </div>
        </div>

        <div class="vp-share">
          <p class="vp-share__label">Partager ce véhicule</p>
          <div class="vp-cta__row">
            <button class="btn btn--ghost" type="button" data-share hidden data-share-title="${esc(shareTitle)}" data-share-text="${esc(shareText)}" data-share-url="${pageUrl}">${ico('i-share')}Partager</button>
            <a class="btn btn--ghost" href="${waShare}" target="_blank" rel="noopener">${ico('i-chat')}Envoyer par WhatsApp</a>
          </div>
          <p class="vp-share__status" role="status" aria-live="polite" data-share-status></p>
        </div>
      </div>

      <section class="vp-section" aria-labelledby="vp-forfait-title">
        <header class="vp-section__head">
          <p class="eyebrow">Votre prestation</p>
          <h2 class="vp-h2" id="vp-forfait-title">Forfait et options</h2>
        </header>
        <div class="vp-details">
          <div class="vp-box">
            <h3>Forfait</h3>
            <p class="vp-box__lead">De 5 h à 10 h, ou une autre durée de votre choix. Tarif sur devis.</p>
            <ul class="vp-hours" aria-label="Durées proposées">
              ${FORFAIT_HOURS.map(h => `<li>${h}</li>`).join('\n              ')}
              <li>Autre durée</li>
            </ul>
          </div>
          <div class="vp-box">
            <h3>Inclus dans le forfait</h3>
            <ul class="vp-ticks">
              ${INCLUDED.map(t => `<li><span class="vp-tick" aria-hidden="true">${ico('i-check')}</span><span>${t}</span></li>`).join('\n              ')}
            </ul>
          </div>
          <div class="vp-box">
            <h3>Options</h3>
            <ul class="vp-opts">
              ${OPTIONS.map(o => `<li><span>${esc(o)}</span><span class="vp-opts__price">Prix sur demande</span></li>`).join('\n              ')}
            </ul>
            <p class="vp-box__note">Un bouquet artificiel est déjà inclus dans le forfait.</p>
          </div>
        </div>
      </section>

      <section class="vp-section" aria-labelledby="vp-more-title">
        <header class="vp-section__head vp-section__head--split">
          <div>
            <p class="eyebrow">Toute la flotte</p>
            <h2 class="vp-h2" id="vp-more-title">Découvrir aussi</h2>
          </div>
          <a class="link-arrow" href="/#flotte">Tous nos véhicules ${ico('i-arrow')}</a>
        </header>
        <ul class="vp-more__row" id="vp-more">${relatedCards(v)}
        </ul>
        <div class="vp-progress" data-progress="vp-more" aria-hidden="true"><span></span></div>
      </section>

    </div>
  </main>

  <footer class="footer">
    <div class="container">
      <div class="footer__top">
        <div class="footer__brand">
          <img src="/assets/img/logo/logo-footer.webp" alt="KST Auto Loc’" width="444" height="344" loading="lazy" decoding="async">
          <p>Location de voiture de luxe avec chauffeur Paris</p>
          <address class="footer__addr">
            <strong>KST AutoServices</strong>
            <span>16 rue Robert Schuman</span>
            <span>77330 Ozoir-la-Ferrière</span>
            <a href="https://www.google.com/maps/search/?api=1&amp;query=16+rue+Robert+Schuman+77330+Ozoir-la-Ferri%C3%A8re" target="_blank" rel="noopener">Voir sur la carte</a>
          </address>
        </div>
        <div>
          <h2 class="footer__h">Zone</h2>
          <ul>
            <li>Île-de-France</li>
            <li>Régions voisines</li>
          </ul>
        </div>
        <div>
          <h2 class="footer__h">Contact</h2>
          <ul>
            <li><a href="tel:${PHONE.tel}">${PHONE.human}</a></li>
            <li><a href="mailto:contact@kstautoloc.fr">contact@kstautoloc.fr</a></li>
            <li><a href="https://www.instagram.com/kst.auto.loc/" target="_blank" rel="noopener">Instagram · @kst.auto.loc</a></li>
            <li><a href="https://www.snapchat.com/add/kstautoloc" target="_blank" rel="noopener">Snapchat · kstautoloc</a></li>
          </ul>
        </div>
        <div>
          <h2 class="footer__h">Horaires</h2>
          <ul>
            <li><span>Lun – Ven</span> 8h30 – 22h30</li>
            <li><span>Samedi</span> 9h30 – 23h30</li>
            <li><span>Dimanche</span> fermé</li>
          </ul>
        </div>
      </div>
      <div class="footer__labels">
        <p class="footer__h">Distinctions mariages.net</p>
        <ul>
          <li><a href="https://www.mariages.net/voiture-mariage/kst-auto-loc--e322516" target="_blank" rel="noopener" aria-label="Recommandé mariages.net, 5 étoiles, 50 opinions — voir la fiche"><img src="/assets/img/labels/recommande.webp" alt="Recommandé mariages.net — 5 étoiles, 50 opinions" width="440" height="440" loading="lazy" decoding="async"></a></li>
          <li><a href="https://www.mariages.net/voiture-mariage/kst-auto-loc--e322516" target="_blank" rel="noopener" aria-label="mariages.net Wedding Awards 2026 — voir la fiche"><img src="/assets/img/labels/awards2026.webp" alt="mariages.net Wedding Awards 2026" width="440" height="440" loading="lazy" decoding="async"></a></li>
          <li><a href="https://www.mariages.net/voiture-mariage/kst-auto-loc--e322516" target="_blank" rel="noopener" aria-label="mariages.net Wedding Awards 2025 — voir la fiche"><img src="/assets/img/labels/awards2025.webp" alt="mariages.net Wedding Awards 2025" width="440" height="440" loading="lazy" decoding="async"></a></li>
        </ul>
      </div>
      <div class="footer__bottom">
        <p>© <span data-year>2026</span> KST Auto Loc’ · KST AutoServices</p>
        <ul>
          <li><a href="/#flotte">Nos véhicules</a></li>
          <li><a href="/#evenements">Événements</a></li>
          <li><a href="/#reservation">Réserver</a></li>
          <li><a href="/mentions-legales.html">Mentions légales</a></li>
          <li><a href="/">Accueil</a></li>
        </ul>
      </div>
    </div>
  </footer>

  <!-- Barre d'action mobile -->
  <div class="cta-bar vp-bar">
    <a class="btn btn--ghost" href="tel:${PHONE.tel}">${ico('i-phone')}Appeler</a>
    <a class="btn btn--gold" href="${quote}">Demander un devis</a>
  </div>

  <!-- Agrandissement des photos (géré par vehicle.js) -->
  <div class="vp-lb" role="dialog" aria-modal="true" aria-label="Photos : ${esc(v.name)}" tabindex="-1" hidden data-lb>
    <div class="vp-lb__bar">
      <p class="vp-lb__count" aria-live="polite" data-lb-count></p>
      <button class="vp-lb__btn" type="button" data-lb-close aria-label="Fermer l’agrandissement">${ico('i-close')}</button>
    </div>
    <div class="vp-lb__stage" data-lb-stage>
      <button class="vp-lb__btn vp-lb__nav vp-lb__nav--prev" type="button" data-lb-prev aria-label="Photo précédente">${ico('i-chev-l')}</button>
      <div class="vp-lb__frame" data-lb-frame></div>
      <button class="vp-lb__btn vp-lb__nav vp-lb__nav--next" type="button" data-lb-next aria-label="Photo suivante">${ico('i-chev-r')}</button>
    </div>
    <p class="vp-lb__cap" data-lb-cap></p>
  </div>

  <script src="/assets/js/vehicle.js?v=${version}" defer></script>
</body>
</html>
`;
}

/* ---------- Écriture des pages ---------- */
for (const v of vehicles) {
  const dir = join(ROOT, 'nos-vehicules', v.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), page(v));
  console.log(`  nos-vehicules/${v.slug}/index.html`);
}

/* ---------- sitemap.xml ---------- */
const today = new Date().toISOString().slice(0, 10);
const entries = [
  { loc: `${SITE}/`, freq: 'monthly', prio: '1.0' },
  ...vehicles.map(v => ({ loc: url(v.slug), freq: 'monthly', prio: '0.8' }))
];
writeFileSync(join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  entries.map(e => `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${e.freq}</changefreq>\n    <priority>${e.prio}</priority>\n  </url>\n`).join('') +
  `</urlset>\n`);
console.log(`  sitemap.xml (${entries.length} URL)`);
console.log(`OK : ${vehicles.length} pages véhicule, version ?v=${version}`);
