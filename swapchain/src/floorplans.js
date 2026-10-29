// Typical floor layouts, redrawn minimally from Ian's notes (design/IAN-NOTES.md).
// One typical layout per hall. Rooms are rounded rectangles in plan units.
// Each layout returns { w, h, rooms: [{ suffix, x, y, w, h, type }], blocks: [{ x, y, w, h, label }], outline: [{x,y,w,h}] }.

function row(x, y, w, h, suffixes, typeOf) {
  const n = suffixes.length;
  const rw = w / n;
  return suffixes.map((s, i) => ({ suffix: s, x: x + i * rw, y, w: rw, h, type: typeOf(s) }));
}
function col(x, y, w, h, suffixes, typeOf) {
  const n = suffixes.length;
  const rh = h / n;
  return suffixes.map((s, i) => ({ suffix: s, x, y: y + i * rh, w, h: rh, type: typeOf(s) }));
}
const pad = (n) => String(n).padStart(2, "0");
const range = (a, b, step = 1) => { const o = []; for (let i = a; i <= b; i += step) o.push(i); return o; };

function warren() {
  const t = (s) => (["01", "11", "14"].includes(s) ? "single" : s === "13" ? "triple" : "double");
  const top = range(1, 12).map(pad);
  const bottom = range(13, 24).map(pad).reverse();
  return {
    w: 660, h: 260,
    outline: [{ x: 10, y: 10, w: 640, h: 240 }],
    rooms: [...row(20, 20, 620, 72, top, t), ...row(20, 168, 620, 72, bottom, t)],
    blocks: [
      { x: 80, y: 110, w: 90, h: 40, label: "Stairs" },
      { x: 180, y: 110, w: 110, h: 40, label: "Bathroom" },
      { x: 300, y: 110, w: 70, h: 40, label: "Elevators" },
      { x: 380, y: 110, w: 110, h: 40, label: "Bathroom" },
      { x: 500, y: 110, w: 80, h: 40, label: "Lounge" },
    ],
  };
}

// Sleeper Hall, Typical Floor Plan A (BU Housing): 12 doubles on the New Balance Field side (even
// numbers), doubles and the two big triples (13, 15) on the Nickerson Field side, singles at both
// stair ends, and the core (stairs, two full bathrooms, elevators) down the middle.
// Plan units follow BU's drawing; Claflin and Rich are the same kind of tower and share it.
function sleeper() {
  const t = (s) => (["00", "01", "26", "27"].includes(s) ? "single" : ["13", "15"].includes(s) ? "triple" : "double");
  const top = range(2, 24, 2).map(pad);
  const r = (suffix, x0, y0, x1, y1) => ({ suffix, x: x0, y: y0, w: x1 - x0, h: y1 - y0, type: t(suffix) });
  const bw = 147.4;
  return {
    w: 1810, h: 755,
    outline: [{ x: 10, y: 10, w: 1790, h: 735 }],
    rooms: [
      ...top.map((s, i) => r(s, 20 + i * bw, 20, 20 + (i + 1) * bw, 210)),
      r("00", 20, 255, 155, 370), r("01", 20, 373, 155, 487),
      r("26", 1655, 255, 1790, 370), r("27", 1655, 373, 1790, 487),
      ...["03", "05", "07", "09", "11"].map((s, i) => r(s, 20 + i * bw, 533, 20 + (i + 1) * bw, 720)),
      r("13", 757, 467, 905, 720), r("15", 907, 467, 1053, 720),
      ...["17", "19", "21", "23", "25"].map((s, i) => r(s, 1055 + i * bw, 533, 1055 + (i + 1) * bw, 720)),
    ],
    blocks: [
      { x: 157, y: 275, w: 148, h: 185, label: "Stairs" },
      { x: 310, y: 275, w: 340, h: 190, label: "Bathroom" },
      { x: 695, y: 355, w: 380, h: 110, label: "Elevators" },
      { x: 1115, y: 275, w: 390, h: 190, label: "Bathroom" },
      { x: 1505, y: 275, w: 148, h: 185, label: "Stairs" },
    ],
    sides: ["New Balance Field side", "Nickerson Field side"],
    // drawn to the real slab: the bottom of the plan faces Nickerson Field
    fit: { bottomToward: [-71.1186, 42.3519] },
  };
}

