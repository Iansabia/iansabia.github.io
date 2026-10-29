// Shared UI pieces: listing card, profile, match card, loop diagram, BU swap timeline.
import { esc, icon } from "./dom.js";
import { avatarSvg } from "../avatars.js";
import { loopStyle } from "../loopcolors.js";
import { dormsById, wantsText, roomCode, cycleKey, confirmedIn, store, hasAlt, ME, cap } from "../engine.js";

export const shortName = (p) => (p ? `${p.first} ${p.name.split(" ").slice(-1)[0][0]}.` : "Someone");
export const yearLine = (p) => (p ? `Class of ${p.year} · ${p.major}` : "");

export function av(person, size = 40, opts = {}) {
  return avatarSvg(person, { size, ...opts });
}

export function igChip(p) {
  return `<span class="chip ig" title="Demo handle, not a real account" aria-label="Instagram handle ${esc(p.instagram)} (demo, not a real account)">${icon("camera")}@${esc(p.instagram)}</span>`;
}

export function vibeChips(p, max = 4) {
  const v = p.vibe || {};
  const out = [];
  out.push(v.sleep === "late" ? `<span class="chip">${icon("moonSmall", "xs")}Night owl</span>` : `<span class="chip">${icon("sunrise", "xs")}Early bird</span>`);
  if (v.tidy >= 4) out.push(`<span class="chip">${icon("sparkle", "xs")}Tidy</span>`);
  else if (v.tidy <= 2) out.push(`<span class="chip">Relaxed about mess</span>`);
  if (v.social >= 4) out.push(`<span class="chip">${icon("users", "xs")}Social</span>`);
  else if (v.social <= 2) out.push(`<span class="chip">Quiet</span>`);
  return out.slice(0, max).join("");
}

export function typeChip(type) {
  return `<span class="chip">${esc(cap(type))}</span>`;
}

/** Is this listing in a loop (any found loop) that includes ME? */
export function inLoopWithMe(world, listingId) {
  if (listingId === world.meListingId) return false;
  return world.mine.chains.some((c) => c.includes(listingId)) || world.mine.direct.some((c) => c.includes(listingId));
}

/**
 * @param {object} world
 * @param {object} l listing
 * @param {{demoAs?: string, ringPerson?: string, socialPressed?: string, compact?: boolean}} opts
 */
export function listingCard(world, l, opts = {}) {
  const p = world.peopleById.get(l.personId);
  const room = world.roomsById.get(l.roomId);
  const mine = l.id === world.meListingId && !opts.demoAs;
  const staying = (room?.occupants || []).filter((id) => id !== l.personId).map((id) => world.peopleById.get(id)).filter(Boolean);
  const loopMe = !opts.demoAs && inLoopWithMe(world, l.id);
  const wantRoom = !opts.demoAs && hasAlt("room", l.roomId);
  const parts = [];
  parts.push(`<article class="card ${loopMe ? "inloop" : ""}" id="card-${esc(l.id)}" data-listing="${esc(l.id)}">`);
  if (loopMe) parts.push(`<div class="inloop-line">${icon("loop", "sm")}In a loop with you</div>`);
  if (mine) parts.push(`<div class="inloop-line">${icon("person", "sm")}Your room</div>`);
  parts.push(`<div class="card-top">${opts.demoAs || !room ? `<span class="room-code">${esc(roomCode(world, room))}</span>` : `<button class="room-code room-link" data-act="seeroom" data-id="${esc(l.id)}" aria-label="See ${esc(roomCode(world, room))} in 3D">${esc(roomCode(world, room))}${icon("chevron", "xs")}</button>`}${typeChip(room?.type || "room")}</div>`);
  parts.push(`<div class="person"><button class="av" data-act="person" data-id="${esc(p.id)}" aria-label="Open ${esc(p.name)}'s profile">${av(p, 44, { verified: true })}</button>` +
    `<div class="who"><div class="nm">${esc(mine ? "You are leaving" : `${shortName(p)} is leaving`)}</div><div class="ln">${esc(yearLine(p))}</div></div></div>`);
  parts.push(`<p class="wants">Wants: <b>${esc(wantsText(world, l.wants))}</b></p>`);
  if (l.note && !opts.compact) parts.push(`<p class="note">${esc(l.note)}</p>`);
  if (staying.length) {
    parts.push(`<div class="divider"></div><div class="staying-label">Staying</div>`);
    staying.forEach((s) => {
      const pressed = opts.demoAs ? opts.socialPressed === s.id : hasAlt("person", s.id);
      parts.push(`<div class="staying"><div class="person"><button class="av" data-act="person" data-id="${esc(s.id)}" aria-label="Open ${esc(s.name)}'s profile">${av(s, 36)}</button>` +
        `<div class="who"><div class="nm" style="font-size:15px">${esc(shortName(s))}</div><div class="ln">${esc(yearLine(s))}</div></div></div>` +
        `<div class="vibes">${vibeChips(s, 2)}${igChip(s)}</div>`);
      if (!mine && s.id !== ME.personId) {
        const ring = opts.ringPerson === s.id && !pressed ? " ring" : "";
        parts.push(`<div class="card-actions"><button class="btn ${pressed ? "done" : "tinted"} social-btn${ring}" data-act="${opts.demoAs ? "noop" : "roomwith"}" data-id="${esc(s.id)}" data-room="${esc(l.roomId)}" aria-pressed="${pressed}">` +
          (pressed ? `${icon("check")}Rooming with ${esc(s.first)} is on your list` : `${icon("heart")}I'd room with ${esc(s.first)}`) + `</button></div>`);
      }
      parts.push(`</div>`);
    });
  }
  if (!mine && !opts.demoAs && !opts.compact) {
    parts.push(`<div class="card-actions"><button class="btn ${wantRoom ? "done" : "primary"}" data-act="wantroom" data-room="${esc(l.roomId)}" aria-pressed="${wantRoom}">${wantRoom ? `${icon("check")}On your list` : "I want this room"}</button>` +
      `<button class="btn secondary" data-act="person" data-id="${esc(p.id)}">Profile</button></div>`);
  }
  parts.push(`</article>`);
  return parts.join("");
}

