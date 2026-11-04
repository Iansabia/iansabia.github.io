// deck.gl scene in the SwapChain style: a flat-shaded sketch ground that fades into the page,
// a hairline grid past the data edge, soft extruded massing with purple outlines, and calm light.
import {
  DATA, LON0, LAT0, KX, KY, EXAG, height, drape, densify, pointIn, centroid, FEATURES, HOLE, SHOTS, PAST, PAST_RIGHT,
  WATER, add, sub, mul, norm, right, lerp, lerp2, clamp, smooth, dist, TEE,
} from "./world.js";
import { BONES_SWING, BONES_WALK } from "./pose.js";
import { TICKS, PATHS } from "./story.js";
import { sceneColors, isDark } from "./theme.js";

const D = window.deck;
const MO = D.COORDINATE_SYSTEM.METER_OFFSETS;
const ORIGIN = [LON0, LAT0, 0];
const rgba = (c, a) => [c[0], c[1], c[2], a == null ? (c[3] == null ? 255 : c[3]) : Math.round(clamp(a, 0, 255))];
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
const [BX0, BY0, BX1, BY1] = DATA.bbox;

// ---------- shader extensions ----------
// Edge fog (from SwapChain): ground layers fade out over the last few hundred meters of the data box,
// so the model dissolves into the page instead of ending at a hard line. Optional mowing stripes.
class Ground extends D.LayerExtension {
  getShaders(ext) {
    const o = (ext && ext.opts) || {};
    const fade = o.fade || 300;
    const bg = o.bg;
    const apply = bg
      ? `gFog = clamp(gFog, 0.0, 1.0); color.rgb = mix(vec3(${bg.map((v) => (v / 255).toFixed(4)).join(",")}), color.rgb, gFog);`
      : "color.a *= gFog; if (color.a < 0.01) discard;";
    const stripes = o.stripes
      ? `{ float sd = dot(vGWP, vec2(${o.stripes[0].toFixed(4)}, ${o.stripes[1].toFixed(4)})) / ${(o.stripeW || 7).toFixed(1)};
           float sk = smoothstep(0.42, 0.5, abs(fract(sd) - 0.5));
           color.rgb = mix(color.rgb, color.rgb * ${(o.stripeK || 0.965).toFixed(3)} + vec3(${(o.stripeAdd || 0).toFixed(3)}), sk); }`
      : "";
    return {
      inject: {
        "vs:#decl": "out vec2 vGWP;",
        "vs:DECKGL_FILTER_COLOR": "vGWP = geometry.worldPosition.xy;",
        "fs:#decl": "in vec2 vGWP;",
        "fs:DECKGL_FILTER_COLOR": `
          float gdx = min(vGWP.x - (${BX0.toFixed(1)}), (${BX1.toFixed(1)}) - vGWP.x);
          float gdy = min(vGWP.y - (${BY0.toFixed(1)}), (${BY1.toFixed(1)}) - vGWP.y);
          float gFog = smoothstep(10.0, ${fade.toFixed(1)}, min(gdx, gdy));
          ${stripes}
          ${apply}`,
      },
    };
  }
}
Ground.extensionName = "Ground";
class SoftDisc extends D.LayerExtension {
  getShaders() {
    return { inject: { "fs:DECKGL_FILTER_COLOR": "float sdR = length(geometry.uv); color.a *= pow(1.0 - smoothstep(0.0, 1.0, sdR), 1.6);" } };
  }
}
SoftDisc.extensionName = "SoftDisc";
const SOFT = [new SoftDisc()];
const fogCache = new Map();
let FOG_OFF = false; // the frame-time probe turns the edge fog off on slow devices
const fog = (opts = {}) => {
  if (FOG_OFF) return [];
  const k = JSON.stringify(opts);
  if (!fogCache.has(k)) fogCache.set(k, [new Ground(opts)]);
  return fogCache.get(k);
};
const DASH = [new D.PathStyleExtension({ dash: true })];

const FLAT = { depthCompare: "always", depthWriteEnabled: false };
const NODEPTH = { depthCompare: "always", depthWriteEnabled: false };
const base = { coordinateSystem: MO, coordinateOrigin: ORIGIN };

// ---------- static geometry (built once) ----------
const course = DATA.polys.course[0];
const ranges = DATA.polys.range;
const isMine = (f) => f.h === HOLE.ref;

function buildTerrain(step) {
  const nx = Math.floor((BX1 - BX0) / step) + 1, ny = Math.floor((BY1 - BY0) / step) + 1;
  const N = nx * ny;
  const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), cls = new Uint8Array(N);
  const cbox = course ? bboxOf(course.p) : null;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = BX0 + i * step, y = BY0 + j * step, k = j * nx + i;
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = height(x, y);
    let c = 0;
    if (WATER.some((w) => x >= w.box[0] && x <= w.box[2] && y >= w.box[1] && y <= w.box[3] && pointIn([x, y], w.p))) c = 2;
    else if (cbox && x >= cbox[0] && x <= cbox[2] && y >= cbox[1] && y <= cbox[3] && pointIn([x, y], course.p)) c = 1;
    else if (ranges.some((r) => pointIn([x, y], r.p))) c = 1;
    cls[k] = c;
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    const zl = pos[(j * nx + Math.max(0, i - 1)) * 3 + 2], zr = pos[(j * nx + Math.min(nx - 1, i + 1)) * 3 + 2];
    const zd = pos[(Math.max(0, j - 1) * nx + i) * 3 + 2], zu = pos[(Math.min(ny - 1, j + 1) * nx + i) * 3 + 2];
    const n = [-(zr - zl) / (2 * step), -(zu - zd) / (2 * step), 1], l = Math.hypot(...n);
    nor[k * 3] = n[0] / l; nor[k * 3 + 1] = n[1] / l; nor[k * 3 + 2] = n[2] / l;
  }
  const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let q = 0;
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx[q++] = a; idx[q++] = b; idx[q++] = d; idx[q++] = a; idx[q++] = d; idx[q++] = c;
  }
  return { pos, nor, cls, idx, N };
}
function bboxOf(r) {
  const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
function terrainMesh(T, C) {
  const col = new Float32Array(T.N * 3);
  const sun = norm3([-0.55, 0.62, 0.56]);
  const dark = isDark();
  for (let k = 0; k < T.N; k++) {
    const c = T.cls[k] === 2 ? C.water : T.cls[k] === 1 ? C.rough : C.ground;
    const lam = T.nor[k * 3] * sun[0] + T.nor[k * 3 + 1] * sun[1] + T.nor[k * 3 + 2] * sun[2];
    const s = clamp(1 + (lam - sun[2]) * (dark ? 1.8 : 1.1), 0.86, dark ? 1.25 : 1.035); // hillshade, relative to flat ground
    col[k * 3] = clamp((c[0] / 255) * s, 0, 1); col[k * 3 + 1] = clamp((c[1] / 255) * s, 0, 1); col[k * 3 + 2] = clamp((c[2] / 255) * s, 0, 1);
  }
  return {
    attributes: {
      positions: { value: T.pos, size: 3 },
      normals: { value: T.nor, size: 3 },
      colors: { value: col, size: 3 },
      texCoords: { value: new Float32Array(T.N * 2), size: 2 },
    },
    indices: { value: T.idx, size: 1 },
    topology: "triangle-list",
  };
}
const norm3 = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };

// ground grid (as in SwapChain): hairlines across the whole floor, draped on the terrain under the
// course and carried past the data edge into the page, fading toward the horizon
const GRID = (() => {
  const step = 60, seg = 30, pad = 1400, out = [];
  const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const alpha = (x, y) => {
    const d = Math.max(Math.max(BX0 - x, x - BX1), Math.max(BY0 - y, y - BY1)); // meters outside the data box
    return (0.6 + 0.4 * sm(-300, 0, d)) * (1 - sm(260, 1300, d));
  };
  const z = (x, y) => height(x, y) + 0.06;
  const addSeg = (x0, y0, x1, y1, major) => { const a = alpha((x0 + x1) / 2, (y0 + y1) / 2); if (a > 0.02) out.push({ s: [x0, y0, z(x0, y0)], t: [x1, y1, z(x1, y1)], a, major }); };
  for (let x = Math.floor((BX0 - pad) / step) * step; x <= BX1 + pad; x += step) for (let y = BY0 - pad; y < BY1 + pad; y += seg) addSeg(x, y, x, y + seg, Math.round(x / step) % 4 === 0);
  for (let y = Math.floor((BY0 - pad) / step) * step; y <= BY1 + pad; y += step) for (let x = BX0 - pad; x < BX1 + pad; x += seg) addSeg(x, y, x + seg, y, Math.round(y / step) % 4 === 0);
  return out;
})();

// draped feature geometry
const dr = (f, lift, step) => ({ ...f, poly: drape(f.p, lift, step), ring: drape(f.p, lift + 0.05, step) });
const POLY = {
  fairway: DATA.polys.fairway.map((f) => dr(f, 0.04, 6)),
  green: DATA.polys.green.map((f) => dr(f, 0.06, 3)),
  bunker: DATA.polys.bunker.map((f) => dr(f, 0.05, 3)),
  // tee boxes lie almost flat, in the fairway tone with an outline; only the one in use stands out
  tee: DATA.polys.tee.map((f) => ({ ...dr(f, 0.07, 3), used: !!TEE && f.p === TEE.p })),
  water: WATER.map((w) => ({ ...w, poly: w.p.map((p) => [p[0], p[1], w.level + 0.02]) })),
  building: DATA.polys.building.map((b) => {
    const zb = Math.min(...b.p.map((p) => height(p[0], p[1])));
    return { poly: b.p.map((p) => [p[0], p[1], zb]), elev: b.z, roof: [...b.p, b.p[0]].map((p) => [p[0], p[1], zb + b.z + 0.03]) };
  }),
};
// building wires (SwapChain edge glow): roof outlines and every other corner post
const BWIRE = {
  roofs: POLY.building.map((b) => ({ path: b.roof })),
  posts: POLY.building.flatMap((b) => b.poly.filter((_, i) => i % 2 === 0).map((p) => ({ s: p, t: [p[0], p[1], p[2] + b.elev] }))),
};
const LINES = {
  cart: DATA.lines.cartpath.map((c) => ({ ...c, path: drape(c.p, 0.08, 6, false) })),
  major: DATA.lines.major.map((c) => ({ path: drape(c.p, 0.05, 12, false) })),
  minor: DATA.lines.minor.map((c) => ({ path: drape(c.p, 0.05, 12, false) })),
  foot: DATA.lines.path.map((c) => ({ path: drape(c.p, 0.05, 12, false) })),
  contour: DATA.contours.map((c) => ({ ...c, path: c.p.map((p) => [p[0], p[1], height(p[0], p[1]) + 0.03]) })),
  course: course ? [{ path: drape([...course.p, course.p[0]], 0.04, 6, false) }] : [],
  waterEdge: WATER.map((w) => ({ path: [...w.p, w.p[0]].map((p) => [p[0], p[1], w.level + 0.04]) })),
};
// night lamps along the cart paths and roads (dark theme only), like SwapChain's street lights
const LAMPS = (() => {
  const out = [];
  const along = (pts, every) => {
    let acc = every * 0.5;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = dist(a, b);
      while (acc < L) { const p = lerp2(a, b, acc / L); out.push([p[0], p[1], height(p[0], p[1]) + 0.6]); acc += every; }
      acc -= L;
    }
  };
  DATA.lines.cartpath.forEach((c) => along(c.p, 38));
  DATA.lines.major.forEach((c) => along(c.p, 55));
  return out;
})();
// the hole line (sketched as a faint dotted center line, like a yardage book)
const holeLine = drape(HOLE.line, 0.12, 4, false);
const PIN = SHOTS.pin;
const PIN_Z = height(PIN[0], PIN[1]);
const stripeDir = norm(sub(HOLE.line[1], HOLE.line[0]));

// ---------- the scene ----------
export class Scene {
  constructor(container, { phone, onReady }) {
    this.container = container;
    this.phone = phone;
    this.colors = sceneColors();
    this.quality = 0; // 0 full, 1 lower pixel ratio, 2 no fog and no buildings
    this.terrain = buildTerrain(phone ? 10 : 6);
    this.material = { ambient: 0.84, diffuse: 0.42, shininess: 8, specularColor: [30, 30, 34] };
    this.hiMaterial = { ambient: 0.97, diffuse: 0.3, shininess: 16, specularColor: [40, 44, 52] };
    this.vs = { longitude: LON0, latitude: LAT0, zoom: 17, pitch: 50, bearing: 0 };
    this.deck = new D.Deck({
      parent: container,
      views: new D.MapView({ repeat: false, nearZMultiplier: 0.05, farZMultiplier: 1.6 }),
      viewState: this.vs,
      controller: false,
      effects: [this.makeLighting()],
      layers: [],
      useDevicePixels: phone ? 1.5 : Math.min(window.devicePixelRatio || 1, 2),
      onLoad: () => { this.loaded = true; onReady && onReady(); },
      onError: (e) => console.warn("deck", e && e.message),
    });
    this.canvas = container.querySelector("canvas");
    if (this.canvas) this.canvas.setAttribute("aria-hidden", "true");
    this.buildStatic();
  }

