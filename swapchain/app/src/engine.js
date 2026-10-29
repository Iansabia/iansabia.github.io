// App data store + chain finder wiring. All numbers come from src/chains.js.
import * as C from "./chains.js";
import { PEOPLE, ROOMS, LISTINGS, ME, DEMO } from "../data/people.js";
import { DORMS } from "../data/dorms.js";

export { DORMS, DEMO, ME };
export const dormsById = new Map(DORMS.map((d) => [d.id, d]));

const clone = (x) => JSON.parse(JSON.stringify(x));
const byId = (arr) => new Map(arr.map((x) => [x.id, x]));

/** Build a full context (indexes + chain results) for one set of data. */
export function buildWorld(people, rooms, listings, { alts = [], meListingId = ME.listingId } = {}) {
  const peopleById = byId(people);
  const roomsById = byId(rooms);
  const listingsById = byId(listings);
  const ctx = { peopleById, roomsById, listingsById, dormsById };

  const accept = C.acceptMatrix(listings, rooms, DORMS, people);
  const me = listingsById.get(meListingId);
  // ME's extra wants ("I want this room", "I'd room with X") are OR'd with the posted wants.
  const altEdge = new Map(); // listingId -> alt that justified it
  if (me && alts.length) {
    const row = new Set(accept.get(me.id) || []);
    for (const b of listings) {
      if (b.id === me.id || b.roomId === me.roomId) continue;
      for (const alt of alts) {
        let ok = false;
        if (alt.kind === "room" && b.roomId === alt.roomId) {
          const rb = roomsById.get(b.roomId);
          const ra = roomsById.get(me.roomId);
          ok = !!(ra && rb && dormsById.get(ra.dormId)?.priceTier === dormsById.get(rb.dormId)?.priceTier);
          // single-gender rooms: only if the student leaving and the roommates staying match you
          const g = peopleById.get(me.personId)?.gender;
          if (ok && g) ok = rb.occupants.concat(b.personId).every((pid) => !peopleById.get(pid)?.gender || peopleById.get(pid).gender === g);
        } else if (alt.kind === "person") {
          const synth = { ...me, wants: { dorms: [], towers: [], floorMin: null, floorMax: null, types: [], withPeople: [alt.personId], notDorms: [] } };
          ok = C.accepts(synth, b, roomsById, dormsById, peopleById);
        }
        if (ok) {
          if (!row.has(b.id) && !altEdge.has(b.id)) altEdge.set(b.id, alt);
          row.add(b.id);
        }
      }
    }
    accept.set(me.id, new Set([...row].sort(C.compareIds)));
  }

  const filter = (c) => {
    if (!C.cycleConsistent(c, listingsById, roomsById)) return false;
    if (!me || !altEdge.size) return true;
    const i = c.indexOf(me.id);
    if (i < 0) return true;
    const to = c[(i + 1) % c.length];
    const alt = altEdge.get(to);
    if (!alt || alt.kind !== "person") return true;
    // the person ME wants to live with must not move out in this same loop
    return !c.some((id) => listingsById.get(id)?.personId === alt.personId);
  };
  const { cycles, truncated } = C.findCycles(accept, { maxLen: 5, cap: 5000, filter });
  const direct = C.directOnly(accept);
  const best = C.bestSet(cycles, { objective: "people" });
  const count = (cs) => cs.reduce((s, c) => s + c.length, 0);
  const mine = me ? C.matchesFor(me.id, accept, { maxLen: 5, cap: 500, filter }) : { direct: [], chains: [] };

  const listingByRoom = new Map();
  for (const l of listings) {
    if (!listingByRoom.has(l.roomId)) listingByRoom.set(l.roomId, []);
    listingByRoom.get(l.roomId).push(l);
  }
  const listingByPerson = new Map(listings.map((l) => [l.personId, l]));
  const inBest = new Map();
  best.forEach((c) => c.forEach((id) => inBest.set(id, c)));

  const world = {
    people, rooms, listings, ctx, accept, cycles, truncated, direct, best, mine, altEdge,
    peopleById, roomsById, listingsById, listingByRoom, listingByPerson, inBest,
    directPeople: count(direct), chainPeople: count(best), wanting: listings.length,
    meListingId,
  };
  world.explain = (cycle) => explain(world, cycle);
  world.swaps = (cycle) => C.toBuSwaps(cycle, ctx);
  world.roomLabel = (roomId) => C.roomLabel(roomsById.get(roomId), ctx);
  return world;
}

function explain(world, cycle) {
  const ex = C.explainCycle(cycle, world.ctx);
  return ex.map((h) => {
    if (h.from === world.meListingId && world.altEdge.has(h.to)) {
      const alt = world.altEdge.get(h.to);
      if (alt.kind === "person") {
        const p = world.peopleById.get(alt.personId);
        return { ...h, reason: `wants to live with ${p ? p.first : "them"}`, kinds: ["social"] };
      }
      return { ...h, reason: "picked this exact room", kinds: ["room"] };
    }
    return h;
  });
}

// ---------------- live app store ----------------
const listeners = new Set();
export const store = {
  people: clone(PEOPLE),
  rooms: clone(ROOMS),
  listings: clone(LISTINGS),
  alts: [],
  confirmed: new Set(),
  posted: null, // { kind: "noor" | "me", listingId }
  world: null,
};

export function recompute() {
  store.world = buildWorld(store.people, store.rooms, store.listings, { alts: store.alts });
  listeners.forEach((fn) => fn(store.world));
  return store.world;
}
export function onChange(fn) { listeners.add(fn); }

