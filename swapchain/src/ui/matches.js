// Matches for ME: 1-to-1 swaps (usually none) and loops through ME.
import { esc, icon } from "./dom.js";
import { cycleKey, personRoom, roomCode, ME, store } from "../engine.js";
import { getMode } from "../theme.js";
import { matchCard, footerNote, emptyState, listingCard, av } from "./cards.js";

function matchCountText(d, c) {
  const parts = [];
  if (d) parts.push(`${d} 1-to-1 swap${d === 1 ? "" : "s"}`);
  if (c) parts.push(`${c} loop${c === 1 ? "" : "s"}`);
  return `${parts.join(" and ")} include${d + c === 1 ? "s" : ""} you.`;
}

export function matchesView(app) {
  const world = app.world;
  const { direct, chains } = world.mine;
  const n = chains.length + direct.length;
  const out = [];
  out.push(`<div class="view">`);
  out.push(`<div class="vhead" data-drag><div class="titles"><h1 class="large-title">Matches</h1>` +
    `<p class="sub">${n ? matchCountText(direct.length, chains.length) : "No loops through you yet."} Everyone in a loop gets a room they asked for.</p></div></div>`);
  out.push(`<div class="section-label">1-to-1 swaps</div>`);
  if (!direct.length) {
    out.push(`<div class="card"><div class="person"><span class="dorm-tile" style="width:40px;height:40px">${icon("swap")}</span><div class="who"><div class="nm" style="font-size:15px">None</div>` +
      `<div class="ln">Nobody whose room you want also wants yours. That is normal. Loops fix it.</div></div></div></div>`);
  } else {
    direct.forEach((c) => out.push(matchCard(world, c, { open: app.ui.openLoop === cycleKey(c), expanded: app.ui.openPerson && app.ui.openPerson.key === cycleKey(c) ? app.ui.openPerson.id : null })));
  }
  out.push(`<div class="section-label">Loops through you</div>`);
  if (!chains.length) {
    out.push(emptyState("No loops yet", "Most loops close when one more person joins. We'll keep looking as people post.", `<button class="btn primary" data-act="tab" data-id="post">Post my room</button>`));
  } else {
    chains.forEach((c) => out.push(matchCard(world, c, { open: app.ui.openLoop === cycleKey(c), expanded: app.ui.openPerson && app.ui.openPerson.key === cycleKey(c) ? app.ui.openPerson.id : null })));
  }
  out.push(footerNote());
  out.push(`</div>`);
  return out.join("");
}

export function profileTab(app) {
  const world = app.world;
  const me = world.peopleById.get(ME.personId);
  const myListing = world.listingsById.get(world.meListingId);
  const room = personRoom(world, ME.personId);
  const mode = getMode();
  const out = [];
  out.push(`<div class="view">`);
  out.push(`<div class="vhead" data-drag><div class="titles"><h1 class="large-title">Profile</h1></div></div>`);
  out.push(`<div class="profile-hero">${av(me, 104, { verified: true })}<h2>${esc(me.name)}</h2><div class="ln">Class of ${me.year} · ${esc(me.major)}</div>` +
    `<div class="ln">${esc(roomCode(world, room))}</div><p class="bio">${esc(me.bio)}</p></div>`);
  out.push(`<div class="section-label">Into</div><div class="chips">${me.interests.map((i) => `<span class="chip">${esc(i)}</span>`).join("")}</div>`);
  out.push(`<div class="section-label">Instagram</div><div class="chips"><span class="chip ig" title="Demo handle, not a real account">${icon("camera")}@${esc(me.instagram)}</span></div>`);
  out.push(`<div class="section-label">Your room</div>`);
  out.push(myListing ? listingCard(world, myListing) : `<div class="card"><p class="note" style="margin:0">You haven't posted a room yet.</p></div>`);
  out.push(`<div class="section-label">Your loops</div><div class="group">`);
  if (!world.mine.chains.length) out.push(`<div class="row"><span class="meta">No loops yet.</span></div>`);
  world.mine.chains.forEach((c) => {
    const k = c.length;
    const next = world.listingsById.get(c[1]);
    out.push(`<button class="row" data-act="gotoloop" data-key="${esc(cycleKey(c))}"><span class="dorm-tile">${icon("loop")}</span><span class="body"><span class="name">Chain of ${k}</span>` +
      `<span class="meta" style="display:block">You move to ${esc(world.roomLabel(next.roomId))}${store.confirmed.has(cycleKey(c)) ? " · Confirmed" : ""}</span></span>${icon("chevron", "chev")}</button>`);
  });
  out.push(`</div>`);
  out.push(`<div class="section-label">Settings</div><div class="group">`);
  out.push(`<div class="setting"><span>Appearance</span><div class="seg" style="width:210px" role="group" aria-label="Appearance">` +
    ["auto", "light", "dark"].map((m) => `<button data-act="theme" data-id="${m}" aria-pressed="${mode === m}">${m === "auto" ? "Auto" : m === "light" ? "Light" : "Dark"}</button>`).join("") + `</div></div>`);
  out.push(`<div class="setting"><span>Demo data</span><button class="btn secondary" data-act="reset">Reset demo data</button></div>`);
  out.push(`</div>`);
  out.push(`<div class="section-label">About</div><div class="card"><p class="note" style="margin:0">SwapChain is a class prototype for DS229. BU's Direct Swap approves 2-person swaps, so every loop here is filed as back-to-back 2-person swaps after everyone confirms. Fall window: until Nov 30, 2026. Spring window: Jan 15 to Feb 11, 2027.</p></div>`);
  out.push(footerNote());
  out.push(`</div>`);
  return out.join("");
}
