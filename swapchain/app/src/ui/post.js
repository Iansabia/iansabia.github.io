// Post your room: 3 steps, plus the live demo preset (DEMO.liveAdd) that closes a waiting loop.
import { esc, icon, toast } from "./dom.js";
import { DORMS, dormsById, DEMO, ME, store, postMyRoom, postLiveAdd, roomOk, cycleKey } from "../engine.js";
import { listingCard, matchCard, timeline, footerNote, emptyState, av, shortName } from "./cards.js";
import { accepts } from "../chains.js";

const WEST = ["claflin", "sleeper", "rich", "1019"];

export function defaultDraft(world) {
  const me = world.listingsById.get(world.meListingId);
  const room = world.roomsById.get(me.roomId);
  return {
    dormId: room.dormId, towerId: room.towerId, floor: room.floor, number: room.number, type: room.type,
    roommatesOn: room.occupants.length > 1, roommates: room.occupants.filter((p) => p !== ME.personId),
    dorms: [...me.wants.dorms], anyFloor: me.wants.floorMin == null && me.wants.floorMax == null,
    floorMin: me.wants.floorMin ?? 2, floorMax: me.wants.floorMax ?? 18, types: [...me.wants.types],
    note: me.note || "", showProfile: true,
  };
}

function stepper(step) {
  return `<div class="stepper" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i < step ? "done" : i === step ? "cur" : ""}"></i>`).join("")}</div>`;
}

function numstep(field, val, label) {
  return `<div class="numstep" role="group" aria-label="${esc(label)}"><button type="button" data-act="pstep" data-id="${field}" data-d="-1" aria-label="${esc(label)} down">-</button>` +
    `<output>${val}</output><button type="button" data-act="pstep" data-id="${field}" data-d="1" aria-label="${esc(label)} up">+</button></div>`;
}

export function validRoom(d) {
  const num = String(d.number || "").trim().toUpperCase();
  if (!num) return "Add your room number.";
  if (!/^\d{3,4}[A-Z]?$/.test(num)) return "Use a room number like 708 or 1407.";
  if (!num.startsWith(String(d.floor))) return `Room numbers on floor ${d.floor} start with ${d.floor}.`;
  if (!roomOk(d.dormId, d.towerId, num)) return "Someone already posted that room.";
  return "";
}

export function postView(app) {
  const world = app.world;
  const P = app.post;
  const out = [`<div class="view">`];
  const head = (title, sub, back = true) => out.push(`<div class="vhead" data-drag>${back ? `<button class="back" data-act="pback" aria-label="Back">${icon("back")}</button>` : ""}<div class="titles"><h1 class="${back ? "title" : "large-title"}">${esc(title)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ""}</div></div>`);

  if (P.step === 0) {
    head("Post", "Post the room you have and what you'd take instead. Every new post can close loops that were waiting.", false);
    const noorDone = store.listings.some((l) => l.id === DEMO.liveAdd.listing.id);
    out.push(`<button class="preset" data-act="${noorDone ? "pnoorresult" : "pnoor"}"><span class="t">${icon("playCircle")}Live demo: one more post</span>` +
      `<span class="d">${noorDone ? "Noor's room is posted. See the loop it closed." : esc(DEMO.liveAdd.caption)}</span></button>`);
    out.push(`<div class="section-label">Your room</div><div class="card"><div class="person">${av(world.peopleById.get(ME.personId), 44)}<div class="who"><div class="nm">Post or update your room</div><div class="ln">3 quick steps. Takes under a minute.</div></div></div>` +
      `<div class="card-actions"><button class="btn primary" data-act="pstart">${icon("plus")}Start</button></div></div>`);
    out.push(footerNote());
  } else if (P.step === 1) {
    const d = P.draft;
    const dorm = dormsById.get(d.dormId);
    const err = P.touched ? validRoom(d) : "";
    head("Your room", "Step 1 of 3");
    out.push(stepper(1));
    out.push(`<div class="field"><label for="p-dorm">Dorm</label><select class="select" id="p-dorm" data-field="dormId">` +
      DORMS.map((x) => `<option value="${x.id}" ${x.id === d.dormId ? "selected" : ""}>${esc(x.name)}</option>`).join("") + `</select></div>`);
    if (dorm.towers.length) {
      out.push(`<div class="field"><span class="lbl">Tower</span><div class="seg" role="group" aria-label="Tower">` + dorm.towers.map((t) => `<button data-act="pset" data-id="towerId" data-v="${t.id}" aria-pressed="${d.towerId === t.id}">${esc(t.name)} ${t.letter}</button>`).join("") + `</div></div>`);
    }
    out.push(`<div class="field two"><div><span class="lbl" style="display:block;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:8px">Floor</span>${numstep("floor", d.floor, "Floor")}</div>` +
      `<div style="flex:1;min-width:140px"><label for="p-num" style="display:block;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:8px">Room number</label><input class="input mono" id="p-num" data-field="number" inputmode="numeric" autocomplete="off" value="${esc(d.number)}" style="font-size:17px"></div></div>`);
    if (err) out.push(`<div class="err">${icon("warning", "xs")}${esc(err)}</div>`);
    out.push(`<div class="field"><span class="lbl">Room type</span><div class="chips">` + dorm.roomTypes.map((t) => `<button class="chip" data-act="pset" data-id="type" data-v="${t}" aria-pressed="${d.type === t}">${esc(t[0].toUpperCase() + t.slice(1))}</button>`).join("") + `</div></div>`);
    const mates = (world.roomsById.get(world.listingsById.get(world.meListingId).roomId)?.occupants || []).filter((p) => p !== ME.personId);
    out.push(`<div class="field"><div class="toggle-row"><span>A roommate is staying</span><button class="switch" role="switch" aria-checked="${d.roommatesOn}" data-act="ptoggle" data-id="roommatesOn" aria-label="A roommate is staying"></button></div>` +
      (d.roommatesOn ? `<div class="chips" style="margin-top:6px">${mates.map((id) => { const p = world.peopleById.get(id); return `<button class="chip" data-act="pmate" data-id="${id}" aria-pressed="${d.roommates.includes(id)}">${esc(p.name)}</button>`; }).join("") || '<span class="sub">No roommates on file.</span>'}</div>` : "") + `</div>`);
    out.push(`<div class="post-actions"><button class="btn secondary" data-act="pback">Back</button><button class="btn primary" data-act="pnext">Next</button></div>`);
  } else if (P.step === 2) {
    const d = P.draft;
    head("What you'd take", "Step 2 of 3");
    out.push(stepper(2));
    const quickWest = WEST.every((w) => d.dorms.includes(w)) && d.dorms.length === 4;
    out.push(`<div class="field"><span class="lbl">Dorms (none picked means any)</span><div class="chips" style="margin-bottom:8px"><button class="chip soft" data-act="pquick" data-id="west" aria-pressed="${quickWest}">Any West Campus</button><button class="chip soft" data-act="pquick" data-id="warren">Anywhere in Warren</button><button class="chip soft" data-act="pquick" data-id="any">Anywhere</button></div><div class="chips">` +
      DORMS.map((x) => `<button class="chip" data-act="pdorm" data-id="${x.id}" aria-pressed="${d.dorms.includes(x.id)}">${esc(x.short)}</button>`).join("") + `</div></div>`);
    out.push(`<div class="field"><div class="toggle-row"><span>Any floor</span><button class="switch" role="switch" aria-checked="${d.anyFloor}" data-act="ptoggle" data-id="anyFloor" aria-label="Any floor"></button></div>` +
      (d.anyFloor ? "" : `<div class="two" style="margin-top:8px"><div><span class="lbl" style="display:block;font-size:13px;color:var(--muted);margin-bottom:6px">From floor</span>${numstep("floorMin", d.floorMin, "From floor")}</div><div><span class="lbl" style="display:block;font-size:13px;color:var(--muted);margin-bottom:6px">To floor</span>${numstep("floorMax", d.floorMax, "To floor")}</div></div>`) + `</div>`);
    out.push(`<div class="field"><span class="lbl">Room type (none picked means any)</span><div class="chips">` + ["single", "double", "triple", "suite"].map((t) => `<button class="chip" data-act="ptype" data-id="${t}" aria-pressed="${d.types.includes(t)}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("") + `</div></div>`);
    const persons = store.alts.filter((a) => a.kind === "person").map((a) => world.peopleById.get(a.personId)).filter(Boolean);
    // live: the rooms that fit right now, lit on the map as you change your picks
    const fits = draftMatches(world, d);
    out.push(`<div class="field fits-now" aria-live="polite"><span class="lbl">${fits.length ? `${fits.length} room${fits.length === 1 ? "" : "s"} fit this right now` : "Nothing posted fits this yet"}</span>` +
      (fits.length ? `<div class="group">${fits.slice(0, 5).map((l) => { const p = world.peopleById.get(l.personId); const r = world.roomsById.get(l.roomId); return `<button class="row" data-act="seeroom" data-id="${esc(l.id)}">${av(p, 32)}<span class="body"><span class="name" style="font-size:15px">${esc(world.roomLabel(l.roomId))}</span><span class="meta" style="display:block">${esc(r.type[0].toUpperCase() + r.type.slice(1))} · ${esc(shortName(p))} is leaving</span></span>${icon("chevron", "sm")}</button>`; }).join("")}${fits.length > 5 ? `<div class="row"><span class="meta">and ${fits.length - 5} more, lit on the map</span></div>` : ""}</div>` : `<p class="sub" style="margin:0">You can still post. New posts can close a loop with you later.</p>`) + `</div>`);
    out.push(`<div class="field"><span class="lbl">Open to living with</span>${persons.length ? `<div class="chips">${persons.map((p) => `<span class="chip on">${icon("heart", "xs")}${esc(shortName(p))}</span>`).join("")}</div>` : `<p class="sub" style="margin:0">Tap "I'd room with..." on any listing to add someone.</p>`}</div>`);
    out.push(`<div class="field"><label for="p-note">Anything else?</label><textarea class="input" id="p-note" data-field="note" maxlength="120">${esc(d.note)}</textarea><div class="sub" style="text-align:right;font-size:12px"><span id="p-note-n">${d.note.length}</span>/120</div></div>`);
    out.push(`<div class="post-actions"><button class="btn secondary" data-act="pback">Back</button><button class="btn primary" data-act="pnext">Next</button></div>`);
  } else if (P.step === 3) {
    const d = P.draft;
    head("Look good?", "Step 3 of 3");
    out.push(stepper(3));
    out.push(`<div class="section-label">How others will see it</div>${previewCard(world, d)}`);
    out.push(`<div class="field"><div class="toggle-row"><span>Show my profile to people in a loop with me</span><button class="switch" role="switch" aria-checked="${d.showProfile}" data-act="ptoggle" data-id="showProfile" aria-label="Show my profile to people in a loop with me"></button></div></div>`);
    out.push(`<div class="post-actions"><button class="btn secondary" data-act="pback">Back</button><button class="btn primary big" data-act="ppost">Post my room</button></div>`);
  } else if (P.step === "noor") {
    head("Live: one more post", "Posting as a demo student");
    out.push(`<p class="sub" style="margin:0 0 12px">${esc(DEMO.liveAdd.caption)}</p>`);
    out.push(noorPreview(world));
    out.push(`<div class="post-actions"><button class="btn secondary" data-act="pback">Back</button><button class="btn primary big" data-act="pnoorpost">Post my room</button></div>`);
  } else if (P.step === "searching") {
    out.push(`<div class="searching" role="status"><svg viewBox="0 0 24 24"><path d="M7.5 15.5c-3-1-3.5-5.5 0-7.5 2.6-1.5 5.3.4 6.5 2.5s3.9 4 6.5 2.5c3.5-2 3-6.5 0-7.5"/><path d="M16.5 8.5c3 1 3.5 5.5 0 7.5-2.6 1.5-5.3-.4-6.5-2.5S6.6 9.5 4 11"/></svg><b style="color:var(--text)">Looking for loops</b><span>Checking ${world.listings.length} posts</span></div>`);
  } else if (P.step === "noorresult") {
    const id = DEMO.liveAdd.listing.id;
    const c = world.cycles.find((x) => x.includes(id));
    head("Loop found", null);
    if (c) {
      const i = c.indexOf(id);
      const cyc = c.slice(i).concat(c.slice(0, i));
      out.push(`<p class="sub" style="margin:-6px 0 12px">One new post. ${c.length} people move.</p>`);
      out.push(matchCard(world, cyc, { meId: id, open: true }));
    } else out.push(emptyState("No loop yet", "Try resetting the demo data in Profile."));
    out.push(`<div class="post-actions"><button class="btn secondary" data-act="pdone">Done</button></div>`);
  } else if (P.step === "none") {
    head("No loop yet", null);
    out.push(emptyState("No loop yet", "You're 1 step away from a few loops. When someone posts the missing room, you'll see it here.", `<button class="btn primary" data-act="poneaway">See who's 1 step away</button>`));
    if (P.oneAway) out.push(oneAway(world));
  }
  out.push(`</div>`);
  return out.join("");
}

