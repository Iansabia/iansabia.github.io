// The guided play-through: one continuous timeline (seconds). stateAt(t) says where everything is.
import {
  SHOTS, NUM, HOLE, ROUTE_A, ROUTE_B, CART_TEE, PAST, TEE, height, stance, add, sub, mul, norm, dist, lerp, lerp2,
  clamp, smooth, ease, easeOut, span, bearingOf, right, centroid, YD, pointIn,
} from "./world.js";
import { fullSwing, puttStroke, FULL_IMPACT, PUTT_IMPACT, swingJoints, walkJoints, toWorld } from "./pose.js";

export const TOTAL = 60;
export const STAGES = [
  { t0: 0, t1: 6, key: 5.6, still: 5.6 },
  { t0: 6, t1: 21, key: 6.2, still: 18.6 },
  { t0: 21, t1: 33.5, key: 21.2, still: 32.5 },
  { t0: 33.5, t1: 45, key: 33.7, still: 43.5 },
  { t0: 45, t1: TOTAL, key: 45.2, still: TOTAL },
];
export const stageAt = (t) => { for (let i = STAGES.length - 1; i >= 0; i--) if (t >= STAGES[i].t0 - 1e-6) return i; return 0; };

export const CAPTIONS = [
  {
    kicker: "Miacomet Golf Club, Nantucket",
    title: `Hole ${HOLE.ref}, par ${HOLE.par}`,
    text: `This is the real ${ordinal(+HOLE.ref)} hole at Miacomet, built from OpenStreetMap outlines and real elevation. Next, one example play of it with Continuum, the AI caddy that lives on your phone.`,
  },
  {
    kicker: "Step 1 of 4",
    title: "The phone on\u00a0the\u00a0cart sees the tee shot",
    text: "The phone clipped to the golf cart films ordinary video. It follows the golfer's body and club, drawn here as a stick figure, then follows the ball and estimates where it landed.",
  },
  {
    kicker: "Step 2 of 4",
    title: "The caddy reads how you miss",
    text: "The cart drives on, and the app helps you find your ball. The caddy also knows this golfer's pattern: most approach shots finish right of where they aimed. So it suggests aiming at the left side of the green.",
  },
  {
    kicker: "Step 3 of 4",
    title: "The approach follows the advice",
    text: "The golfer aims left. The ball drifts right like it usually does, and that carries it onto the green, close to the flag.",
  },
  {
    kicker: "Step 4 of 4",
    title: "A short putt, then the summary",
    text: "The putt drops. The hole summary keeps every shot, and each one adds to the pattern the caddy learns from.",
  },
];

function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// ---------- timings ----------
const SW1 = 10.0, IMP1 = SW1 + FULL_IMPACT, FL1 = 4.6, LAND1 = IMP1 + FL1, ROLL1 = 1.3;
const WALK1 = [18.6, 20.4];
const DRIVE_A = [21.4, 27.2];
const OUT_A = [27.2, 28.9];
const PAST0 = 28.6, PAST_DT = 0.2;
const AIM_SHIFT = [31.0, 32.6];
const SW2 = 35.0, IMP2 = SW2 + FULL_IMPACT, FL2 = 3.7, LAND2 = IMP2 + FL2, ROLL2 = 1.4;
const WALK2 = [42.6, 44.2];
const DRIVE_B = [44.2, 48.0];
const OUT_B = [48.0, 49.8];
const SW3 = 50.4, IMP3 = SW3 + PUTT_IMPACT, PUTT_T = 1.9;
const SUMMARY = 54.6;
export const T = { SW1, IMP1, LAND1, ROLL1, DRIVE_A, PAST0, PAST_DT, AIM_SHIFT, SW2, IMP2, LAND2, SW3, IMP3, PUTT_T, SUMMARY };

const groundZ = (p) => height(p[0], p[1]);
const TEE_LIFT = 0.07; // tee boxes are drawn almost flat, just above the ground

