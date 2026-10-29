// Ask SwapChain: a small chat panel that answers questions about the marketplace from the live data.
// It runs in the page (no model, no network): it reads the question for dorms, towers, room types,
// floors, "loops", "fits me", "who wants my room" and people's names, then answers with rows you can
// open (a room in 3D, a loop on the map, a profile). Whatever an answer is about lights up on the map.
import { esc, icon } from "./dom.js";
import { DORMS, dormsById, cycleKey } from "../engine.js";
import { av, shortName } from "./cards.js";

const TYPES = ["single", "double", "triple", "quad", "suite", "apartment"];
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const SUGGEST = ["Singles in West Campus", "Loops through Warren", "Rooms that fit me", "Who wants my room?", "Doubles on floor 10 or higher"];

// names people actually say for each hall
const ALIASES = {
  myles: ["myles", "myles standish", "610", "610 beacon", "standish"],
  "575": ["575", "hojo", "ho jo", "575 comm"],
  danielsen: ["danielsen", "danielson", "dan hall"],
  towers: ["the towers", "towers"],
  kilachand: ["kilachand", "kila", "kilachand hall"],
  "1019": ["1019", "1019 comm"],
};

// BU housing that SwapChain does not cover, so a question about it gets a straight answer
const NOT_HERE = [
  [/\b(stuvi|stu vi|student village|stuvi ?[12])\b/, "StuVi (Student Village)"],
  [/\bbay state\b|\bbrownstones?\b/, "the Bay State Road brownstones"],
  [/\bwest ?campus apartments?\b/, "the West Campus apartments"],
];
const STOP = new Set(["the", "a", "my", "any", "this", "that", "floor", "floors", "room", "rooms", "a single", "a double", "west", "central", "east", "south", "boston", "bu", "campus", "general", "it", "there", "here"]);

function norm(s) {
  return ` ${String(s).toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim()} `;
}
const has = (q, w) => q.includes(` ${w} `);
// "Warren C" for a tower id like "warren-shields"
const towerName = (id) => { for (const d of DORMS) for (const t of d.towers || []) if (t.id === id) return `${d.short} ${t.name}`; return id; };

