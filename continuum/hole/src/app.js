// Continuum hole demo: one continuous play-through of Miacomet hole 10.
// Time runs from scroll (the stage is pinned while the track scrolls past) or from Play.
// When playing, the page scroll follows the time so both stay in step. Step buttons glide there, no cuts.
import { initTheme, onThemeChange, toggleTheme, forceTheme, sceneColors, reducedMotion } from "./theme.js";
import { HOLE, NUM, SHOTS, PAST, PAST_RIGHT, height, dist, toLL, clamp, smooth, YD, add, mul, norm, sub, right } from "./world.js";
import { TOTAL, STAGES, STAGES_I, BEATS, PATHS, stateAt, stageAt, stageAtI, beatAt, T, toClock } from "./story.js";
import { Pip } from "./pip.js";
import { renderFallback } from "./fallback.js";

initTheme();
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const phone = root.dataset.layout === "phone";
const embed = root.classList.contains("embed");
// embedded with scroll=1: the page around the frame sends scroll progress (0..1) and the play-through follows it
const driven = embed && root.classList.contains("driven");
// who may drive the frame: this site, the live site (the Continuum page and the caddy page share it) and local previews
const okOrigin = (o) => o === location.origin || o === "https://iansabia.github.io" || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o);
let parentOrigin = location.origin;
try { const r = document.referrer && new URL(document.referrer).origin; if (r && okOrigin(r)) parentOrigin = r; } catch (e) { /* no referrer */ }
const RM = () => reducedMotion();
// driven: the page's scroll moves through the captions, so screen readers hear the page's step changes, not every caption
if (driven) ["readout", "caddy", "summary", "cap-body"].forEach((id) => { const el = $(id); if (el) el.setAttribute("aria-live", "off"); });

// ---------- scroll share per caption (driven) ----------
// Each caption gets its own equal share of the page's scroll (the opening one a little less), with the camera
// moving between them. Short beats are never skipped and the long putt does not eat the scroll.
// KT: clock time where each caption starts (and the end); KP: the progress where it starts.
const KT = BEATS.map((b) => toClock(b.t)).concat(TOTAL);
const KP = [0];
BEATS.forEach((b, i) => KP.push(KP[i] + (i === 0 ? 0.6 : 1)));
const KSUM = KP[KP.length - 1];
for (let i = 0; i < KP.length; i++) KP[i] /= KSUM;
function seg(x, from, to) {
  for (let i = 0; i < from.length - 1; i++) {
    if (x <= from[i + 1] || i === from.length - 2) { const w = from[i + 1] - from[i]; return to[i] + (w > 0 ? clamp((x - from[i]) / w, 0, 1) : 0) * (to[i + 1] - to[i]); }
  }
  return to[to.length - 1];
}
const pToT = (p) => seg(clamp(p, 0, 1), KP, KT);
const tToP = (tt) => seg(clamp(tt, 0, TOTAL), KT, KP);

// ---------- static text ----------
const par = HOLE.par;
$("hole-name").textContent = `Hole ${HOLE.ref} · Par ${par}`;
$("hole-sub").textContent = "Miacomet Golf Club, Nantucket";
$("to-pin").textContent = NUM.toPinYd;
const dotsEl = $("past-dots");
dotsEl.innerHTML = PAST.map((d) => `<i class="${d.right ? "r" : ""}"></i>`).join("");
const dotEls = [...dotsEl.children];
const strokes = 3;
const names = { "-3": "Albatross", "-2": "Eagle", "-1": "Birdie", "0": "Par", "1": "Bogey" };
$("sum-kicker").textContent = `Miacomet, hole ${HOLE.ref}`;
$("sum-title").textContent = `${strokes} shots on a par ${par}`;
$("sum-badge").textContent = names[String(strokes - par)] || `${strokes - par > 0 ? "+" : ""}${strokes - par}`;
$("shot-dots").innerHTML = Array.from({ length: Math.max(par, strokes) }, (_, i) => `<i class="${i < strokes ? "" : "par"}"></i>`).join("");
$("shot-list").innerHTML = [
  ["Tee shot", `Carry ${NUM.teeCarryYd} yd, kicks into the rough`, `${NUM.teeTotalYd} yd`],
  ["Approach", "Aimed left, drifted right onto the green", `${NUM.toPinYd} yd`],
  ["Putt", `Holed from ${NUM.leftFt} ft`, `${NUM.leftFt} ft`],
].map(([b, s, v], i) => `<li><span class="n">${i + 1}</span><span><b>${b}</b><small>${s}</small></span><span class="v">${v}</span></li>`).join("");

