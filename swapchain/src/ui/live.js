// Live feed (desktop Explore home): a short stack of what just happened on SwapChain, in the open sky
// at the top right. A new event slides in every few seconds; hover one to light its dorm on the map,
// click to fly there. Also the connector line that ties a hovered card to its building on the map.
import { esc, icon } from "./dom.js";
import { dormsById, wantsText, roomCode, cycleKey } from "../engine.js";
import { av, shortName } from "./cards.js";

const SHOW = 4, EVERY = 4200;

function buildEvents(world) {
  const posts = world.listings
    .filter((l) => l.id !== world.meListingId)
    .slice()
    .sort((a, b) => (a.postedDaysAgo || 0) - (b.postedDaysAgo || 0))
    .map((l) => {
      const p = world.peopleById.get(l.personId);
      const room = world.roomsById.get(l.roomId);
      return { kind: "post", id: `p-${l.id}`, listingId: l.id, person: p, dormIds: [room.dormId], towerId: room.towerId || "", title: `${shortName(p)} posted ${roomCode(world, room)}`, sub: `wants ${wantsText(world, l.wants)}` };
    });
  const loops = world.best.filter((c) => c.length >= 3).map((c, i) => {
    const dormIds = c.map((id) => world.roomsById.get(world.listingsById.get(id).roomId).dormId);
    const names = [...new Set(dormIds)].map((d) => dormsById.get(d).short);
    const mine = c.includes(world.meListingId);
    return { kind: "loop", id: `l-${i}`, key: cycleKey(c), cycle: c, dormIds, mine, title: mine ? `A loop of ${c.length} includes you` : `Loop of ${c.length} found`, sub: names.join(" → ") };
  });
  // a loop after every two posts, so the feed shows both sides of the marketplace
  const out = [];
  let li = 0;
  posts.forEach((p, i) => { out.push(p); if (i % 2 === 1 && li < loops.length) out.push(loops[li++]); });
  while (li < loops.length) out.push(loops[li++]);
  return out;
}

function ago(k) {
  const m = [1, 3, 6, 11, 17, 24, 32, 45][k] || 50 + k;
  return m < 60 ? `${m}m ago` : "1h ago";
}

