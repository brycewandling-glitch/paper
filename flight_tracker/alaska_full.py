"""Comprehensive Alaska search — 5+ day trips spanning a weekend, no Sat Jul 4 flying.

Queries Google Flights for ANC/FAI/JNU/SIT/KTN across ~25 date windows.
Sun Country fares fetched separately via sun_country.py since Google labels
their prices unavailable.
"""
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

ALASKA_DESTS = {
    "ANC": "Anchorage",
    "FAI": "Fairbanks",
    "JNU": "Juneau",
    "SIT": "Sitka",
    "KTN": "Ketchikan",
}

# 5+ day trips spanning a weekend (≥1 Sat-Sun pair), no Sat Jul 4 fly
WINDOWS = [
    # Pre-July 4 (clean of holiday surge)
    ("2026-06-17", "2026-06-22", "Wed Jun 17 → Mon Jun 22 (6d)"),
    ("2026-06-18", "2026-06-23", "Thu Jun 18 → Tue Jun 23 (6d)"),
    ("2026-06-19", "2026-06-24", "Fri Jun 19 → Wed Jun 24 (6d)"),
    ("2026-06-24", "2026-06-29", "Wed Jun 24 → Mon Jun 29 (6d)"),
    ("2026-06-25", "2026-06-30", "Thu Jun 25 → Tue Jun 30 (6d)"),
    ("2026-06-26", "2026-06-30", "Fri Jun 26 → Tue Jun 30 (5d)"),
    ("2026-06-26", "2026-07-01", "Fri Jun 26 → Wed Jul 1 (6d)"),
    # Over July 4 — Jul 4 is Sat, no flying that day
    ("2026-07-01", "2026-07-05", "Wed Jul 1 → Sun Jul 5 (5d, over 4th)"),
    ("2026-07-01", "2026-07-06", "Wed Jul 1 → Mon Jul 6 (6d, over 4th)"),
    ("2026-07-01", "2026-07-07", "Wed Jul 1 → Tue Jul 7 (7d, over 4th)"),
    ("2026-07-02", "2026-07-06", "Thu Jul 2 → Mon Jul 6 (5d, over 4th)"),
    ("2026-07-02", "2026-07-07", "Thu Jul 2 → Tue Jul 7 (6d, over 4th)"),
    ("2026-07-02", "2026-07-08", "Thu Jul 2 → Wed Jul 8 (7d, over 4th)"),
    ("2026-07-03", "2026-07-08", "Fri Jul 3 → Wed Jul 8 (6d, over 4th)"),
    ("2026-07-03", "2026-07-09", "Fri Jul 3 → Thu Jul 9 (7d, over 4th)"),
    # Post-July 4
    ("2026-07-08", "2026-07-13", "Wed Jul 8 → Mon Jul 13 (6d)"),
    ("2026-07-15", "2026-07-20", "Wed Jul 15 → Mon Jul 20 (6d)"),
    ("2026-07-22", "2026-07-27", "Wed Jul 22 → Mon Jul 27 (6d)"),
    ("2026-07-29", "2026-08-03", "Wed Jul 29 → Mon Aug 3 (6d)"),
    # August (often cheapest)
    ("2026-08-05", "2026-08-10", "Wed Aug 5 → Mon Aug 10 (6d)"),
    ("2026-08-12", "2026-08-17", "Wed Aug 12 → Mon Aug 17 (6d)"),
    ("2026-08-19", "2026-08-24", "Wed Aug 19 → Mon Aug 24 (6d)"),
    ("2026-08-20", "2026-08-25", "Thu Aug 20 → Tue Aug 25 (6d)"),
    ("2026-08-21", "2026-08-26", "Fri Aug 21 → Wed Aug 26 (6d)"),
    ("2026-08-26", "2026-08-31", "Wed Aug 26 → Mon Aug 31 (6d)"),
]


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
        executable_path=CHROME_BIN, headless=True,
        args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    )
    try:
        ctx = await browser.new_context(
            ignore_https_errors=True, locale="en-US", user_agent=UA,
            viewport={"width": 1280, "height": 900},
        )
        await ctx.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
        )
        page = await ctx.new_page()
        await page.goto(url, wait_until="load", timeout=60000)
        await asyncio.sleep(7 + random.uniform(0, 1.5))
        return await page.content()
    finally:
        await browser.close()


def parse(body: str, dest: str, depart: str, ret: str, label: str) -> list[dict]:
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
        if total is None or total == 0:
            continue
        out.append({
            "dest": dest, "depart": depart, "ret": ret, "label": label,
            "airline": f.name or "?",
            "stops": f.stops,
            "duration": f.duration or "",
            "price_total": total,
            "price_per_pax": total // ADULTS,
            "departure": f.departure,
            "arrival": f.arrival,
        })
    return out


async def run_query(sem, p, dest, dep, ret, lab, idx, total):
    async with sem:
        for attempt in range(1, 3):
            t0 = time.time()
            try:
                body = await fetch_one(p, dest, dep, ret)
                rows = parse(body, dest, dep, ret, lab)
                el = time.time() - t0
                tag = " " if rows else "∅"
                print(f"  [{idx:3d}/{total}] {tag} {dest} {lab:38s} {len(rows):3d} flights ({el:.0f}s)",
                      file=sys.stderr)
                if rows or attempt == 2:
                    return rows
                await asyncio.sleep(2)
            except Exception as e:
                el = time.time() - t0
                print(f"  [{idx:3d}/{total}] ✗ {dest} {lab:38s} ERR: {type(e).__name__} ({el:.0f}s)",
                      file=sys.stderr)
                if attempt == 2:
                    return []
                await asyncio.sleep(3)


async def main():
    queries = [(d, dep, ret, lab) for d in ALASKA_DESTS for dep, ret, lab in WINDOWS]
    total = len(queries)
    print(f"Alaska full search: {total} queries ({len(ALASKA_DESTS)} dests × {len(WINDOWS)} windows)",
          file=sys.stderr)

    sem = asyncio.Semaphore(5)
    async with async_playwright() as p:
        tasks = [run_query(sem, p, d, dep, ret, lab, i+1, total)
                 for i, (d, dep, ret, lab) in enumerate(queries)]
        results = await asyncio.gather(*tasks)

    flat = [row for sub in results for row in sub]
    out = Path(__file__).parent / "results_alaska.json"
    out.write_text(json.dumps(flat, indent=2))
    print(f"\nWrote {out} — {len(flat)} flight options", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