export function resetStore() {
  store.people = clone(PEOPLE);
  store.rooms = clone(ROOMS);
  store.listings = clone(LISTINGS);
  store.alts = [];
  store.confirmed = new Set();
  store.posted = null;
  return recompute();
}

export function hasAlt(kind, key) {
  return store.alts.some((a) => a.kind === kind && (kind === "room" ? a.roomId === key : a.personId === key));
}
export function toggleAlt(alt) {
  const i = store.alts.findIndex((a) => a.kind === alt.kind && (alt.kind === "room" ? a.roomId === alt.roomId : a.personId === alt.personId));
  if (i >= 0) store.alts.splice(i, 1);
  else store.alts.push(alt);
  return recompute();
}

/** Post the demo preset (Noor) or a custom room for "You". Returns the new listing id. */
export function postLiveAdd() {
  const { person, room, listing } = DEMO.liveAdd;
  if (!store.people.some((p) => p.id === person.id)) store.people.push(clone(person));
  if (!store.rooms.some((r) => r.id === room.id)) store.rooms.push(clone(room));
  if (!store.listings.some((l) => l.id === listing.id)) store.listings.push(clone(listing));
  store.posted = { kind: "noor", listingId: listing.id };
  recompute();
  return listing.id;
}

export function postMyRoom({ dormId, towerId, floor, number, type, roommates, wants, note }) {
  const me = store.listings.find((l) => l.id === ME.listingId);
  const roomId = `${towerId || dormId}-${number}`;
  const oldRoom = store.rooms.find((r) => r.id === me.roomId);
  if (oldRoom) oldRoom.occupants = oldRoom.occupants.filter((p) => p !== ME.personId);
  let r = store.rooms.find((x) => x.id === roomId);
  if (!r) {
    r = { id: roomId, dormId, towerId: towerId || null, floor, number, type, occupants: [] };
    store.rooms.push(r);
  }
  r.occupants = [ME.personId, ...roommates.filter((p) => p !== ME.personId)];
  me.roomId = roomId;
  me.wants = wants;
  me.note = note || me.note;
  me.postedDaysAgo = 0;
  store.alts = [];
  store.posted = { kind: "me", listingId: me.id };
  recompute();
  return me.id;
}

export function roomOk(dormId, towerId, number) {
  const id = `${towerId || dormId}-${number}`;
  const r = store.rooms.find((x) => x.id === id);
  if (!r) return true;
  return r.occupants.includes(ME.personId) || !store.listings.some((l) => l.roomId === id && l.personId !== ME.personId);
}

// ---------------- helpers for views ----------------
export const cycleKey = (c) => c.join(">");

export function dormStats(world, dormId) {
  const inDorm = world.listings.filter((l) => world.roomsById.get(l.roomId)?.dormId === dormId);
  const ids = new Set(inDorm.map((l) => l.id));
  let wantIn = 0;
  for (const [from, set] of world.accept) {
    if (ids.has(from)) continue;
    for (const t of set) if (ids.has(t)) { wantIn++; break; }
  }
  const loops = world.best.filter((c) => c.length > 2 && c.some((id) => ids.has(id))).length;
  return { offered: inDorm.length, wantIn, loops, listings: inDorm };
}

/** People who are confirmed in a loop (deterministic fake: the demo shows partial confirmations). */
export function confirmedIn(world, cycle) {
  const key = cycleKey(cycle);
  return cycle.filter((id) => {
    if (id === world.meListingId) return store.confirmed.has(key);
    const l = world.listingsById.get(id);
    const n = parseInt(String(l?.personId || "0").replace(/\D/g, ""), 10) || 0;
    return n % 3 !== 0;
  });
}

export function wantsText(world, wants) {
  const parts = [];
  if (wants.towers?.length) {
    const names = wants.towers.map((t) => {
      for (const d of DORMS) { const x = d.towers.find((y) => y.id === t); if (x) return `${d.short} ${x.name}`; }
      return t;
    });
    parts.push(names.join(" or "));
  } else if (wants.dorms?.length) {
    const west = ["claflin", "sleeper", "rich", "1019"];
    if (wants.dorms.length === 4 && west.every((w) => wants.dorms.includes(w))) parts.push("Any West Campus hall");
    else parts.push(wants.dorms.map((d) => dormsById.get(d)?.short || d).join(", "));
  } else if (!wants.withPeople?.length) parts.push("Any dorm");
  if (wants.notDorms?.length) parts.push("not " + wants.notDorms.map((d) => dormsById.get(d)?.short || d).join(" or "));
  if (wants.floorMin != null && wants.floorMax != null) parts.push(`floor ${wants.floorMin} to ${wants.floorMax}`);
  else if (wants.floorMin != null) parts.push(`floor ${wants.floorMin}+`);
  else if (wants.floorMax != null) parts.push(`floor ${wants.floorMax} or lower`);
  if (wants.types?.length) parts.push(wants.types.join(" or "));
  if (wants.withPeople?.length) {
    const names = wants.withPeople.map((p) => world.peopleById.get(p)?.first || "someone");
    parts.push(`living with ${names.join(" or ")}`);
  }
  return parts.join(", ");
}

export function personRoom(world, personId) {
  return world.rooms.find((r) => r.occupants.includes(personId)) || null;
}

export function roomCode(world, room) {
  if (!room) return "";
  const d = dormsById.get(room.dormId);
  const t = room.towerId ? d?.towers.find((x) => x.id === room.towerId) : null;
  return `${d ? d.short : room.dormId}${t ? " " + t.name : ""} · Fl ${room.floor} · ${room.number}`;
}

export function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
