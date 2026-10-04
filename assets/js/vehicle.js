/* ==========================================================================
   KST Auto Loc’ — vehicle.js
   Script des pages /nos-vehicules/<slug>/ (galerie, agrandissement, partage).
   JS vanille, sans dépendance. Volontairement séparé d'app.js, qui suppose le DOM
   de l'accueil (formulaire, flotte…) et ne doit pas être chargé sur ces pages.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const onFrame = fn => {
    let ticking = false;
    return () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; fn(); });
    };
  };

  $$('[data-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });

  /* ==========================================================================
     Galerie : rangée à défilement natif (scroll-snap), flèches, vignettes
     ========================================================================== */
  const track = $('[data-track]');
  const slides = track ? $$('.vp-slide', track) : [];
  const thumbs = $$('[data-thumb]');
  const thumbRow = thumbs.length ? thumbs[0].closest('.vp-thumbs') : null;
  const curEl = $('[data-cur]');
  const total = slides.length;
  let idx = 0;

  function setIndex(i) {
    if (i === idx) return;
    idx = i;
    thumbs.forEach((b, k) => { if (k === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    if (curEl) curEl.textContent = String(i + 1);
    // la vignette active reste visible dans la rangée (sans faire défiler la page)
    const t = thumbs[i];
    if (t && thumbRow && thumbRow.scrollWidth > thumbRow.clientWidth) {
      const left = t.offsetLeft - (thumbRow.clientWidth - t.offsetWidth) / 2;
      thumbRow.scrollTo({ left, behavior: RM ? 'auto' : 'smooth' });
    }
  }

  function goTo(i, instant) {
    if (!track || !total) return;
    const n = (i + total) % total;
    track.scrollTo({ left: n * track.clientWidth, behavior: instant || RM ? 'auto' : 'smooth' });
    if (instant) setIndex(n);
  }

  if (track && total) {
    track.addEventListener('scroll', onFrame(() => {
      setIndex(Math.max(0, Math.min(total - 1, Math.round(track.scrollLeft / (track.clientWidth || 1)))));
    }), { passive: true });
    window.addEventListener('resize', onFrame(() => { track.scrollLeft = idx * track.clientWidth; }));
    thumbs.forEach((b, k) => b.addEventListener('click', () => goTo(k)));
    const prev = $('[data-prev]'), next = $('[data-next]');
    if (prev) prev.addEventListener('click', () => goTo(idx - 1));
    if (next) next.addEventListener('click', () => goTo(idx + 1));
  }

  /* Indicateur discret de progression (mobile) sous les rangées glissables */
  $$('[data-progress]').forEach(bar => {
    const row = document.getElementById(bar.dataset.progress);
    const thumb = $('span', bar);
    if (!row || !thumb) return;
    function update() {
      const max = row.scrollWidth - row.clientWidth;
      if (max <= 2) { bar.hidden = true; return; }
      bar.hidden = false;
      const ratio = row.clientWidth / row.scrollWidth;
      thumb.style.width = `${ratio * 100}%`;
      thumb.style.transform = `translateX(${(row.scrollLeft / max) * (1 / ratio - 1) * 100}%)`;
    }
    row.addEventListener('scroll', onFrame(update), { passive: true });
    window.addEventListener('resize', onFrame(update));
    window.addEventListener('load', update);
    update();
  });

  /* ==========================================================================
     Agrandissement plein écran : Échap, flèches, Début/Fin, swipe,
     focus piégé, fond inerte, retour du focus
     ========================================================================== */
  const lb = {
    el: $('[data-lb]'),
    frame: $('[data-lb-frame]'),
    img: null,   // créée à la première ouverture (pas d'<img> vide dans la page)
    cap: $('[data-lb-cap]'),
    count: $('[data-lb-count]'),
    stage: $('[data-lb-stage]'),
    close: $('[data-lb-close]'),
    i: 0, opener: null, bg: [], isOpen: false
  };
  const photos = slides.map(s => { const im = $('.vp-slide__open img', s); return { src: im.getAttribute('src'), alt: im.getAttribute('alt') || '' }; });

  function lbShow(i) {
    if (!lb.img) {
      lb.img = document.createElement('img');
      lb.img.decoding = 'async';
      lb.img.alt = '';
      lb.frame.append(lb.img);
    }
    lb.i = (i + photos.length) % photos.length;
    const p = photos[lb.i];
    lb.img.src = p.src;
    lb.img.alt = p.alt;
    lb.cap.textContent = p.alt;
    lb.count.textContent = `Photo ${lb.i + 1} sur ${photos.length}`;
    if (photos.length > 1) new Image().src = photos[(lb.i + 1) % photos.length].src;   // précharge la suivante
  }
  const lbStep = d => { if (photos.length > 1) lbShow(lb.i + d); };

  function lbOpen(i, opener) {
    if (!lb.el || lb.isOpen || !photos.length) return;
    lb.isOpen = true;
    lb.opener = opener || document.activeElement;
    lb.bg = $$('body > *').filter(n => n !== lb.el && !/^(SCRIPT|LINK|STYLE|NOSCRIPT)$/.test(n.tagName) && !n.inert);
    lb.bg.forEach(n => { n.inert = true; });
    document.documentElement.classList.add('is-locked');
    document.body.classList.add('is-locked');
    const multi = photos.length > 1;
    $('[data-lb-prev]', lb.el).hidden = !multi;
    $('[data-lb-next]', lb.el).hidden = !multi;
    lbShow(i);
    lb.el.hidden = false;
    requestAnimationFrame(() => {
      lb.el.classList.add('is-open');
      lb.close.focus({ preventScroll: true });
    });
  }

  function lbClose() {
    if (!lb.isOpen) return;
    lb.isOpen = false;
    lb.el.classList.remove('is-open');
    lb.el.hidden = true;
    lb.bg.forEach(n => { n.inert = false; });
    lb.bg = [];
    document.documentElement.classList.remove('is-locked');
    document.body.classList.remove('is-locked');
    // la galerie se cale sur la dernière photo vue, et le focus revient sur le bouton de cette photo
    goTo(lb.i, true);
    const target = (lb.i === Number((lb.opener && lb.opener.dataset.open) || -1) ? lb.opener : $(`[data-open="${lb.i}"]`)) || lb.opener;
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
  }

  $$('[data-open]').forEach(b => b.addEventListener('click', () => lbOpen(Number(b.dataset.open), b)));
  if (lb.el) {
    $('[data-lb-close]', lb.el).addEventListener('click', lbClose);
    $('[data-lb-prev]', lb.el).addEventListener('click', () => lbStep(-1));
    $('[data-lb-next]', lb.el).addEventListener('click', () => lbStep(1));
    // un clic dans la zone sombre autour de la photo referme l'agrandissement
    lb.stage.addEventListener('click', e => { if (e.target === lb.stage || e.target === lb.frame) lbClose(); });

    lb.el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); lbClose(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); lbStep(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); lbStep(1); }
      else if (e.key === 'Home') { e.preventDefault(); lbShow(0); }
      else if (e.key === 'End') { e.preventDefault(); lbShow(photos.length - 1); }
      else if (e.key === 'Tab') {
        const list = $$('button:not([hidden])', lb.el).filter(el => !el.disabled);
        if (!list.length) { e.preventDefault(); return; }
        const first = list[0], last = list[list.length - 1], a = document.activeElement;
        if (e.shiftKey && (a === first || !lb.el.contains(a))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (a === last || !lb.el.contains(a))) { e.preventDefault(); first.focus(); }
      }
    });
    // Échap même si le focus a quitté la boîte (clic sur le fond, par exemple)
    document.addEventListener('keydown', e => { if (lb.isOpen && e.key === 'Escape' && !lb.el.contains(document.activeElement)) { e.preventDefault(); lbClose(); } });

    // swipe (tactile / stylet) ; la souris passe par les flèches et le clavier
    let sx = null, sy = null;
    lb.stage.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { sx = e.clientX; sy = e.clientY; } });
    lb.stage.addEventListener('pointerup', e => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) lbStep(dx < 0 ? 1 : -1);
    });
    lb.stage.addEventListener('pointercancel', () => { sx = null; });
  }

  /* ==========================================================================
     Partage : menu natif quand il existe (mobile), sinon copie de l'adresse
     ========================================================================== */
  const shareBtn = $('[data-share]');
  const shareStatus = $('[data-share-status]');
  let statusTimer = 0;

  function say(msg, keep) {
    if (!shareStatus) return;
    clearTimeout(statusTimer);
    shareStatus.textContent = '';
    setTimeout(() => {
      shareStatus.textContent = msg;
      if (!keep) statusTimer = setTimeout(() => { shareStatus.textContent = ''; }, 4500);
    }, 40);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* repli ci-dessous */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  if (shareBtn) {
    shareBtn.hidden = false;
    shareBtn.addEventListener('click', async () => {
      const data = { title: shareBtn.dataset.shareTitle, text: shareBtn.dataset.shareText, url: shareBtn.dataset.shareUrl };
      if (typeof navigator.share === 'function') {
        try { await navigator.share(data); return; } catch (e) {
          if (e && e.name === 'AbortError') return;   // l'utilisateur a refermé le menu de partage
        }
      }
      const ok = await copyText(data.url);
      say(ok ? 'Lien copié' : `Copie impossible. Adresse de la page : ${data.url}`, !ok);
    });
  }
})();
