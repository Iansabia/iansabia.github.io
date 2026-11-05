// Ian's room intro. A short three.js flight that plays over the home page:
// down a tree-lined brownstone street, in through the garden-level door of a
// three-unit house, along the hall, into the room, and onto the monitor.
// The monitor shows the real page underneath: its screen is a hole in the canvas,
// and the page is warped (CSS matrix3d) to sit exactly on it. When the screen fills
// the viewport the warp is the identity, so removing the overlay is seamless.
//
// Look: the SwapChain demo's 3D style (swapchain/app/src/theme.js + map.js):
// warm cream and purple by day, purple-black with lavender glow by night, flat
// ambient-heavy shading, soft massing, purple outlines on the one building that matters.
//
// Use on a page:
//   <link rel="stylesheet" href="room/intro.css">
//   <script>/* in <head>, after the theme script: hides the page until the intro decides */
//     (function(){try{var d=document.documentElement,q=location.search;if(location.hash||/[?&]nointro\b/.test(q)||sessionStorage.getItem('ian-intro-played')||matchMedia('(prefers-reduced-motion: reduce)').matches)return;d.classList.add('intro-on')}catch(e){}})();
//   </script>
//   <script type="module" src="room/intro.js"></script>
// The module also works without the head snippet (the page just shows for a moment first).
// Set window.__INTRO_MANUAL = true before loading it to call playIntro() yourself.

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const KEY = 'ian-intro-played';
const TEST = window.__INTRO_TEST || null;   // local screenshot scripts only; nothing reads the URL
let T = null;                                // the three.js namespace once loaded

// Timing. A first visit runs about 3.5 s: a quick street and door, then the house at its original pace.
// The flight keeps its shots (street, door, hall, room, monitor) and runs them faster: STORY is the
// length of the camera path in its own seconds, FLIGHT the wall-clock time it gets to play.
// On a first visit the flight ends at about BUDGET after the head gate (window.__introT0), shrinking
// toward FLIGHT_MIN when three.js arrives late; if three.js is not drawing by READY_BY, the page
// shows without the 3D (the poster frame just fades).
const STORY = 5.6;
const FLIGHT = 1.1, FLIGHT_MIN = .7, BUDGET = 1.5, READY_BY = .8;
// The street and the walk to the door play a little slower than the fast cut (OUT_FLIGHT of wall
// clock for story 0 to ENTER); from the door in, the house plays at the original pace (the old
// shots took IN_WALL seconds from the doorway to the monitor).
const ENTER = 2.45, OUT_FLIGHT = .75, OUT_MIN = .45, IN_WALL = 2.65;
const LATE = 1.3;   // the head gate's cover starts fading at 1.4 s; a first visit that starts later does not play
const FADE = .2, FADE_SKIP = .16, LIVE_FADE = .1;   // LIVE_FADE: canvas over the poster, camera held still

// ---------------------------------------------------------------- gate
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
    return true;
  } catch (e) { return false; }
}
export function shouldPlay() {
  try {
    if (window.top !== window) return false;                       // embedded pages and demos
    const q = new URLSearchParams(location.search);
    if (q.has('nointro') || q.has('embed')) return false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (sessionStorage.getItem(KEY)) return false;
    if (window.scrollY > 4 && !hashTarget()) return false;         // a link to a section lands there instead
    return hasWebGL();
  } catch (e) { return false; }      // no storage: never risk replaying on every load
}

// The section a #hash link points at (any page can be the first one opened), or null.
function hashTarget() {
  try {
    const id = decodeURIComponent(location.hash.slice(1));
    return id ? document.getElementById(id) : null;
  } catch (e) { return null; }
}
// Put the page where the visitor asked for it: the #hash section, or the top.
function land(top) {
  const el = !top && hashTarget();
  const html = document.documentElement, sb = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  // a #hash section lands under the top bar with a little room above it, so its heading and context show
  const topOf = () => {
    const bar = document.querySelector('header.top, .top');
    const h = bar ? bar.getBoundingClientRect().height : 60;
    return Math.max(0, el.getBoundingClientRect().top + window.scrollY - h - 24);
  };
  try { window.scrollTo({ top: el ? topOf() : 0, left: 0, behavior: 'instant' }); }
  catch (e) { window.scrollTo(0, el ? topOf() : 0); }
  html.style.scrollBehavior = sb;
}

// A deep link on a project page lands mid-page: name the page for a moment so the visitor knows where they are.
function showWhere() {
  try {
    const home = new URL('../', import.meta.url).pathname;
    if (location.pathname === home || location.pathname === home + 'index.html') return;
    const name = (document.title || '').split(' · ')[0].trim();
    if (!name || name === 'Ian Sabia') return;
    const tag = document.createElement('div');
    tag.className = 'ian-intro-where';
    tag.setAttribute('role', 'status');
    tag.textContent = name;
    document.body.appendChild(tag);
    requestAnimationFrame(() => requestAnimationFrame(() => tag.classList.add('on')));
    setTimeout(() => { tag.classList.remove('on'); setTimeout(() => tag.remove(), 500); }, 3200);
  } catch (e) { /* fine */ }
}

// ---------------------------------------------------------------- palette
// Straight from SwapChain's SCENE colors, plus the few things a street and a room need.
const PAL = {
  light: {
    sky: '#F1ECF2', horizon: '#EFEAE3', ground: '#EFEAE3', grid: '#8F7FF7', gridA: .2,
    road: '#FCFAF6', roadEdge: '#E4DDD4', path: '#F8F5F0', curb: '#E6DFD6', green: '#DBE1CD',
    building: '#E5DFD7', buildingB: '#EAE5DE', buildingC: '#DED7CE', stone: '#F1ECE5',
    dorm: '#FFFDFA', edge: '#604C9C', edgeA: .84, wire: '#8F7FF7', wireA: .5,
    glass: '#D8DDEA', lit: '#D8DDEA', litB: '#DFE2EC', mine: '#D2D2F2', door: '#604C9C', ndoor: '#CFC6BA',
    canopy: '#D1DABF', canopyB: '#C8D3B6', trunk: '#C9C1B8', ink: '#3A3742', inkA: .4, car: '#E9E4DC', carB: '#DCD5CB', carGlass: '#C9CFDE',
    lantern: '#FFFDFA', glowA: 0, post: '#B3ABBF',
    wall: '#FFFDFA', floor: '#EAE4DB', trim: '#FFFFFF', wood: '#DED6CB', woodDeep: '#D1C8BC', woodFront: '#E8E2D9',
    chair: '#604C9C', couch: '#D6CCF0', duvet: '#D3DCC4', throw: '#FFFDFA', dark: '#3A3742', metal: '#C9C1B8',
    pale: '#FFFDFA', leaf: '#AFC39A', pot: '#FFFDFA', rugBase: '#F8F4EE', rugInk: '#A597F2',
    furnEdge: '#604C9C', furnEdgeA: .3, led: '#8F7FF7', ledA: .32, blob: '#3A3742', blobA: .12,
    screenBg: '#F6F3EE', screenPane: '#FFFDFA', screenLine: 'rgba(29,24,48,.12)', screenBar: 'rgba(255,253,250,.8)',
    amb: .8 * .84, sun: .9 * .42, fill: .18 * .42, lift: { _: .06, dorm: .2, building: .22, buildingB: .2, buildingC: .22, trunk: .08, wall: .1, trim: .16, green: .05, pale: .14, floor: .14, wood: .12, woodDeep: .12, woodFront: .12, throw: .16, couch: .1, duvet: .1, stone: .12 },
  },
  dark: {
    sky: '#0C0918', horizon: '#1A1434', ground: '#120E24', grid: '#8F7FF7', gridA: .3,
    road: '#282242', roadEdge: '#1F1A34', path: '#241E3C', curb: '#2D2452', green: '#1C2230',
    building: '#2A2348', buildingB: '#251F42', buildingC: '#2F2850', stone: '#352C5C',
    dorm: '#CEC4E8', edge: '#B6A6CC', edgeA: .84, wire: '#8F7FF7', wireA: .55,
    glass: '#2E2654', lit: '#FFE2BC', litB: '#E2ECFF', mine: '#CFC4FF', door: '#8F7FF7', ndoor: '#3A3166',
    canopy: '#26303C', canopyB: '#2C3744', trunk: '#3A3166', ink: '#B6A6CC', inkA: .4, car: '#3A3166', carB: '#2F2850', carGlass: '#1A1434',
    lantern: '#FFD9A8', glowA: .75, post: '#3A3166',
    wall: '#38305A', floor: '#221A42', trim: '#4E4474', wood: '#4E4474', woodDeep: '#42396A', woodFront: '#564C80',
    chair: '#A99BFF', couch: '#7E6EC8', duvet: '#3C4A4E', throw: '#CEC4E8', dark: '#191333', metal: '#685E8C',
    pale: '#CEC4E8', leaf: '#4E6A50', pot: '#CEC4E8', rugBase: '#2D2452', rugInk: '#B6A6CC',
    furnEdge: '#B6A6CC', furnEdgeA: .3, led: '#8F7FF7', ledA: .6, blob: '#000000', blobA: .3,
    screenBg: '#100C20', screenPane: '#191333', screenLine: 'rgba(182,166,204,.18)', screenBar: 'rgba(25,19,51,.8)',
    amb: 1.0 * .84, sun: .5 * .42, fill: .18 * .42, lift: { _: 0, dorm: .16, wall: .1, trim: .08, pale: .1, throw: .1, green: .25 },
  },
};