// ---------- state ----------
let t = 0;
let playing = false;
let seek = null; // { to, speed, thenPlay }
let scrollT = null;
let started = false;
let visible = true;
let raf = 0;
let scene = null;
let lastStage = -1;
let lastBeat = -1;
let lastFrameT = -1;
let needDraw = true;
let progY = null; // the last scroll position this code set itself
const pip = new Pip($("pip-canvas"), {
  body: document.querySelector('[data-chip="body"]'),
  strike: document.querySelector('[data-chip="strike"]'),
  ball: document.querySelector('[data-chip="ball"]'),
});

// ---------- scroll <-> time ----------
const track = $("track");
function trackSpan() {
  const r = track.getBoundingClientRect();
  const top = r.top + window.scrollY;
  return { top, len: Math.max(1, track.offsetHeight - window.innerHeight) };
}
function timeFromScroll() {
  const { top, len } = trackSpan();
  return clamp((window.scrollY - top) / len, 0, 1) * TOTAL;
}
function scrollToTime(tt) {
  if (embed) return;
  const { top, len } = trackSpan();
  const y = Math.round(top + (tt / TOTAL) * len);
  if (Math.abs(window.scrollY - y) >= 1) { progY = y; window.scrollTo(0, y); }
}
window.addEventListener("scroll", () => {
  if (embed) return;
  if (progY != null && Math.abs(window.scrollY - progY) < 3) return; // our own scroll
  progY = null;
  if (playing || seek) { playing = false; seek = null; }
  if (RM()) { t = STAGES[stageAt(timeFromScroll())].still; needDraw = true; kick(); return; }
  scrollT = timeFromScroll();
  if (scrollT > 0.2) markStarted();
  kick();
}, { passive: true });
["wheel", "touchstart"].forEach((ev) => window.addEventListener(ev, () => { progY = null; }, { passive: true }));

