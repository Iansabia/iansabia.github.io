/* Work page toys: the counters and bars, the lookup race, the 3D example hole, the jump bar, the car game
   and the live leaderboard rank. Theme, menu and reveals come from assets/site.js. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  /* blocks that animate once they come on screen */
  const handlers = {};
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    if (e.target.dataset.onIn) handlers[e.target.dataset.onIn]();
    io.unobserve(e.target);
  }), { threshold: 0.18 });
  const watch = (el, name, fn) => { if (!el) return; handlers[name] = fn; el.dataset.onIn = name; io.observe(el); };

  const fillBars = (wrap) => wrap.querySelectorAll('.t i').forEach((i) => { i.style.width = i.dataset.w + '%'; });
  watch(document.getElementById('samBars'), 'sam', () => fillBars(document.getElementById('samBars')));
  watch(document.getElementById('board'), 'board', () => {
    const b = document.getElementById('board');
    fillBars(b);
    b.querySelectorAll('[data-num]').forEach((v) => tween(0, +v.dataset.num, 1400, (x) => { v.textContent = x.toFixed(3); }));
  });
  const stats = document.getElementById('medStats');
  watch(stats, 'stats', () => stats.querySelectorAll('b[data-count]').forEach((b) => {
    const end = +b.dataset.count, pre = b.dataset.prefix || '', suf = b.dataset.suffix || '';
    tween(0, end, 1500, (x) => { b.innerHTML = pre + Math.round(x).toLocaleString('en-US') + suf; });
  }));

  function tween(a, b, ms, cb) {
    if (reduce) return cb(b);
    const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); cb(a + (b - a) * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  /* lookup race: 15 min in each of 5 systems by hand vs about 60 s for the agent, both at 300x */
  const raceBtn = document.getElementById('raceBtn');
  const chipsA = [...document.querySelectorAll('#chipsA .chip')], chipB = document.getElementById('chipB');
  const clockA = document.getElementById('clockA'), clockB = document.getElementById('clockB');
  const trackA = document.getElementById('trackA'), trackB = document.getElementById('trackB'), verdict = document.getElementById('verdict');
  const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  let racing = false;
  raceBtn.addEventListener('click', () => {
    if (racing) return; racing = true; raceBtn.textContent = 'Running';
    chipsA.forEach((c) => c.className = 'chip'); chipB.className = 'chip agent';
    verdict.textContent = 'Same question, two ways.';
    const A = 4500, B = 60, speed = reduce ? 1e6 : 300, t0 = performance.now();
    const step = (now) => {
      const sim = (now - t0) / 1000 * speed;
      const a = Math.min(A, sim), b = Math.min(B, sim);
      clockA.textContent = fmt(a); clockB.textContent = fmt(b);
      trackA.style.transform = 'scaleX(' + a / A + ')'; trackB.style.transform = 'scaleX(' + b / B + ')';
      const idx = Math.min(4, Math.floor(a / (A / 5)));
      chipsA.forEach((c, i) => c.className = 'chip' + (i < idx || a >= A ? ' done' : i === idx ? ' on' : ''));
      chipB.className = 'chip agent' + (b >= B ? ' done' : ' on');
      if (b >= B && a < A) verdict.textContent = 'The agent is done. The person is still on system ' + (idx + 1) + ' of 5.';
      if (a < A) requestAnimationFrame(step);
      else { racing = false; raceBtn.textContent = 'Run it again'; verdict.textContent = 'By hand: 50 to 75 minutes across five systems. With the agent: about a minute.'; }
    };
    requestAnimationFrame(step);
  });

  /* the 3D example hole (continuum/hole/, the same one /continuum/ shows). It loads when it comes near, plays by itself
     once most of it is on screen, pauses when it leaves and picks up again when it comes back (unless the reader paused
     it). Its own control bar has play, pause and the steps. It follows this page's theme. */
  (() => {
    const view = document.querySelector('#ccHole .hole-view'), frame = document.getElementById('ccHoleFrame');
    if (!view || !frame) return;
    const theme = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');
    const send = (msg) => { try { frame.contentWindow.postMessage(msg, location.origin); } catch (e) {} };
    const doc = () => { try { return frame.contentDocument; } catch (e) { return null; } };
    const isPlaying = () => { const d = doc(); return !!(d && d.documentElement.classList.contains('playing')); };
    let loaded = false, ready = false, inView = false, started = false, resume = false;
    const show = () => view.classList.add('is-on');
    const play = () => { // same origin: press the hole's own play button, so its controls stay in step
      const d = doc(); if (!d || reduce) return;
      const btn = d.documentElement.classList.contains('started') ? d.getElementById('play-btn') : d.getElementById('start-btn');
      if (btn && !isPlaying()) { btn.click(); started = true; }
    };
    addEventListener('message', (e) => {
      if (e.origin !== location.origin || e.source !== frame.contentWindow || !e.data || e.data.type !== 'cc-hole-ready') return;
      ready = true; show();
      if (inView && !started) play();
    });
    frame.addEventListener('load', () => { if (!loaded) return; send({ type: 'cc-hole', theme: theme() }); setTimeout(show, 40000); });
    const load = () => { if (loaded) return; loaded = true; frame.src = '../continuum/hole/?embed=1&theme=' + theme(); };
    if (!('IntersectionObserver' in window)) { load(); return; }
    /* load only once scrolling has settled near the hole: starting it mid-scroll (say on the smooth jump to a #nvidia
       link) can stall the page's own scroll while the 3D scene starts up */
    let near = false, settle = 0;
    const later = () => { clearTimeout(settle); if (near && !loaded) settle = setTimeout(() => { if (near) load(); }, 300); };
    addEventListener('scroll', later, { passive: true });
    new IntersectionObserver((es, o) => {
      near = es[es.length - 1].isIntersecting;
      if (loaded) { o.disconnect(); removeEventListener('scroll', later); } else later();
    }, { rootMargin: '100% 0px' }).observe(view);
    /* Full screen opens a second copy of the hole in the demo window: pause this one meanwhile, and play it again
       when the window closes if it was playing and is still on screen */
    let held = false;
    const full = document.querySelector('#ccHole .hole-full');
    if (full) full.addEventListener('click', () => { held = loaded && isPlaying(); if (held) send({ type: 'cc-hole', pause: true }); });
    document.addEventListener('close', (e) => {
      if (!held || !(e.target instanceof HTMLDialogElement)) return;
      held = false;
      if (inView) setTimeout(play, 60); else resume = true;
    }, true);
    new IntersectionObserver((es) => {
      const r = es[es.length - 1].intersectionRatio;
      if (r >= .5 && !inView) {
        inView = true;
        if (ready && (!started || resume)) play();
        resume = false;
      } else if (r < .5 && inView) {
        inView = false;
        if (loaded && isPlaying()) { resume = true; send({ type: 'cc-hole', pause: true }); }
      }
    }, { threshold: [0, .5, 1] }).observe(view);
    document.addEventListener('themechange', () => { if (loaded) send({ type: 'cc-hole', theme: theme() }); });
  })();

  /* jump bar: underline the case in view. #hash links (from home, the old /demos/ links or the bar
     itself) are plain anchors now that all three cases are on the page; the browser lands them. */
  const jumps = [...document.querySelectorAll('.case-tab')];
  const markCase = (id) => jumps.forEach((j) => (j.getAttribute('href') === '#' + id ? j.setAttribute('aria-current', 'true') : j.removeAttribute('aria-current')));
  markCase('medtronic');
  /* the band goes solid once it sticks under the top bar, and the case that fills most of the screen
     below the two bars is the one marked (so the Medtronic stats still count as Medtronic) */
  const band = document.querySelector('.cases-band'), entries = [...document.querySelectorAll('.entry')];
  let spyQueued = false;
  const spyCases = () => {
    spyQueued = false;
    const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar')) || 64;
    const stuck = band.getBoundingClientRect().top <= barH + 0.5 && scrollY > 0;
    band.classList.toggle('stuck', stuck); document.body.classList.toggle('cases-stuck', stuck);
    const top = barH + 56, bottom = innerHeight;
    let best = null, bestH = 0;
    entries.forEach((el) => { const r = el.getBoundingClientRect(), t0 = el.firstElementChild.getBoundingClientRect().top, h = Math.min(bottom, r.bottom) - Math.max(top, t0); if (h > bestH) { bestH = h; best = el; } });
    if (best) markCase(best.id);
  };
  const queueSpy = () => { if (!spyQueued) { spyQueued = true; requestAnimationFrame(spyCases); } };
  addEventListener('scroll', queueSpy, { passive: true }); addEventListener('resize', queueSpy); spyCases();

  /* car game: real answers from my fine-tuned Alpamayo 1.5 on four public dashcam clips (rt/public_clip.py) */
  const OPTS = ['Keep going', 'Slow down', 'Stop', 'Steer around'];
  const COMMONS = 'https://commons.wikimedia.org/wiki/File:';
  const SCENES = [
    { id: 'deer', alt: 'Dashcam view of a snowy forest road with a deer crossing ahead.', model: 1, votes: '7 of 8 answers',
      quote: 'Decelerate to maintain a safe distance from the deer crossing the road.', note: '',
      focus: { c: ['deer'], pick: 'size', say: 'the deer' },
      credit: 'Clip: Virgo Siil, <a target="_blank" rel="noopener noreferrer" href="' + COMMONS + 'Metskitsed_autoteel.webm">CC0, via Wikimedia Commons</a>' },
    { id: 'cow', alt: 'Night dashcam view of a cow standing in the lane, lit by the headlights.', model: 1, votes: '6 of 8 answers',
      quote: 'Decelerate to maintain a safe distance from the animal crossing the road.',
      focus: { c: ['cow', 'deer', 'dog'], pick: 'size', say: 'the animal' },
      note: 'The other two answers kept going and called the cow a "lead vehicle." Night footage is hard.',
      credit: 'Clip: Luke Byers, <a target="_blank" rel="noopener noreferrer" href="' + COMMONS + 'Cow_crosses_cattle_grid.webm">CC BY 3.0, via Wikimedia Commons</a>' },
    { id: 'emergency', alt: 'Dashcam view of police cars and an ambulance stopped across the lanes, with a person on foot.', model: 1, votes: '6 of 8 answers',
      quote: 'Decelerate to maintain a safe distance from the emergency vehicle ahead.',
      focus: { c: ['car', 'truck', 'bus'], pick: 'center', say: 'the emergency vehicle' },
      note: 'The other two steered left around the police car.',
      credit: 'Clip: Noah Wulf, <a target="_blank" rel="noopener noreferrer" href="' + COMMONS + 'Hughes_Park_Dr_Rear-Ending.webm">CC BY-SA 3.0, via Wikimedia Commons</a>. My cut is shared under the same license.' },
    { id: 'fire', alt: 'Dashcam view of a highway with thick black smoke from a vehicle fire ahead.', model: 1, votes: '5 of 8 answers',
      quote: 'Gentle deceleration to maintain a safe distance from the black car ahead.',
      focus: { c: ['car'], pick: 'center', say: 'the black car ahead' },
      note: 'Right call, but most answers blamed a black car ahead. Only one mentioned the fire. Getting the reason right, not just the action, is what I\'m working on next.',
      credit: 'Clip: Sillerkiil, <a target="_blank" rel="noopener noreferrer" href="' + COMMONS + 'Veok_p6leng_pikk.webm">CC0, via Wikimedia Commons</a>' },
  ];
  const $ = (id) => document.getElementById(id);
  const dView = $('dView'), dImg = $('dImg'), dVid = $('dVid'), dOpts = $('dOpts'), dReveal = $('dReveal');
  const picks = {};
  let scene = 0;
  $('dTotal').textContent = SCENES.length;

  /* vision layer: boxes from Grounding DINO, an open-source object detector, run on the same frames (rt/site_detect.py).
     My model never sees them. Still = the frame at the decision; video = 10 detector frames a second, eased in between. */
  const CVC = { vehicle: '#9B85FF', vru: '#FF6F91', animal: '#F5C84B', control: '#5FE0B0', hazard: '#FF8A3D' };
  const CVG = { car: 'vehicle', truck: 'vehicle', bus: 'vehicle', motorcycle: 'vehicle', bicycle: 'vru', person: 'vru', deer: 'animal', cow: 'animal',
    dog: 'animal', 'traffic light': 'control', 'stop sign': 'control', 'traffic cone': 'control', fire: 'hazard', smoke: 'hazard' };
  const PLURAL = { person: 'people', bus: 'buses', deer: 'deer', smoke: 'smoke', fire: 'fire' };
  const dCv = $('dCv'), dCx = dCv.getContext('2d'), dHud = $('dHud'), dCvBtn = $('dCvBtn');
  const boxCache = {};
  let cvData = null, cvOn = true, cvRaf = 0, cvSeen = false, scanStart = 0, focus = null, focusBox = null;
  const loadBoxes = (id) => boxCache[id] || (boxCache[id] = fetch('../drive/' + id + '.boxes.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));
  const iou = (a, b) => {
    const iw = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])), ih = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    return iw * ih / (a[2] * a[3] + b[2] * b[3] - iw * ih + 1e-9);
  };
  function cvSize() {
    const r = dCv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1), w = Math.round(r.width * d), h = Math.round(r.height * d);
    if (dCv.width !== w || dCv.height !== h) { dCv.width = w; dCv.height = h; }
    dCx.setTransform(d, 0, 0, d, 0, 0);
    FONT = '500 ' + (r.width < 480 ? 11 : 10) + 'px "JetBrains Mono", ui-monospace, monospace'; // phones: labels at 11px
    return [r.width, r.height];
  }
  function cvAt(t) {
    const F = cvData.frames, k = Math.max(0, Math.min(F.length - 1, t * cvData.fps)), a = Math.floor(k), b = Math.min(F.length - 1, a + 1), u = k - a;
    const next = new Map(F[b].map((d) => [d.id, d]));
    return F[a].map((d) => { const e = next.get(d.id); return e ? { ...d, b: d.b.map((v, i) => v + (e.b[i] - v) * u) } : d; });
  }
  let FONT = '500 10px "JetBrains Mono", ui-monospace, monospace';
  const overlaps = (r, placed) => placed.some((q) => r[0] < q[0] + q[2] && q[0] < r[0] + r[2] && r[1] < q[1] + q[3] && q[1] < r[1] + r[3]);
  function cvTag(text, r, fill, ink, mark) {
    dCx.font = FONT;
    dCx.fillStyle = fill; dCx.fillRect(r[0], r[1], r[2], r[3]);
    if (mark) { dCx.fillStyle = mark; dCx.fillRect(r[0], r[1], 3, r[3]); }
    dCx.fillStyle = ink; dCx.fillText(text, r[0] + 7, r[1] + 11.5);
  }
  // a label goes above the box, else inside its top, else inside its bottom; never over another label,
  // the tag and toggle along the top, or the count along the bottom. No room: the box keeps its brackets only.
  function cvSpot(text, x, ys, W, H, placed) {
    dCx.font = FONT;
    const tw = dCx.measureText(text).width + 12, tx = Math.min(Math.max(2, x), W - tw - 2);
    for (const ty of ys) {
      const r = [tx, ty, tw, 16];
      if (ty >= 36 && ty + 16 <= H - 34 && !overlaps(r, placed)) { placed.push(r); return r; }
    }
    return null;
  }
  function cvBox(d, W, H, p, placed) {
    const c = CVC[CVG[d.c]] || '#fff', x = d.b[0] * W, y = d.b[1] * H, w = d.b[2] * W, h = d.b[3] * H, L = Math.max(4, Math.min(w, h) * .3) * p;
    dCx.strokeStyle = c; dCx.lineWidth = 1.75;
    dCx.globalAlpha = .25 * p; dCx.strokeRect(x, y, w, h); dCx.globalAlpha = 1;
    dCx.beginPath();
    dCx.moveTo(x, y + L); dCx.lineTo(x, y); dCx.lineTo(x + L, y);
    dCx.moveTo(x + w - L, y); dCx.lineTo(x + w, y); dCx.lineTo(x + w, y + L);
    dCx.moveTo(x + w, y + h - L); dCx.lineTo(x + w, y + h); dCx.lineTo(x + w - L, y + h);
    dCx.moveTo(x + L, y + h); dCx.lineTo(x, y + h); dCx.lineTo(x, y + h - L);
    dCx.stroke();
    if (p < .7 || (W < 480 && d.b[2] * d.b[3] < .002)) return;  // phones: tiny far-off boxes keep their brackets only
    const text = d.c.toUpperCase() + ' ' + Math.round(d.s * 100), r = cvSpot(text, x, [y - 18, y + 2, y + h - 18], W, H, placed);
    if (!r) return;
    dCx.globalAlpha = Math.min(1, (p - .7) / .3);
    cvTag(text, r, 'rgba(11,8,23,.8)', '#EFEAF8', c);
    dCx.globalAlpha = 1;
  }
  function cvFocusRing(f, W, H, now) {
    const x = f.b[0] * W, y = f.b[1] * H, w = f.b[2] * W, h = f.b[3] * H, k = reduce ? .5 : (Math.sin(now / 240) + 1) / 2, g = 4 + 4 * k;
    dCx.strokeStyle = '#EFEAF8'; dCx.lineWidth = 1.5; dCx.setLineDash([4, 4]);
    dCx.strokeRect(x - g, y - g, w + 2 * g, h + 2 * g); dCx.setLineDash([]);
  }
  function cvHud(list) {
    if (!cvOn || !list) { dHud.textContent = ''; return; }
    const n = {};
    list.forEach((d) => { n[d.c] = (n[d.c] || 0) + 1; });
    const parts = Object.entries(n).sort((a, b) => b[1] - a[1]).map(([c, k]) => k + ' ' + (k > 1 ? (PLURAL[c] || c + 's') : c));
    dHud.innerHTML = '<b>Detector</b>' + (parts.length ? parts.join(' &middot; ') : 'nothing found');
  }
  function pickFocus(list) {
    const c = focus ? list.filter((d) => focus.c.includes(d.c)) : [];
    if (!c.length) return null;
    const score = focus.pick === 'center' ? (d) => -Math.abs(d.b[0] + d.b[2] / 2 - .5) : (d) => d.b[2] * d.b[3];
    return c.reduce((a, b) => (score(b) > score(a) ? b : a));
  }
  function cvFrame(now) {
    cvRaf = 0;
    const [W, H] = cvSize();
    dCx.clearRect(0, 0, W, H);
    if (!cvOn || !cvData || !cvSeen) { cvHud(cvOn && cvData ? cvData.still : null); return; }
    const playing = dView.classList.contains('playing') && cvData.frames;
    const list = (playing ? cvAt(dVid.currentTime) : cvData.still).slice().sort((a, b) => b.b[2] * b.b[3] - a.b[2] * a.b[3]);
    const tag = $('dTag'), placed = W < 480 ? [[tag.offsetLeft, tag.offsetTop, tag.offsetWidth, tag.offsetHeight + 2]] : []; // phones: the tag can wrap to two lines, so labels keep clear of it
    let again = false, ftag = null;
    if (focus && focus.shown && focusBox && (playing || reduce || now - scanStart >= 1300)) {
      if (playing) { // follow the same object from frame to frame
        let best = .05, hit = null;
        list.forEach((d) => { const v = CVG[d.c] === CVG[focusBox.c] ? iou(d.b, focusBox.b) : 0; if (v > best) { best = v; hit = d; } });
        if (hit) focusBox = hit;
      }
      const t = 'MY MODEL: ' + focus.say.toUpperCase(), fy = focusBox.b[1] * H, fh = focusBox.b[3] * H;
      ftag = [t, cvSpot(t, focusBox.b[0] * W - 8, [fy + fh + 10, fy - 28, fy + fh - 20], W, H, placed)];
    }
    if (!playing && !reduce && now - scanStart < 1300) { // a scan line sweeps down and "finds" each box as it passes
      const sy = (now - scanStart) / 1100 * H, grad = dCx.createLinearGradient(0, sy - 46, 0, sy);
      grad.addColorStop(0, 'rgba(95,224,176,0)'); grad.addColorStop(1, 'rgba(95,224,176,.26)');
      dCx.fillStyle = grad; dCx.fillRect(0, sy - 46, W, 46);
      dCx.fillStyle = 'rgba(95,224,176,.9)'; dCx.fillRect(0, sy, W, 1.5);
      list.forEach((d) => { const p = Math.max(0, Math.min(1, (sy - d.b[1] * H) / (.16 * H))); if (p > 0) cvBox(d, W, H, p, placed); });
      again = true;
    } else {
      list.forEach((d) => cvBox(d, W, H, 1, placed));
    }
    if (ftag) {
      cvFocusRing(focusBox, W, H, now);
      if (ftag[1]) cvTag(ftag[0], ftag[1], '#6D4FE8', '#fff');
      again = again || !reduce;
    }
    cvHud(list);
    if (again || (playing && !dVid.paused && !dVid.ended)) cvRaf = requestAnimationFrame(cvFrame);
  }
  const cvKick = () => { if (!cvRaf) cvRaf = requestAnimationFrame(cvFrame); };
  function cvScene(i) {
    cvData = null; focusBox = null;
    focus = SCENES[i].focus ? { ...SCENES[i].focus, shown: false } : null;
    cvKick();
    loadBoxes(SCENES[i].id).then((d) => {
      if (scene !== i) return;
      cvData = d; scanStart = performance.now();
      if (d && focus && focus.shown) focusBox = pickFocus(d.still);
      cvKick();
    });
  }
  function cvShowFocus() {
    if (!focus) return;
    focus.shown = true;
    if (cvData) focusBox = pickFocus(cvData.still);
    cvKick();
  }
  new IntersectionObserver(([e]) => { // only animate while the clip is on screen; the scan plays the first time you see it
    if (e.isIntersecting && !cvSeen) { cvSeen = true; scanStart = performance.now(); }
    if (e.isIntersecting) cvKick(); else if (cvRaf) { cancelAnimationFrame(cvRaf); cvRaf = 0; }
  }).observe(dView);
  dCvBtn.addEventListener('click', () => {
    cvOn = !cvOn;
    dCvBtn.setAttribute('aria-pressed', cvOn); dCvBtn.textContent = cvOn ? 'Boxes on' : 'Boxes off';
    scanStart = performance.now(); cvKick();
  });
  ['play', 'seeked', 'ended'].forEach((ev) => dVid.addEventListener(ev, cvKick));
  addEventListener('resize', cvKick);
  function tally() {
    const n = Object.keys(picks).length, m = Object.entries(picks).filter(([i, o]) => SCENES[i].model === o).length;
    $('dScore').textContent = n ? 'You matched my model on ' + m + ' of ' + n : SCENES.length + ' real dashcam clips';
  }
  function reveal(i) {
    const s = SCENES[i], you = picks[i], same = you === s.model;
    [...dOpts.children].forEach((b, o) => {
      b.disabled = true;
      b.classList.toggle('you', o === you); b.classList.toggle('model', o === s.model);
      b.querySelector('small').textContent = o === s.model ? (o === you ? 'both' : 'model') : '';
    });
    $('dAgree').textContent = same ? 'Same call' : 'Different call';
    $('dAgree').className = 'agree' + (same ? '' : ' no');
    $('dYou').textContent = OPTS[you]; $('dModel').textContent = OPTS[s.model]; $('dVotes').textContent = s.votes;
    $('dQuote').textContent = '“' + s.quote + '”';
    $('dNote').textContent = s.note; $('dNote').hidden = !s.note;
    dReveal.hidden = false; $('dWait').hidden = true;
    cvShowFocus();
  }
  function show(i) {
    scene = i;
    const s = SCENES[i];
    $('dStep').textContent = i + 1;
    dView.classList.remove('playing'); dVid.pause(); dVid.removeAttribute('src'); dVid.load();
    dImg.src = '../drive/' + s.id + '.jpg'; dImg.alt = s.alt;
    cvScene(i);
    $('dTag').textContent = 'Paused at the moment of decision';
    $('dCredit').innerHTML = s.credit;
    dOpts.innerHTML = '';
    OPTS.forEach((label, o) => {
      const b = document.createElement('button');
      b.className = 'opt'; b.innerHTML = label + '<small></small>';
      b.addEventListener('click', () => { picks[i] = o; reveal(i); tally(); });
      dOpts.appendChild(b);
    });
    dReveal.hidden = true; $('dWait').hidden = false;
    if (i in picks) reveal(i);
    $('dNext').textContent = i === SCENES.length - 1 ? 'Back to scene 1' : 'Next scene';
  }
  // phones: the clip sits far above these buttons, so bring it into view first
  const phoneLayout = matchMedia('(max-width: 900px), (pointer: coarse)');
  const clipIntoView = () => { if (phoneLayout.matches) dView.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' }); };
  $('dPlay').addEventListener('click', () => {
    clipIntoView();
    if (!dVid.getAttribute('src')) dVid.src = '../drive/' + SCENES[scene].id + '.mp4';
    dVid.currentTime = 0;
    dVid.play().then(() => { dView.classList.add('playing'); $('dTag').textContent = 'What happened next'; }).catch(() => {});
  });
  $('dNext').addEventListener('click', () => { show((scene + 1) % SCENES.length); clipIntoView(); });
  show(0);

  /* live rank from NVIDIA's public leaderboard (a Gradio Space that allows this origin). If it can't be reached, the dated #16 stays. */
  (async () => {
    const base = 'https://nvidia-physicalai-ood-leaderboard.hf.space/gradio_api/call/lambda';
    let me = null;
    try { me = JSON.parse(sessionStorage.getItem('lb:me')); } catch (e) {}
    if (!me) {
      try {
        const ac = new AbortController(); setTimeout(() => ac.abort(), 9000);
        const { event_id } = await (await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"data":[]}', signal: ac.signal })).json();
        const line = (await (await fetch(base + '/' + event_id, { signal: ac.signal })).text()).split('\n').find((l) => l.startsWith('data:'));
        const row = JSON.parse(line.slice(5))[0].data.find((r) => r[1] === 'iansabia');
        if (row) { me = { rank: +row[0], score: +row[3] }; try { sessionStorage.setItem('lb:me', JSON.stringify(me)); } catch (e) {} }
      } catch (e) {}
    }
    if (!me || !(me.rank > 0) || !(me.score > 0)) return;
    document.querySelectorAll('[data-rank]').forEach((n) => { n.textContent = '#' + me.rank; });
    document.getElementById('rankLine').textContent = 'Currently #' + me.rank + ' on the public leaderboard';
    const src = document.getElementById('rankSrc'); src.textContent = 'Live from the leaderboard.'; src.className = 'live';
    const mine = document.querySelector('#board .bar.me'), v = mine.querySelector('.v');
    v.dataset.num = me.score; mine.querySelector('.t i').dataset.w = me.score * 100;
    const apply = () => { v.textContent = me.score.toFixed(3); mine.querySelector('.t i').style.width = me.score * 100 + '%'; };
    if (document.getElementById('board').classList.contains('in')) { apply(); setTimeout(apply, 1500); } // after any count-up already running
  })();
})();