export function profileView(world, personId, { back = true } = {}) {
  const p = world.peopleById.get(personId);
  if (!p) return `<div class="view"><p>Profile not found.</p></div>`;
  const room = world.rooms.find((r) => r.occupants.includes(personId));
  const listing = world.listingByPerson.get(personId);
  const isMe = personId === ME.personId;
  const out = [];
  out.push(`<div class="view">`);
  if (back) out.push(`<div class="vhead"><button class="back" data-act="back" aria-label="Back">${icon("back")}</button><div class="titles"></div></div>`);
  out.push(`<div class="profile-hero">${av(p, 104, { verified: true })}<h2>${esc(p.name)}${isMe ? " (you)" : ""}</h2>` +
    `<div class="ln">${esc(yearLine(p))}</div><div class="ln">${esc(p.hometown)}</div><p class="bio">${esc(p.bio)}</p></div>`);
  if (room) out.push(`<div class="section-label">Room now</div><div class="group"><div class="row" style="min-height:48px"><span class="room-code" style="font-size:14px;color:var(--text)">${esc(roomCode(world, room))}</span></div></div>`);
  out.push(`<div class="section-label">Into</div><div class="chips">${p.interests.slice(0, 6).map((i) => `<span class="chip">${esc(i)}</span>`).join("")}</div>`);
  out.push(`<div class="section-label">Vibe</div><div class="chips">${vibeChips(p, 4)}</div>`);
  out.push(`<div class="section-label">Instagram</div><div class="chips">${igChip(p)}</div>`);
  if (listing) {
    out.push(`<div class="section-label">${isMe ? "Your room" : "Their room is up for swap"}</div>${listingCard(world, listing)}`);
  } else if (room && !isMe) {
    const leaving = world.listings.filter((l) => l.roomId === room.id);
    if (leaving.length) {
      const lp = world.peopleById.get(leaving[0].personId);
      const pressed = hasAlt("person", p.id);
      out.push(`<div class="section-label">Staying put</div><div class="card"><p class="wants" style="margin:0">${esc(p.first)} is staying in ${esc(world.roomLabel(room.id))}. ${esc(lp.first)}'s spot there is up for swap.</p>` +
        `<div class="card-actions"><button class="btn ${pressed ? "done" : "tinted"}" data-act="roomwith" data-id="${esc(p.id)}" data-room="${esc(room.id)}">${pressed ? `${icon("check")}Rooming with ${esc(p.first)} is on your list` : `${icon("heart")}I'd room with ${esc(p.first)}`}</button></div></div>`);
    }
  }
  out.push(`</div>`);
  return out.join("");
}

// ---------- loop diagram ----------
export function loopDiagram(world, cycle, { size = 112, meId = world.meListingId, okIds = [] } = {}) {
  const k = cycle.length;
  const c = 56, R = k === 2 ? 30 : 36, a = 26;
  const pts = k === 2 ? [[c - 30, c, Math.PI], [c + 30, c, 0]] : cycle.map((_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / k;
    return [c + R * Math.cos(ang), c + R * Math.sin(ang), ang];
  });
  const mid = `m${Math.random().toString(36).slice(2, 8)}`;
  const ai = k > 2 && loopStyle(cycle).ai;
  const stroke = ai ? `url(#${mid}g)` : "currentColor";
  const parts = [`<svg class="loopdiag" viewBox="0 0 112 112" role="img" aria-label="Loop of ${k}: each person moves into the next person's room" style="color:${k === 2 ? "var(--ink)" : "var(--loop, var(--accent))"}">`,
    `<defs>${ai ? `<linearGradient id="${mid}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--ai-0)"/><stop offset="0.38" style="stop-color:var(--ai-1)"/><stop offset="0.7" style="stop-color:var(--ai-2)"/><stop offset="1" style="stop-color:var(--ai-3)"/></linearGradient>` : ""}<marker id="${mid}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1L9 5L1 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`];
  for (let i = 0; i < k; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % k];
    let s, e, mx, my;
    if (k === 2) {
      const up = i === 0 ? -1 : 1;
      s = [p1[0] + (i === 0 ? 6 : -6), p1[1] + up * 14];
      e = [p2[0] + (i === 0 ? -6 : 6), p2[1] + up * 14];
      mx = c; my = c + up * 34;
    } else {
      const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
      const L = Math.hypot(dx, dy) || 1;
      const sh = a / 2 + 3;
      s = [p1[0] + (dx / L) * sh, p1[1] + (dy / L) * sh];
      e = [p2[0] - (dx / L) * sh, p2[1] - (dy / L) * sh];
      const ma = p1[2] + Math.PI / k;
      mx = (s[0] + e[0]) / 2 + Math.cos(ma) * 10;
      my = (s[1] + e[1]) / 2 + Math.sin(ma) * 10;
    }
    parts.push(`<path d="M${s[0].toFixed(1)} ${s[1].toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${e[0].toFixed(1)} ${e[1].toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" marker-end="url(#${mid})"/>`);
  }
  cycle.forEach((id, i) => {
    const l = world.listingsById.get(id);
    const p = l && world.peopleById.get(l.personId);
    if (!p) return;
    const ring = okIds.includes(id) ? "var(--success-dot)" : id === meId ? (ai ? stroke : "var(--loop, var(--accent))") : null;
    const x = pts[i][0] - a / 2, y = pts[i][1] - a / 2;
    if (ring) parts.push(`<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="${a / 2 + 2.2}" fill="none" stroke="${ring}" stroke-width="2.4"/>`);
    parts.push(av(p, a).replace("<svg ", `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" `));
  });
  parts.push(`</svg>`);
  return parts.join("");
}

