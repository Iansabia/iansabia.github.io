// Page intro for the SwapChain page: a quick fly-over of the 3D campus map, from low over Warren Towers
// out to the wide view of the whole campus. It uses the demo's own data and palette (swapchain/app) and
// draws the ground, roads, buildings and dorms the way the demo's map does (src/map.js): the same edge
// fog, hairline grid with light pulses, lighting and materials, so it looks exactly like the demo.
import { CAMPUS } from "../../swapchain/app/data/campus.js";
import { DORMS } from "../../swapchain/app/data/dorms.js";
import { SCENE } from "../../swapchain/app/src/theme.js";
import { fenwayLayers, FENWAY_IDS } from "../../swapchain/app/src/fenway.js";

const D = window.deck;
const LON0 = CAMPUS.center[0], LAT0 = CAMPUS.center[1];
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 110574;
const toM = (p) => [(p[0] - LON0) * KX, (p[1] - LAT0) * KY];
const toLL = (m) => [LON0 + m[0] / KX, LAT0 + m[1] / KY];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const withZ = (ring, z) => ring.map((p) => [p[0], p[1], z]);
const rgba = (c, a) => [c[0], c[1], c[2], a == null ? (c[3] == null ? 255 : c[3]) : a];
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ---------- data, as map.js builds it ----------
const BUILDINGS = CAMPUS.buildings.map((b) => ({
  id: b.id, dormId: b.dormId, ring: b.polygon,
  poly: b.minHeight > 0 ? withZ(b.polygon, b.minHeight) : b.polygon,
  height: b.height, elev: Math.max(1, b.height - (b.minHeight || 0)),
}));
const OTHERS = BUILDINGS.filter((b) => !b.dormId && !FENWAY_IDS.has(b.id));
const DORM_B = BUILDINGS.filter((b) => b.dormId);
const ROADS = {
  major: CAMPUS.roads.filter((r) => r.kind === "major"),
  minor: CAMPUS.roads.filter((r) => r.kind === "minor"),
  path: CAMPUS.roads.filter((r) => r.kind === "path"),
  rail: CAMPUS.roads.filter((r) => r.kind === "rail"),
};
const dormById = new Map(DORMS.map((d) => [d.id, d]));
const HALOS = DORMS.map((d) => {
  const a = toM(d.anchor);
  const verts = DORM_B.filter((b) => b.dormId === d.id).flatMap((b) => b.ring.map(toM));
  const r = verts.length ? Math.max(...verts.map((v) => Math.hypot(v[0] - a[0], v[1] - a[1]))) : 40;
  return { pos: d.anchor, r: Math.min(r, 220) + 34 };
});

// the hairline ground grid past the edge of the data, and its light pulses (map.js GRID and PULSES)
const GRID = (() => {
  const step = 120, seg = 60, pad = 3600, out = [];
  const [x0, y0, x1, y1] = CAMPUS.bbox;
  const W = (x1 - x0) * KX, H = (y1 - y0) * KY;
  const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const alpha = (mx, my) => { const d = Math.max(Math.max(-mx, mx - W), Math.max(-my, my - H)); return sm(-420, 60, d) * (1 - sm(600, 3400, d)); };
  const ll = (mx, my) => [x0 + mx / KX, y0 + my / KY];
  const runs = [];
  let run = null;
  const endRun = () => { if (run && run.pts.length * seg >= 900) runs.push(run.pts); run = null; };
  const add = (mx0, my0, mx1, my1, major) => {
    const a = alpha((mx0 + mx1) / 2, (my0 + my1) / 2);
    if (a > 0.02) out.push({ s: ll(mx0, my0), t: ll(mx1, my1), a, major });
    if (major && a > 0.4) { if (!run) run = { pts: [ll(mx0, my0)] }; run.pts.push(ll(mx1, my1)); } else endRun();
  };
  const n0 = Math.floor(-pad / step), nx = Math.ceil((W + pad) / step), ny = Math.ceil((H + pad) / step);
  for (let i = n0; i <= nx; i++) { for (let m = -pad; m < H + pad; m += seg) add(i * step, m, i * step, m + seg, i % 4 === 0); endRun(); }
  for (let j = n0; j <= ny; j++) { for (let m = -pad; m < W + pad; m += seg) add(m, j * step, m + seg, j * step, j % 4 === 0); endRun(); }
  out.runs = runs;
  return out;
})();
const PULSE_SPEED = 240, PULSE_CYCLE = 16;
const PULSE_RGB = ["#3B8CFF", "#8F7FF7", "#C46BFF", "#FF5FA8", "#FF9A4D", "#5FB4FF"].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const PULSES = (() => {
  const runs = GRID.runs, n = Math.min(30, runs.length), out = [];
  for (let k = 0; k < n; k++) {
    let pts = runs[Math.floor(((k * 7) % n + 0.5) * (runs.length / n))].slice();
    if (k % 2) pts.reverse();
    const d = [0];
    for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot((pts[i][0] - pts[i - 1][0]) * KX, (pts[i][1] - pts[i - 1][1]) * KY));
    const dur = d[d.length - 1] / PULSE_SPEED;
    const off = ((k * 0.381966) % 1) * Math.max(0, PULSE_CYCLE - dur - 1.5);
    out.push({ path: pts.map((p) => [p[0], p[1], 0.4]), ts: d.map((x) => off + x / PULSE_SPEED), c: PULSE_RGB[k % PULSE_RGB.length] });
  }
  return out;
})();

