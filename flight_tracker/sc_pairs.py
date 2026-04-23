"""Match Sun Country one-way outbound + return into RT pairs.

Filters:
- 5+ day trip
- Spans Sat+Sun
- No Sat Jul 4 fly day
"""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path


def load():
    return json.loads((Path(__file__).parent / "sc_oneway.json").read_text())


def is_valid_pair(out_date: str, ret_date: str) -> tuple[bool, str]:
    o = date.fromisoformat(out_date)
    r = date.fromisoformat(ret_date)
    days = (r - o).days + 1
    if days < 5:
        return False, f"only {days}d"
    # No flying Sat Jul 4
    sat_jul4 = date(2026, 7, 4)
    if o == sat_jul4 or r == sat_jul4:
        return False, "flies Jul 4"
    # Must span Sat+Sun
    spans_weekend = False
    for i in range(days):
        d = o + timedelta(days=i)
        if d.weekday() == 5:  # Saturday
            # check next day is Sun
            if (o + timedelta(days=i+1)) <= r and (o + timedelta(days=i+1)).weekday() == 6:
                spans_weekend = True
                break
    if not spans_weekend:
        return False, "no Sat-Sun"
    return True, f"{days}d"


def fmt_dt(d: str) -> str:
    o = date.fromisoformat(d)
    return o.strftime("%a %b %d")


def main():
    data = load()
    print(f"Loaded {len(data)} one-way options")

    # Cheapest SC option per (frm, to, date)
    sc = [r for r in data if r["is_sun_country"] and r["price_total_2pax"]]
    cheapest_sc = {}
    for r in sc:
        k = (r["frm"], r["to"], r["date"])
        if k not in cheapest_sc or r["price_total_2pax"] < cheapest_sc[k]["price_total_2pax"]:
            cheapest_sc[k] = r
    sc_out = [v for k, v in cheapest_sc.items() if k[0] == "MSP"]
    sc_ret = [v for k, v in cheapest_sc.items() if k[0] == "ANC"]

    print(f"\nSC outbound dates with confirmed Google price: {len(sc_out)}")
    for r in sorted(sc_out, key=lambda x: x["date"]):
        print(f"  {fmt_dt(r['date'])} {r['date']}  ${r['price_total_2pax']:>4}/2pax (${r['price_per_pax']}/pax)  {r['duration']}")
    print(f"\nSC return dates with confirmed Google price: {len(sc_ret)}")
    for r in sorted(sc_ret, key=lambda x: x["date"]):
        print(f"  {fmt_dt(r['date'])} {r['date']}  ${r['price_total_2pax']:>4}/2pax (${r['price_per_pax']}/pax)  {r['duration']}")

    # Build all valid SC pair combos
    print(f"\n{'='*100}")
    print("SUN COUNTRY VALID RT PAIRS (5+ days, spans Sat+Sun, no Sat Jul 4 fly)")
    print("="*100)
    pairs = []
    for o in sc_out:
        for r in sc_ret:
            ok, why = is_valid_pair(o["date"], r["date"])
            if not ok:
                continue
            pairs.append({
                "out_date": o["date"], "out_label": fmt_dt(o["date"]),
                "ret_date": r["date"], "ret_label": fmt_dt(r["date"]),
                "out_price": o["price_total_2pax"], "ret_price": r["price_total_2pax"],
                "total": o["price_total_2pax"] + r["price_total_2pax"],
                "days": (date.fromisoformat(r["date"]) - date.fromisoformat(o["date"])).days + 1,
            })
    pairs.sort(key=lambda x: x["total"])
    print(f"\nFound {len(pairs)} valid Sun Country RT pairs (cheapest first):\n")
    print(f"  {'TOTAL':>7s}  {'PER PAX':>8s}  {'DAYS':>4s}   {'OUT':18s}  {'RETURN':18s}  {'split':18s}")
    print("  " + "-" * 90)
    for p in pairs[:25]:
        print(f"  ${p['total']:>5}  ${p['total']//2:>5}/pax  {p['days']:>2}d   "
              f"{p['out_label']:18s}  {p['ret_label']:18s}  ${p['out_price']}+${p['ret_price']}")

    # Also: SC dates without confirmed Google price (existed but unavailable)
    sc_unpriced = [r for r in data if r["is_sun_country"] and not r["price_total_2pax"]]
    sc_unpriced_dates = sorted(set((r["frm"], r["to"], r["date"]) for r in sc_unpriced))
    print(f"\n\n=== SC DATES THAT EXIST BUT GOOGLE LACKED PRICE ({len(sc_unpriced_dates)} dates) ===")
    print("(These need direct verification on suncountry.com — likely $179-$269/pax range)")
    for frm, to, dt in sc_unpriced_dates:
        print(f"  {frm}→{to}  {fmt_dt(dt)} {dt}")


if __name__ == "__main__":
    main()