export function createLive(app, { reducedMotion }) {
  const el = document.getElementById("live");
  const line = document.getElementById("linkline");
  let events = [], head = 0, timer = 0, paused = false, worldRef = null;
  let link = null, raf = 0;

  function item(ev, k) {
    const lead = ev.kind === "post" ? av(ev.person, 34) : `<span class="live-loop ${ev.mine ? "mine" : ""}">${icon("loop", "sm")}</span>`;
    return `<button class="live-item ${ev.kind}" data-ev="${esc(ev.id)}" data-dorm="${esc(ev.dormIds[0])}" data-tower="${esc(ev.towerId || "")}" data-loop="${esc(ev.key || "")}" aria-label="${esc(`${ev.title}, ${ev.sub}`)}">` +
      `${lead}<span class="live-body"><span class="live-title">${esc(ev.title)}</span><span class="live-sub">${esc(ev.sub)}</span></span>` +
      `<span class="live-time">${k === 0 ? "now" : ago(k)}</span></button>`;
  }

  function stats(world) {
    const loops = world.best.filter((c) => c.length >= 3).length;
    return `<div class="live-stats"><span><b>${world.wanting}</b> posted</span><span><b>${loops}</b> loops</span><span><b>${world.chainPeople}</b> can move</span></div>`;
  }

  function draw(fresh) {
    const list = [];
    for (let k = 0; k < Math.min(SHOW, events.length); k++) list.push(item(events[(head - k + events.length * 9) % events.length], k));
    el.innerHTML = `<div class="live-head"><span class="live-dot" aria-hidden="true"></span>Live on SwapChain</div>${stats(worldRef)}<div class="live-list">${list.join("")}</div>`;
    if (fresh && !reducedMotion()) el.querySelector(".live-item")?.classList.add("enter");
  }

  function tick() {
    if (!paused && el.classList.contains("on")) { head = (head + 1) % events.length; draw(true); }
    timer = setTimeout(tick, EVERY);
  }

  function show(on) {
    el.classList.toggle("on", on);
    if (!on) unlink();
  }

  function update(world) {
    if (world !== worldRef) {
      worldRef = world;
      events = buildEvents(world);
      head = Math.min(SHOW - 1, events.length - 1);
      draw(false);
    }
    const r = app.route;
    show(!!events.length && r.tab === "explore" && !r.dormId && !r.personId && !r.loopKey);
    if (!timer && !reducedMotion()) timer = setTimeout(tick, EVERY);
  }

  // ---- connector line: card edge to the dorm's label on the map ----
  function linkTo(fromEl, dormId, towerId) {
    link = { fromEl, dormId, towerId };
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function unlink() {
    link = null;
    line.classList.remove("on");
  }
  function frame() {
    raf = 0;
    if (!link || !app.map || !app.map.labels) return unlink();
    if (!link.fromEl.isConnected) return unlink();
    // aim at the building itself (its roof), not its label, which can move or merge into a pill
    const pt = app.map.screenPointFor && app.map.screenPointFor(link.dormId, link.towerId);
    if (!pt) return unlink();
    const a = link.fromEl.getBoundingClientRect();
    const fromRight = a.right < pt[0];
    const x1 = fromRight ? a.right + 6 : a.left - 6, y1 = a.top + a.height / 2;
    const [x2, y2] = pt;
    const dx = Math.max(60, Math.abs(x2 - x1) * 0.45) * (fromRight ? 1 : -1);
    line.querySelector("path").setAttribute("d", `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
    line.querySelector("circle").setAttribute("cx", x2);
    line.querySelector("circle").setAttribute("cy", y2);
    line.classList.add("on");
    raf = requestAnimationFrame(frame);
  }

  function wireHover(root, sel, dormOf) {
    root.querySelectorAll(sel).forEach((n) => {
      const on = () => { const d = dormOf(n); if (!d) return; app.map && app.map.hoverDorm(d); if (window.matchMedia("(hover: hover)").matches) linkTo(n, d); };
      const off = () => { app.map && app.map.hoverDorm(null); unlink(); };
      n.addEventListener("pointerenter", on);
      n.addEventListener("pointerleave", off);
      n.addEventListener("focus", on);
      n.addEventListener("blur", off);
    });
  }

  el.addEventListener("pointerenter", () => { paused = true; });
  el.addEventListener("pointerleave", () => { paused = false; });
  el.addEventListener("click", (e) => {
    const b = e.target.closest(".live-item");
    if (!b) return;
    unlink();
    app.map && app.map.hoverDorm(null);
    const ev = events.find((x) => x.id === b.dataset.ev);
    if (ev && ev.kind === "loop") {
      // your own loop opens in Matches (where you confirm); anyone else's is shown on the map
      const set = [...ev.cycle].sort().join();
      const mine = ev.mine && worldRef.mine.chains.find((c) => [...c].sort().join() === set);
      if (mine) { app.ui.openLoop = cycleKey(mine); app._fitKey = null; app.go({ tab: "matches" }); }
      else app.go({ tab: "explore", loopKey: ev.key });
      return;
    }
    if (ev && ev.kind === "post" && app.openListingRoom) return app.openListingRoom(ev.listingId);
    app.go({ tab: "explore", dormId: b.dataset.dorm, towerId: null, floor: null });
  });
  // the feed re-renders itself, so wire hover by delegation
  el.addEventListener("pointerover", (e) => {
    const b = e.target.closest(".live-item");
    if (!b || b === el._hov) return;
    el._hov = b;
    app.map && app.map.hoverDorm(b.dataset.dorm);
    linkTo(b, b.dataset.dorm, b.dataset.tower);
  });
  el.addEventListener("pointerleave", () => { el._hov = null; app.map && app.map.hoverDorm(null); unlink(); });

  return { update, wireHover, unlink };
}
