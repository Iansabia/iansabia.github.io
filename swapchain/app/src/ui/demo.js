// Chain Demo: the presenter storyboard (SPEC section 6). Every number is computed by src/chains.js.
import { esc, icon, toast } from "./dom.js";
import { buildWorld, DEMO, ME, cycleKey, wantsText } from "../engine.js";
import { PEOPLE, ROOMS, LISTINGS } from "../../data/people.js";
import { listingCard, timeline, footerNote, rotateToMin, av } from "./cards.js";
import { reducedMotion } from "../theme.js";
import { loopStyle } from "../loopcolors.js";

const HOLD = [9000, 11000, [5500, 5500, 5500, 5500], 14000, 12000, 12000, null];

export function createDemo(app) {
  const la = DEMO.liveAdd;
  // Before Miles taps "I'd room with Jared" his listing is not in the pool yet.
  const maya = DEMO.scenes.find((s) => s.focus)?.focus?.chooserListingId || "l09";
  const W0 = buildWorld(PEOPLE, ROOMS, LISTINGS.filter((l) => l.id !== maya));
  const W1 = buildWorld(PEOPLE, ROOMS, LISTINGS);
  const W2 = buildWorld([...PEOPLE, la.person], [...ROOMS, la.room], [...LISTINGS, la.listing]);
  const resolve = (id) => {
    const l = W2.listingsById.get(id);
    if (!l) return null;
    const r = W2.roomsById.get(l.roomId);
    return { roomId: r.id, dormId: r.dormId, towerId: r.towerId, floor: r.floor, number: r.number, person: W2.peopleById.get(l.personId) };
  };

  const scenes = DEMO.scenes;
  const steps = [];
  scenes.forEach((sc, i) => (sc.beats ? sc.beats.forEach((b, j) => steps.push({ s: i, b: j })) : steps.push({ s: i })));
  const loopsScene = scenes.findIndex((s) => s.beats);
  const beats = scenes[loopsScene].beats;
  // counters per beat: direct pairs + loops revealed so far (each must be in the best plan)
  const bestKeys = new Set(W0.best.map((c) => cycleKey(c)));
  const beatCounts = [];
  let run = W0.directPeople;
  beats.forEach((b, j) => {
    if (bestKeys.has(cycleKey(rotateToMin(b.loop)))) run += b.loop.length;
    beatCounts.push(j === beats.length - 1 ? W0.chainPeople : run);
  });
  const swapsFiled = W2.best.reduce((s, c) => s + c.length - 1, 0);
  const longest = Math.max(...W2.best.map((c) => c.length));

  const st = { step: 0, auto: false, posted: false, timers: [], shown: 0, target: 0, denom: W1.wanting, pressed: false, tl: null };
  const counterEl = document.querySelector(".counter");
  const statEl = document.querySelector(".stat-card");

  // on the phone the sheet sits at peek during the demo: never scroll the controls out of view there
  const canScroll = () => !app.phone || app.sheet !== "peek";
  const scrollOpts = () => ({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  function clearTimers() { st.timers.forEach(clearTimeout); st.timers = []; }
  function later(ms, fn) { st.timers.push(setTimeout(fn, reducedMotion() ? Math.min(ms, 50) : ms)); }

  // ---------- counter ----------
  function setCounter(v, denom = st.denom, directPart = null) {
    const from = st.shown;
    st.target = v;
    st.denom = denom;
    const t0 = performance.now();
    const dur = reducedMotion() ? 1 : 700;
    const big = counterEl.querySelector(".big");
    counterEl.querySelector(".of").textContent = `/ ${denom}`;
    const tick = () => {
      const u = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - u, 3);
      st.shown = Math.round(from + (v - from) * e);
      big.textContent = String(st.shown);
      if (u < 1 && st.target === v) requestAnimationFrame(tick);
      else counterEl.querySelector(".live").textContent = `${v} of ${denom} students moved`;
    };
    requestAnimationFrame(tick);
    const d = directPart == null ? Math.min(v, W0.directPeople) : directPart;
    counterEl.querySelector(".bar .d").style.width = `${(100 * d) / denom}%`;
    counterEl.querySelector(".bar .l").style.width = `${(100 * Math.max(0, v - d)) / denom}%`;
  }

  // ---------- map helpers ----------
  const map = () => app.map;
  const loopT = (id, cycle, o = {}) => ({ id, cycle, kind: "loop", ...o });
  const directs = (o = {}) => W0.direct.map((c, i) => ({ id: `d${i}`, cycle: c, kind: "direct", delay: i * 700, ...o }));
  const beadsAll = (kindOf, dimOf) => W1.listings.map((l) => ({ id: l.id, kind: kindOf ? kindOf(l.id) : "wait", dim: dimOf ? dimOf(l.id) : false }));
  const inDirect = new Set(W0.direct.flat());
  // earlier loops stay as faint lines; the loop being shown is the only strong one
  const beatThreads = (upto, focusIdx, drawIdx, only = false) => beats.slice(0, upto + 1)
    .map((b, j) => ({ b, j }))
    .filter(({ j }) => !only || j === focusIdx)
    .map(({ b, j }) => loopT(`b${j}`, b.loop, {
      focus: j === focusIdx, pins: j === focusIdx, dim: j !== focusIdx, draw: j === drawIdx, delay: j === drawIdx ? 500 : 0,
    }));

  // ---------- scenes ----------
  function syncUrl() {
    const { s, b } = steps[st.step];
    try {
      const q = new URLSearchParams(location.search);
      q.set("demo", String(s + 1));
      if (b != null) q.set("beat", String(b + 1)); else q.delete("beat");
      history.replaceState(null, "", `${location.pathname}?${q.toString()}`);
    } catch (e) { /* optional */ }
  }

  function enter(i, { fromBack = false } = {}) {
    clearTimers();
    st.step = Math.max(0, Math.min(steps.length - 1, i));
    const { s, b } = steps[st.step];
    const sc = scenes[s];
    syncUrl();
    app.setSheetFor("demo", sc.id);
    st.posted = false;
    st.pressed = false;
    st.tl = null;
    const m = map();
    if (!m) { render(); return; }
    m.setCarrier(null);
    m.setHighlightSegment(null);
    m.setExtraPins([]);
    m.clearDemoExplode();
    if (sc.id !== "closing") m.setArcScale(1);
    m.noOrbit = true;
    m.orbit = false;
    st.fit = null;
    statEl.classList.remove("on");
    counterEl.style.opacity = sc.id === "closing" && !app.phone ? "0" : "";
    if (m.sel.dormId) m.clearSelection({ fly: false });
    m.setLabelsDimmed(s > 0);
    if (s === 0) {
      m.setThreads([]);
      m.setBeads(W1.listings.map((l, k) => ({ id: l.id, kind: "wait", drop: k * 20 })));
      st.fit = (d) => m.goHome(d);
      setCounter(0, W1.wanting);
    } else if (s === 1) {
      m.setThreads(directs());
      m.setBeads(beadsAll((id) => (inDirect.has(id) ? "direct" : "wait"), (id) => !inDirect.has(id)));
      st.fit = (d) => m.goHome(d);
      later(400, () => setCounter(W0.directPeople, W1.wanting));
    } else if (s === loopsScene) {
      const beat = beats[b];
      const close = beat.id === "towers" || beat.id === "same-dorm";
      m.setThreads([...(close ? [] : directs({ dim: true, delay: 0 })), ...beatThreads(b, b, fromBack ? -1 : b, close)]);
      m.setBeads(close ? [] : beadsAll((id) => (inDirect.has(id) ? "direct" : "wait"), () => true));
      if (beat.id === "same-dorm") {
        // split the building into floors so the floor-to-floor moves read clearly
        const g = W2.roomsById.get(W2.listingsById.get(beat.loop[0]).roomId);
        m.demoExplode(g.towerId || g.dormId);
        st.fit = (d) => m.fitListings(beat.loop, { pitch: 50, maxZoom: app.phone ? 17.8 : 18.2, duration: d, group: g.towerId || g.dormId, padTop: app.phone ? 30 : 40, bearing: m.bearing0 });
      } else if (beat.id === "towers") st.fit = (d) => m.fitListings(beat.loop, { pitch: 56, maxZoom: app.phone ? 17.7 : 17.4, duration: d });
      else st.fit = (d) => m.fitListings(beat.loop, { pitch: 50, duration: d });
      later(900, () => setCounter(beatCounts[b], W1.wanting));
    } else if (sc.id === "bu-swaps") {
      const X = sc.showcase[0];
      m.setThreads([...directs({ dim: true }), ...beats.map((bt, j) => loopT(`b${j}`, bt.loop, { dim: cycleKey(bt.loop) !== cycleKey(X), draw: false }))
        .map((t) => (cycleKey(t.cycle) === cycleKey(X) ? { ...t, focus: true, pins: true } : t))]);
      m.setBeads(beadsAll(null, () => true));
      st.fit = (d) => m.fitListings(X, { pitch: 48, duration: d });
      setCounter(W0.chainPeople, W1.wanting);
      st.tl = { cycle: X, threadId: `b${beats.findIndex((bt) => cycleKey(bt.loop) === cycleKey(X))}` };
      later(1300, () => playTimeline());
    } else if (sc.id === "social") {
      const J = sc.showcase[0];
      m.setThreads([...directs({ dim: true }), ...beats.map((bt, j) => loopT(`b${j}`, bt.loop, { dim: true, draw: false }))]);
      m.setBeads(beadsAll(null, () => true));
      st.fit = (d) => m.flyToGroup("kilachand", { zoom: app.phone ? 16.9 : 17.4, pitch: 55, bearingDelta: 10, duration: d });
      setCounter(W0.chainPeople, W1.wanting);
      later(2600, () => pressSocial(J, sc));
    } else if (sc.id === "live-add") {
      const L = sc.showcase[0];
      const missing = L.find((id) => !W1.listingsById.has(id));
      m.setThreads([...directs({ dim: true }), ...W1.best.filter((c) => c.length > 2).map((c, j) => loopT(`w1-${j}`, c, { dim: true, draw: false })),
        { id: "L", cycle: L, kind: "open", missing, focus: true, pins: true }]);
      m.setBeads(beadsAll(null, () => true));
      st.fit = (d) => m.fitListings(L, { pitch: 50, duration: d });
      setCounter(W1.chainPeople, W1.wanting);
      if (st.auto) later(5000, () => post());
    } else if (sc.id === "closing") {
      const all = W2.best;
      // the closing web: every loop the same weight, only YOUR loop glows; pairs stay soft gray
      m.setArcScale(0.62);
      m.setThreads(all.map((c, j) => (c.length === 2
        ? { id: `c${j}`, cycle: c, kind: "direct", delay: j * 120, soft: true }
        : loopT(`c${j}`, c, { focus: true, draw: true, delay: j * 180, plain: true }))));
      m.setBeads([]);
      st.fit = (d) => m.fitListings(all.flat(), { pitch: 56, duration: d, loop: false, cycles: all, bearing: m.bearingWeb, padTop: app.phone ? 50 : 56, padX: app.phone ? 26 : 40, maxZoom: 16.4 });
      setCounter(W2.chainPeople, W2.wanting, W2.directPeople);
      fillStat();
    }
    render();
    // frame the camera after the panel and counter have their final size
    if (st.fit) st.fit(s === 0 ? 1200 : 1300);
    if (sc.id === "closing") setTimeout(() => { if (st.step === i && app.route.tab === "demo" && !reducedMotion()) { m.noOrbit = false; m.orbit = true; m.kick(); } }, 1600);
    scheduleAuto();
  }

  function fillStat() {
    const ratio = W2.directPeople ? (W2.chainPeople / W2.directPeople).toFixed(1) : "n/a";
    const html = `<div class="stat-cols"><div><div class="k">1-to-1 swaps</div><div class="v">${W2.directPeople}</div><div class="u">students move</div></div>` +
      `<div><div class="k">SwapChain</div><div class="v ai-text">${W2.chainPeople}</div><div class="u">students move</div></div></div>` +
      `<p class="stat-x">${ratio}x more students in the room they want.</p>` +
      `<div class="stat-facts"><span>Longest loop <b>${longest}</b></span><span>Swaps filed <b>${swapsFiled}</b></span><span>All BU 2-person swaps</span></div>`;
    statEl.innerHTML = "";
    st.statHtml = html;
  }

  // who moves where in a loop, in plain words (from explainCycle)
  function moveRows(cycle) {
    const ex = W2.explain(cycle);
    const sameDorm = new Set(cycle.map((id) => { const r = W2.roomsById.get(W2.listingsById.get(id).roomId); return r.towerId || r.dormId; })).size === 1;
    const short = (roomId) => {
      const r = W2.roomsById.get(roomId);
      return sameDorm ? `Floor ${r.floor} (${r.number})` : W2.roomLabel(roomId).replace(/^Warren /, "");
    };
    const rows = ex.map((h) => {
      const from = W2.listingsById.get(h.from), to = W2.listingsById.get(h.to);
      const p = W2.peopleById.get(from.personId);
      const you = h.from === ME.listingId;
      return `<li>${av(p, 30)}<div><div class="mv-line"><b>${esc(you ? `${p.first} (you)` : p.first)}</b><span>${esc(short(from.roomId))}</span>${icon("chevron", "xs")}<span class="to">${esc(short(to.roomId))}</span></div>` +
        `<div class="mv-why">${esc(h.reason)}</div></div></li>`;
    });
    return `<div class="section-label">Who moves where</div><ul class="moves ${loopStyle(cycle).cls}">${rows.join("")}</ul>`;
  }

  function pressSocial(J, sc) {
    st.pressed = true;
    render();
    const btn = document.querySelector(".demo-extra .social-btn");
    if (btn && canScroll()) btn.scrollIntoView(scrollOpts());
    const jared = W1.peopleById.get(sc.focus.stayingPersonId);
    const chooser = W1.peopleById.get(W1.listingsById.get(sc.focus.chooserListingId).personId);
    toast(`${chooser.first} wants to room with ${jared.first}. Looking for a loop.`, { iconName: "heart" });
    const m = map();
    later(700, () => {
      m.setThreads([...directs({ dim: true }), ...beats.map((bt, j) => loopT(`b${j}`, bt.loop, { dim: true, draw: false })), loopT("J", J, { focus: true, pins: true, draw: true })]);
      m.setExtraPins([{ person: jared, nearListing: sc.focus.listingId, offset: [0, 0], label: jared.first }]);
      st.fit = (d) => m.fitListings(J, { pitch: 50, duration: d });
      st.fit(1300);
      later(900, () => setCounter(W1.chainPeople, W1.wanting));
    });
  }

  function post() {
    if (st.posted) return;
    const sc = scenes[steps[st.step].s];
    if (sc.id !== "live-add") return;
    st.posted = true;
    const m = map();
    m.closeThread("L", 1.5);
    later(1300, () => setCounter(W2.chainPeople, W2.wanting, W2.directPeople));
    const L = sc.showcase[0];
    toast(`${la.person.first}'s post closed a chain of ${L.length}.`, { iconName: "loop" });
    render();
    scheduleAuto();
  }

  function playTimeline() {
    const host = document.querySelector(".demo-extra .timeline");
    if (!host || !st.tl) return;
    const { cycle, threadId } = st.tl;
    const k = cycle.length;
    const m = map();
    const confs = [...host.querySelectorAll("[data-conf]")];
    confs.forEach((c) => c.classList.remove("ok"));
    const n = host.querySelector(".conf-n");
    confs.forEach((c, j) => later(j * 250, () => { c.classList.add("ok"); if (n) n.textContent = String(j + 1); }));
    const start = confs.length * 250 + 300;
    const rows = [...host.querySelectorAll(".tl-row")];
    later(start - 100, () => { if (rows[0]) { rows[0].classList.add("complete"); if (canScroll()) rows[0].scrollIntoView(scrollOpts()); } });
    const label = W2.roomLabel(W2.listingsById.get(cycle[0]).roomId).replace(/^Warren /, "");
    for (let j = 0; j < k - 1; j++) {
      later(start + j * 1600, () => {
        rows.forEach((r, q) => { r.classList.toggle("active", q === j + 1); r.classList.toggle("pending", q > j + 1); });
        // keep the active swap fully in view (the last one too)
        if (rows[j + 1] && canScroll()) rows[j + 1].scrollIntoView({ ...scrollOpts(), block: j + 1 === rows.length - 1 ? "end" : "nearest" });
        const stEl = host.querySelector(`[data-status="${j}"]`);
        if (stEl) { stEl.className = "status filed"; stEl.textContent = "Filed"; }
        m.setHighlightSegment({ threadId, seg: j });
        m.setCarrier({ label: j < k - 2 ? `Holding ${label}` : "Done" });
      });
      later(start + j * 1600 + 1100, () => {
        const stEl = host.querySelector(`[data-status="${j}"]`);
        if (stEl) { stEl.className = "status ok"; stEl.textContent = "Approved"; }
        rows[j + 1] && rows[j + 1].classList.add("complete");
      });
    }
    later(start + (k - 1) * 1600 + 200, () => { m.setHighlightSegment(null); m.setCarrier(null); rows.forEach((r) => r.classList.remove("active", "pending")); });
  }

  function scheduleAuto() {
    if (!st.auto) return;
    const { s, b } = steps[st.step];
    let hold = HOLD[s];
    if (Array.isArray(hold)) hold = hold[b];
    const sc = scenes[s];
    if (sc.id === "live-add" && !st.posted) { later(5000, () => post()); return; }
    if (hold == null) { st.auto = false; render(); return; }
    later(hold, () => next(true));
  }

  function next(fromAuto = false) {
    if (!fromAuto) st.auto = false;
    const sc = scenes[steps[st.step].s];
    if (sc.id === "live-add" && !st.posted) { post(); return; }
    // the last scene stays put: an extra click on a clicker must not end the closing slide
    if (st.step < steps.length - 1) enter(st.step + 1);
    else render();
  }
  function back() { st.auto = false; if (st.step > 0) enter(st.step - 1, { fromBack: true }); }
  function toggleAuto() {
    st.auto = !st.auto;
    clearTimers();
    // autoplay holds the scene on screen for its normal time before moving on
    if (st.auto) { const sc = scenes[steps[st.step].s]; if (sc.id === "live-add" && !st.posted) later(1500, () => post()); else scheduleAuto(); }
    render();
  }
  function restart() { st.auto = false; enter(st.step); }

  // ---------- rendering ----------
  function caption() {
    const { s, b } = steps[st.step];
    const sc = scenes[s];
    if (b != null) return { cap: sc.beats[b].caption, sub: sc.beats[b].sub };
    if (sc.id === "live-add" && st.posted) return { cap: sc.captionAfter || sc.caption, sub: sc.sub };
    return { cap: sc.caption, sub: sc.sub };
  }

  function extras() {
    const { s } = steps[st.step];
    const sc = scenes[s];
    if (sc.id === "bu-swaps") {
      const X = sc.showcase[0];
      return `<div class="card tl-compact ${loopStyle(X).cls}">${timeline(W2, X, { confirmedIds: [], statuses: X.slice(1).map(() => "wait") })}</div>`;
    }
    const { b } = steps[st.step];
    if (b != null) return moveRows(sc.beats[b].loop);
    if (sc.id === "social") {
      const jack = W1.listingsById.get(sc.focus.listingId);
      const mayaP = W1.peopleById.get(W1.listingsById.get(sc.focus.chooserListingId).personId);
      return `<div class="section-label">${esc(mayaP.first)} is looking at</div>` + listingCard(W1, jack, { demoAs: mayaP.id, ringPerson: sc.focus.stayingPersonId, socialPressed: st.pressed ? sc.focus.stayingPersonId : null });
    }
    if (sc.id === "live-add") {
      const { person, room, listing } = la;
      return `<div class="card"><div class="person">${av(person, 44, { verified: true })}<div class="who"><div class="nm">${esc(person.name)}</div>` +
        `<div class="ln">New post · Class of ${person.year}</div></div></div>` +
        `<p class="wants">Has <b>${esc(W2.roomLabel(room.id))}</b> (floor ${room.floor}, ${esc(room.type)})<br>Wants <b>${esc(wantsText(W2, listing.wants))}</b></p>` +
        `<div class="card-actions"><button class="btn ${st.posted ? "done" : "primary"} big wide" data-act="demopost" ${st.posted ? "disabled" : ""}>${st.posted ? `${icon("check")}Posted` : "Post my room"}</button></div></div>`;
    }
    if (sc.id === "closing") return `<div class="card stat-inline">${st.statHtml || ""}<div class="stat-btns"><button class="btn secondary" data-act="demoreplay">Replay demo</button><button class="btn primary" data-act="tab" data-id="explore">Explore the map</button></div></div>`;
    return "";
  }

  function render() {
    if (app.route.tab !== "demo") return;
    const { s } = steps[st.step];
    const sc = scenes[s];
    const { cap, sub } = caption();
    const last = st.step === steps.length - 1;
    const prog = scenes.map((_, j) => `<button data-act="demogo" data-id="${steps.findIndex((x) => x.s === j)}" class="${j < s ? "done" : j === s ? "cur" : ""}" aria-label="Scene ${j + 1}"><i></i></button>`).join("");
    const ctrls = `<div class="demo-ctrls"><button class="icon-btn" data-act="demoback" aria-label="Back" ${st.step === 0 ? "disabled" : ""}>${icon("back")}</button>` +
      (last ? `<span class="demo-end">End of demo</span>` : `<button class="btn primary ${app.phone ? "" : "big"}" data-act="demonext">Next${icon("chevron")}</button>`) +
      (last ? "" : `<button class="icon-btn" data-act="demoauto" aria-label="${st.auto ? "Pause" : "Autoplay"}" aria-pressed="${st.auto}">${icon(st.auto ? "pause" : "play")}</button>`) +
      `<button class="icon-btn" data-act="demorestart" aria-label="Restart this scene">${icon("reset")}</button></div>`;
    const head = `<div class="scene-no">Scene ${s + 1} of ${scenes.length} · ${esc(sc.title)}</div>`;
    const kbd = st.step === 0 ? `<div class="kbd"><kbd>Right</kbd> next · <kbd>Left</kbd> back · <kbd>P</kbd> autoplay · <kbd>R</kbd> restart · <kbd>Esc</kbd> exit</div>` : "";
    const html = app.phone
      ? `<div class="view demo-rail">${head}<h1 class="caption">${esc(cap)}</h1>${ctrls}<div class="demo-progress" style="margin-top:12px">${prog}</div><p class="dsub">${esc(sub)}</p><div class="demo-extra">${extras()}</div>${footerNote()}</div>`
      : `<div class="view demo-rail">${head}<div class="demo-progress">${prog}</div><h1 class="caption">${esc(cap)}</h1><p class="dsub">${esc(sub)}</p>${ctrls}` +
        `${kbd}<div class="demo-extra">${extras()}</div></div>`;
    // keep the scroll position only when re-rendering the same step (for example after a tap)
    const same = st.renderedStep === st.step;
    st.renderedStep = st.step;
    app.setPanelHtml(html, { keepScroll: same });
  }

  return {
    start(i = 0) {
      document.getElementById("app").classList.add("demo-on");
      st.renderedStep = -1;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      const m = map();
      if (m) { m.meId = ME.listingId; m.setWorld(W2.listings, resolve); }
      st.shown = 0;
      enter(i);
    },
    stop() {
      clearTimers();
      st.auto = false;
      document.getElementById("app").classList.remove("demo-on");
      statEl.classList.remove("on");
      const m = map();
      if (m) { m.setCarrier(null); m.setHighlightSegment(null); m.setExtraPins([]); m.setBeads([]); m.setThreads([]); m.setLabelsDimmed(false); m.clearDemoExplode(); m.setArcScale(1); m.noOrbit = false; }
      try {
        const q = new URLSearchParams(location.search);
        if (q.has("demo")) { q.delete("demo"); q.delete("beat"); const qs = q.toString(); history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}`); }
      } catch (e) { /* optional */ }
    },
    refit() { if (st.fit) st.fit(300); },
    render,
    action(act, ds) {
      if (act === "demonext") next();
      else if (act === "demoback") back();
      else if (act === "demoauto") toggleAuto();
      else if (act === "demorestart") restart();
      else if (act === "demoreplay") { st.auto = false; st.shown = 0; enter(0); }
      else if (act === "demopost") post();
      else if (act === "demogo") { st.auto = false; enter(Number(ds.id)); }
      else return false;
      return true;
    },
    key(e) {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); if (!e.repeat) next(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); if (!e.repeat) back(); }
      else if (e.key === "p" || e.key === "P") toggleAuto();
      else if (e.key === "r" || e.key === "R") restart();
      else return false;
      return true;
    },
    sceneIndexFor(n, beat = 0) {
      const i = steps.findIndex((x) => x.s === n && (x.b == null || x.b === beat));
      return i >= 0 ? i : steps.findIndex((x) => x.s === n);
    },
    get numbers() { return { W0, W1, W2, beatCounts, swapsFiled, longest }; },
  };
}
