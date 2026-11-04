// What the phone on the cart sees during the tee shot: the real tee box and fairway outlines seen from
// the phone's spot, the golfer, and the tracking drawn on top (stick figure, club trace, the ball).
import { FEATURES, SHOTS, height, densify, clamp, smooth, span } from "./world.js";
import { PHONE, T, st1 } from "./story.js";
import { BONES_SWING } from "./pose.js";

const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const n3 = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };

const cam = (() => {
  const fw = n3(sub3(PHONE.look, PHONE.pos));
  const rt = n3(cross(fw, [0, 0, 1]));
  const up = cross(rt, fw);
  return { o: PHONE.pos, fw, rt, up };
})();
const toCam = (p) => { const v = sub3(p, cam.o); return [dot3(v, cam.rt), dot3(v, cam.up), dot3(v, cam.fw)]; };
const NEAR = 0.3;
function clipNear(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ia = a[2] >= NEAR, ib = b[2] >= NEAR;
    if (ia) out.push(a);
    if (ia !== ib) { const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); }
  }
  return out;
}
const ground = (ring) => densify(ring, 3).map((p) => toCam([p[0], p[1], height(p[0], p[1])]));
const SHAPES = {
  fairway: FEATURES.fairways.map((f) => ground(f.p)),
  bunker: FEATURES.bunkers.map((f) => ground(f.p)),
  tee: FEATURES.tees.map((f) => f.p.map((p) => toCam([p[0], p[1], height(p[0], p[1]) + 0.45]))),
};

export class Pip {
  constructor(canvas, chips) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.chips = chips;
    this.size = [0, 0];
  }
  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (w !== this.cv.width || h !== this.cv.height) { this.cv.width = w; this.cv.height = h; }
    this.size = [w, h];
  }
  draw(S, C) {
    if (!this.size[0]) this.resize();
    const [W, H] = this.size;
    const g = this.ctx;
    const f = H * 1.05;
    const P = (c) => [W / 2 + (c[0] / c[2]) * f, H * 0.5 - (c[1] / c[2]) * f];
    // sky and ground: the horizon sits where a level line from the lens lands
    const dh = n3([cam.fw[0], cam.fw[1], 0]);
    const horizon = clamp(H * 0.5 - (dot3(dh, cam.up) / dot3(dh, cam.fw)) * f, 0, H);
    g.clearRect(0, 0, W, H);
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, css(C.bg)); sky.addColorStop(1, css(C.road));
    g.fillStyle = sky; g.fillRect(0, 0, W, horizon);
    g.fillStyle = css(C.rough); g.fillRect(0, horizon, W, H - horizon);
    const fillPoly = (poly, fill, stroke) => {
      const c = clipNear(poly);
      if (c.length < 3) return;
      g.beginPath();
      c.forEach((q, i) => { const [x, y] = P(q); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath();
      g.fillStyle = fill; g.fill();
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = Math.max(1, W / 220); g.stroke(); }
    };
    SHAPES.fairway.forEach((p) => fillPoly(p, css(C.fairway), css(C.fairwayEdge, 0.8)));
    SHAPES.bunker.forEach((p) => fillPoly(p, css(C.bunker), css(C.bunkerEdge)));
    SHAPES.tee.forEach((p) => fillPoly(p, css(C.tee), css(C.teeEdge, 0.7)));

    // the golfer, then the tracking on top
    const G = S.golfer;
    const k = W / 180;
    if (G && G.kind === "swing" && S.t < 18.6) {
      const J = {};
      for (const key in G.W) J[key] = toCam(G.W[key]);
      g.lineCap = "round"; g.lineJoin = "round";
      g.strokeStyle = css(C.ink); g.fillStyle = css(C.ink);
      for (const [a, b] of BONES_SWING) {
        const pa = P(J[a]), pb = P(J[b]);
        g.lineWidth = (a === "neck" && b === "pelvis" ? 13 : 6.5) * k;
        g.beginPath(); g.moveTo(...pa); g.lineTo(...pb); g.stroke();
      }
      const ph = P(J.head);
      g.beginPath(); g.arc(ph[0], ph[1], 6.5 * k, 0, Math.PI * 2); g.fill();
      g.lineWidth = 1.6 * k; g.beginPath(); g.moveTo(...P(J.hands)); g.lineTo(...P(J.club)); g.stroke();

      const a = clamp(S.tracking * 1.2, 0, 1);
      if (a > 0.01) {
        // club trace
        if (S.trace.length > 1) {
          g.strokeStyle = css(C.track, 0.95 * a); g.lineWidth = 2.4 * k;
          g.beginPath();
          S.trace.forEach((p, i) => { const q = toCam(p); if (q[2] < NEAR) return; const [x, y] = P(q); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
          g.stroke();
        }
        g.strokeStyle = css(C.track, a); g.lineWidth = 2 * k;
        for (const [ja, jb] of BONES_SWING) { g.beginPath(); g.moveTo(...P(J[ja])); g.lineTo(...P(J[jb])); g.stroke(); }
        for (const key of ["head", "lS", "rS", "lE", "rE", "hands", "lH", "rH", "lK", "rK", "lF", "rF", "club"]) {
          const [x, y] = P(J[key]);
          g.beginPath(); g.arc(x, y, 3.2 * k, 0, Math.PI * 2); g.fillStyle = css(C.trackDot, a); g.fill();
          g.lineWidth = 1.5 * k; g.strokeStyle = css(C.track, a); g.stroke();
        }
        // a detection box with corner ticks around the golfer
        const xs = Object.values(J).map((q) => P(q)[0]), ys = Object.values(J).map((q) => P(q)[1]);
        const x0 = Math.min(...xs) - 10 * k, x1 = Math.max(...xs) + 10 * k, y0 = Math.min(...ys) - 10 * k, y1 = Math.max(...ys) + 8 * k;
        const t = 12 * k;
        g.strokeStyle = css(C.track, 0.9 * a); g.lineWidth = 2 * k;
        g.beginPath();
        g.moveTo(x0, y0 + t); g.lineTo(x0, y0); g.lineTo(x0 + t, y0);
        g.moveTo(x1 - t, y0); g.lineTo(x1, y0); g.lineTo(x1, y0 + t);
        g.moveTo(x1, y1 - t); g.lineTo(x1, y1); g.lineTo(x1 - t, y1);
        g.moveTo(x0 + t, y1); g.lineTo(x0, y1); g.lineTo(x0, y1 - t);
        g.stroke();
      }
    }
    // the ball: on the tee, then leaving the frame after the strike
    const b = S.ball.p;
    const qb = toCam(b);
    if (qb[2] > NEAR) {
      const [x, y] = P(qb);
      if (x > -20 && x < W + 20 && y > -20 && y < H + 20) {
        g.beginPath(); g.arc(x, y, 3.2 * k, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill();
        g.lineWidth = 1.2 * k; g.strokeStyle = css(C.ballRing, 0.8); g.stroke();
        if (S.t > T.IMP1 && S.t < T.IMP1 + 1.2) {
          g.beginPath(); g.arc(x, y, 9 * k, 0, Math.PI * 2); g.strokeStyle = css(C.flight1, 0.9); g.lineWidth = 2 * k; g.stroke();
        }
      }
    }
    // status chips
    const on = (el, v) => el && el.classList.toggle("on", v);
    on(this.chips.body, S.tracking > 0.5 && S.t > 8.2);
    on(this.chips.strike, S.t > T.IMP1);
    on(this.chips.ball, S.t > T.IMP1 + 0.4);
  }
}
void SHOTS; void st1; void smooth; void span;