function readDark(doc) {
  try {
    const el = doc.documentElement, dt = el.getAttribute('data-theme');
    if (dt === 'dark') return true;
    if (dt === 'light') return false;
    const cs = (doc.defaultView || window).getComputedStyle(el).colorScheme || '';
    if (/dark/.test(cs) && !/light/.test(cs)) return true;
    if (/light/.test(cs) && !/dark/.test(cs)) return false;
  } catch (e) { /* cross-origin frame */ }
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

// ---------------------------------------------------------------- helpers
const rand = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => x * x * (3 - 2 * x);

// scene geometry (meters). Room floor is y = 0; the street sits a bit higher (garden level).
const RW = 1.9, RD = 3, RH = 2.55;
const FX = 2.2;                       // outer face of the street wall
const YS = .75;                       // sidewalk height
const GARDEN = [FX, 4.6], WALK = [4.6, 7.4], ROAD = [7.4, 15.4], WALK2 = [15.4, 18.2], FX2 = 20.6;
const WIN = { z0: -2.75, z1: -1.85, y0: 1.05, y1: 2.2 };      // the room's window
const DOOR = { z0: 3.15, z1: 4.05, y1: 2.15 };                 // garden-level front door
const HALL = { z0: 3.1, z1: 4.1, x0: -1.0 };
const RDOOR = { x0: .75, x1: 1.6, y1: 2.06 };                  // room door, in the near wall
const HOUSE = { z0: -3.4, z1: 5.6, top: 9.0 };

// The monitor: a 32:9 strip that can bend from its real curve to flat.
const SCREEN = { w: 1.15, h: 0.36, R: 1.0, cy: 1.06, cz: 1.2, X0: -1.62 };
const OVER = .0015;

// ---------------------------------------------------------------- the intro
let active = null;

export function playIntro(opts = {}) {
  if (active) return active.promise;
  const html = document.documentElement;
  if (window.__introEarly) { window.__introEarly.remove(); window.__introEarly = null; }   // the head gate's early Skip pill
  if (!opts.force && (window.__introSkipped || !shouldPlay())) { html.classList.remove('intro-on'); return Promise.resolve(false); }
  // a first visit whose cover has already timed out (slow network) shows the page as it is: no late flight
  if (!opts.force && !TEST && typeof window.__introT0 === 'number' && (performance.now() - window.__introT0) / 1000 > LATE) {
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* fine */ }
    // let the cover finish its own fade (1.4 s + .2 s from when it was first styled), then drop the class
    const drop = () => { html.removeEventListener('animationend', onEnd); html.classList.remove('intro-on'); };
    const onEnd = (e) => { if (e.target === html && e.pseudoElement === '::after') drop(); };
    html.addEventListener('animationend', onEnd);
    setTimeout(drop, 2000);
    return Promise.resolve(false);
  }
  if (!opts.force) { try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* gate already checked */ } }
  let resolve; const promise = new Promise(r => { resolve = r; });
  active = { promise };
  run(opts, () => { active = null; resolve(true); });
  return promise;
}

