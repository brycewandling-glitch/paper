"""Alaska deals SPANNING the Jul 4 weekend (trip includes Sat Jul 4).
No flying ON Sat Jul 4. Includes flight times from cached data."""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

ALASKA = {"ANC": "Anchorage", "FAI": "Fairbanks", "JNU": "Juneau", "SIT": "Sitka", "KTN": "Ketchikan"}
JUL4 = date(2026, 7, 4)


def spans_jul4(out: str, ret: str) -> bool:
    o = date.fromisoformat(out)
    r = date.fromisoformat(ret)
    return o <= JUL4 <= r and o != JUL4 and r != JUL4


def load_g():
    return json.loads((Path(__file__).parent / "results_alaska.json").read_text())


def load_sc():
    return json.loads((Path(__file__).parent / "sc_otas.json").read_text())


def main():
    g = load_g()
    sc = load_sc()

    # Filter Google data to over-Jul-4 trips
    over = [r for r in g if spans_jul4(r["depart"], r["ret"])]
    print(f"Google Flights over-Jul-4 entries: {len(over)}")

    # Best per (dest, label) — cheapest, prefer nonstop
    best = {}
    for r in over:
        k = (r["dest"], r["label"])
        score = (0 if r["stops"] == 0 else 1, r["price_total"])
        if k not in best:
            best[k] = (score, r)
        elif score < best[k][0]:
            best[k] = (score, r)

    # Add SC OTA finds that span Jul 4
    sc_over = [r for r in sc["rt_fares_per_pax_2pax_total"] if spans_jul4(r["out"], r["ret"])]
    for r in sc_over:
        k = ("ANC", f"{r['out_label']} → {r['ret_label']} ({r['days']}d)")
        new_entry = {
            "dest": "ANC", "label": k[1],
            "depart": r["out"], "ret": r["ret"],
            "airline": "Sun Country", "stops": 0, "duration": "5 hr 51 min",
            "price_total": r["total_2pax"], "price_per_pax": r["per_pax"],
            "departure": "9:30 AM (typical)", "arrival": "12:21 PM (typical)",
            "src": f"OTA: {r['source']}",
        }
        score = (0, r["total_2pax"])
        if k not in best or score < best[k][0]:
            best[k] = (score, new_entry)

    # Sort by total price
    rows = [v[1] for v in best.values()]
    rows.sort(key=lambda r: r["price_total"])

    print("\n" + "=" * 130)
    print("ALASKA DEALS — TRIPS SPANNING JUL 4 WEEKEND (no Sat Jul 4 flying)")
    print("MSP origin, 2 adults RT, sorted by total price")
    print("=" * 130)
    print(f"{'#':>3} {'TOTAL':>7s}  {'P/PAX':>6s}  {'DEST':4s}  {'AIRLINE':18s}  {'STOPS':>7s}  "
          f"{'DURATION':>11s}  {'OUT TIME':>16s}  {'RET TIME':>16s}  {'TRIP':35s}")
    print("-" * 130)
    for i, r in enumerate(rows, 1):
        stops = "nonstop" if r["stops"] == 0 else f"{r['stops']}-stop"
        out_t = r.get("departure", "?")[:16] if r.get("departure") else "?"
        # (departure/arrival in raw data are first-leg outbound times)
        ret_t = "see SC bundle" if r.get("airline") == "Sun Country" else "(check at booking)"
        print(f"{i:>3} ${r['price_total']:>5,}  ${r['price_per_pax']:>5,}  "
              f"{r['dest']:4s}  {r['airline'][:18]:18s}  {stops:>7s}  "
              f"{r['duration']:>11s}  {out_t:>16s}  {ret_t:>16s}  {r['label'][:35]:35s}")
        if i >= 20:
            break


if __name__ == "__main__":
    main()