// ---------- the demo's shader extensions ----------
const [BX0, BY0, BX1, BY1] = CAMPUS.bbox;
const f6 = (v) => v.toFixed(6);
class EdgeFog extends D.LayerExtension {
  getShaders(extension) {
    const fade = (extension && extension.opts && extension.opts.fade) || 420;
    const bg = extension && extension.opts && extension.opts.bg;
    const apply = bg
      ? `color.rgb = mix(vec3(${bg.map((v) => (v / 255).toFixed(4)).join(", ")}), color.rgb, fogK);`
      : "color.a *= fogK; if (color.a < 0.01) discard;";
    return {
      inject: {
        "vs:#decl": "out vec2 vFogLL;",
        "vs:DECKGL_FILTER_COLOR": "vFogLL = geometry.worldPosition.xy;",
        "fs:#decl": "in vec2 vFogLL;",
        "fs:DECKGL_FILTER_COLOR": `
          float fdx = min(vFogLL.x - (${f6(BX0)}), (${f6(BX1)}) - vFogLL.x) * ${KX.toFixed(1)};
          float fdy = min(vFogLL.y - (${f6(BY0)}), (${f6(BY1)}) - vFogLL.y) * ${KY.toFixed(1)};
          float fogK = smoothstep(20.0, ${fade.toFixed(1)}, min(fdx, fdy));
          ${apply}`,
      },
    };
  }
}
EdgeFog.extensionName = "EdgeFog";
class SoftDisc extends D.LayerExtension {
  getShaders() { return { inject: { "fs:DECKGL_FILTER_COLOR": "float sdR = length(geometry.uv); color.a *= pow(1.0 - smoothstep(0.0, 1.0, sdR), 1.8);" } }; }
}
SoftDisc.extensionName = "SoftDisc";
class DormTint extends D.LayerExtension {
  getShaders() { return { inject: { "vs:DECKGL_FILTER_COLOR": "if (abs(geometry.normal.z) < 0.5) { color.rgb *= vec3(0.9, 0.94, 1.0); color.rgb += vec3(0.0, 0.012, 0.04); }" } }; }
}
DormTint.extensionName = "DormTint";
const FOG = [new EdgeFog({ fade: 420 })];
const SOFT = [new SoftDisc()];
const TINT = [new DormTint()];
const fogSolidCache = new Map();
const fogSolid = (g) => { const k = g.join(","); if (!fogSolidCache.has(k)) fogSolidCache.set(k, [new EdgeFog({ fade: 420, bg: g })]); return fogSolidCache.get(k); };

const MATERIAL = { ambient: 0.84, diffuse: 0.42, shininess: 8, specularColor: [30, 30, 34] };
const DORM_MATERIAL = { ambient: 0.97, diffuse: 0.3, shininess: 16, specularColor: [40, 44, 52] };
function lighting(dark) {
  return new D.LightingEffect({
    ambient: new D.AmbientLight({ color: [255, 255, 255], intensity: dark ? 1.0 : 0.8 }),
    sun: new D.DirectionalLight({ color: [255, 255, 255], intensity: dark ? 0.5 : 0.9, direction: [-1.2, 1.6, -2.4] }),
    fill: new D.DirectionalLight({ color: [235, 240, 255], intensity: 0.18, direction: [1, -0.6, -1.2] }),
  });
}

