// SwapChain app shell: layout, routing, panel/sheet, map sync, actions.
import { store, recompute, resetStore, toggleAlt, hasAlt, DORMS, dormsById, DEMO, ME, cycleKey, dormStats } from "./engine.js";
import { initTheme, setMode, getMode, isDark, onThemeChange, reducedMotion } from "./theme.js";
import { esc, icon, toast, LOGO } from "./ui/dom.js";
import { avatarSvg } from "./avatars.js";
import { exploreHome, buildingView, loopView, findLoop, floorMarks, floorsWithListings, floorsThatFit } from "./ui/explore.js";
import { createLive } from "./ui/live.js";
import { createChat } from "./ui/chat.js";
import { matchesView, profileTab } from "./ui/matches.js";
import { postView, postAction, postInput, draftMatches } from "./ui/post.js";
import { profileView, shortName } from "./ui/cards.js";
import { createDemo } from "./ui/demo.js";

const params = new URLSearchParams(location.search);
const EMBED = params.get("embed") === "phone" || params.get("phone") === "1";
const root = document.documentElement;
const phone = root.dataset.layout === "phone";
const TOPH = EMBED ? 96 : 56;
const TABH = EMBED ? 80 : 64;
initTheme(params.get("theme"));

const TABS = [
  { id: "explore", label: "Explore", icon: "map" },
  { id: "matches", label: "Matches", icon: "loop" },
  { id: "post", label: "Post", icon: "plus" },
  { id: "demo", label: "Chain Demo", short: "Demo", icon: "playCircle" },
  { id: "profile", label: "Profile", icon: "person" },
];

const $ = (s) => document.querySelector(s);
const panel = $("#panel");
const scroller = $("#panel-scroll");
const planEl = $("#plan");

const app = {
  phone,
  route: { tab: "explore" },
  stack: [],
  ui: { search: "", filter: "all", openLoop: null, hotRoom: null, focusLoop: null },
  post: { step: 0, draft: null },
  world: null,
  map: null,
  demo: null,
  sheet: "peek",
};
const live = createLive(app, { reducedMotion });
const chat = createChat(app, { reducedMotion });
window.__swapchain = app; // handy for QA in the console

// ---------------- world ----------------
function positionsResolver(id) {
  const w = app.world;
  let l = w.listingsById.get(id);
  let r, person;
  if (l) { r = w.roomsById.get(l.roomId); person = w.peopleById.get(l.personId); }
  else if (id === DEMO.liveAdd.listing.id) { l = DEMO.liveAdd.listing; r = DEMO.liveAdd.room; person = DEMO.liveAdd.person; }
  if (!l || !r) return null;
  return { roomId: r.id, dormId: r.dormId, towerId: r.towerId, floor: r.floor, number: r.number, person };
}
function positionListings() {
  const ls = [...app.world.listings];
  if (!ls.some((l) => l.id === DEMO.liveAdd.listing.id)) ls.push(DEMO.liveAdd.listing);
  return ls;
}

function onWorld() {
  if (!app.map) return;
  if (app.route.tab !== "demo") app.map.setWorld(positionListings(), positionsResolver);
  const badges = {};
  DORMS.forEach((d) => { badges[d.id] = dormStats(app.world, d.id).offered; });
  app.map.setBadges(badges);
  app.map.setFloorsWithListings(floorsWithListings(app.world), floorsThatFit(app.world));
}

// ---------------- chrome ----------------
function buildChrome() {
  $("#logo").innerHTML = LOGO;
  const tabBtn = (t, cls) => `<button role="tab" data-act="tab" data-id="${t.id}" aria-selected="false" class="${cls || ""}">${icon(t.icon)}<span>${phone && t.short ? t.short : t.label}</span><span class="badge" data-badge="${t.id}" hidden></span></button>`;
  // desktop: your avatar (top right) already opens Profile, so the top tabs leave it out
  $("#topnav").innerHTML = TABS.filter((t) => phone || t.id !== "profile").map((t) => tabBtn(t)).join("");
  $("#tabbar").innerHTML = TABS.map((t) => tabBtn(t)).join("");
  const now = new Date();
  const fallEnd = new Date(2026, 10, 30, 23, 59);
  const springStart = new Date(2027, 0, 15);
  const pill = $("#window-pill span");
  const short = phone || window.innerWidth < 1380;
  if (now <= fallEnd) pill.textContent = short ? "Swaps open · Nov 30" : "Fall swap window open until Nov 30";
  else if (now < springStart) pill.textContent = "Next window opens Jan 15";
  else pill.textContent = phone ? "Swaps open · Feb 11" : "Spring swap window open until Feb 11";
  $("#preview-btn").innerHTML = `${icon("phone")}<span class="lbl">Phone preview</span>`;
  $("#preview-btn").setAttribute("aria-label", "Phone preview");
  if (EMBED) $("#preview-btn").remove();
  $("#me-btn").innerHTML = avatarSvg(store.people.find((p) => p.id === ME.personId), { size: phone ? 32 : 34 });
  $("#map-ctrls").innerHTML =
    `<button class="desk-only" data-act="zoomin" aria-label="Zoom in">${icon("zoomIn")}</button>` +
    `<button class="desk-only" data-act="zoomout" aria-label="Zoom out">${icon("zoomOut")}</button>` +
    `<button class="desk-only" data-act="tilt" aria-label="Toggle tilt">${icon("tilt")}</button>` +
    `<button data-act="resetview" aria-label="Reset view">${icon("reset")}</button>`;
  updateThemeBtn();
}