// ---------- controls ----------
function markStarted() { if (!started) { started = true; $("caption").classList.add("started"); root.classList.add("started"); measureCaption(); needDraw = true; } }
function play() {
  markStarted();
  if (t >= TOTAL - 0.05) { goTo(0, true); return; }
  playing = true; seek = null; scrollT = null; kick();
}
function pause() { playing = false; seek = null; kick(); }
function goTo(tt, thenPlay = false) {
  markStarted();
  scrollT = null;
  if (RM()) { t = tt; playing = false; seek = null; needDraw = true; scrollToTime(t); kick(); if (thenPlay) rmPlay(); return; }
  const d = Math.abs(tt - t);
  seek = { to: tt, speed: Math.max(4, d / 1.8), thenPlay };
  playing = false;
  kick();
}
function goStage(i) {
  i = clamp(i, 0, STAGES.length - 1);
  goTo(RM() ? STAGES[i].still : STAGES[i].key, !RM());
}
let rmTimer = 0;
function rmPlay() {
  // reduced motion: still frames, one per step, a few seconds each
  clearInterval(rmTimer);
  playing = true; updateButtons();
  rmTimer = setInterval(() => {
    const i = stageAt(t);
    if (!playing || i >= STAGES.length - 1) { clearInterval(rmTimer); playing = false; updateButtons(); return; }
    t = STAGES[i + 1].still; needDraw = true; scrollToTime(t); kick();
  }, 6000);
}
$("play-btn").addEventListener("click", () => {
  if (playing) { pause(); clearInterval(rmTimer); }
  else if (RM()) { markStarted(); if (stageAt(t) >= STAGES.length - 1) { t = STAGES[0].still; } rmPlay(); }
  else play();
  updateButtons();
});
$("start-btn").addEventListener("click", () => { if (RM()) { markStarted(); rmPlay(); } else play(); updateButtons(); });
$("prev-btn").addEventListener("click", () => { const i = stageAt(t); const into = t - STAGES[i].t0; goStage(into > 1.5 && i > 0 ? i : i - 1); });
$("next-btn").addEventListener("click", () => goStage(stageAt(t) + 1));
$("replay-btn").addEventListener("click", () => goTo(0, !RM()));
document.querySelectorAll("#steps [data-step]").forEach((b) => b.addEventListener("click", () => goStage(+b.dataset.step)));
$("theme-btn").addEventListener("click", () => toggleTheme());
// phones: the caption shows two lines of text; tap it to read the rest
$("cap-body").addEventListener("click", () => { if (phone) { capEl.classList.toggle("open"); measureCaption(); needDraw = true; kick(); } });
document.addEventListener("keydown", (e) => {
  if (driven || (e.target.closest && e.target.closest("button, a, input"))) return;
  if (e.key === " " || e.key === "k") { e.preventDefault(); $("play-btn").click(); }
});
// Seekable timeline: progress 0..1 from the page around the frame. Native scroll there, an eased follow here, so a
// fast flick plays through quickly instead of cutting. Reduced motion: the still frame of the step it lands in.
let extP = null, rush = false;
function setProgress(p, fast) {
  p = clamp(Number(p) || 0, 0, 1);
  extP = p;
  // "Scroll to play" shows until the reader starts scrolling
  const mv = p > 0.012;
  if (mv !== root.classList.contains("moved")) { root.classList.toggle("moved", mv); setTimeout(() => { measureCaption(); needDraw = true; kick(); }, 400); }
  const tt = pToT(p);
  playing = false; seek = null; clearInterval(rmTimer);
  if (tt > 0.2) markStarted();
  if (RM() || !scene) { t = RM() ? STAGES[stageAt(tt)].still : tt; scrollT = null; needDraw = true; kick(); return; }
  scrollT = tt;
  // fast: the frame is leaving the screen, so go straight to where the scroll is (the recap at the end)
  rush = !!fast;
  kick();
}
// Embedded: the page sends the theme it shows, a pause when the frame scrolls out of view and, when driven, the
// scroll progress. A same-origin page can also call window.holeSetProgress(p) directly.
if (embed) {
  window.holeSetProgress = setProgress;
  window.addEventListener("message", (e) => {
    if (!okOrigin(e.origin) || e.source !== window.parent || !e.data) return;
    parentOrigin = e.origin;
    if (e.data.type === "hole-progress") { setProgress(e.data.t, e.data.fast); return; }
    if (e.data.type !== "cc-hole") return;
    if (e.data.theme) forceTheme(e.data.theme);
    if (e.data.pause && (playing || seek)) { pause(); clearInterval(rmTimer); updateButtons(); }
  });
}
function updateButtons() {
  root.classList.toggle("playing", playing || (seek && seek.thenPlay));
  $("play-btn").setAttribute("aria-label", playing ? "Pause" : "Play");
}