  makeLighting() {
    const dark = isDark();
    return new D.LightingEffect({
      ambient: new D.AmbientLight({ color: [255, 255, 255], intensity: dark ? 1.0 : 0.8 }),
      sun: new D.DirectionalLight({ color: [255, 255, 255], intensity: dark ? 0.5 : 0.9, direction: [-1.2, 1.6, -2.4] }),
      fill: new D.DirectionalLight({ color: [235, 240, 255], intensity: 0.18, direction: [1, -0.6, -1.2] }),
    });
  }

  /** Called by the frame-time probe: step quality down one level when frames run slow. */
  setQuality(q) {
    if (q <= this.quality) return;
    this.quality = q;
    if (q >= 1) this.deck.setProps({ useDevicePixels: 1 });
    if (q >= 2) { FOG_OFF = true; this.buildStatic(); }
  }

  setTheme() {
    this.colors = sceneColors();
    this.deck.setProps({ effects: [this.makeLighting()] });
    this.buildStatic();
  }

  buildStatic() {
    const C = this.colors, dark = isDark(), tk = dark ? "d" : "l";
    const L = [];
    L.push(new D.SimpleMeshLayer({
      ...base, id: "terrain-" + tk, data: [0], mesh: terrainMesh(this.terrain, C), getPosition: () => [0, 0, 0], getColor: [255, 255, 255],
      // SimpleMeshLayer always lights its mesh: an ambient-only material undoes the ambient light, so the
      // baked hillshade colors come through as drawn
      material: { ambient: 1 / (dark ? 1.0 : 0.8), diffuse: 0, shininess: 1, specularColor: [0, 0, 0] }, parameters: FLAT, extensions: fog({ fade: 320 }),
    }));
    L.push(new D.PathLayer({
      ...base, id: "contours", data: LINES.contour, getPath: (d) => d.path, getColor: (d) => rgba(C.contour, (d.major ? 1.6 : 1) * (dark ? 46 : 40)),
      getWidth: (d) => (d.major ? 1.3 : 1), widthUnits: "pixels", parameters: FLAT, extensions: fog({ fade: 320 }), updateTriggers: { getColor: tk },
    }));
    // the ground grid sits on the floor and the rough, under every course surface
    const gk = dark ? 150 : 104;
    if (dark) L.push(new D.LineLayer({
      ...base, id: "grid-glow", data: GRID.filter((d) => d.major), getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t,
      getColor: (d) => rgba(C.grid, d.a * 42), getWidth: 5, widthUnits: "pixels", parameters: FLAT, updateTriggers: { getColor: tk },
    }));
    L.push(new D.LineLayer({
      ...base, id: "grid", data: GRID, getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t,
      getColor: (d) => rgba(C.grid, d.a * (d.major ? gk : gk * 0.5)), getWidth: (d) => (d.major ? 1.2 : 1), widthUnits: "pixels",
      parameters: FLAT, updateTriggers: { getColor: tk },
    }));
    const road = (id, data, color, w, minPx) => new D.PathLayer({
      ...base, id, data, getPath: (d) => d.path, getColor: color, getWidth: w, widthUnits: "meters", widthMinPixels: minPx,
      capRounded: true, jointRounded: true, parameters: FLAT, extensions: fog({ fade: 320 }), updateTriggers: { getColor: tk },
    });
    L.push(road("road-major-edge", LINES.major, C.roadEdge, 11, 2.5), road("road-minor-edge", LINES.minor, C.roadEdge, 8, 1.5));
    L.push(road("road-major", LINES.major, C.road, 8.5, 1.5), road("road-minor", LINES.minor, C.road, 5.5, 1), road("road-foot", LINES.foot, C.road, 1.6, 0.6));
    L.push(new D.SolidPolygonLayer({
      ...base, id: "water", data: POLY.water, getPolygon: (d) => d.poly, getFillColor: C.water, material: false, parameters: FLAT,
      extensions: fog({ fade: 320 }), updateTriggers: { getFillColor: tk },
    }));
    L.push(new D.PathLayer({
      ...base, id: "water-edge", data: LINES.waterEdge, getPath: (d) => d.path, getColor: C.waterEdge, getWidth: 1.5, widthUnits: "pixels",
      parameters: FLAT, extensions: fog({ fade: 320 }), updateTriggers: { getColor: tk },
    }));
    L.push(new D.PathLayer({
      ...base, id: "course-edge", data: LINES.course, getPath: (d) => d.path, getColor: rgba(C.fairwayEdge, 200), getWidth: 1.2, widthUnits: "pixels",
      parameters: FLAT, extensions: fog({ fade: 320 }), updateTriggers: { getColor: tk },
    }));
    // fairways: this hole's mown stripes run across the line of play
    L.push(new D.SolidPolygonLayer({
      ...base, id: "fairways-other", data: POLY.fairway.filter((f) => !isMine(f)), getPolygon: (d) => d.poly, getFillColor: C.fairwayDim,
      material: false, parameters: FLAT, extensions: fog({ fade: 320 }), updateTriggers: { getFillColor: tk },
    }));
    L.push(new D.SolidPolygonLayer({
      ...base, id: "fairway", data: POLY.fairway.filter(isMine), getPolygon: (d) => d.poly, getFillColor: C.fairway, material: false, parameters: FLAT,
      extensions: fog({ fade: 320, stripes: stripeDir, stripeW: 7, stripeK: dark ? 1.0 : 0.972, stripeAdd: dark ? 0.03 : 0 }),
      updateTriggers: { getFillColor: tk },
    }));
    L.push(new D.PathLayer({
      ...base, id: "fairway-edge", data: POLY.fairway, getPath: (d) => d.ring, getColor: (d) => rgba(C.fairwayEdge, isMine(d) ? 230 : 120),
      getWidth: (d) => (isMine(d) ? 1.3 : 1), widthUnits: "pixels", parameters: FLAT, extensions: fog({ fade: 320 }), updateTriggers: { getColor: tk },
    }));
    L.push(new D.SolidPolygonLayer({
      ...base, id: "bunkers", data: POLY.bunker, getPolygon: (d) => d.poly, getFillColor: (d) => (isMine(d) ? C.bunker : mix(C.bunker, C.rough, 0.35)),
      material: false, parameters: FLAT, extensions: fog({ fade: 320 }), updateTriggers: { getFillColor: tk },
    }));
    L.push(new D.PathLayer({
      ...base, id: "bunker-edge", data: POLY.bunker, getPath: (d) => d.ring, getColor: (d) => rgba(C.bunkerEdge, isMine(d) ? 255 : 150),
      getWidth: 1.1, widthUnits: "pixels", parameters: FLAT, extensions: fog({ fade: 320 }), updateTriggers: { getColor: tk },
    }));
    L.push(new D.SolidPolygonLayer({
      ...base, id: "tees", data: POLY.tee, getPolygon: (d) => d.poly, material: false, parameters: FLAT,
      getFillColor: (d) => (d.used ? C.tee : isMine(d) ? mix(C.tee, C.fairwayDim, 0.55) : C.fairwayDim),
      extensions: fog({ fade: 320 }), updateTriggers: { getFillColor: tk },
    }));
    L.push(new D.PathLayer({
      ...base, id: "tee-edge", data: POLY.tee, getPath: (d) => d.ring, getColor: (d) => rgba(C.teeEdge, d.used ? 230 : isMine(d) ? 110 : 60),
      getWidth: (d) => (d.used ? 1.6 : 1), widthUnits: "pixels", parameters: FLAT, extensions: fog({ fade: 320 }), updateTriggers: { getColor: tk },
    }));
    L.push(new D.SolidPolygonLayer({
      ...base, id: "greens", data: POLY.green, getPolygon: (d) => d.poly, getFillColor: (d) => (isMine(d) ? C.green : C.greenDim), material: false, parameters: FLAT,
      extensions: fog({ fade: 320, stripes: stripeDir, stripeW: 2.4, stripeK: dark ? 0.96 : 0.985 }), updateTriggers: { getFillColor: tk },
    }));
    L.push(new D.PathLayer({
      ...base, id: "green-edge", data: POLY.green, getPath: (d) => d.ring, getColor: (d) => rgba(C.greenEdge, isMine(d) ? 235 : 90),
      getWidth: (d) => (isMine(d) ? 2 : 1), widthUnits: "pixels", parameters: FLAT, extensions: fog({ fade: 320 }), updateTriggers: { getColor: tk },
    }));
    L.push(new D.PathLayer({
      ...base, id: "cartpath-edge", data: LINES.cart, getPath: (d) => d.path, getColor: C.cartpathEdge, getWidth: 2.8, widthUnits: "meters", widthMinPixels: 1.6,
      capRounded: true, jointRounded: true, parameters: FLAT, extensions: fog({ fade: 320 }), updateTriggers: { getColor: tk },
    }));
    L.push(new D.PathLayer({
      ...base, id: "cartpath", data: LINES.cart, getPath: (d) => d.path, getColor: C.cartpath, getWidth: 2.0, widthUnits: "meters", widthMinPixels: 0.8,
      capRounded: true, jointRounded: true, parameters: FLAT, extensions: fog({ fade: 320 }), updateTriggers: { getColor: tk },
    }));
    // buildings: soft massing with SwapChain's edge wires (bright at night, a faint line by day)
    if (this.quality < 2) {
      L.push(new D.SolidPolygonLayer({
        ...base, id: "buildings", data: POLY.building, extruded: true, getPolygon: (d) => d.poly, getElevation: (d) => d.elev,
        getFillColor: C.building, material: this.material, extensions: fog({ fade: 320, bg: C.bg }), updateTriggers: { getFillColor: tk },
      }));
      const wk = dark ? 200 : 64;
      if (dark) L.push(new D.PathLayer({
        ...base, id: "bld-roof-glow", data: BWIRE.roofs, getPath: (d) => d.path, getColor: rgba(C.buildingEdge, 46), getWidth: 5, widthUnits: "pixels",
        jointRounded: true, parameters: { depthWriteEnabled: false }, extensions: fog({ fade: 320 }), updateTriggers: { getColor: tk },
      }));
      L.push(new D.PathLayer({
        ...base, id: "bld-roofs", data: BWIRE.roofs, getPath: (d) => d.path, getColor: rgba(C.buildingEdge, wk), getWidth: 1.2, widthUnits: "pixels",
        jointRounded: true, parameters: { depthWriteEnabled: false }, extensions: fog({ fade: 320 }), updateTriggers: { getColor: tk },
      }));
      L.push(new D.LineLayer({
        ...base, id: "bld-posts", data: BWIRE.posts, getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t, getColor: rgba(C.buildingEdge, wk * 0.7),
        getWidth: 1, widthUnits: "pixels", parameters: { depthWriteEnabled: false }, extensions: fog({ fade: 320 }), updateTriggers: { getColor: tk },
      }));
    }
    // night lamps
    if (dark) {
      L.push(new D.ScatterplotLayer({
        ...base, id: "lamp-glow", data: LAMPS, getPosition: (d) => d, getRadius: 9, radiusUnits: "pixels", getFillColor: rgba(C.lamp, 70),
        extensions: SOFT, parameters: NODEPTH, updateTriggers: { getFillColor: tk },
      }));
      L.push(new D.ScatterplotLayer({
        ...base, id: "lamps", data: LAMPS, getPosition: (d) => d, getRadius: 1.6, radiusUnits: "pixels", getFillColor: rgba(C.lamp, 235),
        parameters: NODEPTH, updateTriggers: { getFillColor: tk },
      }));
    }
    // the flag: a tall pole and a big pennant, with a soft halo so it reads from far away
    const POLE_H = 3.0;
    const pole = [[PIN[0], PIN[1], PIN_Z], [PIN[0], PIN[1], PIN_Z + POLE_H]];
    const fd = right(SHOTS.dir2); // the pennant flies to the right, across the line of play
    const flagPoly = [[PIN[0], PIN[1], PIN_Z + POLE_H], [PIN[0] + fd[0] * 1.5, PIN[1] + fd[1] * 1.5, PIN_Z + POLE_H - 0.45], [PIN[0], PIN[1], PIN_Z + POLE_H - 0.95]];
    const n = [fd[1] * 0.025, -fd[0] * 0.025], zb = PIN_Z + POLE_H - 0.9;
    const tip = [PIN[0] + fd[0] * 1.45, PIN[1] + fd[1] * 1.45];
    const panel = { poly: [[PIN[0] + n[0], PIN[1] + n[1], zb], [tip[0] + n[0], tip[1] + n[1], zb], [tip[0] - n[0], tip[1] - n[1], zb], [PIN[0] - n[0], PIN[1] - n[1], zb]], h: 0.9 };
    const outline = [[PIN[0], PIN[1], zb], [tip[0], tip[1], zb], [tip[0], tip[1], zb + 0.9], [PIN[0], PIN[1], zb + 0.9]];
    this.flag = { pole, flagPoly, panel, outline: [...outline, outline[0]], mid: [PIN[0] + fd[0] * 0.72, PIN[1] + fd[1] * 0.72, zb + 0.45] };
    this.static = L;
    this.dirty = true;
  }

