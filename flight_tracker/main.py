"""Run a broad flight search and print results sorted by total price."""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
from dataclasses import asdict
from pathlib import Path

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")

from playwright.async_api import async_playwright
from fast_flights.filter import TFSData
from fast_flights.flights_impl import FlightData, Passengers
from fast_flights.core import parse_response

from .search import CHROME_BIN, UA, Quote, _parse_price
from .routes import ORIGIN, ADULTS, DESTINATIONS

# Queries: list of (dest_iata, depart, ret, window_label)
QUERIES: list[tuple[str, str, str, str]] = []

def add(dest, depart, ret, label):
    QUERIES.append((dest, depart, ret, label))

# Alaska (priority)
for d in ["2026-06-25:2026-06-29:Thu Jun 25 → Mon Jun 29",
          "2026-07-01:2026-07-07:Wed Jul 1 → Tue Jul 7",
          "2026-07-02:2026-07-08:Thu Jul 2 → Wed Jul 8",
          "2026-08-19:2026-08-23:Wed Aug 19 → Sun Aug 23"]:
    dep, ret, lab = d.split(":")
    add("ANC", dep, ret, lab)
for d in ["2026-06-25:2026-06-29:Thu Jun 25 → Mon Jun 29",
          "2026-07-02:2026-07-08:Thu Jul 2 → Wed Jul 8"]:
    dep, ret, lab = d.split(":")
    add("JNU", dep, ret, lab)
for d in ["2026-07-02:2026-07-08:Thu Jul 2 → Wed Jul 8",
          "2026-08-12:2026-08-16:Wed Aug 12 → Sun Aug 16"]:
    dep, ret, lab = d.split(":")
    add("FAI", dep, ret, lab)

# Mountain West
for d in ["2026-06-25:2026-06-29:Thu Jun 25 → Mon Jun 29",
          "2026-06-27:2026-07-01:Sat Jun 27 → Wed Jul 1",
          "2026-07-02:2026-07-07:Thu Jul 2 → Tue Jul 7",
          "2026-08-12:2026-08-16:Wed Aug 12 → Sun Aug 16"]:
    dep, ret, lab = d.split(":")
    add("FCA", dep, ret, lab)
for d in ["2026-07-02:2026-07-07:Thu Jul 2 → Tue Jul 7",
          "2026-08-12:2026-08-16:Wed Aug 12 → Sun Aug 16"]:
    dep, ret, lab = d.split(":")
    add("BZN", dep, ret, lab)
# JAC: Delta's new Sat-only nonstop → Sat-to-Sat works best
for d in ["2026-06-20:2026-06-27:Sat Jun 20 → Sat Jun 27",
          "2026-07-11:2026-07-18:Sat Jul 11 → Sat Jul 18"]:
    dep, ret, lab = d.split(":")
    add("JAC", dep, ret, lab)
for d in ["2026-07-02:2026-07-07:Thu Jul 2 → Tue Jul 7"]:
    dep, ret, lab = d.split(":")
    add("MSO", dep, ret, lab)

# Pacific NW / Canada
for d in ["2026-07-02:2026-07-07:Thu Jul 2 → Tue Jul 7",
          "2026-07-08:2026-07-12:Wed Jul 8 → Sun Jul 12"]:
    dep, ret, lab = d.split(":")
    add("SEA", dep, ret, lab)
for d in ["2026-07-02:2026-07-08:Thu Jul 2 → Wed Jul 8",
          "2026-08-12:2026-08-16:Wed Aug 12 → Sun Aug 16"]:
    dep, ret, lab = d.split(":")
    add("YYC", dep, ret, lab)

# Rockies + Northeast + International
add("DEN", "2026-07-02", "2026-07-07", "Thu Jul 2 → Tue Jul 7")
add("PWM", "2026-07-02", "2026-07-08", "Thu Jul 2 → Wed Jul 8")
add("KEF", "2026-07-02", "2026-07-08", "Thu Jul 2 → Wed Jul 8")
add("KEF", "2026-08-20", "2026-08-25", "Thu Aug 20 → Tue Aug 25")
add("CPH", "2026-07-02", "2026-07-08", "Thu Jul 2 → Wed Jul 8")
add("CPH", "2026-08-20", "2026-08-25", "Thu Aug 20 → Tue Aug 25")


DEST_LABELS = {iata: label for iata, label, _ in DESTINATIONS}


