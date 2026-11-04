// A stick-figure golfer: joints from one swing angle, so the club traces a real arc.
// Local frame: a = toward the target (the golfer's left), b = the way the golfer faces, h = up (meters).
import { clamp, smooth, ease, easeOut } from "./world.js";

const R = Math.PI / 180;
const C = [0, 0.18, 1.32]; // the hub of the swing, mid chest
const FULL = { v: [0, 0.43, -0.9], rh: 0.63, rc: 0.82 };
const PUTT = { v: [0, 0.274, -0.962], rh: 0.55, rc: 0.8 };

/** Full swing over about 2.7 s. Returns the swing angle, the wrist hinge, and impact time. */
export function fullSwing(tau) {
  let th = 0, lag = 0;
  if (tau < 0.4) th = 0;
  else if (tau < 1.5) { const u = ease((tau - 0.4) / 1.1); th = 150 * u; lag = 88 * smooth((tau - 0.4) / 1.0); }
  else if (tau < 1.75) { th = 150 + 5 * smooth((tau - 1.5) / 0.25); lag = 88; }
  else if (tau < 2.05) { const u = Math.pow((tau - 1.75) / 0.3, 1.6); th = 155 * (1 - u); lag = 88 * (1 - smooth(u * 1.15)); }
  else if (tau < 2.7) { const u = easeOut((tau - 2.05) / 0.65); th = -165 * u; lag = -38 * u; }
  else { th = -165; lag = -38; }
  return { th: th * R, lag: lag * R, kind: "full" };
}
export const FULL_IMPACT = 2.05;

export function puttStroke(tau) {
  let th = 0;
  if (tau < 0.5) th = 0;
  else if (tau < 1.2) th = 17 * ease((tau - 0.5) / 0.7);
  else if (tau < 1.6) th = 17 * (1 - Math.pow((tau - 1.2) / 0.4, 1.4));
  else th = -19 * easeOut((tau - 1.6) / 0.5);
  return { th: th * R, lag: 0, kind: "putt" };
}
export const PUTT_IMPACT = 1.6;

const rot = (p, ang) => [p[0] * Math.cos(ang) - p[1] * Math.sin(ang), p[0] * Math.sin(ang) + p[1] * Math.cos(ang), p[2]];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return scl(a, 1 / l); };

/** Joints in the local frame for a swing state. */
export function swingJoints({ th, lag, kind }) {
  const P = kind === "putt" ? PUTT : FULL;
  const v = nrm(P.v), w = [-1, 0, 0];
  const dirAt = (a) => addv(scl(v, Math.cos(a)), scl(w, Math.sin(a)));
  const hands = addv(C, scl(dirAt(th), P.rh));
  const club = addv(hands, scl(dirAt(th + lag), P.rc));
  const turn = kind === "putt" ? th * 0.35 : clamp(th * 0.62, -1.75, 1.6);
  const hipTurn = kind === "putt" ? 0 : clamp(th * 0.3, -0.9, 0.75);
  const fin = kind === "putt" ? 0 : clamp(-th / (165 * R), 0, 1); // 0 at impact, 1 at the finish
  const shift = 0.07 * fin;
  const sh = (s) => addv(rot([0.19 * s, 0, 1.42], turn), [shift, 0.2, 0]);
  const hip = (s) => addv(rot([0.12 * s, 0, 0.95], hipTurn), [shift * 1.4, -0.03, 0]);
  const lS = sh(1), rS = sh(-1), lH = hip(1), rH = hip(-1);
  const neck = addv(scl(addv(lS, rS), 0.5), [0, 0, 0.06]);
  const pelvis = scl(addv(lH, rH), 0.5);
  const head = addv([0.05 * fin, 0.3 - 0.08 * fin, 1.6 + 0.04 * fin], [shift, 0, 0]);
  const elbow = (s, sp) => addv(scl(addv(sp, hands), 0.5), [0, 0.06, -0.05]);
  const lK = [0.21 + 0.03 * fin, 0.1, 0.5], lF = [0.26, 0, 0.03];
  const rK = [-0.21 + 0.24 * fin, 0.1 - 0.02 * fin, 0.5 + 0.04 * fin], rF = [-0.26 + 0.12 * fin, 0.02, 0.03 + 0.1 * fin];
  return { head, neck, pelvis, lS, rS, lH, rH, lE: elbow(1, lS), rE: elbow(-1, rS), hands, club, lK, rK, lF, rF };
}

/** Standing or walking (phase in radians); the club is in the bag. */
export function walkJoints(phase, moving) {
  const s = moving ? Math.sin(phase) : 0;
  const lift = (x) => (moving ? Math.max(0, x) * 0.12 : 0);
  return {
    head: [0, 0.02, 1.66], neck: [0, 0, 1.5], pelvis: [0, 0, 0.96],
    lS: [0.19, 0, 1.44], rS: [-0.19, 0, 1.44], lH: [0.11, 0, 0.96], rH: [-0.11, 0, 0.96],
    lE: [0.24, -0.08 * s, 1.15], rE: [-0.24, 0.08 * s, 1.15],
    lHand: [0.25, -0.16 * s, 0.86], rHand: [-0.25, 0.16 * s, 0.86],
    lK: [0.12, 0.14 * s, 0.5 + lift(s)], rK: [-0.12, -0.14 * s, 0.5 + lift(-s)],
    lF: [0.13, 0.28 * s, 0.03 + lift(s) * 0.6], rF: [-0.13, -0.28 * s, 0.03 + lift(-s) * 0.6],
  };
}

export const BONES_SWING = [["head", "neck"], ["neck", "pelvis"], ["lS", "rS"], ["lH", "rH"], ["lS", "lE"], ["lE", "hands"], ["rS", "rE"], ["rE", "hands"], ["lH", "lK"], ["lK", "lF"], ["rH", "rK"], ["rK", "rF"]];
export const BONES_WALK = [["head", "neck"], ["neck", "pelvis"], ["lS", "rS"], ["lH", "rH"], ["lS", "lE"], ["lE", "lHand"], ["rS", "rE"], ["rE", "rHand"], ["lH", "lK"], ["lK", "lF"], ["rH", "rK"], ["rK", "rF"]];

/** Local joints to world meters. pos: [x,y] of the golfer, face: unit facing, d: unit toward target. */
export function toWorld(J, pos, face, d, z0) {
  const out = {};
  for (const k in J) {
    const [a, b, h] = J[k];
    out[k] = [pos[0] + d[0] * a + face[0] * b, pos[1] + d[1] * a + face[1] * b, z0 + h];
  }
  return out;
}