  // ---------- per-frame ----------
  render(S, view) {
    const C = this.colors, dark = isDark();
    const L = [...this.static];
    const grow = (a) => smooth(a);

    // hole cup + flag (the flag stays in for the short putt, so the cup is easy to find)
    L.push(new D.ScatterplotLayer({
      ...base, id: "cup", data: [0], getPosition: () => [PIN[0], PIN[1], PIN_Z + 0.07], getRadius: 0.2, radiusUnits: "meters", radiusMinPixels: 2,
      getFillColor: rgba(dark ? [8, 6, 18] : C.ink, 235), stroked: true, getLineColor: rgba(C.halo, 230), getLineWidth: 1.5, lineWidthUnits: "pixels", parameters: NODEPTH,
    }));
    {
      const F = this.flag;
      L.push(new D.ScatterplotLayer({
        ...base, id: "flag-halo", data: [0], getPosition: () => F.mid, getRadius: 30, radiusUnits: "pixels", getFillColor: rgba(C.flagHalo, dark ? 120 : 105),
        extensions: SOFT, parameters: NODEPTH, updateTriggers: { getFillColor: dark },
      }));
      L.push(new D.ScatterplotLayer({
        ...base, id: "pin-ring", data: [0], getPosition: () => [PIN[0], PIN[1], PIN_Z + 0.08], getRadius: 9, radiusUnits: "pixels",
        stroked: true, filled: false, getLineColor: rgba(C.flag, 200), getLineWidth: 1.5, lineWidthUnits: "pixels", parameters: NODEPTH,
      }));
      L.push(new D.PathLayer({
        ...base, id: "pole-halo", data: [0], getPath: () => F.pole, getColor: rgba(C.halo, 220), getWidth: 0.09, widthUnits: "meters", widthMinPixels: 4.5,
        billboard: true, capRounded: true, parameters: NODEPTH,
      }));
      L.push(new D.PathLayer({
        ...base, id: "pole", data: [0], getPath: () => F.pole, getColor: rgba(C.pole, 255), getWidth: 0.05, widthUnits: "meters", widthMinPixels: 2.2,
        billboard: true, capRounded: true, parameters: NODEPTH,
      }));
      // the pennant: a thin solid panel (extruded like the SwapChain massing), flying across the line of play
      L.push(new D.SolidPolygonLayer({
        ...base, id: "flag", data: [F.panel], extruded: true, getPolygon: (d) => d.poly, getElevation: (d) => d.h, getFillColor: rgba(C.flag, 255),
        material: this.hiMaterial, parameters: NODEPTH, updateTriggers: { getFillColor: dark },
      }));
      L.push(new D.PathLayer({
        ...base, id: "flag-edge", data: [F.outline], getPath: (d) => d, getColor: rgba(C.halo, 210), getWidth: 1.2, widthUnits: "pixels",
        jointRounded: true, parameters: NODEPTH,
      }));
      // a pixel-sized marker on the pennant keeps the flag findable in the wide shots
      if ((view.zoom || 0) < 20.5) L.push(new D.ScatterplotLayer({
        ...base, id: "flag-dot", data: [0], getPosition: () => F.mid, getRadius: 0.25, radiusUnits: "meters", radiusMinPixels: 4.5, radiusMaxPixels: 7,
        getFillColor: rgba(C.flag, 255), stroked: true, getLineColor: rgba(C.halo, 255), getLineWidth: 1.5, lineWidthUnits: "pixels", parameters: NODEPTH,
      }));
    }

    // the hole's center line steps aside while the aim line is up, so only one dotted line points at the green
    const hl = 1 - S.aimA;
    if (hl > 0.01) L.push(new D.PathLayer({
      ...base, id: "hole-line", data: [{ path: holeLine }], getPath: (d) => d.path, getColor: rgba(C.accent, (dark ? 120 : 105) * hl), getWidth: 1.5, widthUnits: "pixels",
      getDashArray: [3, 4], dashJustified: true, extensions: DASH, parameters: FLAT,
    }));
    // ground marks: yard ticks along the tee shot's track, the landing ring, the ball finder
    const tickA = Math.max(...S.ticks.map((k) => k.a), 0);
    if (tickA > 0.01) {
      L.push(new D.PathLayer({
        ...base, id: "track", data: [0], getPath: () => [[...SHOTS.tee.from, height(...SHOTS.tee.from) + 0.12], [...SHOTS.tee.land, height(...SHOTS.tee.land) + 0.12]],
        getColor: rgba(C.accent, 150 * tickA), getWidth: 1.5, widthUnits: "pixels", getDashArray: [2, 3], extensions: DASH, parameters: NODEPTH,
      }));
      L.push(new D.ScatterplotLayer({
        ...base, id: "ticks", data: S.ticks, getPosition: (d) => d.p, getRadius: 3.5, radiusUnits: "pixels", stroked: true, lineWidthUnits: "pixels", getLineWidth: 1.5,
        getFillColor: (d) => rgba(C.trackDot, 255 * d.a), getLineColor: (d) => rgba(C.accent, 255 * d.a), parameters: NODEPTH,
        updateTriggers: { getFillColor: S.t, getLineColor: S.t },
      }));
    }
    const ring = (id, p, a, r, color, pulse) => {
      if (a <= 0.01) return;
      const z = height(p[0], p[1]) + 0.1;
      const k = pulse ? (S.t * 0.8) % 1 : 0;
      L.push(new D.ScatterplotLayer({
        ...base, id: id + "-glow", data: [0], getPosition: () => [p[0], p[1], z], getRadius: r * 2.2, radiusUnits: "meters", getFillColor: rgba(color, 90 * a),
        extensions: SOFT, parameters: NODEPTH,
      }));
      L.push(new D.ScatterplotLayer({
        ...base, id: id, data: [0], getPosition: () => [p[0], p[1], z], getRadius: r, radiusUnits: "meters", radiusMinPixels: 6, stroked: true, filled: false,
        getLineColor: rgba(color, 230 * a), getLineWidth: 2, lineWidthUnits: "pixels", parameters: NODEPTH,
      }));
      if (pulse) L.push(new D.ScatterplotLayer({
        ...base, id: id + "-pulse", data: [0], getPosition: () => [p[0], p[1], z], getRadius: r * (1 + 2.2 * k), radiusUnits: "meters", stroked: true, filled: false,
        getLineColor: rgba(color, 200 * a * (1 - k)), getLineWidth: 1.5, lineWidthUnits: "pixels", parameters: NODEPTH,
      }));
    };
    ring("land", SHOTS.tee.land, S.landPin, 2.2, C.accent, false);
    ring("finder", SHOTS.tee.rest, S.finder, 2.4, C.accent, true);
    ring("near", SHOTS.approach.rest, S.greenPin * (1 - S.summary), 0.9, C.accent, false);

    // the caddy's read: past finishes, the usual spread, and the aim line
    if (S.disp > 0.01 || S.pastA > 0.01 || S.aimA > 0.01) this.caddyLayers(L, S, C, dark);

    // trails
    for (const tr of S.trails) this.trailLayers(L, tr, C, S);
    if (S.summary > 0.01) {
      // the summary keeps both flights in view
    }

    // the cart, its phone and what the phone sees
    this.cartLayers(L, S, C, dark);

    // the golfer
    if (S.golfer) this.golferLayers(L, S, C, dark);

    // club trace (what the phone marked)
    if (S.trace.length > 1 && S.tracking > 0.01) {
      L.push(new D.PathLayer({
        ...base, id: "trace-glow", data: [0], getPath: () => S.trace, getColor: rgba(C.track, 70 * S.tracking), getWidth: 7, widthUnits: "pixels",
        capRounded: true, jointRounded: true, parameters: NODEPTH,
      }));
      L.push(new D.PathLayer({
        ...base, id: "trace", data: [0], getPath: () => S.trace, getColor: rgba(C.track, 240 * S.tracking), getWidth: 2.2, widthUnits: "pixels",
        capRounded: true, jointRounded: true, parameters: NODEPTH,
      }));
    }

    // the ball
    const b = S.ball.p;
    const gz = height(b[0], b[1]);
    const hAbove = Math.max(0, b[2] - gz);
    if (!S.ball.holed || S.ball.sink < 1) {
      L.push(new D.ScatterplotLayer({
        ...base, id: "ball-shadow", data: [0], getPosition: () => [b[0], b[1], gz + 0.04], getRadius: 0.5 + hAbove * 0.04, radiusUnits: "meters", radiusMinPixels: 3,
        getFillColor: rgba(C.shadow, (dark ? 150 : 70) * clamp(1 - hAbove / 40, 0.25, 1)), extensions: SOFT, parameters: NODEPTH,
      }));
      if (S.ball.air) L.push(new D.ScatterplotLayer({
        ...base, id: "ball-glow", data: [0], getPosition: () => b, getRadius: 13, radiusUnits: "pixels", getFillColor: rgba(C.flight1, dark ? 120 : 90),
        extensions: SOFT, parameters: NODEPTH,
      }));
      const a = S.ball.holed ? 1 - S.ball.sink : 1;
      L.push(new D.ScatterplotLayer({
        ...base, id: "ball", data: [0], getPosition: () => b, getRadius: 0.11, radiusUnits: "meters", radiusMinPixels: 4, radiusMaxPixels: 9,
        stroked: true, getLineColor: rgba(C.ballRing, 230 * a), getLineWidth: 1.4, lineWidthUnits: "pixels", getFillColor: rgba(C.ball, 255 * a),
        billboard: true, parameters: NODEPTH,
      }));
    }

    this.deck.setProps({ layers: L, viewState: view });
  }