// ---------- BU swap timeline ----------
/**
 * @param {{ statuses?: string[], active?: number, confirmedIds?: string[], showConfirm?: boolean }} opts
 */
export function timeline(world, cycle, opts = {}) {
  const steps = world.swaps(cycle);
  const k = cycle.length;
  const ok = opts.confirmedIds || confirmedIn(world, cycle);
  const firstRoom = world.listingsById.get(cycle[0])?.roomId;
  const out = [`<div class="timeline">`];
  out.push(`<div class="tl-row ${ok.length === k ? "complete" : opts.active === -1 ? "active" : ""}" data-step="0"><div class="tl-num">${ok.length === k ? icon("check", "xs") : "0"}</div>` +
    `<div><div class="tl-title">Everyone confirms first</div><div class="confirm-row">` +
    cycle.map((id) => { const p = world.peopleById.get(world.listingsById.get(id)?.personId); return `<span class="av-wrap ${ok.includes(id) ? "ok" : ""}" data-conf="${esc(id)}">${av(p, 26)}</span>`; }).join("") +
    `</div><div class="tl-sub"><span class="conf-n">${ok.length}</span> of ${k} confirmed</div></div><span></span></div>`);
  steps.forEach((s, i) => {
    const pa = world.peopleById.get(s.aPersonId), pb = world.peopleById.get(s.bPersonId);
    const st = (opts.statuses && opts.statuses[i]) || (ok.length === k ? (i === 0 ? "ready" : "wait") : "wait");
    const label = { wait: "Waiting", ready: "Ready to file", filed: "Filed", ok: "Approved" }[st];
    const cls = st === "ok" ? "complete" : opts.active === i ? "active" : opts.active != null && opts.active < i ? "pending" : "";
    const holding = i > 0 ? `<div class="holding">Holding ${esc(world.roomLabel(firstRoom))} for now</div>` : "";
    out.push(`<div class="tl-row ${cls}" data-step="${i + 1}"><div class="tl-num">${st === "ok" ? icon("check", "xs") : i + 1}</div><div>` +
      `<div class="tl-title">Swap ${i + 1} of ${k - 1}</div>` +
      `<div class="tl-pair">${av(pa, 22)}<b style="font-size:14px">${esc(pa?.first)}</b>${icon("swap")}${av(pb, 22)}<b style="font-size:14px">${esc(pb?.first)}</b></div>` +
      `<div class="tl-text">${esc(s.text)}</div>${holding}<div class="tl-sub">Filed as a BU Direct Swap</div></div>` +
      `<span class="status ${st}" data-status="${i}">${label}</span></div>`);
  });
  out.push(`</div><div class="tl-foot">Fall window closes Nov 30, 2026. Spring window: Jan 15 to Feb 11, 2027. BU approves each swap.</div>`);
  return out.join("");
}

