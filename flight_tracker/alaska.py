"""Alaska-only deep dive: every queried date window for ANC/FAI/JNU/SIT."""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from .main_big import DEST_LABELS, ADULTS

ALASKA = {"ANC": "Anchorage", "FAI": "Fairbanks", "JNU": "Juneau", "SIT": "Sitka"}


def load():
    return json.loads((Path(__file__).parent / "results_big.json").read_text())


def main():
    data = load()
    ak = [r for r in data if r["dest"] in ALASKA]

    # Build flat rows
    rows = []
    for r in ak:
        for q in r["quotes"]:
            if q["price_total"]:
                rows.append({
                    "dest": r["dest"], "label": r["label"],
                    "depart": r["depart"], "ret": r["ret"], **q,
                })

    print(f"\n{'='*125}")
    print(f"ALASKA ONLY — {len(ak)} queries, {len(rows)} flight options, 2 adults RT total USD")
    print(f"{'='*125}")

    # ----- For each destination: full price grid by window -----
    for dest, name in ALASKA.items():
        dest_rows = [r for r in rows if r["dest"] == dest]
        if not dest_rows:
            print(f"\n{dest} — {name}: NO DATA")
            continue
        print(f"\n### {dest} — {name} ###")
        # cheapest per window (any airline)
        per_window_any = {}
        per_window_delta = {}
        per_window_nonstop = {}
        for r in dest_rows:
            w = r["label"]
            if w not in per_window_any or r["price_total"] < per_window_any[w]["price_total"]:
                per_window_any[w] = r
            if r["airline"].lower().startswith("delta"):
                if w not in per_window_delta or r["price_total"] < per_window_delta[w]["price_total"]:
                    per_window_delta[w] = r
            if r["stops"] == 0:
                if w not in per_window_nonstop or r["price_total"] < per_window_nonstop[w]["price_total"]:
                    per_window_nonstop[w] = r

        # Print grid sorted by depart date
        all_windows = sorted(per_window_any.keys(),
                             key=lambda w: per_window_any[w]["depart"])
        print(f"  {'WINDOW':40s}  {'CHEAPEST':>22s}    {'DELTA':>22s}    {'NONSTOP':>22s}")
        print(f"  {'-'*40}  {'-'*22}    {'-'*22}    {'-'*22}")
        for w in all_windows:
            any_r = per_window_any[w]
            d_r = per_window_delta.get(w)
            ns_r = per_window_nonstop.get(w)
            def fmt(r):
                if not r:
                    return "—"
                stops = "ns" if r["stops"] == 0 else f"{r['stops']}s"
                return f"${r['price_total']:>5,} {r['airline'][:10]:10s} {stops:>2s}"
            print(f"  {w:40s}  {fmt(any_r):>22s}    {fmt(d_r):>22s}    {fmt(ns_r):>22s}")

    # ----- Top 15 absolute cheapest Alaska deals -----
    print(f"\n{'='*125}")
    print(f"### TOP 15 CHEAPEST ALASKA DEALS OVERALL ###")
    print(f"{'='*125}")
    rows.sort(key=lambda r: r["price_total"])
    seen = set()
    shown = 0
    for r in rows:
        key = (r["dest"], r["label"])
        if key in seen:
            continue
        seen.add(key)
        stops = "nonstop" if r["stops"] == 0 else f"{r['stops']}-stop"
        print(f"  ${r['price_total']:>5,} (${r['price_per_pax']:>4,}/pax)  "
              f"{r['dest']:3s} {ALASKA[r['dest']]:10s}  {r['label']:42s}  "
              f"{stops:>8s}  {r['airline'][:18]:18s}  {r['duration']}")
        shown += 1
        if shown >= 15:
            break

    # ----- Top 10 nonstop Alaska deals -----
    print(f"\n{'='*125}")
    print(f"### NONSTOP ALASKA OPTIONS (sorted by price) ###")
    print(f"{'='*125}")
    nonstop = sorted([r for r in rows if r["stops"] == 0], key=lambda r: r["price_total"])
    seen = set()
    for r in nonstop:
        key = (r["dest"], r["label"])
        if key in seen:
            continue
        seen.add(key)
        print(f"  ${r['price_total']:>5,} (${r['price_per_pax']:>4,}/pax)  "
              f"{r['dest']:3s} {ALASKA[r['dest']]:10s}  {r['label']:42s}  "
              f"{r['airline'][:20]:20s}  {r['duration']}")

    # ----- Best Delta nonstop Alaska -----
    print(f"\n{'='*125}")
    print(f"### BEST DELTA NONSTOP ALASKA (cheapest per window) ###")
    print(f"{'='*125}")
    delta_ns = [r for r in rows if r["airline"].lower().startswith("delta") and r["stops"] == 0]
    delta_ns.sort(key=lambda r: r["price_total"])
    seen = set()
    for r in delta_ns:
        key = (r["dest"], r["label"])
        if key in seen:
            continue
        seen.add(key)
        print(f"  ${r['price_total']:>5,} (${r['price_per_pax']:>4,}/pax)  "
              f"{r['dest']:3s} {ALASKA[r['dest']]:10s}  {r['label']:42s}  {r['duration']}")


if __name__ == "__main__":
    main()
