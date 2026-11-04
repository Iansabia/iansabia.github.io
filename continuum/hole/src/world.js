// The hole in meters: terrain heights, real OSM features, and the illustrative play-through
// (where each example shot starts, lands and stops). Everything is derived from data/hole.js.
import { HOLE_DATA as H } from "../data/hole.js";

export const DATA = H;
export const EXAG = 2.0; // Nantucket is flat (the whole area spans about 9 m), so relief is drawn at 2x
export const [LON0, LAT0] = H.origin;
export const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
export const KY = 110574;
export const toLL = (p) => [LON0 + p[0] / KX, LAT0 + p[1] / KY];
export const YD = 1 / 0.9144;
export const FT = 3.28084;

// ---------- vector helpers ----------
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const len = (a) => Math.hypot(a[0], a[1]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const right = (d) => [d[1], -d[0]]; // 90 degrees clockwise, seen from above
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const ease = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const span = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
export const bearingOf = (d) => (Math.atan2(d[0], d[1]) * 180) / Math.PI; // compass bearing of a direction

export function pointIn(p, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[j];
    if ((y1 > p[1]) !== (y2 > p[1]) && p[0] < x1 + ((p[1] - y1) * (x2 - x1)) / (y2 - y1)) ins = !ins;
  }
  return ins;
}
export const centroid = (r) => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];

// ---------- terrain ----------
const T = H.terrain;
const ZG = Float32Array.from(T.z, (v) => (v / 10) * EXAG);
function rawHeight(x, y) {
  const fx = clamp((x - T.x0) / T.step, 0, T.nx - 1.001), fy = clamp((y - T.y0) / T.step, 0, T.ny - 1.001);
  const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
  const z = (ii, jj) => ZG[jj * T.nx + ii];
  return z(i, j) * (1 - tx) * (1 - ty) + z(i + 1, j) * tx * (1 - ty) + z(i, j + 1) * (1 - tx) * ty + z(i + 1, j + 1) * tx * ty;
}

const WATER = H.polys.water.map((w) => {
  const level = Math.min(...w.p.map((p) => rawHeight(p[0], p[1])));
  const xs = w.p.map((p) => p[0]), ys = w.p.map((p) => p[1]);
  return { ...w, level: Math.max(0, level - 0.3), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
});
export function waterAt(x, y) {
  for (const w of WATER) if (x >= w.box[0] && x <= w.box[2] && y >= w.box[1] && y <= w.box[3] && pointIn([x, y], w.p)) return w;
  return null;
}
export function height(x, y) {
  const w = waterAt(x, y);
  return w ? w.level : rawHeight(x, y);
}
export { WATER };

/** Insert points so no edge is longer than `step` meters (lets flat shapes follow the ground). */
export function densify(ring, step, closed = true) {
  const out = [];
  const n = closed ? ring.length : ring.length - 1;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const k = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let s = 0; s < k; s++) out.push([lerp(a[0], b[0], s / k), lerp(a[1], b[1], s / k)]);
  }
  if (!closed) out.push(ring[ring.length - 1]);
  return out;
}
export const drape = (ring, lift = 0, step = 6, closed = true) => densify(ring, step, closed).map((p) => [p[0], p[1], height(p[0], p[1]) + lift]);

// ---------- the hole ----------
export const HOLE = H.hole;
const mine = (k) => H.polys[k].filter((f) => f.h === HOLE.ref);
export const FEATURES = {
  tees: mine("tee"),
  fairways: mine("fairway"),
  greens: mine("green"),
  bunkers: mine("bunker"),
};
const [T0, C0, G0] = [HOLE.line[0], HOLE.line[1], HOLE.line[HOLE.line.length - 1]];
const inFair = (p) => FEATURES.fairways.some((f) => pointIn(p, f.p));
const green = FEATURES.greens[0];
const inGreen = (p) => green && pointIn(p, green.p);

// tee box nearest the start of the mapped hole line
const tee = FEATURES.tees.slice().sort((a, b) => dist(centroid(a.p), T0) - dist(centroid(b.p), T0))[0];
export const TEE = tee;
const PIN = green && pointIn(G0, green.p) ? G0 : green ? centroid(green.p) : G0;

