"""Dependency-free Python reference implementation of the Nexus DAA model.

Run: python python/delivery.py data/sample-scenario.json --output plan.json
This CLI reads the same JSON dataset as the web dashboard. It is not required
to run the UI. One vehicle, undirected positive roads, completion deadlines.
"""
from __future__ import annotations

import argparse
import copy
import heapq
import json
import math
from pathlib import Path
from time import perf_counter

EPS = 1e-8
EXACT_LIMIT = 12


def validate(raw):
    s = copy.deepcopy(raw)
    if not isinstance(s, dict) or s.get("version") != 1:
        raise ValueError("Expected version 1 scenario")
    config, nodes, edges = s["config"], s["nodes"], s["edges"]

    def number(value, name, low, high, integer=False):
        if (isinstance(value, bool) or not isinstance(value, (float, int))
                or not math.isfinite(value) or not low <= value <= high
                or (integer and int(value) != value)):
            raise ValueError(f"Invalid {name}: expected {'integer' if integer else 'number'} in [{low}, {high}]")

    for key, low, high, integer in [("nodeCount", 1, 40, True), ("capacity", 1, 500, True),
            ("density", .05, 1, False), ("seed", 0, 4294967295, True),
            ("maxProfit", 50, 2000, True), ("speed", 10, 80, False), ("service", 0, 15, False)]:
        number(config[key], key, low, high, integer)
    parts = config["start"].split(":")
    if len(parts) != 2 or any(len(p) != 2 or not p.isdigit() for p in parts) or not (0 <= int(parts[0]) < 24 and 0 <= int(parts[1]) < 60):
        raise ValueError("Invalid departure time")
    if len(nodes) != config["nodeCount"] + 1:
        raise ValueError("Node count must match config plus warehouse")
    for i, n in enumerate(nodes):
        if n["id"] != i or not isinstance(n["name"], str) or not n["name"].strip() or len(n["name"]) > 80:
            raise ValueError("Invalid node ID or name")
        number(n["x"], "x", 0, 100)
        number(n["y"], "y", 0, 100)
        number(n["weight"], "weight", 1 if i else 0, 500 if i else 0, True)
        number(n["profit"], "profit", 0, 100000 if i else 0, True)
        number(n["deadline"], "deadline", 1, 1440)
    seen = set()
    for e in edges:
        for key in ("u", "v"):
            number(e[key], key, 0, len(nodes) - 1, True)
        key = f"{min(e['u'], e['v'])}-{max(e['u'], e['v'])}"
        if e["u"] == e["v"] or key in seen:
            raise ValueError("Self-loop or duplicate road")
        seen.add(key)
        e["id"] = key
        number(e["distance"], "distance", .001, 1000)
        number(e["minutes"], "minutes", .001, 1440)
        e.setdefault("blocked", False)
        e.setdefault("delay", 1)
        if not isinstance(e["blocked"], bool):
            raise ValueError("Road blocked must be boolean")
        number(e["delay"], "delay", 1, 20)
    return s


def adjacency(s):
    graph = [[] for _ in s["nodes"]]
    for e in s["edges"]:
        if not e["blocked"]:
            t = e["minutes"] * e["delay"]
            graph[e["u"]].append((e["v"], t, e))
            graph[e["v"]].append((e["u"], t, e))
    return graph


def dijkstra(graph, source):
    distances, previous = [math.inf] * len(graph), [None] * len(graph)
    distances[source] = 0
    heap = [(0, source)]
    while heap:
        cost, u = heapq.heappop(heap)
        if cost > distances[u] + EPS:
            continue
        for v, minutes, edge in graph[u]:
            nxt = cost + minutes
            if nxt < distances[v] - EPS:
                distances[v], previous[v] = nxt, (u, edge)
                heapq.heappush(heap, (nxt, v))
    return {"distances": distances, "previous": previous}


def reconstruct(paths, source, target):
    if not math.isfinite(paths["distances"][target]):
        return None
    nodes, edges, current = [target], [], target
    while current != source:
        current, edge = paths["previous"][current]
        nodes.append(current)
        edges.append(edge)
    return {"nodes": nodes[::-1], "edges": edges[::-1], "minutes": paths["distances"][target],
            "distance": sum(e["distance"] for e in edges)}