function kilachand() {
  const triples = ["01L", "09R", "12R", "14R", "17R"];
  const t = (s) => (s === "15" ? "single" : triples.includes(s) ? "triple" : "double");
  return {
    w: 660, h: 320,
    outline: [{ x: 10, y: 10, w: 200, h: 300 }, { x: 210, y: 110, w: 240, h: 100 }, { x: 450, y: 10, w: 200, h: 300 }],
    rooms: [
      ...col(20, 20, 80, 280, ["01L", "01R", "02", "04", "05L", "05R"], t),
      ...col(120, 20, 80, 90, ["06L", "06R"], t),
      ...col(120, 210, 80, 90, ["07L", "07R"], t),
      ...row(210, 118, 240, 34, ["08L", "08R", "09L", "09R"], t),
      ...row(210, 168, 240, 34, ["10L", "10R", "11"], t),
      ...col(460, 20, 80, 90, ["12L", "12R"], t),
      ...col(460, 210, 80, 90, ["14L", "14R"], t),
      ...col(560, 20, 80, 280, ["15", "16L", "16R", "17L", "17R", "18", "19L", "19R"], t),
    ],
    blocks: [
      { x: 120, y: 120, w: 80, h: 80, label: "Elevators" },
      { x: 460, y: 120, w: 80, h: 80, label: "Stairs" },
    ],
  };
}

function myles() {
  const t = () => "suite";
  const suite = (x, y, n) => [
    ...row(x, y, 132, 66, ["A", "B", "C"].map((l) => pad(n) + l), t),
  ];
  const rooms = [];
  const blocks = [];
  [1, 2, 3, 4].forEach((n, i) => { rooms.push(...suite(20 + i * 170, 20, n)); blocks.push({ x: 20 + i * 170 + 134, y: 20, w: 28, h: 66, label: "" }); });
  [5, 6, 7, 8].forEach((n, i) => { rooms.push(...suite(20 + i * 170, 124, n)); blocks.push({ x: 20 + i * 170 + 134, y: 124, w: 28, h: 66, label: "" }); });
  return {
    w: 712, h: 210,
    outline: [{ x: 10, y: 10, w: 692, h: 190 }],
    rooms, blocks,
    note: "Lettered bedrooms share a suite bathroom",
  };
}

function towers() {
  const t = () => "double";
  const wing = (x, letter, endLeft) => {
    const ids = (a, b) => range(a, b).map((n) => pad(n) + letter);
    const rx = endLeft ? x + 40 : x;
    const end = endLeft ? x : x + 270;
    return [
      ...row(rx, 20, 270, 70, ids(1, 8), t),
      ...row(rx, 120, 270, 70, ids(9, 16), t),
      { suffix: "20" + letter, x: end, y: 20, w: 38, h: 170, type: "double" },
    ];
  };
  return {
    w: 740, h: 210,
    outline: [{ x: 10, y: 10, w: 330, h: 190 }, { x: 340, y: 80, w: 60, h: 50 }, { x: 400, y: 10, w: 330, h: 190 }],
    rooms: [...wing(20, "W", true), ...wing(410, "E", false)],
    blocks: [{ x: 345, y: 88, w: 50, h: 34, label: "Link" }],
    sides: ["West tower", "East tower"],
  };
}

function danielsen() {
  const t = (s) => (["23E", "23J"].includes(s) ? "single" : s === "33" ? "triple" : s.startsWith("23") ? "double" : "double");
  return {
    w: 700, h: 210,
    outline: [{ x: 10, y: 10, w: 680, h: 190 }],
    rooms: [
      ...row(20, 20, 160, 66, ["23B", "23C", "23D"], t),
      ...row(20, 124, 160, 66, ["23E", "23J"], t),
      ...row(200, 20, 480, 66, ["21", "22", "24", "25", "26", "27", "28"], t),
      ...row(200, 124, 400, 66, ["29", "30", "31", "32", "33", "34"], t),
    ],
    blocks: [{ x: 20, y: 92, w: 160, h: 26, label: "Suite 23 common room" }, { x: 610, y: 124, w: 70, h: 66, label: "Stairs" }],
  };
}