// ---------- ball flight ----------
function flight(from, land, apex, u, curve) {
  // u: 0..1 through the air. The ball slows a little as it flies, peaks late.
  const s = 1 - Math.pow(1 - u, 1.25);
  let p = lerp2(from, land, s);
  if (curve) p = add(lerp2(from, curve.aimLand, s), mul(sub(land, curve.aimLand), Math.pow(s, 2.6))); // starts on the aim line, bends right late
  const z0 = groundZ(from) + (curve ? 0 : TEE_LIFT) + 0.05, z1 = groundZ(land) + 0.05;
  const arc = Math.sin(Math.PI * Math.pow(s, 0.85)) * apex;
  return [p[0], p[1], lerp(z0, z1, s) + arc];
}
function arcPath(from, land, apex, u1, curve, n = 48) {
  const out = [];
  for (let i = 0; i <= n; i++) { const u = (i / n) * u1; out.push(flight(from, land, apex, u, curve)); }
  return out;
}
function rollPos(a, b, u, bounce) {
  const s = easeOut(u);
  const p = lerp2(a, b, s);
  const z = groundZ(p) + 0.05 + (bounce ? Math.abs(Math.sin(Math.PI * clamp(u * 2.6, 0, 1))) * bounce * (1 - u) : 0);
  return [p[0], p[1], z];
}

const S = SHOTS;
const st1 = stance(S.tee.from, S.tee.target);
const st2 = stance(S.approach.from, S.aim);
const st3 = stance(S.putt.from, S.putt.to, 0.55);
const curve2 = { aimLand: S.approach.aimAt };

// the shot paths, for the summary
export const PATHS = {
  tee: arcPath(S.tee.from, S.tee.land, 28, 1, null, 64),
  approach: arcPath(S.approach.from, S.approach.land, 19, 1, curve2, 64),
};

// 50-yard marks along the tee shot's ground track (a count you can see)
export const TICKS = [];
for (let yd = 50; yd < NUM.teeCarryYd; yd += 50) {
  const d = yd / YD;
  const p = add(S.tee.from, mul(norm(sub(S.tee.land, S.tee.from)), d));
  TICKS.push({ yd, p: [p[0], p[1], groundZ(p) + 0.1], u: d / dist(S.tee.from, S.tee.land) });
}

// ---------- the cart ----------
function cartAt(t) {
  if (t < DRIVE_A[0]) { const a = ROUTE_A.at(0); return { p: a.p, dir: ROUTE_A.at(3).dir, moving: false }; }
  if (t < DRIVE_A[1]) { const a = ROUTE_A.at(ease(span(t, ...DRIVE_A)) * ROUTE_A.length); return { ...a, moving: true }; }
  if (t < DRIVE_B[0]) { const a = ROUTE_A.at(ROUTE_A.length); return { ...a, moving: false }; }
  if (t < DRIVE_B[1]) { const a = ROUTE_B.at(ease(span(t, ...DRIVE_B)) * ROUTE_B.length); return { ...a, moving: true }; }
  const a = ROUTE_B.at(ROUTE_B.length); return { ...a, moving: false };
}
// the seat: the golfer gets in and out on the right side of the cart
const seatOf = (c) => add(c.p, mul(right(c.dir), 1.1));

// ---------- the golfer ----------
function walker(from, to, u, faceEnd) {
  const p = lerp2(from, to, smooth(u));
  const moving = u > 0 && u < 1 && dist(from, to) > 0.3;
  const f = moving ? norm(sub(to, from)) : faceEnd;
  const left = [-f[1], f[0]];
  return { kind: "walk", pos: p, face: f, d: left, J: walkJoints(u * dist(from, to) * 3.2, moving) };
}
function golferAt(t) {
  const swing = (st, tau, fn) => ({ kind: "swing", pos: st.pos, face: st.face, d: st.d, J: swingJoints(fn(tau)), tau });
  if (t < WALK1[0]) return swing(st1, t - SW1, fullSwing);
  if (t < WALK1[1]) return walker(st1.pos, seatOf(cartAt(t)), span(t, ...WALK1), st1.face);
  if (t < OUT_A[0]) return null; // riding in the cart
  if (t < OUT_A[1]) return walker(seatOf(cartAt(t)), st2.pos, span(t, ...OUT_A), st2.face);
  if (t < SW2 - 0.01) { const g = swing(st2, 0, fullSwing); return g; }
  if (t < WALK2[0]) return swing(st2, t - SW2, fullSwing);
  if (t < WALK2[1]) return walker(st2.pos, seatOf(cartAt(t)), span(t, ...WALK2), st2.face);
  if (t < OUT_B[0]) return null;
  if (t < OUT_B[1]) return walker(seatOf(cartAt(t)), st3.pos, span(t, ...OUT_B), st3.face);
  return { ...swing(st3, t - SW3, puttStroke) };
}

