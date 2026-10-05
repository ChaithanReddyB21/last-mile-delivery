'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), E = require('../engine.js');
function fixture(items, edges, capacity = 10, service = 0) {
  return { version: 1, config: { ...E.defaults, nodeCount: items.length, capacity, service }, nodes: [{ id: 0, name: 'Warehouse', x: 50, y: 50, weight: 0, profit: 0, deadline: 1440 }, ...items.map((item, i) => ({ id: i + 1, name: 'C' + (i + 1), x: 20 + i * 10, y: 20, weight: 1, profit: 1, deadline: 200, ...item }))], edges: edges.map(([u, v, minutes, distance = minutes]) => ({ id: `${u}-${v}`, u, v, minutes, distance, delay: 1, blocked: false })) };
}
function brute(s) {
  const a = E.adjacency(s), paths = a.map((_, i) => E.dijkstra(a, i)); let best = E.schedule([], s, paths);
  function visit(order, remaining) {
    const p = E.schedule(order, s, paths); if (!p) return;
    if (p.profit > best.profit || (p.profit === best.profit && p.minutes < best.minutes - 1e-8)) best = p;
    remaining.forEach(id => visit([...order, id], remaining.filter(n => n !== id)));
  }
  visit([], s.nodes.slice(1).map(n => n.id)); return best;
}
function checkFeasible(r) {
  const p = r.optimized;
  assert.ok(p.weight <= r.scenario.config.capacity); assert.equal(new Set(p.order).size, p.order.length);
  assert.equal(p.profit, p.order.reduce((sum, id) => sum + r.scenario.nodes[id].profit, 0));
  assert.equal(p.weight, p.order.reduce((sum, id) => sum + r.scenario.nodes[id].weight, 0));
  p.stops.forEach(s => assert.ok(s.completion <= s.deadline + 1e-7));
  p.legs.forEach(l => { assert.ok(l.edges.every(e => !e.blocked)); assert.equal(l.nodes[0], l.from); assert.equal(l.nodes.at(-1), l.to); });
  if (p.order.length) assert.equal(p.legs.at(-1).to, 0);
  assert.ok(p.profit >= r.greedy.profit); assert.ok(p.profit <= r.bound.profit);
}
test('seeded datasets are reproducible and initially connected', () => {
  assert.deepEqual(E.generate(E.defaults), E.generate(E.defaults));
  assert.notDeepEqual(E.generate({ seed: 1 }), E.generate({ seed: 2 }));
  for (const nodeCount of [1, 10, 40]) for (const density of [.05, .6, 1]) {
    const s = E.generate({ nodeCount, density }); assert.equal(E.kruskal(s).edges.length, nodeCount); assert.equal(E.kruskal(s).components, 1);
  }
});
test('binary heap Dijkstra finds a multi-hop path, agrees with Floyd for all pairs', () => {
  const s = fixture([{}, {}, {}], [[0, 1, 4], [0, 2, 1], [2, 1, 1], [1, 3, 2], [2, 3, 9]]), r = E.solve(s);
  assert.equal(r.shortest[0].distances[3], 4); assert.deepEqual(E.reconstruct(r.shortest[0], 0, 3).nodes, [0, 2, 1, 3]);
  r.allPairs.forEach((row, i) => row.forEach((v, j) => assert.equal(v, r.shortest[i].distances[j])));
});
test('Kruskal uses distance, not travel time; disconnected input yields a forest', () => {
  const s = fixture([{}, {}, {}], [[0, 1, 10, 1], [1, 2, 10, 1], [0, 2, 1, 5]]), mst = E.kruskal(s);
  assert.equal(mst.distance, 2); assert.equal(mst.edges.length, 2); assert.equal(mst.components, 2);
});
test('0/1 knapsack solves the classic greedy counterexample exactly', () => {
  const items = [{ id: 1, weight: 10, profit: 60 }, { id: 2, weight: 20, profit: 100 }, { id: 3, weight: 30, profit: 120 }];
  const k = E.knapsack(items, 50); assert.equal(k.profit, 220); assert.deepEqual(k.selected, [2, 3]); assert.equal(k.weight, 50);
});
test('deadline solver checks service completion and preceding stops', () => {
  const s = fixture([{ profit: 100, deadline: 5 }, { profit: 200, deadline: 5 }], [[0, 1, 3], [0, 2, 3], [1, 2, 3]], 10, 2), r = E.solve(s);
  assert.deepEqual(r.optimized.order, [2]); assert.equal(r.optimized.stops[0].completion, 5); assert.equal(r.optimized.profit, 200);
  assert.equal(r.bound.profit, 300); checkFeasible(r);
});
test('deadline exact DP agrees with exhaustive enumeration on small networks', () => {
  for (let seed = 0; seed < 15; seed++) {
    const s = E.generate({ nodeCount: 6, capacity: 5 + seed, seed, service: seed % 3 });
    s.nodes.slice(1).forEach((n, i) => { n.deadline = 20 + ((seed + i) * 13) % 80; });
    const r = E.solve(s), b = brute(s); assert.equal(r.optimized.profit, b.profit, `seed ${seed}`); assert.ok(Math.abs(r.optimized.minutes - b.minutes) < 1e-7); checkFeasible(r);
  }
});
test('closed roads really change shortest paths and exclude unreachable deliveries', () => {
  const s = fixture([{ profit: 100 }, { profit: 200 }], [[0, 1, 2], [1, 2, 2], [0, 2, 10]]);
  const changed = E.disrupt(s, '1-2'), r = E.solve(changed); assert.equal(r.shortest[0].distances[2], 10); assert.ok(!s.edges[1].blocked); checkFeasible(r);
  const disconnected = E.solve(E.disrupt(E.disrupt(s, '1-2'), '0-2')); assert.equal(disconnected.shortest[0].distances[2], Infinity); assert.ok(disconnected.exclusions.some(e => e.id === 2 && e.reason === 'Unreachable'));
});
test('delay factors affect the schedule without changing road distance', () => {
  const s = fixture([{ profit: 100, deadline: 4 }], [[0, 1, 3]]), before = E.solve(s), after = E.solve(E.disrupt(s, '0-1', 'delay', 2));
  assert.equal(before.optimized.profit, 100); assert.equal(after.optimized.profit, 0); assert.equal(after.shortest[0].distances[1], 6); assert.equal(after.mst.distance, 3);
});
test('large-instance heuristic remains feasible and at least as profitable as greedy', () => {
  for (const nodeCount of [13, 20, 40]) for (let seed = 0; seed < 5; seed++) {
    const r = E.solve(E.generate({ nodeCount, seed, capacity: 10 + seed * 10, density: .1 })); assert.equal(r.method, 'heuristic'); checkFeasible(r);
  }
});
test('empty feasible selection and zero-profit orders are handled', () => {
  const s = fixture([{ weight: 20, profit: 100, deadline: 1 }], [[0, 1, 3]], 1), r = E.solve(s);
  assert.equal(r.optimized.profit, 0); assert.deepEqual(r.optimized.order, []); assert.equal(r.optimized.minutes, 0); assert.equal(r.optimized.averageLatency, 0);
  const zero = E.solve(fixture([{ profit: 0 }], [[0, 1, 1]])); assert.equal(zero.optimized.profit, 0);
});
test('validation rejects unsafe sizes, fractional loads, duplicate roads and malformed imports', () => {
  for (const config of [{ nodeCount: 1000 }, { capacity: -1 }, { density: NaN }, { seed: -1 }, { capacity: 1.5 }, { start: '25:00' }]) assert.throws(() => E.generate(config));
  const s = E.generate(); s.nodes[1].weight = .5; assert.throws(() => E.solve(s));
  const dup = E.generate(); dup.edges.push({ ...dup.edges[0] }); assert.throws(() => E.solve(dup));
  assert.throws(() => E.solve({ version: 1, nodes: [], edges: [] })); assert.throws(() => E.disrupt(E.generate(), 'unknown'));
});
