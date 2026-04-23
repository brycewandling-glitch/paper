"""Analyze big results: cheapest by region, Europe-specific, Delta-specific, nonstop-only."""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from .main_big import DEST_LABELS, EUROPE_DESTS, ADULTS

REGIONS = {
    "ANC": "Alaska", "FAI": "Alaska", "JNU": "Alaska", "SIT": "Alaska",
    "FCA": "Mtn West", "BZN": "Mtn West", "JAC": "Mtn West", "MSO": "Mtn West",
    "COD": "Mtn West", "BIL": "Mtn West", "RAP": "Mtn West",
    "DEN": "Rockies", "EGE": "Rockies", "GJT": "Rockies", "SLC": "Rockies", "BOI": "Rockies",
    "SEA": "Pacific NW", "PDX": "Pacific NW", "YVR": "Pacific NW", "YYC": "Pacific NW", "GEG": "Pacific NW",
    "PWM": "Northeast", "BGR": "Northeast", "BTV": "Northeast", "BOS": "Northeast",
    "DLH": "Midwest", "TVC": "Midwest",
    "KEF": "Europe", "CPH": "Europe", "DUB": "Europe", "EDI": "Europe", "LIS": "Europe",
    "AVL": "South", "SRQ": "South", "ILM": "South",
}


def load():
    return json.loads((Path(__file__).parent / "results_big.json").read_text())


def flatten(data):
    rows = []
    for r in data:
        for q in r["quotes"]:
            if q["price_total"] is None or q["price_total"] == 0:
                continue
            rows.append({
                "dest": r["dest"],
                "label": r["label"],
                "depart": r["depart"],
                "ret": r["ret"],
                **q,
            })
    return rows


def best_per(rows, key_fn, score_fn=lambda r: r["price_total"]):
    best = {}
    for r in rows:
        k = key_fn(r)
        if k not in best or score_fn(r) < score_fn(best[k]):
            best[k] = r
    return list(best.values())


def fmt_row(r, show_dates=True, show_airline=True):
    stops = "nonstop" if r["stops"] == 0 else f"{r['stops']}-stop"
    region = REGIONS.get(r["dest"], "?")
    parts = [
        f"${r['price_total']:>5,}",
        f"(${r['price_per_pax']:>4,}/pax)",
        f"{r['dest']:3s}",
        f"{DEST_LABELS.get(r['dest'], r['dest'])[:30]:30s}",
    ]
    if show_dates:
        parts.append(f"{r['label']:42s}")
    parts.append(f"{stops:>8s}")
    if show_airline:
        parts.append(f"{r['airline'][:22]:22s}")
    parts.append(f"{r['duration']:>11s}")
    return "  ".join(parts)


def main():
    data = load()
    rows = flatten(data)
    if not rows:
        print("No data yet — search probably still running")
        return

    print(f"\n{'='*150}")
    print(f"DATASET: {len(data)} queries, {len(rows)} flight options, {ADULTS} adults RT")
    print(f"{'='*150}")

    # 1) Top 25 cheapest deals overall (any airline, any stops)
    print(f"\n### TOP 25 CHEAPEST OVERALL ({ADULTS} adults RT) ###")
    overall = sorted(rows, key=lambda r: r["price_total"])[:25]
    for r in overall:
        print(f"  {fmt_row(r)}")

    # 2) Cheapest NONSTOP per dest+window
    nonstop = [r for r in rows if r["stops"] == 0]
    best_ns = best_per(nonstop, lambda r: (r["dest"], r["label"]))
    best_ns.sort(key=lambda r: r["price_total"])
    print(f"\n### TOP 30 CHEAPEST NONSTOP DEALS ({ADULTS} adults RT, any airline) ###")
    for r in best_ns[:30]:
        print(f"  {fmt_row(r)}")

    # 3) Cheapest DELTA option per dest+window (prefer nonstop)
    delta = [r for r in rows if r["airline"].lower().startswith("delta")]
    best_delta = best_per(delta, lambda r: (r["dest"], r["label"]),
                          score_fn=lambda r: (0 if r["stops"] == 0 else 1, r["price_total"]))
    best_delta.sort(key=lambda r: r["price_total"])
    print(f"\n### TOP 25 CHEAPEST DELTA DEALS ({ADULTS} adults RT, nonstop preferred) ###")
    for r in best_delta[:25]:
        print(f"  {fmt_row(r)}")

    # 4) EUROPE specific
    eur = [r for r in rows if r["dest"] in EUROPE_DESTS]
    best_eur = best_per(eur, lambda r: (r["dest"], r["label"]))
    best_eur.sort(key=lambda r: r["price_total"])
    print(f"\n### TOP 20 CHEAPEST EUROPE DEALS ({ADULTS} adults RT) ###")
    for r in best_eur[:20]:
        print(f"  {fmt_row(r)}")

    # 5) Cheapest by REGION (best dest+date per region)
    print(f"\n### CHEAPEST OPTION PER REGION (any airline) ###")
    by_region = defaultdict(list)
    for r in rows:
        by_region[REGIONS.get(r["dest"], "?")].append(r)
    for region, lst in sorted(by_region.items()):
        cheapest = min(lst, key=lambda r: r["price_total"])
        print(f"  [{region:10s}]  {fmt_row(cheapest)}")

    # 6) For each top destination, the 3 cheapest date windows
    print(f"\n### TOP 3 DATE WINDOWS PER ALASKA/MTN-WEST/EUROPE DESTINATION ###")
    spotlight = ["ANC", "FAI", "JNU", "SIT", "FCA", "BZN", "JAC", "MSO", "DEN",
                 "YYC", "YVR", "PWM", "BGR", "KEF", "CPH", "DUB", "EDI", "LIS"]
    for d in spotlight:
        dest_rows = [r for r in rows if r["dest"] == d]
        if not dest_rows:
            continue
        # cheapest per window
        per_w = best_per(dest_rows, lambda r: r["label"])
        per_w.sort(key=lambda r: r["price_total"])
        print(f"\n  {d} — {DEST_LABELS.get(d, d)}:")
        for r in per_w[:3]:
            stops = "nonstop" if r["stops"] == 0 else f"{r['stops']}-stop"
            print(f"    ${r['price_total']:>5,} ({r['airline'][:20]}, {stops}, {r['duration']}) — {r['label']}")

    # 7) Failed queries summary
    failed = [r for r in data if not r["quotes"]]
    if failed:
        print(f"\n### {len(failed)} QUERIES RETURNED NO DATA (route may not exist or rate-limited) ###")
        for r in failed[:20]:
            print(f"  MSP→{r['dest']:3s}  {r['label']}")


if __name__ == "__main__":
    main()