// Light and dark switch smoothly instead of snapping, which is hard on the eyes: panels and text ease
// to the new colors, while the 3D map dips out, takes its new colors while hidden (that rebuild is the
// slow part), and fades back in. About 0.6 s, and nothing waits on a full-page snapshot.
let themeBusy = false;
function fadeTheme(change) {
  const mapEl = document.getElementById("map");
  if (reducedMotion() || !mapEl || themeBusy) { change(); return; }
  themeBusy = true;
  root.classList.add("theme-anim");
  mapEl.classList.add("theme-dip");
  setTimeout(() => {
    change();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      mapEl.classList.remove("theme-dip");
      setTimeout(() => { root.classList.remove("theme-anim"); themeBusy = false; }, 420);
    }));
  }, 200);
}

function updateThemeBtn() {
  const m = getMode();
  const b = $("#theme-btn");
  if (!b) return;
  b.innerHTML = icon(isDark() ? "moon" : "sun");
  b.setAttribute("aria-label", `Appearance: ${isDark() ? "Dark" : "Light"}${m === "auto" ? " (Auto)" : ""}. Click for ${isDark() ? "light" : "dark"}.`);
  b.title = b.getAttribute("aria-label");
}

function updateTabs() {
  document.querySelectorAll("[role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.id === app.route.tab)));
  const n = app.world.mine.chains.length + app.world.mine.direct.length;
  document.querySelectorAll('[data-badge="matches"]').forEach((b) => { b.hidden = !n || app.route.tab === "matches"; b.textContent = String(n); });
  panel.setAttribute("aria-label", TABS.find((t) => t.id === app.route.tab)?.label || "Panel");
}

// ---------------- panel / sheet ----------------
app.setPanelHtml = (html, { keepScroll = false } = {}) => {
  const y = scroller.scrollTop;
  scroller.innerHTML = html;
  if (keepScroll) scroller.scrollTop = y;
  else scroller.scrollTop = 0;
  bindInputs();
};

function sheetHeights() {
  const H = window.innerHeight;
  const top = TOPH, tab = TABH;
  return { peek: app.route.tab === "demo" ? 176 : 156, half: Math.round(H * 0.5), full: H - top - tab - 8 };
}
function setSheet(name, h) {
  if (!phone) return;
  app.sheet = name;
  const hs = sheetHeights();
  const px = h != null ? h : hs[name] || hs.peek;
  root.style.setProperty("--sheet-h", `${px}px`);
  $("#grabber").setAttribute("aria-label", name === "full" ? "Collapse panel" : "Expand panel");
}
app.setSheet = (name) => setSheet(name);
app.setSheetFor = (tab, sub) => {
  if (!phone) return;
  // every scene opens at peek so the map stays big; the timeline and cards are one swipe away
  if (tab === "demo") { void sub; setSheet("peek"); }
};

function sheetDrag() {
  if (!phone) return;
  let start = null;
  const onDown = (e) => {
    const zone = e.target.closest("#grabber, [data-drag]");
    if (!zone) return;
    start = { y: e.clientY, h: panel.getBoundingClientRect().height, t: performance.now(), moved: false, id: e.pointerId, last: e.clientY, lt: performance.now(), v: 0 };
  };
  const onMove = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dy = e.clientY - start.y;
    if (!start.moved && Math.abs(dy) < 6) return;
    if (!start.moved) { start.moved = true; panel.classList.add("dragging"); try { panel.setPointerCapture(e.pointerId); } catch (err) { /* ok */ } }
    const hs = sheetHeights();
    const h = Math.max(110, Math.min(hs.full, start.h - dy));
    const now = performance.now();
    start.v = (e.clientY - start.last) / Math.max(1, now - start.lt);
    start.last = e.clientY; start.lt = now;
    root.style.setProperty("--sheet-h", `${h}px`);
  };
  const onUp = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const s = start;
    start = null;
    panel.classList.remove("dragging");
    if (!s.moved) {
      if (e.target.closest("#grabber")) setSheet(app.sheet === "peek" ? "half" : app.sheet === "half" ? "full" : "peek");
      return;
    }
    const hs = sheetHeights();
    const h = panel.getBoundingClientRect().height;
    const order = ["peek", "half", "full"];
    let name;
    if (Math.abs(s.v) > 0.5) {
      const cur = order.reduce((a, b) => (Math.abs(hs[b] - h) < Math.abs(hs[a] - h) ? b : a));
      const i = order.indexOf(cur);
      name = s.v < 0 ? order[Math.min(2, i + (hs[cur] < h ? 1 : 0) || i + 1)] : order[Math.max(0, i - (hs[cur] > h ? 1 : 0) || i - 1)];
      if (s.v < 0 && hs[name] < h) name = order[Math.min(2, order.indexOf(name) + 1)];
      if (s.v > 0 && hs[name] > h) name = order[Math.max(0, order.indexOf(name) - 1)];
    } else {
      name = order.reduce((a, b) => (Math.abs(hs[b] - h) < Math.abs(hs[a] - h) ? b : a));
    }
    setSheet(name);
  };
  panel.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

