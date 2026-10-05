# Nexus Delivery Lab

A complete offline last-mile delivery simulator for the DAA project. Open
`dashboard.html` directly, or run the local server for the preview experience.
There are no dependencies to install, external fonts, CDNs, API keys or accounts.

## Run the app

**Quick start:** double-click `index.html` or `dashboard.html` in a browser.

**Local server:** double-click `start.cmd`, or run:

```powershell
npm start
```

Then open http://127.0.0.1:4173. Keep the terminal running. The server only
listens on your own computer. If the port is occupied, use `$env:PORT=4174`
before `npm start` and open that port instead.

## What works

- Overview with computed profit, customers served, distance, return time,
  on-time performance, vehicle load and algorithm runtime.
- Deterministic synthetic graphs, with adjustable customers, density, capacity,
  random seed, profit range, speed, departure and service time.
- Interactive SVG network, customer inspection, MST overlay, zoom and route
  playback with pause, reset and a timeline. The marker follows actual roads
  and waits during service.
- Editable customer and road datasets. Road closures and delay multipliers
  recompute shortest paths and the complete delivery plan on the same data.
- Full JSON scenario import/export, route CSV export, and automatic local
  scenario persistence where browser storage is available.
- Dijkstra path table, Floyd–Warshall matrix, complexity explanations and
  transparent exact/heuristic labels.
- Four benchmark configurations with three repeated runs each, measured
  runtime, solution stability, profit comparison and CSV export.
- Python reference CLI using the same scenario JSON as the browser.

## Demonstration (about 5 minutes)

1. Open the overview. The default seed 2026 scenario selects four customers,
   earning **₹1,751** with **25 kg**, compared with **₹1,563** for greedy.
   The route is approximately **30.6 km** and **79.2 minutes** including return.
   These are computed results, not the presentation's illustrative numbers.
2. Open Road network, enable the MST, and play the delivery route. Select a
   customer for their package and deadline. An MST is infrastructure, not a tour.
3. Apply a road closure. The road becomes dashed red and the plan recomputes.
   Compare before/after metrics. Restore roads.
4. In Delivery manifest, set a customer's deadline to 1 minute and save.
   The decision explains why that customer is excluded.
5. In Algorithm lab, inspect warehouse shortest paths and the all-pairs matrix.
6. Run Experiments. Compare exact scenarios (8/12 customers) with heuristics
   (20/40 customers) and export the measurements.
7. Generate seed 2026 again to return to the original demo dataset.

## Model and guarantees

The vehicle starts at warehouse 0 carrying every selected package. Each package
has an integer weight, nonnegative profit and deadline in minutes after
departure. Roads are undirected, with positive distance and travel time.
Every selected stop must **complete service** by its deadline. Travel and
service time accumulate across the entire route; the vehicle returns to the
warehouse. Visiting a road junction at a customer does not deliver their package.
There is no depot closing time, time window opening bound, fuel budget or second
vehicle. Distances are synthetic kilometers, not a geographic map or live traffic.

| Algorithm | Role | Time | Space |
| --- | --- | --- | --- |
| Kruskal + union-find | Minimum distance spanning tree/forest | O(E log E) | O(V + E) |
| Binary-heap Dijkstra | Shortest travel time from one source | O((V + E) log V) | O(V + E) |
| Dijkstra from every node | Paths needed for routing | O(V(V + E) log V) | O(V² + E) |
| Floyd–Warshall | All-pairs times, independent cross-check | O(V³) | O(V²) |
| Ratio greedy + feasible insertion | Fast route baseline | O(n³) | O(n + V²) |
| 0/1 knapsack | Capacity-only profit upper bound | O(nW) | O(nW) |
| Deadline subset DP (n ≤ 12) | Exact profit-maximizing feasible route | O(2ⁿn²) | O(2ⁿn) |
| Knapsack + feasible insertion (n > 12) | Larger-scenario route heuristic | O(nW + n³) | O(nW + V²) |