function previewCard(world, d) {
  const me = world.listingsById.get(world.meListingId);
  const roomId = `${d.towerId || d.dormId}-${String(d.number).toUpperCase()}`;
  const room = { id: roomId, dormId: d.dormId, towerId: d.towerId || null, floor: d.floor, number: String(d.number).toUpperCase(), type: d.type, occupants: [ME.personId, ...(d.roommatesOn ? d.roommates : [])] };
  const l = { ...me, roomId, wants: draftWants(d), note: d.note };
  const fake = Object.create(world);
  fake.roomsById = new Map(world.roomsById).set(roomId, room);
  return listingCard(fake, l, { compact: false });
}

function noorPreview(world) {
  const { person, room, listing } = DEMO.liveAdd;
  const fake = Object.create(world);
  fake.roomsById = new Map(world.roomsById).set(room.id, room);
  fake.peopleById = new Map(world.peopleById).set(person.id, person);
  return listingCard(fake, listing, { demoAs: person.id });
}

/** Posted rooms that fit what you'd take right now (same test the loop finder uses). */
export function draftMatches(world, d) {
  const me = world.listingsById.get(world.meListingId);
  if (!me) return [];
  const probe = { ...me, wants: draftWants(d) };
  return world.listings.filter((l) => l.id !== me.id && accepts(probe, l, world.roomsById, dormsById, world.peopleById));
}

