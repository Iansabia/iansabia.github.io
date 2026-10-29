// Rooms for the 3D floor view, laid out on the real building footprint.
// The typical floor (floorplans.js) gives the room numbers and types; this file places them as a ring
// of rooms along the outside walls of the actual OSM outline, with the corridor and core in the middle.
// So 610 Beacon's wedge, Warren's slabs and Kilachand's L all read as the building you clicked.
import { layoutFor } from "./floorplans.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);

function area(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

// Douglas-Peucker on a closed ring, then drop corners that barely turn
function simplify(ring, tol) {
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1], ab = sub(b, a), L = len(ab) || 1;
    let best = -1, bi = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs(ab[0] * (a[1] - pts[i][1]) - ab[1] * (a[0] - pts[i][0])) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best <= tol) return [a, b];
    return dp(pts.slice(0, bi + 1)).slice(0, -1).concat(dp(pts.slice(bi)));
  };
  // split at the farthest pair so the closed ring simplifies evenly
  let far = 0, fd = -1;
  for (let i = 1; i < ring.length; i++) { const d = len(sub(ring[i], ring[0])); if (d > fd) { fd = d; far = i; } }
  let out = dp(ring.slice(0, far + 1)).slice(0, -1).concat(dp(ring.slice(far).concat([ring[0]])).slice(0, -1));
  for (let pass = 0; pass < 3 && out.length > 3; pass++) {
    out = out.filter((p, i) => {
      const a = out[(i - 1 + out.length) % out.length], b = out[(i + 1) % out.length];
      const u = sub(p, a), v = sub(b, p);
      const turn = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
      return turn > 0.2 && len(u) > 0.6;
    });
  }
  return out.length >= 3 ? out : ring;
}

/**
 * @param {Array<Array<[number,number]>>} rings building outlines in meters (any winding, may repeat the first point)
 * @param {Array<{number:string,type:string}>} rooms rooms in plan order
 * @returns {Array<{number:string,type:string,poly:Array<[number,number]>,c:[number,number]}>}
 */
// distance from a point to a segment
function segDist(p, a, b) {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1)));
  return len(sub(p, add(a, mul(ab, t))));
}

export function placeRooms(rings, rooms) {
  const edges = [];
  // a wall shared with another part of the same building is inside: no rooms face it
  const shared = (ri, a, b) => rings.some((r, rj) => rj !== ri && [0.25, 0.5, 0.75].every((t) => {
    const p = add(a, mul(sub(b, a), t));
    for (let i = 0; i < r.length - 1; i++) if (segDist(p, r[i], r[i + 1]) < 1.6) return true;
    return segDist(p, r[r.length - 1], r[0]) < 1.6;
  }));
  rings.forEach((r0, ri) => {
    let r = r0.slice();
    if (r.length > 1 && len(sub(r[0], r[r.length - 1])) < 0.01) r.pop();
    if (r.length < 3) return;
    r = simplify(r, 1.3);
    if (area(r) < 0) r.reverse(); // counter-clockwise: the inside is on the left of every edge
    const A = area(r);
    let P = 0;
    for (let i = 0; i < r.length; i++) P += len(sub(r[(i + 1) % r.length], r[i]));
    // a rough wall-to-wall thickness: area / half the perimeter (the width of a long slab)
    const thick = A / (P / 2);
    const depth = Math.max(3.6, Math.min(7, thick * 0.38));
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], ab = sub(b, a), L = len(ab);
      const dir = mul(ab, 1 / L), nrm = [-dir[1], dir[0]];
      const usable = L - 2 * depth;
      if (usable < 3 || shared(ri, a, b)) continue;
      edges.push({ ri, i, a, dir, nrm, depth, from: depth, usable, L });
    }
  });
  if (!edges.length || !rooms.length) return [];
  // start on the longest wall, then walk around each building in order
  const total = edges.reduce((s, e) => s + e.usable, 0);
  const w = total / rooms.length;
  const counts = edges.map((e) => Math.floor(e.usable / w));
  let left = rooms.length - counts.reduce((s, c) => s + c, 0);
  edges.map((e, k) => [e.usable / w - counts[k], k]).sort((x, y) => y[0] - x[0]).forEach(([, k]) => { if (left > 0) { counts[k]++; left--; } });
  let start = 0;
  edges.forEach((e, k) => { if (e.usable > edges[start].usable) start = k; });
  const order = edges.map((_, k) => (start + k) % edges.length);
  const out = [];
  let ri = 0;
  const gap = 0.32;
  for (const k of order) {
    const e = edges[k], n = counts[k];
    if (!n) continue;
    const cw = e.usable / n;
    for (let j = 0; j < n && ri < rooms.length; j++, ri++) {
      const s0 = e.from + j * cw + gap, s1 = e.from + (j + 1) * cw - gap;
      const p0 = add(e.a, mul(e.dir, s0)), p1 = add(e.a, mul(e.dir, s1));
      const o0 = add(p0, mul(e.nrm, gap)), o1 = add(p1, mul(e.nrm, gap));
      const i0 = add(p0, mul(e.nrm, e.depth - gap)), i1 = add(p1, mul(e.nrm, e.depth - gap));
      const poly = [o0, o1, i1, i0];
      out.push({ number: rooms[ri].number, type: rooms[ri].type, poly, c: mul(add(add(o0, o1), add(i0, i1)), 0.25) });
    }
  }
  return out;
}