// ---------- labels over the 3D ----------
const labelsEl = $("labels");
const pool = new Map();
function label(id, html, cls) {
  let L = pool.get(id);
  if (!L) {
    const el = document.createElement("div");
    el.className = "lbl " + (cls || "");
    labelsEl.appendChild(el);
    L = { el, html: null, w: 0, h: 0 };
    pool.set(id, L);
  }
  if (L.html !== html) { L.el.innerHTML = html; L.html = html; L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
  return L;
}
let vpCache = null;
function project(p) {
  if (!vpCache) return null;
  const ll = toLL(p);
  const z = p.length > 2 ? p[2] : height(p[0], p[1]);
  const [x, y] = vpCache.project([ll[0], ll[1], z]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}
function placeLabels(items) {
  const seen = new Set();
  const W = labelsEl.clientWidth, H = labelsEl.clientHeight;
  const placed = []; // visible boxes so far: later labels step up out of the way instead of overlapping
  for (const it of items) {
    if (it.a <= 0.01) continue;
    const s = project(it.p);
    if (!s || s[0] < -50 || s[0] > W + 50 || s[1] < 40 || s[1] > H + 20) continue;
    const L = label(it.id, it.html, it.cls);
    seen.add(it.id);
    const lift = it.lift == null ? 12 : it.lift;
    const x = Math.round(clamp(s[0] - L.w / 2 + (it.dx || 0), 12, Math.max(12, W - L.w - 12))); // keep wide labels inside a narrow frame
    let y = Math.round(s[1] - L.h - lift);
    const topSafe = embed ? 50 : phone ? 112 : 70; // keep labels clear of the top bar and the legend
    if (y < topSafe) { L.el.style.opacity = "0"; continue; }
    if (it.a > 0.3) {
      for (let k = 0; k < 4; k++) {
        const hit = placed.find((r) => x < r.x + r.w + 6 && x + L.w + 6 > r.x && y < r.y + r.h + 4 && y + L.h + 4 > r.y);
        if (!hit) break;
        y = hit.y - L.h - 6;
      }
      placed.push({ x, y, w: L.w, h: L.h });
    }
    L.el.style.transform = `translate(${x}px, ${y}px)`;
    L.el.style.opacity = it.a.toFixed(3);
  }
  for (const [id, L] of pool) if (!seen.has(id)) L.el.style.opacity = "0";
}

// ---------- camera framing ----------
function viewFor(cam, S) {
  const W = $("map").clientWidth || window.innerWidth, H = $("map").clientHeight || window.innerHeight;
  const zAdj = phone ? clamp(Math.log2(Math.min((W / 390) * 0.56, H / 900)), -1.4, -0.5) : clamp(Math.log2(Math.min(W / 1440, H / 900)), -1.2, 0.25);
  const ll = toLL(cam.c);
  const zc = height(cam.c[0], cam.c[1]);
  const v = { longitude: ll[0], latitude: ll[1], zoom: cam.zoom + zAdj, pitch: cam.pitch, bearing: cam.bearing, position: [0, 0, zc], maxPitch: 75, maxZoom: 24 };
  // put the action in the free part of the screen (away from the caption and the cards)
  const off = phone ? [0, -(parseFloat(getComputedStyle(root).getPropertyValue("--cap-h")) || 200) * 0.42 + 18] : [W > 1100 ? 70 : 40, -10];
  // the caddy card sits on the right: slide the green left, away from it
  if (!phone && S && S.caddy > 0.001) off[0] -= S.caddy * Math.min($("caddy").offsetWidth * 0.55, W * 0.2);
  // on a phone the camera inset sits top right: slide the golfer left so the inset never covers him
  if (phone && S && S.pip > 0.001) { off[0] -= S.pip * Math.min(W * 0.2, 80); off[1] -= S.pip * 30; }
  // embedded on a phone the frame is narrow: during the tee shot, slide the tee in from the right edge
  if (phone && embed && S) off[0] -= smooth((S.t - 3) / 3) * (1 - smooth((S.t - 18) / 3)) * W * 0.15;
  try {
    const vp = new window.deck.WebMercatorViewport({ width: W, height: H, ...v });
    const q = vp.unproject([W / 2 - off[0], H / 2 - off[1]], { targetZ: zc });
    if (Number.isFinite(q[0]) && Number.isFinite(q[1])) { v.longitude = q[0]; v.latitude = q[1]; }
    vpCache = new window.deck.WebMercatorViewport({ width: W, height: H, ...v });
  } catch (e) { vpCache = null; }
  return v;
}

// ---------- per frame ----------
const capEl = $("caption"), capBody = $("cap-body");
const stepBars = [...$("cap-steps").children];
const stepBtns = [...document.querySelectorAll("#steps [data-step]")];
let capSwapTimer = 0;
// small line icons for the caption (one per beat): the words are short, the icon carries the idea
const ICONS = {
  flag: '<path d="M6 21V4M6 4h11l-2.5 3.5L17 11H6"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  body: '<circle cx="12" cy="5" r="2"/><path d="M12 7v7M12 14l-3 6M12 14l3 6M8 10h8"/>',
  arc: '<path d="M4 19c3-10 11-14 16-8"/><circle cx="20" cy="11" r="1.6"/>',
  pin: '<path d="M12 21s-6-5.6-6-10a6 6 0 0 1 12 0c0 4.4-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>',
  eyeoff: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.6-4.6M9.2 9.2a2.5 2.5 0 0 1 4 .9c0 1.6-1.9 1.6-1.9 3M11.3 15.6h0"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  cart: '<path d="M4 15h13l2-5H9M9 10V6h8M4 15V9"/><circle cx="7" cy="18" r="1.8"/><circle cx="16" cy="18" r="1.8"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9"/>',
  dots: '<circle cx="6" cy="8" r="1.6"/><circle cx="12" cy="8" r="1.6"/><circle cx="18" cy="8" r="1.6"/><circle cx="6" cy="16" r="1.6"/><circle cx="12" cy="16" r="1.6"/><circle cx="18" cy="16" r="1.6"/>',
  right: '<path d="M5 12h13M13 7l5 5-5 5"/>',
  left: '<path d="M19 12H6M11 7l-5 5 5 5"/>',
  putt: '<path d="M4 18h16"/><circle cx="8" cy="15.5" r="1.8"/><path d="M17 18V5l-4 2 4 2"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17" r="1"/>',
};
const STEP_NAMES = ["", "Tee shot", "Find the ball", "Aim", "Putt"];
function setCaption(i, instant) {
  const c = BEATS[i];
  const st = stageAtI(c.t + 0.01);
  const apply = () => {
    $("cap-kicker").textContent = c.kicker || `${st} of 4 · ${STEP_NAMES[st]}`;
    $("cap-title").innerHTML = `<svg class="cap-ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[c.icon] || ""}</svg><span>${c.title}</span>`;
    $("cap-text").textContent = c.text || "";
    capEl.classList.toggle("notext", !c.text);
    capBody.classList.remove("swap");
    measureCaption();
  };
  clearTimeout(capSwapTimer);
  if (instant || RM()) { apply(); return; }
  capBody.classList.add("swap");
  capSwapTimer = setTimeout(apply, 200);
}
function measureCaption() {
  root.style.setProperty("--cap-h", capEl.offsetHeight + "px");
}

const readout = $("readout");
readout.innerHTML = `
  <div class="chip" id="r-fly"><small>In the air</small><b class="num" id="r-fly-v">0</b><span>yd</span></div>
  <div class="chip" id="r-carry"><small>Example shot</small><b class="num">${NUM.teeCarryYd}</b><span>yd carry</span><em>estimated from the video</em></div>
  <div class="chip" id="r-green"><small>On the green</small><b class="num">${NUM.leftFt}</b><span>ft from the pin</span></div>`;
const rFly = $("r-fly"), rFlyV = $("r-fly-v"), rCarry = $("r-carry"), rGreen = $("r-green");

function frameUI(S) {
  const C = sceneColors();
  const st = S.stage;
  if (st !== lastStage) {
    lastStage = st;
    stepBtns.forEach((b) => b.setAttribute("aria-selected", String(+b.dataset.step === st)));
  }
  const bt = beatAt(S.t);
  if (bt !== lastBeat) { setCaption(bt, lastBeat === -1); lastBeat = bt; }
  stepBars.forEach((b, i) => {
    const s = STAGES_I[i + 1];
    b.style.setProperty("--p", clamp((S.t - s.t0) / (s.t1 - s.t0), 0, 1).toFixed(3));
  });
  // cards
  const pipOn = S.pip > 0.5;
  $("pip").classList.toggle("on", pipOn);
  if (S.pip > 0.01) pip.draw(S, C);
  $("caddy").classList.toggle("on", S.caddy > 0.5);
  // the round's recap is drawn in the scene (three numbered shots and one chip); the text card is
  // only for the no-WebGL plan
  const chipOn = (S.t >= T.IMP1 && S.t < 18.4) || (S.t >= T.IMP2 && S.t < T.LAND2 + 0.3) || (S.greenPin > 0.5 && S.t < 45.5);
  $("legend").style.opacity = S.caddy > 0.5 || (phone && (S.pip > 0.2 || chipOn)) ? "0" : "1";
  // pattern dots: a count you can watch
  const n = S.pastN;
  let r = 0;
  dotEls.forEach((el, i) => { const on = i < n; el.classList.toggle("on", on); if (on && PAST[i].right) r++; });
  const pt = $("past-text");
  const txt = n === 0 ? "Looking at your last 12 approach shots" : n < PAST.length ? `<b>${r} of ${n}</b> finished right of the target` : `<b>${PAST_RIGHT} of your last ${PAST.length}</b> approach shots finished right of the target.`;
  if (pt.innerHTML !== txt) pt.innerHTML = txt;

  // readouts
  const inAir1 = S.t >= T.IMP1 && S.t < T.LAND1 + 0.3;
  const inAir2 = S.t >= T.IMP2 && S.t < T.LAND2 + 0.3;
  rFly.classList.toggle("on", (S.t >= T.IMP1 && S.t < T.LAND1 + 0.1) || (S.t >= T.IMP2 && S.t < T.LAND2 + 0.3));
  if (inAir1 || inAir2) {
    const from = inAir1 ? SHOTS.tee.from : SHOTS.approach.from;
    rFlyV.textContent = Math.round(dist(from, S.ball.p) * YD);
  }
  // one chip at a time: the carry chip waits until "In the air" has gone (see the CSS delay)
  rCarry.classList.toggle("on", S.t >= T.LAND1 + 0.5 && S.t < 18.4);
  rGreen.classList.toggle("on", S.greenPin > 0.5 && S.t > T.FIND2[1] && S.t < 45.5);

  // labels
  const items = [];
  const intro = 1 - smooth((S.t - 5) / 1.2);
  items.push({ id: "tee", p: SHOTS.tee.from, html: `Tee <span class="tag">Hole ${HOLE.ref}</span>`, a: intro });
  items.push({ id: "green", p: SHOTS.pin, html: "Green", a: intro, lift: 26 });
  items.push({ id: "hole-len", p: lerpP(SHOTS.tee.from, SHOTS.pin, 0.5), html: `About <span class="tag">${NUM.holeLineYd} yd</span> from tee to green (measured on the map)`, a: intro * 0.95, cls: "small" });
  for (const k of S.ticks) items.push({ id: "tick" + k.yd, p: k.p, html: `${k.yd} yd`, a: k.a, cls: "small", lift: 8 });
  items.push({ id: "landed", p: SHOTS.tee.land, html: `Landed <span class="tag">${NUM.teeCarryYd} yd</span>`, a: S.landPin, cls: "accent", lift: 16 });
  // finding the ball: a question mark over the search ring, then the pin, then a check when the cart is there
  const rest = SHOTS.tee.rest, restTop = [rest[0], rest[1], height(rest[0], rest[1]) + 7.5];
  items.push({ id: "lost", p: [rest[0], rest[1], height(rest[0], rest[1]) + 0.2], html: `<span class="q">?</span>`, a: S.qA, cls: "icon grey", lift: 10 });
  items.push({ id: "found", p: restTop, html: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>Found`, a: S.found, cls: "accent check", lift: 18 });
  // the flag label rides above the pennant; "Aim here" sits off to the left of it so the two never touch
  items.push({ id: "pin", p: [SHOTS.pin[0], SHOTS.pin[1], height(SHOTS.pin[0], SHOTS.pin[1]) + 3.2], html: `Flag <span class="tag">${NUM.toPinYd} yd</span>`, a: S.caddy, lift: 14 });
  items.push({ id: "aim", p: SHOTS.aim, html: "Aim here", a: S.aimA * smooth((S.aimU - 0.6) / 0.4) * (1 - smooth((S.t - T.LAND2) / 0.6)), cls: "accent", lift: 12, dx: -34 });
  // the count builds with the dots, one number per dot: a count you can watch, not a sentence
  {
    let rr = 0; for (let i = 0; i < S.pastN; i++) if (PAST[i].right) rr++;
    const all = S.pastN >= PAST.length;
    const html = all ? `<span class="big">${rr}</span> of ${PAST.length} <span class="arr">&rarr;</span>` : `<span class="big">${rr}</span>`;
    items.push({ id: "usual", p: add(add(SHOTS.pin, mul(right(SHOTS.dir2), 12)), mul(SHOTS.dir2, 9)), html, a: S.pastA * smooth((S.t - T.PAST0) / 0.3) * (1 - smooth((S.t - 34.8) / 0.5)), cls: "warm count", lift: 6 });
  }
  items.push({ id: "drift", p: SHOTS.approach.land, html: "Drifted right", a: smooth((S.t - T.LAND2) / 0.4) * (1 - smooth((S.t - (T.LAND2 + 1.6)) / 0.5)), cls: "small warm", lift: 14, dx: phone ? -40 : 60 });
  items.push({ id: "near", p: SHOTS.approach.rest, html: `${NUM.leftFt} ft`, a: S.greenPin * (1 - smooth((S.t - T.IMP3) / 0.4)), cls: "small", lift: 10 });
  items.push({ id: "holed", p: [SHOTS.pin[0], SHOTS.pin[1], height(SHOTS.pin[0], SHOTS.pin[1]) + 3.2], html: "In the hole", a: smooth((S.t - (T.IMP3 + T.PUTT_T)) / 0.3) * (1 - S.summary), cls: "accent", lift: 16 });
  // the recap: the three shots numbered on the hole, and the score as one chip
  const rc = smooth((S.t - T.SUMMARY - 1.2) / 0.5);
  const mid = (P) => P[Math.round(P.length * 0.45)];
  items.push({ id: "n1", p: mid(PATHS.tee), html: "1", a: rc, cls: "num-badge", lift: 4 });
  items.push({ id: "n2", p: mid(PATHS.approach), html: "2", a: smooth((S.t - T.SUMMARY - 1.5) / 0.5), cls: "num-badge", lift: 4 });
  items.push({ id: "n3", p: SHOTS.approach.rest, html: "3", a: smooth((S.t - T.SUMMARY - 1.8) / 0.5), cls: "num-badge", lift: 4, dx: -20 });
  items.push({ id: "score", p: [SHOTS.pin[0], SHOTS.pin[1], height(SHOTS.pin[0], SHOTS.pin[1]) + 3.2], html: names[String(strokes - par)] || `${strokes} shots`, a: smooth((S.t - T.SUMMARY - 2.2) / 0.5), cls: "accent", lift: 18, dx: 30 });
  placeLabels(items);
  void norm; void sub;
}
const lerpP = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

function draw() {
  const S = stateAt(t);
  // on a phone the caddy card would cover the green: the count, the wedge and the arrow on the green say it
  if (phone) S.caddy = 0;
  if (scene) scene.render(S, viewFor(S.camera, S));
  frameUI(S);
  lastFrameT = t;
}

// Frame-time probe: while the scene moves, average the frame time; if it stays slow, step quality
// down (pixel ratio first, then the edge fog and the buildings). It never steps back up.
const probe = { sum: 0, n: 0, level: 0 };
function probeFrame(ms) {
  if (!scene || ms > 250) return; // a tab switch or a stall, not a slow frame
  probe.sum += ms; probe.n++;
  if (probe.n < (driven ? 20 : 45)) return;   // driven by a page: step down sooner, a lagging hole reads as broken
  const avg = probe.sum / probe.n;
  probe.sum = 0; probe.n = 0;
  if (avg > 24 && probe.level < 2) { probe.level++; scene.setQuality(probe.level); needDraw = true; }
}

// Driven: follow the page's scroll on real elapsed time (not frames), so a slow phone catches up as fast as a quick one.
// A small gap eases. A big one (a fast flick) does not fast-forward: it cuts to the still of each step on the way,
// holds it for a moment, then eases into the target. A skimmer sees tee shot, found it, aim left, the recap.
const CUT = 6, HOLD_MS = 650;
let holdUntil = 0;
function driveStep(now, dtR) {
  if (now < holdUntil) return;
  let d = scrollT - t;
  if (Math.abs(d) > CUT) {
    const a = stageAt(t), b = stageAt(scrollT), dir = Math.sign(d), next = a + dir;
    if (!rush && a !== b && next !== b) { t = STAGES[next].still; holdUntil = now + HOLD_MS; return; }
    t = rush ? scrollT : scrollT - dir * 1.5;
    d = scrollT - t;
  }
  if (Math.abs(d) < 0.004) { t = scrollT; scrollT = null; rush = false; return; }
  const step = d * (1 - Math.exp(-dtR * 7));
  t += Math.sign(step) * Math.min(Math.abs(step), 30 * dtR);
}
// Driven: tell the page where the hole really is, so its rail follows the picture and not the scroll
let sentP = -1, sentBeat = -1, sentAt = 0;
function postTime(now, force) {
  if (!driven || parent === window) return;
  const p = +tToP(t).toFixed(4);
  if (p === sentP && lastBeat === sentBeat) return;
  if (!force && lastBeat === sentBeat && now - sentAt < 90) return;
  sentP = p; sentBeat = lastBeat; sentAt = now;
  try { parent.postMessage({ type: "hole-time", p, stage: stageAt(t), beat: lastBeat, title: BEATS[lastBeat] ? BEATS[lastBeat].title : "" }, parentOrigin); } catch (e) { /* the page fills its rail from its scroll */ }
}

let lastNow = 0;
function tick(now) {
  raf = 0;
  if (lastNow) probeFrame(now - lastNow);
  const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 1 / 60;
  const dtR = lastNow ? Math.min(0.25, (now - lastNow) / 1000) : 1 / 60;
  lastNow = now;
  let moving = false;
  if (seek) {
    const d = seek.to - t, step = seek.speed * dt;
    if (Math.abs(d) <= step) { t = seek.to; const tp = seek.thenPlay; seek = null; if (tp) playing = true; }
    else t += Math.sign(d) * step;
    moving = true;
    scrollToTime(t);
  } else if (playing) {
    t = Math.min(TOTAL, t + dt);
    if (t >= TOTAL) playing = false;
    moving = true;
    scrollToTime(t);
  } else if (scrollT != null) {
    if (driven) driveStep(now, dtR);
    else {
      const d = scrollT - t;
      if (Math.abs(d) < 0.004) { t = scrollT; scrollT = null; }
      else t += d * Math.min(1, dt * 7);
    }
    moving = true;
  }
  updateButtons();
  if (moving || needDraw || t !== lastFrameT) { draw(); needDraw = false; }
  postTime(now, scrollT == null);
  if (visible && !document.hidden && (moving || playing || seek || scrollT != null)) kick();
  else lastNow = 0;
}
function kick() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); }
document.addEventListener("visibilitychange", () => { if (!document.hidden) { needDraw = true; kick(); } });
new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) { needDraw = true; kick(); } }, { threshold: 0 }).observe($("stage"));
window.addEventListener("resize", () => { pip.resize(); measureCaption(); needDraw = true; kick(); });

onThemeChange(() => { if (scene) scene.setTheme(); needDraw = true; kick(); });

// ---------- boot ----------
function webgl2() {
  try { const c = document.createElement("canvas"); return !!c.getContext("webgl2"); } catch (e) { return false; }
}
// embedded: tell the page the hole is drawn, so it swaps its poster for the live frame
function ready() {
  if (!embed || parent === window) return;
  // the step starts as fractions of the play-through, so a page can draw its progress rail and jump to a step
  // (in scroll progress, which gives each caption an equal share), plus the recap as a fifth step
  const r4 = (x) => +x.toFixed(4);
  const steps = STAGES.slice(1).map((s, i) => ({ name: STEP_NAMES[i + 1], from: r4(tToP(s.t0)), key: r4(tToP(s.key)) }));
  steps.push({ name: "Recap", from: r4(KP[BEATS.length - 1]), key: 1 });
  try { parent.postMessage({ type: "cc-hole-ready", driven, steps }, parentOrigin); } catch (e) { /* the page lifts its poster on a timer */ }
}
function fallback() {
  root.classList.add("nogl-mode");
  $("loading").classList.add("done");
  ready();
  ["controls", "caption", "legend", "pip", "caddy", "summary", "readout"].forEach((id) => { const el = $(id); if (el) el.style.display = "none"; });
  renderFallback($("nogl"));
  track.style.height = "auto";
}
async function boot() {
  setCaption(0, true);
  measureCaption();
  if (!webgl2()) { fallback(); return; }
  if (!window.deck) {
    await new Promise((res) => {
      const done = () => res();
      window.addEventListener("deckready", done, { once: true });
      const iv = setInterval(() => { if (window.deck) { clearInterval(iv); done(); } }, 100);
      setTimeout(() => { clearInterval(iv); done(); }, 9000);
    });
  }
  if (!window.deck) { fallback(); return; }
  try {
    const { Scene } = await import("./scene.js");
    scene = new Scene($("map"), { phone, onReady: () => { setTimeout(() => { $("loading").classList.add("done"); ready(); }, 120); needDraw = true; kick(); } });
  } catch (e) {
    console.warn(e);
    fallback();
    return;
  }
  const q = new URLSearchParams(location.search);
  if (q.has("t")) t = clamp(parseFloat(q.get("t")) || 0, 0, TOTAL);
  else if (driven && extP != null) t = RM() ? STAGES[stageAt(pToT(extP))].still : pToT(extP);
  else if (!embed) t = RM() ? STAGES[stageAt(timeFromScroll())].still : timeFromScroll();
  if (t > 0.2 || driven) markStarted();
  if (q.has("t") && !embed) scrollToTime(t);
  needDraw = true;
  draw();
  kick();
  if (embed && !driven && q.get("autoplay") === "1" && !RM()) play();
  // for screenshots and tests
  window.__hole = { probe, get scene() { return scene; }, seekNow: (x) => { t = clamp(x, 0, TOTAL); if (t > 0.2) markStarted(); playing = false; seek = null; scrollT = null; needDraw = true; draw(); }, get t() { return t; }, TOTAL, STAGES, setProgress, pToT, tToP };
}
boot();
