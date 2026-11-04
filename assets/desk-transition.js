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
    if (window.top === window && !/[?&](nointro|embed)\b/.test(q) && !sessionStorage.getItem('ian-intro-played') &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches && !/\/room\/?(index\.html)?$/.test(location.pathname)) {
      var c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
      if (gl) {
        var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
        root.classList.add('intro-on');
        var cover = document.createElement('style');
        cover.textContent = 'html.intro-on::after{content:"";position:fixed;inset:0;z-index:2147483000;background:#EFEAE3;pointer-events:none;animation:ian-intro-cover 0s linear 4.5s forwards}' +
          '@keyframes ian-intro-cover{to{visibility:hidden}}html.intro-on[data-theme="dark"]::after{background:#1A1434}';
        document.head.appendChild(cover);
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