function counterBottom() {
  const c = document.querySelector(".counter");
  if (!c || !document.getElementById("app").classList.contains("demo-on") || c.style.opacity === "0") return 0;
  const r = c.getBoundingClientRect();
  return r.height ? r.bottom : 0;
}
function freeArea(wide = false) {
  const W = window.innerWidth, H = window.innerHeight;
  const demo = app.route.tab === "demo";
  if (phone) {
    const sh = parseFloat(getComputedStyle(root).getPropertyValue("--sheet-h")) || 156;
    const cb = demo ? counterBottom() : 0;
    return { left: 0, right: W, top: cb ? cb + 4 : TOPH, bottom: H - TABH - sh };
  }
  const left = 16 + (demo ? 440 : 400) + 16;
  // in the demo the counter card sits top right; keep the action below it
  const cb = demo && !wide ? counterBottom() : 0;
  // the Ask panel covers the right side while it is open
  const chatOpen = !demo && root.classList.contains("chat-open");
  return { left, right: demo ? W - 16 : chatOpen ? W - 16 - 400 - 24 : W - 70, top: cb ? cb + 6 : 64, bottom: H - 32 };
}

// ---------------- routing ----------------
app.go = (route, { push = true } = {}) => {
  const prev = app.route;
  tip.classList.remove("on");
  if (push && (route.tab === prev.tab)) app.stack.push(prev);
  if (route.tab !== prev.tab) app.stack = [];
  app.route = route;
  if (prev.tab === "demo" && route.tab !== "demo") { app.demo && app.demo.stop(); app.map && app.map.setWorld(positionListings(), positionsResolver); }
  if (route.tab !== prev.tab || route.personId) {
    if (route.personId) setSheet("full");
    else if (route.tab === "explore") setSheet(route.dormId ? "half" : "peek");
    else if (route.tab === "matches") setSheet("half");
    else if (route.tab === "post" || route.tab === "profile") setSheet("full");
    else if (route.tab === "demo") setSheet("peek");
  }
  // phone: opening a floor lowers the sheet so the 3D floor is in view (tap a room to bring it back)
  if (phone && route.tab === "explore" && route.floor != null && prev.floor == null && !route.personId) setSheet("peek"); else if (route.tab === "explore" && route.dormId && !prev.dormId) setSheet("half");
  else if (route.tab === "explore" && !route.dormId && prev.dormId) setSheet("peek");
  try { localStorage.setItem("swapchain.tab", route.tab); } catch (e) { /* optional */ }
  if (route.tab === "demo" && prev.tab !== "demo") {
    panel.classList.add("wide");
    app.render();
    if (app.demo) app.demo.start(route.scene || 0);
    return;
  }
  if (route.tab !== "demo") panel.classList.remove("wide");
  // shared element: the tapped dorm's label pill grows into the panel header
  const pillFrom = route.tab === "explore" && route.dormId && !route.personId && !(prev.tab === "explore" && prev.dormId) && app.map ? app.map.labelRect(route.dormId) : null;
  app.render();
  if (pillFrom) flipPill(route.dormId, pillFrom);
};

/** FLIP: a copy of the map label pill moves and grows to the header title, then hands over to it. */
function flipPill(dormId, from) {
  if (reducedMotion()) return;
  const title = scroller.querySelector(".vhead .title");
  const d = dormsById.get(dormId);
  if (!title || !d) return;
  const range = document.createRange();
  range.selectNodeContents(title);
  const tr = range.getBoundingClientRect();
  if (!tr.width) return;
  let top = tr.top - 10; // the panel view is still 10px into its slide-up
  if (phone) {
    // the sheet is still moving: aim for where the title will be when it settles
    const pr = panel.getBoundingClientRect();
    const sh = parseFloat(getComputedStyle(root).getPropertyValue("--sheet-h")) || pr.height;
    top += window.innerHeight - TABH - sh - pr.top;
  }
  const pill = document.createElement("div");
  pill.className = "flip-pill";
  pill.setAttribute("aria-hidden", "true");
  pill.innerHTML = `<span class="a"></span><span class="b"></span>`;
  pill.querySelector(".a").textContent = d.short;
  pill.querySelector(".b").textContent = d.name;
  document.body.appendChild(pill);
  const big = parseFloat(getComputedStyle(title).fontSize) || 26;
  const ease = "cubic-bezier(0.32, 0.72, 0, 1)";
  const dur = 460;
  title.style.opacity = "0";
  const anim = pill.animate([
    { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, fontSize: "13px", borderRadius: `${from.height / 2}px`, backgroundColor: getComputedStyle(root).getPropertyValue("--glass-strong").trim() || "rgba(255,255,255,0.86)", boxShadow: "0 4px 14px rgba(0,0,0,0.12)", paddingLeft: "11px" },
    { left: `${tr.left}px`, top: `${top}px`, width: `${tr.width + 2}px`, height: `${tr.height}px`, fontSize: `${big}px`, borderRadius: "8px", backgroundColor: "rgba(255,255,255,0)", boxShadow: "0 0 0 rgba(0,0,0,0)", paddingLeft: "0px" },
  ], { duration: dur, easing: ease, fill: "forwards" });
  pill.querySelector(".a").animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur * 0.45, fill: "forwards" });
  pill.querySelector(".b").animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur * 0.6, delay: dur * 0.25, fill: "forwards" });
  const done = () => {
    title.style.transition = "opacity 160ms ease";
    title.style.opacity = "";
    pill.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }).onfinish = () => pill.remove();
    setTimeout(() => { title.style.transition = ""; }, 200);
  };
  anim.onfinish = done;
  anim.oncancel = done;
}

