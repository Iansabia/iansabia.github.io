// City life on the 3D map: cars on the real roads (headlights and taillights at night), people walking
// the footpaths and parks, stoplights cycling at big intersections, and a night game at Fenway Park
// (stadium lights, a twinkling crowd, fireworks). Everything is built once from the OSM data and then
// animated on the GPU with a clock, so it costs almost nothing per frame. Off with reduced motion.
import { CAMPUS } from "../data/campus.js";
import { PARK, FENWAY_IDS, gameLayers } from "./fenway.js";

const D = window.deck;
const LON0 = CAMPUS.center[0], LAT0 = CAMPUS.center[1];
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 110574;
const toM = (p) => [(p[0] - LON0) * KX, (p[1] - LAT0) * KY];
const toLL = (m) => [LON0 + m[0] / KX, LAT0 + m[1] / KY];
const rgba = (c, a) => [c[0], c[1], c[2], a];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// seeded random, so the city looks the same on every load
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const R = rng(26);

const [BX0, BY0, BX1, BY1] = CAMPUS.bbox;
const BW = (BX1 - BX0) * KX, BH = (BY1 - BY0) * KY;
// meters from the nearest edge of the map data (negative outside)
const inset = (m) => { const x = m[0] - (BX0 - LON0) * KX, y = m[1] - (BY0 - LAT0) * KY; return Math.min(x, BW - x, y, BH - y); };

function polyLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
// shift a polyline sideways (to the right of travel) by d meters
function offsetLine(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [p[0] + (dy / L) * d, p[1] - (dx / L) * d];
  });
}
// cut long polylines into pieces of at most maxLen meters
function chunks(pts, maxLen) {
  const out = [];
  let cur = [pts[0]], acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const s = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cur.push(pts[i]); acc += s;
    if (acc >= maxLen && i < pts.length - 1) { out.push(cur); cur = [pts[i]]; acc = 0; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}
// timestamps along a path at speed v, starting at t0
function stamps(pts, v, t0) { const ts = [t0]; for (let i = 1; i < pts.length; i++) ts.push(ts[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) / v); return ts; }

// ---------- cars ----------
const CAR_CYCLE = 90, CAR_SPEED = 17;
// Divided roads (Comm Ave, Beacon St, Storrow) come from OSM as two separate one-way roadways with a
// median between them. A major road with a parallel twin 8 to 40 m to one side is one of those halves,
// and since traffic keeps right, it runs in the direction that puts the median on its left.
const MAJOR_R = CAMPUS.roads.filter((r) => r.kind === "major");
const MAJOR_M = MAJOR_R.map((r) => r.path.map(toM));
function oneWay(piece, self, name) {
  let left = 0, right = 0;
  for (const f of [0.25, 0.5, 0.75]) {
    const i = Math.min(piece.length - 2, Math.floor(f * (piece.length - 1)));
    const a = piece[i], b = piece[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
    const p = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let best = null;
    for (let mi = 0; mi < MAJOR_M.length; mi++) {
      const m = MAJOR_M[mi];
      // the other half of the same street (two different streets side by side are not a median)
      if (m === self || (name && MAJOR_R[mi].name && MAJOR_R[mi].name !== name)) continue;
      for (let j = 0; j < m.length - 1; j++) {
        const q = m[j], q2 = m[j + 1], ex = q2[0] - q[0], ey = q2[1] - q[1], el = Math.hypot(ex, ey) || 1;
        if (Math.abs((dx * ex + dy * ey) / (dl * el)) < 0.94) continue; // not parallel
        const t = Math.max(0, Math.min(1, ((p[0] - q[0]) * ex + (p[1] - q[1]) * ey) / (el * el)));
        const c = [q[0] + ex * t, q[1] + ey * t], d = Math.hypot(c[0] - p[0], c[1] - p[1]);
        if (d >= 8 && d <= 40 && (!best || d < best.d)) best = { d, side: dx * (c[1] - p[1]) - dy * (c[0] - p[0]) };
      }
    }
    if (best) { if (best.side > 0) left++; else right++; }
  }
  if (left >= 2 && left > right) return 1;
  if (right >= 2 && right > left) return -1;
  return 0;
}

const CARS = (() => {
  const out = [];
  for (const r of CAMPUS.roads) {
    if (r.kind !== "major" && r.kind !== "minor") continue;
    const m = r.path.map(toM);
    if (polyLen(m) < 140 || inset(m[0]) < 30) continue;
    const self = r.kind === "major" ? MAJOR_M.find((x) => x.length === m.length && x[0][0] === m[0][0] && x[0][1] === m[0][1]) : null;
    for (const piece of chunks(m, 1300)) {
      const L = polyLen(piece);
      const ow = r.kind === "major" ? oneWay(piece, self, r.name) : 0;
      // a one-way roadway carries its traffic in two lanes, both the same way
      for (const [dir, off] of ow ? [[ow, 1.7], [ow, -1.7]] : [[1, r.kind === "major" ? 3.2 : 2.2], [-1, r.kind === "major" ? 3.2 : 2.2]]) {
        const lane = offsetLine(dir > 0 ? piece : piece.slice().reverse(), off);
        const n = Math.max(1, Math.round((L / (r.kind === "major" ? 55 : 120)) * (0.6 + R() * 0.8)));
        const v = CAR_SPEED * (r.kind === "major" ? 1 : 0.75) * (0.85 + R() * 0.3);
        for (let k = 0; k < n; k++) {
          const t0 = ((k + R() * 0.8) / n) * Math.max(1, CAR_CYCLE - L / v);
          out.push({ path: lane.map((p) => [...toLL(p), 0.8]), ts: stamps(lane, v, t0), dir, paint: R() });
        }
      }
    }
  }
  return out;
})();
const CAR_PAINT = ["#F5F5F7", "#2C2C2E", "#8E8E93", "#3A4A6B", "#A23B3B", "#D9D2C4", "#1D1830"].map(hex);

// ---------- people ----------
const WALK_CYCLE = 240, WALK_SPEED = 2.6; // a brisk, readable pace
const PEOPLE = (() => {
  const out = [];
  const routes = CAMPUS.roads.filter((r) => r.kind === "path" || r.kind === "minor").map((r) => r.path.map(toM)).filter((m) => polyLen(m) > 60 && inset(m[0]) > 40);
  for (const m0 of routes) {
    const L = polyLen(m0);
    const n = Math.min(8, Math.max(1, Math.round(L / 70)));
    for (let k = 0; k < n; k++) {
      let m = R() < 0.5 ? m0 : m0.slice().reverse();
      m = offsetLine(m, 4 + R() * 2); // the sidewalk, not the middle of the street
      const v = WALK_SPEED * (0.75 + R() * 0.5);
      const t0 = R() * Math.max(1, WALK_CYCLE - L / v);
      out.push({ path: m.map((p) => [...toLL(p), 0.6]), ts: stamps(m, v, t0), c: Math.floor(R() * 6) });
    }
  }
  return out;
})();
const PEOPLE_RGB = {
  light: ["#604C9C", "#C0632F", "#3F7FA6", "#5F7F48", "#1D1830", "#B0487A"].map(hex),
  dark: ["#F4F0FA", "#FFB27A", "#A99BFF", "#9DBB7E", "#7FB4D6", "#E07BAA"].map(hex),
};

// ---------- stoplights at busy intersections ----------
const LIGHTS = (() => {
  const deg = new Map();
  for (const r of CAMPUS.roads) {
    if (r.kind !== "major") continue;
    for (const p of [r.path[0], r.path[r.path.length - 1]]) {
      const k = `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
      deg.set(k, { p, n: ((deg.get(k) || {}).n || 0) + 1 });
    }
  }
  const nodes = [...deg.values()].filter((x) => x.n >= 3).map((x) => toM(x.p)).filter((m) => inset(m) > 60);
  const kept = [];
  for (const m of nodes) if (!kept.some((k) => Math.hypot(k[0] - m[0], k[1] - m[1]) < 45)) kept.push(m);
  const out = [];
  kept.slice(0, 48).forEach((m, i) => {
    const phase = R() * 30;
    // two signal heads per corner: one for each crossing street, opposite phases
    out.push({ pos: [...toLL([m[0] + 6, m[1] + 6]), 6], phase, flip: false, id: i });
    out.push({ pos: [...toLL([m[0] - 6, m[1] - 6]), 6], phase, flip: true, id: i });
  });
  return out;
})();
const SIG = { red: [255, 69, 58], amber: [255, 179, 64], green: [52, 220, 120] };
function signal(l, t) {
  const c = (t + l.phase) % 30; // 13 s green, 2 s amber, 15 s red, crossing street opposite
  const s = l.flip ? (c + 15) % 30 : c;
  return s < 13 ? SIG.green : s < 15 ? SIG.amber : SIG.red;
}

// ---------- Fenway Park: lights, crowd, fireworks (the park itself lives in fenway.js) ----------
const FENWAY = PARK;

const FW_COLORS = ["#FF5FA8", "#8F7FF7", "#5FB4FF", "#FFB27A", "#F4F0FA", "#9DE07B", "#FF9A4D"].map(hex);
const FW_EVERY = 2.4, FW_LIFE = 3.0, FW_RISE = 1.0;
// one burst's particles (directions on a sphere, fixed per burst)
const FW_SHAPES = Array.from({ length: 6 }, (_, s) => {
  const r = rng(100 + s);
  return Array.from({ length: 96 }, (_, i) => {
    const z = 1 - (2 * (i + 0.5)) / 96, th = i * 2.399963 + r() * 0.2, q = Math.sqrt(1 - z * z);
    return [q * Math.cos(th), q * Math.sin(th), z, 0.85 + r() * 0.3];
  });
});
function fireworks(t) {
  if (!FENWAY) return { sparks: [], rockets: [] };
  const sparks = [], rockets = [];
  const n0 = Math.floor((t - FW_LIFE - FW_RISE) / FW_EVERY);
  for (let n = n0; n <= Math.floor(t / FW_EVERY); n++) {
    if (n < 0) continue;
    const r = rng(9000 + n);
    const born = n * FW_EVERY + r() * 1.2;
    const age = t - born;
    if (age < 0) continue;
    const ox = (r() - 0.5) * FENWAY.rad * 1.1, oy = (r() - 0.5) * FENWAY.rad * 1.1;
    const top = 120 + r() * 70;
    const base = [FENWAY.c[0] + ox, FENWAY.c[1] + oy];
    if (age < FW_RISE) {
      const k = age / FW_RISE, z = 30 + (top - 30) * (1 - (1 - k) * (1 - k));
      rockets.push({ pos: [...toLL(base), z], a: 230 });
      continue;
    }
    const e = age - FW_RISE;
    if (e > FW_LIFE) continue;
    const col = FW_COLORS[Math.floor(r() * FW_COLORS.length)], col2 = FW_COLORS[Math.floor(r() * FW_COLORS.length)];
    const shape = FW_SHAPES[Math.floor(r() * FW_SHAPES.length)];
    const sp = 42 + r() * 18, drag = Math.exp(-1.1 * e), dist = (sp * (1 - drag)) / 1.1;
    const fall = 4.9 * e * e * 0.55;
    const a = Math.round(255 * Math.max(0, 1 - e / FW_LIFE) ** 0.9);
    shape.forEach((d, i) => {
      const k = dist * d[3];
      sparks.push({ pos: [...toLL([base[0] + d[0] * k, base[1] + d[1] * k]), top + d[2] * k - fall], c: i % 3 ? col : col2, a, s: e < 0.15 ? 4.2 : 2.8 });
    });
  }
  return { sparks, rockets };
}

/**
 * All city-life layers for this frame.
 * @param {{ now:number, t0:number, zoom:number, dark:boolean, demo:boolean, depth:object, glow:object, soft:Array }} o
 */
export function lifeLayers(o) {
  const layers = [];
  const t = (o.now - o.t0) / 1000;
  const dk = o.dark, z = o.zoom;
  // cars: light streaks at night, small painted dashes by day; quieter during the demo
  const carA = o.demo ? 0.45 : 1;
  layers.push(new D.TripsLayer({
    id: "life-cars", data: CARS, getPath: (d) => d.path, getTimestamps: (d) => d.ts,
    getColor: (d) => (dk ? rgba(d.dir > 0 ? [255, 244, 214] : [255, 70, 70], Math.round(235 * carA)) : rgba(CAR_PAINT[Math.floor(d.paint * CAR_PAINT.length)], Math.round(235 * carA))),
    getWidth: z > 16.5 ? 2.2 : 3.2, widthUnits: z > 16.5 ? "meters" : "pixels", widthMinPixels: 1.6, capRounded: true, jointRounded: true,
    trailLength: dk ? 0.9 : 0.32, fadeTrail: true, currentTime: t % CAR_CYCLE, parameters: o.depth, updateTriggers: { getColor: `${dk}|${o.demo}` },
  }));
  if (z > 15.9 && !o.demo) {
    const pr = dk ? PEOPLE_RGB.dark : PEOPLE_RGB.light;
    const k = Math.min(1, (z - 15.9) / 0.6);
    layers.push(new D.TripsLayer({
      id: "life-people", data: PEOPLE, getPath: (d) => d.path, getTimestamps: (d) => d.ts,
      getColor: (d) => rgba(pr[d.c], Math.round(240 * k)), getWidth: 1.8, widthUnits: "meters", widthMinPixels: 2.6,
      // a tiny fading trail reads as a dot (fadeTrail: false would draw the whole route walked so far)
      capRounded: true, trailLength: 0.12, fadeTrail: true, currentTime: t % WALK_CYCLE, parameters: o.depth, updateTriggers: { getColor: `${dk}|${Math.round(k * 10)}` },
    }));
  }
  if (z > 16 && !o.demo) {
    const k = Math.min(1, (z - 16) / 0.5);
    layers.push(new D.ScatterplotLayer({
      id: "life-signal-glow", data: LIGHTS, getPosition: (d) => d.pos, getRadius: 5, radiusUnits: "meters",
      getFillColor: (d) => rgba(signal(d, t), Math.round((dk ? 120 : 70) * k)), extensions: o.soft, parameters: o.glow,
      updateTriggers: { getFillColor: `${Math.floor(t)}|${dk}|${Math.round(k * 10)}` },
    }));
    layers.push(new D.ScatterplotLayer({
      id: "life-signal", data: LIGHTS, getPosition: (d) => d.pos, getRadius: 1.1, radiusUnits: "meters", radiusMinPixels: 1.6,
      getFillColor: (d) => rgba(signal(d, t), Math.round(255 * k)), parameters: o.depth,
      updateTriggers: { getFillColor: `${Math.floor(t)}|${Math.round(k * 10)}` },
    }));
  }
  if (FENWAY) {
    // the stadium glows under the lights (much stronger at night)
    layers.push(new D.ScatterplotLayer({
      id: "life-fenway-glow", data: [FENWAY], getPosition: (d) => [...d.ll, 1], getRadius: (d) => d.rad * 1.5, radiusUnits: "meters",
      getFillColor: dk ? [255, 236, 200, 70] : [255, 250, 235, 60], extensions: o.soft, parameters: o.glow, updateTriggers: { getFillColor: dk },
    }));
    layers.push(new D.ScatterplotLayer({
      id: "life-fenway-towers", data: FENWAY.towers, getPosition: (d) => d.pos, getRadius: 3.5, radiusUnits: "meters", radiusMinPixels: 2.5,
      getFillColor: [255, 250, 232, 255], parameters: o.depth,
    }));
    layers.push(new D.ScatterplotLayer({
      id: "life-fenway-tower-glow", data: FENWAY.towers, getPosition: (d) => d.pos, getRadius: 16, radiusUnits: "meters", radiusMinPixels: 7,
      getFillColor: [255, 244, 214, dk ? 150 : 90], extensions: o.soft, parameters: o.glow, updateTriggers: { getFillColor: dk },
    }));
    if (z > 15.6) {
      layers.push(new D.ScatterplotLayer({
        id: "life-fenway-crowd", data: FENWAY.crowd, getPosition: (d) => d.pos, getRadius: 0.45, radiusUnits: "meters", radiusMinPixels: 0.8,
        getFillColor: (d) => { const f = 0.5 + 0.5 * Math.sin(t * d.sp + d.ph); return d.c ? rgba(d.c, Math.round((dk ? 150 : 200) + 55 * f)) : dk ? [255, 255, 255, Math.round(60 + 195 * f * f)] : [60, 50, 90, Math.round(80 + 120 * f)]; },
        parameters: o.depth, updateTriggers: { getFillColor: `${Math.floor(t * 8)}|${dk}` },
      }));
    }
    if (!o.demo) layers.push(...gameLayers({ t, zoom: z }));
    if (!o.demo) {
      const fw = fireworks(t);
      if (fw.rockets.length) layers.push(new D.ScatterplotLayer({
        id: "life-rockets", data: fw.rockets, getPosition: (d) => d.pos, getRadius: 2.6, radiusUnits: "pixels",
        getFillColor: (d) => [255, 236, 200, d.a], parameters: o.glow,
      }));
      if (fw.sparks.length) {
        layers.push(new D.ScatterplotLayer({
          id: "life-sparks-glow", data: fw.sparks, getPosition: (d) => d.pos, getRadius: (d) => d.s * 3.4, radiusUnits: "pixels",
          getFillColor: (d) => rgba(d.c, Math.round(d.a * 0.3)), extensions: o.soft, parameters: o.glow,
        }));
        layers.push(new D.ScatterplotLayer({
          id: "life-sparks", data: fw.sparks, getPosition: (d) => d.pos, getRadius: (d) => d.s, radiusUnits: "pixels",
          getFillColor: (d) => rgba(d.c, d.a), parameters: o.glow,
        }));
      }
    }
  }
  return layers;
}

// ---------- windows (night) ----------
// Every ordinary building gets real window rows: one pane per bay on each floor, flush with the wall.
// Unlit panes are dark glass that gives the facade its grid; each building has its own share of lit
// rooms (offices mostly dark, homes warmer), lit panes run warm or a little cool, whole floors tend to
// be on or off together, and a few rooms switch as you watch. Dorms are left out: they have their own
// glow and come apart into floors when you open one.
// BU's Center for Computing & Data Sciences (665 Comm Ave): OSM draws it as ten stacked boxes.
const isCDS = (b) => /^way\/13237779(7[2-9]|8[01])$/.test(b.id);

const WIN = (() => {
  const glass = [], lit = [];
  const sm = (a, b, v) => { const x = Math.min(1, Math.max(0, (v - a) / (b - a))); return x * x * (3 - 2 * x); };
  const tones = [[255, 200, 126], [255, 214, 150], [255, 228, 178], [255, 188, 112], [206, 222, 255]];
  for (const b of CAMPUS.buildings) {
    if (b.dormId || isCDS(b) || FENWAY_IDS.has(b.id)) continue;
    const m = b.polygon.map(toM);
    let area = 0;
    for (let i = 0; i < m.length - 1; i++) area += m[i][0] * m[i + 1][1] - m[i + 1][0] * m[i][1];
    const side = area > 0 ? 1 : -1; // counter-clockwise rings: outside is to the right of each edge
    const H = b.height || 8, base = b.minHeight || 0;
    const fh = H > 40 ? 3.4 : 3.1;
    const floors = Math.floor((H - base - 0.6) / fh);
    if (floors < 1) continue;
    const bay = 2.6 + R() * 1.1, pane = bay * (0.42 + R() * 0.16);
    const share = 0.1 + R() * 0.35; // how busy this building is tonight
    const tone = tones[Math.floor(R() * 4)];
    const floorOn = Array.from({ length: floors + 1 }, () => R() < 0.75);
    for (let i = 0; i < m.length - 1; i++) {
      const a = m[i], c = m[i + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < bay * 1.2) continue;
      const ux = (c[0] - a[0]) / L, uy = (c[1] - a[1]) / L;
      const nx = uy * side * 0.18, ny = -ux * side * 0.18;
      const fade = sm(30, 420, inset([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]));
      if (fade < 0.05) continue;
      const nb = Math.floor((L - 0.8) / bay), start = (L - nb * bay) / 2 + bay / 2;
      for (let f = 1; f <= floors; f++) {
        const z = base + (f - 1) * fh + fh * 0.55;
        for (let k = 0; k < nb; k++) {
          const s2 = start + k * bay;
          const x0 = a[0] + ux * (s2 - pane / 2) + nx, y0 = a[1] + uy * (s2 - pane / 2) + ny;
          const x1 = a[0] + ux * (s2 + pane / 2) + nx, y1 = a[1] + uy * (s2 + pane / 2) + ny;
          const w = { s: [...toLL([x0, y0]), z], t: [...toLL([x1, y1]), z], f: fade };
          const on = R() < share * (floorOn[f] ? 1.5 : 0.35);
          if (on) lit.push({ ...w, c: R() < 0.85 ? tone : tones[Math.floor(R() * tones.length)], b: 0.7 + R() * 0.3, ph: Math.floor(R() * 997) });
          else glass.push(w);
        }
      }
    }
  }
  return { glass, lit };
})();

// CDS gets a curtain wall instead of punched windows: floor-height glass in narrow bays between thin
// vertical frames, with a solid band at each floor line. Reflective blue-gray glass by day; at night
// most bays glow cool white, the way the tower looks from Comm Ave.
const CDS = (() => {
  const bays = [], frames = [], bands = [];
  const parts = CAMPUS.buildings.filter(isCDS);
  for (const b of parts) {
    const m = b.polygon.map(toM);
    let area = 0;
    for (let i = 0; i < m.length - 1; i++) area += m[i][0] * m[i + 1][1] - m[i + 1][0] * m[i][1];
    const side = area > 0 ? 1 : -1;
    const z0 = b.minHeight || 0, z1 = b.height;
    const floors = Math.max(1, Math.round((z1 - z0) / 4.4)), fh = (z1 - z0) / floors;
    const floorOn = Array.from({ length: floors }, () => R() < 0.8);
    for (let i = 0; i < m.length - 1; i++) {
      const a = m[i], c = m[i + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 2) continue;
      const ux = (c[0] - a[0]) / L, uy = (c[1] - a[1]) / L, nx = uy * side * 0.12, ny = -ux * side * 0.12;
      const at = (s2, z) => [...toLL([a[0] + ux * s2 + nx, a[1] + uy * s2 + ny]), z];
      const nb = Math.max(1, Math.round(L / 1.6)), bw = L / nb;
      for (let f = 0; f < floors; f++) {
        const zc = z0 + f * fh + fh * 0.5;
        bands.push({ s: at(0.05, z0 + f * fh + 0.25), t: at(L - 0.05, z0 + f * fh + 0.25) });
        for (let k = 0; k < nb; k++) bays.push({ s: at(k * bw + 0.08, zc), t: at((k + 1) * bw - 0.08, zc), on: R() < (floorOn[f] ? 0.82 : 0.2), b: 0.75 + R() * 0.25, fh });
      }
      for (let k = 0; k <= nb; k++) frames.push({ s: at(k * bw, z0), t: at(k * bw, z1) });
    }
  }
  return { bays, frames, bands };
})();

/** The CDS curtain wall, day and night. */
export function cdsLayers(o) {
  if (!CDS.bays.length) return [];
  const dk = o.dark, k = 1 - (o.fade || 0); // other buildings sink when a dorm opens
  const close = (o.zoom || 15) > 15.8;
  const glassW = close ? { getWidth: (d) => d.fh * 0.78, widthUnits: "meters", widthMinPixels: 1.2 } : { getWidth: 2, widthUnits: "pixels" };
  return [
    new D.LineLayer({
      id: "cds-glass", data: CDS.bays, getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t, ...glassW,
      getColor: (d) => dk
        ? (d.on ? [226, 236, 255, Math.round(235 * d.b * k)] : [70, 86, 130, Math.round(150 * k)])
        : [150 + Math.round(30 * d.b), 176 + Math.round(24 * d.b), 214, Math.round(205 * k)],
      updateTriggers: { getColor: `${dk}|${Math.round(k * 10)}` },
    }),
    new D.LineLayer({
      id: "cds-bands", data: CDS.bands, getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t,
      getWidth: close ? 2 : 1, widthUnits: "pixels", getColor: dk ? [46, 44, 70, Math.round(230 * k)] : [236, 238, 242, Math.round(235 * k)],
      updateTriggers: { getColor: `${dk}|${Math.round(k * 10)}` },
    }),
    ...(close ? [new D.LineLayer({
      id: "cds-frames", data: CDS.frames, getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t,
      getWidth: 1, widthUnits: "pixels", getColor: dk ? [38, 36, 60, Math.round(220 * k)] : [240, 242, 246, Math.round(220 * k)],
      updateTriggers: { getColor: `${dk}|${Math.round(k * 10)}` },
    })] : []),
  ];
}

/** Window panes for this frame (night only; daylight washes them out). */
export function windowLayers(o) {
  if (!o.dark || (o.zoom || 15) < 14.6) return [];
  const tick = Math.floor((o.now - o.t0) / 4000);
  const k = Math.min(1, ((o.zoom || 15) - 14.6) / 0.8) * (1 - (o.fade || 0)); // buildings sink when a dorm opens
  const close = (o.zoom || 15) > 16.2;
  // pane height in meters reads right up close; far away a fixed hairline keeps the city from turning to mush
  const width = close ? { getWidth: 1.15, widthUnits: "meters", widthMinPixels: 1, widthMaxPixels: 14 } : { getWidth: 1.2, widthUnits: "pixels" };
  return [
    new D.LineLayer({
      id: "life-glass", data: WIN.glass, getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t, ...width,
      getColor: (d) => [120, 128, 170, Math.round(46 * d.f * k)], updateTriggers: { getColor: Math.round(k * 10) },
    }),
    new D.LineLayer({
      id: "life-windows", data: WIN.lit, getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t, ...width,
      getColor: (d) => rgba(d.c, (d.ph + tick * 7) % 37 === 0 ? 0 : Math.round(240 * d.b * d.f * k)),
      updateTriggers: { getColor: `${tick}|${Math.round(k * 10)}` },
    }),
  ];
}

// ---------- the edge of the data: buildings dissolve into glowing wireframes ----------
// Buildings in the last ~450 m before the data ends trade their solid fill (which the edge fog fades)
// for outlines in the grid color, so the city looks like it is being drawn out of the grid.
export const EDGE_WIRES = (() => {
  const roofs = [], posts = [];
  const sm = (a, b, v) => { const x = Math.min(1, Math.max(0, (v - a) / (b - a))); return x * x * (3 - 2 * x); };
  for (const b of CAMPUS.buildings) {
    const m = b.polygon.map(toM);
    const c = m.reduce((a, v) => [a[0] + v[0] / m.length, a[1] + v[1] / m.length], [0, 0]);
    const d = inset(c);
    if (d > 620 || d < -10) continue;
    const a = (1 - sm(60, 600, d)) * sm(-10, 30, d); // strongest where the fill is gone, gone at the very edge
    if (a < 0.05) continue;
    const top = b.height || 10;
    roofs.push({ path: b.polygon.map((p) => [p[0], p[1], top]), a });
    // a few vertical edges per building (every other corner) keep the volume readable
    b.polygon.forEach((p, i) => { if (i % 2 === 0 && i < b.polygon.length - 1) posts.push({ s: [p[0], p[1], 0], t: [p[0], p[1], top], a: a * 0.7 }); });
  }
  return { roofs, posts };
})();