  trailLayers(L, tr, C, S) {
    const p = tr.path;
    if (p.length < 2) return;
    const fade = tr.a == null ? 1 : tr.a;
    if (fade <= 0.01) return;
    const n = p.length;
    // color runs from purple at the strike to peach at the ball (the Apple-style gradient SwapChain uses)
    const chunks = [];
    const k = Math.max(1, Math.ceil((n - 1) / 6));
    for (let i = 0; i < n - 1; i += k) {
      const seg = p.slice(i, Math.min(n, i + k + 1));
      const u = (i + seg.length / 2) / n;
      const g = tr.id === "putt" ? 0.15 : u;
      chunks.push({ path: seg, c: g < 0.5 ? mix(C.flight0, C.flightMid, g * 2) : mix(C.flightMid, C.flight1, g * 2 - 1) });
    }
    L.push(new D.PathLayer({
      ...base, id: "trail-glow-" + tr.id, data: [{ path: p }], getPath: (d) => d.path, getColor: rgba(C.flightMid, (isDark() ? 70 : 56) * fade), getWidth: 12, widthUnits: "pixels",
      capRounded: true, jointRounded: true, parameters: NODEPTH,
    }));
    L.push(new D.PathLayer({
      ...base, id: "trail-" + tr.id, data: chunks, getPath: (d) => d.path, getColor: (d) => rgba(d.c, 255 * fade), getWidth: 3.4, widthUnits: "pixels",
      capRounded: true, jointRounded: true, parameters: NODEPTH, updateTriggers: { getColor: `${S.t}` },
    }));
    // a soft shadow line on the ground under the flight
    if (tr.id !== "putt") L.push(new D.PathLayer({
      ...base, id: "trail-ground-" + tr.id, data: [{ path: p.map((q) => [q[0], q[1], height(q[0], q[1]) + 0.08]) }], getPath: (d) => d.path,
      getColor: rgba(C.shadow, (isDark() ? 110 : 40) * fade), getWidth: 2, widthUnits: "pixels", parameters: NODEPTH,
    }));
  }

