// Fenway Park, rebuilt from the OSM outlines: raked seating that steps up away from the field (not
// office blocks with windows), the Green Monster, a real-scale field (grass, infield dirt, bases, foul
// lines), and a ball game that loops through a few plays. The field frame is anchored on the Green
// Monster's west end (the left field foul pole): home plate sits 310 ft back down the left field line.
import { CAMPUS } from "../data/campus.js";

const D = window.deck;
const LON0 = CAMPUS.center[0], LAT0 = CAMPUS.center[1];
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 110574;
const toM = (p) => [(p[0] - LON0) * KX, (p[1] - LAT0) * KY];
const toLL = (m) => [LON0 + m[0] / KX, LAT0 + m[1] / KY];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

// seating stands (not the rooftop club, farm or front office, which stay ordinary buildings)
const STAND_IDS = ["way/813683134", "way/813683142", "way/813683143", "way/813683144", "way/813683149", "way/813739687", "way/814020183"];
const MONSTER_ID = "way/813683146";
/** Buildings the regular building layer should skip: Fenway draws these itself. */
export const FENWAY_IDS = new Set([...STAND_IDS, MONSTER_ID]);

// ---------- the field frame ----------
const POLE = toM([-71.097791, 42.347088]); // left field foul pole, at the Monster's west end
const HOME = [POLE[0] - 15, POLE[1] - 93];
const U1 = (() => { const d = [POLE[0] - HOME[0], POLE[1] - HOME[1]], L = Math.hypot(...d); return [d[0] / L, d[1] / L]; })(); // up the 3rd base line
const U3 = [U1[1], -U1[0]]; // up the 1st base line
/** a: meters toward 3rd/left, b: meters toward 1st/right, from home plate (campus meters). */
const P = (a, b) => [HOME[0] + a * U1[0] + b * U3[0], HOME[1] + a * U1[1] + b * U3[1]];
const PL = (a, b, z = 0) => [...toLL(P(a, b)), z];
const BASE = 27.43; // 90 ft
const MOUND = [13.0, 13.0];

function inside(m, x, y) {
  let o = false;
  for (let i = 0, j = m.length - 1; i < m.length; j = i++) if ((m[i][1] > y) !== (m[j][1] > y) && x < ((m[j][0] - m[i][0]) * (y - m[i][1])) / (m[j][1] - m[i][1]) + m[i][0]) o = !o;
  return o;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0, 1);
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const SHIRTS = [[200, 50, 56], [200, 50, 56], [32, 52, 110], [236, 234, 228], [236, 234, 228], [244, 196, 120], [120, 150, 200]];

