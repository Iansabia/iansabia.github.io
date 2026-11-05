/* Desk transition helper (see assets/desk-transition.css). Load as a plain script in <head>,
   not defer or module, so the pagereveal listener exists before the new page's first frame.
   - Back/forward through history: mirrored slide (old page goes right, new comes from the left)
     when the history entry we land on is earlier than the one we left. Without the Navigation API
     (older Safari) each page in the tab gets a number in history.state to tell back from forward.
   - Skips the transition on reloads, links to the same page, under reduced motion, and when the
     home page room intro is about to play (html.intro-on) so the intro is never covered.
   - Warms the cache with the desk still for this theme and orientation: after load, and as soon as
     the pointer goes over or down on a link to another page here. */
(function () {
  var root = document.documentElement;
  var base = '';
  try { base = new URL('desk/', document.currentScript.src).href; } catch (e) { /* no preload */ }

  // Room intro gate (room/intro.js), on every page: the first page of a browser session plays the
  // brownstone intro, whatever page or #hash it is. Hide the page now (html.intro-on) so it never flashes;
  // assets/site-chrome.js loads the intro, which lands on this page. That page's short page intro is
  // marked as seen so the two never stack. Not in iframes, demo embeds, ?nointro, reduced motion or without WebGL.
  try {
    var q = location.search;
    if (window.top === window && !/[?&](nointro|embed)\b/.test(q) && !sessionStorage.getItem('ian-intro-played') && !(function () { try { var at = +localStorage.getItem('ian-intro-at'); return at > 0 && Date.now() - at < 864e5; } catch (e) { return false; } })() &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches && !/\/room\/?(index\.html)?$/.test(location.pathname)) {
      var c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
      if (gl) {
        var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
        root.classList.add('intro-on');
        // the intro's clock: room/intro.js fits the whole flight in about 1.5 s from here, and
        // shows the page without the 3D if three.js is not drawing by then
        window.__introT0 = performance.now();
        var hold = '1.4s';
        // the cover is the flight's opening shot (room/poster-*.webp), so the intro starts at first paint
        var room = new URL('../room/', document.currentScript.src).href;
        var cover = document.createElement('style');
        cover.textContent = 'html.intro-on.intro-on::after{content:"";position:fixed;inset:0;z-index:2147483000;' +
          'background:#EFEAE3 url(' + room + 'poster-desk-light.webp) center/cover no-repeat;pointer-events:none;' +
          'animation:ian-intro-cover .2s linear ' + hold + ' forwards}' +
          '@keyframes ian-intro-cover{from{opacity:1}to{opacity:0;visibility:hidden}}' +
          'html.intro-on.intro-on[data-theme="dark"]::after{background-color:#1A1434;background-image:url(' + room + 'poster-desk-dark.webp)}' +
          '@media (orientation:portrait){html.intro-on.intro-on::after{background-image:url(' + room + 'poster-phone-light.webp)}' +
          'html.intro-on.intro-on[data-theme="dark"]::after{background-image:url(' + room + 'poster-phone-dark.webp)}}' +
          'html.intro-on[data-theme="dark"] .ian-intro-early{background:rgba(25,19,51,.86);color:#F4F0FA;border-color:rgba(182,166,204,.22)}' +
          '.ian-intro-early{position:fixed!important;z-index:2147483002;animation:ian-intro-cover 0s linear ' + hold + ' forwards}' +
          'html:not(.intro-on) .ian-intro-early{display:none}';
        document.head.appendChild(cover);
        // fetch this visitor's poster first, so the cover is the street still, not a plain color
        var shot = document.createElement('link');
        var darkShot = false; try { darkShot = localStorage.getItem('theme') === 'dark'; } catch (e) { /* light */ }
        shot.rel = 'preload'; shot.as = 'image'; shot.setAttribute('fetchpriority', 'high');
        shot.href = room + 'poster-' + (matchMedia('(orientation: portrait)').matches ? 'phone' : 'desk') + '-' + (darkShot ? 'dark' : 'light') + '.webp';
        document.head.appendChild(shot);
        // three.js starts downloading now, while the page parses
        var pre = document.createElement('link');
        pre.rel = 'modulepreload'; pre.href = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'; pre.crossOrigin = 'anonymous';
        document.head.appendChild(pre);
        // the Skip pill shows from the first frame; it, or any key, click or scroll, skips before the intro loads.
        // room/intro.js takes over (and removes this pill) once it starts.
        var early = document.createElement('button');
        early.type = 'button'; early.className = 'ian-intro-skip ian-intro-early'; early.textContent = 'Skip intro';
        var evs = ['keydown', 'wheel', 'touchmove', 'pointerdown'];
        var off = function () {
          evs.forEach(function (ev) { removeEventListener(ev, skipEarly, true); });
          if (early.parentNode) early.parentNode.removeChild(early);
        };
        var skipEarly = function (e) {
          if (e && e.type === 'keydown' && (e.metaKey || e.ctrlKey) && e.key !== 'Escape') return;
          if (e && e.type === 'keydown' && /^( |Spacebar|PageDown|PageUp|ArrowDown|ArrowUp|Home|End)$/.test(e.key)) e.preventDefault();
          window.__introSkipped = true;
          try { sessionStorage.setItem('ian-intro-played', '1'); localStorage.setItem('ian-intro-at', String(Date.now())); } catch (err) { /* fine */ }
          root.classList.remove('intro-on');
          off();
        };
        early.addEventListener('click', skipEarly);
        evs.forEach(function (ev) { addEventListener(ev, skipEarly, { capture: true, passive: ev !== 'keydown' }); });
        window.__introEarly = { remove: off };
        root.appendChild(early);
        var css = new URL('../room/intro.css', document.currentScript.src).href;
        if (![].some.call(document.querySelectorAll('link[rel="stylesheet"]'), function (l) { return l.href === css; })) {
          var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = css; document.head.appendChild(l);
        }
        sessionStorage.setItem('pageIntro:' + location.pathname.replace(/index\.html?$/, ''), '1');
      }
    }
  } catch (e) { /* no storage: never risk an intro on every page */ }

  // number each page in this tab (only used when the Navigation API is missing)
  try {
    var st = history.state || {};
    if (st.dtI == null) {
      var m = +(sessionStorage.getItem('dtMax') || 0) + 1;
      sessionStorage.setItem('dtMax', m);
      history.replaceState(Object.assign({}, st, { dtI: m }), '');
    }
  } catch (e) { /* no storage or state: forward slide only */ }

  // skipping rejects vt.ready; swallow it so it never shows up as an uncaught error
  var skip = function (vt) {
    var no = function () {};
    try { vt.ready.catch(no); vt.updateCallbackDone && vt.updateCallbackDone.catch(no); } catch (e) { /* fine */ }
    vt.skipTransition();
  };

  addEventListener('pagereveal', function (e) {
    var vt = e.viewTransition;
    if (!vt) return;
    if (window.top !== window) { skip(vt); return; } // embedded demos (iframes) never swap
    var back = false;
    try {
      if (root.classList.contains('intro-on') || matchMedia('(prefers-reduced-motion: reduce)').matches) { skip(vt); return; }
      var a = window.navigation && navigation.activation;
      if (a) {
        if (a.navigationType === 'reload') { skip(vt); return; }
        back = a.navigationType === 'traverse' && !!a.from && !!a.entry && a.entry.index > -1 && a.from.index > -1 && a.entry.index < a.from.index;
      } else {
        var n = performance.getEntriesByType('navigation')[0];
        if (n && n.type === 'reload') { skip(vt); return; }
        try {
          var from = +sessionStorage.getItem('dtFrom');
          back = !!n && n.type === 'back_forward' && from > 0 && (history.state || {}).dtI < from;
        } catch (err) { back = false; }
      }
    } catch (err) { /* plain forward transition */ }
    if (back) root.setAttribute('data-dt-back', '');
    var done = function () { root.removeAttribute('data-dt-back'); };
    vt.finished.then(done, done);
  });

  addEventListener('pageswap', function (e) {
    try { sessionStorage.setItem('dtFrom', (history.state || {}).dtI || ''); } catch (err) { /* fine */ }
    var vt = e.viewTransition;
    if (!vt) return;
    if (window.top !== window) { skip(vt); return; }
    // a link to this same page, or to the room replay page (its own intro takes over): no desk swap
    try {
      var to = new URL(e.activation.entry.url);
      if (to.pathname === location.pathname || /\/room\/?(index\.html)?$/.test(to.pathname)) skip(vt);
    } catch (err) { /* keep it */ }
  });

  if (!base) return;
  var warmed = {};
  var warm = function () {
    try {
      var dark = root.getAttribute('data-theme') === 'dark';
      var phone = matchMedia('(orientation: portrait)').matches;
      var src = base + (phone ? 'phone' : 'desk') + (dark ? '-dark' : '-light') + '.webp';
      if (warmed[src]) return;
      warmed[src] = 1;
      new Image().src = src;
    } catch (e) { /* fine */ }
  };
  var onLink = function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && a.origin === location.origin && a.pathname !== location.pathname) warm();
  };
  addEventListener('pointerover', onLink, { passive: true });
  addEventListener('pointerdown', onLink, { passive: true });
  addEventListener('focusin', onLink, { passive: true });
  addEventListener('load', function () { (window.requestIdleCallback || setTimeout)(warm, { timeout: 2000 }); });
})();
