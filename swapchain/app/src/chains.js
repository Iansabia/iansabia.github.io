/**
 * SwapChain chain finder.
 *
 * Pure ES module: no DOM, no imports, no side effects. Every function is
 * deterministic for a given input.
 *
 * Model
 * - A listing is one person's bed. Edge A -> B means "A would move into B's spot".
 * - A cycle [A1, A2, ..., Ak] means A1 moves into A2's spot, A2 into A3's,
 *   ..., Ak into A1's spot. Everyone ends up in a spot they accept.
 * - BU's Direct Swap only allows 2-person swaps, so a k-person loop is carried
 *   out as k-1 back-to-back 2-person swaps (see toBuSwaps), after everyone in
 *   the loop has confirmed.
 *
 * @module chains
 */

/**
 * @typedef {Object} Wants
 * @property {string[]} dorms        dorm ids; empty means any dorm
 * @property {string[]} towers       tower ids; empty means any tower
 * @property {number|null} floorMin  lowest acceptable floor, or null
 * @property {number|null} floorMax  highest acceptable floor, or null
 * @property {string[]} types        room types; empty means any type
 * @property {string[]} withPeople   person ids; empty means no social condition
 * @property {string[]} notDorms     dorm ids to avoid
 *
 * @typedef {Object} Listing
 * @property {string} id
 * @property {string} personId
 * @property {string} roomId
 * @property {Wants} wants
 * @property {string} [note]
 * @property {number} [postedDaysAgo]
 *
 * @typedef {Object} Room
 * @property {string} id
 * @property {string} dormId
 * @property {string|null} towerId
 * @property {number} floor
 * @property {string} number
 * @property {string} type
 * @property {string[]} occupants   person ids
 *
 * @typedef {Object} Dorm
 * @property {string} id
 * @property {string} name
 * @property {string} short
 * @property {{id:string,name:string,letter:string}[]} towers
 * @property {"standard"|"premium"} priceTier
 *
 * @typedef {Map<string, Set<string>>} AcceptMap  listingId -> ids of listings whose spot it accepts
 *
 * @typedef {Object} Ctx
 * @property {Object<string, Listing>|Map<string, Listing>} listingsById
 * @property {Object<string, Room>|Map<string, Room>} roomsById
 * @property {Object<string, {id:string,name:string,first:string}>|Map<string, any>} peopleById
 * @property {Object<string, Dorm>|Map<string, Dorm>} dormsById
 */

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Natural string compare: "l2" < "l10". Used for every id ordering so that
 * "smallest id" means the same thing everywhere.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareIds(a, b) {
  if (a === b) return 0;
  const ra = /(\d+)|(\D+)/g;
  const rb = /(\d+)|(\D+)/g;
  for (;;) {
    const ma = ra.exec(a);
    const mb = rb.exec(b);
    if (!ma) return mb ? -1 : 0;
    if (!mb) return 1;
    if (ma[1] !== undefined && mb[1] !== undefined) {
      const na = Number(ma[1]);
      const nb = Number(mb[1]);
      if (na !== nb) return na - nb;
      if (ma[1].length !== mb[1].length) return ma[1].length - mb[1].length;
    } else if (ma[0] !== mb[0]) {
      return ma[0] < mb[0] ? -1 : 1;
    }
  }
}

function get(coll, id) {
  if (!coll || id == null) return undefined;
  return coll instanceof Map ? coll.get(id) : coll[id];
}

function byId(arr) {
  const m = new Map();
  for (const x of arr || []) m.set(x.id, x);
  return m;
}

function arr(x) {
  return Array.isArray(x) ? x : [];
}

/** Rotate a cycle so it starts at its smallest id. */
function canonical(cycle) {
  let best = 0;
  for (let i = 1; i < cycle.length; i++) if (compareIds(cycle[i], cycle[best]) < 0) best = i;
  return cycle.slice(best).concat(cycle.slice(0, best));
}

