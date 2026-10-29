// Scene colors for the 3D map and theme handling. Palette v4 (Continuum Technologies): warm cream
// and purple #604C9C by day; deep purple-black #100C20 at night, where the dorms glow lavender-white.

export const SCENE = {
  light: {
    ground: [239, 234, 227],
    water: [204, 198, 230],
    waterEdge: [180, 170, 218],
    green: [219, 225, 205],
    road: [252, 250, 246],
    roadEdge: [228, 221, 212],
    path: [248, 245, 240],
    rail: [196, 190, 186],
    building: [229, 223, 215],
    buildingDim: [234, 229, 222],
    dorm: [255, 253, 250],
    dormHover: [236, 231, 248],
    dormSelected: [228, 221, 246],
    dormDim: [242, 238, 232],
    dormEdge: [96, 76, 156],
    slab: [255, 253, 250],
    slabHas: [239, 234, 248],
    slabHover: [214, 204, 240],
    slabSel: [96, 76, 156],
    thread: [96, 76, 156],
    threadDim: [96, 76, 156, 38],
    threadGlow: [96, 76, 156, 52],
    pulse: [255, 255, 255],
    direct: [58, 55, 66, 220],
    bead: [150, 144, 160],
    beadDirect: [58, 55, 66],
    beadLoop: [96, 76, 156],
    beadRing: [255, 253, 250],
    highlight: [96, 76, 156],
    grid: [143, 127, 247],
    floorPlate: [234, 229, 221],
    roomA: [255, 253, 250],
    roomB: [248, 244, 238],
    roomC: [239, 234, 227],
    roomOffered: [226, 218, 248],
    roomEdge: [196, 188, 180],
    roomText: [58, 55, 66],
  },
  dark: {
    ground: [18, 14, 36],
    water: [34, 27, 74],
    waterEdge: [52, 42, 104],
    green: [22, 30, 32],
    road: [40, 34, 66],
    roadEdge: [31, 26, 52],
    path: [36, 30, 60],
    rail: [70, 62, 98],
    building: [42, 35, 72],
    buildingDim: [32, 27, 57],
    dorm: [206, 196, 232],
    dormHover: [184, 168, 236],
    dormSelected: [169, 155, 255],
    dormDim: [52, 46, 80],
    dormEdge: [182, 166, 204],
    slab: [196, 184, 226],
    slabHas: [143, 127, 247],
    slabHover: [182, 166, 204],
    slabSel: [255, 178, 122],
    thread: [182, 166, 204],
    threadDim: [182, 166, 204, 52],
    threadGlow: [182, 166, 204, 70],
    pulse: [246, 240, 255],
    direct: [214, 206, 230, 220],
    bead: [160, 128, 255],
    beadDirect: [232, 226, 244],
    beadLoop: [182, 166, 204],
    beadRing: [16, 12, 32],
    highlight: [182, 166, 204],
    grid: [143, 127, 247],
    floorPlate: [30, 25, 54],
    roomA: [78, 68, 116],
    roomB: [66, 57, 102],
    roomC: [56, 48, 90],
    roomOffered: [126, 110, 200],
    roomEdge: [104, 94, 140],
    roomText: [238, 232, 248],
  },
};

const MQ = window.matchMedia("(prefers-color-scheme: dark)");
let mode = "auto";
const listeners = new Set();

export function getMode() { return mode; }
export function isDark() {
  return mode === "dark" || (mode === "auto" && MQ.matches);
}
export function sceneColors() { return isDark() ? SCENE.dark : SCENE.light; }

export function setMode(m, persist = true) {
  mode = m === "light" || m === "dark" ? m : "auto";
  const root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  if (persist) {
    try { localStorage.setItem("swapchain.theme", mode); } catch (e) { /* optional */ }
  }
  listeners.forEach((fn) => fn(isDark()));
}

export function initTheme(forced) {
  let m = forced;
  if (!m) {
    try { m = localStorage.getItem("swapchain.theme"); } catch (e) { m = null; }
  }
  setMode(m || "auto", false);
  MQ.addEventListener("change", () => { if (mode === "auto") listeners.forEach((fn) => fn(isDark())); });
}

export function onThemeChange(fn) { listeners.add(fn); }

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