def floyd_warshall(graph):
    n = len(graph)
    dist = [[0 if i == j else math.inf for j in range(n)] for i in range(n)]
    for i, arcs in enumerate(graph):
        for j, minutes, _ in arcs:
            dist[i][j] = min(dist[i][j], minutes)
    for k in range(n):
        for i in range(n):
            for j in range(n):
                dist[i][j] = min(dist[i][j], dist[i][k] + dist[k][j])
    return dist


def kruskal(s):
    parent, rank, chosen = list(range(len(s["nodes"]))), [0] * len(s["nodes"]), []

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for e in sorted((e for e in s["edges"] if not e["blocked"]), key=lambda e: (e["distance"], e["id"])):
        u, v = find(e["u"]), find(e["v"])
        if u == v:
            continue
        if rank[u] < rank[v]:
            u, v = v, u
        parent[v] = u
        if rank[u] == rank[v]:
            rank[u] += 1
        chosen.append(e)
    return {"edges": chosen, "distance": sum(e["distance"] for e in chosen), "components": len(parent) - len(chosen)}


def knapsack(items, capacity):
    rows = [[0] * (capacity + 1)]
    for item in items:
        prev, row = rows[-1], rows[-1][:]
        for w in range(item["weight"], capacity + 1):
            row[w] = max(prev[w], prev[w - item["weight"]] + item["profit"])
        rows.append(row)
    selected, w = [], capacity
    for i in range(len(items), 0, -1):
        if rows[i][w] > rows[i - 1][w]:
            selected.append(items[i - 1]["id"])
            w -= items[i - 1]["weight"]
    return {"profit": rows[-1][capacity], "selected": selected[::-1], "weight": capacity - w}


def schedule(order, s, shortest):
    last, time, distance, weight, profit = 0, 0, 0, 0, 0
    stops, legs = [], []
    for node_id in order:
        node = s["nodes"][node_id]
        path = reconstruct(shortest[last], last, node_id)
        if path is None:
            return None
        arrival = time + path["minutes"]
        completion = arrival + s["config"]["service"]
        if completion > node["deadline"] + EPS:
            return None
        legs.append({"from": last, "to": node_id, "departure": time, "arrival": arrival, **path})
        stops.append({"id": node_id, "arrival": arrival, "completion": completion,
                      "deadline": node["deadline"], "slack": node["deadline"] - completion})
        last, time = node_id, completion
        distance += path["distance"]
        weight += node["weight"]
        profit += node["profit"]
    if weight > s["config"]["capacity"]:
        return None
    back = reconstruct(shortest[last], last, 0)
    if back is None:
        return None
    if order:
        legs.append({"from": last, "to": 0, "departure": time, "arrival": time + back["minutes"], **back})
        time += back["minutes"]
        distance += back["distance"]
    return {"order": list(order), "stops": stops, "legs": legs, "weight": weight, "profit": profit,
            "distance": distance, "minutes": time, "averageLatency": sum(x["completion"] for x in stops) / len(stops) if stops else 0}


def insertion(ids, s, shortest):
    current = schedule([], s, shortest)
    for node_id in ids:
        if current["weight"] + s["nodes"][node_id]["weight"] > s["config"]["capacity"]:
            continue
        order, best = current["order"], None
        for pos in range(len(order) + 1):
            candidate = schedule(order[:pos] + [node_id] + order[pos:], s, shortest)
            if candidate and (best is None or candidate["minutes"] < best["minutes"] - EPS):
                best = candidate
        if best is not None:
            current = best
    return current


