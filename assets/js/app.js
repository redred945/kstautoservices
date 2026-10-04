/* ==========================================================================
   KST Auto Loc’ — app.js
   JS vanille, sans dépendance.

   ENVOI DU FORMULAIRE
   -------------------
   Le site est statique. Deux modes d'envoi, choisis automatiquement :

   1. Web3Forms (recommandé) : créez une clé gratuite sur https://web3forms.com
      avec l'adresse contact@kstautoservices.com, puis collez-la ci-dessous à la
      place de WEB3FORMS_ACCESS_KEY. La demande est alors envoyée par e-mail au
      client sans quitter le site.
   2. Tant que la clé n'est pas renseignée : repli propre sur mailto: (ouvre le
      client e-mail du visiteur avec sujet et corps préremplis).
   ========================================================================== */
(() => {
  'use strict';

  const WEB3FORMS_ACCESS_KEY = 'WEB3FORMS_ACCESS_KEY';

  const CONTACT = {
    email: 'contact@kstautoservices.com',
    tel: '+33648480558',
    telHuman: '06.48.48.05.58',
    wa: 'https://wa.me/33648480558'
  };
  const STORE_KEY = 'kst-demande-v1';
  const WEB3FORMS_URL = 'https://api.web3forms.com/submit';
  const VIDEO_SRC = 'assets/img/Home/video-presentation.mp4';
  const BAN_URL = 'https://api-adresse.data.gouv.fr/search/';   // Base Adresse Nationale (gratuite, sans clé) ; lat/lon = priorité à l'Île-de-France
  const MAX_POINTS = 8;                                          // prise en charge + 7 étapes
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
    setTimeout(finish, 3400);
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
     trip[0] = prise en charge (son heure est state.time, choisie à l'étape 2). */
  let ptSeq = 0;
  const TIME_RE = /^\d{2}:\d{2}$/;
  const newPoint = (o = {}) => ({ id: ++ptSeq, addr: str(o.addr, 160), city: str(o.city, 80), time: TIME_RE.test(o.time || '') ? o.time : '' });

  const DEFAULTS = () => ({
    occasion: '', mode: 'single', start: '', end: '', time: '', trip: [newPoint()],
    vehicles: [], forfait: '', forfaitAutre: '', options: [],
    name: '', email: '', phone: '', message: '', edited: false
  });
  const state = DEFAULTS();
  const CHOICE_KEYS = ['occasion', 'trip', 'mode', 'start', 'end', 'time', 'vehicles', 'forfait', 'forfaitAutre', 'options'];

  function restore() {
    const s = storage.get();
    if (!s || typeof s !== 'object') return;
    if (OCC[s.occasion]) state.occasion = s.occasion;
    // Ancienne clé « city » (avant l'étape Trajet) : volontairement ignorée.
    if (Array.isArray(s.trip)) {
      const t = s.trip.filter(pt => pt && typeof pt === 'object').slice(0, MAX_POINTS).map(newPoint);
      if (t.length) state.trip = t;
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
    state.message = str(s.message, 2000);
    state.edited = s.edited === true && state.message.trim() !== '';
  }
  const persist = () => storage.set(state);

  /* Phrase de demande rédigée d'après les choix */
  function dateClause() {
    if (!state.start) return '';
    return state.end ? `du ${rangeText(state.start, state.end)}` : `le ${longDate(state.start)}`;
  }
  /* Trajet : adresse renseignée, libellé court (ville) et lignes du message */
  const filledPts = () => state.trip.filter(pt => pt.addr.trim());
  // Ville : celle de la suggestion BAN, sinon déduite de la saisie libre (« 77100 Meaux » ou dernier segment après une virgule)
  const cityOf = pt => pt.city || ((pt.addr.match(/\b\d{5}\s+([^,]+?)\s*$/) || [])[1] || (pt.addr.includes(',') ? pt.addr.split(',').pop().trim() : ''));
  const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
  const placeOf = pt => clip((cityOf(pt) || pt.addr).trim(), 34);
  const stopLine = (pt, n) => `Étape ${n}${pt.time ? ' (' + timeLabel(pt.time) + ')' : ''} : ${pt.addr.trim()}`;
  const stopLines = () => state.trip.slice(1).filter(pt => pt.addr.trim()).map((pt, k) => stopLine(pt, k + 2));

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

  function buildMessage() {
    let s = 'Bonjour, je souhaite une demande de devis pour ' + (OCC[state.occasion] ? OCC[state.occasion].phrase : 'une location de voiture de luxe');
    const d = dateClause();
    if (d) s += ' ' + d;
    const lines = [s + '.'];
    const first = state.trip[0], t0 = state.time ? timeLabel(state.time) : '';
    if (first.addr.trim()) lines.push(`Prise en charge${t0 ? ' à ' + t0 : ''} : ${first.addr.trim()}.`);
    else if (t0) lines.push(`Prise en charge souhaitée à ${t0}.`);
    stopLines().forEach(l => lines.push(l + '.'));
    const cars = state.vehicles.map(id => 'la ' + vehicles[id].full);
    lines.push(cars.length ? `${cars.length > 1 ? 'Véhicules souhaités' : 'Véhicule souhaité'} : ${joinList(cars)}, avec chauffeur.` : 'Prestation avec chauffeur.');
    const fo = forfaitDetail();
    if (fo) lines.push('Forfait souhaité : ' + fo + '.');
    const op = optionsLine();
    if (op) lines.push(op);
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
    if (!state.edited && keys.some(k => CHOICE_KEYS.includes(k))) state.message = buildMessage();
    persist();
    render(keys, keepTrip);
  }

  function resetState(keepContact) {
    const keep = keepContact ? { name: state.name, email: state.email, phone: state.phone } : {};
    Object.assign(state, DEFAULTS(), keep);
    state.message = buildMessage();
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
    else if (top.el === lb.el) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); lbStep(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); lbStep(1); }
      else if (e.key === 'Home') { e.preventDefault(); lbShow(0); }
      else if (e.key === 'End') { e.preventDefault(); lbShow(lb.list.length - 1); }
    }
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
     Galerie plein écran
     ========================================================================== */
  const lb = {
    el: $('[data-lightbox]'),
    img: $('[data-lb-img]'),
    title: $('[data-lb-title]'),
    count: $('[data-lb-count]'),
    thumbs: $('[data-lb-thumbs]'),
    chips: $('[data-lb-chips]'),
    stage: $('[data-lb-stage]'),
    id: null, list: [], i: 0, token: 0
  };

  function vehicleChips(v) {
    const ico = id => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
    return (v.type ? `<li>${esc(v.type)}</li>` : '') +
      `<li>${ico('i-seat')}5 places</li><li>${ico('i-bag')}1 bagage</li><li>${ico('i-wheel')}Avec chauffeur</li>`;
  }

  function openGallery(id, index = 0, opener) {
    const v = vehicles[id];
    if (!v) return;
    lb.id = id;
    lb.list = v.images;
    lb.title.textContent = v.full;
    lb.chips.innerHTML = vehicleChips(v);
    lb.thumbs.innerHTML = v.images.map((im, i) =>
      `<li><button type="button" data-lb-thumb="${i}" aria-label="Photo ${i + 1} sur ${v.images.length}"><img src="${esc(im.src)}" alt="" width="156" height="104" loading="lazy" decoding="async"></button></li>`
    ).join('');
    const multi = v.images.length > 1;
    $('[data-lb-prev]', lb.el).hidden = !multi;
    $('[data-lb-next]', lb.el).hidden = !multi;
    lb.thumbs.hidden = !multi;
    lb.img.classList.remove('is-swapping');
    lbShow(index, true);
    openOverlay(lb.el, { opener, initialFocus: $('[data-lb-close]', lb.el) });
  }

  function lbShow(i, instant) {
    const n = lb.list.length;
    lb.i = (i + n) % n;
    const im = lb.list[lb.i];
    const token = ++lb.token;
    lb.count.textContent = `Photo ${lb.i + 1} sur ${n}`;
    $$('[data-lb-thumb]', lb.thumbs).forEach((b, k) => b.setAttribute('aria-current', String(k === lb.i)));
    const apply = () => {
      if (token !== lb.token) return;
      lb.img.src = im.src;
      lb.img.alt = im.alt;
      requestAnimationFrame(() => lb.img.classList.remove('is-swapping'));
    };
    if (instant) { apply(); } else {
      lb.img.classList.add('is-swapping');
      const pre = new Image();
      pre.onload = pre.onerror = apply;
      pre.src = im.src;
    }
    // précharge la suivante
    if (n > 1) new Image().src = lb.list[(lb.i + 1) % n].src;
  }
  const lbStep = d => { if (lb.list.length > 1) lbShow(lb.i + d); };

  let swipeX = null, swipeY = null;
  lb.stage.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { swipeX = e.clientX; swipeY = e.clientY; } });
  lb.stage.addEventListener('pointerup', e => {
    if (swipeX === null) return;
    const dx = e.clientX - swipeX, dy = e.clientY - swipeY;
    swipeX = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) lbStep(dx < 0 ? 1 : -1);
  });
  lb.stage.addEventListener('pointercancel', () => { swipeX = null; });

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
    phone: $('#f-phone'), email: $('#f-email'), message: $('#f-message'),
    forfaitAutre: $('#f-forfait-autre'),
    website: form.elements.website
  };
  const regenBtn = $('[data-regen]', form);
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
  const tripErr = { on: false };
  const timeErr = { on: false };
  let tripNewId = 0;

  function pointHTML(pt, i, n) {
    const first = i === 0, last = n > 1 && i === n - 1, num = i + 1;
    const addrId = `trip-addr-${pt.id}`, listId = `trip-list-${pt.id}`, errId = `trip-err-${pt.id}`;
    const tools = first ? '' :
      `<div class="trip__tools" role="group" aria-label="Actions pour l’étape ${num}">` +
      `<button type="button" class="trip__tool" data-trip-up="${pt.id}" aria-label="Monter l’étape ${num}"${i === 1 ? ' disabled' : ''}>${tripIco('i-chev-u')}</button>` +
      `<button type="button" class="trip__tool" data-trip-down="${pt.id}" aria-label="Descendre l’étape ${num}"${last ? ' disabled' : ''}>${tripIco('i-chev-d')}</button>` +
      `<button type="button" class="trip__tool trip__tool--del" data-trip-del="${pt.id}" aria-label="Supprimer l’étape ${num}">${tripIco('i-trash')}</button>` +
      '</div>';
    const under = first
      ? `<div class="field trip__time trip__time--main"><label for="trip-time-main">${tripIco('i-clock')}Heure de prise en charge <span class="req" aria-hidden="true">*</span></label><select id="trip-time-main" data-trip-time-main>${timeOptions(state.time, 'Choisir une heure')}</select></div>`
      : `<div class="field trip__time"><label for="trip-time-${pt.id}">Heure <span class="opt">(facultatif)</span></label><select id="trip-time-${pt.id}" data-trip-time="${pt.id}">${timeOptions(pt.time)}</select></div>`;
    return `<li class="trip__pt${pt.id === tripNewId ? ' is-new' : ''}">` +
      `<span class="trip__dot" aria-hidden="true">${ROMAN[i] || num}</span>` +
      '<div class="trip__main">' +
      '<div class="trip__head"><div class="trip__titles">' +
      `<label class="trip__kicker" for="${addrId}">${first ? 'Adresse de prise en charge <span class="req" aria-hidden="true">*</span>' : `Étape ${num}<span class="vh"> : adresse</span>`}</label>` +
      (last ? '<span class="trip__tag">Arrivée</span>' : '') +
      '</div>' +
      tools +
      '</div>' +
      '<div class="field trip__field"><div class="combo">' +
      `<input class="trip__input" id="${addrId}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}" ` +
      `autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" maxlength="160" placeholder="Numéro, rue, ville" ` +
      `data-trip-addr="${pt.id}" value="${esc(pt.addr)}"${first ? ` aria-required="true" aria-describedby="${errId}"` : ''}>` +
      `<ul class="combo__list" id="${listId}" role="listbox" aria-label="Suggestions d’adresses" hidden></ul>` +
      '</div>' +
      (first ? `<p class="field__error" id="${errId}" data-trip-error hidden></p>` : '') +
      '</div>' +
      under +
      '</div></li>';
  }

  function renderTrip() {
    const n = state.trip.length;
    const full = n >= MAX_POINTS;
    tripEl.innerHTML = state.trip.map((pt, i) => pointHTML(pt, i, n)).join('') +
      '<li class="trip__addrow" role="presentation">' +
      `<button type="button" class="trip__add" data-trip-add${full ? ' disabled' : ''}>` +
      `<span class="trip__dot trip__dot--add" aria-hidden="true">${tripIco('i-plus')}</span>` +
      `<span>${full ? 'Nombre maximal d’étapes atteint' : 'Ajouter une étape'}</span></button></li>`;
    tripNewId = 0;
    acReset();
    renderTripWhen();
    if (tripErr.on) setTripError(true);
  }

  /* Heure de prise en charge, mise en évidence sous l'adresse (même valeur qu'à l'étape 2) */
  function renderTripWhen() {
    const sel = $('[data-trip-time-main]', tripEl);
    if (!sel) return;
    if (sel.value !== state.time) sel.value = state.time;
    sel.closest('.trip__time--main').classList.toggle('is-set', !!state.time);
    if (timeErr.on) setTimeError(!state.time);
  }

  function setTripError(on) {
    tripErr.on = on;
    const input = $('[data-trip-addr]', tripEl), box = $('[data-trip-error]', tripEl);
    if (!input || !box) return;
    box.textContent = on ? 'Indiquez l’adresse de prise en charge pour continuer.' : '';
    box.hidden = !on;
    if (on) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  function checkPickup() {
    const ok = !!state.trip[0].addr.trim();
    setTripError(!ok);
    const timeOk = checkTime();
    return ok && timeOk;
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

  function onTripInput(input) {
    setPoint(Number(input.dataset.tripAddr), { addr: input.value, city: '' });
    if (tripErr.on && state.trip[0].addr.trim()) setTripError(false);
    acSchedule(input);
  }

  function addStop() {
    if (state.trip.length >= MAX_POINTS) return;
    const pt = newPoint();
    tripNewId = pt.id;
    update({ trip: [...state.trip, pt] });
    const input = $(`#trip-addr-${pt.id}`);
    if (input) input.focus();
    tripSay(`Étape ${state.trip.length} ajoutée. Saisissez son adresse.`);
  }

  function removeStop(id) {
    const i = state.trip.findIndex(pt => pt.id === id);
    if (i < 1) return;
    update({ trip: state.trip.filter(pt => pt.id !== id) });
    const next = $$('[data-trip-addr]', tripEl)[Math.min(i, state.trip.length - 1)];
    if (next) next.focus();
    tripSay(`Étape ${i + 1} supprimée. Le trajet compte maintenant ${state.trip.length} ${state.trip.length > 1 ? 'adresses' : 'adresse'}.`);
  }

  function moveStop(id, d) {
    const i = state.trip.findIndex(pt => pt.id === id), j = i + d;
    if (i < 1 || j < 1 || j >= state.trip.length) return;
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
    if (tripErr.on && state.trip[0].addr.trim()) setTripError(false);
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

  /* Mini-trajet du faire-part : « à Meaux », « Meaux — Paris — Chelles » ou « Meaux · 3 adresses » */
  function routeHTML() {
    const pts = filledPts();
    if (!pts.length) return '';
    const names = [];
    pts.forEach(pt => { const nm = placeOf(pt); if (nm && names[names.length - 1] !== nm) names.push(nm); });
    if (pts.length === 1) return `<span>${esc(names[0])}</span>`;
    if (names.length === 1) return `<span>${esc(names[0])}</span><span class="fp__cnt">${pts.length} adresses</span>`;
    const shown = names.length > 3 ? [names[0], '…', names[names.length - 1]] : names;
    return shown.map(n => `<span>${esc(n)}</span>`).join('<span class="vh">, puis </span><i class="fp__sep" aria-hidden="true"></i>');
  }

  function renderRoute() {
    const el = $('[data-r="route"]', recapEl);
    const html = routeHTML();
    const next = html || 'Votre trajet';
    if (el.dataset.k !== next) {
      el.dataset.k = next;
      if (html) el.innerHTML = html; else el.textContent = next;
      if (html && inBooking) { el.classList.remove('fp-in'); void el.offsetWidth; el.classList.add('fp-in'); }
    }
    el.classList.toggle('is-empty', !html);
    el.classList.toggle('is-single', filledPts().length === 1);
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

  function renderMini() {
    const items = [];
    if (OCC[state.occasion]) items.push([1, OCC[state.occasion].icon, OCC[state.occasion].label]);
    if (state.start) items.push([2, 'i-cal', dateSummary()]);
    const pts = filledPts();
    if (pts.length) items.push([3, 'i-pin', placeOf(pts[0]) + (pts.length > 1 ? ` · ${pts.length} adresses` : '')]);
    if (state.vehicles.length) items.push([4, 'i-wheel', state.vehicles.length === 1 ? vehicles[state.vehicles[0]].full : `${state.vehicles.length} véhicules`]);
    const extra = [state.forfait ? forfaitText() : '', state.options.length ? state.options.length + (state.options.length > 1 ? ' options' : ' option') : ''].filter(Boolean);
    if (extra.length) items.push([5, 'i-clock', extra.join(' · ')]);
    $('[data-mini-recap]', form).innerHTML = items.map(([s, ico, text]) =>
      `<button type="button" class="mini" data-goto-step="${s}"><svg class="ico" aria-hidden="true"><use href="#${ico}"/></svg>${esc(text)}</button>`
    ).join('');
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
    setVal(f.message, state.message);
    regenBtn.hidden = f.message.value === buildMessage();
    const text = f.message.value.trim();
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
      : n === 3 ? !!state.trip[0].addr.trim()
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
    renderMini();
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

  /* gate : depuis l'étape Trajet, on n'avance pas sans adresse de prise en charge */
  function goStep(n, { scroll = false, focus = true, gate = false } = {}) {
    n = Math.min(STEPS, Math.max(1, Number(n) || 1));
    if (gate && step === 2 && n > 2 && !checkDateTime()) {
      if (state.start) f.time.focus(); else { const d = $('.cal__day[tabindex="0"]', calEl); if (d) d.focus(); }
      announce(state.start ? 'Indiquez l’heure de prise en charge pour continuer.' : 'Choisissez la date de votre événement pour continuer.');
      return;
    }
    if (gate && step === 3 && n > 3 && !checkPickup()) {
      const input = state.trip[0].addr.trim() ? $('[data-trip-time-main]', tripEl) : $('[data-trip-addr]', tripEl);
      if (input) input.focus();
      announce(state.trip[0].addr.trim() ? 'Indiquez l’heure de prise en charge pour continuer.' : 'Indiquez l’adresse de prise en charge pour continuer.');
      return;
    }
    hideResult();
    const back = n < step;
    step = n;
    panels.forEach(p => {
      const on = Number(p.dataset.panel) === n;
      p.hidden = !on;
      p.classList.toggle('is-back', on && back);
    });
    renderStepper();
    if (n === 2) renderCalendar();
    if (focus) {
      const title = $(`[data-panel="${n}"] .panel__title`, form);
      if (title) title.focus({ preventScroll: true });
    }
    if (scroll === true || (scroll === 'auto' && bcard.getBoundingClientRect().top < headerH())) {
      bcard.scrollIntoView({ behavior: smooth(), block: 'start' });
    }
  }

  const firstIncompleteBeforeSend = () => (!state.occasion ? 1 : (!state.start || !state.time) ? 2 : !state.trip[0].addr.trim() ? 3 : 6);

  /* ==========================================================================
     Validation & envoi
     ========================================================================== */
  const FIELDS = {
    nom: { el: f.name, label: 'Nom' },
    telephone: { el: f.phone, label: 'Téléphone' },
    email: { el: f.email, label: 'E-mail' },
    message: { el: f.message, label: 'Votre demande' }
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
    },
    message: v => (!v.trim() ? 'Décrivez votre demande en quelques mots.' : v.trim().length < 10 ? 'Votre demande est un peu courte (10 caractères minimum).' : '')
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
      message: f.message.value.trim(),
      occasion: OCC[state.occasion] ? OCC[state.occasion].label : '',
      priseEnCharge: state.trip[0].addr.trim(),
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
    if (d.priseEnCharge) lines.push(`Prise en charge : ${d.priseEnCharge}`);
    if (d.etapes) d.etapes.split('\n').forEach(l => lines.push(l));
    if (d.vehicules) lines.push(`Véhicules : ${d.vehicules}`);
    if (d.forfait) lines.push(`Forfait : ${d.forfait}`);
    if (d.options) lines.push(`Options (prix sur demande) : ${d.options}`);
    return lines.join('\r\n');
  }
  const mailtoUrl = d => `mailto:${CONTACT.email}?subject=${encodeURIComponent(mailSubject(d))}&body=${encodeURIComponent(mailBody(d))}`;

  const KEY_OK = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(WEB3FORMS_ACCESS_KEY);

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
      title: 'Votre demande est envoyée',
      text: 'Merci. Votre demande a bien été transmise à KST Auto Loc’. Sous réserve de disponibilité, confirmée par KST Auto Loc’.',
      buttons: BTN.fresh + BTN.call
    });
    announce('Votre demande a bien été envoyée.');
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

  async function viaWeb3Forms(d) {
    const payload = {
      access_key: WEB3FORMS_ACCESS_KEY,
      subject: mailSubject(d),
      from_name: 'Site KST Auto Loc’',
      name: d.nom,
      email: d.email,
      telephone: d.telephone,
      message: d.message,
      occasion: d.occasion,
      date_evenement: d.date,
      heure_prise_en_charge: d.heure,
      prise_en_charge: d.priseEnCharge,
      etapes: d.etapes,
      vehicules: d.vehicules,
      forfait: d.forfait,
      options: d.options
    };
    setLoading(true);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(WEB3FORMS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: ctl.signal
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.success) throw new Error((json && json.message) || `HTTP ${res.status}`);
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

    // La prise en charge est indispensable pour établir un devis : retour à l'étape Trajet si elle manque.
    if (!state.trip[0].addr.trim()) {
      goStep(3, { scroll: 'auto', focus: false });
      checkPickup();
      const input = $('[data-trip-addr]', tripEl);
      if (input) input.focus();
      announce('Indiquez l’adresse de prise en charge pour continuer.');
      return;
    }

    // Honeypot : un robot a rempli le champ caché, on simule un succès sans rien envoyer.
    if (f.website && f.website.value) {
      showResult({ title: 'Votre demande est envoyée', text: 'Merci.', buttons: BTN.fresh });
      return;
    }

    const data = collect();
    if (KEY_OK) viaWeb3Forms(data); else viaMailto(data);
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
  mqDrawer.addEventListener('change', () => closeOverlay(recapEl, { restore: false }));

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

    if ((el = hit('[data-open-gallery]'))) {
      const card = el.closest('[data-vehicle]');
      if (card) openGallery(card.dataset.vehicle, 0, $('.vcard__actions [data-open-gallery]', card) || el);
      return;
    }
    if (hit('[data-lb-close]')) { closeOverlay(lb.el); return; }
    if (hit('[data-lb-prev]')) { lbStep(-1); return; }
    if (hit('[data-lb-next]')) { lbStep(1); return; }
    if ((el = hit('[data-lb-thumb]'))) { lbShow(Number(el.dataset.lbThumb)); return; }
    if (hit('[data-lb-book]')) {
      const id = lb.id;
      closeOverlay(lb.el, { restore: false });
      if (!state.vehicles.includes(id)) toggleVehicle(id, true);
      // Étapes obligatoires d'abord ; sinon le forfait s'il n'est pas encore choisi, puis les coordonnées
      const s = firstIncompleteBeforeSend();
      goStep(s === 6 && !state.forfait ? 5 : s, { scroll: true });
      return;
    }

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

    if (hit('[data-regen]')) {
      update({ edited: false, message: buildMessage() });
      f.message.focus();
      announce('Votre demande a été mise à jour d’après vos choix.');
      return;
    }

    if ((el = hit('[data-focus-field]'))) {
      e.preventDefault();
      const target = document.getElementById(el.dataset.focusField);
      if (target) target.focus();
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
  const TEXT_FIELDS = { name: f.name, phone: f.phone, email: f.email, forfaitAutre: f.forfaitAutre };
  form.addEventListener('input', e => {
    if (e.target.matches('[data-trip-addr]')) { onTripInput(e.target); return; }
    const patch = {};
    Object.entries(TEXT_FIELDS).forEach(([key, el]) => { if (el.value !== state[key]) patch[key] = el.value; });
    if (e.target === f.message) {
      const v = f.message.value;
      patch.message = v;
      patch.edited = v.trim() !== '' && v !== buildMessage();
    }
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
  const OPEN = { 1: [510, 1350], 2: [510, 1350], 3: [510, 1350], 4: [510, 1350], 5: [510, 1350], 6: [570, 1410] };
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
    $('span', status).textContent = isOpen ? 'Ouvert actuellement' : 'Fermé actuellement';
  }
  renderHours();
  setInterval(renderHours, 60000);

  /* ==========================================================================
     Initialisation
     ========================================================================== */
  restore();
  if (!state.edited) state.message = buildMessage();
  calViewFromState();
  setFilter('all', false);
  render();
  goStep(1, { focus: false });
  trayEl.hidden = false;
  $$('[data-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });

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
