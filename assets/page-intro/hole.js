// Page intro for the Continuum page: a quick camera sweep down Miacomet hole 10, from behind the tee
// to the wide opening view of the 3D demo. It reuses the demo's own scene (continuum/hole/src), so the
// palette, the ground, the edge fog and the light are exactly the demo's.
import { SHOTS, toLL, height, lerp2, add, mul, bearingOf, clamp } from "../../continuum/hole/src/world.js";
import { stateAt } from "../../continuum/hole/src/story.js";
import { Scene } from "../../continuum/hole/src/scene.js";

const D = window.deck;
const b1 = bearingOf(SHOTS.dir1);
const holeMid = lerp2(SHOTS.tee.from, SHOTS.pin, 0.5);
// behind the tee, low and close; over the landing zone; then the demo's opening view of the whole hole
const K0 = { c: add(SHOTS.tee.from, mul(SHOTS.dir1, -12)), z: 19.5, p: 64, b: b1 + 10 };
const K1 = { c: SHOTS.tee.land, z: 18.2, p: 57, b: b1 - 4 };
const K2 = { c: lerp2(holeMid, SHOTS.tee.from, 0.08), z: 17.15, p: 49, b: b1 - 24 };
// a quadratic curve that passes through K1 halfway
const thru = (a, m, b, u) => { const c = 2 * m - (a + b) / 2; return (1 - u) * (1 - u) * a + 2 * u * (1 - u) * c + u * u * b; };
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

export async function create({ host, phone }) {
  // the demo's scene reads the theme from data-theme (else the system setting); the site means light
  // when nothing is set, so say so while the intro runs
  const root = document.documentElement;
  const setLight = !root.hasAttribute("data-theme");
  if (setLight) root.setAttribute("data-theme", "light");
  const restore = () => { if (setLight && root.getAttribute("data-theme") === "light") root.removeAttribute("data-theme"); };

  let scene;
  const waiting = [];
  const flush = () => { while (waiting.length) waiting.shift()(); };
  const drawn = () => new Promise((r) => waiting.push(r));
  try {
    await new Promise((res, rej) => {
      scene = new Scene(host, { phone, onReady: res });
      setTimeout(() => rej(new Error("hole scene timed out")), 30000);
    });
  } catch (e) { restore(); throw e; }
  scene.deck.setProps({ onAfterRender: flush });
  const S = stateAt(0);

  function view(s) {
    const W = host.clientWidth || innerWidth, H = host.clientHeight || innerHeight;
    const u = easeOut(clamp(s, 0, 1));
    const c = [thru(K0.c[0], K1.c[0], K2.c[0], u), thru(K0.c[1], K1.c[1], K2.c[1], u)];
    const zAdj = phone ? clamp(Math.log2(Math.min((W / 390) * 0.56, H / 900)), -1.4, -0.5) : clamp(Math.log2(Math.min(W / 1440, H / 900)), -1.2, 0.25);
    const ll = toLL(c), zc = height(c[0], c[1]);
    const v = {
      longitude: ll[0], latitude: ll[1], zoom: thru(K0.z, K1.z, K2.z, u) + zAdj, pitch: thru(K0.p, K1.p, K2.p, u),
      bearing: thru(K0.b, K1.b, K2.b, u), position: [0, 0, zc], maxPitch: 75, maxZoom: 24,
    };
    // keep the hole out from under the title: to the right on a wide screen, lower on a phone
    const off = phone ? [0, H * 0.13] : [W * 0.16, H * 0.02];
    try {
      const vp = new D.WebMercatorViewport({ width: W, height: H, ...v });
      const p = vp.unproject([W / 2 - off[0], H / 2 - off[1]], { targetZ: zc });
      if (Number.isFinite(p[0]) && Number.isFinite(p[1])) { v.longitude = p[0]; v.latitude = p[1]; }
    } catch (e) { /* centered is fine */ }
    return v;
  }

  let last = 0;
  const frame = (s) => { last = s; const p = drawn(); scene.render(S, view(s)); return p; };
  const first = drawn();
  scene.render(S, view(0));
  await first;

  return {
    frame,
    setTheme() { scene.setTheme(); frame(last); },
    dispose() { flush(); try { scene.deck.finalize(); } catch (e) { /* gone */ } restore(); },
  };
}