Kruskal operates on road **distance**. Dijkstra/Floyd operate on **travel time**
including delay multipliers. Reported route distance follows those fastest paths.
Knapsack considers individually reachable customers and ignores joint route
deadlines, giving an upper bound on feasible route profit.

For up to 12 customers, subset DP retains the earliest feasible service
completion for each `(visited subset, last customer)`. Earlier completion
dominates later completion for the same state because future deadlines are
upper bounds. It evaluates all feasible subsets and picks maximum profit, with
earliest return as the tie-break. It does **not** claim the minimum-distance tour.

For larger scenarios, the heuristic inserts knapsack candidates in deadline
order and checks the full schedule after every insertion. Remaining eligible
orders are considered too. The result is compared with ratio greedy and the
better feasible plan is returned. It is never worse in profit than that baseline,
but global route optimality is not guaranteed.

## Dataset

`data/sample-scenario.json` contains the reproducible default scenario.
`data/sample-reference.json` contains computed reference metrics for parity tests.
Import a version 1 JSON object with `config`, `nodes` and `edges`.

- Node 0 is the warehouse; IDs must be contiguous from 0 to the customer count.
- Customer fields: `id`, `name`, `x`, `y`, `weight`, `profit`, `deadline`.
  Coordinates are normalized to 0–100.
- Road fields: `u`, `v`, `distance`, `minutes`, `blocked`, `delay`.
  IDs are normalized to `minEndpoint-maxEndpoint`. Parallel/self roads are rejected.
- The UI supports 1–40 customers and capacity 1–500 kg. Inputs and imported
  datasets are validated before computation. Disconnected graphs are supported;
  unreachable orders are excluded with a reason.

Changing seed/count/density/profit/speed and pressing Optimize regenerates the
scenario. Capacity/service/departure edits retain the existing orders and roads.
The Generate button always regenerates the entire dataset. Manifest edits are
committed using Save & optimize; unsaved edits remain outside the current plan.

## Vercel deployment

The repository includes a Vercel configuration for this static app. Import the
repository into Vercel. The configuration selects the Other framework preset,
runs `npm run build`, and serves `dist/`. No environment variables are needed.
The build copies only browser assets, the README and sample datasets. Python
source, tests and the local preview server are retained in Git and are not needed
by the hosted website. Run `npm run build` locally to inspect the publish output.

## Python (course implementation)

Python 3.10+; standard library only. From the project folder:

```powershell
python python/delivery.py data/sample-scenario.json
python python/delivery.py data/sample-scenario.json --capacity 20 --output plan.json
python -m unittest discover -s python -v
```

The browser uses JavaScript to stay self-contained. The Python implementation
contains adjacency lists, `heapq` Dijkstra, Kruskal, Floyd–Warshall, knapsack,
exact subset DP and feasible route insertion. It reads the identical dataset
and produces matching route metrics; it is independent of the JavaScript engine.

## Verification

```powershell
npm test
python -m unittest discover -s python -v
```

The JavaScript tests check deterministic generation, shortest path correctness,
MST versus road travel weights, the knapsack greedy counterexample, accumulated
deadlines with service time, exact DP versus exhaustive enumeration on 15 small
scenarios, actual disruptions, infeasibility, validation, and 15 larger heuristic
scenarios. Python tests check browser parity, shortest paths, exhaustive small
routes, capacity/deadlines, disconnected input and invalid data.

The attached report and assessment PDF informed the functional scope. Their
sample results are not substituted for computed measurements. The report's
claims about universal DP improvements are limited here to the implemented
model and clearly identified solver guarantees. The separate disaster-response
topic and its multi-depot requirements are outside this last-mile project.

## Files

`index.html` / `landing.css`: project introduction and model.
`dashboard.html` / `style.css` / `app.js`: interface, dataset editing and playback.
`engine.js`: pure algorithms, import validation and deterministic generation.
`server.cjs` / `start.cmd`: optional preview launcher.
`python/delivery.py`: Python algorithms and CLI.
`tests/engine.test.cjs` / `python/test_delivery.py`: verification.

The original five files are preserved in a separate backup before replacement.
No original references, PowerPoint or PDF are changed.
