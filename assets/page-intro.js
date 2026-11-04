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
 * reduced motion; the 3D intros are skipped where WebGL2 is missing (or on save-data, 2g and 3g).
 * It mounts before the page's first frame when a desk transition arrives (pagereveal), so the heading
 * already animates inside the monitor while the page zooms in; the clock starts 0.2s into the
 * transition. Pages add <link rel="expect" href="#<h1 id>" blocking="render"> so the heading exists by
 * then. The title reveal plays over the real page (only its kicker and heading wait hidden); the 3D
 * intros sit on the map ground, which blends to the page color before it fades. Skip pill, any key,
 * click, wheel, touch or scroll skips it. The page under it is the finished page.
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
    if (c.saveData || ['slow-2g', '2g', '3g'].indexOf(c.effectiveType) > -1) mode = 'title';
  }
  try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* checked above */ }

  html.classList.add('pi-on', 'pi-cover');
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

  // ---------------------------------------------------------------- mount as early as possible
  // With a desk transition arriving, mount at pagereveal (before the new page's first frame) so the
  // overlay is part of what slides in, and the heading reveal plays live inside the monitor.
  var vtFinished = null, lag = 0;
  function tryMount() {
    if (state !== 'wait') return;
    var sel = script.getAttribute('data-title');
    var h = (sel && document.querySelector(sel)) || document.querySelector('.page-hero h1');
    if (h || document.readyState !== 'loading') mount();
  }
  addEventListener('pagereveal', function (e) {
    var vt = e.viewTransition;
    if (vt && vt.finished) {
      vtFinished = vt.finished.catch(function () {});
      lag = 0.2; // the intro picks up as the page zooms back in
      if (vt.ready) vt.ready.catch(function () { lag = 0; vtFinished = null; }); // skipped
    }
    tryMount();
  }, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryMount, { once: true });
  else setTimeout(tryMount, 0);

  // ---------------------------------------------------------------- the overlay
  var ov, bg, stage, scrim, titles, skip, scene = null, raf = 0, t0 = 0, t3 = 0, mo = null, w0 = 0;
  var groundRGB = null, pageRGB = null;
  var clones = []; // { wrap, inner, kind }
  var phone = matchMedia('(max-width: 760px)').matches;
  var dark = function () { return html.getAttribute('data-theme') === 'dark'; };
  var readyResolve;
  var readyP = new Promise(function (r) { readyResolve = r; });

  // timeline (seconds)
  var TL = {
    title: { end: 1.1, kick: [0, 0.35], head: [0.05, 0.5], out: [0.6, 1.1] },
    // 3D, from the moment the scene is ready (the title has been revealing over the ground meanwhile):
    // the map fades back to the ground, the ground blends to the page color, then the overlay fades,
    // so the map and the page never show through each other and no color jumps
    '3d': { end: 1.8, stage: [0, 0.18], sweep: 1.5, scrim: [0, 0.18], fade3d: [1.15, 1.45], out: [1.4, 1.8] },
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
    clones.push({ wrap: wrap, inner: c, kind: kind, stays: inView, src: src, pad: pad });
  }

  // web fonts can land after mount: keep the copies exactly on the real kicker and heading
  function replace() {
    for (var i = 0; i < clones.length; i++) {
      var k = clones[i]; if (!k.stays) continue;
      var r = k.src.getBoundingClientRect(); if (!r.width) continue;
      k.wrap.style.left = (r.left - k.pad) + 'px'; k.wrap.style.top = (r.top - k.pad) + 'px';
      k.wrap.style.width = (r.width + 2 * k.pad) + 'px'; k.wrap.style.height = (r.height + 2 * k.pad) + 'px';
      k.inner.style.width = r.width + 'px';
    }
  }
  function rgbOf(v) {
    var n = el('div'); n.style.cssText = 'position:absolute;visibility:hidden;color:' + v;
    html.appendChild(n); var m = getComputedStyle(n).color.match(/[\d.]+/g); n.remove();
    return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : null;
  }
  function colors() {
    groundRGB = dark() ? [18, 14, 36] : [239, 234, 227];
    pageRGB = rgbOf('var(--bg)') || groundRGB;
  }

  function mount() {
    if (state !== 'wait') return;
    state = 'run';
    startY = window.scrollY || 0;
    w0 = innerWidth;
    colors();
    ov = el('div', 'pi' + (mode !== 'title' ? ' pi-3d' : '') + (dark() ? ' pi-dark' : ''));
    bg = el('div', 'pi-bg'); stage = el('div', 'pi-stage'); scrim = el('div', 'pi-scrim'); titles = el('div', 'pi-title');
    [bg, stage, scrim, titles].forEach(function (n) { n.setAttribute('aria-hidden', 'true'); });
    skip = el('button', 'pi-skip'); skip.type = 'button'; skip.textContent = 'Skip intro';
    skip.addEventListener('click', function () { finish(true); });
    ov.append(bg, stage, scrim, titles, skip);
    html.appendChild(ov); // outside <body>, like the room intro
    html.classList.remove('pi-cover'); // pi-on stays: the real kicker and heading wait under the copies

    var sel = script.getAttribute('data-title');
    var h1 = (sel && document.querySelector(sel)) || document.querySelector('.page-hero h1') || document.querySelector('main h1, h1');
    var hero = h1 && (h1.closest('.page-hero') || h1.parentElement);
    cloneOver(hero && hero.querySelector('.kicker'), 'kick');
    cloneOver(h1, 'head');
    apply(-1, TL.title); // everything hidden, background up
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (state === 'run') replace(); });
    addEventListener('load', function () { if (state === 'run') replace(); }, { once: true });

    mo = new MutationObserver(function () {
      ov.classList.toggle('pi-dark', dark());
      colors();
      if (scene && scene.setTheme) scene.setTheme(dark());
    });
    mo.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    addEventListener('resize', onResize);

    if (mode === 'title') return begin(TL.title);
    // 3D: the title reveals over the ground right away; the map joins as soon as it is ready. It gets
    // 600ms, or until the desk transition ends if that is later, else the title reveal finishes alone.
    begin(null);
    var cap = TEST ? 60000 : 600;
    var timer = new Promise(function (r) { setTimeout(r, cap); });
    var deadline = Promise.all([timer, vtFinished || null]).then(function () { return null; });
    var made = modP.then(function (m) {
      return m.create({ host: stage, dark: dark(), phone: phone, width: innerWidth, height: innerHeight });
    });
    Promise.race([made.catch(function (e) { console.warn('page intro:', e && e.message); return null; }), deadline]).then(function (s) {
      if (state !== 'run') { if (s) s.dispose(); return; }
      if (!s) {
        made.then(function (late) { if (late && late !== scene) late.dispose(); }, function () {});
        // finish as the title reveal: the ground blends to the page color, then the overlay fades
        var tf = Math.max(TL.title.out[0], now());
        run = { end: tf + 0.45, kick: TL.title.kick, head: TL.title.head, fade3d: [tf, tf + 0.3], out: [tf + 0.15, tf + 0.45] };
        readyResolve('title');
        return;
      }
      scene = s;
      t3 = TEST && TEST.hold ? 0 : now();
      run = TL['3d'];
      readyResolve(mode);
    });
  }
  // mobile toolbars and split view settling fire resize too: only a real width change ends it
  var onResize = function () { if (!TEST && Math.abs(innerWidth - w0) > 40) finish(true); };

  // tl null: a 3D intro waiting for its scene (the title reveals meanwhile, nothing ends)
  var WAIT = { end: Infinity, kick: TL.title.kick, head: TL.title.head, out: [1e9, 1e9 + 1] };
  function now() { return (performance.now() - t0) / 1000 - lag; }
  function begin(tl) {
    run = tl || WAIT;
    if (tl) readyResolve(mode);
    t0 = performance.now();
    if (TEST && TEST.hold) return;
    raf = requestAnimationFrame(tick);
  }
  function tick() {
    raf = 0;
    if (state !== 'run') return;
    var t = now();
    apply(t, run);
    if (t >= (run === TL['3d'] ? t3 + run.end : run.end)) return finish(false);
    raf = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- one frame of the timeline
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var span = function (t, a) { return clamp((t - a[0]) / (a[1] - a[0])); };
  var easeOut = function (x) { return 1 - Math.pow(1 - x, 3); };
  var smooth = function (x) { return x * x * (3 - 2 * x); };
  function mix(a, b, u) { return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * u) + ',' + Math.round(a[1] + (b[1] - a[1]) * u) + ',' + Math.round(a[2] + (b[2] - a[2]) * u) + ')'; }
  function apply(t, tl) {
    var is3d = tl === TL['3d'];
    var tt = is3d ? t - t3 : t; // the 3D parts run on the scene's clock, the title on the page's
    var out = smooth(span(tt, tl.out));
    bg.style.opacity = 1 - out;
    skip.style.opacity = 1 - out;
    var drawn = null;
    if (mode !== 'title' && groundRGB) {
      var blend = tl.fade3d ? smooth(span(tt, tl.fade3d)) : 0;
      bg.style.background = mix(groundRGB, pageRGB, blend);
    }
    if (is3d && scene) {
      var gone3d = smooth(span(tt, tl.fade3d));
      stage.style.opacity = smooth(span(tt, tl.stage)) * (1 - gone3d);
      scrim.style.opacity = smooth(span(tt, tl.scrim)) * (1 - gone3d);
      drawn = scene.frame(clamp(tt / tl.sweep), tt);
    } else { stage.style.opacity = 0; scrim.style.opacity = 0; }
    for (var i = 0; i < clones.length; i++) {
      var k = clones[i], p = easeOut(span(t, k.kind === 'head' ? TL.title.head : TL.title.kick));
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
    html.classList.remove('pi-on', 'pi-cover', 'pi-3d');
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
    var p = apply(run === TL['3d'] ? t3 + t : t, run);
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
