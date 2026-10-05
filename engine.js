/* Pure algorithms, shared by the browser and Node tests. No network dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DeliveryEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EPS = 1e-8;
  const EXACT_LIMIT = 12;
  const defaults = { nodeCount: 10, capacity: 25, density: 0.22, seed: 2026, maxProfit: 500, speed: 30, service: 2, start: '09:00' };
  function checkNumber(value, name, min, max, integer = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))
      throw new Error(`${name} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.`);
  }
  function validateConfig(c) {
    checkNumber(c.nodeCount, 'Customers', 1, 40, true);
    checkNumber(c.capacity, 'Vehicle capacity', 1, 500, true);
    checkNumber(c.density, 'Road density', 0.05, 1);
    checkNumber(c.seed, 'Seed', 0, 4294967295, true);
    checkNumber(c.maxProfit, 'Maximum profit', 50, 2000, true);
    checkNumber(c.speed, 'Average speed', 10, 80);
    checkNumber(c.service, 'Service time', 0, 15);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.start)) throw new Error('Departure must be a valid 24-hour time.');
    return c;
  }
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function generate(config) {
    const c = validateConfig({ ...defaults, ...config }), random = rng(c.seed);
    const nodes = [{ id: 0, name: 'Warehouse', x: 50, y: 50, weight: 0, profit: 0, deadline: 1440 }];
    for (let id = 1; id <= c.nodeCount; id++) nodes.push({
      id, name: `Customer ${String(id).padStart(2, '0')}`, x: 8 + random() * 84, y: 8 + random() * 84,
      weight: 1 + Math.floor(random() * 8), profit: 50 + Math.floor(random() * (c.maxProfit - 49)), deadline: 45 + Math.floor(random() * 166)
    });
    const edges = [], keys = new Set();
    function add(u, v) {
      const a = Math.min(u, v), b = Math.max(u, v), key = `${a}-${b}`;
      if (keys.has(key)) return;
      keys.add(key);
      const distance = Math.max(0.2, Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y) * 0.13);
      edges.push({ id: key, u: a, v: b, distance, minutes: distance / c.speed * 60 * (1 + random() * 0.35), blocked: false, delay: 1 });
    }
    // A nearest-neighbour spanning tree guarantees connectivity before extra roads.
    for (let i = 1; i < nodes.length; i++) {
      let nearest = 0;
      for (let j = 1; j < i; j++) if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) < Math.hypot(nodes[i].x - nodes[nearest].x, nodes[i].y - nodes[nearest].y)) nearest = j;
      add(i, nearest);
    }
    for (let u = 0; u < nodes.length; u++) for (let v = u + 1; v < nodes.length; v++) if (random() < c.density) add(u, v);
    return { version: 1, config: c, nodes, edges };
  }
  function validateScenario(input) {
    if (!input || input.version !== 1 || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) throw new Error('Expected a version 1 scenario with config, nodes and edges.');
    const s = JSON.parse(JSON.stringify(input));
    validateConfig(s.config);
    if (s.nodes.length !== s.config.nodeCount + 1) throw new Error('Customer count must match the nodes (plus warehouse 0).');
    s.nodes.forEach((n, i) => {
      if (n.id !== i) throw new Error('Node IDs must be consecutive integers starting at warehouse 0.');
      if (typeof n.name !== 'string' || !n.name.trim() || n.name.length > 80) throw new Error('Each node needs a name of 1–80 characters.');
      checkNumber(n.x, 'Node x', 0, 100); checkNumber(n.y, 'Node y', 0, 100);
      checkNumber(n.weight, 'Package weight', i ? 1 : 0, i ? 500 : 0, true);
      checkNumber(n.profit, 'Delivery profit', 0, i ? 100000 : 0, true);
      checkNumber(n.deadline, 'Deadline in minutes after departure', 1, 1440);
    });
    const seen = new Set();
    if (s.edges.length > s.nodes.length * (s.nodes.length - 1) / 2) throw new Error('Too many roads.');
    s.edges.forEach(e => {
      checkNumber(e.u, 'Road endpoint', 0, s.nodes.length - 1, true); checkNumber(e.v, 'Road endpoint', 0, s.nodes.length - 1, true);
      if (e.u === e.v) throw new Error('Roads cannot connect a node to itself.');
      const key = `${Math.min(e.u, e.v)}-${Math.max(e.u, e.v)}`;
      if (seen.has(key)) throw new Error('Duplicate road between the same nodes.'); seen.add(key); e.id = key;
      checkNumber(e.distance, 'Road distance in km', 0.001, 1000);
      checkNumber(e.minutes, 'Road travel time', 0.001, 1440);
      if (e.blocked !== undefined && typeof e.blocked !== 'boolean') throw new Error('Road blocked must be true or false.');
      e.blocked = e.blocked ?? false; e.delay = e.delay ?? 1;
      checkNumber(e.delay, 'Road delay multiplier', 1, 20);
    });
    return s;
  }
  class MinHeap {
    constructor() { this.data = []; }
    push(item) {
      const a = this.data; a.push(item); let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= item[0]) break; a[i] = a[p]; i = p; } a[i] = item;
    }
    pop() {
      const a = this.data, out = a[0], last = a.pop(); if (!a.length) return out;
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let j = i * 2 + 1; if (j + 1 < a.length && a[j + 1][0] < a[j][0]) j++;
        if (a[j][0] >= last[0]) break; a[i] = a[j]; i = j;
      } a[i] = last; return out;
    }
    get size() { return this.data.length; }
  }
  function adjacency(s) {
    const a = s.nodes.map(() => []);
    for (const e of s.edges) if (!e.blocked) { a[e.u].push({ to: e.v, edge: e, time: e.minutes * e.delay }); a[e.v].push({ to: e.u, edge: e, time: e.minutes * e.delay }); }
    return a;
  }
  function dijkstra(a, source) {
    const distances = a.map(() => Infinity), previous = a.map(() => null), heap = new MinHeap(); distances[source] = 0; heap.push([0, source]);
    while (heap.size) {
      const [cost, u] = heap.pop(); if (cost > distances[u] + EPS) continue;
      for (const arc of a[u]) {
        const next = cost + arc.time;
        if (next < distances[arc.to] - EPS) { distances[arc.to] = next; previous[arc.to] = { node: u, edge: arc.edge }; heap.push([next, arc.to]); }
      }
    }
    return { distances, previous };
  }
  function reconstruct(result, source, target) {
    if (!Number.isFinite(result.distances[target])) return null;
    const nodes = [target], edges = []; let cur = target;
    while (cur !== source) { const p = result.previous[cur]; if (!p) return null; edges.push(p.edge); cur = p.node; nodes.push(cur); }
    return { nodes: nodes.reverse(), edges: edges.reverse(), minutes: result.distances[target], distance: edges.reduce((sum, e) => sum + e.distance, 0) };
  }
  function floydWarshall(a) {
    const n = a.length, d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 0 : Infinity));
    a.forEach((arcs, i) => arcs.forEach(arc => { d[i][arc.to] = Math.min(d[i][arc.to], arc.time); }));
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
    return d;
  }
  function kruskal(s) {
    const parent = s.nodes.map((_, i) => i), rank = parent.map(() => 0), edges = [];
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    for (const e of s.edges.filter(e => !e.blocked).sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))) {
      let u = find(e.u), v = find(e.v); if (u === v) continue;
      if (rank[u] < rank[v]) [u, v] = [v, u]; parent[v] = u; if (rank[u] === rank[v]) rank[u]++;
      edges.push(e); if (edges.length === s.nodes.length - 1) break;
    }
    return { edges, distance: edges.reduce((sum, e) => sum + e.distance, 0), components: s.nodes.length - edges.length };
  }
  function knapsack(items, capacity) {
    const rows = [new Float64Array(capacity + 1)];
    items.forEach(item => {
      const prev = rows[rows.length - 1], row = prev.slice();
      for (let w = item.weight; w <= capacity; w++) row[w] = Math.max(prev[w], prev[w - item.weight] + item.profit);
      rows.push(row);
    });
    const selected = []; let w = capacity;
    for (let i = items.length; i > 0; i--) if (rows[i][w] > rows[i - 1][w]) { selected.push(items[i - 1].id); w -= items[i - 1].weight; }
    return { profit: rows[items.length][capacity], selected: selected.reverse(), weight: capacity - w };
  }
  function schedule(order, s, shortest) {
    let from = 0, time = 0, distance = 0, weight = 0, profit = 0; const stops = [], legs = [];
    for (const id of order) {
      const node = s.nodes[id], path = reconstruct(shortest[from], from, id);
      if (!path) return null;
      const arrival = time + path.minutes, completion = arrival + s.config.service;
      if (completion > node.deadline + EPS) return null;
      legs.push({ from, to: id, departure: time, arrival, ...path });
      stops.push({ id, arrival, completion, deadline: node.deadline, slack: node.deadline - completion });
      time = completion; distance += path.distance; weight += node.weight; profit += node.profit; from = id;
    }
    if (weight > s.config.capacity) return null;
    const back = reconstruct(shortest[from], from, 0); if (!back) return null;
    if (order.length) { legs.push({ from, to: 0, departure: time, arrival: time + back.minutes, ...back }); distance += back.distance; time += back.minutes; }
    return { order: [...order], stops, legs, weight, profit, distance, minutes: time, averageLatency: stops.length ? stops.reduce((t, stop) => t + stop.completion, 0) / stops.length : 0 };
  }
  function insert(ids, s, shortest) {
    let order = [], current = schedule([], s, shortest);
    for (const id of ids) {
      if (current.weight + s.nodes[id].weight > s.config.capacity) continue;
      let best = null;
      for (let pos = 0; pos <= order.length; pos++) {
        const candidate = schedule([...order.slice(0, pos), id, ...order.slice(pos)], s, shortest);
        if (candidate && (!best || candidate.minutes < best.minutes - EPS)) best = candidate;
      }
      if (best) { current = best; order = best.order; }
    }
    return current;
  }
  function greedy(s, shortest, items) {
    const ids = [...items].sort((a, b) => b.profit / b.weight - a.profit / a.weight || a.deadline - b.deadline || a.id - b.id).map(i => i.id);
    return insert(ids, s, shortest);
  }
  function exactRoute(s, shortest, items) {
    const n = items.length; if (!n) return schedule([], s, shortest);
    const size = 1 << n, time = new Float64Array(size * n).fill(Infinity), prev = new Int16Array(size * n).fill(-1);
    const weights = new Float64Array(size), profits = new Float64Array(size);
    let bestMask = 0, bestLast = -1, bestProfit = 0, bestReturn = 0;
    for (let mask = 1; mask < size; mask++) {
      const bit = mask & -mask, i = 31 - Math.clz32(bit), rest = mask ^ bit;
      weights[mask] = weights[rest] + items[i].weight; profits[mask] = profits[rest] + items[i].profit;
      if (weights[mask] > s.config.capacity) continue;
      for (let last = 0; last < n; last++) {
        if (!(mask & (1 << last))) continue;
        const before = mask ^ (1 << last), dest = items[last].id, idx = mask * n + last;
        if (!before) time[idx] = shortest[0].distances[dest] + s.config.service;
        else for (let p = 0; p < n; p++) if (before & (1 << p)) {
          const t = time[before * n + p] + shortest[items[p].id].distances[dest] + s.config.service;
          if (t < time[idx] - EPS) { time[idx] = t; prev[idx] = p; }
        }
        if (time[idx] > items[last].deadline + EPS) { time[idx] = Infinity; continue; }
        const end = time[idx] + shortest[dest].distances[0];
        if (Number.isFinite(end) && (profits[mask] > bestProfit || (profits[mask] === bestProfit && end < bestReturn - EPS))) {
          bestProfit = profits[mask]; bestMask = mask; bestLast = last; bestReturn = end;
        }
      }
    }
    const order = []; let mask = bestMask, last = bestLast;
    while (last >= 0) { order.push(items[last].id); const p = prev[mask * n + last]; mask ^= 1 << last; last = p; }
    return schedule(order.reverse(), s, shortest);
  }
  const clock = () => typeof performance === 'object' ? performance.now() : Date.now();
  function solve(input) {
    const s = validateScenario(input), timings = {}, start = clock(); let t = clock();
    const a = adjacency(s), mst = kruskal(s); timings.mst = clock() - t; t = clock();
    const shortest = a.map((_, i) => dijkstra(a, i)); timings.dijkstra = clock() - t; t = clock();
    const allPairs = floydWarshall(a); timings.floyd = clock() - t;
    const eligible = s.nodes.slice(1).filter(n => n.weight <= s.config.capacity && Number.isFinite(shortest[0].distances[n.id]) && shortest[0].distances[n.id] + s.config.service <= n.deadline + EPS);
    t = clock(); const baseline = greedy(s, shortest, eligible); timings.greedy = clock() - t;
    t = clock(); const bound = knapsack(eligible, s.config.capacity); timings.knapsack = clock() - t;
    t = clock(); let optimized, method;
    if (s.config.nodeCount <= EXACT_LIMIT) { optimized = exactRoute(s, shortest, eligible); method = 'exact'; }
    else {
      const pool = eligible.filter(n => bound.selected.includes(n.id)).sort((a, b) => a.deadline - b.deadline || b.profit / b.weight - a.profit / a.weight);
      const candidate = insert([...pool.map(n => n.id), ...eligible.filter(n => !bound.selected.includes(n.id)).sort((a, b) => a.deadline - b.deadline).map(n => n.id)], s, shortest);
      optimized = candidate.profit > baseline.profit || (candidate.profit === baseline.profit && candidate.minutes < baseline.minutes) ? candidate : baseline;
      method = 'heuristic';
    }
    timings.route = clock() - t; timings.total = clock() - start;
    const exclusions = s.nodes.slice(1).filter(n => !optimized.order.includes(n.id)).map(n => ({ id: n.id, reason: !Number.isFinite(shortest[0].distances[n.id]) ? 'Unreachable' : n.weight > s.config.capacity ? 'Package exceeds capacity' : shortest[0].distances[n.id] + s.config.service > n.deadline + EPS ? 'Deadline unreachable' : method === 'exact' ? 'Excluded by optimal feasible plan' : 'Excluded by capacity / schedule heuristic' }));
    return { scenario: s, mst, shortest, allPairs, greedy: baseline, optimized, bound, method, eligible: eligible.map(n => n.id), exclusions, timings };
  }
  function disrupt(input, edgeId, type = 'closure', factor = 2) {
    const s = validateScenario(input), e = s.edges.find(e => e.id === edgeId);
    if (!e) throw new Error('Select an existing road.');
    if (type === 'closure') e.blocked = true;
    else if (type === 'delay') { checkNumber(factor, 'Delay multiplier', 1, 20); e.delay = factor; }
    else throw new Error('Disruption must be closure or delay.');
    return s;
  }
  return { defaults, EXACT_LIMIT, generate, validateConfig, validateScenario, adjacency, dijkstra, reconstruct, floydWarshall, kruskal, knapsack, schedule, exactRoute, solve, disrupt, rng };
});