// ---------- match card ----------
export function matchCard(world, cycle, { open = false, meId = world.meListingId, title, expanded = null } = {}) {
  const k = cycle.length;
  const key = cycleKey(cycle);
  const i = cycle.indexOf(meId);
  const me = world.listingsById.get(meId);
  const next = world.listingsById.get(cycle[(i + 1) % k]);
  const prev = world.listingsById.get(cycle[(i - 1 + k) % k]);
  const ex = world.explain(cycle);
  const ok = confirmedIn(world, cycle);
  const iConfirmed = store.confirmed.has(key);
  const prevP = world.peopleById.get(prev.personId);
  const inBest = world.best.some((c) => cycleKey(c) === cycleKey(rotateToMin(cycle)));
  const meP = world.peopleById.get(me.personId);
  const youLabel = meId === world.meListingId ? "You" : meP.first;
  const out = [];
  out.push(`<article class="card match ${k > 2 ? loopStyle(cycle).cls : "loop-pair"}" id="match-${esc(key)}" data-key="${esc(key)}">`);
  out.push(`<div class="match-head"><span class="chip ${k === 2 ? "" : "on"}">${k === 2 ? `${icon("swap", "xs")}Direct swap` : `${icon("loop", "xs")}Chain of ${k}`}</span>` +
    `<span class="room-code">${ok.length} of ${k} confirmed</span></div>`);
  if (title) out.push(`<div class="tl-title">${esc(title)}</div>`);
  out.push(`<div class="match-body">${loopDiagram(world, cycle, { meId, okIds: ok })}<div class="move-to">` +
    `<div class="lbl">${esc(youLabel)} move${youLabel === "You" ? "" : "s"} to</div><div class="val">${esc(world.roomLabel(next.roomId))}</div>` +
    `<div class="lbl">${youLabel === "You" ? "Your" : esc(meP.first + "'s")} room goes to</div><div class="person" style="gap:6px;margin-top:3px">${av(prevP, 22)}<span style="font-size:15px;font-weight:600">${esc(shortName(prevP))}</span></div>` +
    (inBest ? `<div class="chip ok" style="margin-top:8px">${icon("check", "xs")}In the best plan</div>` : "") +
    `</div></div>`);
  // each person opens in place: the room they're leaving, who stays in it, their profile
  out.push(`<ul class="reasons">` + ex.map((h) => {
    const L = world.listingsById.get(h.from);
    const p = world.peopleById.get(L.personId);
    const to = world.listingsById.get(h.to);
    const nm = h.from === world.meListingId ? "You" : p.first;
    const isOpen = expanded === h.from;
    return `<li class="${isOpen ? "open" : ""}"><button class="who-row" data-act="mperson" data-key="${esc(key)}" data-id="${esc(h.from)}" aria-expanded="${isOpen}">${av(p, 24)}<span><b>${esc(nm)}</b> to ${esc(world.roomLabel(to.roomId))}<br><span class="r">${esc(cap(h.reason))}. <span class="kind">${esc(moveWord(h.move))}</span></span></span>${icon("chevron", "sm")}</button>` +
      (isOpen ? personDetail(world, L) : "") + `</li>`;
  }).join("") + `</ul>`);
  if (meId === world.meListingId) {
    out.push(`<div class="card-actions"><button class="btn ${iConfirmed ? "done" : "primary"}" data-act="confirm" data-key="${esc(key)}">${iConfirmed ? `${icon("check")}Confirmed` : "Confirm my spot"}</button>` +
      `<button class="btn secondary" data-act="showloop" data-key="${esc(key)}">${icon("map")}See on map</button></div>`);
  }
  if (open) out.push(`<div class="divider"></div>${timeline(world, cycle)}`);
  else out.push(`<button class="btn ghost wide" style="margin-top:6px" data-act="openloop" data-key="${esc(key)}">How BU files it: ${k - 1} swap${k - 1 === 1 ? "" : "s"}</button>`);
  out.push(`</article>`);
  return out.join("");
}