app.back = () => {
  const r = app.route;
  if (r.personId || (app.stack.length && app.stack[app.stack.length - 1].personId && !r.dormId)) {
    const prev = app.stack.pop() || { tab: r.tab };
    app.route = prev;
    if (phone && prev.tab === "explore") setSheet(prev.dormId ? "half" : "peek");
    app.render();
    return;
  }
  if (r.tab === "explore" && r.dormId) {
    // one level at a time: room -> floor -> building -> campus
    if (r.floor != null && app.map && app.map.room) {
      app.ui.hotRoom = null;
      app.map.hotRoom = null;
      app.map.closeRoom();
      app.render();
      return;
    }
    if (r.floor != null) return app.go({ ...r, floor: null }, { push: false });
    if (r.towerId && dormsById.get(r.dormId).towers.length) return app.go({ ...r, towerId: null }, { push: false });
    return app.go({ tab: "explore" }, { push: false });
  }
  if (r.tab === "explore" && r.loopKey) { app.go({ tab: "explore" }, { push: false }); app.map && app.map.goHome(900); return; }
  if (r.tab === "demo") return app.go({ tab: "explore" });
};

app.render = () => {
  const r = app.route;
  app.world = store.world;
  updateTabs();
  let html = "";
  if (r.personId) html = profileView(app.world, r.personId);
  else if (r.tab === "explore") html = r.dormId ? buildingView(app) : r.loopKey ? loopView(app) : exploreHome(app);
  else if (r.tab === "matches") html = matchesView(app);
  else if (r.tab === "post") html = postView(app);
  else if (r.tab === "profile") html = profileTab(app);
  else if (r.tab === "demo") { if (!phone) live.update(app.world); if (app.demo) app.demo.render(); else app.setPanelHtml(`<div class="view"><p class="sub">The Chain Demo needs the 3D map.</p></div>`); syncChrome(); return; }
  const same = app._lastKey === routeKey(r);
  app.setPanelHtml(html, { keepScroll: same });
  if (!same && r.tab === "explore" && r.floor != null) {
    const row = scroller.querySelector('.floorrow[aria-pressed="true"]');
    if (row) row.scrollIntoView({ block: "start" });
  }
  app._lastKey = routeKey(r);
  syncMap();
  syncChrome();
  if (!phone) live.update(app.world);
};
const routeKey = (r) => `${r.tab}|${r.loopKey || ""}|${r.dormId || ""}|${r.towerId || ""}|${r.floor ?? ""}|${r.personId || ""}|${r.tab === "post" ? app.post.step : ""}`;

function syncChrome() {
  const r = app.route;
  $("#legend").classList.toggle("hide", !!r.dormId || r.tab === "demo");
  $("#legend .pair-key").style.display = r.tab === "demo" ? "" : "none";
}

