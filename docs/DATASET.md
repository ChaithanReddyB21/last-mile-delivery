# Scenario schema & data workflow

[← Project overview](../README.md)

[Default scenario](../data/sample-scenario.json) · [Reference metrics](../data/sample-reference.json) · [Python plan](../data/sample-python-plan.json)

Same generator parameters and seed produce the same records. A connecting tree guarantees initial connectivity; density controls probabilistic extra roads.

## Version 1 JSON

```json
{
  "version": 1,
  "config": {
    "nodeCount": 1, "capacity": 25, "density": 0.22,
    "seed": 2026, "maxProfit": 500, "speed": 30,
    "service": 2, "start": "09:00"
  },
  "nodes": [
    { "id": 0, "name": "Warehouse", "x": 50, "y": 50, "weight": 0, "profit": 0, "deadline": 1440 },
    { "id": 1, "name": "Customer 01", "x": 70, "y": 60, "weight": 3, "profit": 300, "deadline": 60 }
  ],
  "edges": [
    { "id": "0-1", "u": 0, "v": 1, "distance": 4, "minutes": 8, "blocked": false, "delay": 1 }
  ]
}
```

| Field | Units / limits |
| --- | --- |
| `nodeCount` | Integer customers, 1–40; excludes warehouse. |
| `capacity` | Integer kg, 1–500. |
| `density` | Extra-road probability, 0.05–1. |
| `seed` | Integer, 0–4,294,967,295. |
| `maxProfit` | Generator ceiling in INR, 50–2,000. |
| `speed` | Generator speed, 10–80 km/h. |
| `service` | Minutes per selected stop, 0–15. |
| `start` | Valid 24-hour departure, `HH:MM`. |
| Node `id` | Contiguous integers from warehouse 0. |
| Node `x`, `y` | Synthetic coordinates, 0–100. |
| Customer `weight` | Integer kg, 1–500. |
| Customer `profit` | Integer INR, 0–100,000 in imported data. |
| Node `deadline` | Minutes after departure, 1–1,440. |
| Road `distance` | Positive km, 0.001–1,000. |
| Road `minutes` | Positive base minutes, 0.001–1,440. |
| Road `delay` | Multiplier, 1–20; default 1. |
| Road `blocked` | Boolean; default false. |

Names contain 1–80 characters. Warehouse load/profit are zero. Roads are undirected and normalized to `minEndpoint-maxEndpoint`; parallel roads and self-loops are rejected. Disconnected imports are valid and unreachable orders are excluded.

## Editing and exports

Manifest changes take effect with **Save & optimize**. Unsaved inputs are outside the current plan. Changing capacity, departure or service and pressing Optimize retains the current data; changing count, seed, density, profit ceiling or speed regenerates it. Generate always replaces the full scenario.

JSON export preserves the full model, closures and delays. Route CSV includes arrival/completion, deadline, slack, package weight, profit and depot return. Fields are quoted and spreadsheet formula prefixes escaped. A readable preview lets users copy output when downloads are unavailable.

Validated scenarios persist locally where browser storage is available. The app works without storage. JSON imports are limited to 1 MB and validated before replacing data.