// ---------- the ball ----------
function ballAt(t) {
  const tee = S.tee, ap = S.approach, pu = S.putt;
  const z = (p, lift = 0) => [p[0], p[1], groundZ(p) + 0.05 + lift];
  if (t < IMP1) return { p: z(tee.from, TEE_LIFT), air: false };
  if (t < LAND1) return { p: flight(tee.from, tee.land, 28, span(t, IMP1, LAND1)), air: true };
  if (t < LAND1 + ROLL1) return { p: rollPos(tee.land, tee.rest, span(t, LAND1, LAND1 + ROLL1), 0.9), air: false };
  if (t < IMP2) return { p: z(tee.rest), air: false };
  if (t < LAND2) return { p: flight(ap.from, ap.land, 19, span(t, IMP2, LAND2), curve2), air: true };
  if (t < LAND2 + ROLL2) return { p: rollPos(ap.land, ap.rest, span(t, LAND2, LAND2 + ROLL2), 0.35), air: false };
  if (t < IMP3) return { p: z(ap.rest), air: false };
  const u = span(t, IMP3, IMP3 + PUTT_T);
  if (u < 1) return { p: rollPos(pu.from, pu.to, u, 0), air: false };
  const sink = span(t, IMP3 + PUTT_T, IMP3 + PUTT_T + 0.25);
  return { p: z(pu.to, -0.12 * sink), air: false, holed: true, sink };
}

// ---------- trails ----------
function trailsAt(t) {
  const out = [];
  // the long flights step aside for the putt (so the green stays clear) and come back for the summary
  const keep = clamp(1 - smooth(span(t, 46.4, 47.6)) + smooth(span(t, SUMMARY, SUMMARY + 0.8)), 0, 1);
  if (t >= IMP1) {
    const u = span(t, IMP1, LAND1);
    out.push({ id: "tee", path: arcPath(S.tee.from, S.tee.land, 28, u, null), done: u >= 1, a: keep });
  }
  if (t >= IMP2) {
    const u = span(t, IMP2, LAND2);
    out.push({ id: "approach", path: arcPath(S.approach.from, S.approach.land, 19, u, curve2), done: u >= 1, a: keep });
  }
  if (t >= IMP3) {
    const u = easeOut(span(t, IMP3, IMP3 + PUTT_T));
    const p = lerp2(S.putt.from, S.putt.to, u);
    out.push({ id: "putt", path: [S.putt.from, p].map((q) => [q[0], q[1], groundZ(q) + 0.06]), done: u >= 1 });
  }
  return out;
}

// club head history for the trace (analytic, so scrubbing backwards works)
function clubTrace(st, swingStart, fn, t, tMax) {
  const tau = t - swingStart;
  if (tau < 0.4) return [];
  const pts = [];
  const end = Math.min(tau, tMax);
  for (let s = 0.4; s <= end + 1e-6; s += 0.025) {
    const J = toWorld({ club: swingJoints(fn(s)).club }, st.pos, st.face, st.d, groundZ(st.pos) + (fn === fullSwing && st === st1 ? TEE_LIFT : 0));
    pts.push(J.club);
  }
  return pts;
}

