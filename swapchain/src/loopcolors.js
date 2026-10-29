// Palette v4 (Continuum Technologies): every loop gets its own color from the Continuum set
// (purples, rust, sage, cream-tan), the same everywhere (map arcs, pin rings, match card accent,
// timeline). The loop with YOU in it and the live-add loop get the animated purple-to-peach gradient.
import { DEMO, ME } from "../data/people.js";

export const LOOP_HEX = {
  light: ["#604C9C", "#C0632F", "#7A6AE6", "#5F7F48", "#B0487A", "#3F7FA6", "#C98A2A", "#8C7350"],
  dark: ["#B6A6CC", "#E08A55", "#A99BFF", "#9DBB7E", "#E07BAA", "#7FB4D6", "#F0B860", "#E3D3B8"],
};
export const AI_HEX = ["#604C9C", "#8F7FF7", "#E8935A", "#F2A66E"];
export const AI_HEX_DARK = ["#B6A6CC", "#A99BFF", "#E8935A", "#FFB27A"];

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const LOOP_RGB = { light: LOOP_HEX.light.map(rgb), dark: LOOP_HEX.dark.map(rgb) };
export const AI_RGB = AI_HEX.map(rgb);
export const AI_RGB_DARK = AI_HEX_DARK.map(rgb);

const natural = (a, b) => a.localeCompare(b, "en", { numeric: true });
/** Same loop, any starting person: one key. */
export function loopKey(cycle) {
  let best = 0;
  for (let i = 1; i < cycle.length; i++) if (natural(cycle[i], cycle[best]) < 0) best = i;
  return cycle.slice(best).concat(cycle.slice(0, best)).join(">");
}

const reg = new Map(); // loopKey -> palette index
const ai = new Set();
const plainIdx = new Map(); // ai loop -> its own system color, for views where only YOUR loop glows
let next = 0;

function register(cycle) {
  const k = loopKey(cycle);
  if (reg.has(k) || ai.has(k) || cycle.length < 3) return k;
  reg.set(k, next % LOOP_HEX.light.length);
  next++;
  return k;
}

// Seed in story order so the demo always shows the same colors: Purple, Rust, Violet, Sage, ...
(function seed() {
  const live = DEMO.liveAdd && DEMO.liveAdd.listing.id;
  for (const sc of DEMO.scenes || []) {
    const loops = sc.beats ? sc.beats.map((b) => b.loop) : sc.showcase || [];
    for (const c of loops) {
      if (c.length < 3) continue;
      if (c.includes(ME.listingId) || (live && c.includes(live))) ai.add(loopKey(c));
      else register(c);
    }
  }
  for (const k of ai) { plainIdx.set(k, next % LOOP_HEX.light.length); next++; }
})();

/**
 * @returns {{ key: string, ai: boolean, index: number, cls: string }}
 * cls is the CSS class that sets --loop (and the gradient for ai loops).
 */
export function loopStyle(cycle, { plain = false } = {}) {
  if (!cycle || cycle.length < 3) return { key: cycle ? loopKey(cycle) : "", ai: false, index: -1, cls: "loop-pair" };
  const k = register(cycle);
  // plain: the live-add loop wears its own system color (the closing web); YOUR loop always glows
  if (ai.has(k) && plain && !cycle.includes(ME.listingId)) { const index = plainIdx.get(k); return { key: k, ai: false, index, cls: `loop-c${index}` }; }
  if (ai.has(k)) return { key: k, ai: true, index: -1, cls: "loop-ai" };
  const index = reg.get(k);
  return { key: k, ai: false, index, cls: `loop-c${index}` };
}

/** RGB for a loop on the map (dark mode variants). For ai loops this is the middle stop. */
export function loopRgb(cycle, dark, opts) {
  const s = loopStyle(cycle, opts);
  if (s.ai) return (dark ? AI_RGB_DARK : AI_RGB)[1];
  if (s.index < 0) return null;
  return (dark ? LOOP_RGB.dark : LOOP_RGB.light)[s.index];
}

/** Cyclic gradient lookup for u in [0, 1): Purple, Violet, Peach, Apricot and back the same way. */
export function aiColorAt(u, dark = false) {
  const stops = dark ? AI_RGB_DARK : AI_RGB;
  const w = ((u % 1) + 1) % 1;
  const t = 1 - Math.abs(2 * w - 1); // 0..1..0, so the loop never jumps from orange to blue
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  const a = stops[i], b = stops[i + 1];
  const s = f * f * (3 - 2 * f);
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
}