function staticLayers(dark, phone) {
  const C = dark ? SCENE.dark : SCENE.light, tk = dark ? "d" : "l";
  const flat = { depthCompare: "always", depthWriteEnabled: false };
  const gk = dark ? 120 : 92;
  const L = [];
  L.push(new D.LineLayer({
    id: "ground-grid", data: GRID, getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t,
    getColor: (d) => rgba(C.grid, Math.round(d.a * (d.major ? gk : gk * 0.5))), getWidth: (d) => (d.major ? 1.2 : 1), widthUnits: "pixels",
    parameters: flat, updateTriggers: { getColor: tk },
  }));
  L.push(new D.SolidPolygonLayer({ id: "green", data: CAMPUS.green, getPolygon: (d) => d.polygon, getFillColor: C.green, material: false, extensions: FOG, parameters: flat, updateTriggers: { getFillColor: tk } }));
  L.push(new D.SolidPolygonLayer({ id: "water", data: CAMPUS.water, getPolygon: (d) => d.polygon, getFillColor: C.water, material: false, extensions: FOG, parameters: flat, updateTriggers: { getFillColor: tk } }));
  const road = (id, data, color, w, minPx) => new D.PathLayer({
    id, data, getPath: (d) => d.path, getColor: color, getWidth: w, widthUnits: "meters", widthMinPixels: minPx,
    capRounded: true, jointRounded: true, parameters: flat, extensions: FOG, updateTriggers: { getColor: tk },
  });
  L.push(road("road-major-edge", ROADS.major, C.roadEdge, 17, 2.5));
  L.push(road("road-minor-edge", ROADS.minor, C.roadEdge, 10, 1.5));
  L.push(road("road-major", ROADS.major, C.road, 14, 1.5));
  L.push(road("road-minor", ROADS.minor, C.road, 7.5, 1));
  L.push(road("road-path", ROADS.path, C.path, 2.2, 0.6));
  L.push(new D.PathLayer({ id: "rail", data: ROADS.rail, getPath: (d) => d.path, getColor: C.rail, getWidth: 1.4, widthUnits: "pixels", parameters: flat, extensions: FOG, updateTriggers: { getColor: tk } }));
  L.push(new D.ScatterplotLayer({
    id: "dorm-halo", data: HALOS, getPosition: (d) => [d.pos[0], d.pos[1], 0.3], getRadius: (d) => d.r, radiusUnits: "meters",
    getFillColor: rgba(C.dormEdge, dark ? 96 : 84), extensions: SOFT, parameters: flat, updateTriggers: { getFillColor: tk },
  }));
  L.push(new D.SolidPolygonLayer({
    id: "buildings", data: OTHERS, extruded: true, getPolygon: (d) => d.poly, getElevation: (d) => d.elev,
    getFillColor: C.building, material: MATERIAL, extensions: fogSolid(C.ground), updateTriggers: { getFillColor: tk },
  }));
  L.push(new D.SolidPolygonLayer({
    id: "dorms", data: DORM_B, extruded: true, getPolygon: (d) => d.poly, getElevation: (d) => d.elev,
    getFillColor: C.dorm, material: DORM_MATERIAL, extensions: TINT, updateTriggers: { getFillColor: tk },
  }));
  L.push(new D.PathLayer({
    id: "dorm-roofs", data: DORM_B, getPath: (d) => withZ(d.ring, d.height + 0.25), getColor: rgba(C.dormEdge, 215),
    getWidth: phone ? 1.6 : 2, widthUnits: "pixels", jointRounded: true, updateTriggers: { getColor: tk },
  }));
  L.push(...fenwayLayers({ dark, material: MATERIAL }));
  return L;
}
function pulseLayers(dark, tSec) {
  const flat = { depthCompare: "always", depthWriteEnabled: false };
  const pk = dark ? 1 : 0.85;
  const pulse = (id, w, a, trail) => new D.TripsLayer({
    id, data: PULSES, getPath: (d) => d.path, getTimestamps: (d) => d.ts, getColor: (d) => rgba(d.c, Math.round(a * pk)),
    getWidth: w, widthUnits: "pixels", capRounded: true, jointRounded: true, trailLength: trail, fadeTrail: true,
    currentTime: tSec, parameters: flat, updateTriggers: { getColor: dark ? "d" : "l" },
  });
  return [pulse("grid-pulse-glow", 7, 60, 1.6), pulse("grid-pulse", 2, 235, 1.1)];
}

