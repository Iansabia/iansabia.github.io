// What the phone on the cart sees during the tee shot: the real tee box and fairway outlines seen from
// the phone's spot, the golfer, and the tracking drawn on top (stick figure, club trace, the ball).
import { FEATURES, SHOTS, DATA, ROUTE_A, height, densify, clamp, smooth, span, sub, right, ease } from "./world.js";
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

// The ball map: a plan of the hole turned so it plays up the phone screen (tee at the bottom).
const MAP = (() => {
  const o = SHOTS.tee.from, d = SHOTS.dir1, r = right(d);
  const loc = (p) => { const v = sub(p, o); return [v[0] * r[0] + v[1] * r[1], v[0] * d[0] + v[1] * d[1]]; }; // [across, along]
  const ring = (f) => f.p.map(loc);
  const near = (f) => f.p.some((p) => { const q = loc(p); return q[1] > -60 && q[1] < 420 && Math.abs(q[0]) < 150; });
  return {
    loc,
    fair: DATA.polys.fairway.filter(near).map((f) => ({ mine: f.h === FEATURES.fairways[0]?.h, p: ring(f) })),
    green: DATA.polys.green.filter(near).map(ring),
    bunker: DATA.polys.bunker.filter(near).map(ring),
    tee: DATA.polys.tee.filter(near).map(ring),
    cart: DATA.lines.cartpath.filter(near).map(ring),
    route: ROUTE_A.pts.map(loc),
    ball: loc(SHOTS.tee.rest),
    land: loc(SHOTS.tee.land),
    teeAt: loc(SHOTS.tee.from),
    ball2: loc(SHOTS.approach.rest),
    pin: loc(SHOTS.pin),
    from2: loc(SHOTS.approach.from),
  };
})();

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
  setMode(map) {
    if (this.mode === map) return;
    this.mode = map;
    const root = this.cv.closest(".pip");
    if (root) root.classList.toggle("map", map);
    const rec = root && root.querySelector(".rec");
    if (rec) rec.lastChild.textContent = map ? "Ball map" : "Phone on the cart";
    const txt = map ? ["Ball located", "Route to the ball", "At the ball"] : ["Body tracked", "Strike marked", "Ball followed"];
    [this.chips.body, this.chips.strike, this.chips.ball].forEach((el, i) => { if (el) el.lastChild.textContent = txt[i]; });
  }
  drawMap(S, C) {
    const [W, H] = this.size;
    const g = this.ctx;
    const k = W / 180;
    // frame: along the hole from a little behind the tee to past the ball, fitted between the top pill and the chips
    const y0 = H * 0.13, y1 = H * 0.7;
    const t = S.t;
    // after the approach the map frames the green instead of the tee shot
    const onGreen = !!S.pipGreen;
    const a0 = onGreen ? MAP.pin[1] - 40 : -14, a1 = onGreen ? MAP.pin[1] + 22 : MAP.ball[1] + 34;
    const sc = (y1 - y0) / (a1 - a0);
    const cx = W / 2 - (onGreen ? MAP.pin[0] : (MAP.ball[0] + MAP.teeAt[0]) / 2) * sc;
    const P = (q) => [cx + q[0] * sc, y1 - (q[1] - a0) * sc];
    g.fillStyle = css(C.rough); g.fillRect(0, 0, W, H);
    const poly = (ring, fill, stroke, lw = 1) => {
      g.beginPath(); ring.forEach((q, i) => { const [x, y] = P(q); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw * k; g.stroke(); }
    };
    const line = (pts, stroke, lw, dash) => {
      g.beginPath(); pts.forEach((q, i) => { const [x, y] = P(q); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.setLineDash(dash ? dash.map((v) => v * k) : []); g.strokeStyle = stroke; g.lineWidth = lw * k; g.lineCap = "round"; g.lineJoin = "round"; g.stroke(); g.setLineDash([]);
    };
    MAP.fair.forEach((f) => poly(f.p, css(f.mine ? C.fairway : C.fairwayDim), css(C.fairwayEdge, 0.9), 1));
    MAP.bunker.forEach((r) => poly(r, css(C.bunker), css(C.bunkerEdge), 1));
    MAP.green.forEach((r) => poly(r, css(C.green), css(C.greenEdge), 1.4));
    MAP.tee.forEach((r) => poly(r, css(C.tee), css(C.teeEdge, 0.7), 1));
    MAP.cart.forEach((r) => { line(r, css(C.cartpathEdge), 5); line(r, css(C.cartpath), 3); });

    const LOST = T.LOST, DR = T.DRIVE_A;
    const pinDrop = (bp, drop, pulse) => {
      g.beginPath(); g.arc(bp[0], bp[1], (8 + 22 * pulse) * k, 0, Math.PI * 2);
      g.strokeStyle = css(C.flag, 0.85 * (1 - pulse) * drop); g.lineWidth = 2.4 * k; g.stroke();
      // a map pin: a teardrop standing on the ball
      const hy = bp[1] - (1 - drop) * 30 * k;
      const r = 10 * k;
      g.save(); g.globalAlpha = drop;
      g.beginPath(); g.moveTo(bp[0], hy); g.bezierCurveTo(bp[0] - r * 0.4, hy - r * 0.9, bp[0] - r * 1.05, hy - r * 1.35, bp[0] - r * 1.05, hy - r * 2.05);
      g.arc(bp[0], hy - r * 2.05, r * 1.05, Math.PI, 0); g.bezierCurveTo(bp[0] + r * 1.05, hy - r * 1.35, bp[0] + r * 0.4, hy - r * 0.9, bp[0], hy);
      g.fillStyle = css(C.flag); g.fill(); g.strokeStyle = css(C.halo); g.lineWidth = 1.6 * k; g.stroke();
      g.beginPath(); g.arc(bp[0], hy - r * 2.05, r * 0.42, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill();
      g.restore();
    };
    const on = (el, v) => el && el.classList.toggle("on", v);
    if (onGreen) {
      // the approach, faint, then the flag and the pin on the ball
      line([MAP.from2, MAP.ball2], css(C.flightMid, 0.55), 2, [3, 4]);
      const fp = P(MAP.pin);
      g.strokeStyle = css(C.ink); g.lineWidth = 1.6 * k; g.beginPath(); g.moveTo(fp[0], fp[1]); g.lineTo(fp[0], fp[1] - 16 * k); g.stroke();
      g.beginPath(); g.moveTo(fp[0], fp[1] - 16 * k); g.lineTo(fp[0] + 9 * k, fp[1] - 12.5 * k); g.lineTo(fp[0], fp[1] - 9 * k); g.closePath(); g.fillStyle = css(C.ink); g.fill();
      const drop = smooth(span(t, T.FIND2[0], T.FIND2[0] + 0.5));
      pinDrop(P(MAP.ball2), drop, (t * 0.9) % 1);
      on(this.chips.body, drop > 0.6); on(this.chips.strike, false); on(this.chips.ball, false);
      return;
    }
    // the tee shot, faint
    line([MAP.teeAt, MAP.land, MAP.ball], css(C.flightMid, 0.55), 2, [3, 4]);

    const foundU = smooth(span(t, LOST[1], LOST[2]));
    // the route ahead of the cart
    const driven = t < DR[0] ? 0 : ease(span(t, DR[0], DR[1])) * ROUTE_A.length;
    if (foundU > 0.5 && t < DR[1] + 0.3) {
      const pts = [...ROUTE_A.from(driven).map(MAP.loc), MAP.ball];
      line(pts, css(C.accent, 0.35), 7);
      line(pts, css(C.accent), 3, [4, 3]);
    }
    // search ring closing in, then the pin
    const bp = P(MAP.ball);
    if (foundU < 1) {
      const rr = (1 - foundU) * 46 * k + 10 * k;
      g.beginPath(); g.arc(bp[0] - (1 - foundU) * 14 * k, bp[1] + (1 - foundU) * 20 * k, rr, 0, Math.PI * 2);
      g.fillStyle = css(C.accent, 0.12); g.fill(); g.strokeStyle = css(C.accent, 0.8); g.lineWidth = 2 * k; g.setLineDash([4 * k, 3 * k]); g.stroke(); g.setLineDash([]);
    }
    if (foundU > 0.3) pinDrop(bp, smooth((foundU - 0.3) / 0.5), (t * 0.9) % 1);
    // the cart: a dark cart seen from above (roof, four wheels), nose first, with a pulse ring, so it
    // never reads as part of the route
    const c = S.cart, cp = P(MAP.loc(c.p));
    const ahead = MAP.loc([c.p[0] + c.dir[0], c.p[1] + c.dir[1]]), cpa = P(ahead);
    const ang = Math.atan2(cpa[1] - cp[1], cpa[0] - cp[0]);
    const pz = (t * 1.1) % 1;
    g.beginPath(); g.arc(cp[0], cp[1], (11 + 14 * pz) * k, 0, Math.PI * 2); g.strokeStyle = css(C.ink, 0.6 * (1 - pz)); g.lineWidth = 2 * k; g.stroke();
    g.save(); g.translate(cp[0], cp[1]); g.rotate(ang);
    const cw = 18 * k, ch = 11 * k;
    const rr = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
    g.fillStyle = css(C.ink);
    for (const [wx, wy] of [[-0.3, -0.5], [0.3, -0.5], [-0.3, 0.5], [0.3, 0.5]]) { rr(wx * cw - 2.5 * k, wy * ch - 1.6 * k, 5 * k, 3.2 * k, 1 * k); g.fill(); }
    rr(-cw / 2, -ch / 2, cw, ch, 3 * k); g.fillStyle = css(C.ink); g.fill(); g.strokeStyle = css(C.halo); g.lineWidth = 1.6 * k; g.stroke();
    rr(-cw / 2 + 2 * k, -ch / 2 + 2 * k, cw * 0.62, ch - 4 * k, 2 * k); g.fillStyle = css(C.halo, 0.8); g.fill();
    g.restore();

    on(this.chips.body, foundU > 0.6);
    on(this.chips.strike, t > LOST[2]);
    on(this.chips.ball, t > DR[1] - 0.1);
  }
  draw(S, C) {
    if (!this.size[0]) this.resize();
    this.setMode(!!S.pipMap);
    if (S.pipMap) { this.drawMap(S, C); return; }
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
