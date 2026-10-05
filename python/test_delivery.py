"""Run with python -m unittest discover -s python -v."""
import itertools
import json
from pathlib import Path
import unittest
from delivery import adjacency, dijkstra, exact_route, schedule, solve, validate


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((Path(__file__).resolve().parents[1] / "data" / "sample-scenario.json").read_text(encoding="utf-8"))

    def test_sample_matches_web_reference(self):
        r = solve(self.data)
        expected = json.loads((Path(__file__).resolve().parents[1] / "data" / "sample-reference.json").read_text(encoding="utf-8"))
        for key in ("profit", "weight", "order"):
            self.assertEqual(r["optimized"][key], expected["optimized"][key])
        self.assertAlmostEqual(r["optimized"]["minutes"], expected["optimized"]["minutes"])
        self.assertAlmostEqual(r["optimized"]["distance"], expected["optimized"]["distance"])
        self.assertEqual(r["greedy"]["profit"], expected["greedyProfit"])
        self.assertEqual(r["bound"]["profit"], expected["bound"])

    def test_shortest_path_crosscheck(self):
        r = solve(self.data)
        for i, row in enumerate(r["allPairs"]):
            for j, value in enumerate(row):
                self.assertAlmostEqual(value, r["shortest"][i]["distances"][j])

    def test_exact_matches_all_small_permutations(self):
        s = self.data
        s["nodes"] = s["nodes"][:6]
        s["edges"] = [e for e in s["edges"] if e["u"] < 6 and e["v"] < 6]
        s["config"]["nodeCount"] = 5
        s["config"]["capacity"] = 15
        graph = adjacency(s)
        paths = [dijkstra(graph, i) for i in range(len(graph))]
        best = schedule([], s, paths)
        for count in range(1, 6):
            for order in itertools.permutations(range(1, 6), count):
                p = schedule(order, s, paths)
                if p and (p["profit"] > best["profit"] or (p["profit"] == best["profit"] and p["minutes"] < best["minutes"])):
                    best = p
        exact = exact_route(s, paths, s["nodes"][1:])
        self.assertEqual(exact["profit"], best["profit"])
        self.assertAlmostEqual(exact["minutes"], best["minutes"])

    def test_capacity_and_deadlines(self):
        r = solve(self.data)
        self.assertLessEqual(r["optimized"]["weight"], self.data["config"]["capacity"])
        for stop in r["optimized"]["stops"]:
            self.assertLessEqual(stop["completion"], stop["deadline"] + 1e-8)

    def test_closed_network(self):
        for road in self.data["edges"]:
            road["blocked"] = True
        r = solve(self.data)
        self.assertEqual(r["optimized"]["profit"], 0)
        self.assertEqual(r["mst"]["components"], len(self.data["nodes"]))

    def test_invalid_dataset(self):
        self.data["nodes"][1]["weight"] = .5
        with self.assertRaises(ValueError):
            validate(self.data)


if __name__ == "__main__":
    unittest.main()
