# Experiment evidence

[← Project overview](../README.md) · [Raw measurements](benchmark-results.json)

Measured **5 October 2026**, **Node.js v24.19.0**, three repeated solves per scenario. All use seed 2026, ₹500 profit ceiling, 30 km/h speed, 2-minute service and 09:00 departure. Runtime covers computation, excluding input validation and rendering.

| Customers | Density | Capacity | Solver | Greedy | Plan | Bound | Distance | Trip time | Mean runtime | Stable ×3 |
| ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 8 | 0.10 | 10 kg | Exact | ₹801 | ₹943 | ₹943 | 20.0 km | 49.0 min | 0.684 ms | Yes |
| 12 | 0.22 | 25 kg | Exact | ₹1,839 | ₹1,879 | ₹1,879 | 29.2 km | 78.5 min | 1.294 ms | Yes |
| 20 | 0.35 | 35 kg | Heuristic | ₹3,221 | ₹3,549 | ₹3,549 | 49.2 km | 125.9 min | 0.745 ms | Yes |
| 40 | 0.60 | 60 kg | Heuristic | ₹4,925 | ₹5,435 | ₹5,819 | 72.1 km | 191.1 min | 5.286 ms | Yes |

Distance and duration include depot return. Density is extra-edge probability after a connecting tree. All selected stops in these runs met their service-completion deadlines.

The recommended plans earned ₹1,020 more than greedy across these four scenarios. This describes those configurations, not a universal gain. At 40 customers the feasible heuristic remains ₹384 below the relaxed bound; this does not prove that bound is attainable with deadlines.

Runtime varies with device, runtime version, warm-up and background load. The 12-customer exact run and 20-customer heuristic use different methods and datasets, so the timing comparison is not a scaling law. Larger studies should vary one parameter at a time and increase repetition.

## Reproduce

In the app, use default seed/generation settings and open **Experiments → Run benchmark**. It builds the same four independent scenarios, measures its own runtime, checks stable repeated orders and exports CSV. Customer edits and disruptions in the workspace do not change benchmark datasets.

## Correctness evidence

- 11 JavaScript tests cover paths, MST, knapsack, accumulated deadlines, disruptions and validation.
- Exact route DP is compared with exhaustive search on 15 seeded six-customer cases.
- Fifteen larger scenarios check feasible scheduling and profit relative to greedy.
- Six Python tests check reference parity, all-pairs agreement, exhaustive routes, capacity/deadlines, disconnection and invalid input.

All result values come from computation.