/**
 * A plan drawn to a rectangular slab: the plan is laid onto the building's tightest bounding box, its
 * bottom edge on the side facing `toward` (meters), so each room sits where it really is.
 * Each cell's first edge is its outside wall (the window) for the furnished room view.
 */
function fitPlan(rings0, L, toward) {
  const clean = (r0) => { const r = r0.slice(); if (r.length > 1 && len(sub(r[0], r[r.length - 1])) < 0.01) r.pop(); return r; };
  const rect = (pts) => {
    let best = null;
    for (let d = 0; d < 180; d += 0.5) {
      const t = (d * Math.PI) / 180, e1 = [Math.cos(t), Math.sin(t)], e2 = [-e1[1], e1[0]];
      const a = pts.map((p) => p[0] * e1[0] + p[1] * e1[1]), b = pts.map((p) => p[0] * e2[0] + p[1] * e2[1]);
      const A = (Math.max(...a) - Math.min(...a)) * (Math.max(...b) - Math.min(...b));
      if (!best || A < best.A) best = { A, e1, e2 };
    }
    return best;
  };
  // the slab: the part that fills its bounding box best (a tower beside a lower wing, say), else all of it
  const rings = rings0.map(clean).filter((r) => r.length >= 3);
  if (!rings.length) return null;
  const scored = rings.map((r) => ({ r, fill: Math.abs(area(r)) / rect(r).A, A: Math.abs(area(r)) }));
  const slabs = scored.filter((x) => x.fill > 0.88).sort((x, y) => y.A - x.A);
  const pts = slabs.length ? slabs[0].r : rings.flat();
  const { e1, e2 } = rect(pts);
  const ctr = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
  const tw = sub(toward, ctr);
  // plan x runs along the long side and plan y across it, with plan-down pointing at `toward`
  const span = (e) => { const v = pts.map((p) => p[0] * e[0] + p[1] * e[1]); return Math.max(...v) - Math.min(...v); };
  let Y = span(e1) < span(e2) ? e1 : e2;
  if (Y[0] * tw[0] + Y[1] * tw[1] < 0) Y = [-Y[0], -Y[1]];
  const X = [-Y[1], Y[0]]; // plan right, seen from above with plan-down toward `toward`
  const ax = pts.map((p) => p[0] * X[0] + p[1] * X[1]), by = pts.map((p) => p[0] * Y[0] + p[1] * Y[1]);
  const a0 = Math.min(...ax), a1 = Math.max(...ax), b0 = Math.min(...by), b1 = Math.max(...by);
  const o = L.outline[0];
  const at = (px, py) => { const a = a0 + ((px - o.x) / o.w) * (a1 - a0), b = b0 + ((py - o.y) / o.h) * (b1 - b0); return [X[0] * a + Y[0] * b, X[1] * a + Y[1] * b]; };
  const gx = 0.25 * (o.w / (a1 - a0)), gy = 0.25 * (o.h / (b1 - b0)); // a 0.25 m wall gap, in plan units
  return L.rooms.map((r) => {
    const x0 = r.x + gx, x1 = r.x + r.w - gx, y0 = r.y + gy, y1 = r.y + r.h - gy;
    const c = [(x0 + x1) / 2, (y0 + y1) / 2];
    // the outside wall is whichever building edge the room is closest to
    const d = { top: r.y - o.y, bottom: o.y + o.h - (r.y + r.h), left: r.x - o.x, right: o.x + o.w - (r.x + r.w) };
    const side = Object.keys(d).reduce((m, k) => (d[k] < d[m] ? k : m), "top");
    const corners = {
      top: [[x1, y0], [x0, y0], [x0, y1], [x1, y1]],
      bottom: [[x0, y1], [x1, y1], [x1, y0], [x0, y0]],
      left: [[x0, y0], [x0, y1], [x1, y1], [x1, y0]],
      right: [[x1, y1], [x1, y0], [x0, y0], [x0, y1]],
    }[side];
    return { number: r.number, type: r.type, poly: corners.map((p) => at(p[0], p[1])), c: at(c[0], c[1]) };
  });
}

/**
 * Rooms for one floor of a group, with any offered room numbers the typical layout lacks
 * written onto unmarked rooms (so every listing on the floor has a place to stand).
 * @param {Array<Array<[number,number]>>} rings
 * @param {string} dormId
 * @param {number} floor
 * @param {Map<string, object>} marks keyed by room number
 */
export function floorRooms(rings, dormId, floor, marks, toM) {
  const L = layoutFor(dormId, floor);
  const fitted = L.fit && toM ? fitPlan(rings, L, toM(L.fit.bottomToward)) : null;
  const cells = fitted || placeRooms(rings, L.rooms.map((r) => ({ number: r.number, type: r.type })));
  const known = new Set(cells.map((c) => c.number));
  const extra = [...marks.entries()].filter(([num, m]) => (m.listed || m.me) && !known.has(num)).map(([num]) => num);
  if (extra.length) {
    const free = cells.filter((c) => !marks.has(c.number));
    extra.forEach((num, i) => { const c = free[Math.floor(((i + 0.5) * free.length) / extra.length)]; if (c) c.number = num; });
  }
  return cells.map((c) => ({ ...c, mark: marks.get(c.number) || null, type: (marks.get(c.number) || {}).type || c.type }));
}
