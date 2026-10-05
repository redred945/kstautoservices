/* ==========================================================================
   KST Auto Loc’ — app.js
   JS vanille, sans dépendance.

   ENVOI DU FORMULAIRE
   -------------------
   Le site est statique. Deux modes d'envoi, choisis automatiquement :

   1. Web3Forms (recommandé) : créez une clé gratuite sur https://web3forms.com
      avec l'adresse contact@kstautoloc.fr, puis collez-la ci-dessous à la
      place de WEB3FORMS_ACCESS_KEY. La demande est alors envoyée par e-mail au
      client sans quitter le site.
   2. Tant que la clé n'est pas renseignée : repli propre sur mailto: (ouvre le
      client e-mail du visiteur avec sujet et corps préremplis).
   ========================================================================== */
(() => {
  'use strict';

  const WEB3FORMS_ACCESS_KEY = 'WEB3FORMS_ACCESS_KEY';

  const CONTACT = {
    email: 'contact@kstautoloc.fr',
    tel: '+33648480558',
    telHuman: '06.48.48.05.58',
    wa: 'https://wa.me/33648480558'
  };
  const STORE_KEY = 'kst-demande-v1';
  const WEB3FORMS_URL = 'https://api.web3forms.com/submit';
  const VIDEO_SRC = 'assets/img/Home/video-presentation.mp4';
  const BAN_URL = 'https://api-adresse.data.gouv.fr/search/';   // Base Adresse Nationale (gratuite, sans clé) ; lat/lon = priorité à l'Île-de-France
  const MAX_POINTS = 8;                                          // départ + arrivée + jusqu'à 6 étapes entre les deux
  const STEPS = 6;

  /* ---------- Utilitaires ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smooth = () => (RM ? 'auto' : 'smooth');

  /* ==========================================================================
     Splash (posé par le script inline du <head>, une fois par session) :
     passe au clic / toucher / touche. S'il échoue, le CSS seul referme le
     splash à 3,2 s et joue l'entrée du hero (fill-mode both) sans aide du JS.
     ========================================================================== */
  (function splash() {
    const root = document.documentElement;
    const splashEl = document.querySelector('[data-splash]');
    if (!splashEl || !root.classList.contains('is-splash')) return;
    const door = splashEl.querySelector('.splash-panel--bottom');
    let done = false;
    const EVENTS = ['pointerdown', 'touchstart', 'keydown'];
    function finish() {
      if (done) return;
      done = true;
      if (splashEl.classList.contains('is-skipping')) root.classList.remove('is-splash');
      splashEl.remove();
      EVENTS.forEach(t => window.removeEventListener(t, skip));
    }
    // En fin naturelle, .is-splash reste posée : l'entrée du hero, déjà calée sur l'ouverture
    // des rideaux, continue sans à-coup. Si on passe le splash, on la retire pour avancer l'entrée.
    function skip() {
      if (done || splashEl.classList.contains('is-skipping')) return;
      splashEl.classList.add('is-skipping');
      setTimeout(finish, 460);
    }
    EVENTS.forEach(t => window.addEventListener(t, skip, { passive: true }));
    if (door) door.addEventListener('animationend', e => {
      if (e.animationName === 'splash-open-down') finish();
    });
    setTimeout(finish, 2600);
  })();

  const storage = {
    get() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
    clear() { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* idem */ } }
  };

  const announcerEl = $('#announcer');
  function announce(msg) {
    if (!announcerEl) return;
    announcerEl.textContent = '';
    setTimeout(() => { announcerEl.textContent = msg; }, 60);
  }

  const headerH = () => (document.querySelector('[data-header]') || {}).offsetHeight || 70;

  /* ---------- Dates (français, lundi en premier) ---------- */
  const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const isISO = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const dayNum = n => (n === 1 ? '1er' : String(n));
  const TODAY = toISO(new Date());

  function longDate(iso) {
    const d = fromISO(iso);
    return `${DAYS[d.getDay()]} ${dayNum(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  /* « samedi 12 au dimanche 13 septembre 2026 » (sans le « du » initial) */
  function rangeText(a, b) {
    const x = fromISO(a), y = fromISO(b);
    let left = `${DAYS[x.getDay()]} ${dayNum(x.getDate())}`;
    if (x.getFullYear() !== y.getFullYear()) left += ` ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
    else if (x.getMonth() !== y.getMonth()) left += ` ${MONTHS[x.getMonth()]}`;
    return `${left} au ${longDate(b)}`;
  }
  const timeLabel = t => { const [h, m] = t.split(':'); return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`; };

  /* ---------- Données véhicules (lues dans le HTML) ---------- */
  const cards = $$('[data-vehicle]');
  const fleetGrid = $('[data-fleet]');
  const vehicles = {};
  const order = [];
  cards.forEach(card => {
    try {
      const data = JSON.parse($('[data-vehicle-json]', card).textContent);
      vehicles[data.id] = data;
      order.push(data.id);
    } catch (e) { /* carte ignorée si JSON invalide */ }
  });

  const OCC = {
    mariage: { label: 'Mariage', phrase: 'un mariage', icon: 'i-rings' },
    anniversaire: { label: 'Anniversaire', phrase: 'un anniversaire', icon: 'i-flute' },
    autre: { label: 'Autre événement', phrase: 'un événement', icon: 'i-spark' }
  };

  /* Forfait (durée) et options, d'après la fiche de commande du client.
     Aucun prix affiché (demande du client) : tout est « prix sur demande ». Les km au-delà des
     130 km inclus ne sont pas une option : KST les calcule d'après le trajet. */
  const FORFAITS = ['5h', '6h', '7h', '8h', '9h', '10h'];
  const OPTIONS = [
    { id: 'champagne', label: 'Bouteille de champagne', short: 'Champagne' },
    { id: 'bouquet', label: 'Bouquet floral', short: 'Bouquet floral', note: 'Un bouquet artificiel est déjà inclus dans le forfait.' },
    { id: 'plaque', label: 'Plaque d’immatriculation personnalisée', short: 'Plaque personnalisée' },
    { id: 'poteau', label: 'Poteau + tapis rouge', short: 'Poteau + tapis rouge' }
  ];
  const optById = Object.fromEntries(OPTIONS.map(o => [o.id, o]));
  const NBSP = String.fromCharCode(160);
  const hoursLabel = id => id.replace('h', ' h');

  /* ==========================================================================
     État & persistance
     ========================================================================== */
  /* Un point du trajet : adresse saisie (ou libellé BAN), ville mémorisée, heure facultative.
     trip = [départ, …étapes…, arrivée] : toujours au moins 2 points.
     trip[0] = départ (son heure est state.time, choisie à l'étape 2) ; le dernier point est l'arrivée (sans heure). */
  let ptSeq = 0;
  const TIME_RE = /^\d{2}:\d{2}$/;
  const newPoint = (o = {}) => ({ id: ++ptSeq, addr: str(o.addr, 160), city: str(o.city, 80), time: TIME_RE.test(o.time || '') ? o.time : '' });

  const DEFAULTS = () => ({
    occasion: '', mode: 'single', start: '', end: '', time: '', trip: [newPoint(), newPoint()],
    vehicles: [], forfait: '', forfaitAutre: '', options: [],
    name: '', email: '', phone: '', precision: ''
  });
  const state = DEFAULTS();
  let precisionOpen = false; // champ « précision » déplié (état d'affichage, non persisté)

  function restore() {
    const s = storage.get();
    if (!s || typeof s !== 'object') return;
    if (OCC[s.occasion]) state.occasion = s.occasion;
    // Ancienne clé « city » (avant l'étape Trajet) : volontairement ignorée.
    // Migration : 1 point -> on ajoute une arrivée vide ; 2 points ou plus -> le dernier devient l'arrivée
    // (son éventuelle heure est ignorée) ; état illisible -> deux points vides (valeurs par défaut).
    if (Array.isArray(s.trip)) {
      const t = s.trip.filter(pt => pt && typeof pt === 'object').slice(0, MAX_POINTS).map(newPoint);
      if (t.length === 1) t.push(newPoint());
      if (t.length >= 2) {
        t[t.length - 1].time = '';
        state.trip = t;
      }
    }
    if (s.mode === 'range') state.mode = 'range';
    if (isISO(s.start) && s.start >= TODAY) {
      state.start = s.start;
      if (state.mode === 'range' && isISO(s.end) && s.end > s.start) state.end = s.end;
    }
    if (typeof s.time === 'string' && TIME_RE.test(s.time)) state.time = s.time;
    if (Array.isArray(s.vehicles)) state.vehicles = s.vehicles.filter((id, i, a) => vehicles[id] && a.indexOf(id) === i);
    // Forfait et options : champs absents des anciens états = valeurs vides.
    if (FORFAITS.includes(s.forfait) || s.forfait === 'autre') state.forfait = s.forfait;
    state.forfaitAutre = str(s.forfaitAutre, 60);
    if (Array.isArray(s.options)) state.options = OPTIONS.map(o => o.id).filter(id => s.options.includes(id));
    state.name = str(s.name, 100);
    state.email = str(s.email, 120);
    state.phone = str(s.phone, 30);
    // Les anciens champs « message » et « edited » (message modifiable) sont ignorés : le message est toujours généré.
    state.precision = str(s.precision, 500);
  }
  const persist = () => storage.set(state);

  /* Phrase de demande rédigée d'après les choix */
  function dateClause() {
    if (!state.start) return '';
    return state.end ? `du ${rangeText(state.start, state.end)}` : `le ${longDate(state.start)}`;
  }
  /* Trajet : adresse renseignée, libellé court (ville) et lignes du message */
  const startPt = () => state.trip[0];
  const endPt = () => state.trip[state.trip.length - 1];
  const midPts = () => state.trip.slice(1, -1);
  const filled = pt => !!pt.addr.trim();
  // Ville : celle de la suggestion BAN, sinon déduite de la saisie libre (« 77100 Meaux » ou dernier segment après une virgule)
  const cityOf = pt => pt.city || ((pt.addr.match(/\b\d{5}\s+([^,]+?)\s*$/) || [])[1] || (pt.addr.includes(',') ? pt.addr.split(',').pop().trim() : ''));
  const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
  const placeOf = pt => clip((cityOf(pt) || pt.addr).trim(), 34);
  const stopLine = (pt, n) => `Étape ${n}${pt.time ? ' (' + timeLabel(pt.time) + ')' : ''} : ${pt.addr.trim()}`;
  const stopLines = () => midPts().filter(filled).map((pt, k) => stopLine(pt, k + 2));
  // Rue seule (sans code postal ni ville), pour distinguer départ et arrivée situés dans la même ville
  const streetOf = pt => clip(pt.addr.trim().replace(/[,\s]+\d{5}\b.*$/, '').split(',')[0].trim() || cityOf(pt) || pt.addr.trim(), 34);
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

  /* Résumé du trajet pour le faire-part et le mini-récapitulatif : { mode, a, b, extra }
     mode : 'both' (départ et arrivée), 'start', 'end' ou '' (rien de renseigné). */
  function routeInfo() {
    const s = startPt(), e = endPt(), m = midPts().filter(filled).length;
    const extra = m ? plural(m, 'étape', 'étapes') : '';
    if (filled(s) && filled(e)) {
      let a = placeOf(s), b = placeOf(e);
      if (a === b) { a = streetOf(s); b = streetOf(e); }
      return { mode: 'both', a, b, extra };
    }
    if (filled(s)) return { mode: 'start', a: placeOf(s), b: '', extra };
    if (filled(e)) return { mode: 'end', a: '', b: placeOf(e), extra };
    return { mode: '', a: '', b: '', extra: '' };
  }

  /* Forfait : « 7 h », la durée libre saisie, ou « autre durée » tant qu'elle n'est pas précisée */
  const forfaitText = () => (FORFAITS.includes(state.forfait) ? hoursLabel(state.forfait)
    : state.forfait === 'autre' ? (state.forfaitAutre.trim() || 'autre durée') : '');
  const forfaitDetail = () => { const t = forfaitText(); return t && state.forfait === 'autre' && !state.forfaitAutre.trim() ? t + ' (à préciser)' : t; };
  const chosenOptions = () => state.options.map(id => optById[id]).filter(Boolean);
  const lcFirst = t => t.charAt(0).toLowerCase() + t.slice(1);
  const optionItems = () => chosenOptions().map(o => lcFirst(o.label)).join(', ');
  const optionList = () => chosenOptions().map(o => o.label).join(', ');
  const optionsLine = () => {
    const n = state.options.length;
    if (!chosenOptions().length) return '';
    return (n > 1 ? 'Options : ' : 'Option : ') + optionItems() + ' (prix sur demande).';
  };

  /* Message complet envoyé à KST : généré d'après les choix, suivi de la précision facultative du client.
     Jamais affiché ni modifiable (le champ #f-message est masqué). Toujours non vide. */
  function buildMessage() {
    let s = 'Bonjour, je souhaite une demande de devis pour ' + (OCC[state.occasion] ? OCC[state.occasion].phrase : 'une location de voiture de luxe');
    const d = dateClause();
    if (d) s += ' ' + d;
    const lines = [s + '.'];
    const first = startPt(), last = endPt(), t0 = state.time ? timeLabel(state.time) : '';
    if (filled(first)) lines.push(`Départ${t0 ? ' à ' + t0 : ''} : ${first.addr.trim()}.`);
    else if (t0) lines.push(`Départ souhaité à ${t0}.`);
    stopLines().forEach(l => lines.push(l + '.'));
    if (filled(last)) lines.push(`Arrivée : ${last.addr.trim()}.`);
    const cars = state.vehicles.map(id => 'la ' + vehicles[id].full);
    lines.push(cars.length ? `${cars.length > 1 ? 'Véhicules souhaités' : 'Véhicule souhaité'} : ${joinList(cars)}, avec chauffeur.` : 'Prestation avec chauffeur.');
    const fo = forfaitDetail();
    if (fo) lines.push('Forfait souhaité : ' + fo + '.');
    const op = optionsLine();
    if (op) lines.push(op);
    const extra = state.precision.trim();
    if (extra) lines.push('', 'Précision du client : ' + extra);
    return lines.join('\n');
  }
  function joinList(list) {
    if (list.length < 2) return list[0] || '';
    return list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
  }
  const countText = n => (n === 0 ? 'Aucun véhicule sélectionné' : n === 1 ? '1 véhicule sélectionné' : `${n} véhicules sélectionnés`);

  /* keepTrip : la saisie dans un champ d'adresse ne doit pas reconstruire la liste (le focus serait perdu). */
  function update(patch, { keepTrip = false } = {}) {
    Object.assign(state, patch);
    const keys = Object.keys(patch);
    persist();
    render(keys, keepTrip);
  }

  function resetState(keepContact) {
    const keep = keepContact ? { name: state.name, email: state.email, phone: state.phone } : {};
    Object.assign(state, DEFAULTS(), keep);
    precisionOpen = false;
  }

  /* ==========================================================================
     Overlays : verrou de scroll, inert, piège à focus, Échap
     ========================================================================== */
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),video[controls],summary,[tabindex]:not([tabindex="-1"])';
  const focusables = root => $$(FOCUSABLE, root).filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const stack = [];
  let locks = 0;

  function lockScroll() {
    if (locks++ === 0) {
      document.documentElement.classList.add('is-locked');
      document.body.classList.add('is-locked');
    }
  }
  function unlockScroll() {
    if (--locks <= 0) { locks = 0; document.documentElement.classList.remove('is-locked'); document.body.classList.remove('is-locked'); }
  }

  function openOverlay(el, { opener = document.activeElement, onClose, initialFocus, modal = true } = {}) {
    if (stack.some(o => o.el === el)) return;
    const bg = modal
      ? $$('body > *').filter(n => n !== el && n.id !== 'announcer' && !/^(SCRIPT|LINK|STYLE|NOSCRIPT)$/.test(n.tagName) && !n.inert)
      : [];
    bg.forEach(n => { n.inert = true; });
    lockScroll();
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.classList.add('is-open');
    stack.push({ el, opener, bg, onClose });
    requestAnimationFrame(() => (initialFocus || focusables(el)[0] || el).focus({ preventScroll: true }));
  }

  function closeOverlay(el, { restore = true } = {}) {
    const i = stack.findIndex(o => o.el === el);
    if (i < 0) return;
    const { opener, bg, onClose } = stack.splice(i, 1)[0];
    el.classList.remove('is-open');
    bg.forEach(n => { n.inert = false; });
    unlockScroll();
    if (onClose) onClose();
    if (restore && opener && document.contains(opener) && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
  }

  function trapTab(e, root) {
    const list = focusables(root);
    if (!list.length) { e.preventDefault(); return; }
    const first = list[0], last = list[list.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || !root.contains(a))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (a === last || !root.contains(a))) { e.preventDefault(); first.focus(); }
  }

  document.addEventListener('keydown', e => {
    const top = stack[stack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); closeOverlay(top.el); }
    else if (e.key === 'Tab') trapTab(e, top.el);
  });

  /* ==========================================================================
     En-tête, menu mobile, scroll
     ========================================================================== */
  const header = $('[data-header]');
  const menu = $('[data-menu]');
  const burger = $('[data-menu-open]');

  function openMenu() {
    burger.setAttribute('aria-expanded', 'true');
    openOverlay(menu, {
      opener: burger,
      initialFocus: $('[data-menu-close]', menu),
      onClose: () => burger.setAttribute('aria-expanded', 'false')
    });
  }

  const parallaxEls = $$('[data-parallax]');
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      header.classList.toggle('is-scrolled', window.scrollY > 40);
      if (RM) return;
      parallaxEls.forEach(el => {
        const rect = el.parentElement.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;
        el.style.setProperty('--py', `${(-rect.top * parseFloat(el.dataset.parallax || '0.15')).toFixed(1)}px`);
      });
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  window.matchMedia('(min-width: 1080px)').addEventListener('change', e => { if (e.matches) closeOverlay(menu, { restore: false }); });

  /* ==========================================================================
     Flotte : filtres, cartes, sélection
     ========================================================================== */
  const BRAND_LABEL = { mercedes: 'Mercedes', porsche: 'Porsche', 'rolls-royce': 'Rolls-Royce', maserati: 'Maserati' };
  const filterStatus = $('[data-filter-status]');

  function setFilter(key, animate) {
    $$('[data-filter]').forEach(b => {
      const on = b.dataset.filter === key;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const shown = [];
    cards.forEach(c => {
      const show = key === 'all' || c.dataset.brand === key;
      c.hidden = !show;
      c.classList.remove('is-wide');
      if (show) shown.push(c);
    });
    if (shown.length % 2 === 1) shown[shown.length - 1].classList.add('is-wide');
    /* Rangée glissable (mobile) : on revient au début après un filtre, et on
       recalcule l'indicateur de progression puisque la largeur a changé. */
    if (fleetGrid) {
      fleetGrid.scrollTo({ left: 0, behavior: 'auto' });
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
    if (animate) {
      shown.forEach((c, i) => {
        c.classList.add('is-in');
        if (RM) return;
        c.classList.remove('is-entering');
        void c.offsetWidth;
        c.style.animationDelay = `${i * 70}ms`;
        c.classList.add('is-entering');
        c.addEventListener('animationend', () => { c.classList.remove('is-entering'); c.style.animationDelay = ''; }, { once: true });
      });
      const n = shown.length;
      const who = key === 'all' ? '' : ` ${BRAND_LABEL[key]}`;
      const msg = `${n} véhicule${n > 1 ? 's' : ''} affiché${n > 1 ? 's' : ''}${who ? ' : ' + who.trim() : ''}.`;
      if (filterStatus) filterStatus.textContent = msg;
    }
  }

  function toggleVehicle(id, force) {
    if (!vehicles[id]) return;
    const has = state.vehicles.includes(id);
    const on = typeof force === 'boolean' ? force : !has;
    if (on === has) return;
    const list = on ? [...state.vehicles, id] : state.vehicles.filter(v => v !== id);
    update({ vehicles: list });
    announce(`${on ? 'Ajouté à' : 'Retiré de'} votre demande : ${vehicles[id].full}. ${countText(list.length)}.`);
  }

  const fleetSummary = $('[data-fleet-summary]');
  const fleetSummaryDefault = fleetSummary ? fleetSummary.textContent : '';

  function renderFleet() {
    cards.forEach(card => {
      const on = state.vehicles.includes(card.dataset.vehicle);
      card.classList.toggle('is-selected', on);
      const btn = $('[data-toggle-vehicle]', card);
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
      $('[data-label]', btn).textContent = on ? 'Ajouté à ma demande' : 'Ajouter à ma demande';
      btn.setAttribute('aria-label', `Ajouter à ma demande : ${vehicles[card.dataset.vehicle].full}`);
    });
    if (fleetSummary) {
      fleetSummary.textContent = state.vehicles.length
        ? `Votre sélection : ${state.vehicles.map(id => vehicles[id].full).join(', ')}.`
        : fleetSummaryDefault;
    }
  }

  /* ==========================================================================
     Vidéo d'ambiance du hero (boucle sans son, chargée après le premier affichage)
     ========================================================================== */
  (function heroVideo() {
    const v = $('[data-hero-video]');
    if (!v) return;
    // La vidéo démarre dès l'ouverture (autoplay) ; sa première image sert d'affiche, sans transition visible.
    const conn = navigator.connection || {};
    const saving = conn.saveData || /(^|-)2g$|3g/.test(conn.effectiveType || '');
    if (saving || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      v.removeAttribute('autoplay');
      v.preload = 'none';
      v.pause();
      return;
    }
    const play = () => { const p = v.play(); if (p && p.catch) p.catch(() => { /* lecture bloquée : l'affiche reste affichée */ }); };
    play();
    // Économie de batterie : pause quand le hero n'est plus visible
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting) play(); else v.pause();
    }, { threshold: 0.05 }).observe($('.hero'));
  })();

  /* ==========================================================================
     Vidéo de présentation
     ========================================================================== */
  const cinema = $('[data-cinema]');
  const cinemaVideo = $('[data-cinema-video]');
  function openCinema(opener) {
    if (!cinemaVideo.getAttribute('src')) cinemaVideo.src = VIDEO_SRC;
    openOverlay(cinema, { opener, initialFocus: $('[data-cinema-close]', cinema), onClose: () => cinemaVideo.pause() });
    const p = cinemaVideo.play();
    if (p && p.catch) p.catch(() => { /* lecture manuelle via les contrôles */ });
  }
  cinema.addEventListener('click', e => { if (e.target === cinema) closeOverlay(cinema); });

  /* ==========================================================================
     Module de demande : éléments
     ========================================================================== */
  const form = $('[data-form]');
  const bcard = $('.bcard');
  const panels = $$('[data-panel]', form);
  const stepBtns = $$('[data-step-btn]', form);
  const stepFill = $('[data-stepper-fill]', form);
  const resultEl = $('[data-result]', form);
  const f = {
    time: $('#f-time'), name: $('#f-name'),
    phone: $('#f-phone'), email: $('#f-email'), precision: $('#f-precision'), message: $('#f-message'),
    forfaitAutre: $('#f-forfait-autre'),
    website: form.elements.website
  };
  const precisionBox = $('[data-precision-box]', form);
  const precisionToggle = $('[data-precision-toggle]', form);
  const alertBox = $('[data-form-alert]', form);
  const submitBtn = $('[data-submit]', form);
  const whatsappLinks = $$('[data-whatsapp]');
  let step = 1;
  let sending = false;

  /* Heures : pas de 30 minutes (prise en charge à l'étape 2, heures facultatives des étapes du trajet) */
  const timeOptions = (sel, empty = 'Non précisée') => {
    let html = `<option value=""${sel ? '' : ' selected'}>${empty}</option>`;
    for (let m = 0; m < 24 * 60; m += 30) {
      const v = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      html += `<option value="${v}"${v === sel ? ' selected' : ''}>${pad(Math.floor(m / 60))}h${pad(m % 60)}</option>`;
    }
    return html;
  };
  f.time.innerHTML = timeOptions('', 'Choisir une heure');

  /* Vignettes de l'étape Véhicules */
  const tilesEl = $('[data-tiles]');
  tilesEl.innerHTML = order.map(id => {
    const v = vehicles[id], im = v.images[0];
    return `<li><label class="tile" data-tile="${id}" style="--pos:${esc(v.pos || '50% 50%')}">
      <input type="checkbox" name="vehicule" value="${id}">
      <span class="tile__media"><img src="${esc(im.src)}" alt="" width="${im.w}" height="${im.h}" loading="lazy" decoding="async"></span>
      <span class="tile__check" aria-hidden="true"><svg class="ico"><use href="#i-check"/></svg></span>
      <span class="tile__txt"><span class="tile__brand">${esc(v.brand)}</span><span class="tile__name">${esc(v.model)}</span></span>
    </label></li>`;
  }).join('');

  /* Étape Forfait et options : cartes rendues d'après le catalogue (une seule source des prix) */
  const forfaitsEl = $('[data-forfaits]');
  const optionsEl = $('[data-options]');
  const forfaitOtherEl = $('[data-forfait-other]');
  const forfaitClearBtn = $('[data-forfait-clear]');
  const optSumEl = $('[data-opt-sum]');
  forfaitsEl.innerHTML = FORFAITS.map(id => {
    const h = parseInt(id, 10);
    return '<label class="hrs__item"><input type="radio" name="forfait" value="' + id + '">' +
      '<span class="hrs__box"><span class="hrs__n" aria-hidden="true">' + h + '</span><span class="hrs__u" aria-hidden="true">heures</span><span class="vh">' + h + ' heures</span></span></label>';
  }).join('') +
    '<label class="hrs__item hrs__item--wide"><input type="radio" name="forfait" value="autre">' +
    '<span class="hrs__box hrs__box--wide"><svg class="ico" aria-hidden="true"><use href="#i-clock"/></svg><span class="hrs__t">Autre durée</span><span class="hrs__s">à préciser</span></span></label>';
  optionsEl.innerHTML = OPTIONS.map(o =>
    '<li><label class="ocard" data-opt="' + o.id + '"><input type="checkbox" name="option" value="' + o.id + '">' +
    '<span class="ocard__check" aria-hidden="true"><svg class="ico"><use href="#i-check"/></svg></span>' +
    '<span class="ocard__txt"><span class="ocard__name">' + esc(o.label) + '</span>' + (o.note ? '<span class="ocard__note">' + esc(o.note) + '</span>' : '') + '</span>' +
    '<span class="ocard__price">Prix sur demande</span></label></li>'
  ).join('');

  /* ==========================================================================
     Calendrier
     ========================================================================== */
  const calEl = $('[data-cal]');
  const calBody = $('[data-cal-body]', calEl);
  const calTitle = $('[data-cal-title]', calEl);
  const calStatus = $('[data-cal-status]', calEl);
  const calPrev = $('[data-cal-prev]', calEl);
  const calNext = $('[data-cal-next]', calEl);
  const calGrid = $('.cal__grid', calEl);
  const cal = { y: 0, m: 0, focus: null };
  const nowD = new Date();
  const CUR_INDEX = nowD.getFullYear() * 12 + nowD.getMonth();

  (function calHint() {
    const hint = document.createElement('p');
    hint.className = 'vh';
    hint.id = 'cal-hint';
    hint.textContent = 'Utilisez les flèches pour changer de jour, Page précédente et Page suivante pour changer de mois, Entrée pour choisir.';
    calEl.append(hint);
    calGrid.setAttribute('aria-describedby', 'cal-hint');
    calGrid.setAttribute('aria-multiselectable', 'true');
  })();

  function calViewFromState() {
    const base = state.start ? fromISO(state.start) : new Date();
    cal.y = base.getFullYear();
    cal.m = base.getMonth();
    cal.focus = null;
  }

  function calFocusTarget() {
    const prefix = `${cal.y}-${pad(cal.m + 1)}`;
    const inView = iso => iso.slice(0, 7) === prefix;
    if (cal.focus && inView(cal.focus) && cal.focus >= TODAY) return cal.focus;
    if (state.start && inView(state.start)) return state.start;
    if (inView(TODAY)) return TODAY;
    const first = `${prefix}-01`;
    return first >= TODAY ? first : TODAY;
  }

  function calStatusText() {
    if (!state.start) return state.mode === 'range' ? 'Sélectionnez la première date de votre événement.' : 'Sélectionnez la date de votre événement.';
    if (state.mode === 'range' && !state.end) return `Début : ${longDate(state.start)}. Sélectionnez la date de fin.`;
    if (state.end) return `Du ${rangeText(state.start, state.end)}.`;
    return `Date choisie : ${longDate(state.start)}.`;
  }

  function renderCalendar() {
    const hadFocus = calBody.contains(document.activeElement);
    const first = new Date(cal.y, cal.m, 1);
    const lead = (first.getDay() + 6) % 7;
    const total = new Date(cal.y, cal.m + 1, 0).getDate();
    const focusIso = calFocusTarget();
    const prefix = `${cal.y}-${pad(cal.m + 1)}`;
    let html = '';
    let n = 1 - lead;
    for (let r = 0; r < 6; r++) {
      html += '<tr>';
      for (let c = 0; c < 7; c++, n++) {
        if (n < 1 || n > total) { html += '<td role="gridcell"><span class="cal__day is-pad" aria-hidden="true"></span></td>'; continue; }
        const iso = `${prefix}-${pad(n)}`;
        const past = iso < TODAY;
        const isEdge = iso === state.start || iso === state.end;
        const between = !!state.end && iso > state.start && iso < state.end;
        const cls = [
          between && 'is-in-range',
          state.end && iso === state.start && 'is-range-start',
          state.end && iso === state.end && 'is-range-end'
        ].filter(Boolean).join(' ');
        html += `<td role="gridcell"${cls ? ` class="${cls}"` : ''} aria-selected="${isEdge || between}">` +
          `<button type="button" class="cal__day${isEdge ? ' is-selected' : ''}${iso === TODAY ? ' is-today' : ''}" data-date="${iso}" tabindex="${iso === focusIso ? 0 : -1}"${past ? ' disabled' : ''} aria-label="${longDate(iso)}${iso === TODAY ? ', aujourd’hui' : ''}">${n}</button></td>`;
      }
      html += '</tr>';
    }
    calBody.innerHTML = html;
    calTitle.textContent = `${MONTHS[cal.m]} ${cal.y}`;
    const prevWasFocused = document.activeElement === calPrev;
    calPrev.disabled = cal.y * 12 + cal.m <= CUR_INDEX;
    if (prevWasFocused && calPrev.disabled) calNext.focus({ preventScroll: true });
    calStatus.textContent = calStatusText();
    if (hadFocus) { const b = $(`[data-date="${focusIso}"]`, calBody); if (b) b.focus({ preventScroll: true }); }
  }

  function calMove(delta) {
    const t = new Date(cal.y, cal.m + delta, 1);
    cal.y = t.getFullYear();
    cal.m = t.getMonth();
    cal.focus = null;
    renderCalendar();
  }
  calPrev.addEventListener('click', () => { if (!calPrev.disabled) calMove(-1); });
  calNext.addEventListener('click', () => calMove(1));

  function pickDate(iso) {
    cal.focus = iso;
    if (state.mode === 'single') return update({ start: iso, end: '' });
    if (!state.start || state.end) return update({ start: iso, end: '' });
    if (iso < state.start) return update({ start: iso });
    if (iso === state.start) return update({});
    return update({ end: iso });
  }

  calBody.addEventListener('click', e => {
    const b = e.target.closest('.cal__day[data-date]');
    if (b && !b.disabled) pickDate(b.dataset.date);
  });

  const shiftMonth = (d, k) => {
    const t = new Date(d.getFullYear(), d.getMonth() + k, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
  };

  calBody.addEventListener('keydown', e => {
    const b = e.target.closest('.cal__day[data-date]');
    if (!b) return;
    const cur = fromISO(b.dataset.date);
    const dow = (cur.getDay() + 6) % 7;
    let next;
    switch (e.key) {
      case 'ArrowLeft': next = addDays(cur, -1); break;
      case 'ArrowRight': next = addDays(cur, 1); break;
      case 'ArrowUp': next = addDays(cur, -7); break;
      case 'ArrowDown': next = addDays(cur, 7); break;
      case 'Home': next = addDays(cur, -dow); break;
      case 'End': next = addDays(cur, 6 - dow); break;
      case 'PageUp': next = shiftMonth(cur, e.shiftKey ? -12 : -1); break;
      case 'PageDown': next = shiftMonth(cur, e.shiftKey ? 12 : 1); break;
      default: return;
    }
    e.preventDefault();
    let iso = toISO(next);
    if (iso < TODAY) iso = TODAY;
    const d = fromISO(iso);
    cal.y = d.getFullYear();
    cal.m = d.getMonth();
    cal.focus = iso;
    renderCalendar();
    const target = $(`[data-date="${iso}"]`, calBody);
    if (target) target.focus({ preventScroll: true });
  });

  /* ==========================================================================
     Trajet : prise en charge + étapes (ajout, ordre, suppression)
     et autocomplétion d'adresse (Base Adresse Nationale), saisie libre toujours possible
     ========================================================================== */
  const tripEl = $('[data-trip]');
  const tripStatus = $('[data-trip-status]');
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const tripIco = id => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
  const tripSay = msg => { tripStatus.textContent = ''; setTimeout(() => { tripStatus.textContent = msg; }, 60); };
  const tripErr = { start: false, end: false };
  const timeErr = { on: false };
  let tripNewId = 0;

  /* Rôles : 0 = départ, dernier = arrivée, entre les deux = étapes numérotées « Étape 2, 3… » */
  function pointHTML(pt, i, n) {
    const first = i === 0, last = i === n - 1, mid = !first && !last, num = i + 1;
    const addrId = `trip-addr-${pt.id}`, listId = `trip-list-${pt.id}`, errId = `trip-err-${pt.id}`;
    const tools = !mid ? '' :
      `<div class="trip__tools" role="group" aria-label="Actions pour l’étape ${num}">` +
      `<button type="button" class="trip__tool" data-trip-up="${pt.id}" aria-label="Monter l’étape ${num}"${i === 1 ? ' disabled' : ''}>${tripIco('i-chev-u')}</button>` +
      `<button type="button" class="trip__tool" data-trip-down="${pt.id}" aria-label="Descendre l’étape ${num}"${i === n - 2 ? ' disabled' : ''}>${tripIco('i-chev-d')}</button>` +
      `<button type="button" class="trip__tool trip__tool--del" data-trip-del="${pt.id}" aria-label="Supprimer l’étape ${num}">${tripIco('i-trash')}</button>` +
      '</div>';
    const under = first
      ? `<div class="field trip__time trip__time--main"><label for="trip-time-main">${tripIco('i-clock')}Heure de prise en charge <span class="req" aria-hidden="true">*</span></label><select id="trip-time-main" data-trip-time-main>${timeOptions(state.time, 'Choisir une heure')}</select></div>`
      : mid ? `<div class="field trip__time"><label for="trip-time-${pt.id}">Heure <span class="opt">(facultatif)</span></label><select id="trip-time-${pt.id}" data-trip-time="${pt.id}">${timeOptions(pt.time)}</select></div>` : '';
    const title = first ? 'Départ' : last ? 'Arrivée' : `Étape ${num}`;
    const label = first ? 'Adresse de départ <span class="req" aria-hidden="true">*</span>'
      : last ? 'Adresse d’arrivée <span class="req" aria-hidden="true">*</span>'
        : `Adresse<span class="vh"> de l’étape ${num}</span>`;
    const dot = last ? tripIco('i-pin') : (ROMAN[i] || num);
    const role = first ? 'start' : last ? 'end' : '';
    return `<li class="trip__pt${first ? ' trip__pt--start' : ''}${last ? ' trip__pt--end' : ''}${pt.id === tripNewId ? ' is-new' : ''}">` +
      `<span class="trip__dot" aria-hidden="true">${dot}</span>` +
      '<div class="trip__main">' +
      `<div class="trip__head"><p class="trip__kicker">${title}</p>` +
      tools +
      '</div>' +
      '<div class="field trip__field">' +
      `<label class="trip__lbl" for="${addrId}">${label}</label>` +
      '<div class="combo">' +
      `<input class="trip__input" id="${addrId}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}" ` +
      `autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" maxlength="160" placeholder="Numéro, rue, ville" ` +
      `data-trip-addr="${pt.id}" value="${esc(pt.addr)}"${role ? ` aria-required="true" aria-describedby="${errId}"` : ''}>` +
      `<ul class="combo__list" id="${listId}" role="listbox" aria-label="Suggestions d’adresses" hidden></ul>` +
      '</div>' +
      (role ? `<p class="field__error" id="${errId}" data-trip-error="${role}" hidden></p>` : '') +
      '</div>' +
      under +
      '</div></li>';
  }

  /* Le bouton d'ajout se place juste avant l'arrivée : il insère une étape entre le départ et l'arrivée */
  function renderTrip() {
    const n = state.trip.length;
    const full = n >= MAX_POINTS;
    const addRow = '<li class="trip__addrow" role="presentation">' +
      `<button type="button" class="trip__add" data-trip-add${full ? ' disabled' : ''}>` +
      `<span class="trip__dot trip__dot--add" aria-hidden="true">${tripIco('i-plus')}</span>` +
      `<span>${full ? 'Nombre maximal d’étapes atteint' : 'Ajouter une étape'}</span></button></li>`;
    tripEl.innerHTML = state.trip.map((pt, i) => (i === n - 1 ? addRow : '') + pointHTML(pt, i, n)).join('');
    tripNewId = 0;
    acReset();
    renderTripWhen();
    setTripError('start', tripErr.start);
    setTripError('end', tripErr.end);
  }

  /* Heure de départ, mise en évidence sous l'adresse (même valeur qu'à l'étape 2) */
  function renderTripWhen() {
    const sel = $('[data-trip-time-main]', tripEl);
    if (!sel) return;
    if (sel.value !== state.time) sel.value = state.time;
    sel.closest('.trip__time--main').classList.toggle('is-set', !!state.time);
    if (timeErr.on) setTimeError(!state.time);
  }

  /* Erreurs d'adresse, une par champ : 'start' (départ) et 'end' (arrivée) */
  const TRIP_MSG = {
    start: 'Indiquez l’adresse de départ pour continuer.',
    time: 'Indiquez l’heure de prise en charge pour continuer.',
    end: 'Indiquez l’adresse d’arrivée pour continuer.'
  };
  const tripInput = key => { const all = $$('[data-trip-addr]', tripEl); return key === 'start' ? all[0] : all[all.length - 1]; };
  function setTripError(key, on) {
    tripErr[key] = on;
    const input = tripInput(key), box = $(`[data-trip-error="${key}"]`, tripEl);
    if (!input || !box) return;
    box.textContent = on ? TRIP_MSG[key] : '';
    box.hidden = !on;
    if (on) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  /* Premier champ obligatoire manquant, de haut en bas : 'start', 'time', 'end' ou '' */
  const tripIssue = () => (!filled(startPt()) ? 'start' : !state.time ? 'time' : !filled(endPt()) ? 'end' : '');
  /* Affiche les trois erreurs possibles ; vrai si le trajet est complet */
  function checkTrip() {
    setTripError('start', !filled(startPt()));
    setTripError('end', !filled(endPt()));
    checkTime();
    return !tripIssue();
  }
  /* Amène le focus sur le premier champ en erreur et l'annonce */
  function focusTripIssue() {
    const k = tripIssue();
    if (!k) return;
    const el = k === 'time' ? $('[data-trip-time-main]', tripEl) : tripInput(k);
    if (el) el.focus();
    announce(TRIP_MSG[k]);
  }

  /* Heure de prise en charge obligatoire : erreur sous le champ de l'étape 2 et sous celui du trajet */
  function setTimeError(on) {
    timeErr.on = on;
    const msg = on ? 'Indiquez l’heure de prise en charge pour continuer.' : '';
    const box2 = $('[data-time-error]', form);
    if (box2) { box2.textContent = msg; box2.hidden = !on; }
    if (on) f.time.setAttribute('aria-invalid', 'true'); else f.time.removeAttribute('aria-invalid');
    const sel = $('[data-trip-time-main]', tripEl);
    if (sel) {
      const wrap = sel.closest('.trip__time--main');
      let box3 = $('.field__error', wrap);
      if (!box3) { box3 = document.createElement('p'); box3.className = 'field__error'; box3.id = 'trip-time-err'; wrap.appendChild(box3); sel.setAttribute('aria-describedby', box3.id); }
      box3.textContent = msg; box3.hidden = !on;
      wrap.classList.toggle('is-error', on);
      if (on) sel.setAttribute('aria-invalid', 'true'); else sel.removeAttribute('aria-invalid');
    }
  }
  function checkTime() {
    const ok = !!state.time;
    setTimeError(!ok);
    return ok;
  }
  function checkDateTime() {
    const ok = checkTime();
    return !!state.start && ok;
  }

  function setPoint(id, patch) {
    update({ trip: state.trip.map(pt => (pt.id === id ? { ...pt, ...patch } : pt)) }, { keepTrip: true });
  }

  /* Les erreurs d'adresse disparaissent dès que le champ concerné est renseigné */
  function clearTripErrors() {
    if (tripErr.start && filled(startPt())) setTripError('start', false);
    if (tripErr.end && filled(endPt())) setTripError('end', false);
  }

  function onTripInput(input) {
    setPoint(Number(input.dataset.tripAddr), { addr: input.value, city: '' });
    clearTripErrors();
    acSchedule(input);
  }

  /* Une étape s'insère toujours juste avant l'arrivée, qui ne bouge jamais */
  function addStop() {
    if (state.trip.length >= MAX_POINTS) return;
    const pt = newPoint();
    tripNewId = pt.id;
    update({ trip: [...state.trip.slice(0, -1), pt, endPt()] });
    const input = $(`#trip-addr-${pt.id}`);
    if (input) input.focus();
    tripSay(`Étape ${state.trip.length - 1} ajoutée avant l’arrivée. Saisissez son adresse.`);
  }

  function removeStop(id) {
    const i = state.trip.findIndex(pt => pt.id === id);
    if (i < 1 || i > state.trip.length - 2) return;
    update({ trip: state.trip.filter(pt => pt.id !== id) });
    const next = $$('[data-trip-addr]', tripEl)[Math.min(i, state.trip.length - 1)];
    if (next) next.focus();
    tripSay(`Étape ${i + 1} supprimée. Le trajet compte maintenant ${state.trip.length} adresses.`);
  }

  function moveStop(id, d) {
    const i = state.trip.findIndex(pt => pt.id === id), j = i + d;
    if (i < 1 || j < 1 || j > state.trip.length - 2) return;
    const list = state.trip.slice();
    [list[i], list[j]] = [list[j], list[i]];
    update({ trip: list });
    const same = $(`[data-trip-${d < 0 ? 'up' : 'down'}="${id}"]`, tripEl);
    const other = $(`[data-trip-${d < 0 ? 'down' : 'up'}="${id}"]`, tripEl);
    const target = same && !same.disabled ? same : other;
    if (target) target.focus();
    tripSay(`Étape déplacée : elle devient l’étape ${j + 1}.`);
  }

  tripEl.addEventListener('click', e => {
    const t = e.target;
    let el;
    if (t.closest('[data-trip-add]')) { addStop(); return; }
    if ((el = t.closest('[data-trip-del]'))) { removeStop(Number(el.dataset.tripDel)); return; }
    if ((el = t.closest('[data-trip-up]'))) { moveStop(Number(el.dataset.tripUp), -1); return; }
    if ((el = t.closest('[data-trip-down]'))) { moveStop(Number(el.dataset.tripDown), 1); return; }
    if ((el = t.closest('.combo__opt'))) acPick(Number(el.dataset.i));
  });

  /* ---------- Autocomplétion (combobox ARIA) ---------- */
  const ac = { input: null, list: null, items: [], idx: -1, ctl: null, timer: 0, token: 0, cache: new Map() };

  function acHide() {
    clearTimeout(ac.timer);
    ac.token++;
    if (ac.ctl) { ac.ctl.abort(); ac.ctl = null; }
    if (ac.input) { ac.input.setAttribute('aria-expanded', 'false'); ac.input.removeAttribute('aria-activedescendant'); }
    if (ac.list) { ac.list.hidden = true; ac.list.innerHTML = ''; }
    ac.items = [];
    ac.idx = -1;
  }
  function acReset() { acHide(); ac.input = null; ac.list = null; }
  const acOpen = () => !!ac.list && !ac.list.hidden && ac.items.length > 0;

  function acSchedule(input) {
    if (ac.input && ac.input !== input) acHide();
    ac.input = input;
    ac.list = $('.combo__list', input.parentElement);
    clearTimeout(ac.timer);
    const q = input.value.trim();
    if (q.length < 3) { acHide(); return; }
    ac.timer = setTimeout(() => acFetch(input, q), 250);
  }

  /* Aucune erreur affichée si l'API ne répond pas : la liste reste simplement fermée. */
  async function acFetch(input, q) {
    const token = ++ac.token;
    if (ac.ctl) ac.ctl.abort();
    const key = q.toLowerCase();
    let found = ac.cache.get(key);
    if (!found) {
      const ctl = new AbortController();
      ac.ctl = ctl;
      const kill = setTimeout(() => ctl.abort(), 6000);
      try {
        const res = await fetch(`${BAN_URL}?q=${encodeURIComponent(q.slice(0, 200))}&limit=5&autocomplete=1&lat=48.8566&lon=2.3522`, { signal: ctl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        found = (Array.isArray(json.features) ? json.features : [])
          .map(ft => ft && ft.properties)
          .filter(pr => pr && typeof pr.label === 'string' && pr.label)
          .map(pr => ({
            label: str(pr.label, 160),
            city: str(pr.city, 80),
            name: str(pr.name, 120) || str(pr.label, 120),
            ctx: [pr.postcode, pr.city].filter(v => typeof v === 'string' && v).join(' ')
          }));
        if (ac.cache.size > 40) ac.cache.clear();
        ac.cache.set(key, found);
      } catch (err) {
        if (token === ac.token) acHide();
        return;
      } finally {
        clearTimeout(kill);
      }
    }
    if (token !== ac.token || document.activeElement !== input || !found.length) { if (token === ac.token) acHide(); return; }
    acShow(input, found);
  }

  function acShow(input, found) {
    const list = ac.list;
    ac.items = found;
    ac.idx = -1;
    list.innerHTML = found.map((r, i) =>
      `<li class="combo__opt" role="option" id="${list.id}-o${i}" aria-selected="false" data-i="${i}">` +
      `<span class="combo__main">${esc(r.name)}</span>${r.ctx ? `<span class="combo__sub">${esc(r.ctx)}</span>` : ''}</li>`
    ).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    tripSay(`${found.length} ${found.length > 1 ? 'suggestions' : 'suggestion'} d’adresse. Utilisez les flèches haut et bas, puis Entrée.`);
  }

  function acMove(d) {
    const n = ac.items.length;
    if (!n) return;
    ac.idx = ac.idx < 0 ? (d > 0 ? 0 : n - 1) : (ac.idx + d + n) % n;
    $$('.combo__opt', ac.list).forEach((li, i) => {
      const on = i === ac.idx;
      li.setAttribute('aria-selected', String(on));
      if (on) { ac.input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
    });
  }

  function acPick(i) {
    const r = ac.items[i], input = ac.input;
    if (!r || !input) return;
    input.value = r.label;
    acHide();
    setPoint(Number(input.dataset.tripAddr), { addr: r.label, city: r.city });
    clearTripErrors();
    tripSay(`Adresse choisie : ${r.label}.`);
  }

  tripEl.addEventListener('keydown', e => {
    const input = e.target.closest('[data-trip-addr]');
    if (!input) return;
    if (input !== ac.input) { ac.input = input; ac.list = $('.combo__list', input.parentElement); }
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (acOpen()) { e.preventDefault(); acMove(e.key === 'ArrowDown' ? 1 : -1); }
        else if (e.key === 'ArrowDown' && input.value.trim().length >= 3) { e.preventDefault(); clearTimeout(ac.timer); acFetch(input, input.value.trim()); }
        break;
      case 'Enter':
        if (acOpen()) { e.preventDefault(); if (ac.idx >= 0) acPick(ac.idx); else acHide(); }
        break;
      case 'Escape':
        if (acOpen()) { e.preventDefault(); e.stopPropagation(); acHide(); }
        break;
      default:
    }
  });
  // Un clic dans la liste ne doit pas retirer le focus du champ.
  tripEl.addEventListener('mousedown', e => { if (e.target.closest('.combo__list')) e.preventDefault(); });
  tripEl.addEventListener('focusout', e => { if (e.target.matches && e.target.matches('[data-trip-addr]')) acHide(); });

  /* Occasion : le premier choix, fait à la souris ou au toucher, passe à l'étape suivante.
     Pas d'avance automatique au clavier (les flèches changent le choix) ni quand une occasion
     est déjà choisie (retour pour modifier : on reste sur place). */
  let occTimer = 0;
  document.addEventListener('click', e => {
    if (!e.target.closest('.occ__card') || e.detail === 0 || occTimer || state.occasion) return;
    occTimer = setTimeout(() => {
      occTimer = 0;
      if (step === 1 && state.occasion) goStep(2, { scroll: 'auto' });
    }, 350);
  });

  /* ==========================================================================
     Rendu de l'interface d'après l'état
     ========================================================================== */
  const recapEl = $('[data-recap]');
  const trayEl = $('[data-tray]');
  const ctaBar = $('[data-cta-bar]');
  let inBooking = false;

  function dateSummary() {
    const d = state.start ? (state.end ? `Du ${rangeText(state.start, state.end)}` : longDate(state.start)) : '';
    const t = state.time ? `à ${timeLabel(state.time)}` : '';
    return [d, t].filter(Boolean).join(' · ');
  }

  function setR(key, val, empty) {
    const el = $(`[data-r="${key}"]`, recapEl);
    const next = val || empty;
    if (el.textContent !== next) {
      el.textContent = next;
      if (val && inBooking) { el.classList.remove('fp-in'); void el.offsetWidth; el.classList.add('fp-in'); }
    }
    el.classList.toggle('is-empty', !val);
  }

  /* Mini-trajet du faire-part : « Meaux — Paris · 2 étapes », « à Meaux » (départ seul) ou « vers Paris » (arrivée seule) */
  function routeHTML() {
    const r = routeInfo();
    if (!r.mode) return '';
    const cnt = r.extra ? `<span class="fp__cnt">${esc(r.extra)}</span>` : '';
    if (r.mode === 'start') return `<span>${esc(r.a)}</span>${cnt}`;
    if (r.mode === 'end') return `<span>${esc(r.b)}</span>${cnt}`;
    return `<span>${esc(r.a)}</span><span class="vh">, puis </span><i class="fp__sep" aria-hidden="true"></i><span>${esc(r.b)}</span>${cnt}`;
  }

  function renderRoute() {
    const el = $('[data-r="route"]', recapEl);
    const html = routeHTML();
    const mode = routeInfo().mode;
    const next = html || 'Votre trajet';
    if (el.dataset.k !== next) {
      el.dataset.k = next;
      if (html) el.innerHTML = html; else el.textContent = next;
      if (html && inBooking) { el.classList.remove('fp-in'); void el.offsetWidth; el.classList.add('fp-in'); }
    }
    el.classList.toggle('is-empty', !html);
    el.classList.toggle('is-single', mode === 'start');
    el.classList.toggle('is-to', mode === 'end');
  }

  function renderRecap() {
    setR('occasion', OCC[state.occasion] ? OCC[state.occasion].label : '', 'Votre occasion');
    renderRoute();
    setR('date', dateSummary(), 'La date de votre événement');
    $('[data-r="vehicles"]', recapEl).innerHTML = state.vehicles.length
      ? state.vehicles.map(id => `<li><span>${esc(vehicles[id].full)}</span><button type="button" class="recap__x" data-remove="${id}" aria-label="Retirer ${esc(vehicles[id].full)} de ma demande"><svg class="ico" aria-hidden="true"><use href="#i-close"/></svg></button></li>`).join('')
      : '<li class="is-empty">Sélectionnez un ou plusieurs véhicules</li>';
    const opts = chosenOptions(), n = opts.length;
    setR('forfait', forfaitText(), 'À définir');
    setR('options', n ? n + ' option' + (n > 1 ? 's' : '') : '', 'Aucune');
    const names = $('[data-r="optnames"]', recapEl), list = opts.map(o => o.short).join(' · ');
    names.hidden = !n;
    if (names.textContent !== list) names.textContent = list;
  }

  function renderCounts() {
    const n = state.vehicles.length;
    $$('[data-count]').forEach(el => {
      el.textContent = String(n);
      if (el.classList.contains('badge')) el.hidden = n === 0;
    });
  }

  function renderTiles() {
    $$('.tile', tilesEl).forEach(t => {
      const on = state.vehicles.includes(t.dataset.tile);
      t.classList.toggle('is-on', on);
      $('input', t).checked = on;
    });
  }

  function renderTray() {
    const n = state.vehicles.length;
    $('[data-tray-text]', trayEl).textContent = countText(n);
    trayEl.classList.toggle('is-visible', n > 0 && !inBooking);
  }

  const setVal = (el, v) => { if (el.value !== v) el.value = v; };

  function renderFields() {
    $$('input[name="occasion"]', form).forEach(i => { i.checked = i.value === state.occasion; });
    $$('input[name="mode"]', form).forEach(i => { i.checked = i.value === state.mode; });
    setVal(f.time, state.time);
    if (f.time.value !== state.time) f.time.value = '';
    setVal(f.name, state.name);
    setVal(f.phone, state.phone);
    setVal(f.email, state.email);
    setVal(f.precision, state.precision);
    // La précision se déplie d'elle-même si elle est déjà renseignée (état restauré) ; sinon repliée.
    if (state.precision && !precisionOpen) precisionOpen = true;
    precisionBox.hidden = !precisionOpen;
    precisionToggle.hidden = precisionOpen;
    precisionToggle.setAttribute('aria-expanded', String(precisionOpen));
    // Message complet (choix + précision) : champ masqué, toujours à jour, lu par l'envoi et WhatsApp
    const text = buildMessage().trim();
    setVal(f.message, text);
    whatsappLinks.forEach(a => { a.href = CONTACT.wa + (text ? `?text=${encodeURIComponent(text)}` : ''); });
  }

  /* Récapitulatif des options (zone aria-live) et état des cartes Forfait / Options */
  let sumKey = '';
  function renderExtras() {
    $$('input[name="forfait"]', form).forEach(i => { i.checked = i.value === state.forfait; });
    $$('.ocard', optionsEl).forEach(c => {
      const on = state.options.includes(c.dataset.opt);
      c.classList.toggle('is-on', on);
      $('input', c).checked = on;
    });
    forfaitOtherEl.hidden = state.forfait !== 'autre';
    setVal(f.forfaitAutre, state.forfaitAutre);
    forfaitClearBtn.hidden = !state.forfait;
    const n = chosenOptions().length, key = String(n);
    if (key === sumKey) return;
    sumKey = key;
    optSumEl.innerHTML = n
      ? '<p class="optsum__row"><span class="optsum__k">Options sélectionnées<span class="vh"> :</span></span><span class="optsum__v">' + n + '</span></p>' +
        '<p class="optsum__n">Prix sur demande, précisés dans votre devis</p>'
      : '<p class="optsum__none">Aucune option sélectionnée</p>';
    const v = $('.optsum__v', optSumEl);
    if (v && inBooking) v.classList.add('fp-in');
  }

  const stepDone = n => (n === 1 ? !!state.occasion
    : n === 2 ? !!(state.start && state.time)
      : n === 3 ? !!(filled(startPt()) && state.time && filled(endPt()))
        : n === 4 ? state.vehicles.length > 0
          : n === 5 ? !!(FORFAITS.includes(state.forfait) || (state.forfait === 'autre' && state.forfaitAutre.trim()) || state.options.length)
            : !!(state.name.trim() && state.email.trim() && state.phone.trim()));

  function renderStepper() {
    stepBtns.forEach(b => {
      const n = Number(b.dataset.stepBtn);
      b.dataset.done = String(stepDone(n));
      if (n === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    stepFill.style.width = `${step * (100 / STEPS)}%`;
  }

  function render(keys, keepTrip) {
    const has = (...k) => !keys || k.some(x => keys.includes(x));
    if (has('vehicles')) { renderFleet(); renderTiles(); renderCounts(); renderTray(); }
    if (has('mode', 'start', 'end')) renderCalendar();
    if (has('trip') && !keepTrip) renderTrip();
    renderTripWhen();
    renderFields();
    renderExtras();
    renderRecap();
    renderStepper();
  }

  /* ==========================================================================
     Étapes
     ========================================================================== */
  let resultOn = false;
  function hideResult() {
    if (!resultOn) return;
    resultOn = false;
    resultEl.hidden = true;
  }

  /* gate : depuis l'étape Trajet, on n'avance pas sans adresse de départ, heure et adresse d'arrivée */
  function goStep(n, { scroll = false, focus = true, gate = false } = {}) {
    n = Math.min(STEPS, Math.max(1, Number(n) || 1));
    if (gate && step === 2 && n > 2 && !checkDateTime()) {
      if (state.start) f.time.focus(); else { const d = $('.cal__day[tabindex="0"]', calEl); if (d) d.focus(); }
      announce(state.start ? 'Indiquez l’heure de prise en charge pour continuer.' : 'Choisissez la date de votre événement pour continuer.');
      return;
    }
    if (gate && step === 3 && n > 3 && !checkTrip()) {
      focusTripIssue();
      return;
    }
    hideResult();
    const back = n < step;
    step = n;
    bcard.dataset.step = String(n);
    panels.forEach(p => {
      const on = Number(p.dataset.panel) === n;
      p.hidden = !on;
      p.classList.toggle('is-back', on && back);
    });
    renderStepper();
    placeRecap();
    if (n === 2) renderCalendar();
    if (focus) {
      const title = $(`[data-panel="${n}"] .panel__title`, form);
      if (title) title.focus({ preventScroll: true });
    }
    if (scroll === true || (scroll === 'auto' && bcard.getBoundingClientRect().top < headerH())) {
      bcard.scrollIntoView({ behavior: smooth(), block: 'start' });
    }
  }

  const firstIncompleteBeforeSend = () => (!state.occasion ? 1 : (!state.start || !state.time) ? 2 : tripIssue() ? 3 : 6);

  /* ==========================================================================
     Validation & envoi
     ========================================================================== */
  const FIELDS = {
    nom: { el: f.name, label: 'Nom' },
    telephone: { el: f.phone, label: 'Téléphone' },
    email: { el: f.email, label: 'E-mail' }
  };
  const RULES = {
    nom: v => (!v.trim() ? 'Indiquez votre nom.' : v.trim().length < 2 ? 'Votre nom semble trop court.' : ''),
    telephone: v => {
      if (!v.trim()) return 'Indiquez votre numéro de téléphone.';
      return /^\+?\d{9,15}$/.test(v.replace(/[\s.\-()]/g, '')) ? '' : 'Ce numéro ne semble pas valide. Exemple : 06 12 34 56 78.';
    },
    email: v => {
      if (!v.trim()) return 'Indiquez votre adresse e-mail.';
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Cette adresse e-mail ne semble pas valide. Exemple : nom@exemple.fr.';
    }
  };
  $$('[data-error]', form).forEach(p => p.setAttribute('aria-live', 'polite'));

  function validateField(key) {
    const { el } = FIELDS[key];
    const err = RULES[key](el.value);
    const box = $(`[data-error="${key}"]`, form);
    box.textContent = err;
    box.hidden = !err;
    if (err) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    return err;
  }

  Object.entries(FIELDS).forEach(([key, { el }]) => {
    el.addEventListener('blur', () => { if (el.value !== '' || el.hasAttribute('aria-invalid')) validateField(key); });
    el.addEventListener('input', () => { if (el.hasAttribute('aria-invalid')) validateField(key); });
  });

  function showAlert(html) { alertBox.innerHTML = html; alertBox.hidden = false; }
  function clearAlert() { alertBox.hidden = true; alertBox.innerHTML = ''; }

  function collect() {
    return {
      nom: f.name.value.trim(),
      email: f.email.value.trim(),
      telephone: f.phone.value.trim(),
      message: f.message.value.trim() || buildMessage().trim(),
      precision: f.precision.value.trim(),
      occasion: OCC[state.occasion] ? OCC[state.occasion].label : '',
      depart: filled(startPt()) ? startPt().addr.trim() + (state.time ? ` (${timeLabel(state.time)})` : '') : '',
      arrivee: endPt().addr.trim(),
      etapes: stopLines().join('\n'),
      date: state.start ? (state.end ? `Du ${rangeText(state.start, state.end)}` : longDate(state.start)) : '',
      heure: state.time ? timeLabel(state.time) : '',
      vehicules: state.vehicles.map(id => vehicles[id].full).join(', '),
      forfait: forfaitDetail(),
      options: optionList()
    };
  }

  function mailSubject(d) {
    return `Demande de devis KST Auto Loc’${d.occasion ? ' – ' + d.occasion : ''}${d.date ? ' – ' + d.date : ''}`;
  }
  function mailBody(d) {
    const lines = [d.message.replace(/\r?\n/g, '\r\n'), '', '—', `Nom : ${d.nom}`, `Téléphone : ${d.telephone}`, `E-mail : ${d.email}`];
    if (d.occasion) lines.push(`Occasion : ${d.occasion}`);
    if (d.date) lines.push(`Date : ${d.date}`);
    if (d.heure) lines.push(`Heure de prise en charge : ${d.heure}`);
    if (d.depart) lines.push(`Départ : ${d.depart}`);
    if (d.etapes) d.etapes.split('\n').forEach(l => lines.push(l));
    if (d.arrivee) lines.push(`Arrivée : ${d.arrivee}`);
    if (d.vehicules) lines.push(`Véhicules : ${d.vehicules}`);
    if (d.forfait) lines.push(`Forfait : ${d.forfait}`);
    if (d.options) lines.push(`Options (prix sur demande) : ${d.options}`);
    return lines.join('\r\n');
  }
  const mailtoUrl = d => `mailto:${CONTACT.email}?subject=${encodeURIComponent(mailSubject(d))}&body=${encodeURIComponent(mailBody(d))}`;

  const KEY_OK = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(WEB3FORMS_ACCESS_KEY);
  /* Envoi par le serveur du site (send.php, sur le VPS) : actif seulement sur le vrai domaine.
     Sur un aperçu (Vercel, localhost) il n'existe pas : on garde Web3Forms ou, à défaut, l'e-mail du visiteur. */
  const MAIL_ENDPOINT = '/send.php';
  const USE_SERVER_MAIL = /(^|\.)kstautoloc\.fr$/i.test(location.hostname);

  function setLoading(on) {
    sending = on;
    submitBtn.classList.toggle('is-loading', on);
    submitBtn.setAttribute('aria-busy', String(on));
    $('.btn__label', submitBtn).textContent = on ? 'Envoi en cours…' : 'Envoyer ma demande';
    if (on) announce('Envoi de votre demande en cours.');
  }

  function showResult({ title, text, buttons }) {
    resultOn = true;
    panels.forEach(p => { p.hidden = true; });
    $('[data-result-title]', resultEl).textContent = title;
    $('[data-result-text]', resultEl).textContent = text;
    $('[data-result-btns]', resultEl).innerHTML = buttons;
    resultEl.hidden = false;
    resultEl.focus({ preventScroll: true });
    bcard.scrollIntoView({ behavior: smooth(), block: 'start' });
  }

  const BTN = {
    call: `<a class="btn btn--ghost btn--sm" href="tel:${CONTACT.tel}">Appeler</a>`,
    whatsapp: () => `<a class="btn btn--ghost btn--sm" href="${esc(CONTACT.wa + '?text=' + encodeURIComponent(f.message.value.trim()))}" target="_blank" rel="noopener">WhatsApp</a>`,
    edit: '<button type="button" class="btn btn--ghost btn--sm" data-result-action="edit">Modifier ma demande</button>',
    copy: '<button type="button" class="btn btn--ghost btn--sm" data-result-action="copy">Copier ma demande</button>',
    fresh: '<button type="button" class="btn btn--gold btn--sm" data-result-action="new">Nouvelle demande</button>'
  };

  function onSent() {
    resetState(false);
    storage.clear();
    calViewFromState();
    render();
    showResult({
      title: 'Votre demande a bien été prise en compte',
      text: 'Merci pour votre confiance. Un conseiller KST Auto Loc’ a bien reçu votre demande et vous contactera dans les plus brefs délais, par téléphone ou par e-mail, afin de vous établir un devis personnalisé. Pensez également à vérifier vos courriers indésirables.',
      buttons: BTN.fresh + BTN.call
    });
    announce('Votre demande a bien été prise en compte. Un conseiller KST Auto Loc vous contactera dans les plus brefs délais.');
  }

  function viaMailto(d) {
    const url = mailtoUrl(d);
    window.location.href = url;
    showResult({
      title: 'Votre message est prêt',
      text: 'Votre application e-mail devrait s’ouvrir avec votre demande préremplie : il ne reste qu’à l’envoyer. Si rien ne s’ouvre, utilisez les boutons ci-dessous.',
      buttons: `<a class="btn btn--gold btn--sm" href="${esc(url)}">Ouvrir mon application e-mail</a>${BTN.copy}${BTN.whatsapp()}${BTN.call}${BTN.edit}`
    });
    announce('Votre application e-mail va s’ouvrir avec votre demande préremplie.');
  }

  function requestPayload(d) {
    return {
      subject: mailSubject(d),
      from_name: 'Site KST Auto Loc’',
      name: d.nom,
      email: d.email,
      telephone: d.telephone,
      message: d.message,
      precision: d.precision,
      occasion: d.occasion,
      date_evenement: d.date,
      heure_prise_en_charge: d.heure,
      depart: d.depart,
      arrivee: d.arrivee,
      etapes: d.etapes,
      vehicules: d.vehicules,
      forfait: d.forfait,
      options: d.options
    };
  }

  /* Envoie la demande en JSON ; `isOk` dit si la réponse du service confirme l'envoi. */
  async function postRequest(url, payload, d, isOk) {
    setLoading(true);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: ctl.signal
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !isOk(json)) throw new Error((json && json.message) || `HTTP ${res.status}`);
      setLoading(false);
      onSent();
    } catch (err) {
      setLoading(false);
      showAlert(
        `<p><strong>L’envoi n’a pas abouti.</strong> Vérifiez votre connexion et réessayez.</p>` +
        `<p>Vous pouvez aussi <a href="${esc(mailtoUrl(d))}">envoyer votre demande par e-mail</a> ou nous appeler au <a href="tel:${CONTACT.tel}">${CONTACT.telHuman}</a>.</p>`
      );
      announce('L’envoi n’a pas abouti.');
      alertBox.scrollIntoView({ behavior: smooth(), block: 'center' });
    } finally {
      clearTimeout(timer);
    }
  }

  const viaWeb3Forms = d => postRequest(WEB3FORMS_URL, Object.assign({ access_key: WEB3FORMS_ACCESS_KEY }, requestPayload(d)), d, json => !!(json && json.success));
  const viaServer = d => postRequest(MAIL_ENDPOINT, requestPayload(d), d, json => !!(json && json.ok));

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (step !== STEPS) { goStep(step + 1, { scroll: 'auto', gate: true }); return; }
    if (sending) return;

    const errors = Object.keys(FIELDS).filter(k => validateField(k));
    if (errors.length) {
      showAlert(
        `<p><strong>Merci de corriger ${errors.length > 1 ? 'ces champs' : 'ce champ'} :</strong></p><ul>` +
        errors.map(k => `<li><a href="#${FIELDS[k].el.id}" data-focus-field="${FIELDS[k].el.id}">${FIELDS[k].label}</a> : ${esc($(`[data-error="${k}"]`, form).textContent)}</li>`).join('') +
        '</ul>'
      );
      FIELDS[errors[0]].el.focus();
      return;
    }
    clearAlert();

    // Départ, heure de prise en charge et arrivée sont indispensables pour établir un devis : retour à l'étape Trajet s'il en manque un.
    if (!checkTrip()) {
      goStep(3, { scroll: 'auto', focus: false });
      focusTripIssue();
      return;
    }

    // Honeypot : un robot a rempli le champ caché, on simule un succès sans rien envoyer.
    if (f.website && f.website.value) {
      showResult({ title: 'Votre demande est envoyée', text: 'Merci.', buttons: BTN.fresh });
      return;
    }

    const data = collect();
    if (USE_SERVER_MAIL) viaServer(data); else if (KEY_OK) viaWeb3Forms(data); else viaMailto(data);
  });

  /* ==========================================================================
     Récapitulatif (colonne sticky sur bureau, tiroir sur mobile)
     ========================================================================== */
  const recapBtn = $('[data-recap-open]');
  const recapBackdrop = $('[data-recap-backdrop]');
  const mqDrawer = window.matchMedia('(max-width: 999.98px)');

  function openRecap() {
    if (!mqDrawer.matches) return;
    recapEl.setAttribute('role', 'dialog');
    recapEl.setAttribute('aria-modal', 'true');
    recapBackdrop.hidden = false;
    recapBtn.setAttribute('aria-expanded', 'true');
    openOverlay(recapEl, {
      opener: recapBtn,
      modal: false,
      initialFocus: $('[data-recap-close]', recapEl),
      onClose: () => {
        recapEl.removeAttribute('role');
        recapEl.removeAttribute('aria-modal');
        recapBackdrop.hidden = true;
        recapBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
  recapBtn.setAttribute('aria-expanded', 'false');

  /* Étape 6 sur mobile : le faire-part quitte le tiroir et s'affiche dans la page, au-dessus des champs
     (classe .is-inline : ni dialogue, ni fond sombre, ni bouton fermer). Partout ailleurs, il reste à sa place
     d'origine (colonne sticky sur bureau, tiroir « Ma demande » sur mobile aux étapes 1 à 5). */
  const recapSlot = $('[data-recap-slot]', form);
  const recapMark = document.createComment('faire-part');
  recapEl.before(recapMark);
  function placeRecap() {
    const inline = mqDrawer.matches && step === STEPS;
    if (inline === recapEl.classList.contains('is-inline')) return;
    const hadFocus = recapEl.contains(document.activeElement);
    if (inline) {
      closeOverlay(recapEl, { restore: false }); // tiroir éventuellement ouvert : fermé proprement (rôle, backdrop, verrou de scroll)
      recapSlot.append(recapEl);
    } else {
      recapMark.after(recapEl);
    }
    recapEl.classList.toggle('is-inline', inline);
    // Déplacer le nœud fait perdre le focus : on le ramène au titre de l'étape plutôt que sur <body>
    if (hadFocus) {
      const title = $(`[data-panel="${step}"] .panel__title`, form);
      if (title) title.focus({ preventScroll: true });
    }
  }

  // Le faire-part s'incline très légèrement sous le curseur (bureau, souris uniquement).
  if (window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) {
    recapEl.addEventListener('pointermove', e => {
      const r = recapEl.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      recapEl.style.setProperty('--ry', `${(x * 5).toFixed(2)}deg`);
      recapEl.style.setProperty('--rx', `${(-y * 4).toFixed(2)}deg`);
    });
    recapEl.addEventListener('pointerleave', () => {
      recapEl.style.setProperty('--ry', '0deg');
      recapEl.style.setProperty('--rx', '0deg');
    });
  }
  mqDrawer.addEventListener('change', () => { closeOverlay(recapEl, { restore: false }); placeRecap(); });

  /* ==========================================================================
     Événements globaux (délégation)
     ========================================================================== */
  document.addEventListener('click', e => {
    const t = e.target;
    const hit = sel => t.closest(sel);
    let el;

    if ((el = hit('[data-menu-open]'))) { openMenu(); return; }
    if (hit('[data-menu-close]')) { closeOverlay(menu); return; }
    if (hit('[data-menu-link]')) { closeOverlay(menu, { restore: false }); }

    if ((el = hit('[data-toggle-vehicle]'))) { toggleVehicle(el.closest('[data-vehicle]').dataset.vehicle); return; }

    if ((el = hit('[data-cinema-open]'))) { openCinema(el); return; }
    if (hit('[data-cinema-close]')) { closeOverlay(cinema); return; }

    if ((el = hit('[data-filter]'))) { setFilter(el.dataset.filter, true); return; }
    if ((el = hit('[data-filter-brand]'))) { setFilter(el.dataset.filterBrand, true); return; }

    if ((el = hit('[data-occasion]'))) {
      update({ occasion: el.dataset.occasion });
      goStep(2, { scroll: true });
      return;
    }

    if ((el = hit('[data-remove]'))) {
      toggleVehicle(el.dataset.remove, false);
      const next = $('[data-r="vehicles"] .recap__x', recapEl) || $('.fp__edit [data-goto-step="4"]', recapEl);
      if (next) next.focus({ preventScroll: true });
      return;
    }

    if ((el = hit('[data-goto-step]'))) {
      e.preventDefault();
      closeOverlay(recapEl, { restore: false });
      const target = el.dataset.focus ? $(el.dataset.focus) : null;
      goStep(el.dataset.gotoStep, { scroll: el.matches('a') ? true : 'auto', focus: !target });
      if (target) target.focus({ preventScroll: true });
      return;
    }

    if (hit('[data-next]')) { goStep(step + 1, { scroll: 'auto', gate: true }); return; }
    if (hit('[data-prev]')) { goStep(step - 1, { scroll: 'auto' }); return; }
    if ((el = hit('[data-step-btn]'))) { goStep(el.dataset.stepBtn, { scroll: 'auto', gate: true }); return; }

    if (hit('[data-recap-open]')) { openRecap(); return; }
    if (hit('[data-recap-close]') || hit('[data-recap-backdrop]')) { closeOverlay(recapEl); return; }

    if (hit('[data-forfait-clear]')) {
      update({ forfait: '', forfaitAutre: '' });
      const first = $('input[name="forfait"]', form);
      if (first) first.focus();
      announce('Forfait effacé.');
      return;
    }

    if (hit('[data-clear]')) {
      resetState(true);
      persist();
      calViewFromState();
      render();
      goStep(1, { focus: false });
      announce('Votre demande a été réinitialisée.');
      return;
    }

    if (hit('[data-precision-toggle]')) {
      precisionOpen = true;
      renderFields();
      f.precision.focus();
      return;
    }

    if ((el = hit('[data-focus-field]'))) {
      e.preventDefault();
      const target = document.getElementById(el.dataset.focusField);
      if (target) target.focus();
      return;
    }

    // « Copier ma demande » : le texte généré n'est plus affiché, on le copie pour le coller où l'on veut (Instagram, Snapchat, SMS…)
    if (hit('[data-direct-copy]')) {
      const status = $('[data-direct-status]', form);
      copyText(f.message.value.trim()).then(ok => {
        if (status) status.textContent = ok
          ? 'Votre demande est copiée : collez-la dans Instagram, Snapchat, un SMS ou n’importe quelle messagerie.'
          : 'La copie automatique n’a pas fonctionné : utilisez plutôt le bouton « Envoyer ma demande ».';
      });
      return;
    }

    if ((el = hit('[data-result-action]'))) {
      const action = el.dataset.resultAction;
      if (action === 'edit') goStep(STEPS, { scroll: 'auto' });
      else if (action === 'new') goStep(1, { scroll: true });
      else if (action === 'copy') {
        const d = collect();
        copyText(mailBody(d)).then(ok => announce(ok ? 'Votre demande a été copiée.' : 'La copie n’a pas fonctionné.'));
      }
    }
  });

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* Saisies des champs */
  /* On relit tous les champs texte à chaque saisie : l'autoremplissage du navigateur
     modifie plusieurs champs d'un coup, aucun ne doit être écrasé par l'état. */
  const TEXT_FIELDS = { name: f.name, phone: f.phone, email: f.email, precision: f.precision, forfaitAutre: f.forfaitAutre };
  form.addEventListener('input', e => {
    if (e.target.matches('[data-trip-addr]')) { onTripInput(e.target); return; }
    const patch = {};
    Object.entries(TEXT_FIELDS).forEach(([key, el]) => { if (el.value !== state[key]) patch[key] = el.value; });
    if (Object.keys(patch).length) update(patch);
  });
  form.addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'occasion') update({ occasion: t.value });
    else if (t.name === 'mode') update(t.value === 'range' ? { mode: 'range' } : { mode: 'single', end: '' });
    else if (t === f.time || t.matches('[data-trip-time-main]')) update({ time: t.value });
    else if (t.matches('[data-trip-time]')) setPoint(Number(t.dataset.tripTime), { time: t.value });
    else if (t.name === 'vehicule') toggleVehicle(t.value, t.checked);
    else if (t.name === 'forfait') update({ forfait: t.value });
    else if (t.name === 'option') update({ options: OPTIONS.map(o => o.id).filter(id => (id === t.value ? t.checked : state.options.includes(id))) });
  });

  /* ==========================================================================
     Révélations, compteurs, navigation active, bandeaux
     ========================================================================== */
  const canObserve = 'IntersectionObserver' in window;

  if (canObserve) {
    const revealIO = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      revealIO.unobserve(en.target);
    }), { rootMargin: '0px 0px -10% 0px' });
    $$('[data-reveal]').forEach(el => revealIO.observe(el));
    cards.forEach((c, i) => { c.style.setProperty('--d', `${(i % 2) * 90}ms`); revealIO.observe(c); });

    const countIO = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      countIO.unobserve(en.target);
      const to = Number(en.target.dataset.countTo);
      if (RM || !to) return;
      const t0 = performance.now(), dur = 1400;
      const tick = now => {
        const p = Math.min(1, (now - t0) / dur);
        en.target.textContent = pad(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), { threshold: 0.6 });
    $$('[data-count-to]').forEach(el => countIO.observe(el));

    const navLinks = $$('.nav a');
    const spy = new IntersectionObserver(entries => entries.forEach(en => {
      navLinks.forEach(a => { if (a.getAttribute('href') === `#${en.target.id}`) a.classList.toggle('is-active', en.isIntersecting); });
    }), { rootMargin: '-45% 0px -50% 0px' });
    ['flotte', 'evenements', 'reservation', 'contact'].forEach(id => { const s = document.getElementById(id); if (s) spy.observe(s); });

    const bookingIO = new IntersectionObserver(entries => entries.forEach(en => {
      inBooking = en.isIntersecting;
      ctaBar.classList.toggle('is-hidden', inBooking);
      renderTray();
    }));
    bookingIO.observe($('#reservation'));
  } else {
    $$('[data-reveal]').forEach(el => el.classList.add('is-in'));
    cards.forEach(c => c.classList.add('is-in'));
  }

  /* ==========================================================================
     Rangées glissables (mobile) : indicateur discret de progression
     Scroll natif (scroll-snap), aucun détournement du scroll vertical.
     ========================================================================== */
  (function swipeRows() {
    function onFrame(fn) {
      let ticking = false;
      return () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { ticking = false; fn(); });
      };
    }
    const rows = $$('.brands__grid, .occasions, .fleet__grid, .facts, .contact__cards');
    rows.forEach(row => {
      const track = document.createElement('div');
      const thumb = document.createElement('span');
      track.className = 'swipe-track';
      track.setAttribute('aria-hidden', 'true');
      track.appendChild(thumb);
      row.insertAdjacentElement('afterend', track);

      function update() {
        const max = row.scrollWidth - row.clientWidth;
        if (max <= 2) { track.hidden = true; return; }
        track.hidden = false;
        const ratio = row.clientWidth / row.scrollWidth;
        const progress = row.scrollLeft / max;
        thumb.style.width = `${ratio * 100}%`;
        thumb.style.transform = `translateX(${progress * (1 / ratio - 1) * 100}%)`;
      }
      row.addEventListener('scroll', onFrame(update), { passive: true });
      window.addEventListener('resize', onFrame(update));
      update();
    });
  })();

  /* Horaires : jour courant et état (heure de Paris, d'après les horaires affichés) */
  const OPEN = { 1: [510, 1200], 2: [510, 1200], 3: [510, 1200], 4: [510, 1200], 5: [510, 1200], 6: [570, 1200] };
  function parisNow() {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      const get = type => parts.find(p => p.type === type).value;
      const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday').slice(0, 3));
      if (dow < 0) throw new Error('weekday');
      return { dow, min: Number(get('hour')) * 60 + Number(get('minute')) };
    } catch (e) {
      const d = new Date();
      return { dow: d.getDay(), min: d.getHours() * 60 + d.getMinutes() };
    }
  }
  function renderHours() {
    const { dow, min } = parisNow();
    $$('[data-hours] li').forEach(li => li.classList.toggle('is-today', li.dataset.days.split(',').includes(String(dow))));
    const range = OPEN[dow];
    const isOpen = !!range && min >= range[0] && min < range[1];
    const status = $('[data-open-status]');
    if (!status) return;
    status.hidden = false;
    status.classList.toggle('is-open', isOpen);
    $('span', status).textContent = isOpen ? 'Bureau ouvert' : 'Bureau fermé · joignable 24h/24';
  }
  renderHours();
  setInterval(renderHours, 60000);

  /* ==========================================================================
     Initialisation
     ========================================================================== */
  restore();
  calViewFromState();
  setFilter('all', false);
  render();
  goStep(1, { focus: false });
  trayEl.hidden = false;
  $$('[data-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });

  /* Arrivée depuis une page véhicule : /?vehicule=<id>#reservation
     Le véhicule est ajouté à la demande, puis le visiteur est amené au formulaire à l'étape logique
     (l'occasion d'abord, sinon la première étape incomplète, comme avant avec « Réserver ce véhicule »).
     L'URL est nettoyée pour que l'action ne se rejoue pas au rechargement. Le splash (une fois par
     visite) reste un simple rideau par-dessus : il ne retarde ni ne bloque rien. */
  (function fromVehiclePage() {
    const params = new URLSearchParams(location.search);
    if (!params.has('vehicule')) return;
    const id = params.get('vehicule');
    params.delete('vehicule');
    const qs = params.toString();
    try { history.replaceState(history.state, '', location.pathname + (qs ? `?${qs}` : '') + location.hash); } catch (e) { /* URL laissée telle quelle */ }
    if (!vehicles[id]) return;
    toggleVehicle(id, true);
    const s = firstIncompleteBeforeSend();
    const go = () => goStep(s === 6 && !state.forfait ? 5 : s, { scroll: true });
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  })();

  /* FAQ (mobile) : afficher les questions masquées */
  const faqMore = $('[data-faq-more]');
  if (faqMore) faqMore.addEventListener('click', () => {
    const faq = faqMore.closest('.faq');
    faq.classList.add('is-all');
    faqMore.setAttribute('aria-expanded', 'true');
    const next = $$('.faq__item summary', faq)[4];
    if (next) next.focus();
  });

  /* Bouton réseaux flottant (mobile) : le logo déploie WhatsApp, Instagram et Snapchat */
  (function socialFab() {
    const fab = $('[data-social]');
    if (!fab) return;
    const toggle = $('[data-social-toggle]', fab);
    const links = $$('.social-fab__link', fab);
    const set = open => {
      fab.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      links.forEach(a => { a.tabIndex = open ? 0 : -1; });
    };
    toggle.addEventListener('click', () => set(!fab.classList.contains('is-open')));
    document.addEventListener('click', e => { if (!fab.contains(e.target)) set(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && fab.classList.contains('is-open')) { set(false); toggle.focus(); } });
  })();

  window.__kstReady = true;
})();
