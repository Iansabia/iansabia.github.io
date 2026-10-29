// SwapChain 3D campus: deck.gl standalone, no basemap.
// Extruded OSM buildings, flat water/green/roads, dorm picking, exploded floor slabs,
// animated chain threads (draw on, pull tight, travelling pulse) and an HTML overlay
// for crisp label pills, avatar pins and floor tags.
import { CAMPUS } from "../data/campus.js";
import { DORMS } from "../data/dorms.js";
import { sceneColors, reducedMotion } from "./theme.js";
import { avatarSvg } from "./avatars.js";
import { loopStyle, loopRgb, aiColorAt, AI_RGB, AI_RGB_DARK } from "./loopcolors.js";
import { floorRooms } from "./floor3d.js";
import { lifeLayers, windowLayers, cdsLayers, EDGE_WIRES } from "./life.js";
import { fenwayLayers, FENWAY_IDS } from "./fenway.js";
import { furnish } from "./room3d.js";

const D = window.deck;

// ---------- geometry helpers ----------
const LON0 = CAMPUS.center[0];
const LAT0 = CAMPUS.center[1];
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110574;
const toM = (p) => [(p[0] - LON0) * KX, (p[1] - LAT0) * KY];
const toLL = (m) => [LON0 + m[0] / KX, LAT0 + m[1] / KY];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DONE_RGB = [74, 222, 128]; // a loop everyone confirmed
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const withZ = (ring, z) => ring.map((p) => [p[0], p[1], z]);
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
const rgba = (c, a) => [c[0], c[1], c[2], a == null ? (c[3] == null ? 255 : c[3]) : a];

const dormById = new Map(DORMS.map((d) => [d.id, d]));
const towerById = new Map();
const towerOfBuilding = new Map();
DORMS.forEach((d) => d.towers.forEach((t) => {
  towerById.set(t.id, { ...t, dormId: d.id });
  t.buildingIds.forEach((b) => towerOfBuilding.set(b, t.id));
}));

const BUILDINGS = CAMPUS.buildings.map((b) => ({
  id: b.id,
  dormId: b.dormId,
  towerId: towerOfBuilding.get(b.id) || null,
  ring: b.polygon,
  poly: b.minHeight > 0 ? withZ(b.polygon, b.minHeight) : b.polygon,
  height: b.height,
  minHeight: b.minHeight || 0,
  elev: Math.max(1, b.height - (b.minHeight || 0)),
}));
const OTHERS = BUILDINGS.filter((b) => !b.dormId && !FENWAY_IDS.has(b.id)); // Fenway draws its own stands
const DORM_B = BUILDINGS.filter((b) => b.dormId);
const ROADS = {
  major: CAMPUS.roads.filter((r) => r.kind === "major"),
  minor: CAMPUS.roads.filter((r) => r.kind === "minor"),
  path: CAMPUS.roads.filter((r) => r.kind === "path"),
  rail: CAMPUS.roads.filter((r) => r.kind === "rail"),
};

// Groups: a Warren tower, or a whole dorm. Used for thread nodes and exploded views.
const GROUPS = new Map();
function makeGroup(key, dormId, towerId, buildings, anchor, floors) {
  const d = dormById.get(dormId);
  const verts = buildings.flatMap((b) => b.ring.map(toM));
  const g = {
    key, dormId, towerId, buildings,
    anchor, anchorM: toM(anchor), verts,
    floors: floors || d.floors, fh: d.floorHeightM || 3.2,
    height: Math.max(...buildings.map((b) => b.height)),
  };
  GROUPS.set(key, g);
  return g;
}
DORMS.forEach((d) => {
  const bs = DORM_B.filter((b) => b.dormId === d.id);
  if (d.towers.length) {
    d.towers.forEach((t) => makeGroup(t.id, d.id, t.id, bs.filter((b) => b.towerId === t.id), t.anchor, t.floors));
    makeGroup(d.id, d.id, null, bs, d.anchor, d.floors);
  } else {
    const maxH = Math.max(...bs.map((b) => b.height));
    const main = bs.filter((b) => b.height >= maxH * 0.7);
    makeGroup(d.id, d.id, null, main.length ? main : bs, d.anchor, d.floors);
  }
});
// dorms grouped by campus area, for cluster pills at wide zoom
const AREAS = new Map();
DORMS.forEach((d) => { if (!AREAS.has(d.area)) AREAS.set(d.area, []); AREAS.get(d.area).push(d.id); });
const HALOS = DORMS.map((d) => {
  const g = GROUPS.get(d.id);
  const r = g ? Math.max(...g.verts.map((v) => Math.hypot(v[0] - g.anchorM[0], v[1] - g.anchorM[1]))) : 40;
  return { dormId: d.id, pos: d.anchor, r: r + 34 };
});
function extentAlong(g, dir) {
  let mx = -Infinity, mn = Infinity;
  for (const v of g.verts) {
    const s = (v[0] - g.anchorM[0]) * dir[0] + (v[1] - g.anchorM[1]) * dir[1];
    if (s > mx) mx = s;
    if (s < mn) mn = s;
  }
  return [mn, mx];
}

const PERIOD = 2600;

// Ground grid: a hairline grid that carries the ground past the edge of the map data, so the empty
// space around campus reads as a designed surface instead of a void. Lines fade in where the edge fog
// fades the city out, and fade away toward the horizon. Each line is cut into short pieces so every
// piece can carry its own alpha. Every 4th line is a little stronger.
const GRID = (() => {
  const step = 120, seg = 60, pad = 3600, out = [];
  const [x0, y0, x1, y1] = CAMPUS.bbox;
  const W = (x1 - x0) * KX, H = (y1 - y0) * KY;
  const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const alpha = (mx, my) => {
    const d = Math.max(Math.max(-mx, mx - W), Math.max(-my, my - H)); // meters outside the data box
    return sm(-420, 60, d) * (1 - sm(600, 3400, d));
  };
  const ll = (mx, my) => [x0 + mx / KX, y0 + my / KY];
  // long clear stretches of the stronger lines, where light pulses can run
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
  Object.assign(out, { alpha, ll, step, W, H, pad });
  return out;
})();

// Light cycles (Tron): bright heads with long fading trails that ride the major grid lines and make
// hard 90-degree turns at the crossings. Seeded random walks, so every load shows the same rides.
const CYCLE_RGB = ["#4DF3FF", "#FF9A3C", "#8F7FF7", "#4DF3FF", "#FF5FA8", "#FF9A3C", "#5FB4FF", "#4DF3FF"].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const CYCLES = (() => {
  const { alpha, ll, step, W, H, pad } = GRID;
  const S = step * 4; // the major lattice
  let a = 7;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ok = (i, j) => alpha(i * S, j * S) > 0.38;
  const i0 = Math.ceil(-pad / S), i1 = Math.floor((W + pad) / S), j0 = Math.ceil(-pad / S), j1 = Math.floor((H + pad) / S);
  const starts = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (ok(i, j)) starts.push([i, j]);
  const out = [];
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let k = 0; k < 10 && starts.length; k++) {
    let [i, j] = starts[Math.floor(rnd() * starts.length)];
    let d = Math.floor(rnd() * 4);
    const nodes = [[i, j]];
    for (let s = 0; s < 14; s++) {
      const r = rnd(), tryOrder = r < 0.62 ? [d, (d + 1) % 4, (d + 3) % 4] : r < 0.81 ? [(d + 1) % 4, d, (d + 3) % 4] : [(d + 3) % 4, d, (d + 1) % 4];
      const nd = tryOrder.find((q) => ok(i + dirs[q][0], j + dirs[q][1]));
      if (nd == null) break;
      d = nd; i += dirs[d][0]; j += dirs[d][1];
      nodes.push([i, j]);
    }
    if (nodes.length < 4) continue;
    const speed = 300 + rnd() * 120; // meters per second
    const pts = nodes.map(([x, y]) => ll(x * S, y * S));
    const ts = nodes.map((_, q) => (q * S) / speed);
    const off = rnd() * Math.max(0, 32 - ts[ts.length - 1] - 2); // 32 s: twice the pulse cycle
    out.push({ path: pts.map((p) => [p[0], p[1], 0.5]), ts: ts.map((x) => x + off), c: CYCLE_RGB[k % CYCLE_RGB.length] });
  }
  return out;
})();

