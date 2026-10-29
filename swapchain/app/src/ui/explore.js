// Explore: dorm list, search, building view (tower picker, floor stack, listing cards), floor plan overlay.
import { esc, icon } from "./dom.js";
import { DORMS, dormsById, dormStats, ME, cycleKey, wantsText, roomCode } from "../engine.js";
import { listingCard, matchCard, footerNote, emptyState, av, shortName, yearLine, typeChip, inLoopWithMe } from "./cards.js";
import { floorPlanSvg } from "../floorplans.js";

const AREA_ORDER = ["West Campus", "Central Campus", "East Campus", "South Campus", "Fenway"];

/** You, at a glance: where you live now, who stays, what you asked for. */
function youCard(world) {
  const me = world.listingsById.get(world.meListingId);
  const meP = world.peopleById.get(ME.personId);
  const room = me ? world.roomsById.get(me.roomId) : world.rooms.find((r) => r.occupants.includes(ME.personId));
  if (!meP || !room) return "";
  const mates = room.occupants.filter((id) => id !== ME.personId).map((id) => world.peopleById.get(id)).filter(Boolean);
  const loops = world.mine.chains.length + world.mine.direct.length;
  return `<div class="you-card card">` +
    `<div class="person"><button class="av" data-act="tab" data-id="profile" aria-label="Your profile">${av(meP, 44, { verified: true })}</button><div class="who"><div class="nm">${esc(meP.name)} <span class="you-tag">You</span></div><div class="ln">${esc(yearLine(meP))}</div></div></div>` +
    `<div class="you-grid"><div><span class="lbl">You live in</span><button class="val room-link" data-act="${me ? "seeroom" : "noop"}" data-id="${esc(me ? me.id : "")}">${esc(roomCode(world, room))}${icon("chevron", "xs")}</button>${typeChip(room.type)}</div>` +
    `<div><span class="lbl">Roommate${mates.length > 1 ? "s" : ""}</span>${mates.length ? mates.map((m) => `<button class="mate" data-act="person" data-id="${esc(m.id)}">${av(m, 22)}<span>${esc(shortName(m))}</span></button>`).join("") : `<span class="val quiet">None</span>`}</div></div>` +
    (me ? `<div class="you-wants"><span class="lbl">You want</span><span>${esc(wantsText(world, me.wants))}</span><button class="chip soft" data-act="tab" data-id="post">Edit</button></div>` : `<div class="card-actions"><button class="btn primary" data-act="tab" data-id="post">Post my room</button></div>`) +
    (loops ? `<button class="you-loops" data-act="tab" data-id="matches">${icon("loop", "sm")}You're in ${loops} ${loops === 1 ? "match" : "matches"}. See ${loops === 1 ? "it" : "them"}${icon("chevron", "xs")}</button>` : "") +
    `</div>`;
}

/** Rooms picked for you: ones already in a loop with you first, then ones that fit what you want. */
function recommended(world, all = false) {
  const me = world.listingsById.get(world.meListingId);
  if (!me) return "";
  const ok = world.accept.get(me.id) || new Set();
  const score = (l) => (inLoopWithMe(world, l.id) ? 2 : 0) + (ok.has(l.id) ? 1 : 0);
  const picks = world.listings.filter((l) => l.id !== me.id && score(l) > 0).sort((a, b) => score(b) - score(a) || (a.postedDaysAgo || 0) - (b.postedDaysAgo || 0));
  const total = picks.length;
  if (!all) picks.splice(4);
  if (!picks.length) return `<div class="section-label">Recommended for you</div><div class="card"><p class="note" style="margin:0">Nothing posted fits what you want yet. Widen your picks, or wait for new posts.</p></div>`;
  const rows = picks.map((l) => {
    const p = world.peopleById.get(l.personId), r = world.roomsById.get(l.roomId);
    const why = inLoopWithMe(world, l.id) ? `<span class="why loop">${icon("loop", "xs")}In a loop with you</span>` : `<span class="why">Fits what you want</span>`;
    return `<button class="row rec" data-act="seeroom" data-id="${esc(l.id)}">${av(p, 36)}<span class="body"><span class="name">${esc(roomCode(world, r))}</span><span class="meta">${esc(r.type[0].toUpperCase() + r.type.slice(1))} · ${esc(shortName(p))} is leaving</span>${why}</span>${icon("chevron", "sm")}</button>`;
  }).join("");
  const more = total > 4 ? `<button class="chip" data-act="recall">${all ? "Show less" : `See all ${total}`}</button>` : "";
  return `<div class="section-label"><span class="grow">Recommended for you</span>${more}</div><div class="group">${rows}</div><div class="section-label">All dorms</div>`;
}