function run(opts, done) {
  const html = document.documentElement;
  const target = opts.target || document.body;
  const themeDoc = () => (target.tagName === 'IFRAME' ? (target.contentDocument || document) : document);
  let dark = readDark(themeDoc());
  let P = dark ? PAL.dark : PAL.light;
  const toHash = !opts.force && !!hashTarget();   // a replay starts at the top; a first visit lands where it was opened
  land(!toHash);
  html.classList.add('intro-on', 'intro-lock');

  // overlay: lives on <html>, outside <body>, so warping the body never moves it
  const ov = document.createElement('div');
  ov.className = 'ian-intro' + (dark ? ' is-dark' : '');
  const canvasHost = document.createElement('div'); canvasHost.className = 'ian-intro-stage'; canvasHost.setAttribute('aria-hidden', 'true');
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'ian-intro-skip'; btn.textContent = 'Skip intro';
  ov.append(canvasHost, btn);
  html.appendChild(ov);

  let ended = false, raf = 0, renderer = null, ro = null, mo = null;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const stopEvents = ['keydown', 'wheel', 'touchmove', 'pointerdown'];
  const onInput = (e) => {
    if (TEST && TEST.hold) return;
    if (e.type === 'keydown' && (e.metaKey || e.ctrlKey) && e.key !== 'Escape') return;
    // a key that skips should not also scroll the page away from where the intro lands
    if (e.type === 'keydown' && /^( |Spacebar|PageDown|PageUp|ArrowDown|ArrowUp|Home|End)$/.test(e.key)) e.preventDefault();
    finish(true);
  };
  stopEvents.forEach(ev => addEventListener(ev, onInput, { capture: true, passive: ev !== 'keydown' }));
  btn.addEventListener('click', () => finish(true));

  // The head gate's poster cover (html.intro-on::after) moved onto the overlay itself, so its own
  // 1.4 s failsafe fade no longer matters once the intro has it
  function carryCover() {
    if (!html.classList.contains('intro-on') || ov.style.backgroundImage) return;
    try {
      const c = getComputedStyle(html, '::after');
      if (c.visibility === 'hidden' || c.content === 'none') return;
      ov.style.background = c.backgroundColor + ' ' + c.backgroundImage + ' center / cover no-repeat';
      html.classList.remove('intro-on');
    } catch (e) { /* no cover to carry */ }
  }

  function finish(skipped) {
    if (ended) return;
    ended = true;
    if (raf) cancelAnimationFrame(raf);
    stopEvents.forEach(ev => removeEventListener(ev, onInput, { capture: true }));
    removeEventListener('resize', onResize);
    if (mo) mo.disconnect();
    mq.removeEventListener && mq.removeEventListener('change', checkTheme);
    target.style.transform = ''; target.style.transformOrigin = ''; target.style.willChange = '';
    // ending before the canvas is in (three.js late, or a skip): the poster cover moves onto the
    // overlay so it fades out with it instead of cutting
    if (!ov.classList.contains('is-live')) carryCover();
    html.classList.remove('intro-on', 'intro-lock');
    if (toHash) {                                   // images may have moved the section while the intro played
      land(false); showWhere();
      requestAnimationFrame(() => requestAnimationFrame(() => land(false)));
    }
    ov.classList.add('is-out');
    if (skipped) ov.classList.add('is-fast');
    setTimeout(() => {
      ov.remove();
      if (renderer) { renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { /* fine */ } }
      done();
    }, (skipped ? FADE_SKIP : FADE) * 1000 + 20);
  }

  // ---------------------------------------------------------------- load three, lazily
  // a first visit counts from the head gate; a replay (force) has nothing to wait for but the module
  const t0 = !opts.force && typeof window.__introT0 === 'number' ? window.__introT0 : performance.now();
  const since = () => (performance.now() - t0) / 1000;
  const wait = TEST ? 30000 : Math.max(250, (opts.force ? 4 : READY_BY - since()) * 1000);
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('three.js took too long')), wait));
  Promise.race([T ? Promise.resolve(T) : import(THREE_URL), timeout]).then(mod => {
    T = mod;
    if (ended) return;
    try { start(); } catch (err) { console.error(err); finish(true); }
  }, (err) => { console.warn('intro skipped:', err && err.message); finish(true); });

  let onResize = () => {}, checkTheme = () => {};

  function start() {
    T.ColorManagement.enabled = false;      // light the raw sRGB colors, the way deck.gl does in SwapChain
    const MOBILE = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.75 : 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = T.LinearSRGBColorSpace;
    renderer.toneMapping = T.NoToneMapping;
    canvasHost.appendChild(renderer.domElement);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(46, innerWidth / innerHeight, .03, 400);

    // ---------- themed materials: every color is looked up by name, so a theme switch is a recolor
    const themed = [];
    const cache = new Map();
    function M(key, o = {}) {
      const ck = key + JSON.stringify(o);
      if (!o.unique && cache.has(ck)) return cache.get(ck);
      const m = o.basic ? new T.MeshBasicMaterial({ side: o.side || T.FrontSide, transparent: !!o.alpha, depthWrite: !o.alpha })
        : new T.MeshLambertMaterial({ side: o.side || T.FrontSide, flatShading: !!o.flat, transparent: !!o.alpha, depthWrite: !o.alpha });
      if (o.alpha) m.opacity = o.alpha;
      m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1;
      themed.push(() => {
        m.color.set(P[key]);
        if (m.emissive) m.emissive.set(P[key]).multiplyScalar(P.lift[key] ?? P.lift._);
      });
      cache.set(ck, m);
      return m;
    }
    function L(key, alphaKey, k = 1) {
      const ck = 'L' + key + alphaKey + k;
      if (cache.has(ck)) return cache.get(ck);
      const m = new T.LineBasicMaterial({ transparent: true, depthWrite: false });
      themed.push(() => { m.color.set(P[key]); m.opacity = P[alphaKey] * k; });
      cache.set(ck, m);
      return m;
    }
    const texDraws = [];
    function canvasTex(w, h, draw, o = {}) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      const t = new T.CanvasTexture(cv);
      t.anisotropy = 4;
      if (o.repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
      const redraw = () => { ctx.clearRect(0, 0, w, h); draw(ctx, w, h); t.needsUpdate = true; };
      if (o.themed !== false) texDraws.push(redraw); else redraw();
      return t;
    }
    const edgeCache = new Map();
    function edgesOf(geo, key) {
      if (key && edgeCache.has(key)) return edgeCache.get(key);
      const e = new T.EdgesGeometry(geo, 25);
      if (key) edgeCache.set(key, e);
      return e;
    }
    const boxCache = new Map();
    function boxGeo(w, h, d) {
      const k = w.toFixed(3) + h.toFixed(3) + d.toFixed(3);
      if (!boxCache.has(k)) boxCache.set(k, new T.BoxGeometry(w, h, d));
      return boxCache.get(k);
    }
    function B(parent, w, h, d, m, x, y, z, line) {
      const g = boxGeo(w, h, d);
      const mesh = new T.Mesh(g, m); mesh.position.set(x, y, z); parent.add(mesh);
      if (line) mesh.add(new T.LineSegments(edgesOf(g, 'b' + w.toFixed(3) + h.toFixed(3) + d.toFixed(3)), line));
      return mesh;
    }
    // iron railings as thin solid bars (hairlines read as glitches up close)
    const railGeo = new T.BoxGeometry(1, 1, 1);
    function rails(p, r = .022) {
      const n = p.length / 6, im = new T.InstancedMesh(railGeo, M('post'), n), o = new T.Object3D();
      const a = new T.Vector3(), b = new T.Vector3();
      for (let i = 0; i < n; i++) {
        a.fromArray(p, i * 6); b.fromArray(p, i * 6 + 3);
        o.position.copy(a).add(b).multiplyScalar(.5); o.scale.set(r * 2, r * 2, Math.max(a.distanceTo(b), 1e-3));
        o.lookAt(b); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      }
      return im;
    }
    function C(parent, rt, rb, h, m, x, y, z, seg = 20) {
      const mesh = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg), m); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    }
    function PL(parent, w, h, m, x, y, z, ry = 0, rx = 0) {
      const mesh = new T.Mesh(new T.PlaneGeometry(w, h), m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, 0, 'YXZ'); parent.add(mesh); return mesh;
    }
    const radialTex = (() => {
      let t = null;
      return () => t || (t = canvasTex(128, 128, (c, w) => {
        const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.42)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, w, w);
      }, { themed: false }));
    })();
    // soft light pools and LED spill: plain blending by day (additive vanishes on cream), additive at night
    function glow(parent, w, h, colorKey, alphaKey, x, y, z, ry = 0, rx = 0, k = 1) {
      const m = new T.MeshBasicMaterial({ map: radialTex(), transparent: true, depthWrite: false, fog: false });
      themed.push(() => { m.color.set(P[colorKey]); m.opacity = P[alphaKey] * k; m.blending = dark ? T.AdditiveBlending : T.NormalBlending; m.needsUpdate = true; });
      const p = PL(parent, w, h, m, x, y, z, ry, rx); p.renderOrder = 2; return p;
    }
    function blob(parent, w, d, x, z, k = 1, y = .004) {
      const m = new T.MeshBasicMaterial({ map: radialTex(), transparent: true, depthWrite: false });
      themed.push(() => { m.color.set(P.blob); m.opacity = P.blobA * k; });
      return PL(parent, w, d, m, x, y, z, 0, -Math.PI / 2);
    }
    function shapeRect(s, x0, x1, y0, y1, hole) {
      const p = hole ? new T.Path() : s;
      p.moveTo(x0, y0);
      if (hole) { p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); }
      else { p.lineTo(x1, y0); p.lineTo(x1, y1); p.lineTo(x0, y1); }
      p.closePath();
      if (hole) s.holes.push(p);
      return p;
    }

    // ---------- lights: SwapChain's ambient-heavy setup (x PI: three's Lambert divides by PI)
    const amb = new T.AmbientLight('#ffffff', 1);
    const sun = new T.DirectionalLight('#ffffff', 1); sun.position.set(1.0, 2.0, -1.4);
    const fill = new T.DirectionalLight('#EBF0FF', 1); fill.position.set(-1, 1.2, .8);
    scene.add(amb, sun, fill);
    themed.push(() => {
      amb.intensity = P.amb * Math.PI; sun.intensity = P.sun * Math.PI; fill.intensity = P.fill * Math.PI;
    });

    // ---------- sky and fog: the street fades into the page color, like the map's edge fog
    const skyU = { top: { value: new T.Color() }, low: { value: new T.Color() } };
    const sky = new T.Mesh(new T.SphereGeometry(300, 32, 16), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false, uniforms: skyU,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 low; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(low, top, smoothstep(.02, .55, vP.y)), 1.); }',
    }));
    scene.add(sky);
    scene.fog = new T.Fog('#ffffff', 26, 96);
    themed.push(() => {
      skyU.top.value.set(P.sky); skyU.low.value.set(P.horizon);
      scene.fog.color.set(P.horizon); scene.background = new T.Color(P.horizon);
    });

    const world = new T.Group(); scene.add(world);
    buildStreet(world);
    const frontDoor = buildMyHouse(world);
    buildRoom(world);
    const screen = buildMonitor(world);

    // ---------- theme
    function applyTheme() {
      P = dark ? PAL.dark : PAL.light;
      ov.classList.toggle('is-dark', dark);
      themed.forEach(f => f());
      texDraws.forEach(f => f());
    }
    applyTheme();
    checkTheme = () => {
      const d = readDark(themeDoc());
      if (d === dark) return;
      dark = d; applyTheme();
      if (!raf) render();
    };
    mo = new MutationObserver(checkTheme);
    const watch = (doc) => { try { mo.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] }); } catch (e) { /* fine */ } };
    watch(document); if (themeDoc() !== document) watch(themeDoc());
    mq.addEventListener && mq.addEventListener('change', checkTheme);

    // ================================================================ street
    function buildStreet(g) {
      // ground with the SwapChain grid, roads and walks laid over it
      const gr = new T.Mesh(new T.PlaneGeometry(600, 600), M('ground')); gr.rotation.x = -Math.PI / 2; gr.position.y = -.012; g.add(gr);
      const gp = [];
      for (let i = -150; i <= 150; i += 4) { gp.push(-300, 0, i, 300, 0, i, i, 0, -300, i, 0, 300); }
      const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(gp, 3));
      const grid = new T.LineSegments(gg, L('grid', 'gridA')); grid.position.y = -.005; g.add(grid);

      const Z0 = -64, Z1 = 64;
      const strip = (x0, x1, top, key, z0 = Z0, z1 = Z1) => B(g, x1 - x0, top, z1 - z0, M(key), (x0 + x1) / 2, top / 2, (z0 + z1) / 2);
      strip(ROAD[0], ROAD[1], .6, 'road');
      strip(WALK[0], WALK[1], YS, 'path'); strip(WALK2[0], WALK2[1], YS, 'path');
      strip(WALK[1] - .22, WALK[1], YS + .005, 'curb'); strip(WALK2[0], WALK2[0] + .22, YS + .005, 'curb');
      // soft lane hint and brick-walk joints, as hairlines
      const lp = [];
      for (let z = Z0; z < Z1; z += 1.2) { lp.push(WALK[0] + .2, YS + .003, z, WALK[1] - .3, YS + .003, z, WALK2[0] + .3, YS + .003, z, WALK2[1] - .2, YS + .003, z); }
      const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(lp, 3));
      g.add(new T.LineSegments(lg, L('roadEdge', 'edgeA', .9)));
      const cl = []; for (let z = Z0; z < Z1; z += 3) cl.push((ROAD[0] + ROAD[1]) / 2, .603, z, (ROAD[0] + ROAD[1]) / 2, .603, z + 1.6);
      const cg = new T.BufferGeometry(); cg.setAttribute('position', new T.Float32BufferAttribute(cl, 3));
      g.add(new T.LineSegments(cg, L('roadEdge', 'edgeA', 1)));

      // the far side: front gardens, then a continuous row
      strip(WALK2[1], FX2, YS - .03, 'green');
      rowOfHouses(g, -1, -70, 70, null);
      // our side: gardens and houses either side of my building
      strip(GARDEN[0], GARDEN[1], YS - .03, 'green', Z0, HOUSE.z0);
      strip(GARDEN[0], GARDEN[1], YS - .03, 'green', HOUSE.z1, Z1);
      rowOfHouses(g, 1, -70, HOUSE.z0, 'down');
      rowOfHouses(g, 1, HOUSE.z1, 70, 'up');

      // street trees and gas lamps along both curbs
      const trees = [], lamps = [];
      const clear = (z) => z > -3.5 && z < 9;           // keep the walk to my door open
      for (const side of [1, -1]) {
        const xT = side > 0 ? WALK[1] - .8 : WALK2[0] + .8, xL = side > 0 ? WALK[1] - .55 : WALK2[0] + .55;
        for (let z = -60 + (side > 0 ? 0 : 4); z < 62; z += 8 + rand() * 1.5) {
          if (side > 0 && clear(z)) continue;
          trees.push([xT, z + (rand() - .5), .85 + rand() * .35]);
          const zl = z + 4.2;
          if ((Math.round(z / 8) % 2 === 0) && !(side > 0 && clear(zl))) lamps.push([xL, zl]);
        }
      }
      buildTrees(g, trees);
      buildLamps(g, lamps);
    }

    function buildTrees(g, list) {
      const trunkG = new T.CylinderGeometry(.09, .14, 1, 8);
      const canG = new T.SphereGeometry(1, 20, 14);
      const trunks = new T.InstancedMesh(trunkG, M('trunk'), list.length);
      const cA = list.filter((_, i) => i % 2 === 0), cB = list.filter((_, i) => i % 2 === 1);
      const canA = new T.InstancedMesh(canG, M('canopy'), cA.length * 3);
      const canB = new T.InstancedMesh(canG, M('canopyB'), cB.length * 3);
      const o = new T.Object3D();
      list.forEach(([x, z, s], i) => {
        o.position.set(x, YS + 1.9 * s, z); o.scale.set(1, 3.8 * s, 1); o.rotation.set(0, 0, 0); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
      });
      const crowns = (arr, mesh) => arr.forEach(([x, z, s], i) => {
        const y = YS + 4.4 * s;
        [[0, 0, 0, 1.45], [.6, .4, .45, 1.05], [-.5, .3, -.55, 1.1]].forEach(([dx, dy, dz, r], k) => {
          o.position.set(x + dx * s, y + dy * s, z + dz * s); o.scale.set(r * s, r * s * .86, r * s); o.updateMatrix();
          mesh.setMatrixAt(i * 3 + k, o.matrix);
        });
      });
      crowns(cA, canA); crowns(cB, canB);
      g.add(trunks, canA, canB);
      list.forEach(([x, z, s]) => blob(g, 3.6 * s, 3.6 * s, x, z, .8, YS + .006));
    }

    function buildLamps(g, list) {
      const postM = M('post');
      const lantern = M('lantern', { basic: true });
      list.forEach(([x, z]) => {
        C(g, .045, .07, 2.5, postM, x, YS + 1.25, z, 10);
        C(g, .11, .11, .12, postM, x, YS + .06, z, 12);
        const hd = new T.Group(); hd.position.set(x, YS + 2.5, z); g.add(hd);
        C(hd, .1, .14, .08, postM, 0, .04, 0, 4).rotation.y = Math.PI / 4;
        C(hd, .16, .1, .4, lantern, 0, .28, 0, 4).rotation.y = Math.PI / 4;
        C(hd, .02, .2, .14, postM, 0, .55, 0, 4).rotation.y = Math.PI / 4;
        const sp = new T.Sprite(new T.SpriteMaterial({ map: radialTex(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
        sp.scale.set(1.8, 1.8, 1); sp.position.set(x, YS + 2.78, z); g.add(sp);
        themed.push(() => { sp.material.color.set(P.lantern); sp.material.opacity = P.glowA; sp.visible = P.glowA > 0; });
        glow(g, 4.2, 4.2, 'lantern', 'glowA', x - .2, YS + .02, z, 0, -Math.PI / 2, .28);
      });
    }

    // Row houses: stylized brownstones with stoops, cornices and some bow fronts. side 1 faces +x at FX,
    // side -1 faces -x at FX2. Past |z| > 44 they are drawn only as outlines in the grid color.
    function rowOfHouses(g, side, z0, z1, dir) {
      const houses = [];
      if (dir === 'down') { let z = z1; while (z > z0) { const w = 6 + rand() * 1.6; houses.push([z - w, z]); z -= w; } }
      else { let z = z0; while (z < z1) { const w = 6 + rand() * 1.6; houses.push([z, z + w]); z += w; } }
      const panes = { glass: [], lit: [], litB: [], ndoor: [] }, stones = [];
      const keys = ['building', 'buildingB', 'buildingC'];
      houses.forEach(([a, b], idx) => {
        const w = b - a, zc = (a + b) / 2, floors = rand() > .7 ? 4 : 3, top = .0 + floors * 2.95 + .1;
        const far = Math.abs(zc) > 44;
        const grp = new T.Group(); g.add(grp);
        if (side < 0) { grp.position.x = FX2; grp.rotation.y = Math.PI; grp.position.z = 0; } else grp.position.x = FX;
        // local frame: facade at x = 0 facing +x, z along the street (mirrored for the far side)
        const lz = side < 0 ? -zc : zc;
        if (far) {
          const bg = boxGeo(12, top, w);
          const ls = new T.LineSegments(edgesOf(bg, 'h' + w.toFixed(2) + top.toFixed(2)), L('wire', 'wireA', clamp(1.25 - (Math.abs(zc) - 44) / 26, .15, 1)));
          ls.position.set(-6, top / 2, lz); grp.add(ls);
          return;
        }
        const mk = keys[idx % 3];
        B(grp, 12, top, w - .04, M(mk), -6, top / 2, lz);
        const bow = rand() > .55 && w > 6.3;
        const doorLeft = rand() > .5;
        const dz = (doorLeft ? -1 : 1) * (w / 2 - 1.0);            // door column
        const cols = [];
        const usable = [-w / 2 + .9, w / 2 - .9];
        // window columns, away from the door
        const n = w > 7 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const span = doorLeft ? [dz + 1.55, usable[1]] : [usable[0], dz - 1.55];
          cols.push(n === 1 ? (span[0] + span[1]) / 2 : span[0] + (span[1] - span[0]) * i / (n - 1));
        }
        let bowDepth = 0;
        if (bow) {
          // a polygonal bow front across the window columns, full height
          bowDepth = .85;
          const c0 = Math.max(Math.min(...cols) - .9, -w / 2 + .08), c1 = Math.min(Math.max(...cols) + .9, w / 2 - .08);
          const sh = new T.Shape();
          sh.moveTo(c0, 0); sh.lineTo(c1, 0); sh.lineTo(c1 - .4, bowDepth); sh.lineTo(c0 + .4, bowDepth); sh.closePath();
          const bg = new T.ExtrudeGeometry(sh, { depth: top - .45, bevelEnabled: false });
          // shape x -> street (z), shape y -> out of the facade (x), extrusion -> up (y)
          bg.applyMatrix4(new T.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1));
          const bm = new T.Mesh(bg, M(mk)); bm.position.z = lz; grp.add(bm);
        }
        // cornice and a thin band at each floor line
        B(grp, .55 + bowDepth, .38, w + .02, M('stone'), (.55 + bowDepth) / 2 - .2, top + .05, lz);
        B(grp, .3 + bowDepth, .14, w + .02, M('stone'), (.3 + bowDepth) / 2 - .1, top - .3, lz);
        // stoop up to the parlor door
        stoop(grp, lz + dz, M(mk));
        // windows
        const lev = [[1.05, 2.25]];
        for (let f = 1; f < floors; f++) lev.push([2.95 * f + .45, 2.95 * f + (f === 1 ? 2.45 : 2.2)]);
        lev.forEach(([y0, y1], f) => {
          cols.forEach(cz => {
            const x = bowDepth + .03;
            panes[rand() > .62 ? (rand() > .5 ? 'lit' : 'litB') : 'glass'].push([x, (y0 + y1) / 2, lz + cz, .86, y1 - y0]);
            stones.push([x + .04, y1 + .1, lz + cz, 1.04, .16], [x + .06, y0 - .05, lz + cz, 1.0, .08]);
          });
          if (f >= 1 && f < floors) {
            const x = .03, y = f === 1 ? 3.0 : (y0 + y1) / 2;
            if (f === 1) {
              panes.ndoor.push([x, 3.0 + 1.15, lz + dz, .9, 2.3]);
              stones.push([x + .04, 3.0 + 2.45, lz + dz, 1.2, .18]);
            } else {
              panes[rand() > .6 ? 'lit' : 'glass'].push([x, y, lz + dz, .8, y1 - y0]);
              stones.push([x + .04, y1 + .1, lz + dz, 1.0, .16]);
            }
          }
        });
        // little railings on the garden edge
        fence(grp, lz - w / 2 + .1, lz + w / 2 - .1, lz + dz);
      });
      paneMeshes(g, panes, side);
      stoneMeshes(g, stones, side);
    }
    function stoop(grp, z, m, edge) {
      // side profile: landing at the parlor door, nine steps down to the walk
      const sh = new T.Shape(), x1 = GARDEN[1] - FX - .05, top = 2.95, n = 9;
      sh.moveTo(0, 0); sh.lineTo(x1, 0);
      const run = (x1 - .85) / n, rise = (top - YS) / n;
      let x = x1, y = YS;
      sh.lineTo(x, y);
      for (let i = 0; i < n; i++) { x -= run; sh.lineTo(x, y); y += rise; sh.lineTo(x, y); }
      sh.lineTo(0, top); sh.closePath();
      const geo = new T.ExtrudeGeometry(sh, { depth: 1.15, bevelEnabled: false });
      geo.translate(0, 0, -1.15 / 2);
      const s = new T.Mesh(geo, m); s.position.set(0, 0, z); grp.add(s);
      if (edge) s.add(new T.LineSegments(edgesOf(geo), edge));
      // iron rails following the steps
      const rp = [];
      for (const dzz of [-.55, .55]) {
        rp.push(.1, top + .9, z + dzz, .85, top + .9, z + dzz, .85, top + .9, z + dzz, x1 - .1, YS + .9, z + dzz);
        for (let i = 0; i <= 6; i++) { const xx = lerp(.85, x1 - .1, i / 6), yy = lerp(top, YS, i / 6); rp.push(xx, yy, z + dzz, xx, yy + .9, z + dzz); }
      }
      grp.add(rails(rp, .015));
    }
    function fence(grp, za, zb, zDoor) {
      const x = GARDEN[1] - FX - .1, y = YS, h = .85, p = [];
      const run = (a, b) => {
        if (b - a < .3) return;
        p.push(x, y + h, a, x, y + h, b, x, y + .12, a, x, y + .12, b);
        for (let zz = a; zz <= b + 1e-6; zz += .32) p.push(x, y, zz, x, y + h + .06, zz);
      };
      const lo = Math.min(zDoor - .7, zDoor + .7), hi = Math.max(zDoor - .7, zDoor + .7);
      run(za, lo); run(hi, zb);
      grp.add(rails(p, .011));
    }
    function paneMeshes(g, panes, side) {
      const geo = new T.BoxGeometry(.05, 1, 1), o = new T.Object3D();
      Object.entries(panes).forEach(([key, list]) => {
        if (!list.length) return;
        const im = new T.InstancedMesh(geo, M(key, { basic: true }), list.length);
        list.forEach(([x, y, z, w, h], i) => {
          o.position.set(side > 0 ? FX + x : FX2 - x, y, side > 0 ? z : -z); o.scale.set(1, h, w); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
        });
        g.add(im);
      });
    }
    function stoneMeshes(g, list, side) {
      const geo = new T.BoxGeometry(.12, 1, 1), o = new T.Object3D();
      const im = new T.InstancedMesh(geo, M('stone'), list.length);
      list.forEach(([x, y, z, w, h], i) => {
        o.position.set(side > 0 ? FX + x : FX2 - x, y, side > 0 ? z : -z); o.scale.set(1, h, w); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      });
      g.add(im);
    }

    // ================================================================ my building
    // Three units: garden (mine, the bottom one), parlor, top. White with purple outlines,
    // the way SwapChain marks the building you picked.
    function buildMyHouse(g) {
      const dormM = M('dorm'), edgeL = L('edge', 'edgeA');
      const z0 = HOUSE.z0, z1 = HOUSE.z1, top = HOUSE.top;
      const cols = [-2.3, -.3, 1.6];
      const parlorDoor = [4.4, 5.3];
      // facade with real openings (extruded, so the reveals show)
      const sh = new T.Shape(); shapeRect(sh, z0, z1, -.2, top);
      const holes = [[WIN.z0, WIN.z1, WIN.y0, WIN.y1], [DOOR.z0, DOOR.z1, 0, DOOR.y1], [parlorDoor[0], parlorDoor[1], 3.0, 5.3]];
      cols.forEach(c => { holes.push([c - .47, c + .47, 3.35, 5.45], [c - .45, c + .45, 6.35, 8.25]); });
      holes.push([3.3 - .42, 3.3 + .42, 6.35, 8.25]);
      [-.25, 1.6].forEach(c => holes.push([c - .45, c + .45, 1.05, 2.2]));
      holes.forEach(([a, b, c, d]) => shapeRect(sh, a, b, c, d, true));
      const fg = new T.ExtrudeGeometry(sh, { depth: .3, bevelEnabled: false });
      const fac = new T.Mesh(fg, dormM); fac.rotation.y = -Math.PI / 2; fac.position.x = FX; g.add(fac);
      fac.add(new T.LineSegments(edgesOf(fg), edgeL));
      // glass in every opening except the two doors
      const glassW = holes.filter((_, i) => i !== 1 && i !== 2);
      glassW.forEach(([a, b, c, d], i) => {
        const isMine = i === 0;
        const isGarden = !isMine && c < 2.5;
        const m = isMine ? M('mine', { basic: true, side: T.DoubleSide }) : M(isGarden ? 'glass' : (i % 3 === 1 ? 'lit' : 'glass'), { basic: true });
        const pane = PL(g, b - a, d - c, m, FX - .16, (c + d) / 2, (a + b) / 2, Math.PI / 2);
        if (isMine) pane.position.x = FX - .06;
        // sills and lintels
        B(g, .16, .07, b - a + .22, dormM, FX + .06, c - .035, (a + b) / 2, edgeL);
        B(g, .1, .2, b - a + .26, dormM, FX + .04, d + .12, (a + b) / 2, edgeL);
        // muntin
        const mp = [FX - .155, c, (a + b) / 2, FX - .155, d, (a + b) / 2, FX - .155, (c + d) / 2 + (d - c) * .08, a, FX - .155, (c + d) / 2 + (d - c) * .08, b];
        const mg = new T.BufferGeometry(); mg.setAttribute('position', new T.Float32BufferAttribute(mp, 3));
        g.add(new T.LineSegments(mg, edgeL));
      });
      // the parlor door (closed) with a transom
      B(g, .06, 2.0, .86, M('door'), FX - .2, 4.0, (parlorDoor[0] + parlorDoor[1]) / 2, edgeL);
      PL(g, .86, .26, M('glass', { basic: true }), FX - .19, 5.15, (parlorDoor[0] + parlorDoor[1]) / 2, Math.PI / 2);
      // cornice: a deep top band with brackets
      B(g, .7, .36, z1 - z0 + .04, M('dorm'), FX + .15, top + .18, (z0 + z1) / 2, edgeL);
      B(g, .45, .14, z1 - z0, M('dorm'), FX + .02, top - .1, (z0 + z1) / 2, edgeL);
      for (let z = z0 + .3; z < z1; z += .9) B(g, .4, .3, .12, M('dorm'), FX + .1, top - .1, z, edgeL);
      [2.9, 5.95].forEach(y => B(g, .14, .12, z1 - z0, M('dorm'), FX + .05, y, (z0 + z1) / 2, edgeL));
      // mass behind, and the party walls, so nothing shows through from the street
      B(g, 12, top - 2.75, z1 - z0, dormM, FX - .3 - 6, 2.75 + (top - 2.75) / 2, (z0 + z1) / 2);
      // stoop to the parlor
      stoop({ add: (o) => { o.position.x += FX; g.add(o); } }, (parlorDoor[0] + parlorDoor[1]) / 2, dormM, edgeL);
      // front garden, with the stair well down to my door cut out of it
      const gm = M('green');
      B(g, GARDEN[1] - GARDEN[0], YS - .03, DOOR.z0 - .05 - z0, gm, (GARDEN[0] + GARDEN[1]) / 2, (YS - .03) / 2, (z0 + DOOR.z0 - .05) / 2);
      B(g, GARDEN[1] - GARDEN[0], YS - .03, z1 - (DOOR.z1 + .05), gm, (GARDEN[0] + GARDEN[1]) / 2, (YS - .03) / 2, (DOOR.z1 + .05 + z1) / 2);
      const wellZ = (DOOR.z0 + DOOR.z1) / 2, wellW = DOOR.z1 - DOOR.z0 + .1;
      const steps = [[4.35, 4.6, .5625], [4.1, 4.35, .375], [3.85, 4.1, .1875]];
      steps.forEach(([a, b, h]) => B(g, b - a, h, wellW, dormM, (a + b) / 2, h / 2, wellZ, edgeL));
      B(g, 3.85 - FX, .02, wellW, dormM, (FX + 3.85) / 2, .01, wellZ, edgeL);
      // the walk from the curb to the steps
      // the garden fence, open at the well and the stoop
      const rp = [];
      [[z0 + .1, 1.2]].forEach(([a, b]) => {
        const x = GARDEN[1] - .1;
        rp.push(x, YS + .85, a, x, YS + .85, b, x, YS + .12, a, x, YS + .12, b);
        for (let zz = a; zz <= b; zz += .32) rp.push(x, YS, zz, x, YS + .9, zz);
      });
      g.add(rails(rp, .011));
      // my front door: purple, swings in as the camera arrives
      const hinge = new T.Group(); hinge.position.set(FX - .16, 0, DOOR.z1); g.add(hinge);
      const leaf = B(hinge, .05, DOOR.y1 - .02, DOOR.z1 - DOOR.z0 - .02, M('door'), 0, DOOR.y1 / 2, -(DOOR.z1 - DOOR.z0) / 2, edgeL);
      [[.7], [1.55]].forEach(([y]) => B(leaf, .02, .55, .6, M('door'), .03, y - DOOR.y1 / 2, 0, L('edge', 'edgeA', .5)));
      const knob = new T.Mesh(new T.SphereGeometry(.03, 12, 8), M('pale')); knob.position.set(.05, 1.0 - DOOR.y1 / 2, -(DOOR.z1 - DOOR.z0) / 2 + .12); leaf.add(knob);
      // porch light by the door
      glow(g, .9, .9, 'lantern', 'glowA', FX + .02, 2.45, DOOR.z0 - .3, Math.PI / 2, 0, .45);
      B(g, .08, .2, .12, M('lantern', { basic: true }), FX + .05, 2.45, DOOR.z0 - .3, edgeL);
      return hinge;
    }

    // ================================================================ hall + room
    function drapeGeo(len, flat, r, width, segL = 40, segW = 6) {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= segL; i++) {
        const s = len * i / segL;
        let x, y;
        if (s <= flat) { x = -s; y = 0; }
        else if (s <= flat + r * Math.PI / 2) { const a = (s - flat) / r; x = -flat - Math.sin(a) * r; y = -r + Math.cos(a) * r; }
        else { x = -flat - r; y = -r - (s - flat - r * Math.PI / 2); }
        for (let j = 0; j <= segW; j++) {
          const v = j / segW, z = (v - .5) * width;
          pos.push(x, y + (s <= flat ? Math.sin(v * Math.PI * 2 + s * 3) * .004 : 0), z);
          uv.push(s / len, v);
        }
      }
      for (let i = 0; i < segL; i++) for (let j = 0; j < segW; j++) { const a = i * (segW + 1) + j, b = a + segW + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    }

    function buildRoom(g) {
      const room = new T.Group(); g.add(room);
      const wallM = M('wall'), trimM = M('trim'), fe = L('furnEdge', 'furnEdgeA');
      const wood = M('wood'), woodDeep = M('woodDeep'), darkM = M('dark');

      // shell: floor, ceiling, walls (the street wall's inner face has the window)
      PL(room, RW * 2, RD * 2, M('floor'), 0, 0, 0, 0, -Math.PI / 2);
      PL(room, RW * 2, RD * 2, wallM, 0, RH, 0, 0, Math.PI / 2);
      PL(room, RD * 2, RH, wallM, -RW, RH / 2, 0, Math.PI / 2);
      PL(room, RW * 2, RH, wallM, 0, RH / 2, -RD, 0);
      const rs = new T.Shape(); shapeRect(rs, -RD, RD, 0, RH); shapeRect(rs, WIN.z0, WIN.z1, WIN.y0, WIN.y1, true);
      const rwall = new T.Mesh(new T.ShapeGeometry(rs), wallM); rwall.rotation.y = -Math.PI / 2; rwall.position.x = RW - .001; room.add(rwall);
      // near wall, with the door to the hall (both faces)
      const ns = new T.Shape();
      ns.moveTo(-RW, 0); ns.lineTo(RDOOR.x0, 0); ns.lineTo(RDOOR.x0, RDOOR.y1); ns.lineTo(RDOOR.x1, RDOOR.y1); ns.lineTo(RDOOR.x1, 0);
      ns.lineTo(RW, 0); ns.lineTo(RW, RH); ns.lineTo(-RW, RH); ns.closePath();
      const nw = new T.Mesh(new T.ExtrudeGeometry(ns, { depth: HALL.z0 - RD, bevelEnabled: false }), wallM); nw.position.z = RD; room.add(nw);
      // baseboards
      B(room, .02, .1, RD * 2, trimM, -RW + .01, .05, 0); B(room, RW * 2, .1, .02, trimM, 0, .05, -RD + .01);
      B(room, .02, .1, RD * 2, trimM, RW - .01, .05, 0);
      B(room, RDOOR.x0 + RW, .1, .02, trimM, (-RW + RDOOR.x0) / 2, .05, RD - .01);
      // door frame and the open door
      [RDOOR.x0 - .03, RDOOR.x1 + .03].forEach(x => B(room, .06, RDOOR.y1 + .06, .14, trimM, x, (RDOOR.y1 + .06) / 2, RD + .05, fe));
      B(room, RDOOR.x1 - RDOOR.x0 + .12, .06, .14, trimM, (RDOOR.x0 + RDOOR.x1) / 2, RDOOR.y1 + .03, RD + .05, fe);
      const dh = new T.Group(); dh.position.set(RDOOR.x1 - .02, 0, RD - .02); dh.rotation.y = -1.5; room.add(dh);
      B(dh, RDOOR.x1 - RDOOR.x0 - .04, RDOOR.y1 - .02, .04, trimM, -(RDOOR.x1 - RDOOR.x0) / 2, RDOOR.y1 / 2, 0, fe);

      // hall: floor, ceiling, walls, a runner and a sconce
      const hl = HALL, hw = hl.z1 - hl.z0, hx = (hl.x0 + RW) / 2, hlen = RW - hl.x0;
      PL(room, hlen, hw, M('floor'), hx, 0, (hl.z0 + hl.z1) / 2, 0, -Math.PI / 2);
      PL(room, hlen, hw, wallM, hx, RH, (hl.z0 + hl.z1) / 2, 0, Math.PI / 2);
      PL(room, hlen, RH, wallM, hx, RH / 2, hl.z1, Math.PI);
      PL(room, hw, RH, wallM, hl.x0, RH / 2, (hl.z0 + hl.z1) / 2, Math.PI / 2);
      const hs = new T.Shape();
      hs.moveTo(hl.z0, 0); hs.lineTo(DOOR.z0, 0); hs.lineTo(DOOR.z0, DOOR.y1); hs.lineTo(DOOR.z1, DOOR.y1); hs.lineTo(DOOR.z1, 0);
      hs.lineTo(hl.z1, 0); hs.lineTo(hl.z1, RH); hs.lineTo(hl.z0, RH); hs.closePath();
      const hwall = new T.Mesh(new T.ShapeGeometry(hs), wallM); hwall.rotation.y = -Math.PI / 2; hwall.position.x = RW - .001; room.add(hwall);
      B(room, hlen - .4, .006, .62, M('couch'), hx - .1, .003, (hl.z0 + hl.z1) / 2);
      glow(room, .9, .9, 'led', 'ledA', hl.x0 + .01, 1.8, (hl.z0 + hl.z1) / 2, Math.PI / 2, 0, 1.4);
      B(room, .04, .16, .1, M('pale'), hl.x0 + .02, 1.8, (hl.z0 + hl.z1) / 2, fe);

      // ceiling light
      const LX = 0, LZ = -.3;
      C(room, .23, .23, .012, M('metal'), LX, RH - .006, LZ, 40);
      const dome = new T.Mesh(new T.SphereGeometry(.2, 32, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M('pale', { basic: true }));
      dome.scale.y = .32; dome.position.set(LX, RH - .012, LZ); room.add(dome);

      // rug: cream with bold swirls, in the palette's lavender
      const rugTex = canvasTex(1024, 1434, (c, w, h) => {
        c.fillStyle = P.rugBase; c.fillRect(0, 0, w, h);
        c.fillStyle = P.rugInk;
        let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        const swirl = (x0, slope, amp, ph, base, ph2, f1, f2) => {
          for (let y = -80; y <= h + 80; y += 3) {
            const x = x0 + Math.sin(y / f1 + ph) * amp + Math.sin(y / f2 + ph2) * 26 + y * slope;
            const wd = base * (.5 + .5 * Math.sin(y / 160 + ph2 * 2)) + 9;
            c.beginPath(); c.arc(x, y, wd / 2, 0, 7); c.fill();
          }
        };
        for (let i = 0; i < 6; i++) swirl(-40 + i * 210 + r() * 60, .1, 110 + r() * 90, r() * 6, 22 + r() * 18, r() * 6, 280, 110);
        for (let i = 0; i < 3; i++) swirl(-300 + i * 420 + r() * 80, .55, 160, r() * 6, 16 + r() * 12, r() * 6, 340, 150);
      });
      const rugM = new T.MeshLambertMaterial({ map: rugTex });
      B(room, 2.5, .016, 3.5, rugM, -.2, .008, .85);

      // desk on the left wall: wide top, a cabinet under each end
      const dz = 1.2, dx = -1.54, DW = 2.3;
      B(room, .72, .035, DW, wood, dx, .74, dz, fe);
      [-1, 1].forEach(sg => {
        const z = dz + sg * .84;
        B(room, .62, .7, .52, woodDeep, dx + .02, .35, z, fe);
        B(room, .008, .3, .47, M('woodFront'), dx + .335, .53, z, fe);
        B(room, .008, .34, .47, M('woodFront'), dx + .335, .19, z, fe);
        B(room, .012, .012, .14, M('metal'), dx + .343, .64, z); B(room, .012, .012, .14, M('metal'), dx + .343, .32, z);
      });
      B(room, .42, .004, 1.0, darkM, dx + .1, .759, dz - .05);
      B(room, .14, .018, .42, M('pale'), dx + .2, .77, dz - .02, fe);
      B(room, .1, .02, .06, M('pale'), dx + .2, .772, dz - .4);
      B(room, .12, .2, .12, darkM, dx - .17, .86, dz - .7);
      B(room, .12, .13, .12, darkM, dx - .17, .822, dz + .68);
      blob(room, .9, 2.5, dx + .05, dz, 1.2, .02);

      // laptop on a stand at the left end of the desk
      const lap = new T.Group(); lap.position.set(dx + .04, .757, dz + .98); lap.rotation.y = -.3; room.add(lap);
      const metal = M('metal');
      [-1, 1].forEach(sg => {
        const sh = new T.Shape(); sh.moveTo(-.1, 0); sh.lineTo(.1, 0); sh.lineTo(.09, .012); sh.lineTo(-.09, .1); sh.lineTo(-.1, .1); sh.closePath();
        const plate = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: .012, bevelEnabled: false }), metal); plate.position.set(0, 0, sg * .12 - .006); lap.add(plate);
      });
      const lb = new T.Group(); lb.position.set(0, .058, 0); lb.rotation.z = .42; lap.add(lb);
      B(lb, .22, .012, .31, metal, 0, .006, 0);
      const lid = new T.Group(); lid.position.set(-.11, .012, 0); lid.rotation.z = -.5; lb.add(lid);
      B(lid, .006, .21, .31, metal, 0, .105, 0);
      const lapTex = canvasTex(256, 160, (c, w, h) => softScreen(c, w, h));
      PL(lid, .29, .19, new T.MeshBasicMaterial({ map: lapTex, fog: false }), .0035, .105, 0, Math.PI / 2);
      // plant on the left speaker
      const px = dx - .17, pz = dz + .68, py = .887;
      C(room, .05, .04, .09, M('pot'), px, py + .045, pz);
      for (let i = 0; i < 9; i++) {
        const lf = new T.Mesh(new T.SphereGeometry(.035 + rand() * .02, 10, 8), M('leaf'));
        lf.position.set(px + (rand() - .5) * .09, py + .12 + rand() * .09, pz + (rand() - .5) * .09); room.add(lf);
      }
      // TV on the wall above the desk
      B(room, .045, .72, 1.26, darkM, -RW + .03, 1.8, dz, fe);
      const tvTex = canvasTex(512, 288, (c, w, h) => softScreen(c, w, h, true));
      PL(room, 1.22, .68, new T.MeshBasicMaterial({ map: tvTex, fog: false }), -RW + .055, 1.8, dz, Math.PI / 2);
      // LED light behind the monitor and from the floor lamp
      glow(room, 2.0, 1.0, 'led', 'ledA', -RW + .012, 1.0, dz, Math.PI / 2, 0, 1.6);
      const lz = dz + 1.36, lx = -RW + .16;
      C(room, .13, .14, .02, darkM, lx, .01, lz, 32);
      C(room, .012, .012, 1.65, darkM, lx, .84, lz, 12);
      B(room, .004, 1.3, .012, M('led', { basic: true }), lx - .014, 1.0, lz);
      glow(room, 1.3, 2.4, 'led', 'ledA', -RW + .01, 1.05, lz - .05, Math.PI / 2, 0, 1.4);
      blob(room, .5, .5, lx, lz);

      // chair, backrest toward the camera, mesh back you can see through
      const ch = new T.Group(); ch.position.set(-.86, 0, dz); room.add(ch);
      const fabric = M('chair');
      B(ch, .5, .09, .5, fabric, 0, .5, 0, fe);
      const back = new T.Group(); back.position.set(.27, .6, 0); back.rotation.z = -.1; ch.add(back);
      [-1, 1].forEach(sg => B(back, .045, .38, .045, fabric, 0, .19, sg * .2));
      B(back, .05, .05, .46, fabric, 0, .38, 0); B(back, .045, .04, .42, fabric, 0, .02, 0);
      B(back, .012, .33, .38, M('chair', { alpha: .55, side: T.DoubleSide }), 0, .2, 0);
      B(ch, .03, .16, .06, darkM, .27, .53, 0);
      [-1, 1].forEach(sg => { B(ch, .26, .025, .05, darkM, .02, .66, sg * .26); B(ch, .025, .14, .025, darkM, .02, .58, sg * .26); });
      C(ch, .025, .025, .3, metal, 0, .32, 0, 12);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 + .3;
        const leg = B(ch, .3, .03, .04, darkM, Math.cos(a) * .15, .1, Math.sin(a) * .15); leg.rotation.y = -a;
        const w = new T.Mesh(new T.SphereGeometry(.028, 10, 6), darkM); w.position.set(Math.cos(a) * .3, .03, Math.sin(a) * .3); ch.add(w);
      }
      blob(room, .9, .9, -.86, dz, 1.2, .02);

      // dresser on the far wall
      const drx = -.92, drz = -RD + .24;
      B(room, .86, 1.24, .46, woodDeep, drx, .64, drz, fe);
      B(room, .9, .03, .5, woodDeep, drx, 1.275, drz + .01, fe);
      for (let i = 0; i < 6; i++) {
        const y = .14 + i * .19 + .09;
        B(room, .8, .17, .01, M('woodFront'), drx, y, drz + .235, fe);
        B(room, .14, .012, .014, metal, drx, y + .03, drz + .245);
      }
      blob(room, 1.2, .8, drx, drz + .1);

      // bed in the far corner, slatted headboard on the street wall
      const bx0 = -.12, bx1 = RW - .04, bz0 = -RD + .02, bz1 = -1.5;
      const bcx = (bx0 + bx1) / 2, bcz = (bz0 + bz1) / 2, bw = bx1 - bx0, bd = bz1 - bz0;
      B(room, bw, .26, bd, woodDeep, bcx, .18, bcz, fe);
      [bz0 + .03, bz1 - .03].forEach(z => B(room, .06, 1.02, .06, woodDeep, bx1 - .03, .51, z, fe));
      B(room, .06, .07, bd, woodDeep, bx1 - .03, 1.0, bcz, fe);
      B(room, .05, .06, bd - .06, woodDeep, bx1 - .03, .44, bcz);
      for (let i = 0; i < 10; i++) B(room, .03, .5, .055, wood, bx1 - .03, .72, bz0 + .14 + i * (bd - .28) / 9);
      const duvetM = M('duvet');
      B(room, bw - .1, .26, bd + .1, duvetM, bcx - .04, .44, bcz, fe);
      [[.25, -.18, .9], [.62, .2, .7], [.95, -.05, .8]].forEach(([fx, fz, l]) => {
        const f = new T.Mesh(new T.CapsuleGeometry(.05, l * bd * .6, 4, 10), duvetM);
        f.rotation.x = Math.PI / 2; f.rotation.z = .15 * (fz > 0 ? 1 : -1); f.scale.set(1.6, 1, .38);
        f.position.set(bx0 + fx, .565, bcz + fz); room.add(f);
      });
      const pil = (z) => { const p = new T.Mesh(new T.CapsuleGeometry(.1, .4, 4, 12), duvetM); p.rotation.set(Math.PI / 2, 0, .6); p.scale.set(1.8, 1, .9); p.position.set(bx1 - .27, .7, z); room.add(p); };
      pil(bcz - .33); pil(bcz + .33);
      const np = new T.Mesh(new T.CapsuleGeometry(.07, .3, 4, 12), M('chair')); np.rotation.set(Math.PI / 2, 0, .45); np.scale.set(1.8, 1, .9); np.position.set(bx1 - .42, .66, bcz + .12); room.add(np);
      const stripeTex = canvasTex(1024, 256, (c, w, h) => {
        const A = P.pale, Bc = P.chair, Cc = '#E8935A', D = P.metal;
        const bands = [A, A, Bc, A, Cc, A, D, A, Bc, Bc, A, A, Bc, A, Cc, A, D, A, Bc, A];
        const bw2 = w / bands.length; bands.forEach((col, i) => { c.fillStyle = col; c.fillRect(i * bw2, 0, bw2 + 1, h); });
      });
      const run = new T.Mesh(drapeGeo(1.85, 1.45, .09, .52), new T.MeshLambertMaterial({ map: stripeTex, side: T.DoubleSide }));
      run.position.set(bx0 + 1.45 + .04, .585, bz1 - .42); room.add(run);
      blob(room, bw + .6, bd + .5, bcx, bcz);

      // jersey on the far wall (#8, no logos)
      const jz = -RD + .012, jx = .48;
      const js = new T.Shape();
      js.moveTo(-.12, .3); js.quadraticCurveTo(0, .24, .12, .3); js.lineTo(.3, .22); js.lineTo(.36, .02); js.lineTo(.21, -.02);
      js.lineTo(.2, -.42); js.lineTo(-.2, -.42); js.lineTo(-.21, -.02); js.lineTo(-.36, .02); js.lineTo(-.3, .22); js.closePath();
      const jg = new T.ExtrudeGeometry(js, { depth: .012, bevelEnabled: false });
      const jersey = new T.Mesh(jg, darkM); jersey.position.set(jx, 1.6, jz); room.add(jersey);
      jersey.add(new T.LineSegments(edgesOf(jg), fe));
      const numTex = canvasTex(256, 256, (c, w) => {
        c.font = '700 200px -apple-system, "Helvetica Neue", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 10; c.strokeStyle = '#8F7FF7'; c.strokeText('8', w / 2, w / 2 + 8);
        c.fillStyle = '#FFFDFA'; c.fillText('8', w / 2, w / 2 + 8);
      }, { themed: false });
      PL(room, .26, .26, new T.MeshBasicMaterial({ map: numTex, transparent: true }), jx, 1.5, jz + .02);
      B(room, .5, .006, .006, metal, jx, 1.89, jz + .02);

      // couch on the street wall side, facing the desk
      const velvet = M('couch');
      const cx0 = RW - .9, cz0 = -.95, cz1 = 1.05, ccz = (cz0 + cz1) / 2, cl = cz1 - cz0;
      B(room, .88, .22, cl, velvet, cx0 + .44, .22, ccz, fe);
      B(room, .22, .5, cl, velvet, RW - .13, .6, ccz, fe);
      [cz0 + .09, cz1 - .09].forEach(z => B(room, .88, .38, .18, velvet, cx0 + .44, .45, z, fe));
      [ccz - cl / 4 + .05, ccz + cl / 4 - .05].forEach(z => B(room, .66, .13, cl / 2 - .2, velvet, cx0 + .33, .395, z, fe));
      const throwM = M('throw');
      B(room, .3, .06, .66, throwM, RW - .14, .87, ccz - .06);
      const th2 = B(room, .06, .42, .64, throwM, RW - .29, .67, ccz - .05); th2.rotation.z = .2;
      const th3 = B(room, .5, .07, .7, throwM, cx0 + .42, .49, ccz - .03); th3.rotation.y = .06;
      const bol = new T.Mesh(new T.CapsuleGeometry(.08, .3, 6, 16), velvet); bol.rotation.x = Math.PI / 2; bol.position.set(cx0 + .38, .56, ccz - .05); room.add(bol);
      blob(room, 1.3, cl + .5, cx0 + .44, ccz);
      // three framed skyline prints above the couch
      [['Boston', ccz - .62], ['Baltimore', ccz], ['Philly', ccz + .62]].forEach(([city, z]) => {
        B(room, .025, .62, .48, woodDeep, RW - .015, 1.68, z, fe);
        PL(room, .4, .53, new T.MeshLambertMaterial({ map: printTex(city) }), RW - .029, 1.68, z, -Math.PI / 2);
      });

      // the window from inside: frame, sill, blinds
      const wz = (WIN.z0 + WIN.z1) / 2, ww = WIN.z1 - WIN.z0, wh = WIN.y1 - WIN.y0, wy = (WIN.y0 + WIN.y1) / 2;
      B(room, .08, .04, ww + .16, trimM, RW - .02, WIN.y0 - .02, wz, fe);
      [WIN.z0 - .03, WIN.z1 + .03].forEach(z => B(room, .03, wh + .1, .06, trimM, RW - .005, wy, z, fe));
      B(room, .03, .06, ww + .12, trimM, RW - .005, WIN.y1 + .03, wz, fe);
      const slats = new T.InstancedMesh(new T.BoxGeometry(.03, .006, ww - .04), trimM, 18);
      const tmp = new T.Object3D();
      for (let i = 0; i < 18; i++) { tmp.position.set(RW + .1, WIN.y1 - .04 - i * .031, wz); tmp.rotation.z = .5; tmp.updateMatrix(); slats.setMatrixAt(i, tmp.matrix); }
      room.add(slats);
      return room;
    }

    function softScreen(c, w, h, tv) {
      c.fillStyle = P.screenBg; c.fillRect(0, 0, w, h);
      const cols = dark ? ['rgba(96,76,156,.85)', 'rgba(143,127,247,.6)', 'rgba(232,147,90,.45)'] : ['rgba(143,127,247,.45)', 'rgba(232,147,90,.35)', 'rgba(96,76,156,.3)'];
      [[.25, .35, .6], [.75, .65, .6], [.55, .15, .4]].forEach(([x, y, r], i) => {
        const g = c.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
        g.addColorStop(0, cols[(i + (tv ? 1 : 0)) % 3]); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
      });
    }
    function printTex(city) {
      return canvasTex(512, 680, (c, w, h) => {
        c.fillStyle = '#FBFAF6'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#1b1b1f'; c.fillStyle = '#1b1b1f'; c.lineWidth = 2.4; c.lineJoin = 'round';
        const rectB = (x, y, bw, bh, win = true) => {
          c.strokeRect(x, y, bw, bh);
          if (win) for (let yy = y + 12; yy < y + bh - 10; yy += 16) for (let xx = x + 8; xx < x + bw - 8; xx += 13) c.strokeRect(xx, yy, 5, 7);
        };
        c.font = 'italic 600 52px "Snell Roundhand", "Brush Script MT", cursive'; c.fillText(city, 70, 150);
        c.lineWidth = 2;
        if (city === 'Boston') {
          rectB(70, 380, 60, 140); rectB(140, 330, 50, 190); rectB(330, 360, 70, 160); rectB(410, 410, 40, 110);
          rectB(215, 250, 70, 270); c.beginPath(); c.moveTo(215, 250); c.lineTo(250, 180); c.lineTo(285, 250); c.stroke();
          c.beginPath(); c.moveTo(250, 180); c.lineTo(250, 150); c.stroke();
          c.beginPath(); c.moveTo(300, 300); c.lineTo(300, 520); c.stroke();
          for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(300, 305); c.lineTo(310 + i * 22, 470); c.stroke(); }
        } else if (city === 'Baltimore') {
          rectB(80, 300, 70, 220); rectB(160, 360, 55, 160); rectB(300, 330, 60, 190); rectB(370, 380, 70, 140);
          rectB(225, 240, 60, 280); c.beginPath(); c.moveTo(225, 240); c.lineTo(255, 200); c.lineTo(285, 240); c.stroke();
        } else {
          rectB(70, 380, 70, 140); rectB(150, 320, 50, 200); rectB(330, 300, 60, 220); rectB(400, 390, 50, 130);
          rectB(240, 250, 50, 150, false); c.beginPath(); c.arc(265, 280, 13, 0, Math.PI * 2); c.stroke();
          c.beginPath(); c.moveTo(240, 250); c.quadraticCurveTo(265, 170, 290, 250); c.stroke();
        }
        c.lineWidth = 2.4; c.beginPath(); c.moveTo(60, 520); c.lineTo(460, 520); c.stroke();
      }, { themed: false });
    }

    // ================================================================ monitor
    function buildMonitor(g) {
      const S = SCREEN, strips = [];
      let bendK = 1 / S.R, region = { u0: .25, u1: .75 };
      const bendXZ = (u, off, k) => {
        const s = (u - .5) * S.w;
        if (k < 1e-5) return [S.X0 + off, S.cz - s];
        const a = s * k, ca = Math.cos(a), sa = Math.sin(a);
        return [S.X0 + (1 - ca) / k + off * ca, S.cz - sa / k + off * sa];
      };
      const place = (m) => {
        const s = m.userData.strip, p = m.geometry.attributes.position.array;
        for (let i = 0; i <= s.n; i++) {
          const u = s.u0 + (s.u1 - s.u0) * i / s.n;
          const [xa, za] = bendXZ(u, s.offA, bendK), [xb, zb] = bendXZ(u, s.offB, bendK);
          p[i * 6] = xa; p[i * 6 + 1] = s.yA; p[i * 6 + 2] = za; p[i * 6 + 3] = xb; p[i * 6 + 4] = s.yB; p[i * 6 + 5] = zb;
        }
        m.geometry.attributes.position.needsUpdate = true;
        if (s.lit) m.geometry.computeVertexNormals();
        m.geometry.computeBoundingSphere();
      };
      const makeStrip = (spec, material) => {
        const n = spec.segs || 64, geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(new Float32Array((n + 1) * 6), 3));
        const uv = []; for (let i = 0; i <= n; i++) uv.push(i / n, 0, i / n, 1);
        geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        const idx = []; for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        geo.setIndex(idx);
        const m = new T.Mesh(geo, material); m.userData.strip = { ...spec, n }; g.add(m); strips.push(m); place(m);
        return m;
      };
      const computeRegion = () => {
        const a = Math.min(innerWidth / innerHeight, S.w / S.h), half = S.h * a / 2 / S.w;
        region = { u0: .5 - half, u1: .5 + half };
      };
      computeRegion();
      // the ultrawide's wallpaper: the palette's soft gradient plus two editor panes each side
      const W = 2048, H = Math.round(W * S.h / S.w);
      const desk = canvasTex(W, H, (c) => {
        c.fillStyle = P.screenBg; c.fillRect(0, 0, W, H);
        const blobC = (x, y, r, col) => { const gg = c.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, col); gg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gg; c.fillRect(0, 0, W, H); };
        blobC(W * .08, H * 1.05, H * .9, dark ? 'rgba(143,127,247,.32)' : 'rgba(143,127,247,.22)');
        blobC(W * .94, -H * .1, H * .7, dark ? 'rgba(232,147,90,.2)' : 'rgba(232,147,90,.18)');
        const mbH = H * 40 / 900;
        c.fillStyle = P.screenBar; c.fillRect(0, 0, W, mbH);
        const s = H / 900;
        const pane = (x, y, w, h, seed) => {
          c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, 18 * s) : c.rect(x, y, w, h);
          c.fillStyle = P.screenPane; c.fill(); c.strokeStyle = P.screenLine; c.lineWidth = Math.max(1, s); c.stroke();
          ['#E0685A', '#E0B04F', '#5FBF6A'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(x + (20 + i * 18) * s, y + 18 * s, 5 * s, 0, 7); c.fill(); });
          let r = seed;
          for (let ly = y + 48 * s; ly < y + h - 18 * s; ly += 17 * s) {
            r = (r * 9301 + 49297) % 233280; const f = r / 233280;
            const indent = Math.floor(f * 4) * 20 * s, len = (60 + f * 260) * s;
            c.fillStyle = f > .7 ? 'rgba(143,127,247,.55)' : f > .45 ? 'rgba(232,147,90,.45)' : P.screenLine;
            c.fillRect(x + 20 * s + indent, ly, Math.max(4, Math.min(len, w - 44 * s - indent)), 6 * s);
          }
        };
        const side = (xa, xb, seed) => {
          const sw = xb - xa, pad = 26 * s; if (sw < 120 * s) return;
          const cols = Math.max(1, Math.round(sw / (H * .75))), cw = (sw - pad * (cols + 1)) / cols;
          for (let i = 0; i < cols; i++) {
            const x = xa + pad + i * (cw + pad), split = (i % 2 ? .42 : .6) * (H - mbH - pad * 3);
            pane(x, mbH + pad, cw, split, seed + i * 7);
            pane(x, mbH + pad * 2 + split, cw, H - mbH - pad * 3 - split, seed + i * 13 + 3);
          }
        };
        side(0, region.u0 * W, 17); side(region.u1 * W, W, 33);
      });
      makeStrip({ u0: 0, u1: 1, yA: S.cy - S.h / 2, yB: S.cy + S.h / 2, offA: 0, offB: 0, segs: 96 }, new T.MeshBasicMaterial({ map: desk, side: T.DoubleSide, fog: false }));
      // the hole: writes transparent pixels so the real page behind the canvas shows through
      const holeM = new T.MeshBasicMaterial({
        color: 0x000000, side: T.DoubleSide, fog: false, transparent: false,
        blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.ZeroFactor, blendDst: T.ZeroFactor,
        blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.ZeroFactor,
      });
      let hole = null;
      const makeHole = () => {
        if (hole) { g.remove(hole); hole.geometry.dispose(); strips.splice(strips.indexOf(hole), 1); }
        hole = makeStrip({ u0: region.u0, u1: region.u1, yA: S.cy - S.h / 2, yB: S.cy + S.h / 2, offA: OVER, offB: OVER, segs: 48 }, holeM);
        hole.renderOrder = 1;
      };
      makeHole();
      const yb = S.cy - S.h / 2 - .012, yt = S.cy + S.h / 2 + .012, bz = .012 / S.w;
      const shellM = M('dark', { side: T.DoubleSide });
      makeStrip({ u0: -bz, u1: 1 + bz, yA: yb, yB: yt, offA: -.001, offB: -.001, segs: 96, lit: true }, shellM);
      makeStrip({ u0: -bz, u1: 1 + bz, yA: yb, yB: yt, offA: -.03, offB: -.03, segs: 96, lit: true }, shellM);
      makeStrip({ u0: -bz, u1: 1 + bz, yA: yt, yB: yt, offA: -.001, offB: -.03, segs: 96, lit: true }, shellM);
      makeStrip({ u0: -bz, u1: 1 + bz, yA: yb, yB: yb, offA: -.001, offB: -.03, segs: 96, lit: true }, shellM);
      const sx = S.X0 - .07;
      B(g, .04, .2, .06, shellM, sx, .86, S.cz);
      [-1, 1].forEach(sg => { const l = B(g, .3, .012, .03, shellM, sx + .07, .764, S.cz + sg * .09); l.rotation.y = sg * .7; });
      return {
        setBend(k) { if (Math.abs(k - bendK) < 1e-6) return; bendK = k; strips.forEach(place); },
        corners() {
          const yT = S.cy + S.h / 2, yB = S.cy - S.h / 2;
          const a = bendXZ(region.u0, OVER, bendK), b = bendXZ(region.u1, OVER, bendK);
          return [[a[0], yT, a[1]], [b[0], yT, b[1]], [a[0], yB, a[1]], [b[0], yB, b[1]]];
        },
        resize() { computeRegion(); makeHole(); desk.needsUpdate = true; texDraws.forEach(f => f()); },
      };
    }

    // ================================================================ camera path
    // key times are in story seconds (STORY in all); the street part is kept short so the house,
    // the hall and the room get most of the flight
    const KEYS = [
      { t: 0.0, p: [11.0, 3.6, -31], l: [8.6, 2.4, -4], f: 44 },
      { t: 1.0, p: [10.4, 3.0, -14.5], l: [5.6, 2.2, 3.0], f: 46 },
      { t: 1.75, p: [7.6, 2.3, -.6], l: [2.2, 1.5, 3.6], f: 50 },
      { t: 2.45, p: [4.9, 1.95, 3.58], l: [1.0, 1.35, 3.5], f: 56 },
      { t: 3.0, p: [2.55, 1.55, 3.52], l: [-.6, 1.35, 3.4], f: 60 },
      { t: 3.6, p: [1.17, 1.46, 3.22], l: [-1.3, 1.1, 1.4], f: 60 },
      { t: 4.3, p: [.75, 1.3, 2.05], l: [-1.62, 1.07, 1.2], f: 52 },
      { t: 5.0, p: [-.3, 1.11, 1.2], l: [-1.62, 1.07, 1.2], f: 34 },
      { t: 5.6, p: [-1.07, 1.06, 1.2], l: [-1.62, 1.06, 1.2], f: 0, fill: true },
    ];
    const PORTRAIT_P = { 0: [11.6, 2.6, -30], 1: [11.6, 2.6, -13.5], 2: [8.4, 2.3, .2], 5: [1.15, 1.46, 3.2], 6: [.95, 1.32, 2.3], 7: [-.2, 1.11, 1.2] };
    const PORTRAIT_L = { 0: [9.6, 3.9, -6], 1: [5.2, 3.5, 3.4], 2: [2.2, 2.1, 3.6], 5: [-1.4, 1.1, 1.3] };
    const DOOR_OPEN = [1.6, 2.55], BEND = [3.72, 5.06], END = STORY;
    let posC, lookC, keyU;
    const setupPath = () => {
      const portrait = innerWidth / innerHeight < 1;
      const Pp = KEYS.map((k, i) => new T.Vector3(...((portrait && PORTRAIT_P[i]) || k.p)));
      const Ll = KEYS.map((k, i) => new T.Vector3(...((portrait && PORTRAIT_L[i]) || k.l)));
      posC = new T.CatmullRomCurve3(Pp, false, 'centripetal');
      lookC = new T.CatmullRomCurve3(Ll, false, 'centripetal');
      const n = KEYS.length, ts = KEYS.map(k => k.t), us = KEYS.map((_, i) => i / (n - 1));
      const d = []; for (let i = 0; i < n - 1; i++) d.push((us[i + 1] - us[i]) / (ts[i + 1] - ts[i]));
      const m = [0]; for (let i = 1; i < n - 1; i++) m.push(2 / (1 / d[i - 1] + 1 / d[i])); m.push(0);
      keyU = { ts, us, m };
    };
    const timeToU = (t) => {
      const { ts, us, m } = keyU;
      if (t <= ts[0]) return 0;
      if (t >= ts[ts.length - 1]) return 1;
      let i = 0; while (t > ts[i + 1]) i++;
      const h = ts[i + 1] - ts[i], s = (t - ts[i]) / h, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * us[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * us[i + 1] + (s3 - s2) * h * m[i + 1];
    };
    const fovFor = (k, i) => {
      const a = camera.aspect;
      if (k.fill) { const d = Math.abs(k.p[0] - SCREEN.X0) - OVER; return T.MathUtils.radToDeg(2 * Math.atan(SCREEN.h / 2 / d)); }
      if (a >= 1.45) return k.f;
      const hf = 2 * Math.atan(Math.tan(T.MathUtils.degToRad(k.f) / 2) * 1.6);
      const v = T.MathUtils.radToDeg(2 * Math.atan(Math.tan(hf / 2) / a));
      return Math.min(v, a < 1 ? (i >= 6 ? 64 : 74) : 72);
    };
    const _p = new T.Vector3(), _l = new T.Vector3();
    const applyCamera = (t) => {
      const u = timeToU(t);
      posC.getPoint(u, _p); lookC.getPoint(u, _l);
      camera.position.copy(_p); camera.lookAt(_l);
      const seg = u * (KEYS.length - 1), i = Math.min(Math.floor(seg), KEYS.length - 2), s = seg - i;
      camera.fov = u >= 1 ? fovFor(KEYS[KEYS.length - 1], KEYS.length - 1) : lerp(fovFor(KEYS[i], i), fovFor(KEYS[i + 1], i + 1), smooth(s));
      camera.near = t > 2.89 ? .03 : .1;
      if (TEST && TEST.cam) { const v = TEST.cam; camera.position.set(v[0], v[1], v[2]); camera.lookAt(v[3], v[4], v[5]); camera.fov = v[6] || 60; }
      camera.updateProjectionMatrix();
    };

    // ---------- warp the page onto the screen (homography -> CSS matrix3d)
    // origin at the viewport's top-left corner, so a page scrolled to a section warps from what is on screen
    { const r = target.getBoundingClientRect(); target.style.transformOrigin = `${-r.left}px ${-r.top}px`; }
    target.style.willChange = 'transform';
    const _v = new T.Vector3();
    const warp = () => {
      const vw = innerWidth, vh = innerHeight, pts = [];
      for (const c of screen.corners()) {
        _v.set(c[0], c[1], c[2]).applyMatrix4(camera.matrixWorldInverse);
        if (_v.z > -.01) { target.style.transform = 'scale(0.0001)'; return; }
        _v.set(c[0], c[1], c[2]).project(camera);
        pts.push([(_v.x + 1) / 2 * vw, (1 - _v.y) / 2 * vh]);
      }
      const m = homography(vw, vh, pts);
      target.style.transform = m ? `matrix3d(${m.join(',')})` : 'scale(0.0001)';
    };

    let t = 0, last = 0, wall = 0, t0wall = 0, firstFrame = true, liveIn = false, speed = 1, speedIn = 1, flight = FLIGHT;
    const update = (tt) => {
      applyCamera(tt);
      const b = smooth(clamp((tt - BEND[0]) / (BEND[1] - BEND[0]), 0, 1));
      screen.setBend(b >= 1 ? 0 : (1 - b) / SCREEN.R);
      const dO = smooth(clamp((tt - DOOR_OPEN[0]) / (DOOR_OPEN[1] - DOOR_OPEN[0]), 0, 1));
      frontDoor.rotation.y = dO * 1.6;
      camera.updateMatrixWorld();
      warp();
    };
    const render = () => renderer.render(scene, camera);
    // Story time follows the wall clock, so a slow device drops frames but still flies through every
    // shot. Two things never count against the flight: the first frame (shot 0 held still while the
    // canvas fades in over the poster cover, which is the same shot), and any one long frame (a shader
    // compile or a stall), which only moves the story a seventh of the flight.
    const frame = (now) => {
      raf = 0;
      if (ended) return;
      if (firstFrame) {
        firstFrame = false;
        // the street gets less if three.js came late (a replay gets the full OUT_FLIGHT); the house never shrinks
        const out = opts.force ? OUT_FLIGHT : clamp(OUT_FLIGHT - Math.max(0, since() - .6), OUT_MIN, OUT_FLIGHT);
        speed = ENTER / out; speedIn = (END - ENTER) / IN_WALL;
        flight = out + IN_WALL;
        update(Math.min(t, END)); render();
        // the poster goes under the canvas, which fades in over it; once the canvas is fully in the
        // poster goes (the monitor's screen is see-through to the page)
        carryCover();
        ov.classList.add('is-live');
        t0wall = performance.now();
        // the clock starts once the canvas is fully in (its fade can itself be delayed by a stall)
        const inDone = () => { if (!liveIn) { liveIn = true; html.classList.remove('intro-on'); ov.style.background = ''; } };
        canvasHost.addEventListener('transitionend', inDone, { once: true });
        setTimeout(inDone, LIVE_FADE * 1000 + 400);
        raf = requestAnimationFrame(frame);
        return;
      }
      if (!liveIn) { last = now; raf = requestAnimationFrame(frame); return; }
      const real = Math.max(0, (now - last) / 1000); last = now;
      if (!(TEST && TEST.hold)) {
        const step = Math.min(real, flight / 7);
        t += step * (t < ENTER ? speed : speedIn); wall += step;
        // a very slow device still lands: never more than about 1.5 s past the planned flight
        if ((performance.now() - t0wall) / 1000 > flight + LIVE_FADE + 1.5) t = END;
      }
      update(Math.min(t, END)); render();
      if (t >= END && !(TEST && TEST.hold)) { target.style.transform = ''; finish(false); return; }
      raf = requestAnimationFrame(frame);
    };
    setupPath();
    onResize = () => {
      renderer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight;
      screen.resize(); setupPath(); update(Math.min(t, END)); render();
    };
    addEventListener('resize', onResize);
    if (TEST && TEST.t !== undefined) t = TEST.t;
    window.__intro = { seek: (v) => { t = v; update(Math.min(t, END)); render(); }, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }) };
    update(t); renderer.compile(scene, camera); render();
    raf = requestAnimationFrame(frame);
  }
}

// Solve the 8-dof homography that maps the viewport rect (0,0,w,h) onto 4 points
// [TL, TR, BL, BR] and return it as a CSS matrix3d (column-major).
function homography(w, h, pts) {
  const src = [[0, 0], [w, 0], [0, h], [w, h]];
  const A = [], bv = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = pts[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); bv.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); bv.push(v);
  }
  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]]; [bv[c], bv[p]] = [bv[p], bv[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      bv[r] -= f * bv[c];
    }
  }
  const s = new Array(n);
  for (let r = n - 1; r >= 0; r--) { let acc = bv[r]; for (let k = r + 1; k < n; k++) acc -= A[r][k] * s[k]; s[r] = acc / A[r][r]; }
  const [a, b, c, d, e, f, g, hh] = s;
  return [a, d, 0, g, b, e, 0, hh, 0, 0, 1, 0, c, f, 0, 1];
}

if (!window.__INTRO_MANUAL) {
  const go = () => playIntro();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
}