// ---------- the camera ----------
// the demo's own bearings: Comm Ave runs across the screen on a desktop, up the screen on a phone
function bearings(phone) {
  const a = toM(dormById.get("myles").anchor), b = toM(dormById.get("1019").anchor);
  const comm = ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
  const b0 = phone ? comm : comm - 270;
  return phone ? b0 : b0 - 50; // the wide view on a desktop looks up the river at an angle
}
function campusCenter() {
  const xs = DORMS.map((d) => d.anchor[0]), ys = DORMS.map((d) => d.anchor[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

export async function create({ host, dark, phone }) {
  const bWide = bearings(phone);
  const end = { c: campusCenter(), z: phone ? 14.35 : 14.95, p: phone ? 56 : 55, b: bWide };
  const warren = dormById.get("warren") || DORMS[0];
  const start = { c: warren.anchor, z: phone ? 16.3 : 16.9, p: 66, b: bWide + 38 };
  let isDark = dark;
  let layers = staticLayers(isDark, phone);
  let last = 0;

  const waiting = [];
  const flush = () => { while (waiting.length) waiting.shift()(); };
  const drawn = () => new Promise((r) => waiting.push(r));

  function view(s) {
    const W = host.clientWidth || innerWidth, H = host.clientHeight || innerHeight;
    const zAdj = phone ? clamp(Math.log2(W / 390), -0.4, 0.3) : clamp(Math.log2(Math.min(W / 1440, H / 900)), -1.2, 0.3);
    const u = easeOut(clamp(s, 0, 1)), uc = easeInOut(clamp(s * 1.08, 0, 1));
    const v = {
      longitude: lerp(start.c[0], end.c[0], uc), latitude: lerp(start.c[1], end.c[1], uc),
      zoom: lerp(start.z, end.z, u) + zAdj, pitch: lerp(start.p, end.p, u), bearing: lerp(start.b, end.b, u),
    };
    // settle with the campus out from under the title: to the right on a wide screen, lower on a phone
    const off = phone ? [0, H * 0.14 * u] : [W * 0.13 * u, H * 0.09 * u];
    try {
      const vp = new D.WebMercatorViewport({ width: W, height: H, ...v });
      const p = vp.unproject([W / 2 - off[0], H / 2 - off[1]]);
      if (Number.isFinite(p[0]) && Number.isFinite(p[1])) { v.longitude = p[0]; v.latitude = p[1]; }
    } catch (e) { /* centered is fine */ }
    return v;
  }

  let deck;
  await new Promise((res, rej) => {
    deck = new D.Deck({
      parent: host,
      views: new D.MapView({ repeat: false, nearZMultiplier: 0.1, farZMultiplier: 1.2 }),
      viewState: view(0),
      controller: false,
      effects: [lighting(isDark)],
      layers: [...layers, ...pulseLayers(isDark, 3)],
      useDevicePixels: phone ? 1.5 : Math.min(window.devicePixelRatio || 1, 2),
      onLoad: res,
      onAfterRender: flush,
      onError: (e) => console.warn("deck", e && e.message),
    });
    setTimeout(() => rej(new Error("campus map timed out")), 30000);
  });
  const c = host.querySelector("canvas");
  if (c) c.setAttribute("aria-hidden", "true");

  // pulses start part way into their cycle so some are already running when the map appears
  const frame = (s, t = s * 2) => {
    last = s;
    const p = drawn();
    deck.setProps({ viewState: view(s), layers: [...layers, ...pulseLayers(isDark, 3 + t)] });
    return p;
  };
  await frame(0);

  return {
    frame,
    setTheme(d) { isDark = d; layers = staticLayers(isDark, phone); deck.setProps({ effects: [lighting(isDark)] }); frame(last); },
    dispose() { flush(); try { deck.finalize(); } catch (e) { /* gone */ } },
  };
}
