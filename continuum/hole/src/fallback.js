// No WebGL: a flat plan of the hole (the same OSM outlines, turned so the hole plays across a wide
// screen, or up a narrow one) with the three example shots, a map key, and every caption as a list.
import { DATA, HOLE, FEATURES, SHOTS, NUM, sub, norm } from "./world.js";
import { CAPTIONS } from "./story.js";

export function renderFallback(el) {
  const wide = window.innerWidth >= 900;
  const dir = norm(sub(SHOTS.pin, SHOTS.tee.from));
  // wide: the hole plays left to right; narrow: bottom to top
  const th = (wide ? 0 : Math.PI / 2) - Math.atan2(dir[1], dir[0]);
  const rot = (p) => { const c = Math.cos(th), s = Math.sin(th); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
  const pts = [SHOTS.tee.from, SHOTS.pin, ...FEATURES.fairways.flatMap((f) => f.p), ...FEATURES.greens.flatMap((f) => f.p), ...FEATURES.tees.flatMap((f) => f.p)].map(rot);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const m = wide ? 40 : 30, x0 = Math.min(...xs) - m, x1 = Math.max(...xs) + m, y0 = Math.min(...ys) - m, y1 = Math.max(...ys) + m;
  const P = (p) => { const q = rot(p); return `${(q[0] - x0).toFixed(1)},${(y1 - q[1]).toFixed(1)}`; };
  const path = (ring, close = true) => "M" + ring.map(P).join(" L") + (close ? "Z" : "");
  const near = (f) => f.p.some((p) => { const q = rot(p); return q[0] > x0 - 60 && q[0] < x1 + 60 && q[1] > y0 - 60 && q[1] < y1 + 60; });
  const svg = [];
  svg.push(`<svg class="plan" viewBox="0 0 ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}" role="img" aria-label="Plan of hole ${HOLE.ref} with the three example shots">`);
  svg.push(`<rect class="p-rough" width="100%" height="100%"/>`);
  (DATA.polys.water || []).filter(near).forEach((f) => svg.push(`<path class="p-water" d="${path(f.p)}"/>`));
  DATA.polys.fairway.filter(near).forEach((f) => svg.push(`<path class="p-fair" d="${path(f.p)}"/>`));
  DATA.lines.cartpath.forEach((c) => { if (near(c)) svg.push(`<path class="p-cart" d="${path(c.p, false)}"/>`); });
  DATA.polys.bunker.filter(near).forEach((f) => svg.push(`<path class="p-bunker" d="${path(f.p)}"/>`));
  DATA.polys.green.filter(near).forEach((f) => svg.push(`<path class="p-green" d="${path(f.p)}"/>`));
  DATA.polys.tee.filter(near).forEach((f) => svg.push(`<path class="p-tee" d="${path(f.p)}"/>`));
  const shots = [SHOTS.tee.from, SHOTS.tee.rest, SHOTS.approach.rest, SHOTS.pin];
  svg.push(`<path class="p-shot" d="${path(shots, false)}"/>`);
  { const [x, y] = P(SHOTS.pin).split(","); svg.push(`<circle class="p-flag" cx="${x}" cy="${y}" r="4"/>`); }
  shots.slice(0, 3).forEach((p, i) => { const [x, y] = P(p).split(","); svg.push(`<circle class="p-dot" cx="${x}" cy="${y}" r="7"/><text class="p-n" x="${x}" y="${y}">${i + 1}</text>`); });
  svg.push("</svg>");
  const key = [
    ["k-fair", "Fairway"], ["k-green", "Green"], ["k-tee", "Tee"], ["k-bunker", "Bunker"], ["k-cart", "Cart path"], ["k-shot", "Example shots 1, 2, 3"],
  ].concat(svg.some((x) => x.includes("p-water")) ? [["k-water", "Water"]] : []).map(([k, t]) => `<span><i class="${k}"></i>${t}</span>`).join("");
  const items = CAPTIONS.map((c) => `<li><b>${c.title}</b><p>${c.text}</p></li>`).join("");
  el.innerHTML = `<div class="nogl-in"><figure class="nogl-fig">${svg.join("")}<div class="key" aria-label="Map key">${key}</div><p class="note">Your browser can't draw the 3D hole, so here is the plan. Example shots: a ${NUM.teeCarryYd} yard tee shot, an approach from ${NUM.toPinYd} yards, and a ${NUM.leftFt} foot putt. Illustrative, not real tracked data.</p></figure><ol>${items}</ol></div>`;
  el.hidden = false;
}
