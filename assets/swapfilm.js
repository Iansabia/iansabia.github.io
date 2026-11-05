/* The SwapChain film as a guided player (see assets/swapfilm.css). Used on /projects/ and /swapchain/.
   Any [data-swapfilm] holding a .sf-view > video gets a caption card, a step rail and play/pause.
   The chapters follow what is on screen in swapchain-demo.mp4 (117.5 s); the words come from the film and the
   SwapChain page. It never autoplays: nothing downloads until the frame is near the screen (then only the
   index, about 80 KB) and the film starts on "Play the film", a click on the picture or a chapter.
   On the page it is a teaser: any of those opens the site's demo window (assets/demo-window.js) and the same
   player (the one video, its card and rail) moves into it and plays there, large. Closing the window pauses it
   and puts it back. Without the window (inside a frame, or before it loads) it plays on the page as before. */
(function () {
  var CH = [
    { t: 0, label: 'Pairs', icon: 'pair', title: 'BU only swaps pairs',
      text: "Zoe and Lucia each want the other's room, so they trade. That's the only kind of swap BU allows." },
    { t: 14, label: 'Loops', icon: 'loop', title: 'SwapChain finds the loop',
      text: "No two of Ava, Bea and Cleo want each other's room, yet all three move at once." },
    { t: 32, label: 'Explore', icon: 'cube', title: 'Sam explores the 3D campus',
      text: 'A freshman in Warren C who wants out. He taps a dorm, then a floor, then room 822.' },
    { t: 62.5, label: 'Catch', icon: 'x', title: "A pair swap can't work",
      text: "Nate is leaving room 822, but he wants Danielsen, not Sam's room." },
    { t: 72, label: 'Match', icon: 'check', title: 'A loop of three, confirmed first',
      text: 'Sam to Rich 822, Nate to Danielsen 532, Omar to Warren C 708. Nothing is filed until all three confirm.' },
    { t: 87, label: 'Results', icon: 'bars', title: 'Almost twice as many move',
      text: 'Ask for the big picture. Simulated with 350 made-up students, pairs move 94 and loops move 182.' }
  ];
  var DUR = 117.5;
  var ICONS = {
    pair: 'M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4',
    loop: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4',
    cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
    x: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6M15 9l-6 6',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    bars: 'M5 20v-8M12 20V5M19 20v-9M3 20h18',
    film: 'M4 5h16v14H4zM4 9h16M4 15h16M8 5v4M16 5v4M8 15v4M16 15v4'
  };
  var PLAY = '<svg viewBox="0 0 11 13" aria-hidden="true"><path d="M0 0v13l11-6.5z" fill="currentColor"/></svg>';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function icon(name) { return '<svg class="sf-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[name] + '"/></svg>'; }
  function fmt(s) { s = Math.round(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  function setup(root) {
    var view = root.querySelector('.sf-view'), v = view && view.querySelector('video');
    if (!v) return;
    root.classList.add('sf');
    // the player itself: the picture, its card and the rail. This is what moves into the window.
    var stage = el('div', 'sf sf-stage');
    view.before(stage);
    stage.appendChild(view);
    var n = CH.length;
    var phone = v.dataset.phone && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
    if (phone) v.src = v.dataset.phone;   // the same film at 960px and 30fps: 6MB instead of 28MB
    v.controls = false; v.loop = false; v.muted = true; v.preload = 'none';
    v.removeAttribute('autoplay');
    v.setAttribute('tabindex', '-1');

    // the picture: a click plays or pauses it (hidden from the keyboard; the rail's button does the same)
    var hit = el('button', 'sf-hit');
    hit.type = 'button'; hit.tabIndex = -1; hit.setAttribute('aria-hidden', 'true');
    view.appendChild(hit);

    // the caption card
    var cap = el('div', 'sf-cap');
    var inner = el('div', 'sf-in');
    var kick = el('span', 'sf-k mono'), title = el('p', 'sf-t'), text = el('p', 'sf-x');
    var go = el('button', 'sf-go', PLAY + '<span>Play the film</span>'); go.type = 'button';
    inner.append(kick, title, text);
    cap.append(inner, go);
    view.appendChild(cap);

    // the rail
    var rail = el('div', 'sf-rail');
    var play = el('button', 'sf-btn sf-play',
      '<svg class="i-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.6v10.8L13.4 8z"/></svg>' +
      '<svg class="i-pause" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h2.8v10H4zM9.2 3H12v10H9.2z"/></svg>' +
      '<svg class="i-again" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5a5.5 5.5 0 1 1-5.2 3.7l1.5.5A3.9 3.9 0 1 0 8 4.1V6L4.8 3.3 8 .6z"/></svg>');
    play.type = 'button';
    var steps = el('div', 'sf-steps'); steps.setAttribute('role', 'group');
    steps.setAttribute('aria-label', 'Chapters of the film. Pick one to jump there.');
    steps.style.setProperty('--n', n);
    var bars = CH.map(function (c, i) {
      var end = i + 1 < n ? CH[i + 1].t : DUR;
      var b = el('button', null, '<span>' + c.label + '</span><i></i>');
      b.type = 'button';
      b.setAttribute('aria-label', (i + 1) + ' of ' + n + ', ' + c.label + ': ' + c.title + '. Starts at ' + fmt(c.t) + '.');
      b.addEventListener('click', function () { pop(b); jump(i); });
      steps.appendChild(b);
      c.end = end;
      return b;
    });
    var clock = el('span', 'sf-time mono'); clock.setAttribute('aria-hidden', 'true');
    rail.append(play, steps, clock);
    var fsOk = v.requestFullscreen || v.webkitEnterFullscreen || v.webkitRequestFullscreen;
    if (fsOk) {
      var fs = el('button', 'sf-btn sf-fs', '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>');
      fs.type = 'button'; fs.setAttribute('aria-label', 'Watch full screen');
      fs.addEventListener('click', function () { pop(fs); full(); });
      rail.appendChild(fs);
    }
    view.after(rail);
    var say = el('p', 'sf-say'); say.setAttribute('aria-live', 'polite');
    rail.after(say);

    var cur = -1, said = -1, started = false, autoPaused = false, raf = 0, popped = false, ph = null;

    function state(s) { root.dataset.state = s; stage.dataset.state = s; label(); }
    function label() {
      var s = root.dataset.state;
      play.setAttribute('aria-label', s === 'playing' ? 'Pause the film' : s === 'ended' ? 'Play the film again' : 'Play the film');
      go.lastChild.textContent = s === 'ended' ? 'Play it again' : 'Play the film';
    }
    function fill(kicker, ic, t, x) {
      kick.textContent = kicker;
      title.innerHTML = icon(ic) + '<span></span>';
      title.lastChild.textContent = t;
      text.textContent = x;
    }
    function intro() { fill('The film · ' + n + ' steps · 2 min · No sound', 'film', 'SwapChain in six steps', 'Watch BU’s pair swaps give way to loops, then the app that finds them. Pick a step below to jump.'); }
    function show(i) {
      if (i === cur) return;
      cur = i;
      bars.forEach(function (b, j) { if (j === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
      var c = CH[i];
      var put = function () { fill((i + 1) + ' of ' + n + ' · ' + c.label, c.icon, c.title, c.text); };
      if (reduce.matches) put();
      else { inner.classList.add('swap'); setTimeout(function () { put(); inner.classList.remove('swap'); }, 180); }
      if (started && said !== i) { said = i; say.textContent = 'Step ' + (i + 1) + ' of ' + n + ', ' + c.label + '. ' + c.title + '. ' + c.text; }
    }
    function at(t) { for (var i = n - 1; i > 0; i--) if (t >= CH[i].t - 0.05) return i; return 0; }
    var shown = '';
    function paint() {
      var t = v.currentTime || 0;
      var c = fmt(t) + ' / ' + fmt(isFinite(v.duration) && v.duration ? v.duration : DUR);
      if (c !== shown) { shown = c; clock.textContent = c; }
      CH.forEach(function (c, j) { bars[j].style.setProperty('--p', Math.max(0, Math.min(1, (t - c.t) / (c.end - c.t))).toFixed(4)); });
      if (started) show(at(t));
    }
    function loop() { paint(); raf = v.paused ? 0 : requestAnimationFrame(loop); }
    function start() { if (!raf) raf = requestAnimationFrame(loop); }
    function begin() {
      if (!started) { started = true; said = -1; cur = -1; }
      if (v.preload === 'none') v.preload = 'auto';
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    }
    function jump(i) {
      if (root.dataset.state === 'ended' || !started) { started = true; said = -1; }
      try { v.currentTime = CH[i].t + (i ? 0.05 : 0); } catch (e) {}
      cur = -1; paint(); begin();
    }
    function toggle() {
      if (root.dataset.state === 'ended') { jump(0); return; }
      if (v.paused) begin(); else v.pause();
    }
    function full() {
      if (v.requestFullscreen) { v.controls = true; v.requestFullscreen().catch(function () { v.controls = false; }); }
      else if (v.webkitEnterFullscreen) { if (v.readyState < 1) v.load(); v.webkitEnterFullscreen(); }
      else if (v.webkitRequestFullscreen) { v.controls = true; v.webkitRequestFullscreen(); }
      if (v.paused) begin();
    }
    document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement) v.controls = false; });

    // on the page, a press opens the window first; opener is where focus goes back when it closes
    function pop(opener) {
      if (popped || typeof window.__dwOpenNode !== 'function') return false;
      return window.__dwOpenNode({
        key: 'swapfilm', opener: opener, title: 'SwapChain film',
        caption: n + ' steps · 2 min · No sound',
        mount: function (host) {
          ph = el('div', 'sf-ph'); ph.setAttribute('aria-hidden', 'true');
          ph.style.height = stage.offsetHeight + 'px';
          stage.before(ph);
          host.appendChild(stage);
          stage.classList.add('sf-popped');
          popped = true;
        },
        unmount: function () {
          autoPaused = false;
          if (!v.paused) v.pause();
          if (document.fullscreenElement === v && document.exitFullscreen) document.exitFullscreen().catch(function () {});
          stage.classList.remove('sf-popped');
          if (ph) { ph.replaceWith(stage); ph = null; }
          popped = false;
        }
      }) !== false;
    }
    function playOrAgain() { if (root.dataset.state === 'ended') jump(0); else begin(); }

    play.addEventListener('click', function () { if (pop(play)) playOrAgain(); else toggle(); });
    hit.addEventListener('click', function () { if (pop(play)) playOrAgain(); else toggle(); });
    go.addEventListener('click', function () { pop(play); playOrAgain(); });
    // arrow keys move between the chapters in the rail
    steps.addEventListener('keydown', function (e) {
      var i = bars.indexOf(document.activeElement); if (i < 0) return;
      var k = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
      if (k < 0 || k >= n) return;
      e.preventDefault(); bars[k].focus();
    });
    v.addEventListener('play', function () { state('playing'); start(); });
    v.addEventListener('pause', function () { if (!v.ended) state(started ? 'paused' : 'idle'); paint(); });
    v.addEventListener('ended', function () { state('ended'); paint(); });
    v.addEventListener('seeked', paint);
    v.addEventListener('timeupdate', function () { if (v.paused) paint(); });

    // near the screen: fetch the index only (desktop), so the first frame comes fast; phones wait for a tap.
    // Off the screen while playing: pause, and pick up again on the way back.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && !phone && v.preload === 'none') v.preload = 'metadata'; });
      }, { rootMargin: '600px 0px' }).observe(root);
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting && !v.paused) { autoPaused = true; v.pause(); }
          else if (e.isIntersecting && autoPaused) { autoPaused = false; if (v.paused && !v.ended) begin(); }
        });
      }, { threshold: 0.15 }).observe(view);
    }

    intro(); state('idle'); paint();
    root._swapfilm = { jump: jump, chapters: CH };
  }

  function boot() { document.querySelectorAll('[data-swapfilm]').forEach(setup); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