async def fetch_one(p, dest: str, depart: str, ret: str) -> str:
    filt = TFSData.from_interface(
        flight_data=[
            FlightData(date=depart, from_airport=ORIGIN, to_airport=dest),
            FlightData(date=ret, from_airport=dest, to_airport=ORIGIN),
        ],
        trip="round-trip",
        seat="economy",
        passengers=Passengers(adults=ADULTS, children=0, infants_in_seat=0, infants_on_lap=0),
    )
    b64 = filt.as_b64().decode()
    url = f"https://www.google.com/travel/flights?tfs={b64}&hl=en&tfu=EgQIABABIgA&curr=USD"

    browser = await p.chromium.launch(
        executable_path=CHROME_BIN,
        headless=True,
        args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    )
    try:
        ctx = await browser.new_context(
            ignore_https_errors=True, locale="en-US", user_agent=UA,
            viewport={"width": 1280, "height": 900},
        )
        await ctx.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        page = await ctx.new_page()
        await page.goto(url, wait_until="load", timeout=45000)
        await asyncio.sleep(6)
        return await page.content()
    finally:
        await browser.close()


def parse(body: str) -> list[dict]:
    class _Resp:
        status_code = 200
        text = body
        text_markdown = body
    try:
        res = parse_response(_Resp())
    except RuntimeError:
        return []
    out = []
    for f in res.flights:
        total = _parse_price(f.price)
        out.append({
            "airline": f.name or "?",
            "stops": f.stops,
            "duration": f.duration or "",
            "price_total": total,
            "price_per_pax": (total // ADULTS) if total else None,
            "nonstop": f.stops == 0,
            "departure": f.departure,
            "arrival": f.arrival,
        })
    return out


async def run_query(sem, p, dest, depart, ret, label):
    async with sem:
        t0 = time.time()
        try:
            body = await fetch_one(p, dest, depart, ret)
            quotes = parse(body)
            elapsed = time.time() - t0
            print(f"  ✓ {ORIGIN}→{dest:3s} {label:38s} {len(quotes):2d} flights  ({elapsed:.1f}s)",
                  file=sys.stderr)
            return {"dest": dest, "depart": depart, "ret": ret, "label": label,
                    "quotes": quotes}
        except Exception as e:
            elapsed = time.time() - t0
            print(f"  ✗ {ORIGIN}→{dest:3s} {label:38s} ERR: {type(e).__name__}: {str(e)[:80]}  ({elapsed:.1f}s)",
                  file=sys.stderr)
            return {"dest": dest, "depart": depart, "ret": ret, "label": label,
                    "quotes": [], "error": str(e)[:200]}


async def main():
    print(f"Querying {len(QUERIES)} route/date combos for {ADULTS} adults...", file=sys.stderr)
    sem = asyncio.Semaphore(3)
    async with async_playwright() as p:
        tasks = [run_query(sem, p, dest, depart, ret, label)
                 for dest, depart, ret, label in QUERIES]
        results = await asyncio.gather(*tasks)

    out_path = Path(__file__).parent / "results.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nWrote {out_path}", file=sys.stderr)

    # Flatten: one row per quote
    rows = []
    for r in results:
        for q in r["quotes"]:
            if q["price_total"] is None:
                continue
            rows.append({
                "dest": r["dest"],
                "dest_label": DEST_LABELS.get(r["dest"], r["dest"]),
                "label": r["label"],
                **q,
            })

    # Print: cheapest option per (dest, window)
    print("\n" + "="*110)
    print(f"CHEAPEST OPTION PER ROUTE/WINDOW  ({ADULTS} adults, round-trip total USD)")
    print("="*110)
    best = {}
    for r in rows:
        key = (r["dest"], r["label"])
        if key not in best or r["price_total"] < best[key]["price_total"]:
            best[key] = r
    sorted_best = sorted(best.values(), key=lambda x: x["price_total"])
    print(f"{'TOTAL':>7s}  {'PP':>6s}  {'DEST':4s} {'DESTINATION':30s}  {'DATES':38s}  {'STOPS':>5s}  {'AIRLINE':25s}")
    print("-"*110)
    for r in sorted_best:
        stops = "nonstop" if r["stops"] == 0 else f"{r['stops']} stop"
        print(f"${r['price_total']:>5,}  ${r['price_per_pax']:>4,}  {r['dest']:4s} {r['dest_label'][:30]:30s}  "
              f"{r['label']:38s}  {stops:>7s}  {r['airline'][:25]:25s}")

    # Top 10 deals with Delta preference
    print("\n" + "="*110)
    print("TOP 15 DEALS (cheapest overall)")
    print("="*110)
    for r in sorted_best[:15]:
        stops = "nonstop" if r["stops"] == 0 else f"{r['stops']}-stop"
        print(f"  ${r['price_total']:,} total (${r['price_per_pax']:,}/pax)  •  {r['dest_label']}  •  "
              f"{r['label']}  •  {r['airline']}  •  {stops}  •  {r['duration']}")


if __name__ == "__main__":
    asyncio.run(main())