function c575(floor) {
  if (floor === 2) {
    const singles = ["04", "08", "15", "16", "21", "24"];
    const t = (s) => (singles.includes(s) ? "single" : "double");
    return {
      w: 760, h: 210,
      outline: [{ x: 10, y: 10, w: 740, h: 190 }],
      rooms: [...row(20, 20, 720, 66, range(1, 27, 2).map(pad), t), ...row(20, 124, 640, 66, range(2, 28, 2).map(pad), t)],
      blocks: [{ x: 670, y: 124, w: 70, h: 66, label: "Elevators" }],
      note: "Every room has its own bathroom",
    };
  }
  const t = (s) => (["16", "18"].includes(s) ? "single" : "triple");
  return {
    w: 800, h: 210,
    outline: [{ x: 10, y: 10, w: 780, h: 190 }],
    rooms: [...row(20, 20, 760, 66, range(1, 31, 2).map(pad), t), ...row(20, 124, 680, 66, range(2, 30, 2).map(pad), t)],
    blocks: [{ x: 710, y: 124, w: 70, h: 66, label: "Elevators" }],
    note: "Every room has its own bathroom",
  };
}

function c1019() {
  const rooms = [];
  const blocks = [];
  const apt = (x, y, n) => {
    if (n === 6) { rooms.push({ suffix: "06", x, y, w: 124, h: 70, type: "single" }); return; }
    rooms.push(...row(x, y, 90, 70, ["A", "B", "C"].map((l) => pad(n) + l), () => "suite"));
    blocks.push({ x: x + 92, y, w: 32, h: 70, label: "" });
  };
  [1, 2, 3, 4, 5].forEach((n, i) => apt(20 + i * 134, 20, n));
  [6, 7, 8, 9, 10].forEach((n, i) => apt(20 + i * 134, 120, n));
  return {
    w: 700, h: 210,
    outline: [{ x: 10, y: 10, w: 680, h: 190 }],
    rooms, blocks,
    note: "Apartments: bedrooms A to C around a living room",
  };
}

const LAYOUTS = {
  warren: warren, sleeper: sleeper, claflin: sleeper, rich: sleeper,
  kilachand: kilachand, myles: myles, towers: towers, danielsen: danielsen,
  575: c575, 1019: c1019,
};

export function layoutFor(dormId, floor) {
  const f = LAYOUTS[dormId] || sleeper;
  const L = f(floor);
  L.rooms.forEach((r) => { r.number = `${floor}${r.suffix}`; });
  return L;
}

/**
 * Render the typical floor as SVG markup.
 * @param {string} dormId
 * @param {number} floor
 * @param {{ rooms: Map<string, {type:string, listed:boolean, me:boolean, listingId?:string}>, hot?: string }} marks keyed by room number
 */
export function floorPlanSvg(dormId, floor, marks) {
  const L = layoutFor(dormId, floor);
  const known = new Set(L.rooms.map((r) => r.number));
  const out = [];
  out.push(`<svg class="plan-svg" viewBox="0 0 ${L.w} ${L.h}" role="img" aria-label="Typical floor layout, floor ${floor}">`);
  L.outline.forEach((o) => out.push(`<rect class="outline" x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="14"/>`));
  L.blocks.forEach((b) => out.push(`<g class="core"><rect x="${b.x + 2}" y="${b.y + 2}" width="${b.w - 4}" height="${b.h - 4}" rx="6"/>${b.label ? `<text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 3.5}">${b.label}</text>` : ""}</g>`));
  L.rooms.forEach((r) => {
    const m = marks.rooms.get(r.number);
    const type = (m && m.type) || r.type;
    const cls = ["room", type];
    if (m && m.listed) cls.push("listed");
    if (m && m.me) cls.push("me");
    if (marks.hot && marks.hot === r.number) cls.push("hot");
    const fs = r.w < 40 ? 10.5 : 12.5;
    const attrs = m && m.listingId ? ` data-listing="${m.listingId}" tabindex="0" role="button" aria-label="Room ${r.number}, ${type}, offered"` : "";
    out.push(`<g class="${cls.join(" ")}"${attrs}><rect x="${r.x + 2.5}" y="${r.y + 2.5}" width="${r.w - 5}" height="${r.h - 5}" rx="7"/>` +
      `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 4}" text-anchor="middle" font-size="${fs}">${r.number}</text>` +
      (m && m.listed ? `<circle class="dot" cx="${r.x + r.w - 10}" cy="${r.y + 11}" r="4.5"/>` : "") + `</g>`);
  });
  out.push("</svg>");
  const missing = [...marks.rooms.entries()].filter(([num, m]) => (m.listed || m.me) && !known.has(num)).map(([num]) => num);
  return { svg: out.join(""), note: L.note || "", missing, w: L.w, h: L.h };
}
