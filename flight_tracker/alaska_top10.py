"""Merge alaska_full Google Flights data + Sun Country direct quotes
and emit a clean top-10 Alaska deals table."""
from __future__ import annotations

import json
from pathlib import Path

ALASKA = {"ANC": "Anchorage", "FAI": "Fairbanks", "JNU": "Juneau",
          "SIT": "Sitka", "KTN": "Ketchikan"}


def load_google():
    p = Path(__file__).parent / "results_alaska.json"
    if not p.exists():
        return []
    return json.loads(p.read_text())


def load_sc():
    p = Path(__file__).parent / "sun_country_quotes.json"
    if not p.exists():
        return []
    return json.loads(p.read_text())


def main():
    g = load_google()
    sc = load_sc()
    print(f"Loaded {len(g)} Google Flights options, {len(sc)} Sun Country quotes")

    # Build candidate list
    candidates = []

    # Google Flights options (already filtered to price>0)
    for r in g:
        candidates.append({
            "src": "Google Flights",
            "total": r["price_total"],
            "pp": r["price_per_pax"],
            "dest": r["dest"],
            "label": r["label"],
            "depart": r["depart"],
            "ret": r["ret"],
            "airline": r["airline"],
            "stops": r["stops"],
            "duration": r["duration"],
            "dep_time": r.get("departure", ""),
            "arr_time": r.get("arrival", ""),
        })

    # Sun Country quotes (estimated RT total = sum of two cheapest one-ways × pax)
    for r in sc:
        if not r.get("est_rt_total_2pax"):
            continue
        # Compute trip days from dates
        candidates.append({
            "src": "Sun Country direct",
            "total": r["est_rt_total_2pax"],
            "pp": r["est_rt_total_2pax"] // 2,
            "dest": "ANC",
            "label": r["label"],
            "depart": r["depart"],
            "ret": r["ret"],
            "airline": "Sun Country",
            "stops": 0,
            "duration": "~6 hr",
            "dep_time": "",
            "arr_time": "",
        })

    # Best per (dest, label) — take cheapest at each unique route+window
    best = {}
    for c in candidates:
        k = (c["dest"], c["label"])
        if k not in best or c["total"] < best[k]["total"]:
            best[k] = c
    sorted_best = sorted(best.values(), key=lambda x: x["total"])

    print("\n" + "=" * 130)
    print("TOP 15 ALASKA DEALS — MSP, 2 adults round-trip, 5+ days, weekend-spanning, no Sat Jul 4 fly")
    print("=" * 130)
    print(f"{'#':>3} {'TOTAL':>7s}  {'P/PAX':>6s}  {'DEST':4s}  {'AIRLINE':18s}  {'STOPS':>7s}  "
          f"{'DURATION':>11s}  {'DATES':38s}  SOURCE")
    print("-" * 130)
    for i, c in enumerate(sorted_best[:15], 1):
        stops = "nonstop" if c["stops"] == 0 else f"{c['stops']}-stop"
        print(f"{i:>3} ${c['total']:>5,}  ${c['pp']:>5,}  "
              f"{c['dest']:4s}  {c['airline'][:18]:18s}  {stops:>7s}  "
              f"{c['duration']:>11s}  {c['label']:38s}  {c['src']}")

    # Also: best per destination
    print("\n" + "=" * 100)
    print("BEST DEAL PER ALASKA DESTINATION")
    print("=" * 100)
    by_dest = {}
    for c in candidates:
        d = c["dest"]
        if d not in by_dest or c["total"] < by_dest[d]["total"]:
            by_dest[d] = c
    for d in ["ANC", "FAI", "JNU", "SIT", "KTN"]:
        c = by_dest.get(d)
        if not c:
            print(f"  {d} ({ALASKA[d]}): no data")
            continue
        stops = "nonstop" if c["stops"] == 0 else f"{c['stops']}-stop"
        print(f"  {d} {ALASKA[d]:10s}  ${c['total']:>5,} (${c['pp']:>4,}/pax)  "
              f"{c['airline']:20s}  {stops:>7s}  {c['duration']:>11s}  | {c['label']}  [{c['src']}]")


if __name__ == "__main__":
    main()
