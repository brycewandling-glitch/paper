"""Run a BIG broad flight search. ~30 destinations × ~7 date windows = ~200 queries."""
from __future__ import annotations

import asyncio
import json
import os
import random
import sys
import time
from pathlib import Path

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")

from playwright.async_api import async_playwright
from fast_flights.filter import TFSData
from fast_flights.flights_impl import FlightData, Passengers
from fast_flights.core import parse_response

from .search import CHROME_BIN, UA, _parse_price

ORIGIN = "MSP"
ADULTS = 2

# (IATA, friendly label)
DESTINATIONS = [
    # Alaska
    ("ANC", "Anchorage, AK"),
    ("FAI", "Fairbanks, AK"),
    ("JNU", "Juneau, AK"),
    ("SIT", "Sitka, AK"),
    # Mountain West
    ("FCA", "Kalispell / Glacier NP"),
    ("BZN", "Bozeman / Yellowstone N"),
    ("JAC", "Jackson Hole, WY"),
    ("MSO", "Missoula, MT"),
    ("COD", "Cody, WY (Yellowstone E)"),
    ("BIL", "Billings, MT"),
    ("RAP", "Rapid City / Black Hills"),
    # Rockies / Desert
    ("DEN", "Denver / Rocky Mtn NP"),
    ("EGE", "Vail / Beaver Creek"),
    ("GJT", "Grand Junction / Moab"),
    ("SLC", "Salt Lake / Utah parks"),
    ("BOI", "Boise, ID"),
    # Pacific NW + Canada West
    ("SEA", "Seattle, WA"),
    ("PDX", "Portland, OR"),
    ("YVR", "Vancouver, BC"),
    ("YYC", "Calgary / Banff"),
    ("GEG", "Spokane, WA"),
    # Northeast / Atlantic
    ("PWM", "Portland, ME / Acadia"),
    ("BGR", "Bangor, ME / Acadia"),
    ("BTV", "Burlington, VT"),
    ("BOS", "Boston, MA"),
    # Northern Midwest scenic
    ("DLH", "Duluth / N Shore Superior"),
    ("TVC", "Traverse City, MI"),
    # International (cool weather, summer-cool)
    ("KEF", "Reykjavik, Iceland"),
    ("CPH", "Copenhagen, Denmark"),
    ("DUB", "Dublin, Ireland"),
    ("EDI", "Edinburgh, Scotland"),
    ("LIS", "Lisbon, Portugal"),
]

# Date windows — all 4+ days, never flying Sat Jul 4
# (depart, return, label)
WINDOWS = [
    # Pre-4th
    ("2026-06-25", "2026-06-29", "Thu Jun 25 → Mon Jun 29 (5d)"),
    ("2026-06-28", "2026-07-02", "Sun Jun 28 → Thu Jul 2 (5d)"),
    # Over the 4th, no Sat Jul 4 travel
    ("2026-07-01", "2026-07-07", "Wed Jul 1 → Tue Jul 7 (6d)"),
    ("2026-07-02", "2026-07-08", "Thu Jul 2 → Wed Jul 8 (6d)"),
    ("2026-07-03", "2026-07-08", "Fri Jul 3 → Wed Jul 8 (5d)"),
    # Post-4th
    ("2026-07-08", "2026-07-12", "Wed Jul 8 → Sun Jul 12 (4d)"),
    ("2026-07-15", "2026-07-19", "Wed Jul 15 → Sun Jul 19 (4d)"),
    # Late July
    ("2026-07-22", "2026-07-26", "Wed Jul 22 → Sun Jul 26 (4d)"),
    # August (often cheapest summer)
    ("2026-08-05", "2026-08-09", "Wed Aug 5 → Sun Aug 9 (4d)"),
    ("2026-08-12", "2026-08-16", "Wed Aug 12 → Sun Aug 16 (4d)"),
    ("2026-08-19", "2026-08-23", "Wed Aug 19 → Sun Aug 23 (4d)"),
    ("2026-08-26", "2026-08-30", "Wed Aug 26 → Sun Aug 30 (4d)"),
]
# Special Saturday-only destinations also get Sat-Sat windows
SAT_SAT_EXTRA = [
    ("2026-06-20", "2026-06-27", "Sat Jun 20 → Sat Jun 27 (7d)"),
    ("2026-07-11", "2026-07-18", "Sat Jul 11 → Sat Jul 18 (7d)"),
    ("2026-08-15", "2026-08-22", "Sat Aug 15 → Sat Aug 22 (7d)"),
]

