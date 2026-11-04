/* Short first-visit intro for the project pages (about 2 seconds).
 *
 *   <link rel="stylesheet" href="../assets/page-intro.css">
 *   <script src="../assets/page-intro.js" data-intro="title"></script>     (classic script in <head>, not defer)
 *
 * data-intro: "title" (a clean reveal of the page's own heading), "hole" (Miacomet hole 10, from
 * continuum/hole) or "campus" (the SwapChain campus map, from swapchain/app). The 3D modules live in
 * assets/page-intro/ and load only when the intro will actually play.
 *
 * Plays once per page per browser session (sessionStorage). Never with a #hash or ?nointro, never under
 * reduced motion; the 3D intros are skipped where WebGL2 is missing. It starts after the desk transition
 * finishes: a cross-document view transition (pagereveal), or window.deskTransitionDone (a promise),
 * or the "desk:done" event while <html> has the class "desk-busy". Skip pill, any key, click, wheel,
 * touch or scroll skips it. The page under it is the finished page: the overlay only fades away.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || !window.Promise || !window.URL) return;
  var html = document.documentElement;
  var asked = (script.getAttribute('data-intro') || 'title').toLowerCase();
  var BASE = new URL('.', script.src).href;
  var KEY = 'pageIntro:' + location.pathname.replace(/index\.html?$/, '');
  var TEST = window.__PI_TEST || null; // screenshots: { hold: true } and drive it with __pageIntro.hold(t)
  var q = new URLSearchParams(location.search);
  var DECK_URL = BASE + '../swapchain/app/vendor/deck.gl-9.1.14.min.js';
  var MODULES = { hole: 'page-intro/hole.js', campus: 'page-intro/campus.js' };

  // ---------------------------------------------------------------- should it play at all
  function storageOK() {
    try { return !sessionStorage.getItem(KEY); } catch (e) { return false; } // no storage: we could not remember, so never
  }
  function webgl2() {
    try {
      var c = document.createElement('canvas'), g = c.getContext('webgl2');
      if (!g) return false;
      var x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext();
      return true;
    } catch (e) { return false; }
  }
  if (q.has('nointro')) return;
  if (location.hash && location.hash.length > 1) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!TEST && !storageOK()) return;
  var mode = MODULES[asked] ? asked : 'title';
  if (mode !== 'title') {
    if (!webgl2()) return; // no WebGL: no intro (the page itself has its own fallbacks)
    var c = navigator.connection || {};
    if (c.saveData || ['slow-2g', '2g'].indexOf(c.effectiveType) > -1) mode = 'title';
  }
  try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* checked above */ }

  html.classList.add('pi-on');
  if (mode !== 'title') html.classList.add('pi-3d');

  // ---------------------------------------------------------------- start loading the 3D now (lazy: only when it plays)
  function loadDeck() {
    if (window.deck) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = DECK_URL; s.async = true;
      s.onload = function () { window.deck ? res() : rej(new Error('deck.gl missing')); };
      s.onerror = function () { rej(new Error('deck.gl failed to load')); };
      document.head.appendChild(s);
    });
  }
  var modP = mode === 'title' ? null : loadDeck().then(function () { return import(BASE + MODULES[mode]); });
  if (modP) modP.catch(function () { /* handled at mount */ });

  // ---------------------------------------------------------------- input skips (before and during)
  var state = 'wait'; // wait, run, done
  var startY = 0;
  var EVENTS = ['keydown', 'wheel', 'touchmove', 'pointerdown', 'scroll'];
  function onInput(e) {
    if (TEST) return;
    if (e.type === 'keydown' && (e.metaKey || e.ctrlKey || e.altKey) && e.key !== 'Escape') return;
    if (e.type === 'keydown' && /^(Shift|Control|Alt|Meta|CapsLock)$/.test(e.key)) return;
    if (e.type === 'scroll' && Math.abs((window.scrollY || 0) - startY) < 3) return;
    finish(true);
  }
  EVENTS.forEach(function (ev) { addEventListener(ev, onInput, { capture: true, passive: true }); });

  // ---------------------------------------------------------------- wait for the desk transition
  var vtFinished = null;
  addEventListener('pagereveal', function (e) {
    if (e.viewTransition && e.viewTransition.finished) vtFinished = e.viewTransition.finished;
  }, { once: true });
  function whenRevealed(go) {
    var fired = false;
    function once() { if (!fired) { fired = true; go(); } }
    setTimeout(once, 4000); // never wait longer than this on a transition
    // two frames after parsing: pagereveal has fired by then if the browser has it
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      var waits = [];
      if (vtFinished) waits.push(vtFinished);
      var d = window.deskTransitionDone;
      if (d && typeof d.then === 'function') waits.push(d);
      if (html.classList.contains('desk-busy')) waits.push(new Promise(function (r) { document.addEventListener('desk:done', r, { once: true }); }));
      if (!waits.length) return once();
      Promise.all(waits.map(function (p) { return Promise.resolve(p).catch(function () {}); })).then(once);
    }); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { whenRevealed(mount); }, { once: true });
  else whenRevealed(mount);

  // ---------------------------------------------------------------- the overlay
  var ov, bg, stage, scrim, titles, skip, scene = null, raf = 0, t0 = 0, mo = null;
  var clones = []; // { wrap, inner, kind }
  var phone = matchMedia('(max-width: 760px)').matches;
  var dark = function () { return html.getAttribute('data-theme') === 'dark'; };
  var readyResolve;
  var readyP = new Promise(function (r) { readyResolve = r; });

  // timeline (seconds)
  var TL = {
    title: { end: 1.9, kick: [0.08, 0.6], head: [0.14, 0.78], out: [1.35, 1.9] },
    // 3D: the map fades back to the ground color first, then the ground color fades to the page,
    // so the map and the page never show through each other
    '3d': { end: 2.3, stage: [0, 0.35], sweep: 1.95, scrim: [0.55, 1.1], kick: [0.62, 1.12], head: [0.72, 1.3], fade3d: [1.5, 1.92], out: [1.88, 2.3] },
  };
  var run = null; // the active timeline

  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  var COPY = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing', 'color',
    'text-transform', 'font-variant-numeric', 'font-feature-settings', 'white-space', 'text-decoration-line', 'display', 'gap',
    'align-items', 'flex-wrap', '-webkit-font-smoothing', 'text-align', 'font-optical-sizing'];
  function copyStyles(src, dst) {
    var cs = getComputedStyle(src);
    for (var i = 0; i < COPY.length; i++) { var v = cs.getPropertyValue(COPY[i]); if (v) dst.style.setProperty(COPY[i], v); }
    for (var a = src.firstElementChild, b = dst.firstElementChild; a && b; a = a.nextElementSibling, b = b.nextElementSibling) copyStyles(a, b);
  }
  function cloneOver(src, kind) {
    if (!src) return;
    var r = src.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var inView = r.bottom > 0 && r.top < innerHeight;
    var c = src.cloneNode(true);
    c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
    c.querySelectorAll('a').forEach(function (a) { a.removeAttribute('href'); a.setAttribute('tabindex', '-1'); });
    copyStyles(src, c);
    var pad = kind === 'head' ? Math.max(6, parseFloat(getComputedStyle(src).fontSize) * 0.22) : 4;
    var wrap = el('div', 'pi-clip');
    var top = inView ? r.top : innerHeight * 0.4 + (kind === 'head' ? 30 : 0);
    wrap.style.cssText = 'left:' + (r.left - pad) + 'px;top:' + (top - pad) + 'px;width:' + (r.width + 2 * pad) + 'px;height:' + (r.height + 2 * pad) + 'px;padding:' + pad + 'px';
    c.style.width = r.width + 'px';
    wrap.appendChild(c);
    titles.appendChild(wrap);
    clones.push({ wrap: wrap, inner: c, kind: kind, stays: inView });
  }

  function mount() {
    if (state !== 'wait') return;
    state = 'run';
    startY = window.scrollY || 0;
    ov = el('div', 'pi' + (mode !== 'title' ? ' pi-3d' : '') + (dark() ? ' pi-dark' : ''));
    bg = el('div', 'pi-bg'); stage = el('div', 'pi-stage'); scrim = el('div', 'pi-scrim'); titles = el('div', 'pi-title');
    [bg, stage, scrim, titles].forEach(function (n) { n.setAttribute('aria-hidden', 'true'); });
    skip = el('button', 'pi-skip'); skip.type = 'button'; skip.textContent = 'Skip intro';
    skip.addEventListener('click', function () { finish(true); });
    ov.append(bg, stage, scrim, titles, skip);
    html.appendChild(ov); // outside <body>, like the room intro
    html.classList.remove('pi-on');

    var sel = script.getAttribute('data-title');
    var h1 = (sel && document.querySelector(sel)) || document.querySelector('.page-hero h1') || document.querySelector('main h1, h1');
    var hero = h1 && (h1.closest('.page-hero') || h1.parentElement);
    cloneOver(hero && hero.querySelector('.kicker'), 'kick');
    cloneOver(h1, 'head');
    apply(0, TL.title); // everything hidden, background up

    mo = new MutationObserver(function () {
      ov.classList.toggle('pi-dark', dark());
      if (scene && scene.setTheme) scene.setTheme(dark());
    });
    mo.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    addEventListener('resize', onResize);

    if (mode === 'title') return begin(TL.title);
    var cap = TEST ? 60000 : 1200; // the 3D gets this long to be ready, else the title reveal plays
    var timer = new Promise(function (r) { setTimeout(function () { r(null); }, cap); });
    var made = modP.then(function (m) {
      return m.create({ host: stage, dark: dark(), phone: phone, width: innerWidth, height: innerHeight });
    });
    Promise.race([made.catch(function (e) { console.warn('page intro:', e && e.message); return null; }), timer]).then(function (s) {
      if (state !== 'run') { if (s) s.dispose(); return; }
      if (!s) {
        made.then(function (late) { if (late && late !== scene) late.dispose(); }, function () {});
        mode = 'title'; ov.classList.remove('pi-3d'); return begin(TL.title);
      }
      scene = s;
      begin(TL['3d']);
    });
  }
  var onResize = function () { if (!TEST) finish(true); };

  function begin(tl) {
    run = tl;
    readyResolve(mode);
    if (TEST && TEST.hold) return hold(0);
    t0 = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = 0;
    if (state !== 'run') return;
    var t = (now - t0) / 1000;
    apply(t, run);
    if (t >= run.end) return finish(false);
    raf = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- one frame of the timeline
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var span = function (t, a) { return clamp((t - a[0]) / (a[1] - a[0])); };
  var easeOut = function (x) { return 1 - Math.pow(1 - x, 3); };
  var smooth = function (x) { return x * x * (3 - 2 * x); };
  function apply(t, tl) {
    var out = smooth(span(t, tl.out));
    bg.style.opacity = 1 - out;
    skip.style.opacity = 1 - out;
    var drawn = null;
    if (tl.sweep && scene) {
      var gone3d = smooth(span(t, tl.fade3d));
      stage.style.opacity = smooth(span(t, tl.stage)) * (1 - gone3d);
      scrim.style.opacity = smooth(span(t, tl.scrim)) * (1 - gone3d);
      drawn = scene.frame(clamp(t / tl.sweep), t);
    } else { stage.style.opacity = 0; scrim.style.opacity = 0; }
    for (var i = 0; i < clones.length; i++) {
      var k = clones[i], p = easeOut(span(t, k.kind === 'head' ? tl.head : tl.kick));
      var em = k.kind === 'head' ? 0.42 : 0.6; // in em of the element
      k.inner.style.transform = 'translate3d(0,' + ((1 - p) * em).toFixed(4) + 'em,0)';
      k.inner.style.opacity = (p * (k.stays ? 1 : 1 - out)).toFixed(4);
    }
    return drawn;
  }

  function finish(skipped) {
    if (state === 'done') return;
    var was = state;
    state = 'done';
    if (raf) cancelAnimationFrame(raf);
    EVENTS.forEach(function (ev) { removeEventListener(ev, onInput, { capture: true }); });
    removeEventListener('resize', onResize);
    if (mo) mo.disconnect();
    html.classList.remove('pi-on', 'pi-3d');
    readyResolve(mode);
    if (was === 'wait' || !ov) return; // skipped before it began: just drop the cover
    if (skipped) ov.classList.add('is-out');
    var gone = function () { if (ov) ov.remove(); ov = null; if (scene) { try { scene.dispose(); } catch (e) {} scene = null; } };
    // a finished run has already faded to the page: the copies sit exactly on the real heading
    setTimeout(gone, skipped ? 260 : 0);
  }

  // ---------------------------------------------------------------- hooks for screenshots and tests
  function hold(t) {
    if (state !== 'run' || !run) return Promise.resolve(false);
    var p = apply(t, run);
    return Promise.resolve(p).then(function () {
      return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { r(true); }); }); });
    });
  }
  window.__pageIntro = {
    get mode() { return mode; },
    get state() { return state; },
    get timeline() { return run; },
    ready: readyP,
    hold: hold,
    skip: function () { finish(true); },
  };
})();
