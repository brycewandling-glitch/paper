"""Hit Sun Country's booking flow for actual MSP↔ANC roundtrip prices.

Sun Country sells direct only — Google Flights can't quote their RT prices.
We hit their booking search results page for promising date pairs.

Confirmed cheap MSP→ANC outbound dates ($179/pax one-way) per Sun Country's
fare display: Jun 13, 19, 22, 26 / Aug 2, 10, 17, 20, 24 / Sep 12.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")

from playwright.async_api import async_playwright

from .search import CHROME_BIN, UA

# (depart, return, label) — 5+ day, spans Sat+Sun, no Sat Jul 4 fly,
# outbound on a confirmed cheap MSP→ANC day
COMBOS = [
    # Pre-July 4
    ("2026-06-13", "2026-06-18", "Sat Jun 13 → Thu Jun 18 (5d)"),
    ("2026-06-13", "2026-06-19", "Sat Jun 13 → Fri Jun 19 (6d)"),
    ("2026-06-19", "2026-06-23", "Fri Jun 19 → Tue Jun 23 (5d)"),
    ("2026-06-19", "2026-06-24", "Fri Jun 19 → Wed Jun 24 (6d)"),
    ("2026-06-22", "2026-06-28", "Mon Jun 22 → Sun Jun 28 (7d)"),
    ("2026-06-22", "2026-06-29", "Mon Jun 22 → Mon Jun 29 (8d)"),
    ("2026-06-26", "2026-06-30", "Fri Jun 26 → Tue Jun 30 (5d)"),
    ("2026-06-26", "2026-07-01", "Fri Jun 26 → Wed Jul 1 (6d)"),
    ("2026-06-26", "2026-07-02", "Fri Jun 26 → Thu Jul 2 (7d)"),
    # Late August (cheapest summer per general knowledge)
    ("2026-08-02", "2026-08-08", "Sun Aug 2 → Sat Aug 8 (7d)"),
    ("2026-08-02", "2026-08-09", "Sun Aug 2 → Sun Aug 9 (8d)"),
    ("2026-08-10", "2026-08-16", "Mon Aug 10 → Sun Aug 16 (7d)"),
    ("2026-08-17", "2026-08-23", "Mon Aug 17 → Sun Aug 23 (7d)"),
    ("2026-08-20", "2026-08-24", "Thu Aug 20 → Mon Aug 24 (5d)"),
    ("2026-08-20", "2026-08-25", "Thu Aug 20 → Tue Aug 25 (6d)"),
    ("2026-08-24", "2026-08-30", "Mon Aug 24 → Sun Aug 30 (7d)"),
]


async def quote(page, depart: str, ret: str, adults: int = 2) -> dict:
    """Hit Sun Country booking search and read total round-trip price."""
    # Build the URL — Sun Country's search results page format
    url = (
        "https://booking.suncountry.com/Booking/Flights?"
        f"adults={adults}&children=0&infants=0"
        f"&fromCity=MSP&toCity=ANC"
        f"&departureDate={depart}&returnDate={ret}"
        "&promo=&culture=en-US"
    )
    try:
        await page.goto(url, wait_until="load", timeout=60000)
    except Exception as e:
        return {"depart": depart, "ret": ret, "error": f"goto: {e}"[:120]}
    # Wait for fare grid to render
    await asyncio.sleep(8)
    body = await page.content()

    # Sun Country shows fares as buttons with prices like "$249" per leg
    # Find all dollar amounts and pick reasonable ones
    raw = re.findall(r'\$\s?([\d,]{3,5})(?:\.\d{2})?', body)
    nums = sorted({int(p.replace(",", "")) for p in raw if 90 <= int(p.replace(",", "")) <= 3000})
    # The cheapest two prices likely correspond to outbound + return one-way
    out = {
        "depart": depart, "ret": ret,
        "all_prices": nums[:15],
        "cheapest_oneway_pp": nums[0] if nums else None,
        "second_oneway_pp": nums[1] if len(nums) > 1 else None,
        # rough RT estimate per pax = sum of two cheapest one-ways
        "est_rt_per_pax": (nums[0] + nums[1]) if len(nums) > 1 else None,
        # Total for 2 pax
        "est_rt_total_2pax": (nums[0] + nums[1]) * adults if len(nums) > 1 else None,
    }
    # Page title for sanity
    try:
        out["title"] = await page.title()
    except Exception:
        pass
    return out


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=CHROME_BIN, headless=True,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        ctx = await browser.new_context(
            ignore_https_errors=True, locale="en-US", user_agent=UA,
            viewport={"width": 1280, "height": 900},
        )
        await ctx.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
        )
        page = await ctx.new_page()

        results = []
        for i, (dep, ret, lab) in enumerate(COMBOS, 1):
            print(f"[{i}/{len(COMBOS)}] Sun Country MSP-ANC {lab}", file=sys.stderr)
            r = await quote(page, dep, ret)
            r["label"] = lab
            results.append(r)
            print(f"   est RT total 2pax: ${r.get('est_rt_total_2pax')} | "
                  f"cheap oneway: ${r.get('cheapest_oneway_pp')} + ${r.get('second_oneway_pp')}",
                  file=sys.stderr)

        await browser.close()

        Path(__file__).parent.joinpath("sun_country_quotes.json").write_text(
            json.dumps(results, indent=2))
        print("\nSorted by estimated RT total (2 adults):", file=sys.stderr)
        for r in sorted(
            [x for x in results if x.get("est_rt_total_2pax")],
            key=lambda x: x["est_rt_total_2pax"],
        ):
            print(f"  ${r['est_rt_total_2pax']:>5}  {r['label']}", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
