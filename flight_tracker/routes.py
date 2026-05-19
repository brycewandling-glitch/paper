"""Destinations + date windows to query.

Constraints:
- Origin: MSP
- 2 adults
- 4+ day trips
- Don't fly ON Sat Jul 4, 2026 (trip may span it)
- Delta preferred but open to cheaper options
- Summer 2026 (June / July / August)
"""

ORIGIN = "MSP"
ADULTS = 2

# (IATA, friendly label, category)
DESTINATIONS = [
    ("ANC", "Anchorage, AK",            "alaska"),
    ("FAI", "Fairbanks, AK",            "alaska"),
    ("JNU", "Juneau, AK",               "alaska"),
    ("FCA", "Kalispell / Glacier NP",   "mountain-west"),
    ("BZN", "Bozeman / Yellowstone",    "mountain-west"),
    ("JAC", "Jackson Hole, WY",         "mountain-west"),
    ("MSO", "Missoula, MT",             "mountain-west"),
    ("COD", "Cody, WY",                 "mountain-west"),
    ("SEA", "Seattle, WA",              "pacific-nw"),
    ("PDX", "Portland, OR",             "pacific-nw"),
    ("YVR", "Vancouver, BC",            "pacific-nw"),
    ("YYC", "Calgary / Banff",          "pacific-nw"),
    ("DEN", "Denver / Rocky Mtn NP",    "rockies"),
    ("EGE", "Vail / Beaver Creek",      "rockies"),
    ("SLC", "Salt Lake / Utah parks",   "rockies"),
    ("BOI", "Boise, ID",                "rockies"),
    ("PWM", "Portland, ME / Acadia",    "northeast"),
    ("BGR", "Bangor, ME / Acadia",      "northeast"),
    ("BTV", "Burlington, VT",           "northeast"),
    ("KEF", "Reykjavik, Iceland",       "international"),
    ("CPH", "Copenhagen, Denmark",      "international"),
    ("DUB", "Dublin, Ireland",          "international"),
]

# (depart_date, return_date, label)  — all 4+ days, none use Sat Jul 4 as travel day
DATE_WINDOWS = [
    # Pre-4th
    ("2026-06-25", "2026-06-29", "Thu Jun 25 → Mon Jun 29 (5d, pre-4th)"),
    ("2026-06-27", "2026-07-01", "Sat Jun 27 → Wed Jul 1 (5d, pre-4th)"),
    # Over the 4th (no Sat Jul 4 flying)
    ("2026-07-01", "2026-07-07", "Wed Jul 1 → Tue Jul 7 (6d, over 4th)"),
    ("2026-07-02", "2026-07-07", "Thu Jul 2 → Tue Jul 7 (5d, over 4th)"),
    ("2026-07-02", "2026-07-08", "Thu Jul 2 → Wed Jul 8 (6d, over 4th)"),
    ("2026-07-03", "2026-07-08", "Fri Jul 3 → Wed Jul 8 (5d, over 4th)"),
    # Post-4th
    ("2026-07-08", "2026-07-12", "Wed Jul 8 → Sun Jul 12 (4d, post-4th)"),
    ("2026-07-11", "2026-07-18", "Sat Jul 11 → Sat Jul 18 (7d)"),
    # Late July
    ("2026-07-22", "2026-07-26", "Wed Jul 22 → Sun Jul 26 (4d)"),
    # Late August sweet spot
    ("2026-08-12", "2026-08-16", "Wed Aug 12 → Sun Aug 16 (4d)"),
    ("2026-08-19", "2026-08-23", "Wed Aug 19 → Sun Aug 23 (4d)"),
    ("2026-08-20", "2026-08-25", "Thu Aug 20 → Tue Aug 25 (5d)"),
]
