# Demonstration & viva guide

[← Project overview](../README.md)

## Repeatable demo

1. Generate **10 customers, 25 kg, density 0.22, seed 2026**, with default 30 km/h speed, ₹500 profit ceiling, 2-minute service and 09:00 departure.
2. Show **₹1,751 exact DP profit**, **₹1,563 greedy profit**, **25 kg load** and four on-time stops.
3. Open Road network, enable the MST and play the route. Inspect a customer. Explain how the infrastructure tree differs from the actual road tour.
4. Close the preselected road and compare before/after metrics. Restore roads. Disruption testing retains the same dataset.
5. In Delivery manifest, change a customer's deadline to 1 minute and save. Show the explicit deadline-unreachable reason.
6. In Algorithm lab, inspect warehouse paths and all-pairs times. Point out the Dijkstra/Floyd agreement indicator.
7. Run Experiments. Explain exact DP at 8/12 customers versus heuristics at 20/40, then inspect or export the measured CSV.
8. Generate the original settings again to reset. Export JSON to give another person identical data.

## Viva questions

| Question | Key answer |
| --- | --- |
| Why adjacency lists? | Efficient storage and outgoing-arc traversal for a sparse road graph. |
| Why Dijkstra? | Positive travel times satisfy its shortest-path invariant. |
| Why also Floyd–Warshall? | Independent all-pairs times and a cross-check. |
| Is the MST the delivery route? | No. It models the distance backbone; delivery legs use fastest paths on all open roads. |
| Why can greedy lose? | Local ratios can block better package combinations or feasible deadline orders. |
| Is knapsack enough? | It ignores joint route deadlines and yields only a capacity profit bound. |
| Why is small route DP exact? | All subset/last-stop states are evaluated; earlier completion dominates later completion in identical states. |
| Why limit it to 12? | Subset DP grows exponentially; the threshold keeps the browser responsive. |
| Are large plans optimal? | No. They are feasible and at least as profitable as the compared greedy plan. |
| What is a deadline? | Service completion, including all previous travel and service. |
| How is correctness tested? | Known cases, independent shortest paths, exhaustive small routes, feasibility checks and Python parity. |

Use measured outputs from the current scenario. Synthetic coordinates are not real streets. Profit improvements do not imply distance improvements, and repeated stability is not a universal optimality proof.
