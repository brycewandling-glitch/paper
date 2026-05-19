"""Re-query failed combos and surface Delta-specific options alongside overall cheapest."""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")

from playwright.async_api import async_playwright

from .main import fetch_one, parse, DEST_LABELS, ADULTS, ORIGIN

RESULTS = Path(__file__).parent / "results.json"


async def retry_missing():
    data = json.loads(RESULTS.read_text())
    to_retry = [(r["dest"], r["depart"], r["ret"], r["label"])
                for r in data if not r["quotes"]]
    if not to_retry:
        return data
    print(f"Retrying {len(to_retry)} failed queries...", file=sys.stderr)
    async with async_playwright() as p:
        for dest, dep, ret, lab in to_retry:
            try:
                body = await fetch_one(p, dest, dep, ret)
                q = parse(body)
                for r in data:
                    if r["dest"] == dest and r["depart"] == dep and r["ret"] == ret:
                        r["quotes"] = q
                        break
                print(f"  ✓ {dest} {lab}: {len(q)} flights", file=sys.stderr)
            except Exception as e:
                print(f"  ✗ {dest} {lab}: {e}", file=sys.stderr)
    RESULTS.write_text(json.dumps(data, indent=2))
    return data


def report(data):
    rows = []
    for r in data:
        for q in r["quotes"]:
            if q["price_total"] is None:
                continue
            rows.append({
                "dest": r["dest"],
                "dest_label": DEST_LABELS.get(r["dest"], r["dest"]),
                "label": r["label"],
                **q,
            })

    # Best Delta option per (dest, window) — nonstop preferred
    delta_rows = [r for r in rows if r["airline"].lower().startswith("delta")]
    best_delta = {}
    for r in delta_rows:
        key = (r["dest"], r["label"])
        cur = best_delta.get(key)
        # sort: prefer nonstop, then price
        score = (0 if r["stops"] == 0 else 1, r["price_total"])
        if cur is None or score < (0 if cur["stops"] == 0 else 1, cur["price_total"]):
            best_delta[key] = r

    # Overall cheapest per (dest, window)
    best_any = {}
    for r in rows:
        key = (r["dest"], r["label"])
        if key not in best_any or r["price_total"] < best_any[key]["price_total"]:
            best_any[key] = r

    print("\n" + "="*120)
    print(f"BEST DELTA OPTION PER ROUTE/WINDOW  ({ADULTS} adults round-trip, nonstop preferred)")
    print("="*120)
    delta_sorted = sorted(best_delta.values(), key=lambda x: x["price_total"])
    print(f"{'TOTAL':>7s}  {'PP':>6s}  {'DEST':4s} {'DESTINATION':28s}  {'DATES':38s}  {'STOPS':>7s}  {'DURATION':>12s}")
    print("-"*120)
    for r in delta_sorted:
        stops = "nonstop" if r["stops"] == 0 else f"{r['stops']} stop"
        print(f"${r['price_total']:>5,}  ${r['price_per_pax']:>4,}  {r['dest']:4s} {r['dest_label'][:28]:28s}  "
              f"{r['label']:38s}  {stops:>7s}  {r['duration']:>12s}")

    print("\n" + "="*120)
    print(f"CHEAPEST (ANY AIRLINE) PER ROUTE/WINDOW  ({ADULTS} adults round-trip)")
    print("="*120)
    any_sorted = sorted(best_any.values(), key=lambda x: x["price_total"])
    print(f"{'TOTAL':>7s}  {'PP':>6s}  {'DEST':4s} {'DESTINATION':28s}  {'DATES':38s}  {'STOPS':>7s}  {'AIRLINE':22s}")
    print("-"*120)
    for r in any_sorted:
        stops = "nonstop" if r["stops"] == 0 else f"{r['stops']} stop"
        print(f"${r['price_total']:>5,}  ${r['price_per_pax']:>4,}  {r['dest']:4s} {r['dest_label'][:28]:28s}  "
              f"{r['label']:38s}  {stops:>7s}  {r['airline'][:22]:22s}")


async def main():
    data = await retry_missing()
    report(data)


if __name__ == "__main__":
    asyncio.run(main())