// Shot 1: the tee shot. Illustrative carry, kept on the mapped fairway, a little right of center.
const dir1 = norm(sub(C0, T0));
const S1 = tee ? centroid(tee.p) : T0;
let L1 = null;
for (const [d, off] of [[212, 5], [212, 2], [205, 3], [200, 0], [195, 0], [190, 0]]) {
  const p = add(add(S1, mul(dir1, d)), mul(right(dir1), off));
  if (inFair(p)) { L1 = p; break; }
}
if (!L1) L1 = add(S1, mul(dir1, 200));
// It kicks right on landing and stops in the rough, off the fairway, where it is hard to see from the tee
// (the ball-finding beat). The first spot that is clear of every mapped surface wins.
const onSurface = (p) => ["fairway", "green", "tee", "bunker"].some((k) => H.polys[k].some((f) => pointIn(p, f.p)));
const clearOf = (p) => !onSurface(p) && [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].every(([a, b]) => !onSurface(add(add(p, mul(dir1, a)), mul(right(dir1), b))));
let R1 = null;
for (const [a, k] of [[9, 15], [8, 15], [10, 15], [7, 14.5], [12, 15], [6, 16], [9, 18], [14, 16], [16, 18]]) {
  const p = add(add(L1, mul(dir1, a)), mul(right(dir1), k));
  if (clearOf(p)) { R1 = p; break; }
}
if (!R1) R1 = add(add(L1, mul(dir1, 8)), mul(right(dir1), 15));

// Shot 2: the approach. The golfer aims left (the caddy's advice), the ball drifts right onto the green.
const dir2 = norm(sub(PIN, R1));
const rt2 = right(dir2);
let AIM = add(PIN, mul(rt2, -7));
for (const k of [10, 9, 8]) { const p = add(PIN, mul(rt2, -k)); if (inGreen(p)) { AIM = p; break; } }
// It starts on the aim line, then drifts right: it lands just right of the flag and rolls toward it.
let L2 = null;
for (const [r, l] of [[3.6, -3.2], [3.2, -2.6], [2.8, -2.2], [2.2, -2.8]]) { const p = add(add(PIN, mul(rt2, r)), mul(dir2, l)); if (inGreen(p)) { L2 = p; break; } }
if (!L2) L2 = add(PIN, mul(dir2, -3));
let R2 = null;
for (const [r, l] of [[1.7, -0.9], [1.5, -1.1], [1.2, -1.4]]) { const p = add(add(PIN, mul(rt2, r)), mul(dir2, l)); if (inGreen(p)) { R2 = p; break; } }
if (!R2) R2 = add(PIN, mul(dir2, -2));

export const SHOTS = {
  dir1, dir2, pin: PIN, aim: AIM,
  tee: { from: S1, land: L1, rest: R1, target: add(S1, mul(dir1, 212)) },
  approach: { from: R1, land: L2, rest: R2, aimAt: add(R1, mul(norm(sub(AIM, R1)), dist(R1, L2))) },
  putt: { from: R2, to: PIN },
};
export const NUM = {
  teeCarryYd: Math.round(dist(S1, L1) * YD),
  teeTotalYd: Math.round(dist(S1, R1) * YD),
  toPinYd: Math.round(dist(R1, PIN) * YD),
  approachCarryYd: Math.round(dist(R1, L2) * YD),
  leftFt: Math.round(dist(R2, PIN) * FT),
  holeLineYd: Math.round(HOLE.lengthM * YD),
};

// Past approach shots for the miss pattern: 12 example finishes around the target, 8 of them right.
// Fixed offsets (meters right of the target line, meters long or short), so every load shows the same picture.
export const PAST = [
  [9, -3], [12, 2], [-5, 3], [7, 4], [14, -5], [-2, -4], [10, 6], [6, -6], [1, 5], [16, 1], [11, -1], [-1, -2],
].map(([r, l]) => ({ p: add(add(PIN, mul(rt2, r)), mul(dir2, l)), right: r > 3 }));
export const PAST_RIGHT = PAST.filter((d) => d.right).length;