// ---------------- map sync ----------------
function syncMap() {
  const m = app.map;
  if (!m) return;
  const r = app.route;
  if (r.tab === "demo") return;
  m.meId = ME.listingId;
  // selection
  if (r.tab === "explore" && r.dormId) {
    const d = dormsById.get(r.dormId);
    const towerId = d.towers.length ? r.towerId || null : null;
    if (m.sel.dormId !== r.dormId || m.sel.towerId !== towerId) m.selectDorm(r.dormId, towerId);
    if ((m.sel.floor ?? null) !== (r.floor ?? null)) {
      m.selectFloor(r.floor ?? null);
    }
  } else if (!r.personId && m.sel.dormId) {
    m.clearSelection({ fly: r.tab !== "matches" });
  }
  // the open floor: its rooms rise in 3D on the map (no pop-up card)
  if (r.tab === "explore" && r.dormId && r.floor != null) {
    const d = dormsById.get(r.dormId);
    const key = `${d.towers.length ? r.towerId || r.dormId : r.dormId}|${r.floor}`;
    const marks = floorMarks(app);
    const prev = m.floorMarks;
    const same = prev && prev.key === key && prev.marks.size === marks.size && [...marks].every(([k, v]) => { const o = prev.marks.get(k); return o && o.listed === v.listed && o.me === v.me; });
    if (!same) m.setFloorMarks(key, marks);
    if (m.hotRoom !== (app.ui.hotRoom || null)) { m.hotRoom = app.ui.hotRoom || null; m.kick(); }
  } else if (m.hotRoom) { m.hotRoom = null; app.ui.hotRoom = null; }
  planEl.classList.remove("on");
  // threads
  const w = app.world;
  if (r.personId) return;
  const noorStep = r.tab === "post" && (app.post.step === "noor" || app.post.step === "noorresult" || (app.post.step === "searching" && app.post.mode === "noor"));
  const seeLoop = r.tab === "explore" && r.loopKey ? findLoop(w, r.loopKey) : null;
  m.setLabelsDimmed(r.tab === "matches" || noorStep || !!seeLoop);
  const chatLit = app.ui.chat && app.ui.chat.ids.length && r.tab === "explore" && !r.dormId && !r.loopKey;
  if (!(r.tab === "post" && app.post.step === 2) && !chatLit && m.extraPins && m.extraPins.length) m.setExtraPins([]);
  if (seeLoop) {
    // a loop from the Live feed: draw it, pin everyone in it, and frame the whole circle
    const k = `see:${r.loopKey}`;
    m.setXray(seeLoop);
    if (!m.threads.has(k)) m.setThreads([{ id: k, cycle: seeLoop, kind: "loop", focus: true, pins: true, draw: true }]);
    m.setBeads([]);
    if (app._fitKey !== k) { app._fitKey = k; m.fitListings(seeLoop, { pitch: 50 }); }
  } else if (r.tab === "matches") {
    const loops = [...w.mine.chains, ...w.mine.direct];
    const focusKey = app.ui.openLoop && loops.some((c) => cycleKey(c) === app.ui.openLoop) ? app.ui.openLoop : loops[0] && cycleKey(loops[0]);
    const fc = loops.find((c) => cycleKey(c) === focusKey);
    m.setXray(fc || null);
    m.setThreads(loops.map((c) => ({ id: `m:${cycleKey(c)}`, cycle: c, kind: c.length === 2 ? "direct" : "loop", focus: cycleKey(c) === focusKey, pins: cycleKey(c) === focusKey, dim: cycleKey(c) !== focusKey })));
    m.setBeads([]);
    const fk = `${focusKey}`;
    if (app._fitKey !== fk && focusKey) { app._fitKey = fk; const c = loops.find((x) => cycleKey(x) === focusKey); m.fitListings(c, { pitch: 50 }); }
  } else if (app.ui.chat && app.ui.chat.ids.length && r.tab === "explore" && !r.dormId && !r.loopKey) {
    // Ask SwapChain: light what the last answer was about (a loop is drawn, rooms glow in place)
    const ch = app.ui.chat;
    m.setXray(ch.ids);
    if (ch.loop) {
      const k = `chat:${cycleKey(ch.loop)}`;
      if (m.extraPins && m.extraPins.length) m.setExtraPins([]);
      if (!m.threads.has(k)) m.setThreads([{ id: k, cycle: ch.loop, kind: "loop", focus: true, pins: true, draw: true }]);
      if (app._fitKey !== k) { app._fitKey = k; m.fitListings(ch.loop, { pitch: 50 }); }
    } else {
      if (m.threads.size) m.setThreads([]);
      m.setExtraPins(ch.ids.slice(0, 24).map((id) => { const l = w.listingsById.get(id); return { person: w.peopleById.get(l.personId), nearListing: id, offset: [0, 0], label: w.roomsById.get(l.roomId).number, staying: false }; }));
      const fk = `chat:${ch.key}`;
      if (app._fitKey !== fk) { app._fitKey = fk; m.fitListings(ch.ids, { pitch: 52, loop: false, maxZoom: 17.6 }); }
    }
  } else if (r.tab === "post" && app.post.step === 2 && app.post.draft) {
    // what you'd take: light exactly the posted rooms that fit, as you change the picks
    const ids = draftMatches(w, app.post.draft).map((l) => l.id);
    m.setXray(ids.length ? ids : null);
    if (m.threads.size) m.setThreads([]);
    m.setExtraPins(ids.map((id) => { const l = w.listingsById.get(id); return { person: w.peopleById.get(l.personId), nearListing: id, offset: [0, 0], label: w.roomsById.get(l.roomId).number, staying: false }; }));
    const fk = `want:${ids.join(",")}`;
    if (app._fitKey !== fk) { app._fitKey = fk; if (ids.length) m.fitListings(ids, { pitch: 52, loop: false, maxZoom: 17.6 }); else m.goHome(900); }
  } else if (noorStep) {
    m.setXray(null);
    const L = DEMO.scenes.find((s) => s.id === "live-add")?.showcase[0] || [];
    const posted = w.listingsById.has(DEMO.liveAdd.listing.id);
    const existing = m.threads.get("live");
    if (!existing) m.setThreads([{ id: "live", cycle: L, kind: posted ? "loop" : "open", missing: posted ? null : DEMO.liveAdd.listing.id, focus: true, pins: true, draw: true }]);
    if (app._fitKey !== "live") { app._fitKey = "live"; m.fitListings(L, { pitch: 50 }); }
  } else {
    m.setXray(null);
    if (m.extraPins && m.extraPins.length) m.setExtraPins([]);
    if (m.threads.size) m.setThreads([]);
    app._fitKey = null;
  }
}

app.closeOpenThread = () => {
  const m = app.map;
  if (!m) return;
  const t = m.threads.get("live");
  if (t && t.kind === "open") {
    m.closeThread("live", 1.5);
  } else {
    const L = DEMO.scenes.find((s) => s.id === "live-add")?.showcase[0] || [];
    m.setThreads([{ id: "live", cycle: L, kind: "loop", focus: true, pins: true, pull: 1.5 }]);
  }
};

