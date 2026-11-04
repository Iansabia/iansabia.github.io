// Scene colors and theme handling. Same palette as the SwapChain demo (Continuum palette v4):
// warm cream and purple #604C9C by day, deep purple-black #100C20 at night where the key pieces glow
// lavender-white. Golf surfaces are mapped onto that palette, not onto real grass and sand colors.

export const SCENE = {
  light: {
    bg: [239, 234, 227],
    ground: [239, 234, 227],
    grid: [143, 127, 247],
    contour: [143, 127, 247],
    rough: [234, 232, 221],
    roughDim: [236, 233, 224],
    fairway: [246, 243, 252],
    fairwayDim: [236, 236, 228],
    fairwayEdge: [184, 174, 222],
    green: [228, 220, 249],
    greenDim: [232, 229, 234],
    greenEdge: [96, 76, 156],
    tee: [238, 234, 250],
    teeDim: [238, 237, 232],
    teeEdge: [96, 76, 156],
    bunker: [250, 236, 221],
    bunkerEdge: [228, 196, 166],
    water: [176, 184, 238],
    waterEdge: [126, 136, 214],
    waterRipple: [255, 255, 255],
    wood: [216, 222, 202],
    tree: [214, 221, 199],
    road: [252, 250, 246],
    roadEdge: [228, 221, 212],
    cartpath: [252, 250, 246],
    cartpathEdge: [214, 206, 196],
    building: [229, 223, 215],
    buildingEdge: [143, 127, 247],
    lamp: [143, 127, 247],
    ink: [58, 55, 66],
    halo: [255, 253, 250],
    accent: [96, 76, 156],
    track: [143, 127, 247],
    trackDot: [255, 253, 250],
    ball: [255, 255, 255],
    ballRing: [58, 55, 66],
    shadow: [58, 55, 66],
    flight0: [96, 76, 156],
    flightMid: [143, 127, 247],
    flight1: [232, 147, 90],
    flag: [192, 99, 47],
    flagHalo: [232, 147, 90],
    pole: [58, 55, 66],
    miss: [212, 82, 150],
    aim: [96, 76, 156],
    cart: [255, 253, 250],
    cartRoof: [96, 76, 156],
    cartEdge: [96, 76, 156],
    phone: [29, 24, 48],
    cone: [143, 127, 247],
  },
  dark: {
    bg: [18, 14, 36],
    ground: [18, 14, 36],
    grid: [143, 127, 247],
    contour: [143, 127, 247],
    rough: [26, 30, 50],
    roughDim: [22, 22, 42],
    fairway: [44, 50, 82],
    fairwayDim: [29, 29, 52],
    fairwayEdge: [76, 84, 124],
    green: [176, 164, 222],
    greenDim: [42, 40, 70],
    greenEdge: [182, 166, 204],
    tee: [60, 66, 108],
    teeDim: [34, 34, 60],
    teeEdge: [182, 166, 204],
    bunker: [74, 60, 92],
    bunkerEdge: [104, 84, 120],
    water: [26, 30, 92],
    waterEdge: [84, 96, 196],
    waterRipple: [120, 136, 255],
    wood: [26, 30, 46],
    tree: [44, 46, 74],
    road: [40, 34, 66],
    roadEdge: [31, 26, 52],
    cartpath: [44, 38, 72],
    cartpathEdge: [33, 28, 56],
    building: [42, 35, 72],
    buildingEdge: [169, 155, 255],
    lamp: [255, 214, 170],
    ink: [232, 226, 244],
    halo: [16, 12, 32],
    accent: [182, 166, 204],
    track: [169, 155, 255],
    trackDot: [16, 12, 32],
    ball: [255, 255, 255],
    ballRing: [16, 12, 32],
    shadow: [0, 0, 0],
    flight0: [182, 166, 204],
    flightMid: [169, 155, 255],
    flight1: [255, 178, 122],
    flag: [255, 178, 122],
    flagHalo: [255, 178, 122],
    pole: [232, 226, 244],
    miss: [255, 128, 190],
    aim: [182, 166, 204],
    cart: [206, 196, 232],
    cartRoof: [143, 127, 247],
    cartEdge: [182, 166, 204],
    phone: [16, 12, 32],
    cone: [169, 155, 255],
  },
};

const MQ = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set();

/** The site's choice wins (localStorage "theme", or ?theme=), else the system setting. */
function readChoice() {
  const q = new URLSearchParams(location.search).get("theme");
  if (q === "light" || q === "dark") return q;
  try {
    const t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") return t;
  } catch (e) { /* storage blocked */ }
  return null;
}

export function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return MQ.matches;
}
export function sceneColors() { return isDark() ? SCENE.dark : SCENE.light; }
export function onThemeChange(fn) { listeners.add(fn); }
const notify = () => listeners.forEach((fn) => fn(isDark()));

export function applyChoice(t) {
  const root = document.documentElement;
  if (t === "light" || t === "dark") root.dataset.theme = t;
  else delete root.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isDark() ? "#100C20" : "#F6F3EE";
  notify();
}

export function toggleTheme() {
  const next = isDark() ? "light" : "dark";
  try { localStorage.setItem("theme", next); } catch (e) { /* optional */ }
  applyChoice(next);
}

export function initTheme() {
  applyChoice(readChoice());
  MQ.addEventListener("change", () => { if (!document.documentElement.dataset.theme) notify(); });
  // another tab, or the Continuum page around this one, flipped the site theme
  window.addEventListener("storage", (e) => { if (e.key === "theme" || e.key === null) applyChoice(readChoice()); });
  // a parent page may also set data-theme on us directly
  new MutationObserver(() => notify()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