export const PARK = (() => {
  const byId = new Map(CAMPUS.buildings.map((b) => [b.id, b]));
  const stands = STAND_IDS.map((id) => byId.get(id)).filter(Boolean).map((b) => ({ b, m: b.polygon.map(toM) }));
  const monster = byId.get(MONSTER_ID);
  if (!stands.length || !monster) return null;
  const walls = [...stands.map((s) => s.m), monster.polygon.map(toM)];

  // the playing surface: from home plate out to the first wall in every direction, capped at the
  // real dimensions where a ray slips through a gap between stands
  const capFair = [[0, 94.5], [10, 101], [20, 110], [30, 115], [45, 119], [55, 128], [65, 122], [75, 116], [84, 106], [90, 92]];
  const cap = (deg) => {
    if (deg >= 0 && deg <= 90) {
      for (let i = 1; i < capFair.length; i++) if (deg <= capFair[i][0]) { const [a0, d0] = capFair[i - 1], [a1, d1] = capFair[i]; return lerp(d0, d1, (deg - a0) / (a1 - a0)); }
    }
    // foul ground reaches the stands; behind the plate the backstop is about 60 ft back
    const off = deg < 0 ? -deg : deg > 90 ? deg - 90 : 0;
    return off > 75 ? 21 : lerp(48, 21, off / 75);
  };
  const ray = (dir) => {
    let best = Infinity;
    for (const w of walls) for (let i = 0; i < w.length - 1; i++) {
      const a = w[i], c = w[i + 1];
      const ex = c[0] - a[0], ey = c[1] - a[1];
      const den = dir[0] * ey - dir[1] * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a[0] - HOME[0]) * ey - (a[1] - HOME[1]) * ex) / den;
      const u = ((a[0] - HOME[0]) * dir[1] - (a[1] - HOME[1]) * dir[0]) / den;
      if (t > 0.5 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    return best;
  };
  const field = [];
  for (let deg = -135; deg < 225; deg += 2) {
    const r = (deg * Math.PI) / 180, dir = [U1[0] * Math.cos(r) + U3[0] * Math.sin(r), U1[1] * Math.cos(r) + U3[1] * Math.sin(r)];
    const d = Math.min(cap(deg), ray(dir));
    field.push([HOME[0] + dir[0] * d, HOME[1] + dir[1] * d]);
  }
  field.push(field[0]);
  const edgeDist = (p) => { let m = Infinity; for (let i = 0; i < field.length - 1; i++) m = Math.min(m, segDist(p, field[i], field[i + 1])); return m; };

  // raked seating: square cells on the field grid, each a step higher the farther it is from the field
  const CELL = 1.6, ROW = 0.8;
  const seats = [];
  const R = rng(310);
  for (const { b, m } of stands) {
    const top = b.height || 12;
    const cells = [];
    const as = m.map((p) => (p[0] - HOME[0]) * U1[0] + (p[1] - HOME[1]) * U1[1]);
    const bs = m.map((p) => (p[0] - HOME[0]) * U3[0] + (p[1] - HOME[1]) * U3[1]);
    for (let a = Math.floor(Math.min(...as) / CELL) * CELL; a < Math.max(...as); a += CELL) {
      for (let bb = Math.floor(Math.min(...bs) / CELL) * CELL; bb < Math.max(...bs); bb += CELL) {
        const c = P(a + CELL / 2, bb + CELL / 2);
        if (inside(m, c[0], c[1])) cells.push({ a, bb, d: edgeDist(c) });
      }
    }
    // the first row starts at this stand's own front edge, then each row steps up
    const d0 = Math.min(...cells.map((q) => q.d));
    for (const q of cells) {
      const row = Math.floor(((q.d - d0) * 0.42) / ROW) + 1;
      const h = Math.min(top, row * ROW);
      seats.push({ poly: [P(q.a, q.bb), P(q.a + CELL, q.bb), P(q.a + CELL, q.bb + CELL), P(q.a, q.bb + CELL)].map(toLL), h, row, top: h >= top - 0.01 });
    }
  }

  // the crowd sits on the seats
  const crowd = [];
  for (const s of seats) if (!s.top && R() < 0.22) {
    const q = s.poly.map(toM), cx = (q[0][0] + q[2][0]) / 2, cy = (q[0][1] + q[2][1]) / 2;
    const shirt = SHIRTS[Math.floor(R() * SHIRTS.length)];
    crowd.push({ pos: [...toLL([cx + (R() - 0.5), cy + (R() - 0.5)]), s.h + 0.55], ph: R() * 10, sp: 0.6 + R() * 2.2, c: shirt });
  }

  // light towers: tall points on the stands' outer rim in six directions
  const verts = stands.flatMap((s) => s.m);
  const c = verts.reduce((acc, v) => [acc[0] + v[0] / verts.length, acc[1] + v[1] / verts.length], [0, 0]);
  const rad = Math.max(...verts.map((v) => Math.hypot(v[0] - c[0], v[1] - c[1])));
  const towers = [];
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2 + 0.3;
    let best = null, bd = -Infinity;
    for (const v of verts) { const d = (v[0] - c[0]) * Math.cos(ang) + (v[1] - c[1]) * Math.sin(ang); if (d > bd) { bd = d; best = v; } }
    towers.push({ pos: [...toLL(best), 38] });
  }

  // infield: the dirt arc around the mound, the grass square inside the bases, base cut-outs
  const dirt = [];
  // a 95 ft circle around the mound, from where it crosses the 3rd base line to where it crosses the 1st
  const cross = (Math.atan2(-MOUND[1], Math.sqrt(29 * 29 - MOUND[1] * MOUND[1])) * 180) / Math.PI;
  for (let k = 0; k <= 48; k++) {
    const th = ((cross + ((90 - 2 * cross) * k) / 48) * Math.PI) / 180;
    dirt.push(P(MOUND[0] + 29 * Math.cos(th), MOUND[1] + 29 * Math.sin(th)));
  }
  const dirtPoly = [P(0, 0), ...dirt].map(toLL);
  const g = 1.6; // grass inset from the base paths
  const grass = [P(g + 1.2, g + 1.2), P(BASE - g, g), P(BASE - g, BASE - g), P(g, BASE - g)].map(toLL);
  const circle = (a, b, r, n = 24) => Array.from({ length: n }, (_, k) => P(a + r * Math.cos((k / n) * 2 * Math.PI), b + r * Math.sin((k / n) * 2 * Math.PI))).map(toLL);
  const square = (a, b, s) => [P(a - s, b - s), P(a + s, b - s), P(a + s, b + s), P(a - s, b + s)].map(toLL);
  const plate = [P(0, 0), P(0.3, -0.1), P(0.43, 0.13), P(0.13, 0.43), P(-0.1, 0.3)].map(toLL);
  const lines = [[P(0, 0), P(130, 0)], [P(0, 0), P(0, 130)]].map((l) => ({ path: l.map((p) => { const d = Math.hypot(p[0] - HOME[0], p[1] - HOME[1]); return d > 5 ? clipToField(p) : p; }).map(toLL) }));
  function clipToField(p) {
    // stop the foul line at the wall
    const dir = [p[0] - HOME[0], p[1] - HOME[1]], L = Math.hypot(...dir), u = [dir[0] / L, dir[1] / L];
    return [HOME[0] + u[0] * Math.min(L, ray(u) - 0.3), HOME[1] + u[1] * Math.min(L, ray(u) - 0.3)];
  }

  return {
    c, ll: toLL(c), rad, towers, crowd, seats,
    field: field.map(toLL), dirt: dirtPoly,
    lawn: field.map((p) => { const dx = p[0] - HOME[0], dy = p[1] - HOME[1], L = Math.hypot(dx, dy); const k = Math.max(0, L - 4.5) / (L || 1); return toLL([HOME[0] + dx * k, HOME[1] + dy * k]); }), grass, plate, lines,
    mound: circle(MOUND[0], MOUND[1], 2.74), homeDirt: circle(0.2, 0.2, 4.0, 32),
    bases: [square(BASE, 0, 0.23), square(BASE, BASE, 0.23), square(0, BASE, 0.23)],
    monster: { poly: monster.polygon, h: monster.height || 11.3 },
  };
})();