// ---------- camera ----------
const b1 = bearingOf(S.dir1), b2 = bearingOf(S.dir2);
const holeMid = lerp2(S.tee.from, S.pin, 0.5);
const cartTee = CART_TEE;
const viewSide = bearingOf(sub(S.tee.from, cartTee)); // looking from the cart at the golfer
const mid1 = lerp2(S.tee.from, S.tee.rest, 0.55);
let bp = bearingOf(norm(sub(S.putt.to, S.putt.from)));
while (bp - b2 > 180) bp -= 360;
while (bp - b2 < -180) bp += 360;
const puttMid = lerp2(S.putt.from, S.putt.to, 0.5);
const KEYS = [
  { t: 0, c: lerp2(holeMid, S.tee.from, 0.05), z: 17.05, p: 48, b: b1 - 30 },
  { t: 2.4, c: lerp2(holeMid, S.tee.from, 0.12), z: 17.2, p: 50, b: b1 - 24 },
  { t: 5.8, c: add(S.tee.from, mul(S.dir1, 2)), z: 20.5, p: 60, b: viewSide + 28 },
  { t: 10.6, c: add(S.tee.from, mul(S.dir1, 1.5)), z: 20.85, p: 62, b: viewSide + 18 },
  { t: 12.2, c: add(S.tee.from, mul(S.dir1, 2)), z: 20.8, p: 62, b: viewSide + 14 },
  { t: 13.6, c: add(S.tee.from, mul(S.dir1, 40)), z: 19.1, p: 58, b: b1 + 4 },
  { t: 15.4, c: add(S.tee.from, mul(S.dir1, 140)), z: 18.3, p: 56, b: b1 + 2 },
  { t: 17.6, c: S.tee.land, z: 18.75, p: 54, b: b1 + 10 },
  { t: 20.4, c: S.tee.rest, z: 18.7, p: 52, b: b1 + 16 },
  { t: 22.4, c: mid1, z: 17.85, p: 50, b: b1 + 24 },
  { t: 26.6, c: S.tee.rest, z: 18.9, p: 54, b: b2 - 18 },
  { t: 30.0, c: lerp2(S.tee.rest, S.pin, 0.72), z: 19.05, p: 50, b: b2 - 8 },
  { t: 33.2, c: lerp2(S.tee.rest, S.pin, 0.7), z: 19.15, p: 52, b: b2 - 4 },
  { t: 35.4, c: add(S.approach.from, mul(S.dir2, 10)), z: 19.75, p: 62, b: b2 },
  // the approach: a high camera straight behind the ball, so "aimed left, drifted right" reads plainly
  { t: 37.4, c: lerp2(S.approach.from, S.pin, 0.5), z: 18.85, p: 44, b: b2 },
  { t: 39.3, c: lerp2(S.approach.from, S.pin, 0.8), z: 19.5, p: 46, b: b2 },
  { t: 41.0, c: lerp2(S.approach.from, S.pin, 0.95), z: 20.3, p: 48, b: b2 },
  { t: 43.4, c: S.pin, z: 20.0, p: 50, b: b2 + 20 },
  { t: 47.2, c: lerp2(S.pin, S.putt.from, 0.5), z: 20.6, p: 50, b: (b2 + 20 + bp - 90) / 2 },
  // the putt: from the side the golfer faces, so his body never hides the line. Ball on the left,
  // cup and flag on the right, the 6 ft line running across the screen between them
  { t: 50.0, c: puttMid, z: 22.5, p: 50, b: bp - 90 },
  { t: 53.2, c: puttMid, z: 22.7, p: 50, b: bp - 86 },
  { t: 54.8, c: lerp2(puttMid, S.pin, 0.5), z: 22.2, p: 50, b: bp - 80 },
  { t: 57.6, c: holeMid, z: 17.2, p: 50, b: b1 - 14 },
  { t: TOTAL, c: holeMid, z: 17.15, p: 50, b: b1 - 18 },
];
// unwrap bearings so the camera turns the short way
for (let i = 1; i < KEYS.length; i++) { while (KEYS[i].b - KEYS[i - 1].b > 180) KEYS[i].b -= 360; while (KEYS[i].b - KEYS[i - 1].b < -180) KEYS[i].b += 360; }
function hermite(ch, t) {
  const k = KEYS;
  if (t <= k[0].t) return ch(k[0]);
  if (t >= k[k.length - 1].t) return ch(k[k.length - 1]);
  let i = 0; while (k[i + 1].t < t) i++;
  const slope = (j) => {
    if (j <= 0 || j >= k.length - 1) return 0;
    const s0 = (ch(k[j]) - ch(k[j - 1])) / (k[j].t - k[j - 1].t), s1 = (ch(k[j + 1]) - ch(k[j])) / (k[j + 1].t - k[j].t);
    return s0 * s1 <= 0 ? 0 : (2 * s0 * s1) / (s0 + s1); // monotone (no overshoot)
  };
  const h = k[i + 1].t - k[i].t, u = (t - k[i].t) / h;
  const y0 = ch(k[i]), y1 = ch(k[i + 1]), m0 = slope(i) * h, m1 = slope(i + 1) * h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * m1;
}
export function cameraAt(t) {
  return {
    c: [hermite((k) => k.c[0], t), hermite((k) => k.c[1], t)],
    zoom: hermite((k) => k.z, t), pitch: hermite((k) => k.p, t), bearing: hermite((k) => k.b, t),
  };
}