  caddyLayers(L, S, C, dark) {
    const from = SHOTS.approach.from;
    const d2 = SHOTS.dir2, rt = right(d2);
    const center = add(add(PIN, mul(rt, 6.5)), mul(d2, 0.3));
    // the usual spread: three soft rings, strongest in the middle (a simple heat area)
    if (S.disp > 0.01) {
      const ell = (rx, ry) => {
        const out = [];
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          const p = add(add(center, mul(rt, Math.cos(a) * rx)), mul(d2, Math.sin(a) * ry));
          out.push([p[0], p[1], height(p[0], p[1]) + 0.14]);
        }
        return out;
      };
      const rings = [[11, 7, 30], [7.5, 5, 40], [4, 3, 58]];
      L.push(new D.SolidPolygonLayer({
        ...base, id: "spread", data: rings, getPolygon: (r) => ell(r[0] * (0.6 + 0.4 * S.disp), r[1] * (0.6 + 0.4 * S.disp)),
        getFillColor: (r) => rgba(C.miss, r[2] * S.disp * (dark ? 1.3 : 1)), material: false, parameters: NODEPTH, updateTriggers: { getFillColor: S.t, getPolygon: S.t },
      }));
      // the cone: from the ball out to the spread
      const far = 8;
      const l = add(add(center, mul(rt, -far)), mul(d2, -2)), r = add(add(center, mul(rt, far)), mul(d2, -2));
      const z = (p) => [p[0], p[1], height(p[0], p[1]) + 0.12];
      L.push(new D.SolidPolygonLayer({
        ...base, id: "cone", data: [0], getPolygon: () => drape([from, l, r], 0.12, 8), getFillColor: rgba(C.miss, 34 * S.disp),
        material: false, parameters: NODEPTH, updateTriggers: { getFillColor: S.t },
      }));
      L.push(new D.PathLayer({
        ...base, id: "cone-edges", data: [[from, l], [from, r]], getPath: (s) => drape(s, 0.13, 8, false), getColor: rgba(C.miss, 150 * S.disp), getWidth: 1.2, widthUnits: "pixels",
        getDashArray: [3, 3], extensions: DASH, parameters: NODEPTH, updateTriggers: { getColor: S.t },
      }));
    }
    if (S.pastA > 0.01 && S.pastN > 0) {
      const pts = PAST.slice(0, S.pastN).map((d, i) => ({ p: [d.p[0], d.p[1], height(d.p[0], d.p[1]) + 0.15], right: d.right, i }));
      L.push(new D.ScatterplotLayer({
        ...base, id: "past", data: pts, getPosition: (d) => d.p, getRadius: (d) => 4.5 * smooth((S.t - (28.6 + d.i * 0.2)) / 0.25), radiusUnits: "pixels",
        stroked: true, lineWidthUnits: "pixels", getLineWidth: 1.5,
        getFillColor: (d) => (d.right ? rgba(C.miss, 255 * S.pastA) : rgba(C.trackDot, 255 * S.pastA)),
        getLineColor: (d) => (d.right ? rgba(dark ? C.trackDot : [255, 255, 255], 230 * S.pastA) : rgba(C.ink, 200 * S.pastA)),
        parameters: NODEPTH, updateTriggers: { getRadius: S.t, getFillColor: S.t, getLineColor: S.t },
      }));
    }
    if (S.aimA > 0.01) {
      const tgt = lerp2(PIN, SHOTS.aim, S.aimU);
      L.push(new D.PathLayer({
        ...base, id: "aim", data: [0], getPath: () => drape([from, tgt], 0.18, 8, false), getColor: rgba(C.aim, 235 * S.aimA), getWidth: 2.4, widthUnits: "pixels",
        getDashArray: [4, 3], extensions: DASH, parameters: NODEPTH, updateTriggers: { getColor: S.t, getPath: S.t },
      }));
      L.push(new D.ScatterplotLayer({
        ...base, id: "aim-dot", data: [0], getPosition: () => [tgt[0], tgt[1], height(tgt[0], tgt[1]) + 0.18], getRadius: 5, radiusUnits: "pixels", stroked: true,
        getFillColor: rgba(C.aim, 255 * S.aimA), getLineColor: rgba(C.trackDot, 255 * S.aimA), getLineWidth: 2, lineWidthUnits: "pixels", parameters: NODEPTH,
        updateTriggers: { getPosition: S.t },
      }));
    }
  }

  cartLayers(L, S, C, dark) {
    const { p, dir } = S.cart;
    const rt = right(dir);
    const z0 = height(p[0], p[1]);
    const box = (cx, cy, w, l, zb, h, color, id) => {
      // cx along the cart (forward), cy to the right; w across, l along
      const c = add(add(p, mul(dir, cx)), mul(rt, cy));
      const f = mul(dir, l / 2), r = mul(rt, w / 2);
      const ring = [add(add(c, f), r), add(sub(c, f), r), sub(sub(c, f), r), sub(add(c, f), r)].map((q) => [q[0], q[1], z0 + zb]);
      return { poly: ring, elev: h, color, id };
    };
    const parts = [
      box(0, 0, 1.2, 2.35, 0.32, 0.55, C.cart),
      box(-0.25, 0, 1.12, 0.16, 0.87, 0.5, C.cart),
      box(0.95, 0.56, 0.06, 0.06, 0.87, 1.05, C.cart), box(0.95, -0.56, 0.06, 0.06, 0.87, 1.05, C.cart),
      box(-1.05, 0.56, 0.06, 0.06, 0.87, 1.05, C.cart), box(-1.05, -0.56, 0.06, 0.06, 0.87, 1.05, C.cart),
      box(-0.05, 0, 1.3, 2.55, 1.92, 0.09, C.cartRoof),
      box(0.8, 0.62, 0.18, 0.46, 0.0, 0.42, C.ink), box(0.8, -0.62, 0.18, 0.46, 0.0, 0.42, C.ink),
      box(-0.8, 0.62, 0.18, 0.46, 0.0, 0.42, C.ink), box(-0.8, -0.62, 0.18, 0.46, 0.0, 0.42, C.ink),
      // the phone, clamped to the front right post, screen toward the golfer
      box(0.95, 0.66, 0.05, 0.17, 1.3, 0.32, C.phone),
      // the golfer's bag on the back
      box(-1.32, 0.3, 0.3, 0.3, 0.4, 0.95, C.cartRoof), box(-1.32, -0.25, 0.3, 0.3, 0.4, 0.85, mix(C.cartRoof, C.cart, 0.5)),
    ];
    L.push(new D.ScatterplotLayer({
      ...base, id: "cart-shadow", data: [0], getPosition: () => [p[0], p[1], z0 + 0.05], getRadius: 2.2, radiusUnits: "meters",
      getFillColor: rgba(C.shadow, dark ? 140 : 60), extensions: SOFT, parameters: NODEPTH,
    }));
    L.push(new D.SolidPolygonLayer({
      ...base, id: "cart", data: parts, extruded: true, getPolygon: (d) => d.poly, getElevation: (d) => d.elev, getFillColor: (d) => d.color,
      material: this.hiMaterial, updateTriggers: { getPolygon: S.t, getFillColor: isDark() },
    }));
    const roof = parts[6];
    L.push(new D.PathLayer({
      ...base, id: "cart-roof-edge", data: [0], getPath: () => [...roof.poly, roof.poly[0]].map((q) => [q[0], q[1], q[2] + roof.elev + 0.01]),
      getColor: rgba(C.cartEdge, 230), getWidth: 1.4, widthUnits: "pixels", jointRounded: true,
    }));
    const body = parts[0];
    L.push(new D.PathLayer({
      ...base, id: "cart-body-edge", data: [0], getPath: () => [...body.poly, body.poly[0]].map((q) => [q[0], q[1], q[2] + body.elev + 0.01]),
      getColor: rgba(C.cartEdge, 200), getWidth: 1.2, widthUnits: "pixels", jointRounded: true,
    }));
    // the phone's view: a light pyramid from the lens to the golfer
    if (S.cone > 0.01 && S.golfer) {
      const lens = add(add(p, mul(dir, 0.95)), mul(rt, 0.69));
      const lz = z0 + 1.46;
      const g = S.golfer.pos, gz = height(g[0], g[1]) + 0.45;
      const toG = norm(sub(g, lens)), side = right(toG);
      const far = add(g, mul(toG, 1.2));
      const w = 1.9, hTop = 2.6;
      const q = [
        [...add(far, mul(side, -w)), gz - 0.4], [...add(far, mul(side, w)), gz - 0.4],
        [...add(far, mul(side, w)), gz + hTop], [...add(far, mul(side, -w)), gz + hTop],
      ];
      const a = [lens[0], lens[1], lz];
      const faces = [[a, q[0], q[1]], [a, q[1], q[2]], [a, q[2], q[3]], [a, q[3], q[0]]];
      L.push(new D.SolidPolygonLayer({
        ...base, id: "view", data: faces, getPolygon: (f) => f, getFillColor: rgba(C.cone, (dark ? 30 : 26) * S.cone), _full3d: true, material: false,
        parameters: { depthCompare: "always", depthWriteEnabled: false, cullMode: "none" }, updateTriggers: { getPolygon: S.t, getFillColor: S.t },
      }));
      L.push(new D.PathLayer({
        ...base, id: "view-edges", data: [[a, q[0]], [a, q[1]], [a, q[2]], [a, q[3]], [q[0], q[1], q[2], q[3], q[0]]], getPath: (d) => d,
        getColor: rgba(C.cone, 170 * S.cone), getWidth: 1.2, widthUnits: "pixels", parameters: NODEPTH, updateTriggers: { getColor: S.t, getPath: S.t },
      }));
      L.push(new D.ScatterplotLayer({
        ...base, id: "lens", data: [0], getPosition: () => a, getRadius: 4, radiusUnits: "pixels", getFillColor: rgba(C.cone, 255 * S.cone),
        stroked: true, getLineColor: rgba(C.trackDot, 255 * S.cone), getLineWidth: 1.5, lineWidthUnits: "pixels", parameters: NODEPTH,
      }));
    }
  }

  golferLayers(L, S, C, dark) {
    const G = S.golfer, W = G.W;
    const bones = (G.kind === "swing" ? BONES_SWING : BONES_WALK).map(([a, b]) => ({ path: [W[a], W[b]], torso: a === "neck" && b === "pelvis" }));
    const feet = lerp2([W.lF[0], W.lF[1]], [W.rF[0], W.rF[1]], 0.5);
    L.push(new D.ScatterplotLayer({
      ...base, id: "golfer-shadow", data: [0], getPosition: () => [feet[0], feet[1], W.lF[2] - 0.02], getRadius: 0.75, radiusUnits: "meters",
      getFillColor: rgba(C.shadow, dark ? 150 : 70), extensions: SOFT, parameters: NODEPTH,
    }));
    const body = C.ink;
    // a thin halo in the page color keeps the figure readable on any surface (rough, tee or green)
    L.push(new D.PathLayer({
      ...base, id: "golfer-halo", data: bones, getPath: (d) => d.path, getColor: rgba(C.halo, dark ? 230 : 210), getWidth: (d) => (d.torso ? 0.42 : 0.25), widthUnits: "meters", widthMinPixels: 4,
      capRounded: true, jointRounded: true, billboard: true, updateTriggers: { getPath: S.t, getColor: dark },
    }));
    L.push(new D.ScatterplotLayer({
      ...base, id: "golfer-head-halo", data: [0], getPosition: () => W.head, getRadius: 0.19, radiusUnits: "meters", radiusMinPixels: 4, getFillColor: rgba(C.halo, dark ? 230 : 210), billboard: true,
      updateTriggers: { getPosition: S.t, getFillColor: dark },
    }));
    L.push(new D.PathLayer({
      ...base, id: "golfer", data: bones, getPath: (d) => d.path, getColor: rgba(body, 255), getWidth: (d) => (d.torso ? 0.3 : 0.13), widthUnits: "meters", widthMinPixels: 2,
      capRounded: true, jointRounded: true, billboard: true, updateTriggers: { getPath: S.t, getColor: dark },
    }));
    L.push(new D.ScatterplotLayer({
      ...base, id: "golfer-head", data: [0], getPosition: () => W.head, getRadius: 0.13, radiusUnits: "meters", radiusMinPixels: 2.5, getFillColor: body, billboard: true,
      updateTriggers: { getPosition: S.t },
    }));
    if (G.kind === "swing") {
      L.push(new D.PathLayer({
        ...base, id: "club", data: [0], getPath: () => [W.hands, W.club], getColor: rgba(body, 255), getWidth: 0.035, widthUnits: "meters", widthMinPixels: 1.2,
        capRounded: true, billboard: true, updateTriggers: { getPath: S.t },
      }));
    }
    if (S.tracking > 0.01 && G.kind === "swing") {
      const a = S.tracking;
      L.push(new D.PathLayer({
        ...base, id: "pose", data: bones, getPath: (d) => d.path, getColor: rgba(C.track, 235 * a), getWidth: 2, widthUnits: "pixels",
        capRounded: true, billboard: true, parameters: NODEPTH, updateTriggers: { getPath: S.t, getColor: S.t },
      }));
      const pts = ["head", "lS", "rS", "lE", "rE", "hands", "lH", "rH", "lK", "rK", "lF", "rF", "club"].map((k) => W[k]);
      L.push(new D.ScatterplotLayer({
        ...base, id: "pose-dots", data: pts, getPosition: (d) => d, getRadius: 3.2, radiusUnits: "pixels", stroked: true, lineWidthUnits: "pixels", getLineWidth: 1.5,
        getFillColor: rgba(C.trackDot, 255 * a), getLineColor: rgba(C.track, 255 * a), parameters: NODEPTH, updateTriggers: { getPosition: S.t, getFillColor: S.t, getLineColor: S.t },
      }));
    }
  }

  project(p) {
    try {
      const vp = this.deck.getViewports()[0];
      if (!vp) return null;
      const ll = [LON0 + p[0] / KX, LAT0 + p[1] / KY];
      const z = p.length > 2 ? p[2] : height(p[0], p[1]);
      const [x, y, d] = vp.project([ll[0], ll[1], z]);
      return Number.isFinite(x) && Number.isFinite(y) ? [x, y, d] : null;
    } catch (e) { return null; }
  }
}
