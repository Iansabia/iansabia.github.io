/* Desk transition helper (see assets/desk-transition.css). Load as a plain script in <head>,
   not defer or module, so the pagereveal listener exists before the new page's first frame.
   - Back/forward through history: mirrored slide (old page goes right, new comes from the left)
     when the history entry we land on is earlier than the one we left.
   - Skips the transition on reloads, under reduced motion, and when the home page room intro
     is about to play (html.intro-on) so the intro is never covered.
   - Warms the cache with the desk still for this theme and orientation. */
(function () {
  var root = document.documentElement;
  var base = '';
  try { base = new URL('desk/', document.currentScript.src).href; } catch (e) { /* no preload */ }

  addEventListener('pagereveal', function (e) {
    var vt = e.viewTransition;
    if (!vt) return;
    var back = false;
    try {
      if (root.classList.contains('intro-on') || matchMedia('(prefers-reduced-motion: reduce)').matches) { vt.skipTransition(); return; }
      var a = window.navigation && navigation.activation;
      if (a) {
        if (a.navigationType === 'reload') { vt.skipTransition(); return; }
        back = a.navigationType === 'traverse' && !!a.from && !!a.entry && a.entry.index > -1 && a.from.index > -1 && a.entry.index < a.from.index;
      } else {
        var n = performance.getEntriesByType('navigation')[0];
        if (n && n.type === 'reload') { vt.skipTransition(); return; }
        back = !!n && n.type === 'back_forward';      // no Navigation API: treat any history move as back
      }
    } catch (err) { /* plain forward transition */ }
    if (back) root.setAttribute('data-dt-back', '');
    var done = function () { root.removeAttribute('data-dt-back'); };
    vt.finished.then(done, done);
  });

  // leaving for the room replay page: its own intro takes over, so no desk swap first
  addEventListener('pageswap', function (e) {
    var vt = e.viewTransition;
    if (!vt) return;
    try { if (/\/room\/?(index\.html)?$/.test(new URL(e.activation.entry.url).pathname)) vt.skipTransition(); } catch (err) { /* keep it */ }
  });

  if (!base) return;
  var warm = function () {
    try {
      var dark = root.getAttribute('data-theme') === 'dark';
      var phone = matchMedia('(orientation: portrait)').matches;
      new Image().src = base + (phone ? 'phone' : 'desk') + (dark ? '-dark' : '-light') + '.webp';
    } catch (e) { /* fine */ }
  };
  addEventListener('load', function () { (window.requestIdleCallback || setTimeout)(warm, { timeout: 2000 }); });
})();
