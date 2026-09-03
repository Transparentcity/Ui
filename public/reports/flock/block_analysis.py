"""S6 block-level supplement (added after pre-registration; disclosed as such).

Compares SF motor-vehicle-theft trends on blocks near mapped SFPD Flock
cameras vs. blocks far from them, and builds a neighborhood before/after
table. Camera coordinates come from OpenStreetMap (crowdsourced by the
DeFlock project); incidents from SF's wg3w-h783.

Windows (matching the S2 convention around the 2024-04 ON event):
  before = 2023-04..2024-03 (12 months pre)
  after  = 2024-10..2026-06 (post, skipping the 6-month ramp)
Bands: near <= 250 m of a mapped camera; far >= 500 m from every camera.
"""
import json
import math
import time
from pathlib import Path

import requests

HERE = Path(__file__).parent
OUT = HERE / "snapshots"
UA = {"User-Agent": "TransparentCity-flock-report/0.1 (adam@planet10b.com)"}

BEFORE = ("2023-04", "2024-03")
AFTER = ("2024-10", "2026-06")


def fetch_cameras():
    q = ('[out:json][timeout:60];('
         'node["man_made"="surveillance"]["surveillance:type"="ALPR"]'
         '["operator"="San Francisco Police Department"](37.70,-122.52,37.84,-122.35);'
         'node["man_made"="surveillance"]["brand"="Flock Safety"](37.70,-122.52,37.84,-122.35);'
         ');out;')
    r = requests.post("https://overpass-api.de/api/interpreter",
                      data={"data": q}, headers=UA, timeout=90)
    r.raise_for_status()
    els = r.json()["elements"]
    seen = set()
    cams = []
    for e in els:
        key = (round(e["lat"], 6), round(e["lon"], 6))
        if key not in seen:
            seen.add(key)
            cams.append((e["lat"], e["lon"]))
    return cams


def fetch_incidents():
    rows = []
    offset = 0
    while True:
        r = requests.get(
            "https://data.sfgov.org/resource/wg3w-h783.json",
            params={
                "$select": "incident_date,latitude,longitude,analysis_neighborhood",
                "$where": ("incident_category='Motor Vehicle Theft' "
                           "AND incident_date >= '2022-01-01T00:00:00'"),
                "$limit": "50000", "$offset": str(offset), "$order": "incident_date",
            }, headers=UA, timeout=120)
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < 50000:
            break
        offset += 50000
        time.sleep(1)
    return rows


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def min_dist_m(lat, lon, cams, grid):
    """Nearest-camera distance using a coarse grid prefilter."""
    key = (round(lat, 2), round(lon, 2))
    best = float("inf")
    for dy in (-0.01, 0.0, 0.01):
        for dx in (-0.01, 0.0, 0.01):
            for (clat, clon) in grid.get((round(key[0] + dy, 2), round(key[1] + dx, 2)), ()):
                d = haversine_m(lat, lon, clat, clon)
                if d < best:
                    best = d
    if best is not float("inf"):
        return best
    for (clat, clon) in cams:
        d = haversine_m(lat, lon, clat, clon)
        if d < best:
            best = d
    return best


def in_window(month, w):
    return w[0] <= month <= w[1]


def main():
    cams = fetch_cameras()
    print(f"cameras: {len(cams)}")
    incidents = fetch_incidents()
    print(f"incidents: {len(incidents)}")

    grid = {}
    for (lat, lon) in cams:
        grid.setdefault((round(lat, 2), round(lon, 2)), []).append((lat, lon))

    months_before = 12
    months_after = 21  # 2024-10..2026-06
    near = {"before": 0, "after": 0}
    far = {"before": 0, "after": 0}
    mid = {"before": 0, "after": 0}
    nogeo = 0
    hood = {}
    near_monthly, far_monthly = {}, {}
    for row in incidents:
        month = row["incident_date"][:7]
        h = row.get("analysis_neighborhood")
        if h:
            hood.setdefault(h, {}).setdefault(month[:4], 0)
            hood[h][month[:4]] += 1
            hood[h].setdefault("_months", {})
        lat, lon = row.get("latitude"), row.get("longitude")
        w = "before" if in_window(month, BEFORE) else ("after" if in_window(month, AFTER) else None)
        if not lat or not lon:
            nogeo += 1
            continue
        d = min_dist_m(float(lat), float(lon), cams, grid)
        band = "near" if d <= 250 else ("far" if d >= 500 else "mid")
        if band == "near":
            near_monthly[month] = near_monthly.get(month, 0) + 1
        elif band == "far":
            far_monthly[month] = far_monthly.get(month, 0) + 1
        if w:
            {"near": near, "far": far, "mid": mid}[band][w] += 1

    res = {
        "method_note": ("Post-registration supplement S6. Camera coordinates from "
                        "OpenStreetMap (DeFlock project), retrieved with the run; "
                        f"{len(cams)} mapped SFPD/Flock ALPR nodes, roughly 71% of the "
                        "400-camera network. Near = within 250 m of a mapped camera; "
                        "far = 500 m or more from every mapped camera."),
        "windows": {"before": BEFORE, "after": AFTER},
        "cameras": len(cams),
        "incidents_no_geo": nogeo,
        "near": {**near, "monthly_rate_before": round(near["before"] / months_before, 1),
                 "monthly_rate_after": round(near["after"] / months_after, 1),
                 "pct": round((near["after"] / months_after) / (near["before"] / months_before) * 100 - 100, 1)},
        "far": {**far, "monthly_rate_before": round(far["before"] / months_before, 1),
                "monthly_rate_after": round(far["after"] / months_after, 1),
                "pct": round((far["after"] / months_after) / (far["before"] / months_before) * 100 - 100, 1)},
        "mid": mid,
        "near_monthly": near_monthly,
        "far_monthly": far_monthly,
        "neighborhood_by_year": {h: {y: c for y, c in ys.items() if y != "_months"}
                                 for h, ys in hood.items()},
    }
    (OUT / "block_supplement.json").write_text(json.dumps(res, indent=1))
    print(json.dumps({k: res[k] for k in ("cameras", "near", "far")}, indent=1))
    print("wrote", OUT / "block_supplement.json")


if __name__ == "__main__":
    main()
