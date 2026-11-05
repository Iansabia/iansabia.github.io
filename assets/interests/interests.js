/* Off the clock interests: chips with photos open an on-site lightbox (Back or X, Esc, arrow keys,
   swipe on phones). "Too many fantasy leagues" jumps to the fantasy scores card with the desk
   transition (assets/desk-transition.css styles every root view transition). */
(function () {
  var base = (function () {
    try { return new URL('./', document.currentScript.src).href; } catch (e) { return 'assets/interests/'; }
  })();
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var G = {
    skiing: { name: 'Skiing', items: ['skiing-1', 'skiing-2', 'skiing-3'] },
    golf: { name: 'Golf', items: ['golf-1', 'golf-2'] },
    soccer: { name: 'Soccer', items: ['soccer-1'] },
    running: { name: 'Running', items: ['running-1', 'running-2', 'running-3', 'running-4'] },
    pasta: { name: 'Homemade pasta', items: ['pasta-1', 'pasta-2', 'pasta-3', 'pasta-4', 'pasta-5', 'pasta-6'] },
    oysters: { name: 'Oysters', items: ['oysters-1'] },
    nfl: { name: 'The NFL', items: [{ video: 'nfl-loop.mp4', poster: 'nfl-poster.webp' }] }
  };

  var ICON = {
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  var lb, stage, cap, count, prevB, nextB, backB, closeB;
  var cur = null, idx = 0, opener = null, pushed = false;

  function build() {
    lb = document.createElement('div');
    lb.className = 'ilb';
    lb.hidden = true;
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Photos');
    lb.innerHTML =
      '<div class="ilb-bar">' +
        '<button type="button" class="ilb-btn ilb-back">' + ICON.left + '<span>Back</span></button>' +
        '<span class="ilb-count" aria-live="polite"></span>' +
        '<button type="button" class="ilb-btn ilb-x" aria-label="Close">' + ICON.x + '</button>' +
      '</div>' +
      '<div class="ilb-stage">' +
        '<button type="button" class="ilb-btn ilb-nav ilb-prev" aria-label="Previous photo">' + ICON.left + '</button>' +
        '<button type="button" class="ilb-btn ilb-nav ilb-next" aria-label="Next photo">' + ICON.right + '</button>' +
      '</div>' +
      '<p class="ilb-cap"></p>';
    document.body.appendChild(lb);
    stage = lb.querySelector('.ilb-stage');
    cap = lb.querySelector('.ilb-cap');
    count = lb.querySelector('.ilb-count');
    prevB = lb.querySelector('.ilb-prev');
    nextB = lb.querySelector('.ilb-next');
    backB = lb.querySelector('.ilb-back');
    closeB = lb.querySelector('.ilb-x');
    backB.addEventListener('click', function () { close(); });
    closeB.addEventListener('click', function () { close(); });
    prevB.addEventListener('click', function () { go(-1); });
    nextB.addEventListener('click', function () { go(1); });
    // tap on the dark area around the photo closes
    stage.addEventListener('click', function (e) { if (e.target === stage) close(); });

    // swipe on phones
    var sx = 0, sy = 0, on = false;
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { on = false; return; }
      on = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (!on) return; on = false;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1);
    }, { passive: true });

    lb.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'Tab') {
        var f = [].filter.call(lb.querySelectorAll('button,video[controls]'), function (b) { return !b.hidden && b.offsetParent; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function media(item, n, total) {
    var el;
    if (typeof item === 'object') {
      el = document.createElement('video');
      el.src = base + item.video;
      el.poster = base + item.poster;
      el.muted = true; el.defaultMuted = true;
      el.loop = true;
      el.playsInline = true;
      el.setAttribute('muted', ''); el.setAttribute('playsinline', ''); el.setAttribute('loop', '');
      el.setAttribute('aria-label', cur.name + ', video clip');
      if (reduce.matches) { el.controls = true; el.preload = 'metadata'; }
      else { el.autoplay = true; el.setAttribute('autoplay', ''); }
    } else {
      el = document.createElement('img');
      el.src = base + item + '.webp';
      el.alt = cur.name + (total > 1 ? ', photo ' + (n + 1) + ' of ' + total : '');
      el.decoding = 'async';
      el.draggable = false;
    }
    return el;
  }

  function show() {
    var items = cur.items, total = items.length;
    var old = stage.querySelector('img,video');
    if (old) { if (old.pause) old.pause(); old.remove(); }
    var el = media(items[idx], idx, total);
    el.className = 'in';
    stage.insertBefore(el, prevB);
    if (el.tagName === 'VIDEO' && !reduce.matches) { var p = el.play(); if (p && p.catch) p.catch(function () {}); }
    cap.textContent = cur.name;
    count.textContent = total > 1 ? (idx + 1) + ' / ' + total : '';
    prevB.hidden = nextB.hidden = total < 2;
    // warm the next photo
    var nx = items[(idx + 1) % total];
    if (total > 1 && typeof nx === 'string') new Image().src = base + nx + '.webp';
  }

  function go(d) {
    if (!cur || cur.items.length < 2) return;
    idx = (idx + d + cur.items.length) % cur.items.length;
    show();
  }

  function open(key, from) {
    if (!G[key]) return;
    if (!lb) build();
    cur = G[key]; idx = 0; opener = from || null;
    lb.setAttribute('aria-label', cur.name);
    show();
    lb.hidden = false;
    document.documentElement.classList.add('ilb-lock');
    requestAnimationFrame(function () { lb.classList.add('open'); });
    closeB.focus({ preventScroll: true });
    // browser Back (and the phone back gesture) closes the viewer instead of leaving the page
    try { history.pushState(Object.assign({}, history.state || {}, { ilb: 1 }), ''); pushed = true; } catch (e) { pushed = false; }
  }

  function hide() {
    if (!lb || lb.hidden) return;
    var v = stage.querySelector('video'); if (v) v.pause();
    lb.classList.remove('open');
    lb.hidden = true;
    var m = stage.querySelector('img,video'); if (m) m.remove();
    document.documentElement.classList.remove('ilb-lock');
    if (opener) opener.focus({ preventScroll: true });
    // with a #hash in the URL, Chrome can clear focus on the history step back: put it on the button again
    var op = opener;
    setTimeout(function () { if (op && document.contains(op) && document.activeElement !== op) op.focus({ preventScroll: true }); }, 0);
    cur = null;
  }

  function close() {
    if (pushed) { pushed = false; history.back(); } // popstate hides it
    else hide();
  }

  addEventListener('popstate', function () { if (lb && !lb.hidden) { pushed = false; hide(); } });

  // fantasy chip: jump to the scores card with the desk transition
  function jump(e) {
    var card = document.querySelector('#currently .rooting') || document.getElementById('currently');
    if (!card) return;
    e.preventDefault();
    var put = function () {
      // show the card at once (it may not have scrolled into view yet), then measure without the reveal offset
      [].forEach.call(card.querySelectorAll('.reveal'), function (r) { r.classList.add('in'); });
      card.classList.add('in');
      var y = card.offsetTop, el = card.offsetParent;
      while (el) { y += el.offsetTop; el = el.offsetParent; }
      document.documentElement.style.scrollBehavior = 'auto';
      scrollTo(0, Math.max(0, y - 84));
      document.documentElement.style.scrollBehavior = '';
      try { if (location.hash !== '#currently') history.pushState(history.state, '', '#currently'); } catch (err) { /* fine */ }
    };
    if (!reduce.matches && document.startViewTransition) {
      var root = document.documentElement;
      // the card is above: the desk slides back, the way it does for any link up the page
      if (card.getBoundingClientRect().top < 0) root.setAttribute('data-dt-back', '');
      var done = function () { root.removeAttribute('data-dt-back'); };
      try {
        var vt = document.startViewTransition(put);
        var no = function () {};
        vt.ready.catch(no); vt.finished.then(done, done);
        return;
      } catch (err) { done(); }
    }
    put();
  }

  function init() {
    [].forEach.call(document.querySelectorAll('.likes [data-gallery]'), function (b) {
      b.addEventListener('click', function () { open(b.getAttribute('data-gallery'), b); });
    });
    [].forEach.call(document.querySelectorAll('.likes [data-jump]'), function (a) {
      a.addEventListener('click', jump);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
