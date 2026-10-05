# Model & algorithm design

[← Project overview](../README.md)

## Formulation

The undirected graph contains warehouse 0 and customer nodes. Every road has positive distance in km and travel time in minutes. A delay multiplies its base travel time; a closure removes it from path calculations.

Each customer has integer package weight, nonnegative profit and a deadline in minutes after departure. One vehicle leaves with its selected packages and returns to the warehouse. Maximize selected profit subject to vehicle capacity and service completion at every selected stop before its deadline.

Completion time accumulates the preceding stop's completion, shortest travel time and service duration. Passing through a customer node does not deliver their package. There is no depot closing time, maximum trip duration, lower-bound time window or second vehicle. Exact plans use earliest return as a tie-break; they do not claim minimum-distance touring.

## Graph algorithms

**Kruskal:** sort open roads by distance and add only edges whose endpoints belong to different union-find components. The cut property makes those edges safe for the minimum spanning forest. Connected graphs yield `V − 1` edges. The forest describes infrastructure, not the delivery tour.

**Dijkstra:** adjacency lists and a binary min-heap compute fastest paths on positive time-weighted roads. Stale entries are skipped and predecessors reconstruct road paths. Run from every node because delivery legs require customer-to-customer paths too.

**Floyd–Warshall:** `d[i,j] = min(d[i,j], d[i,k] + d[k,j])` independently computes all-pairs travel times. The interface compares its matrix with all Dijkstra sources. Unreachable pairs remain infinite.

## Selection and schedule

**Greedy:** process descending profit/weight, breaking ties by deadline and ID. Try each insertion position and keep the feasible schedule with earliest return. Recheck the complete route's deadlines and capacity after every insertion. Ratio choice is a baseline, not an optimality proof.

**0/1 knapsack:** individually eligible customers fit the vehicle and can complete service by their deadline from the warehouse. The recurrence `K[i,w] = max(K[i−1,w], pᵢ + K[i−1,w−wᵢ])` considers excluding or including each package exactly once. Traceback recovers the subset. Joint route deadlines are relaxed, so its profit is an upper bound rather than a promised feasible yield.

**Exact deadline subset DP:** for scenarios up to 12 customers, `T[S,j]` keeps the earliest feasible completion after visiting subset `S` and ending at `j`. Transition from each preceding stop `i` with `T[S\{j},i] + shortestTime(i,j) + service`. Base states leave the warehouse. Discard states over capacity or beyond the final customer's deadline; earlier states already satisfy prior deadlines.

For identical subset and last stop, earlier completion dominates later completion: load and profit are the same, and earlier arrival cannot reduce feasibility under upper-bound deadlines. This justifies storing one time per state. Inspect every feasible state, choose maximum subset profit and earliest return as tie-break, then reconstruct predecessors.

**Larger-scenario heuristic:** insert knapsack candidates in deadline order, then remaining eligible customers. Compare that feasible plan with greedy and choose higher profit, then earlier return. Every delivery remains feasible and profit is at least the greedy baseline. Global route optimality is not guaranteed.

## Complexity

`n`: customers, `V`: vertices, `E`: roads, `W`: capacity.

| Component | Time | Space |
| --- | --- | --- |
| Kruskal | O(E log E) | O(V + E) |
| Dijkstra, one source | O((V + E) log V) | O(V + E) |
| Dijkstra, every source | O(V(V + E) log V) | O(V² + E) |
| Floyd–Warshall | O(V³) | O(V²) |
| Greedy insertion | O(n³) | O(n + V²) |
| Knapsack | O(nW) | O(nW) |
| Exact subset DP | O(2ⁿn²) | O(2ⁿn) |
| Knapsack + insertion | O(nW + n³) | O(nW + V²) |

The exact threshold uses total customers, even when eligibility filtering reduces the actual DP size. Density is the probability of adding extra roads after a connecting tree, not a guaranteed realized edge proportion.

## Robustness

Closures and delays recompute the MST/forest, shortest paths, selection bound and complete schedule on the same data. Unreachable orders are excluded with a reason. Restore roads clears both closures and delay multipliers.

Source: [engine.js](../engine.js) and independent [Python implementation](../python/delivery.py).