const SEAT = { dark: [[30, 74, 58], [38, 88, 68]], light: [[52, 112, 84], [66, 130, 98]] };
const CONCRETE = { dark: [62, 58, 78], light: [208, 204, 200] };
const MONSTER = { dark: [34, 92, 60], light: [42, 118, 74] };
const GRASS = { dark: [58, 138, 76], light: [78, 160, 92] };
const TRACK = { dark: [118, 84, 70], light: [168, 128, 100] };
const DIRT = { dark: [168, 116, 82], light: [196, 142, 100] };

/** Stands, the Green Monster and the field. Always drawn (static geometry). */
export function fenwayLayers(o) {
  if (!PARK) return [];
  const k = o.dark ? "dark" : "light";
  const flat = { depthWriteEnabled: false };
  const out = [
    new D.SolidPolygonLayer({ id: "fenway-track", data: [PARK.field], getPolygon: (d) => d, getFillColor: TRACK[k], parameters: flat, updateTriggers: { getFillColor: k } }),
    new D.SolidPolygonLayer({ id: "fenway-field", data: [PARK.lawn], getPolygon: (d) => d, getFillColor: GRASS[k], parameters: flat, updateTriggers: { getFillColor: k } }),
    new D.SolidPolygonLayer({ id: "fenway-dirt", data: [PARK.dirt, PARK.homeDirt, PARK.mound], getPolygon: (d) => d, getFillColor: DIRT[k], parameters: flat, updateTriggers: { getFillColor: k } }),
    new D.SolidPolygonLayer({ id: "fenway-infield", data: [PARK.grass], getPolygon: (d) => d, getFillColor: GRASS[k], parameters: flat, updateTriggers: { getFillColor: k } }),
    new D.SolidPolygonLayer({ id: "fenway-bases", data: [...PARK.bases, PARK.plate], getPolygon: (d) => d, getFillColor: [250, 248, 240], parameters: flat }),
    new D.PathLayer({ id: "fenway-lines", data: PARK.lines, getPath: (d) => d.path, getWidth: 0.14, widthUnits: "meters", widthMinPixels: 1, getColor: [250, 248, 240, 230], parameters: flat }),
    new D.SolidPolygonLayer({
      id: "fenway-seats", data: PARK.seats, extruded: true, getPolygon: (d) => d.poly, getElevation: (d) => d.h,
      getFillColor: (d) => (d.top ? CONCRETE[k] : SEAT[k][d.row % 2]),
      material: o.material, updateTriggers: { getFillColor: k },
    }),
    new D.SolidPolygonLayer({
      id: "fenway-monster", data: [PARK.monster], extruded: true, getPolygon: (d) => d.poly, getElevation: (d) => d.h,
      getFillColor: MONSTER[k], material: o.material, updateTriggers: { getFillColor: k },
    }),
  ];
  return out;
}