# Europe-specific long-trip windows (7+ days, never flying Sat Jul 4)
EUROPE_LONG = [
    ("2026-06-19", "2026-06-28", "Fri Jun 19 → Sun Jun 28 (9d)"),
    ("2026-06-25", "2026-07-03", "Thu Jun 25 → Fri Jul 3 (8d)"),
    ("2026-06-26", "2026-07-05", "Fri Jun 26 → Sun Jul 5 (9d, over 4th)"),
    ("2026-07-02", "2026-07-12", "Thu Jul 2 → Sun Jul 12 (10d, over 4th)"),
    ("2026-07-10", "2026-07-19", "Fri Jul 10 → Sun Jul 19 (9d)"),
    ("2026-07-17", "2026-07-26", "Fri Jul 17 → Sun Jul 26 (9d)"),
    ("2026-08-07", "2026-08-16", "Fri Aug 7 → Sun Aug 16 (9d)"),
    ("2026-08-14", "2026-08-23", "Fri Aug 14 → Sun Aug 23 (9d)"),
    ("2026-08-21", "2026-08-30", "Fri Aug 21 → Sun Aug 30 (9d)"),
]
EUROPE_DESTS = {"KEF", "CPH", "DUB", "EDI", "LIS"}

# Build query list
QUERIES: list[tuple[str, str, str, str]] = []
for iata, _ in DESTINATIONS:
    for dep, ret, lab in WINDOWS:
        QUERIES.append((iata, dep, ret, lab))
    if iata in EUROPE_DESTS:
        for dep, ret, lab in EUROPE_LONG:
            QUERIES.append((iata, dep, ret, lab))
# Saturday-only Delta routes get Sat-Sat too
for iata in ("JAC", "AVL", "SRQ", "ILM"):
    for dep, ret, lab in SAT_SAT_EXTRA:
        QUERIES.append((iata, dep, ret, lab))

DEST_LABELS = {iata: label for iata, label in DESTINATIONS}
DEST_LABELS.update({"AVL": "Asheville, NC", "SRQ": "Sarasota, FL", "ILM": "Wilmington, NC"})


async def fetch_one(p, dest: str, depart: str, ret: str, attempt: int = 1) -> str:
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
        await page.goto(url, wait_until="load", timeout=60000)
        await asyncio.sleep(6 + random.uniform(0, 1.5))
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


async def run_query(sem, p, dest, depart, ret, label, idx, total):
    async with sem:
        for attempt in range(1, 3):
            t0 = time.time()
            try:
                body = await fetch_one(p, dest, depart, ret, attempt)
                quotes = parse(body)
                elapsed = time.time() - t0
                tag = " " if quotes else "∅"
                print(f"  [{idx:3d}/{total}] {tag} {ORIGIN}→{dest:3s} {label:38s} {len(quotes):3d} flights ({elapsed:.0f}s)",
                      file=sys.stderr)
                if quotes or attempt == 2:
                    return {"dest": dest, "depart": depart, "ret": ret, "label": label, "quotes": quotes}
                await asyncio.sleep(2 + random.uniform(0, 2))
            except Exception as e:
                elapsed = time.time() - t0
                print(f"  [{idx:3d}/{total}] ✗ {ORIGIN}→{dest:3s} {label:38s} ERR: {type(e).__name__} ({elapsed:.0f}s)",
                      file=sys.stderr)
                if attempt == 2:
                    return {"dest": dest, "depart": depart, "ret": ret, "label": label,
                            "quotes": [], "error": str(e)[:200]}
                await asyncio.sleep(3)


async def main():
    total = len(QUERIES)
    print(f"BIG search: {total} queries ({len(DESTINATIONS)+3} destinations × ~{total//(len(DESTINATIONS)+3)} windows), {ADULTS} adults",
          file=sys.stderr)
    print(f"Estimated runtime at concurrency 4: ~{total * 11 / 4 / 60:.0f} min", file=sys.stderr)

    sem = asyncio.Semaphore(5)
    async with async_playwright() as p:
        tasks = [run_query(sem, p, dest, dep, ret, lab, i+1, total)
                 for i, (dest, dep, ret, lab) in enumerate(QUERIES)]
        results = await asyncio.gather(*tasks)

    out_path = Path(__file__).parent / "results_big.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nWrote {out_path} ({len(results)} entries)", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