// Light pulses that race along the grid in Apple Intelligence colors (blue, violet, pink, orange).
// Each pulse runs one clear stretch of a stronger line, staggered over a 16 s cycle.
const PULSE_CYCLE = 16, PULSE_SPEED = 240; // seconds, meters per second
const PULSE_RGB = ["#3B8CFF", "#8F7FF7", "#C46BFF", "#FF5FA8", "#FF9A4D", "#5FB4FF"].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const PULSES = (() => {
  const runs = GRID.runs;
  const n = Math.min(30, runs.length), out = [];
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

// Edge fog: the map data stops at CAMPUS.bbox. Every ground and building layer fades to
// transparent over the last few hundred meters before that edge, so the model dissolves into
// the page background (an endless ground) instead of ending at a hard line.
const [BX0, BY0, BX1, BY1] = CAMPUS.bbox;
const f6 = (v) => v.toFixed(6);
class EdgeFog extends D.LayerExtension {
  getShaders(extension) {
    // called with `this` bound to the layer, so read options from the extension argument
    const fade = (extension && extension.opts && extension.opts.fade) || 420;
    // solid geometry (buildings) fades toward the ground color instead of turning see-through
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
// Soft round glow for the halo under marketplace dorms (a ScatterplotLayer disc that fades out).
class SoftDisc extends D.LayerExtension {
  getShaders() {
    return { inject: { "fs:DECKGL_FILTER_COLOR": "float sdR = length(geometry.uv); color.a *= pow(1.0 - smoothstep(0.0, 1.0, sdR), 1.8);" } };
  }
}
SoftDisc.extensionName = "SoftDisc";
// Marketplace dorms: white roofs, walls with a faint blue tint.
class DormTint extends D.LayerExtension {
  getShaders() {
    return { inject: { "vs:DECKGL_FILTER_COLOR": "if (abs(geometry.normal.z) < 0.5) { color.rgb *= vec3(0.9, 0.94, 1.0); color.rgb += vec3(0.0, 0.012, 0.04); }" } };
  }
}
DormTint.extensionName = "DormTint";
const SOFT = [new SoftDisc()];
const TINT = [new DormTint()];
let FOG = null;
const fog = () => (FOG || (FOG = [new EdgeFog({ fade: 420 })]));
const FOG_SOLID = new Map();
const fogSolid = (ground) => {
  const k = ground.join(",");
  if (!FOG_SOLID.has(k)) FOG_SOLID.set(k, [new EdgeFog({ fade: 420, bg: ground })]);
  return FOG_SOLID.get(k);
};

export class CampusMap {
  constructor({ container, overlay, phone, onDorm, onFloor, onRoom, onPerson, onBackground, onHover, freeArea }) {
    this.container = container;
    this.__groups = GROUPS; // for QA in the console
    this.overlay = overlay;
    this.phone = phone;
    this.cb = { onDorm, onFloor, onRoom, onPerson, onBackground, onHover };
    this.freeArea = freeArea;
    this.t0 = performance.now();
    this.colors = sceneColors();
    this.themeKey = 0;
    this.sel = { dormId: null, towerId: null, floor: null };
    this.hover = { dormId: null, floor: null, room: null };
    this.hotRoom = null;
    this.fade = { v: 0, from: 0, to: 0, t0: 0, dur: 1 };
    this.explode = null; // { group, t0, dir }
    this.floorAnim = null; // { floor, t0, dir }
    this.threads = new Map();
    this.beads = [];
    this.extraPins = [];
    this.positions = new Map();
    this.resolve = () => null;
    this.badges = {};
    this.carrier = null;
    this.highlightSeg = null;
    this.orbit = !reducedMotion();
    this.paused = false;
    this.raf = 0;
    this.dimAll = false;

    this.bearing0 = this.computeBearing();
    // wide views on desktop look up the river at an angle so the long, thin campus fills the frame
    this.bearingWide = phone ? this.bearing0 : this.bearing0 - 50;
    // the closing web of loops: on the phone, turn a little off Comm Ave so parallel loops separate
    this.bearingWeb = phone ? this.bearing0 - 18 : this.bearingWide;
    // building views: a short swing from the wide view (desktop) that still shows the towers side by side
    this.bearingDorm = phone ? this.bearing0 + 20 : this.bearing0 - 8;
    const dirB = ((this.bearing0 + 180) * Math.PI) / 180;
    this.camDir = [Math.sin(dirB), Math.cos(dirB)]; // unit vector pointing toward the default camera
    this.vs = this.homeView();

    this.lighting = this.makeLighting();
    this.material = { ambient: 0.84, diffuse: 0.42, shininess: 8, specularColor: [30, 30, 34] };
    this.dormMaterial = { ambient: 0.97, diffuse: 0.3, shininess: 16, specularColor: [40, 44, 52] };

    this.deck = new D.Deck({
      parent: container,
      views: new D.MapView({ repeat: false, nearZMultiplier: 0.1, farZMultiplier: 1.2 }),
      initialViewState: this.vs,
      controller: { dragRotate: true, touchRotate: true, keyboard: true, inertia: 250, scrollZoom: { smooth: false, speed: 0.03 } },
      effects: [this.lighting],
      layers: [],
      useDevicePixels: phone ? 1.5 : Math.min(window.devicePixelRatio || 1, 2),
      pickingRadius: phone ? 10 : 3,
      onViewStateChange: ({ viewState, interactionState }) => {
        this.vs = viewState;
        const user = interactionState && (interactionState.isDragging || interactionState.isPanning || interactionState.isRotating || interactionState.isZooming);
        if (user) this.orbit = false;
      },
      onHover: (info) => this.handleHover(info),
      onClick: (info) => this.handleClick(info),
      getCursor: ({ isDragging }) => (isDragging ? "grabbing" : this.hover.dormId || this.hover.floor ? "pointer" : "grab"),
      onAfterRender: () => this.updateOverlay(),
      onWebGLInitialized: () => { this.ready = true; },
      onLoad: () => {
        // camera moves asked for before deck finished loading (deep links like ?demo=4) are applied now
        this.loaded = true;
        if (this.pendingView) { const v = this.pendingView; this.pendingView = null; this.deck.setProps({ initialViewState: { ...v, transitionDuration: 0 } }); this.vs = v; this.kick(); }
        setTimeout(() => this.loadContext(), 600); // the sketch ring loads after the campus is on screen
      },
      onError: (e) => { console.warn("deck", e && e.message); },
    });
    container.addEventListener("pointerdown", () => { this.orbit = false; }, { capture: true });
    this.canvas = container.querySelector("canvas");
    if (this.canvas) this.canvas.setAttribute("aria-label", "3D campus map. Use the Explore list to choose a dorm.");

    this.buildOverlay();
    this.frame = this.frame.bind(this);
    this.kick();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.kick(); });
  }

  makeLighting() {
    // Light theme: a stronger sun so walls read darker than roofs. Dark theme keeps the softer setup.
    const dark = this.colors.ground[0] < 100;
    return new D.LightingEffect({
      ambient: new D.AmbientLight({ color: [255, 255, 255], intensity: dark ? 1.0 : 0.8 }),
      sun: new D.DirectionalLight({ color: [255, 255, 255], intensity: dark ? 0.5 : 0.9, direction: [-1.2, 1.6, -2.4] }),
      fill: new D.DirectionalLight({ color: [235, 240, 255], intensity: 0.18, direction: [1, -0.6, -1.2] }),
    });
  }

  // ---------- camera ----------
  computeBearing() {
    const a = toM(dormById.get("myles").anchor);
    const b = toM(dormById.get("1019").anchor);
    const brg = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI; // compass bearing of Comm Ave going west
    const comm = (brg + 360) % 360; // about 277
    return this.phone ? comm : comm - 270;
  }

  size() {
    return { W: this.container.clientWidth || window.innerWidth, H: this.container.clientHeight || window.innerHeight };
  }

  /** Shift a view so that `lonlat` lands in the middle of the free area (not under panels). */
  offsetView(view, yFrac = 0.5) {
    const { W, H } = this.size();
    const fa = this.freeArea(this.wideFit);
    const fx = (fa.left + fa.right) / 2;
    const fy = fa.top + yFrac * (fa.bottom - fa.top);
    try {
      const vp = new D.WebMercatorViewport({ width: W, height: H, longitude: view.longitude, latitude: view.latitude, zoom: view.zoom, pitch: view.pitch, bearing: view.bearing });
      const [lon, lat] = vp.unproject([W - fx, H - fy]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) return { ...view, longitude: lon, latitude: lat };
    } catch (e) { /* fall through */ }
    return view;
  }

  /**
   * Nudge a view so a raised footprint (meters, at height z) sits exactly in the middle of the free map area.
   * The average of outline points drifts toward whichever side has more corners, so aim at the box center.
   */
  centerOn(view, verts, z) {
    const { W, H } = this.size();
    const fa = this.freeArea(this.wideFit);
    const xs = verts.map((v) => v[0]), ys = verts.map((v) => v[1]);
    const tgt = [...toLL([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]), z];
    const fx = (fa.left + fa.right) / 2, fy = (fa.top + fa.bottom) / 2;
    const vpOf = (v) => new D.WebMercatorViewport({ width: W, height: H, longitude: v.longitude, latitude: v.latitude, zoom: v.zoom, pitch: v.pitch, bearing: v.bearing, position: v.position || [0, 0, 0] });
    const err = (v) => { const p = vpOf(v).project(tgt); return Number.isFinite(p[0]) && Number.isFinite(p[1]) ? Math.hypot(p[0] - fx, p[1] - fy) : Infinity; };
    let v = view, e = Infinity;
    try {
      e = err(v);
      for (let i = 0; i < 4 && e > 2; i++) {
        // move the ground point under the screen center by the target's screen offset
        const vp = vpOf(v), p = vp.project(tgt);
        const tz = { targetZ: (v.position && v.position[2]) || 0 };
        const c = vp.unproject([W / 2, H / 2], tz), q = vp.unproject([W / 2 + (p[0] - fx), H / 2 + (p[1] - fy)], tz);
        if (![...c, ...q].every(Number.isFinite)) break;
        const next = { ...v, longitude: v.longitude + (q[0] - c[0]), latitude: v.latitude + (q[1] - c[1]) };
        const e2 = err(next);
        if (!(e2 < e)) break; // never accept a step that makes it worse
        v = next; e = e2;
      }
    } catch (x) { return view; }
    return v;
  }

  homeView() {
    // frame every dorm (with room for its label) inside the part of the map that panels do not cover
    const pts = DORMS.map((d) => ({ m: toM(d.anchor), ll: d.anchor, z: d.anchorHeight }));
    let v;
    this.wideFit = true; // wide views may use the space beside the demo counter (it only covers open sky and river)
    try {
      const hc = this.homeCfg || {};
      v = this.fitView(null, pts, { pitch: hc.pitch ?? (this.phone ? 58 : 60), maxZoom: this.phone ? 15.3 : 15.7, loop: false, bearing: hc.bearing ?? this.bearingWide, padTop: hc.padTop ?? (this.phone ? 46 : 64), padX: hc.padX ?? (this.phone ? 34 : 56) });
    } catch (e) {
      const xs = DORMS.map((d) => d.anchor[0]), ys = DORMS.map((d) => d.anchor[1]);
      v = { longitude: (Math.min(...xs) + Math.max(...xs)) / 2, latitude: (Math.min(...ys) + Math.max(...ys)) / 2, zoom: this.phone ? 14.6 : 14.9, pitch: 58, bearing: this.bearingWide };
    }
    this.wideFit = false;
    return { ...v, minZoom: 12.6, maxZoom: 18.8, maxPitch: 70 };
  }

  setView(view, duration = 1300, interp = "fly") {
    const rm = reducedMotion();
    // views aim at ground level unless they say otherwise (only the room view lifts its target)
    const next = { ...this.vs, position: [0, 0, 0], ...view, minZoom: 12.6, maxZoom: 22, maxPitch: 70 };
    this.vsSetAt = performance.now();
    this.orbitT0 = 0; // the sway restarts around the new bearing
    if (duration > 0) {
      next.transitionDuration = rm ? 300 : duration;
      next.transitionEasing = easeInOut;
      // FlyTo can't carry a lifted target (room and floor views), it would snap to the ground and pass
      // through the building on the way out; a linear move carries the height along
      const lifted = Math.abs(((this.vs.position || [])[2] || 0) - ((next.position || [])[2] || 0)) > 0.5;
      if (lifted && ((next.position || [])[2] || 0) < ((this.vs.position || [])[2] || 0) && this.liftKey) {
        // the floors drop back into place as the camera leaves; keep that building out of the way meanwhile
        this.exitGlass = { key: this.liftKey, until: performance.now() + next.transitionDuration + 250 };
      }
      // "glide": a low flight between nearby places that barely pulls out
      next.transitionInterpolator = (interp === "fly" || interp === "swoop" || interp === "glide") && !rm && !lifted
        ? new D.FlyToInterpolator({ curve: interp === "glide" ? 0.35 : interp === "swoop" ? 0.75 : 1.2 })
        : new D.LinearInterpolator(["longitude", "latitude", "zoom", "pitch", "bearing", "position"]);
      next.transitionInterruption = D.TRANSITION_EVENTS ? D.TRANSITION_EVENTS.BREAK : 1;
    }
    if (!this.loaded) this.pendingView = next;
    this.updateSpread(next.zoom);
    this.deck.setProps({ initialViewState: next });
    this.vs = next;
    this.kick();
  }

  /** Endpoint spacing in meters for a zoom level (0 when close enough that floors and facades separate them). */
  updateSpread(zoom) {
    if (!Number.isFinite(zoom)) return;
    const mpp = (40075016 * Math.cos((LAT0 * Math.PI) / 180)) / (512 * Math.pow(2, zoom));
    const sp = zoom >= 16.4 ? 0 : Math.round(12 * mpp);
    if (sp === (this.spreadM || 0)) return;
    this.spreadM = sp;
    if (this.lastWorld) this.setWorld(this.lastWorld.listings, this.lastWorld.resolve);
  }

  goHome(duration = 1000) {
    this.setView(this.homeView(), duration, "fly");
  }

  zoomBy(dz) { this.orbit = false; this.setView({ zoom: clamp(this.vs.zoom + dz, 13.4, 18.5) }, 300, "linear"); }
  toggleTilt() {
    this.orbit = false;
    this.setView({ pitch: this.vs.pitch > 20 ? 0 : (this.phone ? 58 : 52) }, 600, "linear");
  }

  flyToGroup(key, { zoom, pitch = 60, bearingDelta = 18, duration = 1400 } = {}) {
    const g = GROUPS.get(key);
    if (!g) return;
    this.orbit = false;
    const c = g.anchor;
    const z = zoom ?? (this.phone ? 16.75 : 17.25);
    const view = { longitude: c[0], latitude: c[1], zoom: z, pitch, bearing: this.bearingDorm + (bearingDelta - 20) };
    // the label anchor is not the building's middle: center the building itself, halfway up
    this.setView(this.centerOn(this.offsetView(view), g.verts, g.height * 0.5), duration, "swoop");
  }

  /**
   * Fit a set of listings (and, when `loop` is true, the arcs between them) into the free area.
   * Starts from a meter-based estimate, then refines in screen space so tall arcs and
   * perspective never push a loop off screen.
   */
  fitListings(ids, { pitch = 52, duration = 1400, maxZoom = 17.2, loop = true, bearing = null, padTop = null, group = null, cycles = null, padX = null, padBottom = null, interp = "fly" } = {}) {
    const pts = ids.map((id) => this.positions.get(id)).filter(Boolean);
    if (!pts.length) return;
    this.orbit = false;
    const view = this.fitView(ids, pts, { pitch, maxZoom, loop, bearing, padTop, group, cycles, padX, padBottom });
    this.setView(view, duration, interp);
  }

  fitView(ids, pts, { pitch, maxZoom, loop, bearing, padTop, group = null, padX = null, cycles = null, padBottom = null }) {
    const brg = bearing == null ? this.bearingWide : bearing;
    const est = this.estimateFit(pts, { pitch, maxZoom, bearing: brg });
    // 3D points to keep on screen: beads plus the top of each arc
    const P = pts.map((p) => [p.ll[0], p.ll[1], p.z]);
    if (loop && pts.length > 1) {
      for (let i = 0; i < pts.length; i++) {
        if (pts.length === 2 && i > 0) break;
        const s = this.segment(pts[i], pts[(i + 1) % pts.length]);
        const x = 0.25 * s.A[0] + 0.5 * s.ctrl[0] + 0.25 * s.B[0];
        const y = 0.25 * s.A[1] + 0.5 * s.ctrl[1] + 0.25 * s.B[1];
        const z = 0.25 * s.A[2] + 0.5 * s.ctrl[2] + 0.25 * s.B[2];
        const ll = toLL([x, y]);
        P.push([ll[0], ll[1], z]);
      }
    }
    // several loops at once: keep the top of every arc in frame too
    if (cycles) for (const c of cycles) {
      const cp = c.map((id) => this.positions.get(id)).filter(Boolean);
      if (cp.length < 2) continue;
      const lane = c.length > 2 ? (() => { const st = loopStyle(c); return st.ai ? 0 : (st.index % 3) - 1; })() : 0;
      for (let i = 0; i < cp.length; i++) {
        if (cp.length === 2 && i > 0) break;
        const sg = this.segment(cp[i], cp[(i + 1) % cp.length], lane);
        const ll = toLL([0.25 * sg.A[0] + 0.5 * sg.ctrl[0] + 0.25 * sg.B[0], 0.25 * sg.A[1] + 0.5 * sg.ctrl[1] + 0.25 * sg.B[1]]);
        P.push([ll[0], ll[1], 0.25 * sg.A[2] + 0.5 * sg.ctrl[2] + 0.25 * sg.B[2]]);
      }
    }
    // optionally keep a whole building (with its lifted floors) in frame
    const g = group && GROUPS.get(group);
    if (g) {
      const top = g.height + (this.liftKey === group ? (g.floors[1] - g.floors[0] + 1) * (this.phone ? 2.4 : 2.8) : 0);
      for (const v of g.verts) { const ll = toLL(v); P.push([ll[0], ll[1], 0], [ll[0], ll[1], top]); }
    }
    const { W, H } = this.size();
    const fa = this.freeArea(this.wideFit);
    const pad = padX != null ? padX : this.phone ? 34 : 84;
    const pt = padTop == null ? (this.phone ? 64 : 80) : padTop; // room for avatar pins above beads
    const box = { l: fa.left + pad, r: fa.right - pad, t: fa.top + pt, b: fa.bottom - (padBottom != null ? padBottom : this.phone ? 34 : 40) };
    const tw = Math.max(80, box.r - box.l), th = Math.max(80, box.b - box.t);
    let v = { ...est };
    const measure = () => {
      let vp;
      try { vp = new D.WebMercatorViewport({ width: W, height: H, longitude: v.longitude, latitude: v.latitude, zoom: v.zoom, pitch: v.pitch, bearing: v.bearing }); } catch (e) { return null; }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of P) {
        const [x, y] = vp.project(p);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      return Number.isFinite(x0) ? { vp, x0, x1, y0, y1 } : null;
    };
    const recenter = () => {
      const m = measure();
      if (!m) return false;
      const cx = (m.x0 + m.x1) / 2, cy = (m.y0 + m.y1) / 2;
      const tx = (box.l + box.r) / 2, ty = (box.t + box.b) / 2;
      const ll = m.vp.unproject([W / 2 + (cx - tx), H / 2 + (cy - ty)]);
      if (Number.isFinite(ll[0]) && Number.isFinite(ll[1])) { v.longitude = ll[0]; v.latitude = ll[1]; }
      return true;
    };
    // zoom first, then re-center at that zoom; the last step is always a re-center
    for (let it = 0; it < 10; it++) {
      if (!recenter()) break;
      const m = measure();
      if (!m) break;
      const s = Math.min(tw / Math.max(1, m.x1 - m.x0), th / Math.max(1, m.y1 - m.y0));
      const nz = clamp(v.zoom + Math.log2(s) * 0.9, 12.6, maxZoom);
      if (Math.abs(nz - v.zoom) < 0.005) break;
      v.zoom = nz;
    }
    recenter();
    recenter();
    return v;
  }

  estimateFit(pts, { pitch = 52, maxZoom = 17.2, bearing }) {
    const fa = this.freeArea(this.wideFit);
    // extents in the rotated screen frame (bearing), in meters
    const br = (bearing * Math.PI) / 180;
    const right = [Math.cos(br), -Math.sin(br)];
    const up = [Math.sin(br), Math.cos(br)];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, cx = 0, cy = 0;
    pts.forEach((p) => {
      const x = p.m[0] * right[0] + p.m[1] * right[1];
      const y = p.m[0] * up[0] + p.m[1] * up[1];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    });
    const midX = (x0 + x1) / 2, midY = (y0 + y1) / 2;
    cx = right[0] * midX + up[0] * midY;
    cy = right[1] * midX + up[1] * midY;
    const pr = (pitch * Math.PI) / 180;
    const spanX = x1 - x0 + 120;
    const spanY = ((y1 - y0 + 120) * Math.cos(pr) + 150 * Math.sin(pr)) * 1.1;
    const pad = this.phone ? 12 : 70;
    const fw = Math.max(120, fa.right - fa.left - 2 * pad);
    const fh = Math.max(100, fa.bottom - fa.top - 2 * pad);
    const mpp = Math.max(spanX / fw, spanY / fh);
    const C = (40075016 * Math.cos((LAT0 * Math.PI) / 180)) / 512;
    const zoom = clamp(Math.log2(C / mpp), 12.6, maxZoom);
    const ll = toLL([cx, cy]);
    return this.offsetView({ longitude: ll[0], latitude: ll[1], zoom, pitch, bearing });
  }

  /** Demo helper: split one building into floors and lift the beads with them. */
  demoExplode(key) {
    const g = GROUPS.get(key);
    if (!g) return;
    this.liftKey = key;
    this.startExplode(key, 0);
    if (this.lastWorld) this.setWorld(this.lastWorld.listings, this.lastWorld.resolve);
  }
  clearDemoExplode() {
    if (!this.liftKey) return;
    this.liftKey = null;
    if (!this.sel.dormId) this.closeExplode();
    if (this.lastWorld) this.setWorld(this.lastWorld.listings, this.lastWorld.resolve);
  }

  // ---------- data ----------
  /** Positions for every listing's bead: on the camera-facing facade, at floor height. */
  setWorld(listings, resolve) {
    this.resolve = resolve;
    this.lastWorld = { listings, resolve };
    const byGroup = new Map();
    for (const l of listings) {
      const info = resolve(l.id);
      if (!info) continue;
      const key = info.towerId || info.dormId;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push({ id: l.id, info });
    }
    this.positions = new Map();
    const dir = this.camDir;
    const tan = [-dir[1], dir[0]];
    // At wide zoom, students in one building would sit on top of each other: spread them on a
    // small grid with a gap of about 12 screen pixels (spreadM is set from the camera's target zoom).
    const spread = this.spreadM || 0;
    for (const [key, arr] of byGroup) {
      const g = GROUPS.get(key);
      if (!g) continue;
      arr.sort((a, b) => a.info.floor - b.info.floor || (a.id < b.id ? -1 : 1));
      const [, depth] = extentAlong(g, dir);
      const [t0, t1] = extentAlong(g, tan);
      const width = Math.max(10, t1 - t0 - 8);
      const n = arr.length;
      const wide = spread > 9;
      const cols = wide ? Math.min(n, 3) : n;
      const rows = Math.ceil(n / cols);
      const step = wide ? spread : n > 1 ? Math.min(9, width / (n - 1)) : 0;
      const mid = (t0 + t1) / 2;
      const lifted = this.liftKey === key;
      const gap = this.phone ? 3.3 : 3.9; // breathing room between floors when a building opens
      arr.forEach((a, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        const inRow = r === rows - 1 ? n - r * cols : cols;
        const off = mid + (c - (inRow - 1) / 2) * step;
        const out = depth + 4 + (wide ? r * step : 0);
        let m = [g.anchorM[0] + dir[0] * out + tan[0] * off, g.anchorM[1] + dir[1] * out + tan[1] * off];
        let z = (a.info.floor - 0.5) * g.fh + (lifted && a.info.floor >= g.floors[0] ? (a.info.floor - g.floors[0] + 1) * gap : 0);
        // Close up (and always for a loop picked to look at) the pin sits in the student's actual room
        // on their real floor. Only far out, where rooms would pile up, do pins stand out front.
        const precise = !wide || (this.xray && this.xray.ids.has(a.id));
        const spot = precise && a.info.number ? this.roomSpot(key, a.info.floor, a.info.number) : null;
        if (spot) { m = spot.m; z = (a.info.floor - 1) * g.fh + g.fh * 0.45 + (lifted && a.info.floor >= g.floors[0] ? (a.info.floor - g.floors[0] + 1) * gap : 0); }
        this.positions.set(a.id, { m, z, ll: toLL(m), group: key, dormId: g.dormId, towerId: g.towerId, floor: a.info.floor });
      });
    }
    // rebuild threads that depend on positions
    for (const t of this.threads.values()) this.buildThreadGeometry(t);
    this.kick();
  }

  /** Where a room really is on its floor (same layout as the open floor view), cached. */
  roomSpot(key, floor, number) {
    this.spotCache = this.spotCache || new Map();
    const ck = `${key}|${floor}|${number}`;
    if (this.spotCache.has(ck)) return this.spotCache.get(ck);
    let spot = null;
    const g = GROUPS.get(key);
    if (g) {
      try {
        const tall = g.buildings.filter((b) => b.height >= g.height * 0.6);
        const cells = floorRooms((tall.length ? tall : g.buildings).map((b) => b.ring.map(toM)), g.dormId, floor, new Map([[number, { listed: true }]]), toM);
        const c = cells.find((x) => x.number === number);
        if (c) spot = { m: c.c, poly: c.poly, z0: (floor - 1) * g.fh, fh: g.fh, key };
      } catch (e) { spot = null; }
    }
    this.spotCache.set(ck, spot);
    return spot;
  }

  /**
   * See-through mode for one loop: its buildings turn to glass, each student's room glows on its
   * real floor, and the pins and threads run room to room. Pass null to turn it off.
   * @param {string[]|null} ids listing ids in the loop
   */
  setXray(ids) {
    const k = ids ? ids.join(">") : "";
    if ((this.xray ? this.xray.k : "") === k) return;
    this.xray = ids ? { k, ids: new Set(ids), t0: performance.now() } : null;
    if (this.lastWorld) this.setWorld(this.lastWorld.listings, this.lastWorld.resolve);
    this.kick();
  }

  /**
   * Which buildings are glass right now and which rooms glow: the picked loop (x-ray) plus, when the
   * camera is close, every student on a loop that is drawn, so each line visibly ends in its room.
   */
  glassState() {
    const ids = new Set(this.xray ? this.xray.ids : []);
    if (!(this.spreadM > 9)) for (const t of this.threads.values()) if (t.ok && !t.dim && t.cycle) t.cycle.forEach((id) => { if (id !== t.missing) ids.add(id); });
    const k = [...ids].sort().join(",");
    if (this._glass && this._glass.k === k) return this._glass;
    const spots = [], groups = new Set();
    for (const id of ids) {
      const p = this.positions && this.positions.get(id), info = this.resolve && this.resolve(id);
      if (!p || !info) continue;
      groups.add(p.group);
      const sp = info.number ? this.roomSpot(p.group, info.floor, info.number) : null;
      if (sp) spots.push({ ...sp, id, ll: sp.poly.map(toLL) });
    }
    const was = this._glass && this._glass.spots.length;
    this._glass = { k, spots, groups, t0: was ? this._glass.t0 : performance.now() };
    return this._glass;
  }

  /** Glass buildings, the lit rooms inside, and a floor line around each room's floor. */
  xrayLayers(layers, x) {
    if (!x || !x.spots.length) return;
    const C = this.colors, dk = this.dark();
    const k = easeOut(clamp((performance.now() - x.t0) / 700, 0, 1));
    const inX = (b) => x.groups.has(b.towerId) || x.groups.has(b.dormId);
    const glass = DORM_B.filter(inX);
    layers.push(new D.SolidPolygonLayer({
      id: "xray-glass", data: glass, extruded: true,
      getPolygon: (d) => d.poly, getElevation: (d) => d.elev,
      getFillColor: rgba(C.dorm, Math.round(255 - 190 * k)), material: this.dormMaterial,
      parameters: { depthWriteEnabled: false }, updateTriggers: { getFillColor: `${this.themeKey}|${Math.round(k * 20)}` },
    }));
    layers.push(new D.PathLayer({
      id: "xray-edges", data: glass.flatMap((b) => [withZ(b.ring, b.minHeight + 0.05), withZ(b.ring, b.height + 0.05)]),
      getPath: (d) => d, getColor: rgba(C.dormEdge, Math.round(200 * k)), getWidth: 1.4, widthUnits: "pixels",
      parameters: { depthWriteEnabled: false }, updateTriggers: { getColor: `${this.themeKey}|${Math.round(k * 20)}` },
    }));
    // a thin ring around each lit floor, so you can count which floor the room is on
    const floors = [];
    for (const sp of x.spots) {
      const g = GROUPS.get(sp.key);
      if (g) g.buildings.forEach((b) => floors.push(withZ(b.ring, sp.z0 + 0.05)));
    }
    layers.push(new D.PathLayer({
      id: "xray-floors", data: floors, getPath: (d) => d, getColor: rgba(C.dormEdge, Math.round(150 * k)),
      getWidth: 1.2, widthUnits: "pixels", parameters: { depthWriteEnabled: false },
      updateTriggers: { getColor: `${this.themeKey}|${Math.round(k * 20)}` },
    }));
    const lit = dk ? [255, 226, 168] : [96, 76, 156];
    layers.push(new D.SolidPolygonLayer({
      id: "xray-rooms", data: x.spots, extruded: true,
      getPolygon: (d) => d.ll.map((p) => [p[0], p[1], d.z0 + 0.1]), getElevation: (d) => d.fh * 0.8,
      getFillColor: rgba(lit, Math.round(235 * k)), material: false,
      updateTriggers: { getFillColor: `${dk}|${Math.round(k * 20)}` },
    }));
  }

  setBadges(b) {
    this.badges = b;
    for (const d of DORMS) {
      const it = this.labels.get(d.id);
      if (!it) continue;
      const n = b[d.id] || 0;
      it.badge.textContent = String(n);
      it.badge.classList.toggle("zero", !n);
      it.el.setAttribute("aria-label", `${d.name}, ${n} rooms offered`);
      it.w = 0;
    }
    this.kick();
  }

  // ---------- selection ----------
  selectDorm(dormId, towerId = null, { fly = true } = {}) {
    const d = dormById.get(dormId);
    if (!d) return;
    const prev = this.sel;
    this.room = null;
    this.sel = { dormId, towerId, floor: null };
    this.floorAnim = null;
    this.startFade(1);
    if (fly) {
      if (towerId) this.flyToGroup(towerId, { zoom: this.phone ? 17.0 : 17.55, pitch: 58, bearingDelta: 20, duration: prev.dormId === dormId ? 800 : 1400 });
      else this.flyToGroup(dormId, { zoom: dormId === "warren" ? (this.phone ? 16.55 : 17.0) : (this.phone ? 16.85 : 17.3), pitch: 62, bearingDelta: 20 });
    }
    const key = d.towers.length ? towerId : dormId;
    if (key) this.startExplode(key, fly && prev.dormId !== dormId ? 650 : 0);
    else if (this.explode) this.closeExplode();
    this.updateLabelClasses();
    this.kick();
  }

  clearSelection({ fly = true } = {}) {
    this.room = null;
    this.sel = { dormId: null, towerId: null, floor: null };
    this.floorAnim = null;
    if (this.explode) this.closeExplode();
    this.startFade(0);
    if (fly) this.goHome(900);
    this.updateLabelClasses();
    this.kick();
  }

  selectFloor(floor) {
    const now = performance.now();
    if (floor == null) {
      this.room = null;
      if (this.floorAnim && this.floorAnim.dir > 0) this.floorAnim = { ...this.floorAnim, t0: now, dir: -1 };
      this.sel.floor = null;
      const key = this.sel.towerId || this.sel.dormId;
      if (key) {
        const zoom = this.sel.towerId ? (this.phone ? 17.0 : 17.55) : (this.phone ? 16.85 : 17.3);
        // pull back first, still aimed at the raised floor, so the way out never skims the dark ground
        this.setView({ zoom: Math.min(this.vs.zoom, zoom + 0.5), pitch: 58, position: this.vs.position }, 380, "linear");
        clearTimeout(this.floorExitT);
        this.floorExitT = setTimeout(() => {
          if (this.sel.floor == null && (this.sel.towerId || this.sel.dormId) === key) { this.flyToGroup(key, { zoom, pitch: 58, bearingDelta: 20, duration: 650 }); this.exitGlass = null; } // already pulled back: no need to hide the building
        }, reducedMotion() ? 0 : 380);
      }
    } else {
      const prev = this.floorAnim && this.floorAnim.dir > 0 && this.floorAnim.floor !== floor ? this.floorAnim.floor : null;
      this.sel.floor = floor;
      this.floorAnim = { floor, prev, t0: now, dir: 1 };
      this.room = null;
      const key = this.sel.towerId || this.sel.dormId;
      this.liftKey = key;
      const g = GROUPS.get(key);
      if (g) {
        // fly into the floor itself and stay in 3D. The camera's target is lifted to the floor's
        // height (viewState.position), so even a top floor sits mid-screen instead of above the camera.
        const [lo] = g.floors;
        const gap = this.phone ? 3.3 : 3.9; // breathing room between floors when a building opens
        const zf = (floor - 1) * g.fh + (floor - lo + 1) * gap + g.fh * 0.18 + 1.2;
        const pitch = this.phone ? 46 : 50, bearing = this.bearingDorm;
        // center on the floor's rooms (a low wing beside the tower would pull a footprint center off)
        let aim = g.verts;
        try {
          const tall = g.buildings.filter((bb) => bb.height >= g.height * 0.6);
          const cells = floorRooms((tall.length ? tall : g.buildings).map((bb) => bb.ring.map(toM)), g.dormId, floor, new Map(), toM);
          if (cells.length) aim = cells.flatMap((cc) => cc.poly);
        } catch (e) { /* the footprint will do */ }
        const xs = aim.map((v) => v[0]), ys = aim.map((v) => v[1]);
        const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
        // fit the floor's long side to most of the free map area
        const span = Math.max(...aim.map((v) => Math.hypot(v[0] - c[0], v[1] - c[1])));
        const fa = this.freeArea();
        const fw = Math.max(240, Math.min(fa.right - fa.left, (fa.bottom - fa.top) * 1.6));
        const mpp0 = (40075016 * Math.cos((LAT0 * Math.PI) / 180)) / 512;
        const zoom = clamp(Math.log2((0.7 * fw * mpp0) / (2 * span + 6)), 17.4, 19.4);
        const ll = toLL(c);
        this.floorView = this.centerOn({ longitude: ll[0], latitude: ll[1], zoom, pitch, bearing, position: [0, 0, zf] }, aim, zf);
        this.setView(this.floorView, 1100, "linear");
      }
    }
    this.kick();
  }

  startFade(to) {
    const now = performance.now();
    this.fade = { v: this.fadeValue(now), from: this.fadeValue(now), to, t0: now, dur: reducedMotion() ? 1 : 260 };
  }
  fadeValue(now) {
    const f = this.fade;
    const t = clamp((now - f.t0) / f.dur, 0, 1);
    return f.from + (f.to - f.from) * easeOut(t);
  }

  startExplode(key, delay = 0) {
    const g = GROUPS.get(key);
    if (!g) return;
    if (this.explode && this.explode.group.key === key && this.explode.dir > 0) return;
    this.explode = { group: g, t0: performance.now() + delay, dir: 1 };
    this.kick();
  }
  closeExplode() {
    if (!this.explode) return;
    this.explode = { ...this.explode, t0: performance.now(), dir: -1 };
    this.kick();
  }
  floorProgress(f, now) {
    const ex = this.explode;
    if (!ex) return 0;
    const [lo, hi] = ex.group.floors;
    const rm = reducedMotion();
    if (ex.dir > 0) {
      const t = (now - ex.t0 - (f - lo) * 25) / 420;
      return rm ? (now >= ex.t0 ? 1 : 0) : easeOut(clamp(t, 0, 1));
    }
    const t = (now - ex.t0 - (hi - f) * 18) / 320;
    return rm ? 0 : 1 - easeInOut(clamp(t, 0, 1));
  }
  floorFocusValue(now) {
    const fa = this.floorAnim;
    if (!fa) return 0;
    const t = clamp((now - fa.t0) / (reducedMotion() ? 1 : 650), 0, 1);
    return fa.dir > 0 ? easeInOut(t) : 1 - easeInOut(t);
  }

  hoverDorm(dormId) {
    if (this.hover.dormId === dormId) return;
    this.hover.dormId = dormId;
    this.updateLabelClasses();
    this.kick();
  }

  // ---------- threads ----------
  /**
   * @param {Array<{id:string, cycle:string[], kind?:"loop"|"direct"|"open", focus?:boolean, dim?:boolean,
   *   missing?:string, draw?:boolean, pull?:number, delay?:number, pins?:boolean, rgb?:number[], thin?:boolean}>} list
   */
  setThreads(list) {
    const now = performance.now();
    const next = new Map();
    for (const spec of list) {
      const old = this.threads.get(spec.id);
      const same = old && old.cycle.join() === spec.cycle.join() && old.kind === (spec.kind || "loop");
      const same2 = same && !!old.plain === !!spec.plain && !!old.soft === !!spec.soft;
      const t = same2 ? Object.assign(old, { focus: !!spec.focus, dim: !!spec.dim, pins: !!spec.pins, rgbFix: spec.rgb || null, thin: !!spec.thin, styleKey: null }) : {
        id: spec.id, cycle: spec.cycle.slice(), kind: spec.kind || "loop", focus: !!spec.focus, dim: !!spec.dim,
        plain: !!spec.plain, soft: !!spec.soft, rgbFix: spec.rgb || null, thin: !!spec.thin,
        missing: spec.missing || null, pins: !!spec.pins, sprout: spec.sprout || 0,
        start: spec.draw === false || reducedMotion() ? now - 1e5 : now + (spec.delay || 0),
        pull: reducedMotion() ? 1 : spec.pull || 1.35,
        dur: 0,
      };
      if (!same2) this.buildThreadGeometry(t);
      next.set(spec.id, t);
    }
    this.threads = next;
    this.syncPins();
    this.kick();
  }

  /** Close an open thread into a loop with a strong snap (live add). */
  closeThread(id, pull = 1.5) {
    const t = this.threads.get(id);
    if (!t) return;
    t.kind = "loop";
    t.missing = null;
    t.start = reducedMotion() ? performance.now() - 1e5 : performance.now();
    t.pull = reducedMotion() ? 1 : pull;
    this.buildThreadGeometry(t);
    this.syncPins();
    this.kick();
  }

  buildThreadGeometry(t) {
    const nodes = t.cycle.map((id) => this.positions.get(id));
    t.ok = nodes.every(Boolean);
    if (!t.ok) return;
    t.nodes = nodes;
    t.pointsK = null; // cached pulled shape is for the old endpoints
    const k = nodes.length;
    t.segs = [];
    // loops that share endpoints fan apart a little (lane -1, 0, 1) so they read as separate arcs
    let lane = 0;
    // (a 2-person loop stays on one arc: fanned apart, its two halves would look like two lines)
    if (t.kind !== "direct" && t.cycle.length > 2) { const st = this.threadStyle(t); lane = st.ai ? 0 : (st.index % 3) - 1; }
    for (let i = 0; i < k; i++) {
      const a = nodes[i];
      const b = nodes[(i + 1) % k];
      if (t.kind === "direct" && i > 0) break;
      t.segs.push(this.segment(a, b, lane));
    }
    const segCount = t.segs.length;
    t.dur = clamp(450 * segCount, 900, 2200);
    // arc lengths with final (k = 1) geometry
    const pts = this.threadPoints(t, 1);
    let total = 0;
    const lens = [0];
    for (let i = 1; i < pts.length; i++) {
      const dx = (pts[i][0] - pts[i - 1][0]) * KX, dy = (pts[i][1] - pts[i - 1][1]) * KY, dz = pts[i][2] - pts[i - 1][2];
      total += Math.hypot(dx, dy, dz);
      lens.push(total);
    }
    t.total = total || 1;
    t.frac = lens.map((l) => l / t.total);
    t.nodeFrac = [];
    const per = this.samples();
    for (let i = 0; i < segCount; i++) t.nodeFrac.push(t.frac[i * per]);
    t.points = pts;
  }

  samples() { return this.phone ? 26 : 40; }

  segment(a, b, lane = 0) {
    const sameDorm = a.dormId === b.dormId;
    const sameGroup = a.group === b.group;
    const A = [a.m[0], a.m[1], a.z];
    const B = [b.m[0], b.m[1], b.z];
    const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
    const d = Math.hypot(B[0] - A[0], B[1] - A[1]);
    let ctrl;
    if (!sameDorm) {
      // gentle arcs: tall enough to clear the towers, low enough that a campus of loops stays a web
      // arcK flattens arcs (phone, and the closing web) while still clearing the buildings
      const zt = Math.max(A[2], B[2]);
      const k = (this.arcK || 1) * (this.phone ? 0.72 : 1);
      const h = zt + (Math.min(zt + 26 + 0.11 * d, 150) - zt) * k * (1 + 0.14 * lane);
      const side = Math.min(0.07 * d, 70) * lane;
      const px = d > 1 ? -(B[1] - A[1]) / d : 0, py = d > 1 ? (B[0] - A[0]) / d : 0;
      ctrl = [mid[0] + px * side, mid[1] + py * side, 2 * h - (A[2] + B[2]) / 2];
    } else if (!sameGroup) {
      const h = Math.max(A[2], B[2]) + 22 + 0.15 * d;
      ctrl = [mid[0], mid[1], 2 * h - (A[2] + B[2]) / 2];
    } else {
      // same building: bow sideways along the facade (up on one side, down on the other) so the loop reads as a ring
      const df = (b.floor || 0) - (a.floor || 0);
      const tan = [-this.camDir[1], this.camDir[0]];
      const side = df >= 0 ? 1 : -1;
      const push = 6 + 1.6 * Math.abs(df);
      ctrl = [mid[0] + tan[0] * push * 2 * side + this.camDir[0] * 6, mid[1] + tan[1] * push * 2 * side + this.camDir[1] * 6, mid[2]];
    }
    return { A, B, ctrl, mid };
  }

  threadPoints(t, k) {
    const per = this.samples();
    const out = [];
    t.segs.forEach((s, si) => {
      const c = [s.mid[0] + (s.ctrl[0] - s.mid[0]) * k, s.mid[1] + (s.ctrl[1] - s.mid[1]) * k, s.mid[2] + (s.ctrl[2] - s.mid[2]) * k];
      for (let i = 0; i < per; i++) {
        const u = i / per;
        const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, cc = u * u;
        const x = a * s.A[0] + b * c[0] + cc * s.B[0];
        const y = a * s.A[1] + b * c[1] + cc * s.B[1];
        const z = a * s.A[2] + b * c[2] + cc * s.B[2];
        const ll = toLL([x, y]);
        out.push([ll[0], ll[1], z]);
      }
      if (si === t.segs.length - 1) {
        const ll = toLL([s.B[0], s.B[1]]);
        out.push([ll[0], ll[1], s.B[2]]);
      }
    });
    return out;
  }

  pullValue(t, now) {
    if (t.pull <= 1) return 1;
    const tEnd = t.start + t.dur;
    if (now < tEnd) return t.pull;
    const u = clamp((now - tEnd) / 520, 0, 1);
    return t.pull + (1 - t.pull) * easeBack(u);
  }

  /** Flatten (k < 1) or restore (k = 1) the height of arcs between buildings. */
  setArcScale(k) {
    if ((this.arcK || 1) === k) return;
    this.arcK = k;
    for (const t of this.threads.values()) this.buildThreadGeometry(t);
    this.kick();
  }

  setBeads(list) { this.beads = list || []; this.beadT0 = performance.now(); this.kick(); }
  setExtraPins(list) { this.extraPins = list || []; this.syncPins(); }
  setHighlightSegment(seg) { this.highlightSeg = seg; this.kick(); }
  /**
   * Demo helper: every pin on this loop rides its arc into the next room, so you watch the swap happen.
   * @param {string|null} threadId loop thread to move along (null clears)
   * @param {number} ms travel time
   */
  setMovers(threadId, ms = 2600, delay = 0) {
    this.movers = threadId ? { id: threadId, t0: performance.now() + delay, ms } : null;
    this.kick();
  }

  /** Demo helper: everyone in this loop confirmed. Its line turns green, then the students move. */
  confirmLoop(threadId, ms = 2600) {
    const t = this.threads.get(threadId);
    if (!t) return;
    t.doneAt = performance.now();
    this.setMovers(threadId, ms, 700);
  }

  /** Where a pin sits while its loop is moving: a point along its outgoing arc, or null if it isn't moving. */
  moverPos(listingId, now) {
    const mv = this.movers, t = mv && this.threads.get(mv.id);
    if (!t || !t.ok || !t.points) return null;
    const i = t.cycle.indexOf(listingId);
    if (i < 0) return null;
    const per = this.samples();
    const u = easeInOut(clamp((now - mv.t0) / mv.ms, 0, 1));
    const seg = t.points.slice(i * per, (i + 1) * per + 1);
    if (i === t.cycle.length - 1) seg.push(t.points[t.points.length - 1]);
    const f = u * (seg.length - 1), j = Math.min(seg.length - 2, Math.floor(f)), r = f - j;
    const a = seg[j], b = seg[j + 1] || a;
    return { ll: [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r], z: a[2] + (b[2] - a[2]) * r };
  }

  setCarrier(c) {
    this.carrier = c ? { ...c, t0: performance.now() } : null;
    this.carrierEl.style.display = c ? "" : "none";
    if (c) this.carrierEl.firstElementChild.textContent = c.label;
    this.kick();
  }

  // ---------- render loop ----------
  kick() {
    if (this.paused || this.raf) return;
    this.raf = requestAnimationFrame(this.frame);
  }
  pause(p) {
    this.paused = p;
    this.deck.setProps({ _animate: false });
    if (p && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    if (!p) this.kick();
  }

  frame() {
    this.raf = 0;
    if (this.paused || document.hidden) return;
    const now = performance.now();
    let anim = false;
    // idle orbit on the opening view
    if (this.orbit && !this.sel.dormId && !this.noOrbit) {
      const inTransition = this.vs.transitionDuration && now - (this.vsSetAt || 0) < this.vs.transitionDuration;
      if (!inTransition) {
        // a slow sway around the framed bearing (not a full spin), so the framing always holds
        if (!this.orbitT0) { this.orbitT0 = now; this.orbitBase = this.vs.bearing; }
        const b = this.orbitBase + 3.5 * Math.sin(((now - this.orbitT0) / 28000) * 2 * Math.PI);
        this.vs = { ...this.vs, bearing: b, transitionDuration: 0 };
        this.deck.setProps({ initialViewState: this.vs });
      }
      anim = true;
    } else this.orbitT0 = 0;
    this.lastFrame = now;
    const layers = this.buildLayers(now);
    this.deck.setProps({ layers });
    anim = anim || this.animating(now);
    if (anim) this.raf = requestAnimationFrame(this.frame);
    else this.lastFrame = 0;
  }

  animating(now) {
    if (now - this.fade.t0 < this.fade.dur + 50) return true;
    if (this.explode) {
      const [lo, hi] = this.explode.group.floors;
      if (now - this.explode.t0 < 600 + (hi - lo) * 25) return true;
      if (this.explode.dir < 0) { this.explode = null; return true; }
    }
    if (this.floorAnim && now - this.floorAnim.t0 < 700) return true;
    if (this.pulsesOn || this.lifeOn) return true;
    if (this.beads.length && now - (this.beadT0 || 0) < 2200) return true;
    if (this.carrier && now - this.carrier.t0 < 1200) return true;
    if (this.movers && now - this.movers.t0 < this.movers.ms + 200) return true;
    for (const t of this.threads.values()) if (t.doneAt && now - t.doneAt < 800) return true;
    for (const t of this.threads.values()) {
      if (!t.ok) continue;
      if (now < t.start + Math.max(t.dur, t.sprout || 0) + 700) return true;
      if (t.kind === "loop" && (t.focus || (t.style && t.style.ai)) && !reducedMotion()) return true;
      if (t.kind === "open" && !reducedMotion()) return true;
    }
    return false;
  }

  buildLayers(now) {
    const C = this.colors;
    const fadeV = this.fadeValue(now);
    const sel = this.sel;
    const ex = this.explode;
    const exIds = ex ? new Set(ex.group.buildings.map((b) => b.id)) : null;
    const tk = this.themeKey;
    const flat = { depthCompare: "always", depthWriteEnabled: false };
    const layers = [];

    const gk = this.dark() ? 120 : 92;
    layers.push(new D.LineLayer({
      id: "ground-grid", data: GRID, getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t,
      getColor: (d) => rgba(C.grid, Math.round(d.a * (d.major ? gk : gk * 0.5))), getWidth: (d) => (d.major ? 1.2 : 1), widthUnits: "pixels",
      parameters: flat, updateTriggers: { getColor: tk },
    }));
    // pulses only while the grid is in view (wide shots), and never with reduced motion
    this.pulsesOn = !reducedMotion() && PULSES.length && (this.vs.zoom || 0) < 17.2;
    if (this.pulsesOn) {
      const tSec = ((now - this.t0) / 1000) % PULSE_CYCLE;
      const pk = this.dark() ? 1 : 0.85;
      const pulse = (id, w, a, trail) => new D.TripsLayer({
        id, data: PULSES, getPath: (d) => d.path, getTimestamps: (d) => d.ts, getColor: (d) => rgba(d.c, Math.round(a * pk)),
        getWidth: w, widthUnits: "pixels", capRounded: true, jointRounded: true, trailLength: trail, fadeTrail: true,
        currentTime: tSec, parameters: flat, updateTriggers: { getColor: tk },
      });
      layers.push(pulse("grid-pulse-glow", 7, 60, 1.6), pulse("grid-pulse", 2, 235, 1.1));
      const cyc = (id, w, a, trail) => new D.TripsLayer({
        id, data: CYCLES, getPath: (d) => d.path, getTimestamps: (d) => d.ts, getColor: (d) => rgba(d.c, Math.round(a * pk)),
        getWidth: w, widthUnits: "pixels", capRounded: true, jointRounded: false, trailLength: trail, fadeTrail: true,
        currentTime: ((now - this.t0) / 1000) % 32, parameters: flat, updateTriggers: { getColor: tk },
      });
      layers.push(cyc("grid-cycle-glow", 9, 70, 3.2), cyc("grid-cycle", 2.5, 255, 2.6));
    }
    layers.push(new D.SolidPolygonLayer({
      id: "green", data: CAMPUS.green, getPolygon: (d) => d.polygon, getFillColor: C.green,
      material: false, extensions: fog(), parameters: flat, updateTriggers: { getFillColor: tk },
    }));
    layers.push(new D.SolidPolygonLayer({
      id: "water", data: CAMPUS.water, getPolygon: (d) => d.polygon, getFillColor: C.water,
      material: false, extensions: fog(), parameters: flat, updateTriggers: { getFillColor: tk },
    }));
    const road = (id, data, color, w, minPx) => new D.PathLayer({
      id, data, getPath: (d) => d.path, getColor: color, getWidth: w, widthUnits: "meters", widthMinPixels: minPx,
      capRounded: true, jointRounded: true, parameters: flat, extensions: fog(), updateTriggers: { getColor: tk },
    });
    layers.push(road("road-major-edge", ROADS.major, C.roadEdge, 17, 2.5));
    layers.push(road("road-minor-edge", ROADS.minor, C.roadEdge, 10, 1.5));
    layers.push(road("road-major", ROADS.major, C.road, 14, 1.5));
    layers.push(road("road-minor", ROADS.minor, C.road, 7.5, 1));
    layers.push(road("road-path", ROADS.path, C.path, 2.2, 0.6));
    layers.push(new D.PathLayer({
      id: "rail", data: ROADS.rail, getPath: (d) => d.path, getColor: C.rail, getWidth: 1.4, widthUnits: "pixels",
      parameters: flat, extensions: fog(), updateTriggers: { getColor: tk },
    }));

    const fadeQ = Math.round(fadeV * 12) / 12;
    // soft blue glow on the ground under each marketplace dorm (Explore only: in the demo color means a loop)
    const haloA = this.dimAll ? 0 : 1;
    if (haloA) {
      const dk = this.dark();
      layers.push(new D.ScatterplotLayer({
        id: "dorm-halo", data: HALOS, getPosition: (d) => [d.pos[0], d.pos[1], 0.3], getRadius: (d) => d.r, radiusUnits: "meters",
        getFillColor: (d) => rgba(C.dormEdge, Math.round((sel.dormId ? (d.dormId === sel.dormId ? 1 : 0.25 * (1 - fadeV)) : this.hover.dormId === d.dormId ? 1.35 : 1) * (dk ? 96 : 84))),
        extensions: SOFT, parameters: flat,
        updateTriggers: { getFillColor: `${tk}|${sel.dormId}|${this.hover.dormId}|${Math.round(fadeV * 20)}` },
      }));
    }

    // ordinary buildings: fade and sink a little while a dorm is selected
    layers.push(new D.SolidPolygonLayer({
      id: "buildings", data: OTHERS, extruded: true,
      getPolygon: (d) => d.poly, getElevation: (d) => d.elev,
      // fade toward the ground color (opaque, so buildings never turn see-through)
      getFillColor: mix(C.building, C.ground, 0.62 * fadeQ), material: this.material, extensions: fogSolid(C.ground),
      elevationScale: 1 - 0.18 * fadeV,
      updateTriggers: { getFillColor: `${tk}|${fadeQ}` },
    }));

    // dorms
    const glass = this.glassState();
    const exiting = this.exitGlass && performance.now() < this.exitGlass.until ? this.exitGlass.key : null;
    const xg = new Set([...glass.groups].filter((k) => !(ex && ex.group && ex.group.key === k))); // an opened building is already apart

    const glassNow = { ...glass, groups: xg, spots: glass.spots.filter((sp) => xg.has(sp.key)) };
    // the building the camera is leaving stays hidden until the camera is clear of it (see exitGlass)
    const dormData = DORM_B.filter((b) => !(exIds && exIds.has(b.id)) && !(xg.has(b.towerId) || xg.has(b.dormId)) && !(exiting && (b.towerId === exiting || b.dormId === exiting)));
    const dormColor = (b) => {
      if (sel.dormId) {
        if (b.dormId !== sel.dormId) return C.dormDim;
        if (sel.towerId && b.towerId && b.towerId !== sel.towerId) return C.dorm;
        return C.dormSelected;
      }
      if (this.hover.dormId === b.dormId) return C.dormHover;
      return C.dorm;
    };
    const colorKey = `${tk}|${sel.dormId}|${sel.towerId}|${this.hover.dormId}`;
    layers.push(new D.SolidPolygonLayer({
      id: "dorms", data: dormData, extruded: true, pickable: true,
      getPolygon: (d) => d.poly, getElevation: (d) => d.elev, getFillColor: dormColor, material: this.dormMaterial, extensions: TINT,
      transitions: { getFillColor: reducedMotion() ? 0 : 220 },
      updateTriggers: { getFillColor: colorKey },
    }));
    if (!this.dimAll) layers.push(new D.PathLayer({
      id: "dorm-roofs", data: dormData, getPath: (d) => withZ(d.ring, d.height + 0.25),
      getColor: (b) => (sel.dormId && b.dormId !== sel.dormId ? rgba(C.dormEdge, 50) : rgba(C.dormEdge, 215)),
      getWidth: this.phone ? 1.6 : 2, widthUnits: "pixels", jointRounded: true,
      updateTriggers: { getColor: colorKey },
    }));

    this.xrayLayers(layers, glassNow);

    // exploded floors (not while the camera is still leaving them; see exitGlass)
    if (ex && ex.group.key !== exiting) {
      const g = ex.group;
      const [lo, hi] = g.floors;
      const fh = g.fh;
      const gap = this.phone ? 3.3 : 3.9; // breathing room between floors when a building opens
      const focusV = this.floorFocusValue(now);
      const ff = this.floorAnim ? this.floorAnim.floor : null;
      const slabs = [];
      const podium = [];
      const baseTop = (lo - 1) * fh;
      g.buildings.forEach((b) => { if (baseTop > 0.5) podium.push({ poly: b.ring, elev: baseTop }); });
      let maxLift = 0;
      // Going from one open floor straight to another blends from the old state to the new one,
      // so floors that already lifted away stay up instead of dropping back and lifting again.
      const fa = this.floorAnim;
      const pf = fa && fa.dir > 0 ? fa.prev : null;
      const blend = (was, now2) => was + (now2 - was) * focusV;
      for (let f = lo; f <= hi; f++) {
        const p = this.floorProgress(f, now);
        const lift = p * (f - lo + 1) * gap;
        maxLift = Math.max(maxLift, lift);
        const up = ff == null ? 0 : blend(pf != null && f > pf ? 1 : 0, f > ff ? 1 : 0);
        const dim = ff == null ? 0 : blend(pf != null && f !== pf ? 1 : 0, f !== ff ? 1 : 0);
        const thin = ff == null ? 0 : blend(pf != null && f === pf ? 1 : 0, f === ff ? 1 : 0);
        // floors above the open one lift away so you look straight into it
        const dz = up * (60 + (f - (ff ?? f)) * 2);
        const z0 = (f - 1) * fh + lift + dz;
        g.buildings.forEach((b) => {
          const ring = b.ring.map((pt) => [pt[0], pt[1], z0]);
          // the open floor becomes a thin floor plate; its rooms rise out of it
          slabs.push({ floor: f, poly: ring, elev: fh * (0.8 - 0.62 * thin), p, z0, up, dim, thin });
        });
      }
      this.slabMeta = { g, lo, hi, gap, fh };
      const has = this.floorsWithListings || new Set();
      const slabColor = (s) => {
        let c;
        if (s.thin > 0.01) c = mix(C.slabSel, C.floorPlate, s.thin);
        else if (this.hover.floor === s.floor) c = C.slabHover;
        else if ((this.floorsThatFit || has).has(`${g.key}|${s.floor}`)) c = C.slabHas;
        else if (has.has(`${g.key}|${s.floor}`)) c = mix(C.slab, C.slabHas, 0.3); // offered, but nothing you asked for
        else c = C.slab;
        let a = 255;
        if (s.dim > 0) a = Math.round(255 * (1 - (0.8 + 0.17 * s.up) * s.dim));
        return rgba(c, a);
      };
      // empty extruded layers draw with a negative instance count (WebGL warning), so skip them
      if (podium.length) layers.push(new D.SolidPolygonLayer({
        id: "podium", data: podium, extruded: true,
        getPolygon: (d) => d.poly, getElevation: (d) => d.elev, getFillColor: C.dormSelected, material: this.material,
        opacity: 1 - 0.7 * focusV,
        updateTriggers: { getFillColor: tk },
      }));
      layers.push(new D.SolidPolygonLayer({
        id: "slabs", data: slabs, extruded: true, pickable: true,
        getPolygon: (d) => d.poly, getElevation: (d) => d.elev, getFillColor: slabColor, material: this.material,
        updateTriggers: { getFillColor: `${tk}|${this.hover.floor}|${ff}|${Math.round(focusV * 40)}|${has.size}` },
      }));
      layers.push(new D.PathLayer({
        id: "slab-edges", data: slabs.filter((s) => has.has(`${g.key}|${s.floor}`) || s.floor === this.hover.floor),
        getPath: (d) => d.poly.map((p) => [p[0], p[1], p[2] + d.elev + 0.15]),
        getColor: (s) => rgba(C.dormEdge, ff != null && s.floor !== ff ? Math.round(220 * (1 - focusV)) : 220),
        getWidth: 1.5, widthUnits: "pixels",
        updateTriggers: { getColor: `${tk}|${ff}|${Math.round(focusV * 40)}` },
      }));
      if (ff != null && focusV > 0.02) this.roomLayers(layers, g, ff, slabs, focusV);
      else this.roomsNow = null;
      this.slabsNow = slabs;
    } else {
      this.roomsNow = null;
      this.slabsNow = null;
    }

    // the edge of the data: buildings dissolve into wireframes in the grid color
    // wires belong to the wide view; at street level they would draw over real buildings
    const wk = (this.dark() ? 150 : 110) * (1 - 0.7 * fadeV) * clamp((17 - (this.vs.zoom || 15)) / 0.8, 0, 1);
    layers.push(new D.PathLayer({
      id: "edge-roofs", data: EDGE_WIRES.roofs, getPath: (d) => d.path, getColor: (d) => rgba(C.grid, Math.round(d.a * wk)),
      getWidth: 1, widthUnits: "pixels", parameters: { depthWriteEnabled: false }, updateTriggers: { getColor: `${tk}|${Math.round(fadeV * 10)}` },
    }));
    layers.push(new D.LineLayer({
      id: "edge-posts", data: EDGE_WIRES.posts, getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t, getColor: (d) => rgba(C.grid, Math.round(d.a * wk)),
      getWidth: 1, widthUnits: "pixels", parameters: { depthWriteEnabled: false }, updateTriggers: { getColor: `${tk}|${Math.round(fadeV * 10)}` },
    }));

    // the city past the campus model, as a sketch (loaded after first paint)
    if (this.ctxWires) {
      const ck = (this.dark() ? 120 : 90) * (1 - 0.7 * fadeV) * clamp((17.2 - (this.vs.zoom || 15)) / 0.8, 0, 1);
      if (ck > 1) {
        layers.push(new D.PathLayer({
          id: "ctx-roofs", data: this.ctxWires.roofs, getPath: (d) => d.path, getColor: (d) => rgba(C.grid, Math.round(d.a * ck)),
          getWidth: 1, widthUnits: "pixels", parameters: { depthWriteEnabled: false }, updateTriggers: { getColor: `${tk}|${Math.round(ck)}` },
        }));
        layers.push(new D.LineLayer({
          id: "ctx-posts", data: this.ctxWires.posts, getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t, getColor: (d) => rgba(C.grid, Math.round(d.a * ck)),
          getWidth: 1, widthUnits: "pixels", parameters: { depthWriteEnabled: false }, updateTriggers: { getColor: `${tk}|${Math.round(ck)}` },
        }));
      }
    }

    // city life: cars, people, stoplights, the game at Fenway
    this.lifeOn = !reducedMotion();
    layers.push(...fenwayLayers({ dark: this.dark(), material: this.material }));
    layers.push(...windowLayers({ now, t0: this.t0, zoom: this.vs.zoom, dark: this.dark(), fade: fadeV }));
    layers.push(...cdsLayers({ zoom: this.vs.zoom, dark: this.dark(), fade: fadeV }));
    if (this.lifeOn) layers.push(...lifeLayers({ now, t0: this.t0, zoom: this.vs.zoom || 15, dark: this.dark(), demo: this.dimAll, depth: {}, glow: { depthWriteEnabled: false }, soft: SOFT }));

    // threads
    this.threadLayers(layers, now);
    return layers;
  }

  /**
   * Fly into one room on the open floor and furnish it.
   * @param {string} number room number on the open floor
   * @param {Array<{personId?:string, role:string, avatarUrl?:string, label?:string}>} beds one per resident
   */
  openRoom(number, beds) {
    const cells = this.roomCache && this.roomCache.cells;
    const cell = cells && cells.find((c) => c.number === number);
    if (!cell || this.zTopNow == null) return;
    this.room = { key: this.roomCache.key, number, beds, cell, t0: performance.now(), f: null, z: this.zTopNow };
    const f = furnish(cell, this.zTopNow, beds, toLL);
    this.room.f = f;
    // neighbors the full-size room now covers step aside
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    this.room.hide = new Set(cells.filter((c) => c !== cell && [c.c, ...c.poly, ...c.poly.map((p, i) => mid(p, c.poly[(i + 1) % c.poly.length]))].some(f.covers)).map((c) => c.number));
    const pitch = this.phone ? 46 : 48;
    const bearing = (Math.atan2(f.fwd[0], f.fwd[1]) * 180) / Math.PI;
    // aim the camera at the room itself, up at its floor, so it never ends up below an upper floor
    // close enough that the room fills about half the free map
    const fa = this.freeArea();
    const px = Math.min(fa.right - fa.left, (fa.bottom - fa.top) * 1.3) * (this.phone ? 0.8 : 0.55);
    const zoom = clamp(Math.log2((px * ((40075016 * Math.cos((LAT0 * Math.PI) / 180)) / 512)) / Math.max(f.W, f.Dp, 3)), 20.2, 21.8);
    const v = this.offsetView({ longitude: f.center[0], latitude: f.center[1], zoom, pitch, bearing });
    this.setView({ ...v, position: [0, 0, this.zTopNow + 0.8] }, 1200, "linear");
    this.kick();
  }
  closeRoom({ fly = true } = {}) {
    if (!this.room) return;
    this.room = null;
    if (fly && this.floorView) this.setView(this.floorView, 900, "linear");
    this.kick();
  }

  /**
   * Where a dorm (or one Warren tower) is on screen right now: the middle of its roof, in page pixels.
   * Used by the hover line so it lands on the exact building, even when the label is merged into a pill.
   */
  screenPointFor(dormId, towerId) {
    const g = GROUPS.get(towerId && GROUPS.has(towerId) ? towerId : dormId);
    const vp = this.deck && this.deck.getViewports && this.deck.getViewports()[0];
    if (!g || !vp) return null;
    const c = g.verts.reduce((a, v) => [a[0] + v[0] / g.verts.length, a[1] + v[1] / g.verts.length], [0, 0]);
    const ll = toLL(c);
    const [x, y] = vp.project([ll[0], ll[1], g.height]);
    const r = this.container.getBoundingClientRect();
    return Number.isFinite(x) && Number.isFinite(y) ? [r.left + x, r.top + y] : null;
  }

  /**
   * The city around the campus box (data/context.js, real OSM outlines), drawn only as a sketch:
   * roof outlines and corner posts in the grid color, strongest at the edge of the campus model and
   * fading toward the horizon, so the solid city hands off to the sketch and never goes blank.
   */
  loadContext() {
    import("../data/context.js").then(({ CONTEXT }) => {
      const sm = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
      const outside = (ll) => { const m = toM(ll); const x0 = toM([BX0, BY0]), x1 = toM([BX1, BY1]); return Math.max(x0[0] - m[0], m[0] - x1[0], x0[1] - m[1], m[1] - x1[1]); };
      const roofs = [], posts = [];
      for (const [h, ring] of CONTEXT.buildings) {
        const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
        const a = (1 - sm(250, 1700, outside(c))) * 0.9;
        if (a < 0.04) continue;
        roofs.push({ path: ring.map((p) => [p[0], p[1], h]), a });
        ring.forEach((p, i) => { if (i % 2 === 0 && i < ring.length - 1) posts.push({ s: [p[0], p[1], 0], t: [p[0], p[1], h], a: a * 0.6 }); });
      }
      this.ctxWires = { roofs, posts };
      this.kick();
    }).catch(() => { /* the sketch ring is optional */ });
  }

  /** Offered rooms on the open floor, keyed by room number (set by the app). */
  setFloorMarks(key, marks) { this.floorMarks = { key, marks }; this.roomCache = null; this.kick(); }

  /** The open floor in 3D: one block per room on the real footprint, walls rising as the camera arrives. */
  roomLayers(layers, g, ff, slabs, focusV) {
    const C = this.colors, tk = this.themeKey;
    const key = `${g.key}|${ff}`;
    const marks = this.floorMarks && this.floorMarks.key === key ? this.floorMarks.marks : new Map();
    if (!this.roomCache || this.roomCache.key !== key || this.roomCache.marks !== marks) {
      const tall = g.buildings.filter((b) => b.height >= g.height * 0.6);
      const rings = (tall.length ? tall : g.buildings).map((b) => b.ring.map(toM));
      this.roomCache = { key, marks, cells: floorRooms(rings, g.dormId, ff, marks, toM).map((c) => ({ ...c, ll: c.poly.map(toLL), cll: toLL(c.c) })) };
    }
    const plate = slabs.find((s) => s.floor === ff);
    if (!plate) return;
    const zTop = plate.z0 + plate.elev + 0.05;
    this.zTopNow = zTop;
    const roomA = this.room && this.room.key === key ? clamp((performance.now() - this.room.t0) / 600, 0, 1) : 0;
    const wallH = (2.5 - 1.9 * roomA) * easeOut(clamp((focusV - 0.25) / 0.75, 0, 1));
    const open = this.room && this.room.key === key ? this.room : null;
    const cells = open ? this.roomCache.cells.filter((c) => c.number !== open.number && !(open.hide && open.hide.has(c.number))) : this.roomCache.cells;
    const hot = this.hotRoom, hov = this.hover.room;
    const ai = (this.dark() ? AI_RGB_DARK : AI_RGB)[2];
    const fill = (c) => {
      const m = c.mark;
      if (m && m.me) return ai;
      if (hot && c.number === hot) return C.slabSel;
      if (m && m.listed) return hov === c.number ? C.slabHover : m.fits === false ? mix(C.roomB, C.roomOffered, 0.35) : C.roomOffered;
      if (hov === c.number) return C.slabHover;
      return c.type === "single" ? C.roomA : c.type === "double" || c.type === "suite" || c.type === "apartment" ? C.roomB : C.roomC;
    };
    const rk = `${tk}|${hot}|${hov}|${marks.size}`;
    layers.push(new D.SolidPolygonLayer({
      id: "rooms", data: cells, extruded: true, pickable: true,
      getPolygon: (c) => c.ll.map((p) => [p[0], p[1], zTop]), getElevation: Math.max(0.05, wallH),
      getFillColor: (c) => rgba(fill(c), Math.round(255 * clamp(focusV * 1.6 - 0.2, 0, 1))), material: this.dormMaterial,
      updateTriggers: { getFillColor: `${rk}|${Math.round(focusV * 30)}`, getPolygon: zTop.toFixed(2), getElevation: wallH.toFixed(2) },
    }));
    layers.push(new D.PathLayer({
      id: "room-edges", data: cells, getPath: (c) => c.ll.concat([c.ll[0]]).map((p) => [p[0], p[1], zTop + wallH + 0.04]),
      getColor: (c) => rgba(c.mark && (c.mark.listed || c.mark.me) ? C.dormEdge : C.roomEdge, Math.round(230 * clamp(focusV * 1.4 - 0.3, 0, 1))),
      getWidth: (c) => (c.mark && (c.mark.listed || c.mark.me) ? 2 : 1), widthUnits: "pixels", jointRounded: true,
      updateTriggers: { getColor: `${rk}|${Math.round(focusV * 30)}`, getPath: `${zTop.toFixed(2)}|${wallH.toFixed(2)}` },
    }));
    if (focusV > 0.6) {
      // numbers only where they matter: offered rooms, yours, and the one under the pointer
      const named = cells.filter((c) => (c.mark && (c.mark.listed || c.mark.me)) || c.number === hov || c.number === hot);
      layers.push(new D.TextLayer({
        id: "room-numbers", data: named, getPosition: (c) => [c.cll[0], c.cll[1], zTop + wallH + 0.3], getText: (c) => c.number,
        getSize: this.phone ? 10 : 12, sizeUnits: "pixels", getColor: (c) => (c.mark && c.mark.me ? [255, 255, 255, 255] : rgba(C.roomText, 235)),
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif", fontWeight: 600,
        characterSet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-", billboard: true,
        fontSettings: { sdf: true, fontSize: 64, buffer: 6 }, outlineWidth: 3, outlineColor: rgba(fill({ mark: null, type: "double" }), 230),
        parameters: { depthCompare: "always" },
        updateTriggers: { getColor: rk, getPosition: `${zTop.toFixed(2)}|${wallH.toFixed(2)}`, outlineColor: tk, getText: rk },
      }));
    }
    if (open) this.interiorLayers(layers, open);
    this.roomsNow = cells;
  }

  /** The furnished room you clicked into. */
  interiorLayers(layers, room) {
    // the floor can still be settling when the room opens; keep the furniture standing on it
    if (this.zTopNow != null && Math.abs(this.zTopNow - room.z) > 0.01) {
      room.f = furnish(room.cell, this.zTopNow, room.beds, toLL);
      room.z = this.zTopNow;
    }
    const C = this.colors, dk = this.dark();
    const a = clamp((performance.now() - room.t0) / 600, 0, 1);
    const ai = (dk ? AI_RGB_DARK : AI_RGB)[2];
    const wood = dk ? [118, 96, 84] : [204, 178, 146];
    const color = (d) => {
      if (d.kind === "wall") return rgba(C.roomA, Math.round(225 * a));
      if (d.kind === "floor") return rgba(mix(C.floorPlate, C.roomB, 0.5), Math.round(255 * a));
      if (d.kind === "window") return dk ? [150, 175, 255, Math.round(210 * a)] : [190, 214, 255, Math.round(230 * a)];
      const tint = d.role === "free" ? C.slabSel : d.role === "you" ? ai : null;
      if (d.kind === "pillow") return rgba(dk ? [228, 222, 240] : [255, 255, 255], Math.round(255 * a));
      if (d.kind === "bed") return rgba(tint || (dk ? [96, 86, 132] : [232, 226, 218]), Math.round(255 * a));
      if (d.kind === "desk") return rgba(tint ? mix(wood, tint, 0.45) : wood, Math.round(255 * a));
      return rgba(tint ? mix(C.roomC, tint, 0.35) : C.roomC, Math.round(255 * a)); // wardrobe
    };
    layers.push(new D.SolidPolygonLayer({
      id: "room-interior", data: room.f.parts, extruded: true, pickable: true,
      getPolygon: (d) => d.poly, getElevation: (d) => d.elev, getFillColor: color, material: this.dormMaterial,
      updateTriggers: { getFillColor: `${this.themeKey}|${Math.round(a * 20)}` },
    }));
    const pins = room.f.pins.map((p) => ({ ...p, ...room.beds[p.k] }));
    const gapPx = this.phone ? 40 : 54;
    const spread = (d) => (pins.length < 2 ? 0 : (d.k - (pins.length - 1) / 2) * gapPx);
    const withFace = pins.filter((p) => p.avatarUrl);
    if (withFace.length) layers.push(new D.IconLayer({
      id: "room-avatars", data: withFace, pickable: true, billboard: true,
      getPosition: (d) => d.pos, getIcon: (d) => ({ url: d.avatarUrl, width: 128, height: 128, id: d.personId }),
      getSize: this.phone ? 34 : 44, sizeUnits: "pixels", getColor: [255, 255, 255, Math.round(255 * a)],
      getPixelOffset: (d) => [spread(d), 0],
      parameters: { depthCompare: "always" }, updateTriggers: { getColor: Math.round(a * 20) },
    }));
    layers.push(new D.TextLayer({
      id: "room-pin-labels", data: pins.filter((p) => p.label), getPosition: (d) => d.pos, getText: (d) => d.label,
      getPixelOffset: (d) => [spread(d), d.avatarUrl ? (this.phone ? 28 : 34) : 0], getSize: this.phone ? 11 : 13, sizeUnits: "pixels",
      getColor: (d) => (d.role === "free" ? rgba(dk ? [16, 12, 32] : [255, 255, 255], Math.round(255 * a)) : rgba(C.roomText, Math.round(255 * a))),
      background: true, backgroundPadding: [8, 4, 8, 4],
      getBackgroundColor: (d) => (d.role === "free" ? rgba(C.slabSel, Math.round(240 * a)) : rgba(C.roomA, Math.round(235 * a))),
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif", fontWeight: 600,
      parameters: { depthCompare: "always" }, updateTriggers: { getColor: `${this.themeKey}|${Math.round(a * 20)}`, getBackgroundColor: `${this.themeKey}|${Math.round(a * 20)}` },
    }));
  }

  /** Per-loop color: its Apple system color, or null for the gradient (ai) loops. */
  threadStyle(t) {
    if (!t.style || t.styleKey !== this.themeKey) {
      const s = loopStyle(t.cycle, { plain: t.plain });
      t.style = s;
      t.styleKey = this.themeKey;
      t.rgb = s.ai ? (this.dark() ? AI_RGB_DARK : AI_RGB)[1] : loopRgb(t.cycle, this.dark(), { plain: t.plain }) || this.colors.thread;
      // a fixed color (rgb in the spec) overrides the loop palette
      if (t.rgbFix) { t.style = { ...s, ai: false }; t.rgb = t.rgbFix; }
    }
    return t.style;
  }
  dark() { return this.colors.ground[0] < 100; }

  /** Color of a loop at a point along it (u = 0..1). Gradient loops flow slowly. */
  loopColorAt(t, u, now) {
    const c = t.style.ai ? aiColorAt(u * 0.9 - (reducedMotion() ? 0 : (now - this.t0) / 5200), this.dark()) : t.rgb;
    if (!t.doneAt) return c;
    // confirmed: fade to green
    const k = clamp((now - t.doneAt) / 600, 0, 1);
    return c.map((v, i) => Math.round(v + (DONE_RGB[i] - v) * k));
  }

  threadLayers(layers, now) {
    const C = this.colors;
    const loops = [];
    const opens = [];
    const directs = [];
    const beadMap = new Map();
    const rm = reducedMotion();
    const tNow = now - this.t0;
    const ph = this.phone;
    const noDepth = { depthCompare: "always", depthWriteEnabled: false };
    for (const t of this.threads.values()) {
      if (!t.ok) continue;
      if (t.kind === "direct") { directs.push(t); continue; }
      this.threadStyle(t);
      if (t.kind === "open") { opens.push(t); continue; }
      const k = this.pullValue(t, now);
      if (k !== 1 || !t.pointsK || t.lastK !== k) { t.pointsK = k === 1 ? t.points : this.threadPoints(t, k); t.lastK = k; }
      // sprout: the whole loop grows up out of the ground while it draws on
      t.sproutS = t.sprout && !rm ? easeInOut(clamp((now - t.start) / t.sprout, 0, 1)) : 1;
      if (t.sproutS < 1) { const g = t.sproutS; t.pointsK = t.pointsK.map((q) => [q[0], q[1], q[2] * g]); t.lastK = NaN; }
      loops.push(t);
    }
    const hlThread = this.highlightSeg ? this.highlightSeg.threadId : null;
    // Solid-color loops are one path each. Gradient loops are cut into short pieces so each
    // piece can carry its own color (deck.gl paths take one color per path).
    const solid = [];
    const pieces = [];
    for (const t of loops) {
      const ts = t.frac.map((f) => t.start - this.t0 + f * t.dur);
      const strong = !t.dim;
      if (t.style.ai) {
        const P = t.pointsK;
        for (let i = 0; i + 1 < P.length; i += 2) {
          const j = Math.min(P.length - 1, i + 2);
          pieces.push({ t, path: P.slice(i, j + 1), ts: ts.slice(i, j + 1), u: t.frac[i], strong });
        }
      } else solid.push({ t, path: t.pointsK, ts, strong });
    }
    const big = 1e9;
    const W = ph ? 2.6 : 3.2;
    const alphaOf = (t) => (t.dim ? 46 : t.id === hlThread ? 110 : 255);
    const colorKey = `${this.themeKey}|${hlThread}|${loops.map((t) => (t.dim ? 1 : 0) + (t.doneAt ? `d${Math.round(clamp((now - t.doneAt) / 600, 0, 1) * 20)}` : "")).join("")}`;
    const aiKey = pieces.length && !rm ? Math.floor(now / 50) : 0;
    const trips = (id, data, getColor, getWidth, trigger, caps = true) => new D.TripsLayer({
      id, data, getPath: (d) => d.path, getTimestamps: (d) => d.ts,
      getColor, getWidth, widthUnits: "pixels", widthMinPixels: 1,
      capRounded: caps, jointRounded: true, billboard: true, parameters: noDepth,
      currentTime: tNow, trailLength: big, fadeTrail: false,
      updateTriggers: { getColor: trigger, getWidth: colorKey },
    });
    // soft outer glow, then the line itself
    const solidStrong = solid.filter((d) => d.strong);
    const piecesStrong = pieces.filter((d) => d.strong);
    // every loop gets the same weight: a 3px line with a soft glow; only its color differs
    if (solidStrong.length) layers.push(trips("thread-glow", solidStrong, (d) => rgba(this.loopColorAt(d.t, 0, now), d.t.thin ? 26 : 52), (d) => (d.t.thin ? 5 : ph ? 7 : 9), colorKey));
    if (piecesStrong.length) layers.push(trips("thread-ai-glow", piecesStrong, (d) => rgba(this.loopColorAt(d.t, d.u, now), 52), ph ? 7 : 9, `${colorKey}|${aiKey}`, false));
    if (solid.length) layers.push(trips("thread", solid, (d) => rgba(this.loopColorAt(d.t, 0, now), alphaOf(d.t)), (d) => (d.t.dim || d.t.thin ? 2 : W), colorKey));
    if (pieces.length) layers.push(trips("thread-ai", pieces, (d) => rgba(this.loopColorAt(d.t, d.u, now), alphaOf(d.t)), (d) => (d.t.dim ? 2 : W), `${colorKey}|${aiKey}`, false));
    if (!rm) {
      const tint = (c) => [Math.round(c[0] + (255 - c[0]) * 0.6), Math.round(c[1] + (255 - c[1]) * 0.6), Math.round(c[2] + (255 - c[2]) * 0.6), 255];
      const pulseData = loops.filter((t) => t.focus && !t.dim && now > t.start + t.dur).map((t) => ({ path: t.pointsK, ts: t.frac.map((f) => f * PERIOD), c: tint(t.style.ai ? (this.dark() ? AI_RGB_DARK : AI_RGB)[2] : t.rgb) }));
      if (pulseData.length) {
        layers.push(new D.TripsLayer({
          id: "thread-pulse", data: pulseData, getPath: (d) => d.path, getTimestamps: (d) => d.ts,
          getColor: (d) => d.c, getWidth: ph ? 3.6 : 4.4, widthUnits: "pixels", capRounded: true, jointRounded: true, billboard: true,
          parameters: noDepth, currentTime: (now - this.t0) % PERIOD, trailLength: PERIOD * 0.14, fadeTrail: true,
          updateTriggers: { getColor: `${this.themeKey}|${colorKey}` },
        }));
      }
    }
    // open (waiting) chains: a faint continuous line with evenly spaced dots marching along it
    // (smooth at any frame rate, unlike a dash pattern)
    if (opens.length) {
      const faint = [];
      const dots = [];
      const phase = rm ? 0 : ((now - this.t0) / 1400) % 1;
      for (const t of opens) {
        const P = t.points, F = t.frac;
        for (let i = 0; i + 1 < P.length; i += 2) faint.push({ t, path: P.slice(i, Math.min(P.length, i + 3)), u: F[i] });
        const n = Math.max(12, Math.round(t.total / (ph ? 34 : 26)));
        let j = 0;
        for (let q = 0; q < n; q++) {
          const u = (q + phase) / n;
          while (j < F.length - 2 && F[j + 1] < u) j++;
          const f0 = F[j], f1 = F[j + 1] || 1;
          const w = f1 > f0 ? clamp((u - f0) / (f1 - f0), 0, 1) : 0;
          const A = P[j], B = P[Math.min(P.length - 1, j + 1)];
          dots.push({ pos: [A[0] + (B[0] - A[0]) * w, A[1] + (B[1] - A[1]) * w, A[2] + (B[2] - A[2]) * w], c: this.loopColorAt(t, u, now) });
        }
      }
      layers.push(new D.PathLayer({
        id: "thread-open", data: faint, getPath: (d) => d.path,
        getColor: (d) => rgba(this.loopColorAt(d.t, d.u, now), 70), getWidth: ph ? 2 : 2.4, widthUnits: "pixels", billboard: true,
        capRounded: false, jointRounded: true, parameters: noDepth,
        updateTriggers: { getColor: `${this.themeKey}|${aiKey}` },
      }));
      layers.push(new D.ScatterplotLayer({
        id: "thread-open-dots", data: dots, getPosition: (d) => d.pos, getRadius: ph ? 2.6 : 3.1, radiusUnits: "pixels", billboard: true,
        getFillColor: (d) => rgba(d.c, 235), parameters: noDepth,
        updateTriggers: { getPosition: Math.round(now / 16), getFillColor: `${this.themeKey}|${aiKey}` },
      }));
    }
    // highlighted segment (BU swap step): the loop's own color, thicker
    if (this.highlightSeg) {
      const t = this.threads.get(this.highlightSeg.threadId);
      if (t && t.ok) {
        this.threadStyle(t);
        const per = this.samples();
        const i = this.highlightSeg.seg;
        const pts = t.pointsK || t.points;
        const path = pts.slice(i * per, (i + 1) * per + 1);
        layers.push(new D.PathLayer({
          id: "thread-hl-glow", data: [{ path }], getPath: (d) => d.path, getColor: rgba(t.rgb, 70), getWidth: ph ? 12 : 15,
          widthUnits: "pixels", capRounded: true, jointRounded: true, billboard: true, parameters: noDepth,
          updateTriggers: { getColor: this.themeKey },
        }));
        layers.push(new D.PathLayer({
          id: "thread-hl", data: [{ path }], getPath: (d) => d.path, getColor: t.rgb, getWidth: ph ? 4.5 : 5.5,
          widthUnits: "pixels", capRounded: true, jointRounded: true, billboard: true, parameters: noDepth,
          updateTriggers: { getColor: this.themeKey },
        }));
        if (this.carrier) {
          const u = rm ? 1 : easeInOut(clamp((now - this.carrier.t0) / 1000, 0, 1));
          const p = path[Math.min(path.length - 1, Math.round(u * (path.length - 1)))];
          this.carrierPos = p;
        }
      }
    }
    // direct swaps: neutral ink arcs, both directions (the old way)
    if (directs.length) {
      const arcData = [];
      directs.forEach((t) => {
        const a = t.nodes[0], b = t.nodes[1];
        const alpha = rm ? 1 : clamp((now - t.start) / 500, 0, 1);
        const k = t.soft ? 0.62 : 1;
        // sprout: the pair's arcs grow up out of the ground
        const g = t.sprout && !rm ? easeInOut(clamp((now - t.start) / t.sprout, 0, 1)) : 1;
        const al = t.sprout ? Math.min(1, alpha * 4) : alpha;
        arcData.push({ s: [a.ll[0], a.ll[1], a.z * g], e: [b.ll[0], b.ll[1], b.z * g], tilt: 18, a: al * k, h: 0.7 * g, dim: t.dim });
        arcData.push({ s: [b.ll[0], b.ll[1], b.z * g], e: [a.ll[0], a.ll[1], a.z * g], tilt: 18, a: al * k, h: 0.7 * g, dim: t.dim });
      });
      const fading = directs.some((t) => now - t.start < Math.max(520, t.sprout || 0));
      layers.push(new D.ArcLayer({
        id: "direct-arcs", data: arcData, getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.e,
        getSourceColor: (d) => rgba(C.direct, Math.round((d.dim ? 50 : 210) * d.a)), getTargetColor: (d) => rgba(C.direct, Math.round((d.dim ? 50 : 210) * d.a)),
        getWidth: (d) => (d.dim ? 1.5 : ph ? 2.5 : 3), widthUnits: "pixels", getHeight: (d) => d.h, getTilt: (d) => d.tilt,
        updateTriggers: { getSourceColor: `${this.themeKey}|${fading ? Math.round(now / 16) : 0}`, getTargetColor: `${this.themeKey}|${fading ? Math.round(now / 16) : 0}` },
      }));
      directs.forEach((t) => {
        const g = t.sprout && !rm ? easeInOut(clamp((now - t.start) / t.sprout, 0, 1)) : 1;
        t.nodes.forEach((n, i) => beadMap.set(t.cycle[i], { n, kind: "direct", dim: t.dim, dz: -(1 - g) * n.z }));
      });
    }

    // endpoints: one small dot per student, in the loop's color; waiting students are small gray dots
    const drop = (delay) => {
      if (rm || delay == null) return 0;
      const u = clamp((now - this.beadT0 - delay) / 420, 0, 1);
      return (1 - easeBack(u)) * 60 * (u < 1 ? 1 : 0) + (u === 0 ? 60 : 0);
    };
    for (const b of this.beads) {
      const n = this.positions.get(b.id);
      if (!n) continue;
      if (!beadMap.has(b.id)) beadMap.set(b.id, { n, kind: b.kind || "wait", dim: b.dim, dz: drop(b.drop), hidden: b.drop != null && !rm && now - this.beadT0 < b.drop });
    }
    for (const t of loops) {
      t.cycle.forEach((id, i) => {
        const n = t.nodes[i];
        const reached = now >= t.start + t.nodeFrac[i] * t.dur;
        const since = now - (t.start + t.nodeFrac[i] * t.dur);
        const pop = !rm && since > 0 && since < 300 ? 1 + 0.6 * Math.sin((since / 300) * Math.PI) : 1;
        const prev = beadMap.get(id);
        // a strong loop wins over a faint one for the same student
        if (prev && prev.kind === "loop" && !prev.dim && t.dim) return;
        const dz = -(1 - (t.sproutS == null ? 1 : t.sproutS)) * n.z;
        if (reached) beadMap.set(id, { n, kind: "loop", you: id === this.meId, dim: t.dim, pop, dz, rgb: this.loopColorAt(t, t.nodeFrac[i], now) });
        else if (!prev) beadMap.set(id, { n, kind: "wait", dim: t.dim });
      });
    }
    for (const t of opens) {
      t.cycle.forEach((id, i) => { if (id !== t.missing) beadMap.set(id, { n: t.nodes[i], kind: "loop", rgb: this.loopColorAt(t, t.frac[i * this.samples()] || 0, now) }); });
    }
    const beads = [...beadMap.values()].filter((b) => !b.hidden);
    const fill = (b) => {
      if (b.kind === "loop") return rgba(b.rgb, b.dim ? 120 : 255);
      if (b.kind === "direct") return rgba(C.beadDirect, b.dim ? 90 : 255);
      return rgba(C.bead, b.dim ? 120 : 245);
    };
    const radius = (b) => {
      const base = b.kind === "loop" && !b.dim ? (ph ? 4.2 : 4.8) : b.dim ? (ph ? 2.6 : 3) : (ph ? 4.2 : 5.4);
      return base * (b.pop || 1) * (b.you ? 1.2 : 1) * (this.beadScale || 1);
    };
    // students still waiting get a soft glow so they read at a glance on the dark map
    const glowing = this.dark() ? beads.filter((b) => b.kind === "wait" && !b.dim) : [];
    if (glowing.length) layers.push(new D.ScatterplotLayer({
      id: "bead-glow", data: glowing, getPosition: (b) => [b.n.ll[0], b.n.ll[1], b.n.z + (b.dz || 0)],
      getRadius: ph ? 10 : 14, radiusUnits: "pixels", billboard: true, getFillColor: rgba(C.bead, 95), parameters: noDepth,
      updateTriggers: { getPosition: Math.round(now / 16), getFillColor: this.themeKey },
    }));
    if (beads.length) layers.push(new D.ScatterplotLayer({
      id: "beads", data: beads, getPosition: (b) => [b.n.ll[0], b.n.ll[1], b.n.z + (b.dz || 0)],
      getRadius: radius, radiusUnits: "pixels", billboard: true,
      stroked: true, getLineColor: (b) => (b.dim ? [0, 0, 0, 0] : C.beadRing), lineWidthUnits: "pixels", getLineWidth: 1.5,
      getFillColor: fill, parameters: noDepth,
      updateTriggers: { getPosition: Math.round(now / 16), getRadius: Math.round(now / 16), getFillColor: `${this.themeKey}|${Math.round(now / 50)}`, getLineColor: this.themeKey },
    }));
  }

  // ---------- picking ----------
  handleHover(info) {
    const o = info && info.object;
    let dormId = null, floor = null;
    if (info && info.layer && info.layer.id === "dorms" && o) dormId = o.dormId;
    if (info && info.layer && info.layer.id === "slabs" && o) floor = o.floor;
    const room = info && info.layer && info.layer.id === "rooms" && o ? o.number : null;
    if (dormId !== this.hover.dormId || floor !== this.hover.floor || room !== this.hover.room) {
      this.hover.dormId = dormId;
      this.hover.floor = floor;
      this.hover.room = room;
      this.updateLabelClasses();
      this.kick();
    }
    if (this.cb.onHover) this.cb.onHover({ dormId, floor, room: room ? o : null, x: info && info.x, y: info && info.y });
  }

  handleClick(info) {
    const o = info && info.object;
    this.orbit = false;
    if (info && info.layer && (info.layer.id === "room-avatars" || info.layer.id === "room-interior") && o) {
      if (o.personId && o.role !== "free" && this.cb.onPerson) this.cb.onPerson(o.personId);
      return;
    }
    if (info && info.layer && info.layer.id === "rooms" && o) {
      if (o.mark && o.mark.listingId && this.cb.onRoom) this.cb.onRoom(o.mark.listingId, o.number);
      else this.openRoom(o.number, Array.from({ length: { single: 1, double: 2, triple: 3, quad: 4 }[o.type] || 2 }, () => ({ role: "empty" })));
      return;
    }
    if (this.room) { this.closeRoom(); return; }
    if (info && info.layer && info.layer.id === "slabs" && o) { this.cb.onFloor && this.cb.onFloor(o.floor); return; }
    if (info && info.layer && info.layer.id === "dorms" && o) {
      const d = dormById.get(o.dormId);
      const towerId = d && d.towers.length ? o.towerId : null;
      this.cb.onDorm && this.cb.onDorm(o.dormId, towerId);
      return;
    }
    this.cb.onBackground && this.cb.onBackground();
  }

  // ---------- HTML overlay ----------
  buildOverlay() {
    const ov = this.overlay;
    ov.innerHTML = "";
    this.labels = new Map();
    for (const d of DORMS) {
      const el = document.createElement("button");
      el.className = "lbl-dorm";
      el.type = "button";
      el.innerHTML = `<span class="t"></span><span class="n zero">0</span>`;
      el.querySelector(".t").textContent = d.short;
      el.addEventListener("click", (e) => { e.stopPropagation(); this.orbit = false; this.cb.onDorm && this.cb.onDorm(d.id, null); });
      el.addEventListener("pointerenter", () => this.hoverDorm(d.id));
      el.addEventListener("pointerleave", () => this.hoverDorm(null));
      ov.appendChild(el);
      this.labels.set(d.id, { el, badge: el.querySelector(".n"), pos: [d.anchor[0], d.anchor[1], d.anchorHeight + 8], w: 0, h: 0, dormId: d.id });
    }
    this.areaLabels = CAMPUS.labels.map((l) => {
      const el = document.createElement("div");
      el.className = `lbl-area ${l.kind}`;
      el.textContent = l.text;
      ov.insertBefore(el, ov.firstChild);
      return { el, pos: [l.position[0], l.position[1], 0], kind: l.kind, w: 0, h: 0 };
    });
    this.leaderEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.leaderEl.setAttribute("class", "leaders");
    ov.appendChild(this.leaderEl);
    this.pinLayer = document.createElement("div");
    ov.appendChild(this.pinLayer);
    this.pins = new Map();
    this.floorTags = new Map();
    this.floorTagLayer = document.createElement("div");
    ov.appendChild(this.floorTagLayer);
    this.ghostEl = document.createElement("div");
    this.ghostEl.className = "ghost-bead";
    this.ghostEl.innerHTML = "<span>?</span>";
    this.ghostEl.style.display = "none";
    ov.appendChild(this.ghostEl);
    this.carrierEl = document.createElement("div");
    this.carrierEl.className = "carrier";
    this.carrierEl.innerHTML = "<span></span>";
    this.carrierEl.style.display = "none";
    ov.appendChild(this.carrierEl);
  }

  /** One cluster pill per campus area ("West Campus · 4 halls" + total rooms), made on first use. */
  clusterEl(area, ids) {
    if (!this.clusters) this.clusters = new Map();
    let c = this.clusters.get(area);
    if (!c) {
      const el = document.createElement("button");
      el.className = "lbl-dorm lbl-cluster clustered";
      el.type = "button";
      el.innerHTML = `<span class="t"></span><span class="k"></span><span class="n">0</span>`;
      el.querySelector(".t").textContent = area;
      el.querySelector(".k").textContent = `${ids.length} halls`;
      el.addEventListener("click", (e) => { e.stopPropagation(); this.orbit = false; this.flyToCluster(area); });
      const lon = ids.reduce((s, id) => s + dormById.get(id).anchor[0], 0) / ids.length;
      const lat = ids.reduce((s, id) => s + dormById.get(id).anchor[1], 0) / ids.length;
      const z = Math.max(...ids.map((id) => dormById.get(id).anchorHeight)) + 8;
      this.overlay.insertBefore(el, this.leaderEl);
      c = { el, pos: [lon, lat, z], w: 0, h: 0, area, ids };
      this.clusters.set(area, c);
    }
    const n = ids.reduce((s, id) => s + (this.badges[id] || 0), 0);
    const nEl = c.el.querySelector(".n");
    if (nEl.textContent !== String(n)) { nEl.textContent = String(n); c.w = 0; }
    c.el.setAttribute("aria-label", `${area}, ${ids.length} halls, ${n} rooms offered. Zoom in`);
    return c;
  }

  /** Tap a cluster pill: fly in until its halls have room for their own labels. */
  flyToCluster(area) {
    const ids = AREAS.get(area) || [];
    const pts = ids.map((id) => { const d = dormById.get(id); return { m: toM(d.anchor), ll: d.anchor, z: d.anchorHeight }; });
    if (!pts.length) return;
    const v = this.fitView(null, pts, { pitch: this.phone ? 56 : 58, maxZoom: this.phone ? 16.9 : 16.6, loop: false, bearing: this.vs.bearing, padTop: this.phone ? 70 : 90, padX: this.phone ? 70 : 110 });
    this.setView(v, 1300, "swoop");
  }

  /** Where a dorm's label (or its cluster pill) is on screen, for the shared-element move into the panel. */
  labelRect(dormId) {
    const it = this.labels && this.labels.get(dormId);
    if (!it) return null;
    let el = it.el;
    if (el.classList.contains("clustered") && this.clusters) {
      const c = this.clusters.get(dormById.get(dormId).area);
      if (c) el = c.el;
    }
    if (el.classList.contains("off") || el.classList.contains("fade") || el.classList.contains("clustered")) return null;
    const r = el.getBoundingClientRect();
    return r.width ? r : null;
  }

  updateLabelClasses() {
    for (const [id, it] of this.labels) {
      it.el.classList.toggle("sel", this.sel.dormId === id);
      it.el.classList.toggle("fade", !!this.sel.dormId && this.sel.dormId !== id || (this.dimAll && !this.sel.dormId));
      it.el.classList.toggle("hover", this.hover.dormId === id);
      if (this.sel.dormId === id) it.el.style.opacity = this.explode ? "0" : "";
      else it.el.style.opacity = "";
    }
    for (const a of this.areaLabels) a.el.classList.toggle("hide", !!this.sel.dormId);
  }

  setLabelsDimmed(on) { this.dimAll = on; this.updateLabelClasses(); this.kick(); }

  syncPins() {
    const want = new Map();
    for (const t of this.threads.values()) {
      if (!t.pins || !t.ok) continue;
      const st = t.kind === "direct" ? { cls: "loop-pair" } : this.threadStyle(t);
      t.cycle.forEach((id) => {
        if (id === t.missing) return;
        const info = this.resolve(id);
        if (info && info.person) want.set(`L:${id}`, { listingId: id, person: info.person, you: id === this.meId, label: info.person.first, cls: st.cls });
      });
    }
    for (const p of this.extraPins) want.set(`P:${p.person.id}`, { listingId: p.nearListing, person: p.person, offset: p.offset || [0, -46], label: p.label || p.person.first, staying: p.staying !== false });
    for (const [k, it] of this.pins) if (!want.has(k)) { it.el.remove(); this.pins.delete(k); }
    for (const [k, w] of want) {
      const ringCls = `ring ${w.cls || "loop-none"}${w.you ? " you" : ""}`;
      if (this.pins.has(k)) {
        const it = Object.assign(this.pins.get(k), w);
        const r = it.el.firstElementChild;
        if (r.className !== ringCls) r.className = ringCls;
        it.el.classList.toggle("staying", !!w.staying);
        const tg = it.el.querySelector(".tag"), txt = `${w.label}${w.staying ? " (staying)" : ""}`;
        if (tg && tg.textContent !== txt) { tg.textContent = txt; it.w = 0; }
        continue;
      }
      const el = document.createElement("div");
      el.className = `pin pop${w.staying ? " staying" : ""}`;
      const size = this.phone ? 26 : 34;
      el.innerHTML = `<span class="${ringCls}">${avatarSvg(w.person, { size })}</span><span class="tag">${w.label}${w.staying ? " (staying)" : ""}</span>`;
      this.pinLayer.appendChild(el);
      this.pins.set(k, { ...w, el, size });
    }
    this.kick();
  }

  updateOverlay() {
    const vp = this.deck.getViewports && this.deck.getViewports()[0];
    if (!vp) return;
    const W = vp.width, H = vp.height;
    const place = (el, x, y, w, h, ax = 0.5, ay = 1) => {
      el.style.transform = `translate3d(${Math.round(x - w * ax)}px, ${Math.round(y - h * ay)}px, 0)`;
    };
    const proj = (p) => { try { return vp.project(p); } catch (e) { return [-9999, -9999]; } };
    // dorm labels: crowded halls of one area collapse into a cluster pill (Apple Maps style),
    // the rest avoid each other, and no label is ever cut off by the panel or the screen edge
    const placed = [];
    // things on screen labels must not hide under (the demo counter, the map buttons)
    const obstacles = [];
    if (!this.ctrlEl) this.ctrlEl = document.getElementById("map-ctrls");
    for (const el of [...(this.obstacleEls || []), this.ctrlEl]) {
      if (!el || !el.offsetParent || getComputedStyle(el).opacity === "0") continue;
      const r = el.getBoundingClientRect(), c = this.container.getBoundingClientRect();
      if (r.width) obstacles.push({ l: r.left - c.left - 4, r: r.right - c.left + 4, t: r.top - c.top - 4, b: r.bottom - c.top + 4 });
    }
    if (this.topMin == null) { const tb = document.querySelector(".topbar"); this.topMin = tb ? tb.getBoundingClientRect().bottom + 4 : 56; }
    const topMin = this.topMin;
    let fa = null;
    try { fa = this.freeArea(); } catch (e) { fa = null; }
    this.tagMinX = this.phone ? 0 : fa ? fa.left : 0;
    const minX = this.phone ? 6 : (fa ? fa.left - 10 : 6);
    const maxX = W - 6;
    const maxY = this.phone && fa ? fa.bottom - 4 : H - 6;
    // which areas are clustered right now (with a little hysteresis so labels do not flicker)
    const proj0 = new Map([...this.labels.values()].map((it) => [it.dormId, proj(it.pos)]));
    const clustered = new Set();
    if (!this.sel.dormId && !this.dimAll) {
      for (const [area, ids] of AREAS) {
        if (ids.length < 2) continue;
        const pts = ids.map((id) => proj0.get(id));
        let spread = 0;
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) spread = Math.max(spread, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
        const lim = (this.phone ? 105 : 120) * (this.clusterOn && this.clusterOn.has(area) ? 1.25 : 1);
        if (spread < lim) clustered.add(area);
      }
    }
    for (const [area] of AREAS) {
      const was = this.clusterOn && this.clusterOn.has(area);
      if (was && !clustered.has(area)) this.splitT = { area, t: performance.now() };
    }
    this.clusterOn = clustered;
    const entries = [];
    for (const it of this.labels.values()) {
      const inCl = clustered.has(dormById.get(it.dormId).area);
      it.el.classList.toggle("clustered", inCl);
      const splitting = this.splitT && performance.now() - this.splitT.t < 450 && dormById.get(it.dormId).area === this.splitT.area;
      it.el.classList.toggle("split", !!splitting);
      if (!inCl) entries.push({ it, xy: proj0.get(it.dormId), prio: (this.sel.dormId === it.dormId ? 1000 : 0) + (this.badges[it.dormId] || 0) });
    }
    for (const [area, ids] of AREAS) {
      const c = this.clusterEl(area, ids);
      if (!c) continue;
      c.el.classList.toggle("clustered", !clustered.has(area));
      if (clustered.has(area)) entries.push({ it: c, xy: proj(c.pos), prio: 500 });
    }
    entries.sort((a, b) => b.prio - a.prio);
    for (const { it, xy } of entries) {
      if (!it.w) { it.w = it.el.offsetWidth || 80; it.h = it.el.offsetHeight || 30; }
      const ax0 = xy[0];
      let x = xy[0], y = xy[1] - 8;
      // the building itself must be in the open part of the map
      let ok = ax0 >= minX && ax0 <= maxX && y <= maxY && y - it.h >= topMin - 10 && y > -60;
      let side = false;
      if (ok) {
        const gapX = this.phone ? 3 : 4, gapY = this.phone ? 2 : 3;
        const all = [...placed, ...obstacles];
        const hitOf = (r) => all.find((p) => !(r.r + gapX < p.l || r.l - gapX > p.r || r.b + gapY < p.t || r.t - gapY > p.b));
        const fit = (cx) => clamp(cx, minX + it.w / 2, maxX - it.w / 2);
        const rectAt = (cx, by) => ({ l: cx - it.w / 2, r: cx + it.w / 2, t: by - it.h, b: by });
        x = fit(x);
        let rect = rectAt(x, y);
        if (hitOf(rect)) {
          // first try beside the building (no pointer), then stack upward
          const sideY = y + it.h / 2 + 4;
          const opts = [[ax0 + it.w / 2 + 12, sideY], [ax0 - it.w / 2 - 12, sideY]];
          const free = opts.find(([cx, by]) => cx - it.w / 2 >= minX && cx + it.w / 2 <= maxX && by <= maxY && !hitOf(rectAt(cx, by)));
          if (free) { x = free[0]; y = free[1]; rect = rectAt(x, y); side = true; }
        }
        for (let tries = 0; !side && tries < 5; tries++) {
          const hit = hitOf(rect);
          if (!hit) break;
          y = hit.t - 4;
          rect = rectAt(x, y);
          if (tries === 4 || y - it.h < topMin || xy[1] - y > 120) { ok = false; break; }
        }
        if (ok) placed.push(rect);
      }
      // the pointer still points at the building when the pill had to slide sideways
      const ax = clamp(ax0 - x, -(it.w / 2 - 12), it.w / 2 - 12);
      if (!side && Math.abs(ax0 - x) > it.w / 2 - 12) side = true;
      it.el.style.setProperty("--ax", `${Math.round(ax)}px`);
      it.el.classList.toggle("off", !ok);
      it.el.classList.toggle("side", side);
      if (ok) place(it.el, x, y, it.w, it.h);
    }
    // avatar pins: spread apart when they crowd, with a thin leader line back to the bead
    const arr = [];
    const nowO = performance.now();
    for (const p of this.pins.values()) {
      const n = this.moverPos(p.listingId, nowO) || this.positions.get(p.listingId);
      if (!n) { p.el.classList.add("off"); continue; }
      const [bx, by] = proj([n.ll[0], n.ll[1], n.z]);
      const off = p.offset || [0, 0];
      if (!p.w) { const tg = p.el.querySelector(".tag"); p.w = Math.max(p.size + 4, (tg && tg.offsetWidth) || 0); }
      arr.push({ p, bx, by, x: bx + off[0], y: by - p.size / 2 - 18 + off[1] });
    }
    arr.sort((a, b) => a.x - b.x || a.y - b.y);
    for (let it = 0; it < 24; it++) {
      let moved = false;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i], b = arr[j];
          const need = (a.p.w + b.p.w) / 2 + 6;
          const vNeed = (a.p.size + b.p.size) / 2 + 22;
          const dx = b.x - a.x, dy = b.y - a.y;
          if (Math.abs(dx) < need && Math.abs(dy) < vNeed) {
            const push = (need - Math.abs(dx)) / 2 + 0.5;
            const sg = dx > 0 || (dx === 0 && i < j) ? 1 : -1;
            a.x -= push * sg; b.x += push * sg; moved = true;
          }
        }
      }
      if (!moved) break;
    }
    const lines = [];
    for (const a of arr) {
      const p = a.p;
      const tf = `translate3d(${Math.round(a.x - p.size / 2 - 2)}px, ${Math.round(a.y - p.size / 2 - 2)}px, 0)`;
      p.el.style.setProperty("--tf", tf);
      p.el.style.transform = tf;
      const hide = a.bx < -60 || a.bx > W + 60 || a.by < -60 || a.by > H + 80;
      p.el.classList.toggle("off", hide);
      if (!hide && Math.hypot(a.x - a.bx, a.y + p.size / 2 + 2 - a.by) > p.size / 2 + 20) {
        lines.push(`<line class="${p.cls || ""}" x1="${a.bx.toFixed(1)}" y1="${a.by.toFixed(1)}" x2="${a.x.toFixed(1)}" y2="${(a.y + p.size / 2).toFixed(1)}"/>`);
      }
    }
    // carrier tag ("Holding Warren C 1505"): never on top of an avatar or its name; slides clear with a leader line
    if (this.carrier && this.carrierPos) {
      const [px, py] = proj(this.carrierPos);
      const cw = this.carrierEl.offsetWidth || 120, ch = this.carrierEl.offsetHeight || 22;
      const blocks = arr.map((a) => ({ l: a.x - a.p.w / 2 - 4, r: a.x + a.p.w / 2 + 4, t: a.y - a.p.size / 2 - 4, b: a.y + a.p.size / 2 + 24 }));
      const hit = (r) => blocks.find((b) => !(r.r < b.l || r.l > b.r || r.b < b.t || r.t > b.b));
      const at = (cx, by) => ({ l: cx - cw / 2, r: cx + cw / 2, t: by - ch, b: by });
      const cands = [[px, py - 12]];
      for (const dy of [44, 76, 108]) cands.push([px, py - dy], [px - cw / 2 - 26, py - dy + 22], [px + cw / 2 + 26, py - dy + 22]);
      let best = cands.find(([cx, by]) => !hit(at(cx, by)) && cx - cw / 2 > (this.tagMinX || 0) + 4 && cx + cw / 2 < W - 4) || cands[0];
      const [cx, by] = best;
      place(this.carrierEl, cx, by, cw, ch, 0.5, 1);
      if (Math.hypot(cx - px, by - py) > 16) {
        const ex = clamp(px, cx - cw / 2 + 8, cx + cw / 2 - 8);
        lines.push(`<line class="carrier-lead" x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${by.toFixed(1)}"/>`);
      }
    }
    const lk = lines.join("");
    if (lk !== this.leaderKey) { this.leaderKey = lk; this.leaderEl.innerHTML = lk; }
    // area names (West Campus, Kenmore Sq) give way to dorm labels and avatar pins
    for (const a of arr) {
      const p = a.p;
      placed.push({ l: a.x - p.w / 2 - 4, r: a.x + p.w / 2 + 4, t: a.y - p.size / 2 - 4, b: a.y + p.size / 2 + 22 });
    }
    const z = this.vs.zoom || 15;
    for (const a of this.areaLabels) {
      if (!a.w) { a.w = a.el.offsetWidth || 60; a.h = a.el.offsetHeight || 14; }
      const [x, y] = proj(a.pos);
      const show = x > -50 && x < W + 50 && y > 40 && y < H + 20 && (a.kind !== "street" || z > 15.2) && z < 17.6;
      const clash = show && placed.some((p) => !(x + a.w / 2 < p.l || x - a.w / 2 > p.r || y + a.h / 2 < p.t || y - a.h / 2 > p.b));
      a.el.classList.toggle("off", !show || clash);
      if (show) place(a.el, x, y, a.w, a.h, 0.5, 0.5);
    }
    // ghost bead for an open chain
    const open = [...this.threads.values()].find((t) => t.kind === "open" && t.missing && t.ok);
    if (open) {
      const n = this.positions.get(open.missing);
      const [x, y] = proj([n.ll[0], n.ll[1], n.z]);
      this.ghostEl.style.display = "";
      place(this.ghostEl, x, y, 34, 34, 0.5, 0.5);
    } else this.ghostEl.style.display = "none";
    // floor tags beside exploded slabs (never under the side panel)
    this.updateFloorTags(vp, proj);
  }

  setFloorsWithListings(set, fit) { this.floorsWithListings = set; this.floorsThatFit = fit || set; this.kick(); }

  updateFloorTags(vp, proj) {
    const ex = this.explode;
    const want = new Set();
    if (ex && this.slabsNow && ex.dir > 0) {
      const g = ex.group;
      const has = this.floorsWithListings || new Set();
      const ff = this.floorAnim && this.floorAnim.dir > 0 ? this.floorAnim.floor : null;
      const byFloor = new Map();
      for (const s of this.slabsNow) {
        if (s.p < 0.5) continue;
        let best = null;
        for (const pt of s.poly) {
          const xy = proj([pt[0], pt[1], pt[2] + s.elev / 2]);
          if (!best || xy[0] < best[0]) best = xy;
        }
        const cur = byFloor.get(s.floor);
        if (!cur || best[0] < cur[0]) byFloor.set(s.floor, best);
      }
      const [flo, fhi] = g.floors;
      const minX = this.tagMinX || 0;
      const shownY = [];
      const order = [...byFloor.entries()].sort((A, B) => (has.has(`${g.key}|${B[0]}`) - has.has(`${g.key}|${A[0]}`)) || (B[0] === flo) - (A[0] === flo) || B[0] - A[0]);
      for (const [f, xy] of order) {
        if (ff != null && f !== ff) continue;
        if (xy[0] - 26 < minX) continue;
        if (this.phone && ff == null && f !== flo && f !== fhi && !has.has(`${g.key}|${f}`)) continue;
        if (this.phone && ff == null) {
          if (shownY.some((y) => Math.abs(y - xy[1]) < 14)) continue;
          shownY.push(xy[1]);
        }
        want.add(f);
        let it = this.floorTags.get(f);
        if (!it) {
          const el = document.createElement("div");
          el.className = "floor-tag";
          el.textContent = String(f);
          this.floorTagLayer.appendChild(el);
          it = { el };
          this.floorTags.set(f, it);
        }
        it.el.classList.toggle("has", has.has(`${g.key}|${f}`));
        it.el.classList.toggle("hot", this.hover.floor === f || ff === f);
        it.el.style.transform = `translate3d(${Math.round(xy[0] - 26)}px, ${Math.round(xy[1] - 7)}px, 0)`;
      }
    }
    for (const [f, it] of this.floorTags) if (!want.has(f)) { it.el.remove(); this.floorTags.delete(f); }
  }

  // ---------- theme ----------
  setTheme() {
    this.colors = sceneColors();
    this.themeKey++;
    this.lighting = this.makeLighting();
    this.deck.setProps({ effects: [this.lighting] });
    this.kick();
  }

  resize() { this.kick(); }
}

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGL2RenderingContext && c.getContext("webgl2"));
  } catch (e) { return false; }
}