export function exploreHome(app) {
  const world = app.world;
  const q = (app.ui.search || "").trim().toLowerCase();
  const me = world.listingsById.get(world.meListingId);
  const meAccepts = me ? world.accept.get(me.id) || new Set() : new Set();
  let dorms = DORMS.map((d) => ({ d, s: dormStats(world, d.id) }));
  if (q) dorms = dorms.filter(({ d }) => `${d.name} ${d.short} ${d.area}`.toLowerCase().includes(q));
  dorms.sort((a, b) => AREA_ORDER.indexOf(a.d.area) - AREA_ORDER.indexOf(b.d.area) || b.s.offered - a.s.offered);

  const people = q.length >= 2
    ? world.people.filter((p) => `${p.name} ${p.major} ${p.interests.join(" ")}`.toLowerCase().includes(q)).slice(0, 8)
    : [];

  const out = [];
  out.push(`<div class="view">`);
  out.push(`<div class="vhead" data-drag><div class="titles"><h1 class="large-title">Explore</h1>` +
    `<p class="sub">Room swaps that go full circle. Post your room and what you'd rather have. SwapChain finds loops of students who can all move at once.</p></div></div>`);
  if (!q) out.push(youCard(world), recommended(world, app.ui.recAll));
  out.push(`<label class="search">${icon("search")}<input type="search" id="search" placeholder="Search dorms or people" value="${esc(app.ui.search || "")}" autocomplete="off" aria-label="Search dorms or people"></label>`);
  if (!dorms.length && !people.length) {
    out.push(emptyState("Nothing by that name", "Try a dorm like Warren or a first name like Miles."));
  }
  let lastArea = null;
  let open = false;
  for (const { d, s } of dorms) {
    if (d.area !== lastArea) {
      if (open) out.push(`</div>`);
      out.push(`<div class="section-label">${esc(d.area)}</div><div class="group">`);
      open = true;
      lastArea = d.area;
    }
    const tot = s.offered + s.wantIn || 1;
    const meta = d.towers.length ? `${d.towers.length} towers · floors ${d.floors[0]} to ${d.floors[1]}` : `Floors ${d.floors[0]} to ${d.floors[1]} · ${d.roomTypes.slice(0, 2).join(", ")}`;
    out.push(`<button class="row" data-act="dorm" data-id="${d.id}" data-hover="${d.id}">` +
      `<span class="dorm-tile">${icon(d.towers.length ? "towers" : "building")}</span>` +
      `<span class="body"><span class="name">${esc(d.short === "575 Comm" ? "575 Comm Ave" : d.name.replace(" (Myles)", ""))}</span>` +
      `<span class="meta" style="display:block">${esc(meta)}</span>` +
      (s.loops ? `<span class="loopnote">${icon("loop", "xs")}${s.loops} loop${s.loops === 1 ? "" : "s"} through here</span>` : "") +
      `<span class="demand" aria-hidden="true"><i style="width:${Math.round((100 * s.offered) / tot)}%"></i></span></span>` +
      `<span class="end"><b>${s.offered}</b>offered<br>${s.wantIn} want in</span></button>`);
  }
  if (open) out.push(`</div>`);
  if (people.length) {
    out.push(`<div class="section-label">People</div><div class="group">`);
    people.forEach((p) => {
      out.push(`<button class="row" data-act="person" data-id="${p.id}">${av(p, 40)}<span class="body"><span class="name">${esc(p.name)}</span><span class="meta" style="display:block">${esc(yearLine(p))}</span></span>${icon("chevron", "chev")}</button>`);
    });
    out.push(`</div>`);
  }
  out.push(footerNote());
  out.push(`</div>`);
  return out.join("");
}

function listingsFor(world, dormId, towerId, floor) {
  return world.listings.filter((l) => {
    const r = world.roomsById.get(l.roomId);
    if (!r || r.dormId !== dormId) return false;
    if (towerId && r.towerId !== towerId) return false;
    if (floor != null && r.floor !== floor) return false;
    return true;
  });
}

/** Floors with a posted room that fits what you want (keys like "warren-shields|7"). */
export function floorsThatFit(world) {
  const s = new Set();
  const ok = world.accept.get(world.meListingId) || new Set();
  for (const id of ok) {
    const l = world.listingsById.get(id), r = l && world.roomsById.get(l.roomId);
    if (r) s.add(`${r.towerId || r.dormId}|${r.floor}`);
  }
  return s;
}

export function floorsWithListings(world) {
  const s = new Set();
  for (const l of world.listings) {
    const r = world.roomsById.get(l.roomId);
    if (r) s.add(`${r.towerId || r.dormId}|${r.floor}`);
  }
  return s;
}

/** A loop picked from the Live feed: drawn on the map, with who moves where in the panel. */
export function findLoop(world, key) {
  return world.best.find((c) => cycleKey(c) === key) || null;
}