// ---------- everything at time t ----------
export function stateAt(t) {
  const golfer = golferAt(t);
  if (golfer) {
    const onTee = TEE && pointIn(golfer.pos, TEE.p);
    const z0 = groundZ(golfer.pos) + (onTee ? TEE_LIFT : 0);
    golfer.W = toWorld(golfer.J, golfer.pos, golfer.face, golfer.d, z0);
  }
  const cart = cartAt(t);
  const ball = ballAt(t);
  const stage = stageAt(t);

  // the phone tracking overlay
  const track1 = smooth(span(t, 7.4, 8.4)) * (1 - smooth(span(t, 14.2, 15.2)));
  const track2 = smooth(span(t, 34.2, 35.0)) * (1 - smooth(span(t, 38.4, 39.4)));
  const track3 = smooth(span(t, 49.8, 50.4)) * (1 - smooth(span(t, 53.2, 54)));
  const tracking = Math.max(track1, track2 * 0.85, track3 * 0.8);
  let trace = [];
  if (t >= SW1 && t < 15.2) trace = clubTrace(st1, SW1, fullSwing, t, 2.75);
  else if (t >= SW2 && t < 39.4) trace = clubTrace(st2, SW2, fullSwing, t, 2.75);

  const cone = smooth(span(t, 6.4, 7.6)) * (1 - smooth(span(t, 18.0, 19.2)));
  const finder = smooth(span(t, 21.6, 22.4)) * (1 - smooth(span(t, 28.6, 29.6)));
  const pastN = clamp(Math.floor((t - PAST0) / PAST_DT) + 1, 0, PAST.length);
  const pastA = smooth(span(t, PAST0 - 0.3, PAST0 + 0.2)) * (1 - smooth(span(t, 38.6, 40.2)));
  const disp = smooth(span(t, 29.6, 30.6)) * (1 - smooth(span(t, 37.4, 38.6)));
  const aimU = smooth(span(t, ...AIM_SHIFT));
  const aimA = smooth(span(t, 30.0, 30.8)) * (1 - smooth(span(t, 42.2, 43.2))); // the aim line stays up through the approach flight
  const ticks = TICKS.map((k) => ({ ...k, a: smooth(span(t, IMP1 + k.u * FL1 * 0.82, IMP1 + k.u * FL1 * 0.82 + 0.3)) * (1 - smooth(span(t, 21.5, 22.6))) }));

  return {
    t, stage, golfer, cart, ball, trails: trailsAt(t), trace, tracking, cone, finder,
    pastN, pastA, disp, aimU, aimA, ticks,
    landPin: smooth(span(t, LAND1, LAND1 + 0.4)) * (1 - smooth(span(t, 22.0, 23.0))),
    greenPin: smooth(span(t, LAND2 + ROLL2, LAND2 + ROLL2 + 0.4)) * (1 - smooth(span(t, 47.4, 48.2))),
    summary: smooth(span(t, SUMMARY, SUMMARY + 0.6)),
    pip: smooth(span(t, 7.0, 7.8)) * (1 - smooth(span(t, 14.6, 15.4))),
    caddy: smooth(span(t, 28.0, 28.8)) * (1 - smooth(span(t, 38.8, 39.6))),
    camera: cameraAt(t),
    shotsTaken: (t >= IMP1 ? 1 : 0) + (t >= IMP2 ? 1 : 0) + (t >= IMP3 ? 1 : 0),
  };
}

// the phone's own view of the tee shot (for the picture-in-picture)
export const PHONE = (() => {
  const c = cartAt(0);
  const p = add(add(c.p, mul(c.dir, 0.9)), mul(right(c.dir), 0.55));
  return { pos: [p[0], p[1], groundZ(p) + 1.45], look: [st1.pos[0], st1.pos[1], groundZ(st1.pos) + TEE_LIFT + 0.95] };
})();
export { st1, cartAt };