// ---------------- actions ----------------
const actions = {
  tab: (ds) => {
    if (ds.id === app.route.tab && !app.route.dormId && !app.route.personId) {
      if (phone) setSheet(app.sheet === "peek" ? "half" : app.sheet);
      return;
    }
    if (ds.id === "post") { app.post.step = app.post.step === "noorresult" ? 0 : app.post.step; }
    app.go({ tab: ds.id });
  },
  dorm: (ds) => app.go({ tab: "explore", dormId: ds.id, towerId: null, floor: null }),
  tower: (ds) => app.go({ ...app.route, towerId: ds.id, floor: null }, { push: false }),
  floor: (ds) => {
    const f = ds.id === "" ? null : Number(ds.id);
    app.go({ ...app.route, floor: app.route.floor === f ? null : f }, { push: false });
  },
  back: () => app.back(),
  seeroom: (ds) => app.openListingRoom(ds.id),
  recall: () => { app.ui.recAll = !app.ui.recAll; app.render(); },
  // a person in a match opens in place (tap again to close)
  mperson: (ds) => {
    const o = app.ui.openPerson;
    app.ui.openPerson = o && o.key === ds.key && o.id === ds.id ? null : { key: ds.key, id: ds.id };
    app.render();
  },
  person: (ds) => app.go({ ...app.route, personId: ds.id }),
  roomwith: (ds) => {
    const had = hasAlt("person", ds.id);
    const before = app.world.mine.chains.length;
    toggleAlt({ kind: "person", personId: ds.id, roomId: ds.room });
    const p = app.world.peopleById.get(ds.id);
    if (!had) {
      toast(`Added. We'll look for a loop that puts you with ${p.first}.`, { iconName: "heart" });
      const now = app.world.mine.chains.find((c) => app.world.altEdge.get(c[1])?.personId === ds.id);
      if (now && app.world.mine.chains.length > before) setTimeout(() => toast(`You're in a chain of ${now.length}!`, { iconName: "loop" }), 900);
    } else toast(`Removed ${p.first} from your list.`, { iconName: "check" });
  },
  wantroom: (ds) => {
    const had = hasAlt("room", ds.room);
    const before = app.world.mine.chains.length;
    toggleAlt({ kind: "room", roomId: ds.room });
    toast(had ? "Removed from your list." : "Saved to your list.", { iconName: "check" });
    if (!had && app.world.mine.chains.length > before) {
      const c = app.world.mine.chains.find((x) => app.world.altEdge.get(x[1])?.roomId === ds.room) || app.world.mine.chains[0];
      setTimeout(() => toast(`You're in a chain of ${c.length}!`, { iconName: "loop" }), 900);
    }
  },
  filter: (ds) => { app.ui.filter = ds.id; app.render(); },
  confirm: (ds) => {
    if (store.confirmed.has(ds.key)) store.confirmed.delete(ds.key); else { store.confirmed.add(ds.key); toast("Confirmed. We'll file the swaps once everyone confirms.", { iconName: "check" }); }
    app.ui.openLoop = ds.key;
    app.render();
  },
  showloop: (ds) => {
    app.ui.openLoop = ds.key;
    app._fitKey = null;
    if (phone) setSheet("peek");
    app.render();
  },
  openloop: (ds) => { app.ui.openLoop = app.ui.openLoop === ds.key ? null : ds.key; app._fitKey = null; app.render(); const el = document.getElementById(`match-${ds.key}`); el && el.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" }); },
  gotoloop: (ds) => { app.ui.openLoop = ds.key; app._fitKey = null; app.go({ tab: "matches" }); },
  theme: (ds) => fadeTheme(() => { setMode(ds.id); updateThemeBtn(); app.render(); }),
  // the top-bar button is a plain light/dark toggle (Auto lives in Profile settings), so every press changes something
  cycletheme: () => fadeTheme(() => { setMode(isDark() ? "light" : "dark"); updateThemeBtn(); if (app.route.tab === "profile") app.render(); }),
  reset: () => { resetStore(); app.post = { step: 0, draft: null }; app.ui.openLoop = null; toast("Demo data reset.", { iconName: "reset" }); app.render(); },
  zoomin: () => app.map && app.map.zoomBy(0.75),
  zoomout: () => app.map && app.map.zoomBy(-0.75),
  tilt: () => app.map && app.map.toggleTilt(),
  resetview: () => {
    if (!app.map) return;
    if (app.route.tab === "explore" && app.route.dormId) app.go({ tab: "explore" }, { push: false });
    else { app.map.orbit = false; app.map.goHome(900); }
  },
  preview: () => openPreview(),
  closepreview: () => closePreview(),
  noop: () => {},
};

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]");
  if (!t) {
    const room = e.target.closest(".room.listed[data-listing]");
    if (room) openListingFromPlan(room.dataset.listing);
    return;
  }
  const act = t.dataset.act;
  const ds = { ...t.dataset };
  if (act.startsWith("demo") && app.demo) { app.demo.action(act, ds); return; }
  if (act.startsWith("p") && act !== "person" && act !== "preview" && postAction(app, act, ds)) {
    return;
  }
  if (actions[act]) { e.preventDefault(); actions[act](ds, t); }
});