// ---------- the game ----------
// Fielders in their spots (a toward 3rd/left, b toward 1st/right, meters from home plate).
const SPOTS = {
  P: MOUND, C: [-0.9, -0.9], U: [-1.9, -1.9], "1B": [3, 26], "2B": [13, 31], SS: [31, 13], "3B": [26, 3],
  LF: [76, 26], CF: [68, 68], RF: [26, 76], C1: [-3, 26], C3: [26, -3],
};
const RUN = 7.6; // a runner's speed, m/s
const BASES = [[0, 0], [BASE, 0], [BASE, BASE], [0, BASE], [0, 0]].map(([x, y]) => [y, x]); // home, 1st, 2nd, 3rd, home in (a, b)
const PITCH = 1.0, CONTACT = 1.45; // windup, then the ball reaches the plate
const ease = (t) => t * t * (3 - 2 * t);
const at = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
const runPath = (pts, dist) => {
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (dist <= L) return at(pts[i - 1], pts[i], dist / L);
    dist -= L;
  }
  return pts[pts.length - 1];
};
const toward = (from, to, t, speed) => { const L = Math.hypot(to[0] - from[0], to[1] - from[1]); return at(from, to, clamp((t * speed) / (L || 1), 0, 1)); };

// each play: how long it lasts, where the ball goes, who chases it, and how far the batter runs
const PLAYS = [
  { len: 7.5, kind: "ground", to: [31, 15], land: 2.5, fielder: "SS", throwTo: "1B", throwAt: 2.7, catchAt: 3.25, runTo: BASE },
  { len: 8.5, kind: "fly", to: [64, 64], land: 5.0, top: 34, fielder: "CF", runTo: BASE * 0.7 },
  { len: 8.5, kind: "liner", to: [20, 58], land: 2.4, fielder: "RF", throwTo: "2B", throwAt: 4.4, catchAt: 5.4, runTo: BASE },
  { len: 18.5, kind: "homer", to: [104, 24], land: 5.6, top: 44, fielder: "LF", runTo: BASE * 4 },
];
const CYCLE = PLAYS.reduce((s, p) => s + p.len, 0);

