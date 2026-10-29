// A furnished 3D room for the open floor: low walls with the corridor side cut away, a window on the
// outside wall, and one bed + desk + wardrobe per resident. The side you would move into is marked,
// and each resident who stays gets their avatar over their bed (click it for their profile).
// Works in meters on the room cell from floor3d.js: poly = [outer0, outer1, inner1, inner0].

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);

/**
 * @param {{poly:Array<[number,number]>}} cell
 * @param {number} z floor height in meters
 * @param {Array<{personId?:string, role:"free"|"staying"|"you"|"empty"}>} beds one per resident
 * @param {(m:[number,number]) => [number,number]} toLL
 */
export function furnish(cell, z, beds, toLL) {
  const [c0, c1, , ci0] = cell.poly;
  const W0 = len(sub(c1, c0)), D0 = len(sub(ci0, c0));
  const u = [(c1[0] - c0[0]) / W0, (c1[1] - c0[1]) / W0], v = [(ci0[0] - c0[0]) / D0, (ci0[1] - c0[1]) / D0];
  // The floor's cells are squeezed to fit every room on the footprint; open the room at a real dorm
  // room's size instead (it grows sideways and toward the corridor, and covers its neighbors).
  const n0 = Math.max(1, beds.length);
  const W = Math.max(W0, n0 === 1 ? 3.0 : n0 >= 3 ? 4.0 : 3.6), Dp = Math.max(D0, n0 >= 3 ? 5.6 : 4.8);
  const o0 = [c0[0] - u[0] * (W - W0) / 2, c0[1] - u[1] * (W - W0) / 2];
  const rect = [o0, [o0[0] + u[0] * W, o0[1] + u[1] * W], [o0[0] + u[0] * W + v[0] * Dp, o0[1] + u[1] * W + v[1] * Dp], [o0[0] + v[0] * Dp, o0[1] + v[1] * Dp]];
  /** true when a point (meters) is inside the opened room */
  const covers = (p) => { const d = sub(p, o0), a = d[0] * u[0] + d[1] * u[1], b = d[0] * v[0] + d[1] * v[1]; return a > -0.2 && a < W + 0.2 && b > -0.2 && b < Dp + 0.2; };
  const P = (a, b) => toLL([o0[0] + u[0] * a + v[0] * b, o0[1] + u[1] * a + v[1] * b]);
  const box = (a0, a1, b0, b1, z0, h, kind, extra = {}) => ({ poly: [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)].map((p) => [p[0], p[1], z + z0]), elev: h, kind, ...extra });
  const parts = [];
  const t = 0.12, H = 2.6;
  // walls: outside wall and the two side walls; the corridor side stays open so you can look in
  parts.push(box(0, W, 0, t, 0, H, "wall"), box(0, t, 0, Dp, 0, H, "wall"), box(W - t, W, 0, Dp, 0, H, "wall"));
  parts.push(box(0, W, 0, Dp, -0.02, 0.04, "floor"));
  // window: a pane set just inside the outside wall
  parts.push(box(W * 0.18, W * 0.82, t, t + 0.04, 0.9, 1.25, "window"));
  const n = Math.max(1, beds.length);
  // a little under real size (twin XL is about 1 x 2 m) so the room reads roomy at map scale
  const bw = 0.8, bl = Math.min(1.75, Dp * 0.42), dw = 0.7, dd = 0.45;
  const inW = W - 2 * t;
  const pins = [];
  const bed = (k, a0, b0, z0, role, personId) => {
    parts.push(box(a0, a0 + bw, b0, b0 + bl, z0 + 0.1, 0.28, "bed", { role, personId }));
    parts.push(box(a0 + 0.1, a0 + bw - 0.1, b0 + 0.06, b0 + 0.38, z0 + 0.38, 0.08, "pillow", { role, personId }));
    const c = P(a0 + bw / 2, b0 + bl / 2);
    pins.push({ pos: [c[0], c[1], z + z0 + 1.7], role, personId, k });
  };
  const desk = (a0, b0, role) => {
    parts.push(box(a0, a0 + dw, b0, b0 + dd, 0.7, 0.04, "desk", { role }));
    parts.push(box(a0 + 0.04, a0 + 0.1, b0 + 0.04, b0 + 0.1, 0, 0.7, "desk", { role }), box(a0 + dw - 0.1, a0 + dw - 0.04, b0 + 0.04, b0 + 0.1, 0, 0.7, "desk", { role }));
    // the chair, pulled up on the room side
    parts.push(box(a0 + dw / 2 - 0.18, a0 + dw / 2 + 0.18, b0 + dd + 0.08, b0 + dd + 0.42, 0, 0.45, "desk", { role }));
  };
  const wardrobe = (a0, role) => { const b0 = Dp - 0.62; if (b0 > bl + 0.4) parts.push(box(a0, a0 + 0.75, b0, b0 + 0.5, 0, 1.8, "wardrobe", { role })); };
  // the window wall is the head wall: beds sit in its two corners, heads to the window, both facing the door
  const L = t + 0.04, Rr = W - t - 0.04 - bw, win = t + 0.06;
  if (n === 1) {
    bed(0, L, win, 0, beds[0].role, beds[0].personId);
    if (inW >= bw + dw + 0.2) desk(L + bw + 0.15, win, beds[0].role); else desk(L, win + bl + 0.15, beds[0].role);
    wardrobe(W - t - 0.79, beds[0].role);
  } else {
    beds.slice(0, 2).forEach((bd, k) => bed(k, k ? Rr : L, win, 0, bd.role, bd.personId));
    const mid = Rr - (L + bw); // floor between the two beds
    if (mid >= 2 * dw + 0.1) {
      // two desks side by side between the beds, each next to its own bed
      const g = (mid - 2 * dw) / 2;
      desk(L + bw + g * 0.5, win, beds[0].role);
      desk(Rr - g * 0.5 - dw, win, beds[1].role);
    } else if (mid >= dw + 0.06) {
      // room for one desk between the beds; the other goes at the foot of its bed
      desk(L + bw + (mid - dw) / 2, win, beds[0].role);
      desk(Rr + bw - dw, win + bl + 0.12, beds[1].role);
    } else {
      desk(L, win + bl + 0.12, beds[0].role);
      desk(Rr + bw - dw, win + bl + 0.12, beds[1].role);
    }
    if (n >= 3) { wardrobe(W / 2 - 0.8, beds[0].role); wardrobe(W / 2 + 0.05, beds[1].role); }
    else { wardrobe(L, beds[0].role); wardrobe(W - t - 0.79, beds[1].role); }
  }
  // BU rooms have no bunks: a third and fourth bed go along the side walls, behind the first two,
  // each with its desk at the foot (toward the door)
  for (let k = 2; k < Math.min(n, 4); k++) {
    const a0 = k === 2 ? L : Rr, b0 = win + bl + 0.25;
    bed(k, a0, b0, 0, beds[k].role, beds[k].personId);
    if (b0 + bl + 0.1 + dd < Dp - 0.1) desk(k === 2 ? L : Rr + bw - dw, b0 + bl + 0.1, beds[k].role);
  }
  const center = P(W / 2, Dp / 2);
  // a view direction that looks from the corridor toward the window
  const fwd = [-v[0], -v[1]];
  return { parts, pins, center, fwd, W, Dp, rect, covers };
}
