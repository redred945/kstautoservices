/* ==========================================================================
   KST AutoServices — app.js
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
    telHuman: '06 48 48 05 58',
    wa: 'https://wa.me/33648480558'
  };
  const STORE_KEY = 'kst-demande-v1';
  const WEB3FORMS_URL = 'https://api.web3forms.com/submit';
  const VIDEO_SRC = 'assets/img/Home/video-presentation.mp4';

  /* ---------- Utilitaires ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smooth = () => (RM ? 'auto' : 'smooth');

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

  /* ==========================================================================
     État & persistance
     ========================================================================== */
  const DEFAULTS = () => ({
    occasion: '', city: '', mode: 'single', start: '', end: '', time: '',
    vehicles: [], name: '', email: '', phone: '', message: '', edited: false
  });
  const state = DEFAULTS();
  const CHOICE_KEYS = ['occasion', 'city', 'mode', 'start', 'end', 'time', 'vehicles'];

  function restore() {
    const s = storage.get();
    if (!s || typeof s !== 'object') return;
    if (OCC[s.occasion]) state.occasion = s.occasion;
    state.city = str(s.city, 80);
    if (s.mode === 'range') state.mode = 'range';
    if (isISO(s.start) && s.start >= TODAY) {
      state.start = s.start;
      if (state.mode === 'range' && isISO(s.end) && s.end > s.start) state.end = s.end;
    }
    if (typeof s.time === 'string' && /^\d{2}:\d{2}$/.test(s.time)) state.time = s.time;
    if (Array.isArray(s.vehicles)) state.vehicles = s.vehicles.filter((id, i, a) => vehicles[id] && a.indexOf(id) === i);
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
  function buildMessage() {
    let s = 'Bonjour, je souhaite une demande de devis pour ' + (OCC[state.occasion] ? OCC[state.occasion].phrase : 'une location de voiture de luxe');
    const d = dateClause();
    if (d) s += ' ' + d;
    if (state.city.trim()) s += ' à ' + state.city.trim();
    if (state.vehicles.length) s += ', avec ' + joinList(state.vehicles.map(id => 'la ' + vehicles[id].full));
    s += ', avec chauffeur.';
    if (state.time) s += ` Prise en charge souhaitée à ${timeLabel(state.time)}.`;
    return s;
  }
  function joinList(list) {
    if (list.length < 2) return list[0] || '';
    return list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
  }
  const countText = n => (n === 0 ? 'Aucun véhicule sélectionné' : n === 1 ? '1 véhicule sélectionné' : `${n} véhicules sélectionnés`);

  function update(patch) {
    Object.assign(state, patch);
    const keys = Object.keys(patch);
    if (!state.edited && keys.some(k => CHOICE_KEYS.includes(k))) state.message = buildMessage();
    persist();
    render(keys);
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
    city: $('#f-city'), time: $('#f-time'), name: $('#f-name'),
    phone: $('#f-phone'), email: $('#f-email'), message: $('#f-message'),
    website: form.elements.website
  };
  const regenBtn = $('[data-regen]', form);
  const alertBox = $('[data-form-alert]', form);
  const submitBtn = $('[data-submit]', form);
  const whatsappLinks = $$('[data-whatsapp]');
  let step = 1;
  let sending = false;

  /* Heures de prise en charge : pas de 30 minutes */
  (function buildTimes() {
    let html = '<option value="">Non précisée</option>';
    for (let m = 0; m < 24 * 60; m += 30) {
      const v = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      html += `<option value="${v}">${pad(Math.floor(m / 60))}h${pad(m % 60)}</option>`;
    }
    f.time.innerHTML = html;
  })();

  /* Vignettes de l'étape 3 */
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

  function renderRecap() {
    setR('occasion', OCC[state.occasion] ? OCC[state.occasion].label : '', 'Votre occasion');
    setR('city', state.city.trim(), 'Ville de l’événement');
    setR('date', dateSummary(), 'La date de votre événement');
    $('[data-r="vehicles"]', recapEl).innerHTML = state.vehicles.length
      ? state.vehicles.map(id => `<li><span>${esc(vehicles[id].full)}</span><button type="button" class="recap__x" data-remove="${id}" aria-label="Retirer ${esc(vehicles[id].full)} de ma demande"><svg class="ico" aria-hidden="true"><use href="#i-close"/></svg></button></li>`).join('')
      : '<li class="is-empty">Sélectionnez un ou plusieurs véhicules</li>';
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
    if (state.city.trim()) items.push([1, 'i-pin', state.city.trim()]);
    if (state.start) items.push([2, 'i-cal', dateSummary()]);
    if (state.vehicles.length) items.push([3, 'i-wheel', state.vehicles.length === 1 ? vehicles[state.vehicles[0]].full : `${state.vehicles.length} véhicules`]);
    $('[data-mini-recap]', form).innerHTML = items.map(([s, ico, text]) =>
      `<button type="button" class="mini" data-goto-step="${s}"><svg class="ico" aria-hidden="true"><use href="#${ico}"/></svg>${esc(text)}</button>`
    ).join('');
  }

  const setVal = (el, v) => { if (el.value !== v) el.value = v; };

  function renderFields() {
    $$('input[name="occasion"]', form).forEach(i => { i.checked = i.value === state.occasion; });
    $$('input[name="mode"]', form).forEach(i => { i.checked = i.value === state.mode; });
    setVal(f.city, state.city);
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

  const stepDone = n => (n === 1 ? !!(state.occasion || state.city.trim())
    : n === 2 ? !!state.start
      : n === 3 ? state.vehicles.length > 0
        : !!(state.name.trim() && state.email.trim() && state.phone.trim()));

  function renderStepper() {
    stepBtns.forEach(b => {
      const n = Number(b.dataset.stepBtn);
      b.dataset.done = String(stepDone(n));
      if (n === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    stepFill.style.width = `${step * 25}%`;
  }

  function render(keys) {
    const has = (...k) => !keys || k.some(x => keys.includes(x));
    if (has('vehicles')) { renderFleet(); renderTiles(); renderCounts(); renderTray(); }
    if (has('mode', 'start', 'end')) renderCalendar();
    renderFields();
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

  function goStep(n, { scroll = false, focus = true } = {}) {
    n = Math.min(4, Math.max(1, Number(n) || 1));
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

  const firstIncompleteBeforeSend = () => (!state.occasion ? 1 : !state.start ? 2 : 4);

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
      ville: state.city.trim(),
      date: state.start ? (state.end ? `Du ${rangeText(state.start, state.end)}` : longDate(state.start)) : '',
      heure: state.time ? timeLabel(state.time) : '',
      vehicules: state.vehicles.map(id => vehicles[id].full).join(', ')
    };
  }

  function mailSubject(d) {
    return `Demande de devis KST AutoServices${d.occasion ? ' – ' + d.occasion : ''}${d.date ? ' – ' + d.date : ''}`;
  }
  function mailBody(d) {
    const lines = [d.message, '', '—', `Nom : ${d.nom}`, `Téléphone : ${d.telephone}`, `E-mail : ${d.email}`];
    if (d.occasion) lines.push(`Occasion : ${d.occasion}`);
    if (d.ville) lines.push(`Ville de l'événement : ${d.ville}`);
    if (d.date) lines.push(`Date : ${d.date}`);
    if (d.heure) lines.push(`Heure de prise en charge : ${d.heure}`);
    if (d.vehicules) lines.push(`Véhicules : ${d.vehicules}`);
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
      text: 'Merci. Votre demande a bien été transmise à KST AutoServices. Sous réserve de disponibilité, confirmée par KST AutoServices.',
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
      from_name: 'Site KST AutoServices',
      name: d.nom,
      email: d.email,
      telephone: d.telephone,
      message: d.message,
      occasion: d.occasion,
      ville: d.ville,
      date_evenement: d.date,
      heure_prise_en_charge: d.heure,
      vehicules: d.vehicules
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
    if (step !== 4) { goStep(step + 1, { scroll: 'auto' }); return; }
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
      goStep(firstIncompleteBeforeSend(), { scroll: true });
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
      const next = $('[data-r="vehicles"] .recap__x', recapEl) || $('.fp__edit [data-goto-step="3"]', recapEl);
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

    if (hit('[data-next]')) { goStep(step + 1, { scroll: 'auto' }); return; }
    if (hit('[data-prev]')) { goStep(step - 1, { scroll: 'auto' }); return; }
    if ((el = hit('[data-step-btn]'))) { goStep(el.dataset.stepBtn, { scroll: 'auto' }); return; }

    if (hit('[data-recap-open]')) { openRecap(); return; }
    if (hit('[data-recap-close]') || hit('[data-recap-backdrop]')) { closeOverlay(recapEl); return; }

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
      if (action === 'edit') goStep(4, { scroll: 'auto' });
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
  const TEXT_FIELDS = { city: f.city, name: f.name, phone: f.phone, email: f.email };
  form.addEventListener('input', e => {
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
    else if (t === f.time) update({ time: t.value });
    else if (t.name === 'vehicule') toggleVehicle(t.value, t.checked);
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
  window.__kstReady = true;
})();