/** Where everyone and the ball are t seconds into the loop (exported for QA). */
export function game(t) {
  let tt = ((t % CYCLE) + CYCLE) % CYCLE, play = PLAYS[0];
  for (const p of PLAYS) { if (tt < p.len) { play = p; break; } tt -= p.len; }
  const pos = { ...SPOTS };
  let ball = null;
  const s = tt - CONTACT; // seconds since contact
  // the pitch
  if (tt >= PITCH && tt < CONTACT) { const u = (tt - PITCH) / (CONTACT - PITCH); ball = { p: at(MOUND, [0.3, 0.3], u), z: lerp(1.9, 0.9, u) }; }
  if (s >= 0) {
    const from = [0.3, 0.3];
    // the ball in play
    if (s < play.land) {
      const u = s / play.land;
      const z = play.kind === "ground" ? 0.12 + Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u) * 1.4
        : play.kind === "liner" ? 1 + 3 * Math.sin(u * Math.PI)
        : 1 + play.top * 4 * u * (1 - u);
      ball = { p: at(from, play.to, play.kind === "ground" ? ease(u) : u), z };
    } else if (play.throwTo && s < play.catchAt) {
      if (s < play.throwAt) ball = { p: play.to, z: 1.2 }; // fielding it
      else { const u = (s - play.throwAt) / (play.catchAt - play.throwAt); ball = { p: at(play.to, play.throwTo === "1B" ? [0.4, BASE] : [BASE, BASE], u), z: 1.6 + 2 * Math.sin(u * Math.PI) }; }
    } else if (play.kind === "fly" && s < play.land + 2) ball = { p: play.to, z: 1.8 }; // in the glove
    // the fielder goes to the ball
    const f0 = SPOTS[play.fielder];
    if (s < play.land + (play.throwAt ? play.throwAt - play.land : 1.5)) pos[play.fielder] = play.kind === "homer" ? toward(f0, [88, 28], s, 6) : toward(f0, play.to, s, 7);
    else pos[play.fielder] = toward(play.kind === "homer" ? [88, 28] : play.to, f0, s - play.land - 2, 3);
    // the covering baseman steps onto the bag
    if (play.throwTo === "1B") pos["1B"] = toward(SPOTS["1B"], [0.4, BASE], s, 6);
    if (play.throwTo === "2B") pos.SS = toward(SPOTS.SS, [BASE, BASE], s, 6);
    // the batter becomes a runner
    pos.B = runPath(BASES, Math.min(play.runTo, s * (play.kind === "homer" ? 7 : RUN)));
  } else pos.B = [1.1, -0.5];
  return { pos, ball };
}

const HOME_TEAM = new Set(["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"]);
/** The players and the ball. Animated, so it lives with the other city life. */
export function gameLayers(o) {
  if (!PARK || (o.zoom || 15) < 16.3) return [];
  const { pos, ball } = game(o.t);
  const people = Object.entries(pos).map(([k, p]) => ({
    k, ll: PL(p[0], p[1]),
    body: k === "U" ? [34, 34, 44] : HOME_TEAM.has(k) ? [246, 244, 238] : k === "B" ? [150, 150, 160] : [190, 190, 200],
    cap: HOME_TEAM.has(k) ? [26, 40, 92] : k === "U" ? [20, 20, 26] : [150, 30, 40],
  }));
  const k = clamp(((o.zoom || 15) - 16.3) / 0.4, 0, 1);
  const out = [
    // players are drawn a bit larger than life so the game reads from above, like map pins
    new D.ScatterplotLayer({ id: "game-shadows", data: people, getPosition: (d) => [d.ll[0], d.ll[1], 0.06], getRadius: 0.9, radiusUnits: "meters", getFillColor: [0, 0, 0, Math.round(90 * k)], parameters: { depthWriteEnabled: false } }),
    new D.ColumnLayer({ id: "game-players", data: people, getPosition: (d) => [d.ll[0], d.ll[1]], diskResolution: 12, radius: 0.6, extruded: true, getElevation: 2.6, getFillColor: (d) => [...d.body, Math.round(255 * k)], material: false }),
    new D.ScatterplotLayer({ id: "game-caps", data: people, getPosition: (d) => [d.ll[0], d.ll[1], 2.95], getRadius: 0.5, radiusUnits: "meters", radiusMinPixels: 1.5, billboard: true, getFillColor: (d) => [...d.cap, Math.round(255 * k)] }),
  ];
  if (ball) {
    const bl = PL(ball.p[0], ball.p[1]);
    out.push(new D.ScatterplotLayer({ id: "game-ball-shadow", data: [0], getPosition: () => [bl[0], bl[1], 0.07], getRadius: 0.22, radiusUnits: "meters", radiusMinPixels: 1, getFillColor: [0, 0, 0, Math.round(110 * k)], parameters: { depthWriteEnabled: false } }));
    out.push(new D.ScatterplotLayer({ id: "game-ball-glow", data: [0], getPosition: () => [bl[0], bl[1], ball.z], getRadius: 1.1, radiusUnits: "meters", radiusMinPixels: 5, billboard: true, getFillColor: [255, 255, 240, Math.round(70 * k)], parameters: { depthWriteEnabled: false } }));
    out.push(new D.ScatterplotLayer({ id: "game-ball", data: [0], getPosition: () => [bl[0], bl[1], ball.z], getRadius: 0.35, radiusUnits: "meters", radiusMinPixels: 2.2, billboard: true, getFillColor: [255, 255, 255, Math.round(255 * k)] }));
  }
  return out;
}