export function loopView(app) {
  const world = app.world;
  const c = findLoop(world, app.route.loopKey);
  const out = [];
  out.push(`<div class="view">`);
  if (!c) {
    out.push(`<div class="vhead" data-drag><button class="back" data-act="back" aria-label="Back to Explore">${icon("back")}</button><div class="titles"><h1 class="title">Loop</h1></div></div>`);
    out.push(emptyState("This loop is gone", "Someone in it changed their post, so it no longer closes.", ""));
    out.push(`</div>`);
    return out.join("");
  }
  const dorms = [...new Set(c.map((id) => world.roomsById.get(world.listingsById.get(id).roomId).dormId))].map((d) => dormsById.get(d).short);
  out.push(`<div class="vhead" data-drag><button class="back" data-act="back" aria-label="Back to Explore">${icon("back")}</button><div class="titles">` +
    `<h1 class="title">Loop of ${c.length}</h1><p class="sub">${esc(dorms.join(" → "))} · ${c.length} students all move at once</p></div></div>`);
  out.push(matchCard(world, c, { meId: c[0], open: true, expanded: app.ui.openPerson && app.ui.openPerson.key === cycleKey(c) ? app.ui.openPerson.id : null }));
  out.push(footerNote());
  out.push(`</div>`);
  return out.join("");
}

export function buildingView(app) {
  const world = app.world;
  const { dormId, towerId, floor } = app.route;
  const d = dormsById.get(dormId);
  const s = dormStats(world, dormId);
  const me = world.listingsById.get(world.meListingId);
  const meAccepts = me ? world.accept.get(me.id) || new Set() : new Set();
  const out = [];
  out.push(`<div class="view">`);
  out.push(`<div class="vhead" data-drag><button class="back" data-act="back" aria-label="Back to all dorms">${icon("back")}</button><div class="titles">` +
    `<h1 class="title">${esc(d.name)}</h1><p class="sub">${s.offered} room${s.offered === 1 ? "" : "s"} offered · ${s.wantIn} want in · ${s.loops} loop${s.loops === 1 ? "" : "s"}</p></div></div>`);
  out.push(`<p class="facts" style="margin-top:0">${esc(d.facts)}</p>`);

  if (d.towers.length) {
    out.push(`<div class="section-label">Towers</div><div class="seg towers" role="group" aria-label="Pick a tower">` + d.towers.map((t) => {
      const n = listingsFor(world, dormId, t.id, null).length;
      const idx = d.towers.indexOf(t);
      const shape = `<svg class="tw" viewBox="0 0 14 22" aria-hidden="true">${d.towers.map((_, j) => `<rect x="${j * 5}" y="${2 + Math.abs(j - 1)}" width="4" height="${20 - Math.abs(j - 1)}" rx="1" class="${j === idx ? "on" : ""}"/>`).join("")}</svg>`;
      return `<button data-act="tower" data-id="${t.id}" aria-pressed="${towerId === t.id}">${shape}<span>${esc(t.name)} Tower</span><small>${esc(t.fullName || "")} · ${n} offered</small></button>`;
    }).join("") + `</div>`);
  }

  const group = towerId || (d.towers.length ? null : dormId);
  if (group) {
    const [lo, hi] = d.towers.length ? d.towers.find((t) => t.id === towerId).floors : d.floors;
    const all = listingsFor(world, dormId, towerId, null);
    const wantFloors = new Map();
    // who wants each floor (listings elsewhere that accept a spot on that floor)
    for (const [from, set] of world.accept) {
      for (const tId of set) {
        const L = world.listingsById.get(tId);
        const r = L && world.roomsById.get(L.roomId);
        if (r && r.dormId === dormId && (!towerId || r.towerId === towerId) && world.listingsById.get(from)?.roomId !== L.roomId) {
          const k = r.floor;
          if (!wantFloors.has(k)) wantFloors.set(k, new Set());
          wantFloors.get(k).add(from);
        }
      }
    }
    out.push(`<div class="section-label"><span class="grow">Floors</span>${floor != null ? `<button class="chip" data-act="floor" data-id="">All floors</button>` : `<span style="font-weight:500">Tap a floor</span>`}</div>`);
    out.push(`<div class="floorstack" role="group" aria-label="Floors">`);
    // floors with nothing offered collapse into one quiet row ("8 to 13 · nothing offered")
    let run = [];
    const flush = () => {
      if (!run.length) return;
      if (run.length <= 2) run.forEach((f) => out.push(`<button class="floorrow fl-empty" data-act="floor" data-id="${f}" aria-pressed="${floor === f}" aria-label="Floor ${f}, nothing offered"><span class="fl">${f}</span><span class="dots"></span><span class="cnt"></span></button>`));
      else out.push(`<div class="floorrow fl-empty fl-run" aria-label="Floors ${run[run.length - 1]} to ${run[0]}, nothing offered">Floors ${run[run.length - 1]} to ${run[0]} · nothing offered</div>`);
      run = [];
    };
    for (let f = hi; f >= lo; f--) {
      const offered = all.filter((l) => world.roomsById.get(l.roomId).floor === f);
      const wants = wantFloors.get(f)?.size || 0;
      if (!offered.length && floor !== f) { run.push(f); continue; }
      flush();
      const fit = offered.filter((l) => meAccepts.has(l.id)).length;
      const dots = offered.map((l) => (meAccepts.has(l.id) ? '<i class="fit"></i>' : "<i></i>")).join("") + Array.from({ length: Math.min(wants, 8) }, () => '<i class="want"></i>').join("");
      const cnt = fit ? `<b>${fit} fit${fit === 1 ? "s" : ""} you</b> · ${offered.length} offered` : offered.length ? `${offered.length} offered` : "";
      out.push(`<button class="floorrow ${offered.length ? "" : "fl-empty"} ${fit ? "fits" : ""}" data-act="floor" data-id="${f}" aria-pressed="${floor === f}" aria-label="Floor ${f}, ${offered.length} offered${fit ? `, ${fit} fit what you want` : ""}">` +
        `<span class="fl">${f}</span><span class="dots">${dots}</span><span class="cnt">${cnt}</span></button>`);
    }
    flush();
    out.push(`</div>`);
  } else if (d.towers.length) {
    out.push(`<p class="sub" style="margin-top:10px">Pick a tower to open it up floor by floor.</p>`);
  }

  const list = listingsFor(world, dormId, towerId, floor);
  list.sort((a, b) => (meAccepts.has(b.id) ? 1 : 0) - (meAccepts.has(a.id) ? 1 : 0) || world.roomsById.get(a.roomId).floor - world.roomsById.get(b.roomId).floor);
  out.push(`<div class="section-label">${floor != null ? `Floor ${floor}` : "Rooms offered"} <span style="font-weight:500">${list.length}</span></div>`);
  if (!list.length) {
    if (floor != null) out.push(`<div class="card"><p class="note" style="margin:0">Quiet floor. No rooms offered here yet.</p></div>`);
    else out.push(emptyState("Nobody here has posted yet", `Post your room and you might start the first loop in ${d.short}.`, `<button class="btn primary" data-act="tab" data-id="post">Post my room</button>`));
  } else {
    out.push(list.map((l) => listingCard(world, l)).join(""));
  }
  out.push(footerNote());
  out.push(`</div>`);
  return out.join("");
}