// ---------- the cart route (real cart path where it exists, then across the rough like a real cart) ----------
function nearestOn(line, p) {
  let best = { d: Infinity };
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], ab = sub(b, a), L = len(ab) ** 2 || 1;
    const u = clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / L, 0, 1);
    const q = add(a, mul(ab, u)), d = dist(q, p);
    if (d < best.d) best = { d, i, u, q };
  }
  return best;
}
const paths = H.lines.cartpath.map((c) => c.p);
let teePath = null;
for (const p of paths) {
  const n = nearestOn(p, S1);
  if (!teePath || n.d < teePath.n.d) teePath = { p, n };
}
const routeA = []; // tee to the drive
if (teePath && teePath.n.d < 30) {
  const { p, n } = teePath;
  // drive the direction that heads down the hole
  const fwd = p.slice(n.i + 1), back = p.slice(0, n.i + 1).reverse();
  const score = (seg) => (seg.length ? (seg[seg.length - 1][0] - S1[0]) * dir1[0] + (seg[seg.length - 1][1] - S1[1]) * dir1[1] : -1e9);
  const seg = score(fwd) > score(back) ? fwd : back;
  routeA.push(n.q, ...seg);
} else routeA.push(add(S1, mul(right(dir1), -8)));
export const CART_TEE = add(routeA[0], mul(dir1, -2.5));
// the cart stops just short of the ball, on its fairway side, so the two read as a pair
const cartNearBall = add(add(R1, mul(right(dir1), -3.4)), mul(dir1, -2.6));
routeA.unshift(CART_TEE);
routeA.push(add(cartNearBall, mul(dir1, -16)), cartNearBall);
// green side: park just off the green, never on a green or a bunker, and get there without crossing
// one (the cart never drives onto the putting surface). A real cart path point wins when one is close.
const along = (q) => (q[0] - R1[0]) * dir2[0] + (q[1] - R1[1]) * dir2[1];
const startB = add(cartNearBall, mul(dir2, 14));
const nearPolys = ["green", "bunker"].flatMap((k) => H.polys[k]).filter((f) => f.p.some((q) => dist(q, PIN) < 260));
const hits = (p) => nearPolys.some((f) => pointIn(p, f.p));
const clearLine = (a, b) => { const n = Math.max(8, Math.ceil(dist(a, b) / 2)); for (let i = 1; i < n; i++) if (hits(lerp2(a, b, i / n))) return false; return true; };
const offGreen = (q) => !hits(q) && [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]].every(([a, b]) => !hits(add(add(q, mul(dir2, a)), mul(rt2, b))));
const parks = [];
for (const p of paths) for (const q of p) { const d = dist(q, PIN); if (d > 16 && d < 40 && along(q) > 40) parks.push({ q, d, path: true }); }
for (const [l, r] of [[-22, -12], [-20, -15], [-25, -10], [-18, -18], [-28, -14], [-22, 12], [-20, 16], [-30, -6], [-12, -20], [-34, -10]]) {
  const q = add(add(PIN, mul(dir2, l)), mul(rt2, r));
  parks.push({ q, d: dist(q, PIN) + 4, path: false });
}
parks.sort((a, b) => a.d - b.d);
let routeB = null;
const mids = [];
for (let l = -80; l <= -26; l += 6) for (let r = -36; r <= 36; r += 6) mids.push(add(add(PIN, mul(dir2, l)), mul(rt2, r)));
for (const k of parks) {
  if (!offGreen(k.q)) continue;
  if (clearLine(startB, k.q)) { routeB = [cartNearBall, startB, k.q]; break; }
  let best = null, bl = Infinity;
  for (const m of mids) {
    if (hits(m) || !clearLine(startB, m) || !clearLine(m, k.q)) continue;
    const L = dist(startB, m) + dist(m, k.q);
    if (L < bl) { bl = L; best = m; }
  }
  if (best) { routeB = [cartNearBall, startB, best, k.q]; break; }
}
if (!routeB) routeB = [cartNearBall, startB, add(add(PIN, mul(dir2, -26)), mul(rt2, -16))];
const greenPark = routeB[routeB.length - 1];

function polyline(pts) {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + dist(pts[i - 1], pts[i]));
  return {
    pts, length: d[d.length - 1],
    at(s) {
      s = clamp(s, 0, d[d.length - 1]);
      let i = 1; while (i < d.length - 1 && d[i] < s) i++;
      const u = (s - d[i - 1]) / ((d[i] - d[i - 1]) || 1);
      return { p: lerp2(pts[i - 1], pts[i], u), dir: norm(sub(pts[i], pts[i - 1])) };
    },
    /** The rest of the route from distance s: the current spot, then every later corner. */
    from(s) {
      s = clamp(s, 0, d[d.length - 1]);
      let i = 1; while (i < d.length - 1 && d[i] <= s) i++;
      return [this.at(s).p, ...pts.slice(i)];
    },
  };
}
// round the corners a little so the cart turns instead of pivoting
function rounded(pts, r = 6) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const ra = Math.min(r, dist(a, b) / 2), rc = Math.min(r, dist(b, c) / 2);
    const p0 = add(b, mul(norm(sub(a, b)), ra)), p2 = add(b, mul(norm(sub(c, b)), rc));
    for (let k = 0; k <= 6; k++) { const t = k / 6; out.push([(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * b[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * b[1] + t * t * p2[1]]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
export const ROUTE_A = polyline(rounded(routeA));
export const ROUTE_B = polyline(rounded(routeB));
export const CART_GREEN = greenPark;

// where the golfer stands for each shot: beside the ball, facing it, left side to the target
export function stance(ball, target, back = 0.78) {
  const d = norm(sub(target, ball));
  const face = [d[1], -d[0]]; // facing direction: target to the golfer's left
  return { pos: add(ball, mul(face, -back)), face, d };
}