/** Pull what the question is about out of plain words. */
export function parse(text) {
  const q = norm(text);
  const dorms = new Set(), towers = new Set();
  for (const d of DORMS) {
    const names = [d.id, d.short, d.name, ...(ALIASES[d.id] || [])].map((x) => norm(x).trim()).filter(Boolean);
    if (names.some((n) => has(q, n) || (n.length > 5 && q.includes(n)))) dorms.add(d.id);
    for (const t of d.towers || []) {
      const L = (t.letter || "").toLowerCase();
      const tn = [t.fullName, L && `${L} tower`, L && `tower ${L}`, L && `${d.short} ${L}`].filter(Boolean).map((x) => x.toLowerCase());
      if (tn.some((n) => has(q, n))) { towers.add(t.id); dorms.add(d.id); }
    }
  }
  // "the towers" is a hall; a bare "tower" is just a word
  if (dorms.has("towers") && !/\btowers\b/.test(q)) dorms.delete("towers");
  const areas = ["west", "central", "east", "south", "fenway"].filter((a) => has(q, a) && (has(q, `${a} campus`) || a === "fenway"));
  for (const a of areas) for (const d of DORMS) if (d.area.toLowerCase().startsWith(a)) dorms.add(d.id);
  const types = TYPES.filter((t) => has(q, t) || has(q, `${t}s`));
  // floors: "floor 7", "7th floor", "floor 7 or higher", "above 8", "between 5 and 9", "high floor"
  const n = (s) => (WORDS[s] != null ? WORDS[s] : Number(s));
  let floorMin = null, floorMax = null, m;
  const num = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
  if ((m = q.match(new RegExp(`between (?:floors? )?${num} and ${num}`)))) { floorMin = n(m[1]); floorMax = n(m[2]); }
  else if ((m = q.match(new RegExp(`(?:floor|fl) ${num}(?:th|st|nd|rd)? ?(?:\\+|or (?:higher|above|up)|and (?:up|above|higher)|plus)`))) || (m = q.match(new RegExp(`${num}(?:th|st|nd|rd)? floor (?:or|and) (?:higher|above|up)`))) || (m = q.match(new RegExp(`(?:above|over|higher than) (?:floor )?${num}`)))) {
    floorMin = n(m[1]) + (/above|over|higher than/.test(m[0]) && !/\bor\b/.test(m[0]) ? 1 : 0);
  } else if ((m = q.match(new RegExp(`(?:below|under|lower than) (?:floor )?${num}`)))) floorMax = n(m[1]) - 1;
  else if ((m = q.match(new RegExp(`(?:floor|fl) ${num}\\b`))) || (m = q.match(new RegExp(`${num}(?:th|st|nd|rd) floor`)))) { floorMin = n(m[1]); floorMax = n(m[1]); }
  else if (/high (?:up|floor)|top floor|views?/.test(q)) floorMin = 10;
  else if (/low floor|ground floor|lower floor/.test(q)) floorMax = 4;
  const loops = /\b(loops?|chains?|cycles?|circle)\b/.test(q);
  const mine = /\b(me|my|mine|i|im|i d|id|i would|for me)\b/.test(q);
  const fitsMe = /\b(fit|fits|i d take|id take|i would take|for me|i can get|i could get|my wants|i want)\b/.test(q);
  const wantsMine = /\bwho\b.*\b(wants?|would take|take)\b.*\bmy room\b|\binterested in my room\b|\bwant my room\b/.test(q);
  const help = /^\s*(hi|hey|hello|help|what can you do|how does this work)\b/.test(q.trim());
  const big = /\b(big picture|overall|everyone|everybody|all (the )?students|how many (people|students)|efficien\w*|stats?|whole campus)\b/.test(q);
  // a place we don't cover: a known one (StuVi), or any "in <name>" that matched no hall
  let notHere = (NOT_HERE.find(([re]) => re.test(q)) || [])[1] || null;
  if (!notHere && !dorms.size && !towers.size) {
    const mm = q.match(/\b(?:in|at|near|inside)\s+([a-z0-9][a-z0-9 ]{1,24}?)(?=\s+(?:on|with|for|that|above|below|between|under|over|floor|or|and)\b|\s*$)/);
    const w = mm && mm[1].trim();
    if (w && !STOP.has(w) && !/^(floor|fl|\d+(st|nd|rd|th)?)\b/.test(w) && !TYPES.some((t) => w.startsWith(t))) notHere = w.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return { q, notHere, areas, dorms: [...dorms], towers: [...towers], types, floorMin, floorMax, loops, mine, fitsMe, wantsMine, help, big };
}

function dormList(ids) {
  const s = ids.map((d) => dormsById.get(d)?.short || d);
  return s.length <= 2 ? s.join(" and ") : `${s.slice(0, -1).join(", ")} and ${s[s.length - 1]}`;
}
function floorText(p) {
  if (p.floorMin != null && p.floorMax != null) return p.floorMin === p.floorMax ? ` on floor ${p.floorMin}` : ` on floors ${p.floorMin} to ${p.floorMax}`;
  if (p.floorMin != null) return ` on floor ${p.floorMin} or higher`;
  if (p.floorMax != null) return ` on floor ${p.floorMax} or lower`;
  return "";
}
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Answer one question from the world. Returns { text, rows, ids } where ids light up on the map. */
export function answer(world, text) {
  const p = parse(text);
  const me = world.listingsById.get(world.meListingId);
  const meAccepts = me ? world.accept.get(me.id) || new Set() : new Set();
  const roomOf = (l) => world.roomsById.get(l.roomId);
  const roomRow = (l) => {
    const r = roomOf(l), per = world.peopleById.get(l.personId);
    return { kind: "room", id: l.id, lead: av(per, 32), title: world.roomLabel(l.roomId), sub: `${r.type[0].toUpperCase()}${r.type.slice(1)} · ${shortName(per)} is leaving${meAccepts.has(l.id) ? " · fits you" : ""}` };
  };

  if (p.notHere) {
    const halls = DORMS.map((d) => d.short).join(", ");
    return { text: `${p.notHere[0].toUpperCase()}${p.notHere.slice(1)} isn't on SwapChain. Right now it covers ${halls}. Ask me about any of those.`, rows: [], ids: [] };
  }
  if (p.help || !p.q.trim()) {
    return { text: "Ask me about open rooms or swap loops. I can filter by hall, tower, room type and floor, show what fits what you want, find loops through a hall, or tell you who wants your room.", rows: [], ids: [] };
  }

  // people by first name ("who is Kai", "Kai's room")
  const person = world.people.find((x) => x.first && has(p.q, x.first.toLowerCase()) && x.first.length > 2);
  if (person && !p.loops && !p.types.length && !p.dorms.length) {
    const l = world.listings.find((x) => x.personId === person.id);
    const rows = [{ kind: "person", id: person.id, lead: av(person, 32), title: person.name, sub: `${person.major || "Student"}${l ? ` · leaving ${world.roomLabel(l.roomId)}` : ""}` }];
    if (l) rows.push(roomRow(l));
    return { text: l ? `${shortName(person)} posted ${world.roomLabel(l.roomId)}.` : `${shortName(person)} hasn't posted a room.`, rows, ids: l ? [l.id] : [] };
  }

  if (p.wantsMine) {
    if (!me) return { text: "Post your room first and I can tell you who'd take it.", rows: [], ids: [] };
    const ls = world.listings.filter((l) => (world.accept.get(l.id) || new Set()).has(me.id));
    return {
      text: ls.length ? `${plural(ls.length, "person")} would take your room. The ones whose room fits you too are a direct swap.` : "Nobody has asked for a room like yours yet. Loops can still form as more people post.",
      rows: ls.slice(0, 8).map(roomRow), ids: ls.map((l) => l.id),
    };
  }

  // the whole picture at real scale: last year's swap list had almost 350 students (Daily Free Press,
  // Apr 8 2026). 94 and 182 are the medians of 25 simulated lists that size (tools/sim_stress.mjs).
  if (p.big && !p.dorms.length && !p.towers.length) {
    return {
      text: "Last year, almost 350 students were on BU's swap list. In a simulated list that size, 1-to-1 swaps move about 94 of them. SwapChain's loops move about 182, almost 2× as many.",
      rows: [{ kind: "demo", id: "0", lead: `<span class="live-loop">${icon("loop", "sm")}</span>`, title: "See it on the map", sub: "Our Chain Demo, pairs vs loops" }],
      ids: [],
    };
  }

  if (p.loops) {
    const all = world.best.filter((c) => c.length >= 3);
    const dormOf = (id) => roomOf(world.listingsById.get(id)).dormId;
    const towerOf = (id) => roomOf(world.listingsById.get(id)).towerId;
    let list = p.mine ? all.filter((c) => c.includes(world.meListingId)) : all;
    if (p.dorms.length) list = list.filter((c) => c.some((id) => p.dorms.includes(dormOf(id))));
    if (p.towers.length) list = list.filter((c) => c.some((id) => p.towers.includes(towerOf(id))));
    const where = p.towers.length ? ` through ${p.towers.map(towerName).join(" and ")}` : p.dorms.length ? ` through ${dormList(p.dorms)}` : "";
    const rows = list.slice(0, 6).map((c) => {
      const names = [...new Set(c.map(dormOf))].map((d) => dormsById.get(d).short);
      const mine = c.includes(world.meListingId);
      return { kind: "loop", id: cycleKey(c), cycle: c, mine, lead: `<span class="live-loop ${mine ? "mine" : ""}">${icon("loop", "sm")}</span>`, title: mine ? `Loop of ${c.length} with you` : `Loop of ${c.length}`, sub: names.join(" → ") };
    });
    return {
      text: list.length ? `${plural(list.length, "loop")}${where}${p.mine ? (list.length === 1 ? " includes you" : " include you") : ""}. Everyone in a loop gets a room they asked for.` : `No loops${where} right now. One more post often closes one.`,
      rows, ids: list[0] ? list[0] : [], loop: list[0] || null,
    };
  }

  // open rooms
  let ls = world.listings.filter((l) => l.id !== world.meListingId);
  if (p.dorms.length) ls = ls.filter((l) => p.dorms.includes(roomOf(l).dormId));
  if (p.towers.length) ls = ls.filter((l) => p.towers.includes(roomOf(l).towerId));
  if (p.types.length) ls = ls.filter((l) => p.types.includes(roomOf(l).type));
  if (p.floorMin != null) ls = ls.filter((l) => roomOf(l).floor >= p.floorMin);
  if (p.floorMax != null) ls = ls.filter((l) => roomOf(l).floor <= p.floorMax);
  if (p.fitsMe) ls = ls.filter((l) => meAccepts.has(l.id));
  const narrowed = p.dorms.length || p.towers.length || p.types.length || p.floorMin != null || p.floorMax != null || p.fitsMe;
  if (!narrowed) return { text: "Tell me a hall, a room type or a floor, or ask about loops. For example: \"singles in Claflin\" or \"loops through Warren\".", rows: [], ids: [] };
  ls.sort((a, b) => Number(meAccepts.has(b.id)) - Number(meAccepts.has(a.id)) || roomOf(a).floor - roomOf(b).floor);
  const what = p.types.length ? p.types.map((t) => `${t}s`).join(" or ") : "rooms";
  const areaName = p.areas.length ? p.areas.map((a) => (a === "fenway" ? "Fenway" : `${a[0].toUpperCase()}${a.slice(1)} Campus`)).join(" and ") : "";
  const where = p.towers.length ? ` in ${p.towers.map(towerName).join(" and ")}` : areaName ? ` in ${areaName}` : p.dorms.length ? ` in ${dormList(p.dorms)}` : "";
  const fit = ls.filter((l) => meAccepts.has(l.id)).length;
  let line;
  if (ls.length) line = `${ls.length} open ${ls.length === 1 ? what.replace(/s$/, "").replace(/s or /g, " or ") : what}${where}${floorText(p)}${p.fitsMe ? (ls.length === 1 ? " fits what you want" : " fit what you want") : ""}.${!p.fitsMe && fit ? (ls.length === 1 ? " It fits what you want." : ` ${fit} of them fit what you want.`) : ""}`;
  else line = `Nobody has posted ${what}${where}${floorText(p)}${p.fitsMe ? " that fit what you want" : ""} yet.`;
  return { text: line, rows: ls.slice(0, 8).map(roomRow), ids: ls.map((l) => l.id), more: Math.max(0, ls.length - 8) };
}

export function createChat(app, { reducedMotion }) {
  const root = document.getElementById("chat");
  const btn = document.getElementById("chat-btn");
  const msgs = [];
  let open = false;
  btn.innerHTML = `${icon("sparkle")}<span class="lbl">Ask</span>`;
  btn.setAttribute("aria-label", "Ask SwapChain");

  function rowHtml(r) {
    return `<button class="chat-row" data-kind="${r.kind}" data-id="${esc(r.id)}"${r.mine ? ' data-mine="1"' : ""}>${r.lead}<span class="body"><span class="t">${esc(r.title)}</span><span class="s">${esc(r.sub)}</span></span>${icon("chevron", "sm")}</button>`;
  }
  function draw() {
    const log = msgs.map((m) => (m.who === "you"
      ? `<div class="msg you">${esc(m.text)}</div>`
      : `<div class="msg bot">${m.typing ? '<span class="typing"><i></i><i></i><i></i></span>' : `<p>${esc(m.text)}</p>${m.rows && m.rows.length ? `<div class="chat-rows">${m.rows.map(rowHtml).join("")}</div>` : ""}${m.more ? `<p class="more">and ${m.more} more, lit on the map</p>` : ""}`}</div>`)).join("");
    root.innerHTML = `<div class="chat-head"><span class="chat-title">${icon("sparkle", "sm")}Ask SwapChain</span><button class="icon-btn chat-x" aria-label="Close">${icon("close")}</button></div>` +
      `<div class="chat-log" id="chat-log">${log || `<div class="msg bot"><p>Ask about open rooms or swap loops. I search everything posted right now.</p></div>`}</div>` +
      `<div class="chat-suggest">${SUGGEST.map((s) => `<button class="chip" data-say="${esc(s)}">${esc(s)}</button>`).join("")}</div>` +
      `<form class="chat-form"><input class="input" id="chat-in" autocomplete="off" placeholder="Try: singles in Claflin, floor 5 or higher" aria-label="Ask a question"><button class="btn primary" type="submit" aria-label="Send">${icon("send") || "Ask"}</button></form>`;
    const lg = root.querySelector("#chat-log");
    lg.scrollTop = lg.scrollHeight;
  }
  function setOpen(v) {
    open = v;
    root.classList.toggle("on", v);
    btn.setAttribute("aria-pressed", String(v));
    document.documentElement.classList.toggle("chat-open", v);
    if (v) { draw(); setTimeout(() => root.querySelector("#chat-in")?.focus(), 60); }
    else app.ui.chat = null;
    app.render();
  }
  function ask(text) {
    const t = String(text || "").trim();
    if (!t) return;
    msgs.push({ who: "you", text: t });
    const res = answer(app.world, t);
    const bot = { who: "bot", typing: true };
    msgs.push(bot);
    draw();
    setTimeout(() => {
      Object.assign(bot, res, { typing: false });
      app.ui.chat = { ids: res.ids || [], loop: res.loop || null, key: `${msgs.length}` };
      draw();
      app._fitKey = null;
      app.render();
    }, reducedMotion() ? 0 : 420);
  }

  btn.addEventListener("click", () => setOpen(!open));
  root.addEventListener("click", (e) => {
    if (e.target.closest(".chat-x")) return setOpen(false);
    const s = e.target.closest("[data-say]");
    if (s) return ask(s.dataset.say);
    const r = e.target.closest(".chat-row");
    if (!r) return;
    const { kind, id } = r.dataset;
    if (kind === "room") app.openListingRoom(id);
    else if (kind === "person") app.go({ ...app.route, personId: id });
    else if (kind === "demo") app.go({ tab: "demo", scene: Number(id) || 0 });
    else if (kind === "loop") {
      const c = app.world.best.find((x) => cycleKey(x) === id);
      const set = c && [...c].sort().join();
      const mine = r.dataset.mine && app.world.mine.chains.find((x) => [...x].sort().join() === set);
      if (mine) { app.ui.openLoop = cycleKey(mine); app._fitKey = null; app.go({ tab: "matches" }); }
      else app.go({ tab: "explore", loopKey: id });
    }
    if (window.matchMedia("(max-width: 700px)").matches) setOpen(false);
  });
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = root.querySelector("#chat-in");
    const v = inp.value;
    inp.value = "";
    ask(v);
    setTimeout(() => root.querySelector("#chat-in")?.focus(), 0);
  });
  document.addEventListener("keydown", (e) => { if (open && e.key === "Escape") setOpen(false); });
  return { isOpen: () => open, setOpen, ask };
}
