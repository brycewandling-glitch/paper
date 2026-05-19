"""Google Flights fetcher using Playwright + fast-flights parser.

The public fast-flights `get_flights` function uses primp (no JS) which Google
now rejects. We reuse fast-flights' encoding (TFSData) and parser
(parse_response) but supply our own headful-ish Playwright fetch.
"""
from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass
from typing import Optional

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")

from playwright.async_api import async_playwright
from fast_flights.filter import TFSData
from fast_flights.flights_impl import FlightData, Passengers
from fast_flights.core import parse_response

CHROME_BIN = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


@dataclass
class Quote:
    origin: str
    dest: str
    depart: str
    ret: str
    price_total: Optional[int]       # total USD for all pax
    price_per_pax: Optional[int]
    airline: str
    stops: int | str
    duration: str
    is_nonstop: bool


async def _render(url: str) -> str:
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=CHROME_BIN,
            headless=True,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        ctx = await browser.new_context(
            ignore_https_errors=True,
            locale="en-US",
            user_agent=UA,
            viewport={"width": 1280, "height": 900},
        )
        await ctx.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        page = await ctx.new_page()
        await page.goto(url, wait_until="load", timeout=45000)
        # results stream in after load
        await asyncio.sleep(6)
        body = await page.content()
        await browser.close()
        return body


def _parse_price(raw: str) -> Optional[int]:
    if not raw:
        return None
    m = re.search(r"\d[\d,]*", raw)
    return int(m.group(0).replace(",", "")) if m else None


def quote_round_trip(
    origin: str,
    dest: str,
    depart: str,
    ret: str,
    adults: int = 2,
    max_stops: Optional[int] = None,
) -> list[Quote]:
    filt = TFSData.from_interface(
        flight_data=[
            FlightData(date=depart, from_airport=origin, to_airport=dest),
            FlightData(date=ret, from_airport=dest, to_airport=origin),
        ],
        trip="round-trip",
        seat="economy",
        passengers=Passengers(
            adults=adults, children=0, infants_in_seat=0, infants_on_lap=0
        ),
        max_stops=max_stops,
    )
    b64 = filt.as_b64().decode()
    url = (
        f"https://www.google.com/travel/flights?tfs={b64}"
        f"&hl=en&tfu=EgQIABABIgA&curr=USD"
    )
    body = asyncio.run(_render(url))

    class _Resp:
        status_code = 200
        text = body
        text_markdown = body

    try:
        result = parse_response(_Resp())
    except RuntimeError:
        return []

    quotes: list[Quote] = []
    for f in result.flights:
        total = _parse_price(f.price)
        per = total // adults if total else None
        quotes.append(
            Quote(
                origin=origin,
                dest=dest,
                depart=depart,
                ret=ret,
                price_total=total,
                price_per_pax=per,
                airline=f.name or "?",
                stops=f.stops,
                duration=f.duration or "",
                is_nonstop=(f.stops == 0),
            )
        )
    return quotes