/** One student in a match, opened: the room they would leave, who stays in it, and links. */
function personDetail(world, L) {
  const p = world.peopleById.get(L.personId);
  const room = world.roomsById.get(L.roomId);
  const mine = L.id === world.meListingId;
  const staying = (room?.occupants || []).filter((id) => id !== L.personId).map((id) => world.peopleById.get(id)).filter(Boolean);
  const out = [`<div class="who-detail">`];
  out.push(`<div class="wd-room"><span class="lbl">${mine ? "You're leaving" : `${esc(p.first)} is leaving`}</span><span class="val">${esc(roomCode(world, room))}</span>${typeChip(room?.type || "room")}</div>`);
  if (!mine && p.bio) out.push(`<p class="wd-bio">${esc(p.bio)}</p>`);
  out.push(`<div class="staying-label">${staying.length ? "Roommate staying" + (staying.length > 1 ? "s" : "") : "Nobody stays"}</div>`);
  if (staying.length) {
    out.push(staying.map((s) => `<button class="wd-mate" data-act="person" data-id="${esc(s.id)}">${av(s, 30)}<span class="body"><span class="nm">${esc(shortName(s))}</span><span class="ln">${esc(yearLine(s))}</span></span>${icon("chevron", "sm")}</button>`).join(""));
  } else out.push(`<p class="wd-bio" style="margin-top:0">The whole room is free when ${mine ? "you move" : `${esc(p.first)} moves`}.</p>`);
  out.push(`<div class="card-actions">` + (mine ? "" : `<button class="btn secondary" data-act="person" data-id="${esc(p.id)}">${icon("person")}${esc(p.first)}'s profile</button>`) +
    `<button class="btn tinted" data-act="seeroom" data-id="${esc(L.id)}">${icon("map")}See the room</button></div>`);
  out.push(`</div>`);
  return out.join("");
}

function moveWord(m) {
  return { dorm: "new dorm", tower: "new tower", floor: "new floor", room: "new room" }[m] || m;
}

export function rotateToMin(c) {
  let b = 0;
  for (let i = 1; i < c.length; i++) if (cmp(c[i], c[b]) < 0) b = i;
  return c.slice(b).concat(c.slice(0, b));
}
function cmp(a, b) {
  const na = parseInt(a.replace(/\D/g, ""), 10), nb = parseInt(b.replace(/\D/g, ""), 10);
  return na - nb;
}

export function footerNote() {
  return `<div class="footer-note"><p>Prototype with made-up students. Not affiliated with Boston University.</p><p>Map data © OpenStreetMap contributors</p></div>`;
}

export function emptyState(title, body, btn) {
  return `<div class="empty">${icon("knot")}<h3>${esc(title)}</h3><p>${esc(body)}</p>${btn || ""}</div>`;
}

export function dormName(id) { return dormsById.get(id)?.name || id; }