export function draftWants(d) {
  return {
    dorms: [...d.dorms], towers: [], floorMin: d.anyFloor ? null : d.floorMin, floorMax: d.anyFloor ? null : d.floorMax,
    types: [...d.types], withPeople: [], notDorms: [],
  };
}

function oneAway(world) {
  const me = world.listingsById.get(world.meListingId);
  const wantMine = [];
  for (const [from, set] of world.accept) if (set.has(me.id)) wantMine.push(from);
  const iWant = [...(world.accept.get(me.id) || [])];
  const row = (id) => { const l = world.listingsById.get(id); const p = world.peopleById.get(l.personId); return `<div class="row">${av(p, 36)}<span class="body"><span class="name" style="font-size:15px">${esc(shortName(p))}</span><span class="meta" style="display:block">${esc(world.roomLabel(l.roomId))}</span></span></div>`; };
  return `<div class="section-label">They'd take your room (${wantMine.length})</div><div class="group">${wantMine.slice(0, 6).map(row).join("") || '<div class="row"><span class="meta">Nobody yet</span></div>'}</div>` +
    `<div class="section-label">Rooms you'd take (${iWant.length})</div><div class="group">${iWant.slice(0, 6).map(row).join("") || '<div class="row"><span class="meta">Nobody yet</span></div>'}</div>`;
}