function compareCycles(a, b) {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i++) {
    const c = compareIds(a[i], b[i]);
    if (c) return c;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* Acceptance                                                          */
/* ------------------------------------------------------------------ */

/**
 * Does listing A accept listing B's spot? Follows the contract semantics.
 * @param {Listing} a
 * @param {Listing} b
 * @param {Map<string, Room>|Object} roomsById
 * @param {Map<string, Dorm>|Object} dormsById
 * @returns {boolean}
 */
export function accepts(a, b, roomsById, dormsById, peopleById = null) {
  if (!a || !b || a.id === b.id) return false;
  const ra = get(roomsById, a.roomId);
  const rb = get(roomsById, b.roomId);
  if (!ra || !rb) return false;
  if (ra.id === rb.id) return false; // roommates never "swap" a room with each other
  const da = get(dormsById, ra.dormId);
  const db = get(dormsById, rb.dormId);
  if (!da || !db) return false;
  if ((da.priceTier || "standard") !== (db.priceTier || "standard")) return false;
  const w = a.wants || {};
  const dorms = arr(w.dorms);
  if (dorms.length && !dorms.includes(rb.dormId)) return false;
  if (arr(w.notDorms).includes(rb.dormId)) return false;
  const towers = arr(w.towers);
  if (towers.length && !towers.includes(rb.towerId)) return false;
  if (w.floorMin != null && !(rb.floor >= w.floorMin)) return false;
  if (w.floorMax != null && !(rb.floor <= w.floorMax)) return false;
  const types = arr(w.types);
  if (types.length && !types.includes(rb.type)) return false;
  const withPeople = arr(w.withPeople);
  if (withPeople.length) {
    const stay = arr(rb.occupants).filter((p) => p !== b.personId);
    if (!withPeople.some((p) => stay.includes(p))) return false;
  }
  // BU rooms are single gender: a spot only goes to someone of the same gender as the student
  // leaving it and the roommates staying (unknown genders, as in the unit tests, never block)
  if (peopleById) {
    const ga = get(peopleById, a.personId)?.gender;
    if (ga) for (const pid of arr(rb.occupants).concat(b.personId)) {
      const gp = get(peopleById, pid)?.gender;
      if (gp && gp !== ga) return false;
    }
  }
  return true;
}

/**
 * Build the acceptance graph. Every listing id is a key (possibly with an
 * empty set). Keys and set members are in natural id order.
 * @param {Listing[]} listings
 * @param {Room[]} rooms
 * @param {Dorm[]} dorms
 * @returns {AcceptMap}
 */
export function acceptMatrix(listings, rooms, dorms, people = null) {
  const roomsById = byId(rooms);
  const dormsById = byId(dorms);
  const peopleById = people ? byId(people) : null;
  const sorted = [...(listings || [])].sort((x, y) => compareIds(x.id, y.id));
  const out = new Map();
  for (const a of sorted) {
    const s = new Set();
    for (const b of sorted) if (accepts(a, b, roomsById, dormsById, peopleById)) s.add(b.id);
    out.set(a.id, s);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Cycle enumeration                                                   */
/* ------------------------------------------------------------------ */

function indexGraph(accept) {
  const ids = [...accept.keys()].sort(compareIds);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const out = new Array(n);
  const inn = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const list = [];
    for (const t of accept.get(ids[i]) || []) {
      const j = idx.get(t);
      if (j !== undefined && j !== i) list.push(j);
    }
    list.sort((x, y) => x - y);
    out[i] = list;
    for (const j of list) inn[j].push(i);
  }
  return { ids, idx, n, out, inn };
}

/**
 * BFS on reversed edges: dist[v] = fewest steps from v to target, using only
 * nodes allowed by `ok`. 127 means unreachable within the limit.
 */
function distTo(target, g, limit, ok) {
  const dist = new Int8Array(g.n).fill(127);
  dist[target] = 0;
  let frontier = [target];
  for (let d = 1; d <= limit && frontier.length; d++) {
    const next = [];
    for (const v of frontier) {
      for (const u of g.inn[v]) {
        if (dist[u] === 127 && ok(u)) {
          dist[u] = d;
          next.push(u);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

/**
 * Enumerate simple cycles of length 2..maxLen in the acceptance graph.
 * Each cycle is listed once, starting at its smallest id (natural order).
 * Cycles come out shortest first, so if `cap` is hit the short loops (the
 * ones that matter most) are already in the list.
 *
 * Method: for each length L and each start s, a depth-first search through
 * nodes with a larger index than s (Johnson-style restriction, which rules
 * out rotations and duplicates), pruned by the BFS distance back to s.
 *
 * @param {AcceptMap} accept
 * @param {{maxLen?: number, cap?: number, filter?: (cycle: string[]) => boolean}} [opts]
 *   `filter` (optional extension) drops cycles before they count toward cap.
 * @returns {{cycles: string[][], truncated: boolean}}
 */
export function findCycles(accept, { maxLen = 5, cap = 5000, filter = null } = {}) {
  const g = indexGraph(accept);
  const { n, out, ids } = g;
  const cycles = [];
  if (n < 2 || maxLen < 2 || cap <= 0) return { cycles, truncated: false };
  const dists = new Array(n);
  for (let s = 0; s < n; s++) dists[s] = distTo(s, g, maxLen, (u) => u > s);
  const onPath = new Uint8Array(n);
  const path = new Int32Array(maxLen);
  let truncated = false;

  for (let L = 2; L <= maxLen && !truncated; L++) {
    for (let s = 0; s < n && !truncated; s++) {
      const dist = dists[s];
      path[0] = s;
      onPath[s] = 1;
      // depth = number of nodes on the path so far
      const dfs = (v, depth) => {
        if (truncated) return;
        if (depth === L) {
          // need edge v -> s
          if (dist[v] === 1) {
            const cyc = new Array(L);
            for (let i = 0; i < L; i++) cyc[i] = ids[path[i]];
            if (!filter || filter(cyc)) {
              if (cycles.length >= cap) {
                truncated = true;
                return;
              }
              cycles.push(cyc);
            }
          }
          return;
        }
        // after adding w the path has depth+1 nodes; w must reach s in L-depth steps
        for (const w of out[v]) {
          if (w <= s || onPath[w]) continue;
          if (dist[w] > L - depth) continue;
          onPath[w] = 1;
          path[depth] = w;
          dfs(w, depth + 1);
          onPath[w] = 0;
          if (truncated) return;
        }
      };
      dfs(s, 1);
      onPath[s] = 0;
    }
  }
  return { cycles, truncated };
}

/* ------------------------------------------------------------------ */
/* Choosing loops                                                      */
/* ------------------------------------------------------------------ */

const W = 1024; // one person always outweighs any number of long-loop penalties

function cycleScore(len) {
  return len * W - (len >= 4 ? 1 : 0);
}

/**
 * Maximum matching in a general graph (Edmonds' blossom algorithm).
 * @param {number} n
 * @param {number[][]} adj  adjacency lists, ascending
 * @returns {Int32Array} match[v] = partner or -1
 */
function maxMatching(n, adj) {
  const match = new Int32Array(n).fill(-1);
  const p = new Int32Array(n);
  const base = new Int32Array(n);
  const used = new Uint8Array(n);
  const blossom = new Uint8Array(n);
  const q = new Int32Array(n + 1);

  const lca = (a, b) => {
    const seen = new Uint8Array(n);
    for (;;) {
      a = base[a];
      seen[a] = 1;
      if (match[a] === -1) break;
      a = p[match[a]];
    }
    for (;;) {
      b = base[b];
      if (seen[b]) return b;
      b = p[match[b]];
    }
  };
  const markPath = (v, b, child) => {
    while (base[v] !== b) {
      blossom[base[v]] = 1;
      blossom[base[match[v]]] = 1;
      p[v] = child;
      child = match[v];
      v = p[match[v]];
    }
  };
  const findPath = (root) => {
    used.fill(0);
    p.fill(-1);
    for (let i = 0; i < n; i++) base[i] = i;
    used[root] = 1;
    let qh = 0;
    let qt = 0;
    q[qt++] = root;
    while (qh < qt) {
      const v = q[qh++];
      for (const to of adj[v]) {
        if (base[v] === base[to] || match[v] === to) continue;
        if (to === root || (match[to] !== -1 && p[match[to]] !== -1)) {
          const cur = lca(v, to);
          blossom.fill(0);
          markPath(v, cur, to);
          markPath(to, cur, v);
          for (let i = 0; i < n; i++) {
            if (blossom[base[i]]) {
              base[i] = cur;
              if (!used[i]) {
                used[i] = 1;
                q[qt++] = i;
              }
            }
          }
        } else if (p[to] === -1) {
          p[to] = v;
          if (match[to] === -1) return to;
          const nx = match[to];
          used[nx] = 1;
          q[qt++] = nx;
        }
      }
    }
    return -1;
  };

  for (let v = 0; v < n; v++) {
    if (match[v] !== -1) continue;
    let u = findPath(v);
    while (u !== -1) {
      const pv = p[u];
      const ppv = match[pv];
      match[u] = pv;
      match[pv] = u;
      u = ppv;
    }
  }
  return match;
}

/** Best vertex-disjoint set of 2-cycles from a list of [a, b] pairs (canonical). */
function bestPairs(pairs) {
  const ids = [...new Set(pairs.flat())].sort(compareIds);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const adj = Array.from({ length: ids.length }, () => []);
  for (const [a, b] of pairs) {
    adj[idx.get(a)].push(idx.get(b));
    adj[idx.get(b)].push(idx.get(a));
  }
  for (const l of adj) l.sort((x, y) => x - y);
  const m = maxMatching(ids.length, adj);
  const res = [];
  for (let v = 0; v < ids.length; v++) if (m[v] > v) res.push([ids[v], ids[m[v]]]);
  return res.sort(compareCycles);
}

function prepareCycles(cycles) {
  const seen = new Set();
  const list = [];
  for (const c of cycles || []) {
    if (!Array.isArray(c) || c.length < 2) continue;
    if (new Set(c).size !== c.length) continue;
    const k = canonical(c);
    const key = k.join("\u0001");
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(k);
  }
  list.sort(compareCycles);
  return list;
}

/**
 * Greedy packing in a given order, then local improvement: try adding each
 * unused loop, evicting the loops it overlaps and refilling the freed
 * people; keep the change only if the total score strictly improves.
 */
function greedyImprove(C, V, vc, seed, order, rank, maxPasses, budget) {
  const nV = V.length;
  const owner = new Int32Array(nV).fill(-1);
  const chosen = new Uint8Array(C.length);
  const sc = C.map((c) => cycleScore(c.length));
  let total = 0;
  const fits = (ci, own) => C[ci].every((v) => own[v] === -1);
  for (const ci of [...seed, ...order]) {
    if (fits(ci, owner)) {
      for (const v of C[ci]) owner[v] = ci;
      chosen[ci] = 1;
      total += sc[ci];
    }
  }
  const own = new Int32Array(nV);
  const seen = new Int32Array(C.length);
  let epoch = 0;
  for (let pass = 0; pass < maxPasses && budget.left > 0; pass++) {
    let improved = false;
    for (let ci = 0; ci < C.length && budget.left > 0; ci++) {
      if (chosen[ci]) continue;
      budget.left -= C[ci].length;
      // People moved can rise by at most the number of this loop's people who
      // are not moving yet; long-loop penalties can only drop if a long loop is evicted.
      const conf = [];
      let uncovered = 0;
      let longConf = 0;
      for (const v of C[ci]) {
        const o = owner[v];
        if (o === -1) uncovered++;
        else if (!conf.includes(o)) {
          conf.push(o);
          if (C[o].length >= 4) longConf++;
        }
      }
      if (uncovered === 0 && longConf === 0) continue;
      own.set(owner);
      let gain = sc[ci];
      for (const x of conf) {
        gain -= sc[x];
        for (const v of C[x]) own[v] = -1;
      }
      for (const v of C[ci]) own[v] = ci;
      const added = [ci];
      // refill: loops touching freed people, in priority order
      epoch++;
      seen[ci] = epoch;
      for (const x of conf) seen[x] = epoch;
      const cand = [];
      for (const x of conf) {
        for (const v of C[x]) {
          if (own[v] !== -1) continue;
          for (const cj of vc[v]) {
            if (seen[cj] !== epoch) {
              seen[cj] = epoch;
              cand.push(cj);
            }
          }
        }
      }
      budget.left -= cand.length * 4;
      cand.sort((x, y) => rank[x] - rank[y]);
      for (const cj of cand) {
        if (fits(cj, own)) {
          for (const v of C[cj]) own[v] = cj;
          gain += sc[cj];
          added.push(cj);
        }
      }
      if (gain > 0) {
        for (const x of conf) chosen[x] = 0;
        for (const a of added) chosen[a] = 1;
        owner.set(own);
        total += gain;
        improved = true;
      }
    }
    if (!improved) break;
  }
  const picked = [];
  for (let ci = 0; ci < C.length; ci++) if (chosen[ci]) picked.push(ci);
  return { picked, total };
}

/**
 * Pick a vertex-disjoint set of loops that moves the most people. Ties go
 * to fewer loops of length 4 or more (long loops are fragile: one person
 * backing out breaks the whole loop, which is why kidney exchanges keep
 * loops short). Exact branch and bound when there are at most 400 loops,
 * greedy with local improvement above that. Deterministic: the result does
 * not depend on the order of the input.
 *
 * @param {string[][]} cycles
 * Work is capped by a deterministic operation budget (`workBudget`), so the
 * call stays fast on huge dense inputs; the answer is then the best found,
 * and never worse than the best set of plain 2-person swaps.
 *
 * @param {{objective?: "people", exactLimit?: number, workBudget?: number}} [opts]
 * @returns {string[][]} chosen loops, each starting at its smallest id, sorted shortest first
 */
export function bestSet(cycles, { objective = "people", exactLimit = 400, workBudget = 4e8 } = {}) {
  void objective; // only "people" is defined by the contract
  const list = prepareCycles(cycles);
  if (!list.length) return [];
  const V = [...new Set(list.flat())].sort(compareIds);
  const vIdx = new Map(V.map((id, i) => [id, i]));
  const C = list.map((c) => c.map((id) => vIdx.get(id)));
  const sc = C.map((c) => cycleScore(c.length));
  const vc = Array.from({ length: V.length }, () => []);
  C.forEach((c, ci) => c.forEach((v) => vc[v].push(ci)));

  // priority order: higher score (longer) first, then canonical order
  const prio = C.map((_, i) => i).sort((x, y) => sc[y] - sc[x] || x - y);
  const rank = new Int32Array(C.length);
  prio.forEach((ci, r) => (rank[ci] = r));

  const orders = [
    prio,
    C.map((_, i) => i), // short loops first
    C.map((_, i) => i).sort((x, y) => {
      const dx = C[x].reduce((s, v) => s + vc[v].length, 0) / C[x].length;
      const dy = C[y].reduce((s, v) => s + vc[v].length, 0) / C[y].length;
      return dx - dy || sc[y] - sc[x] || x - y;
    }),
  ];
  // Seeds: a maximum set of 2-person swaps (so we never do worse than a 1-to-1
  // board), then plain greedy fills in three orders. Improve the best one.
  const pairIdx = [];
  C.forEach((c, ci) => { if (c.length === 2) pairIdx.push(ci); });
  const seeds = [];
  if (pairIdx.length) {
    const keyToIdx = new Map(pairIdx.map((ci) => [list[ci].join("\u0001"), ci]));
    seeds.push(bestPairs(pairIdx.map((ci) => list[ci])).map((p) => keyToIdx.get(p.join("\u0001"))));
  } else seeds.push([]);
  let best = null;
  for (const o of orders) {
    for (const sd of seeds.length && o === prio ? [seeds[0], []] : [[]]) {
      const r = greedyImprove(C, V, vc, sd, o, rank, 0, { left: 0 });
      if (!best || r.total > best.total) best = r;
    }
  }
  best = greedyImprove(C, V, vc, best.picked, [], rank, 8, { left: workBudget });

  if (C.length <= exactLimit) {
    let bestTotal = best.total;
    let bestPicked = best.picked.slice();
    const bb = { left: workBudget * 2 };
    const mark = new Int32Array(V.length);
    let gen = 0;
    const cnt = new Int32Array(V.length);
    const chosen = [];
    const rec = (feasible, score) => {
      bb.left -= feasible.length * 6 + 1;
      if (bb.left < 0) return;
      if (!feasible.length) {
        if (score > bestTotal) {
          bestTotal = score;
          bestPicked = chosen.slice();
        }
        return;
      }
      gen++;
      let union = 0;
      for (const ci of feasible) {
        for (const v of C[ci]) {
          if (mark[v] !== gen) {
            mark[v] = gen;
            cnt[v] = 0;
            union++;
          }
          cnt[v]++;
        }
      }
      if (score + union * W <= bestTotal) return;
      // branch on the person in the fewest feasible loops
      let bv = -1;
      for (const ci of feasible) {
        for (const v of C[ci]) {
          if (bv === -1 || cnt[v] < cnt[bv] || (cnt[v] === cnt[bv] && v < bv)) bv = v;
        }
      }
      const withV = feasible.filter((ci) => C[ci].includes(bv)).sort((x, y) => rank[x] - rank[y]);
      for (const ci of withV) {
        const cs = C[ci];
        const next = feasible.filter((cj) => cj !== ci && !C[cj].some((v) => cs.includes(v)));
        chosen.push(ci);
        rec(next, score + sc[ci]);
        chosen.pop();
        if (bb.left < 0) return;
      }
      // or: this person does not move
      rec(feasible.filter((ci) => !C[ci].includes(bv)), score);
    };
    rec(prio.slice(), 0);
    best = { picked: bestPicked, total: bestTotal };
  }

  return best.picked.map((ci) => list[ci]).sort(compareCycles);
}

/**
 * What a plain 1-to-1 swap board can do: the best vertex-disjoint set of
 * mutual pairs (maximum matching on 2-cycles).
 * @param {AcceptMap} accept
 * @returns {string[][]} pairs [a, b] with a < b, sorted
 */
export function directOnly(accept) {
  const pairs = [];
  const ids = [...accept.keys()].sort(compareIds);
  for (const a of ids) {
    for (const b of accept.get(a) || []) {
      if (compareIds(a, b) < 0 && accept.has(b) && accept.get(b).has(a)) pairs.push([a, b]);
    }
  }
  if (!pairs.length) return [];
  return bestPairs(pairs);
}

/**
 * Every loop through one listing, shortest first. Each loop starts at
 * `listingId` (so the UI can read it as "you -> X -> Y -> back to you").
 * @param {string} listingId
 * @param {AcceptMap} accept
 * @param {{maxLen?: number, cap?: number, filter?: (cycle: string[]) => boolean}} [opts]
 * @returns {{direct: string[][], chains: string[][], truncated: boolean}}
 */
export function matchesFor(listingId, accept, { maxLen = 5, cap = 500, filter = null } = {}) {
  const res = { direct: [], chains: [], truncated: false };
  if (!accept.has(listingId)) return res;
  const g = indexGraph(accept);
  const s = g.idx.get(listingId);
  const dist = distTo(s, g, maxLen, () => true);
  const onPath = new Uint8Array(g.n);
  const path = new Int32Array(maxLen);
  path[0] = s;
  onPath[s] = 1;
  let count = 0;
  for (let L = 2; L <= maxLen && !res.truncated; L++) {
    const dfs = (v, depth) => {
      if (depth === L) {
        if (dist[v] === 1) {
          const cyc = [];
          for (let i = 0; i < L; i++) cyc.push(g.ids[path[i]]);
          if (!filter || filter(cyc)) {
            if (count >= cap) { res.truncated = true; return; }
            count++;
            (L === 2 ? res.direct : res.chains).push(cyc);
          }
        }
        return;
      }
      for (const w of g.out[v]) {
        if (onPath[w] || dist[w] > L - depth) continue;
        onPath[w] = 1;
        path[depth] = w;
        dfs(w, depth + 1);
        onPath[w] = 0;
        if (res.truncated) return;
      }
    };
    dfs(s, 1);
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* Explaining loops                                                    */
/* ------------------------------------------------------------------ */

function personName(ctx, listing) {
  const p = get(ctx.peopleById, listing && listing.personId);
  return (p && (p.first || p.name)) || (listing && listing.personId) || "Someone";
}

/**
 * Short room label, for example "Warren C 1407" or "Myles 512".
 * @param {Room} room
 * @param {Ctx} ctx
 * @returns {string}
 */
export function roomLabel(room, ctx) {
  if (!room) return "an unknown room";
  const d = get(ctx.dormsById, room.dormId);
  const dn = d ? d.short || d.name : room.dormId;
  const t = d && room.towerId ? arr(d.towers).find((x) => x.id === room.towerId) : null;
  return `${dn}${t ? " " + t.name : ""} ${room.number}`;
}

function joinList(parts) {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Turn a loop into the k-1 back-to-back 2-person swaps BU's Direct Swap can
 * approve. Step i swaps the person currently holding the first spot with the
 * next person in the loop; after each step one more person is in their final
 * spot, and the last step finishes two people.
 *
 * @param {string[]} cycle  listing ids; cycle[i] moves into cycle[i+1]'s spot
 * @param {Ctx} ctx
 * @returns {{step:number, a:string, b:string, text:string, aPersonId:string, bPersonId:string,
 *   aFrom:string, bFrom:string, aTo:string, bTo:string, done:string[]}[]}
 *   a and b are listing ids. aFrom/bFrom/aTo/bTo are room ids (the room held before and after the step).
 *   done lists the listing ids that are in their final spot after this step.
 */
export function toBuSwaps(cycle, ctx) {
  const k = cycle.length;
  if (k < 2) return [];
  const L = cycle.map((id) => get(ctx.listingsById, id));
  const roomOf = (i) => (L[i] ? L[i].roomId : null);
  const steps = [];
  for (let i = 0; i < k - 1; i++) {
    const a = cycle[i];
    const b = cycle[i + 1];
    const aFrom = roomOf(0); // the person moving on always holds the first spot
    const bFrom = roomOf(i + 1);
    const aName = personName(ctx, L[i]);
    const bName = personName(ctx, L[i + 1]);
    const aLabel = roomLabel(get(ctx.roomsById, aFrom), ctx);
    const bLabel = roomLabel(get(ctx.roomsById, bFrom), ctx);
    const last = i === k - 2;
    const aDesc = i === 0 ? `${aName} (${aLabel})` : `${aName} (holding ${aLabel} for now)`;
    const text = `${aDesc} swaps with ${bName} (${bLabel}). ${last ? `${aName} and ${bName} are both done.` : `${aName} is done.`}`;
    steps.push({
      step: i + 1,
      a,
      b,
      text,
      aPersonId: L[i] ? L[i].personId : null,
      bPersonId: L[i + 1] ? L[i + 1].personId : null,
      aFrom,
      bFrom,
      aTo: bFrom,
      bTo: aFrom,
      done: last ? [a, b] : [a],
    });
  }
  return steps;
}

/**
 * Why each person in the loop accepts the next spot.
 * @param {string[]} cycle
 * @param {Ctx} ctx
 * @returns {{from:string, to:string, reason:string, kinds:string[], move:"dorm"|"tower"|"floor"|"room"}[]}
 *   kinds: any of "social", "dorm", "tower", "floor", "type", "any".
 *   move: how big the move is (another dorm, another tower of the same dorm,
 *   another floor of the same building, or another room on the same floor).
 */
export function explainCycle(cycle, ctx) {
  const out = [];
  const k = cycle.length;
  for (let i = 0; i < k; i++) {
    const from = cycle[i];
    const to = cycle[(i + 1) % k];
    const A = get(ctx.listingsById, from);
    const B = get(ctx.listingsById, to);
    const ra = A && get(ctx.roomsById, A.roomId);
    const rb = B && get(ctx.roomsById, B.roomId);
    const w = (A && A.wants) || {};
    const kinds = [];
    const parts = [];
    let social = "";
    if (arr(w.withPeople).length && rb) {
      const stay = arr(rb.occupants).filter((p) => p !== B.personId);
      const mate = arr(w.withPeople).find((p) => stay.includes(p));
      if (mate) {
        const p = get(ctx.peopleById, mate);
        social = `wants to live with ${(p && (p.first || p.name)) || mate}`;
        kinds.push("social");
      }
    }
    const db = rb && get(ctx.dormsById, rb.dormId);
    const dn = db ? db.short || db.name : rb ? rb.dormId : "";
    if (rb && arr(w.towers).length) {
      const t = db && arr(db.towers).find((x) => x.id === rb.towerId);
      parts.push(t ? `${t.name} tower` : "that tower");
      kinds.push("tower");
    } else if (rb && arr(w.dorms).length) {
      parts.push(dn);
      kinds.push("dorm");
    } else if (rb && arr(w.notDorms).length) {
      const names = arr(w.notDorms).map((d) => {
        const x = get(ctx.dormsById, d);
        return x ? x.short || x.name : d;
      });
      parts.push(`anywhere but ${names.join(" or ")}`);
      kinds.push("dorm");
    }
    if (w.floorMin != null && w.floorMax != null) {
      parts.push(w.floorMin === w.floorMax ? `floor ${w.floorMin}` : `floor ${w.floorMin} to ${w.floorMax}`);
      kinds.push("floor");
    } else if (w.floorMin != null) {
      parts.push(`floor ${w.floorMin} or higher`);
      kinds.push("floor");
    } else if (w.floorMax != null) {
      parts.push(`floor ${w.floorMax} or lower`);
      kinds.push("floor");
    }
    if (rb && arr(w.types).length) {
      parts.push(/^[aeiou]/i.test(rb.type) ? `an ${rb.type}` : `a ${rb.type}`);
      kinds.push("type");
    }
    let reason;
    if (social && parts.length) reason = `${social}, plus ${joinList(parts)}`;
    else if (social) reason = social;
    else if (parts.length) reason = `wants ${joinList(parts)}`;
    else {
      reason = "open to any room";
      kinds.push("any");
    }
    let move = "dorm";
    if (ra && rb && ra.dormId === rb.dormId) {
      if ((ra.towerId || null) !== (rb.towerId || null)) move = "tower";
      else if (ra.floor !== rb.floor) move = "floor";
      else move = "room";
    }
    out.push({ from, to, reason, kinds, move });
  }
  return out;
}

/**
 * Loop-level check for the social rule (optional extension, see
 * design/CONTRACT-NOTES.md). The edge rule looks at each pair on its own; in
 * a loop, the roommate someone wants could also be leaving. This returns
 * false if anyone who joined the loop "to live with X" would arrive after X
 * has left in the same loop (and X is not moving in there either).
 * @param {string[]} cycle
 * @param {Map<string, Listing>|Object} listingsById
 * @param {Map<string, Room>|Object} roomsById
 * @returns {boolean}
 */
export function cycleConsistent(cycle, listingsById, roomsById) {
  const k = cycle.length;
  const L = cycle.map((id) => get(listingsById, id));
  if (L.some((x) => !x)) return false;
  for (let i = 0; i < k; i++) {
    const A = L[i];
    const want = arr(A.wants && A.wants.withPeople);
    if (!want.length) continue;
    const B = L[(i + 1) % k];
    const rb = get(roomsById, B.roomId);
    if (!rb) return false;
    const leaving = new Set(L.filter((x) => x.roomId === rb.id).map((x) => x.personId));
    const after = new Set(arr(rb.occupants).filter((p) => !leaving.has(p)));
    for (let j = 0; j < k; j++) {
      if (j !== i && L[(j + 1) % k].roomId === rb.id) after.add(L[j].personId);
    }
    if (!want.some((p) => after.has(p))) return false;
  }
  return true;
}

/**
 * One call for the dashboard numbers: how many people want to move, how many
 * a 1-to-1 swap board could move, and how many loops can move.
 * Loops that break the social rule at loop level are left out (cycleConsistent).
 * @param {Listing[]} listings
 * @param {Room[]} rooms
 * @param {Dorm[]} dorms
 * @param {{maxLen?: number, cap?: number, objective?: "people"}} [opts]
 * @returns {{wanting:number, directPeople:number, chainPeople:number, direct:string[][],
 *   cycles:string[][], best:string[][], truncated:boolean, accept:AcceptMap}}
 */
export function summary(listings, rooms, dorms, opts = {}) {
  const { maxLen = 5, cap = 5000, objective = "people", people = null } = opts;
  const accept = acceptMatrix(listings, rooms, dorms, people);
  const listingsById = byId(listings);
  const roomsById = byId(rooms);
  const filter = (c) => cycleConsistent(c, listingsById, roomsById);
  const { cycles, truncated } = findCycles(accept, { maxLen, cap, filter });
  const direct = directOnly(accept);
  const best = bestSet(cycles, { objective });
  const count = (cs) => cs.reduce((s, c) => s + c.length, 0);
  return {
    wanting: (listings || []).length,
    directPeople: count(direct),
    chainPeople: count(best),
    direct,
    cycles,
    best,
    truncated,
    accept,
  };
}