/** Rooms on the open floor that matter (offered, or yours), keyed by room number. */
export function floorMarks(app) {
  const world = app.world;
  const { dormId, towerId, floor } = app.route;
  const ok = world.accept.get(world.meListingId) || new Set();
  const marks = new Map();
  world.rooms.forEach((r) => {
    if (r.dormId !== dormId || r.floor !== floor || (towerId && r.towerId !== towerId)) return;
    const ls = world.listingByRoom.get(r.id) || [];
    marks.set(r.number, { type: r.type, listed: ls.length > 0, fits: ls.some((l) => ok.has(l.id)), me: r.occupants.includes(ME.personId), listingId: ls[0]?.id });
  });
  return marks;
}

/** The 2D floor plan card (kept for reference; the map now opens floors in 3D). */
export function planCard(app) {
  const { dormId, towerId, floor } = app.route;
  const d = dormsById.get(dormId);
  const t = towerId ? d.towers.find((x) => x.id === towerId) : null;
  const marks = floorMarks(app);
  const plan = floorPlanSvg(dormId, floor, { rooms: marks, hot: app.ui.hotRoom });
  const extra = plan.missing.length ? `<div class="plan-legend">Also offered on this floor: ${plan.missing.map((n) => `<b>${esc(n)}</b>`).join(", ")}</div>` : "";
  const minW = 0; // the plan always shrinks to the card width (no sideways scrolling on phones)
  return `<div class="plan-card" role="region" aria-label="Typical floor layout">` +
    `<div class="plan-head"><b>${esc(t ? `${d.short} ${t.name}` : d.short)} · Floor ${floor}</b><span>Typical floor layout</span></div>` +
    `<div class="plan-scroll" style="overflow:auto;min-height:0;flex:1 1 auto"><div style="${minW ? `width:${minW}px` : ""}">${plan.svg}</div></div>` +
    `<div class="plan-legend"><span><i style="background:var(--surface)"></i>Single</span><span><i style="background:var(--surface-2)"></i>Double</span><span><i style="background:var(--surface-3)"></i>Triple</span><span><i class="dot"></i>Offered</span>${plan.note ? `<span>${esc(plan.note)}</span>` : ""}</div>${extra}</div>`;
}

export { shortName };