def exact_route(s, shortest, items):
    n = len(items)
    if not n:
        return schedule([], s, shortest)
    size = 1 << n
    times = [[math.inf] * n for _ in range(size)]
    previous = [[-1] * n for _ in range(size)]
    weights, profits = [0] * size, [0] * size
    best_mask, best_last, best_profit, best_end = 0, -1, 0, 0
    for mask in range(1, size):
        bit = mask & -mask
        i, rest = bit.bit_length() - 1, mask ^ bit
        weights[mask], profits[mask] = weights[rest] + items[i]["weight"], profits[rest] + items[i]["profit"]
        if weights[mask] > s["config"]["capacity"]:
            continue
        for last in range(n):
            if not mask & (1 << last):
                continue
            before, dest = mask ^ (1 << last), items[last]["id"]
            if not before:
                times[mask][last] = shortest[0]["distances"][dest] + s["config"]["service"]
            else:
                for p in range(n):
                    if before & (1 << p):
                        nxt = times[before][p] + shortest[items[p]["id"]]["distances"][dest] + s["config"]["service"]
                        if nxt < times[mask][last] - EPS:
                            times[mask][last], previous[mask][last] = nxt, p
            if times[mask][last] > items[last]["deadline"] + EPS:
                times[mask][last] = math.inf
                continue
            end = times[mask][last] + shortest[dest]["distances"][0]
            if math.isfinite(end) and (profits[mask] > best_profit or (profits[mask] == best_profit and end < best_end - EPS)):
                best_mask, best_last, best_profit, best_end = mask, last, profits[mask], end
    order, mask, last = [], best_mask, best_last
    while last >= 0:
        order.append(items[last]["id"])
        p = previous[mask][last]
        mask ^= 1 << last
        last = p
    return schedule(order[::-1], s, shortest)


def solve(raw):
    s = validate(raw)
    start = perf_counter()
    graph, timings = adjacency(s), {}

    def timed(name, fn):
        before = perf_counter()
        value = fn()
        timings[name] = (perf_counter() - before) * 1000
        return value

    mst = timed("mst", lambda: kruskal(s))
    shortest = timed("dijkstra", lambda: [dijkstra(graph, i) for i in range(len(graph))])
    all_pairs = timed("floyd", lambda: floyd_warshall(graph))
    eligible = [n for n in s["nodes"][1:] if n["weight"] <= s["config"]["capacity"]
                and math.isfinite(shortest[0]["distances"][n["id"]])
                and shortest[0]["distances"][n["id"]] + s["config"]["service"] <= n["deadline"] + EPS]
    greedy = timed("greedy", lambda: insertion([n["id"] for n in sorted(eligible,
                   key=lambda n: (-n["profit"] / n["weight"], n["deadline"], n["id"]))], s, shortest))
    bound = timed("knapsack", lambda: knapsack(eligible, s["config"]["capacity"]))
    if s["config"]["nodeCount"] <= EXACT_LIMIT:
        optimized = timed("route", lambda: exact_route(s, shortest, eligible))
        method = "exact"
    else:
        def heuristic():
            pool = sorted((n for n in eligible if n["id"] in bound["selected"]), key=lambda n: (n["deadline"], -n["profit"] / n["weight"]))
            rest = sorted((n for n in eligible if n["id"] not in bound["selected"]), key=lambda n: n["deadline"])
            candidate = insertion([n["id"] for n in pool + rest], s, shortest)
            return candidate if (candidate["profit"] > greedy["profit"] or (candidate["profit"] == greedy["profit"] and candidate["minutes"] < greedy["minutes"])) else greedy
        optimized = timed("route", heuristic)
        method = "heuristic"
    timings["total"] = (perf_counter() - start) * 1000
    return {"scenario": s, "mst": mst, "shortest": shortest, "allPairs": all_pairs,
            "greedy": greedy, "optimized": optimized, "bound": bound, "method": method, "timings": timings}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scenario", type=Path)
    parser.add_argument("--output", type=Path, help="Write route and metrics JSON")
    parser.add_argument("--capacity", type=int, help="Override vehicle capacity")
    args = parser.parse_args()
    try:
        data = json.loads(args.scenario.read_text(encoding="utf-8-sig"))
        if args.capacity is not None:
            data["config"]["capacity"] = args.capacity
        r = solve(data)
        summary = {key: r[key] for key in ("method", "greedy", "optimized", "bound", "timings")}
        summary["mst"] = {"distance": r["mst"]["distance"], "components": r["mst"]["components"], "roads": [e["id"] for e in r["mst"]["edges"]]}
        text = json.dumps(summary, indent=2, ensure_ascii=True, allow_nan=False)
        if args.output:
            args.output.write_text(text + "\n", encoding="utf-8")
            print(f"Wrote {args.output}")
        else:
            print(text)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        parser.exit(2, f"Invalid scenario: {exc}\n")


if __name__ == "__main__":
    main()
