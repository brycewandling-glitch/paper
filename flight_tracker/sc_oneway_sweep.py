"""Query Google Flights one-way for every Sun Country promo date both directions.

Confirmed SC MSP→ANC promo dates ($179/pax marketing): Jun 13, 19, 22, 26,
Aug 2, 10, 17, 20, 24, 31, Sep 5, 12.

For each, also query plausible ANC→MSP return dates that produce a 5+ day,
weekend-spanning trip not flying Sat Jul 4. Then we can compute optimal
SC RT pairings.
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")

from playwright.async_api import async_playwright
from fast_flights.filter import TFSData
from fast_flights.flights_impl import FlightData, Passengers
from fast_flights.core import parse_response

from .search import CHROME_BIN, UA, _parse_price

ADULTS = 2

# Outbound dates (MSP→ANC) — all known SC promo $179 days
OUTBOUND = [
    "2026-06-13", "2026-06-19", "2026-06-22", "2026-06-26",
    "2026-08-02", "2026-08-10", "2026-08-17", "2026-08-20", "2026-08-24",
    "2026-08-31", "2026-09-05", "2026-09-12",
]

# Return dates (ANC→MSP) — every plausible day after each outbound to find
# 5-9 day trips, no Sat Jul 4
RETURNS = [
    # for Jun 13 out → 5-9 days
    "2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22",
    # for Jun 19 out
    "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26", "2026-06-27",
    "2026-06-28",
    # for Jun 22 out
    "2026-06-29", "2026-06-30",
    # for Jun 26 out → must skip Sat Jul 4
    "2026-07-01", "2026-07-02", "2026-07-03",  # 5-7d
    # for Aug 2 out
    "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09",
    # for Aug 10 out
    "2026-08-14", "2026-08-15", "2026-08-16",
    # for Aug 17 out
    "2026-08-21", "2026-08-22", "2026-08-23",
    # for Aug 20 out
    "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27",
    # for Aug 24 out
    "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31",
    # for Aug 31 out
    "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07",
    # for Sep 5 out
    "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12",
]


async def fetch_oneway(p, frm: str, to: str, dt: str) -> list[dict]:
    filt = TFSData.from_interface(
        flight_data=[FlightData(date=dt, from_airport=frm, to_airport=to)],
        trip="one-way", seat="economy",
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
        await page.goto(url, wait_until="load", timeout=45000)
        await asyncio.sleep(6 + random.uniform(0, 1.5))
        body = await page.content()

        class _R:
            status_code = 200
            text = body
            text_markdown = body
        try:
            res = parse_response(_R())
        except RuntimeError:
            return []
        out = []
        for f in res.flights:
            total = _parse_price(f.price)
            out.append({
                "frm": frm, "to": to, "date": dt,
                "airline": f.name or "?",
                "stops": f.stops,
                "duration": f.duration or "",
                "price_total_2pax": total,
                "price_per_pax": (total // ADULTS) if total else None,
                "departure": f.departure, "arrival": f.arrival,
                "is_sun_country": "sun country" in (f.name or "").lower(),
            })
        return out
    finally:
        await browser.close()


async def run(sem, p, frm, to, dt, idx, total):
    async with sem:
        for attempt in range(1, 3):
            try:
                rows = await fetch_oneway(p, frm, to, dt)
                sc_rows = [r for r in rows if r["is_sun_country"]]
                sc_with_price = [r for r in sc_rows if r["price_total_2pax"]]
                tag = "SC$" if sc_with_price else ("SC?" if sc_rows else "  ")
                print(f"  [{idx:3d}/{total}] {tag} {frm}→{to} {dt} | "
                      f"SC count={len(sc_rows)} priced={len(sc_with_price)}",
                      file=sys.stderr)
                return rows
            except Exception as e:
                print(f"  [{idx:3d}/{total}] ✗ {frm}→{to} {dt} ERR {e}",
                      file=sys.stderr)
                if attempt == 2:
                    return []


async def main():
    queries = [("MSP", "ANC", d) for d in OUTBOUND] + [("ANC", "MSP", d) for d in RETURNS]
    total = len(queries)
    print(f"SC one-way sweep: {total} queries (12 outbound + {len(RETURNS)} returns)",
          file=sys.stderr)

    sem = asyncio.Semaphore(5)
    async with async_playwright() as p:
        tasks = [run(sem, p, frm, to, dt, i+1, total)
                 for i, (frm, to, dt) in enumerate(queries)]
        results = await asyncio.gather(*tasks)

    flat = [r for batch in results for r in batch]
    out = Path(__file__).parent / "sc_oneway.json"
    out.write_text(json.dumps(flat, indent=2))
    print(f"\nWrote {out} ({len(flat)} options)", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