// Fly into the room in 3D: one bed per resident. The leaving student's bed is "Your side";
// roommates who stay get their avatar over their bed (click it for their profile).
function openRoom3d(listingId, number) {
  const w = app.world, l = w.listingsById.get(listingId), room = l && w.roomsById.get(l.roomId);
  if (!room || !app.map) return;
  const cap = { single: 1, double: 2, triple: 3, quad: 4 }[room.type] || Math.max(1, room.occupants.length);
  const face = (p) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(p, { size: 128 }))}`;
  const beds = room.occupants.slice(0, cap).map((pid) => {
    const p = w.peopleById.get(pid);
    if (pid === ME.personId) return { personId: pid, role: "you", avatarUrl: p && face(p), label: "You" };
    if (pid === l.personId) return { personId: pid, role: "free", label: "Your side" };
    return { personId: pid, role: "staying", avatarUrl: p && face(p), label: p ? `${shortName(p)} stays` : "Roommate" };
  });
  while (beds.length < cap) beds.push({ role: "empty" });
  app.map.openRoom(number, beds);
}

/** Go straight to one posted room: its building, its floor, then into the furnished 3D room. */
app.openListingRoom = (listingId) => {
  const w = app.world, l = w.listingsById.get(listingId), room = l && w.roomsById.get(l.roomId);
  if (!room) return;
  const r0 = app.route;
  const here = r0.tab === "explore" && !r0.personId && r0.dormId === room.dormId && r0.floor === room.floor && (r0.towerId || null) === (room.towerId || null);
  if (!here) app.go({ tab: "explore", dormId: room.dormId, towerId: room.towerId || null, floor: room.floor });
  const t0 = performance.now() - (here ? 2000 : 0);
  const tryOpen = () => {
    const m = app.map, r = app.route;
    if (r.tab !== "explore" || r.dormId !== room.dormId || r.floor !== room.floor || r.personId) return; // they moved on
    // wait for the floor to lift and its rooms to be laid out, then step into the room
    const ready = m && m.roomCache && m.zTopNow != null && m.roomCache.cells.some((c) => c.number === room.number) && performance.now() - t0 > 1150;
    if (ready) { openListingFromPlan(listingId); openRoom3d(listingId, room.number); return; }
    if (performance.now() - t0 < 6000) setTimeout(tryOpen, 120);
    else openListingFromPlan(listingId);
  };
  setTimeout(tryOpen, 200);
};

function openListingFromPlan(listingId) {
  app.ui.hotRoom = app.world.roomsById.get(app.world.listingsById.get(listingId).roomId)?.number;
  if (app.map) { app.map.hotRoom = app.ui.hotRoom || null; app.map.kick(); }
  if (phone) setSheet("half");
  const card = document.getElementById(`card-${listingId}`);
  if (card) {
    card.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
  }
}
document.addEventListener("keydown", (e) => {
  const room = e.target.closest && e.target.closest(".room.listed[data-listing]");
  if (room && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openListingFromPlan(room.dataset.listing); return; }
  const typing = /input|textarea|select/i.test(e.target.tagName);
  if (e.key === "Escape") {
    if (EMBED && window.parent !== window) { try { window.parent.postMessage({ swapchain: "closepreview" }, location.origin); } catch (err) { /* ok */ } return; }
    if ($("#preview").classList.contains("on")) { closePreview(); return; }
    if (app.route.tab === "demo") { app.go({ tab: "explore" }); return; }
    if (typing) { e.target.blur(); return; }
    if (app.route.personId || app.route.dormId) app.back();
    return;
  }
  if (typing) return;
  if (app.route.tab === "demo" && app.demo && !$("#preview").classList.contains("on") && app.demo.key(e)) return;
  if ((e.key === "P" || e.key === "p") && e.shiftKey && !phone && !EMBED) { e.preventDefault(); $("#preview").classList.contains("on") ? closePreview() : openPreview(); }
  // tablist arrow keys
  if (e.target.getAttribute && e.target.getAttribute("role") === "tab" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
    const tabs = [...e.target.parentElement.querySelectorAll("[role=tab]")];
    const i = tabs.indexOf(e.target);
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    n.focus();
  }
});

function bindInputs() {
  const s = document.getElementById("search");
  if (s) s.addEventListener("input", (e) => {
    app.ui.search = e.target.value;
    const pos = e.target.selectionStart;
    app.render();
    const n = document.getElementById("search");
    if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (err) { /* ok */ } }
  });
  scroller.querySelectorAll("[data-field]").forEach((inp) => {
    const ev = inp.tagName === "SELECT" ? "change" : "input";
    inp.addEventListener(ev, (e) => postInput(app, inp.dataset.field, e.target.value));
  });
  // hover a dorm row -> highlight on the map, with a line from the row to the building
  live.wireHover(scroller, "[data-hover]", (n) => n.dataset.hover);
}

// ---------------- phone preview ----------------
function openPreview() {
  if (phone) return;
  const pv = $("#preview");
  const dev = $("#device");
  if (!dev.querySelector("iframe")) {
    const dark = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    dev.innerHTML = `<iframe src="./?embed=phone&theme=${dark}" title="SwapChain on a phone"></iframe>`;
  }
  const scale = Math.min(1, (window.innerHeight - 120) / 868);
  dev.style.transform = `scale(${scale})`;
  $("#device-wrap").style.width = `${414 * scale}px`;
  $("#device-wrap").style.height = `${868 * scale}px`;
  pv.classList.add("on");
  $("#preview-btn").setAttribute("aria-pressed", "true");
  app.map && app.map.pause(true);
}
function closePreview() {
  $("#preview").classList.remove("on");
  $("#preview-btn").setAttribute("aria-pressed", "false");
  const dev = $("#device");
  dev.innerHTML = "";
  app.map && app.map.pause(false);
}

window.addEventListener("message", (e) => {
  if (e.origin === location.origin && e.data && e.data.swapchain === "closepreview" && $("#preview").classList.contains("on")) closePreview();
});

// ---------------- tooltip ----------------
const tip = $("#tooltip");
function onMapHover({ dormId, floor, room, x, y }) {
  if (!phone && room && x != null) {
    const m = room.mark;
    const what = m && m.me ? "Your room" : m && m.listed ? "Offered · click to see it" : "Not offered";
    tip.innerHTML = `Room ${esc(room.number)} <span>· ${esc(room.type)} · ${what}</span>`;
    tip.style.transform = `translate(${Math.round(x - tip.offsetWidth / 2)}px, ${Math.round(y - 50)}px)`;
    tip.classList.add("on");
    return;
  }
  if (phone || !dormId || x == null) { tip.classList.remove("on"); return; }
  const d = dormsById.get(dormId);
  const s = dormStats(app.world, dormId);
  tip.innerHTML = `${esc(d.name)} <span>· ${s.offered} rooms offered · ${s.wantIn} want in</span>`;
  tip.style.transform = `translate(${Math.round(x - tip.offsetWidth / 2)}px, ${Math.round(y - 50)}px)`;
  tip.classList.add("on");
  void floor;
}

// ---------------- boot ----------------
async function boot() {
  buildChrome();
  recompute();
  app.world = store.world;
  if (phone) setSheet("peek");
  sheetDrag();

  let mapOk = false;
  try {
    if (!window.deck) await new Promise((res) => { const t = setInterval(() => { if (window.deck) { clearInterval(t); res(); } }, 50); setTimeout(() => { clearInterval(t); res(); }, 8000); });
    if (window.deck) {
      const { CampusMap, webglAvailable } = await import("./map.js");
      if (webglAvailable()) {
        app.map = new CampusMap({
          container: $("#map"), overlay: $("#overlay"), phone,
          freeArea,
          onDorm: (dormId, towerId) => {
            const r = app.route;
            if (r.tab === "demo") return;
            if (r.tab === "explore" && r.dormId === dormId) {
              if (towerId && towerId !== r.towerId) app.go({ ...r, towerId, floor: null }, { push: false });
              return;
            }
            app.go({ tab: "explore", dormId, towerId: towerId || null, floor: null });
          },
          onRoom: (listingId, number) => { openListingFromPlan(listingId); openRoom3d(listingId, number); },
          onPerson: (personId) => app.go({ ...app.route, personId }),
          onFloor: (f) => { if (app.route.tab === "explore" && app.route.dormId) app.go({ ...app.route, floor: app.route.floor === f ? null : f }, { push: false }); },
          onBackground: () => {
            const r = app.route;
            if (r.tab === "explore" && r.dormId) {
              if (r.floor != null) app.go({ ...r, floor: null }, { push: false });
              else app.go({ tab: "explore" }, { push: false });
            }
          },
          onHover: onMapHover,
        });
        mapOk = true;
        app.map.obstacleEls = [document.querySelector(".counter-box"), document.getElementById("live")];
        onThemeChange(() => { app.map.setTheme(); updateThemeBtn(); });
      }
    }
  } catch (err) {
    console.warn("Map failed to start", err);
  }
  if (!mapOk) {
    $("#map").innerHTML = `<div class="nogl"><div><b>Your browser can't show the 3D map.</b><br>The lists still work.</div></div>`;
  }
  setTimeout(() => $("#loading").classList.add("done"), mapOk ? 450 : 0);
  if (mapOk) app.demo = createDemo(app);
  onWorld();
  // keep the map in sync with data changes
  const origRecompute = store;
  void origRecompute;
  (await import("./engine.js")).onChange(() => { app.world = store.world; onWorld(); if (app.route.tab !== "demo") app.render(); });

  let start = { tab: "explore" };
  const demoQ = params.get("demo");
  if (demoQ && app.demo) start = { tab: "demo", scene: Math.max(0, app.demo.sceneIndexFor(Number(demoQ) - 1, Math.max(0, Number(params.get("beat") || 1) - 1))) };
  else if (params.get("tab") && TABS.some((t) => t.id === params.get("tab"))) start = { tab: params.get("tab") };
  if (params.get("dorm") && dormsById.has(params.get("dorm"))) start = { tab: "explore", dormId: params.get("dorm"), towerId: (dormsById.get(params.get("dorm")).towers || []).some((t) => t.id === params.get("tower")) ? params.get("tower") : null, floor: params.get("floor") ? Number(params.get("floor")) : null };
  app.route = { tab: "__boot" };
  app.go(start, { push: false });
  if (params.get("preview") === "phone" && !phone) setTimeout(openPreview, 600);

  // layout switch on resize (desktop <-> phone) reloads so both layouts stay simple and correct
  if (!EMBED) {
    const mq = matchMedia("(min-width: 1024px)");
    mq.addEventListener("change", () => location.reload());
  }
  let rzT = 0;
  window.addEventListener("resize", () => {
    if (phone) setSheet(app.sheet);
    if ($("#preview").classList.contains("on")) openPreview();
    // re-frame the camera for the new window size
    clearTimeout(rzT);
    rzT = setTimeout(() => {
      if (!app.map) return;
      if (app.route.tab === "demo" && app.demo) app.demo.refit();
      else if (app.route.tab === "explore" && !app.route.dormId) app.map.goHome(300);
    }, 250);
  });
}

boot();