/** Click handlers for the post flow. Return true if handled. */
export function postAction(app, act, ds) {
  const P = app.post;
  const d = P.draft;
  switch (act) {
    case "pstart": P.draft = defaultDraft(app.world); P.step = 1; P.touched = false; P.mode = "me"; break;
    case "pnoor": P.step = "noor"; P.mode = "noor"; if (app.phone) app.setSheet("half"); break;
    case "pnoorresult": P.step = "noorresult"; P.mode = "noor"; if (app.phone) app.setSheet("half"); break;
    case "pback":
      if (P.step === "noor" || P.step === 1 || P.step === "none") P.step = 0;
      else if (typeof P.step === "number" && P.step > 1) P.step -= 1;
      break;
    case "pnext":
      if (P.step === 1) { P.touched = true; if (validRoom(d)) { app.render(); return true; } }
      if (P.step === 2 && !d.anyFloor && d.floorMin > d.floorMax) { const t = d.floorMin; d.floorMin = d.floorMax; d.floorMax = t; }
      P.step += 1;
      break;
    case "pset":
      d[ds.id] = ds.v;
      break;
    case "pstep": {
      const dorm = dormsById.get(d.dormId);
      const [lo, hi] = dorm.floors;
      const f = ds.id;
      const lim = f === "floor" ? [lo, hi] : [1, 18];
      d[f] = Math.max(lim[0], Math.min(lim[1], d[f] + Number(ds.d)));
      if (f === "floor" && /^\d/.test(d.number)) {
        const suffix = String(d.number).slice(-2);
        d.number = `${d.floor}${suffix}`;
      }
      break;
    }
    case "ptoggle": d[ds.id] = !d[ds.id]; break;
    case "pmate": d.roommates = d.roommates.includes(ds.id) ? d.roommates.filter((x) => x !== ds.id) : [...d.roommates, ds.id]; break;
    case "pdorm": d.dorms = d.dorms.includes(ds.id) ? d.dorms.filter((x) => x !== ds.id) : [...d.dorms, ds.id]; break;
    case "pquick":
      if (ds.id === "west") d.dorms = [...WEST];
      else if (ds.id === "warren") d.dorms = ["warren"];
      else d.dorms = [];
      break;
    case "ptype": d.types = d.types.includes(ds.id) ? d.types.filter((x) => x !== ds.id) : [...d.types, ds.id]; break;
    case "ppost": {
      P.step = "searching";
      app.render();
      setTimeout(() => {
        postMyRoom({
          dormId: d.dormId, towerId: dormsById.get(d.dormId).towers.length ? d.towerId : null, floor: d.floor,
          number: String(d.number).toUpperCase(), type: d.type, roommates: d.roommatesOn ? d.roommates : [],
          wants: draftWants(d), note: d.note,
        });
        toast("Room posted. Looking for loops.", { iconName: "check" });
        const chains = app.world.mine.chains;
        if (chains.length) {
          const c = chains[0];
          setTimeout(() => toast(`You're in a chain of ${c.length}!`, { iconName: "loop" }), 900);
          P.step = 0;
          app.ui.openLoop = cycleKey(c);
          app.go({ tab: "matches" });
        } else {
          P.step = "none";
          app.render();
        }
      }, 1100);
      return true;
    }
    case "poneaway": P.oneAway = true; break;
    case "pnoorpost": {
      P.step = "searching";
      app.render();
      setTimeout(() => {
        postLiveAdd();
        P.step = "noorresult";
        app.render();
        app.closeOpenThread && app.closeOpenThread();
        const c = app.world.cycles.find((x) => x.includes(DEMO.liveAdd.listing.id));
        if (c) setTimeout(() => toast(`Noor's post closed a chain of ${c.length}.`, { iconName: "loop" }), 700);
      }, 900);
      return true;
    }
    case "pdone": P.step = 0; break;
    default: return false;
  }
  app.render();
  return true;
}

export function postInput(app, field, value) {
  const d = app.post.draft;
  if (!d) return;
  if (field === "dormId") {
    d.dormId = value;
    const dorm = dormsById.get(value);
    d.towerId = dorm.towers.length ? dorm.towers[0].id : null;
    d.floor = Math.max(dorm.floors[0], Math.min(dorm.floors[1], d.floor));
    if (!dorm.roomTypes.includes(d.type)) d.type = dorm.roomTypes[0];
    app.render();
  } else if (field === "number") {
    d.number = value.toUpperCase();
  } else if (field === "note") {
    d.note = value.slice(0, 120);
    const n = document.getElementById("p-note-n");
    if (n) n.textContent = String(d.note.length);
  }
}
