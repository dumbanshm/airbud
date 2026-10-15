"""MakeMyTrip-style flight e-tickets, also sent by Amazon Pay (which books through MakeMyTrip).

Each leg reads, one value per line in the HTML's text:

    Air India AI-414          <- airline + flight number
    ... PNR: / JDSBZ2
    JAI / 06:55 / Thu, 12 Nov 2026 / Terminal - T2,
    ... duration
    08:55 / BOM / Thu, 12 Nov 2026 / Terminal - T2,
"""

import re
from datetime import datetime, timedelta

from .. import airports
from ..types import EmailContent, ParsedBooking, ParsedSegment

FLIGHT_RE = re.compile(r"^(?P<airline>[A-Za-z][A-Za-z .]+?)\s+(?P<code>[A-Z0-9]{2})-(?P<num>\d{1,4})$")
CODE_RE = re.compile(r"^[A-Z]{3}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
DATE_RE = re.compile(r"^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4}$")
TERMINAL_RE = re.compile(r"^Terminal\s*-\s*T?(\w+),?$")
PNR_RE = re.compile(r"PNR:\s*([A-Z0-9]{5,8})")
LOOKAHEAD = 25  # lines from the flight-number line to the end of its leg block


def matches(content: EmailContent) -> bool:
    sender = content.sender.lower()
    return ("amazonpay.in" in sender or "makemytrip.com" in sender) and "PNR:" in content.text


def _at(day: str, hhmm: str) -> datetime:
    return datetime.strptime(f"{day} {hhmm}", "%a, %d %b %Y %H:%M")


def _leg(lines: list[str], i: int) -> ParsedSegment | None:
    m = FLIGHT_RE.match(lines[i])
    block = lines[i + 1 : i + 1 + LOOKAHEAD]
    # Departure: CODE, time, date, [terminal]; arrival: time, CODE, date, [terminal].
    for j in range(len(block) - 2):
        if CODE_RE.match(block[j]) and TIME_RE.match(block[j + 1]) and DATE_RE.match(block[j + 2]):
            dep_code, dep_time, dep_day = block[j : j + 3]
            dep_t = TERMINAL_RE.match(block[j + 3]) if j + 3 < len(block) else None
            rest = block[j + 3 :]
            for k in range(len(rest) - 2):
                if TIME_RE.match(rest[k]) and CODE_RE.match(rest[k + 1]) and DATE_RE.match(rest[k + 2]):
                    arr_t = TERMINAL_RE.match(rest[k + 3]) if k + 3 < len(rest) else None
                    dep, arr = _at(dep_day, dep_time), _at(rest[k + 2], rest[k])
                    if arr <= dep:
                        arr += timedelta(days=1)
                    return ParsedSegment(
                        flight_number=m["code"] + m["num"], airline_code=m["code"],
                        airline_name=airports.AIRLINES.get(m["code"], m["airline"]),
                        dep_airport=dep_code, arr_airport=rest[k + 1], dep_local=dep, arr_local=arr,
                        dep_terminal=dep_t.group(1) if dep_t else None,
                        arr_terminal=arr_t.group(1) if arr_t else None,
                    )
            return None
    return None  # e.g. the baggage table repeats "Air India AI-414" without times


def parse(content: EmailContent) -> ParsedBooking | None:
    lines = [line.strip() for line in content.text.splitlines() if line.strip()]
    segments: dict[tuple, ParsedSegment] = {}
    for i, line in enumerate(lines):
        if FLIGHT_RE.match(line) and (seg := _leg(lines, i)):
            segments.setdefault((seg.flight_number, seg.dep_local), seg)
    if not segments:
        return None
    # Passenger tables: "Name / Seat / Meal / Status" headers, then the traveller's name.
    passengers = []
    for i in range(len(lines) - 4):
        if lines[i : i + 4] == ["Name", "Seat", "Meal", "Status"] and lines[i + 4] not in passengers:
            passengers.append(lines[i + 4])
    pnr = PNR_RE.search(" ".join(lines))
    segs = list(segments.values())
    for seg in segs:
        seg.passengers = passengers
    return ParsedBooking(
        pnr=pnr.group(1) if pnr else None, segments=segs,
        airline_name=segs[0].airline_name, parser="makemytrip",
    )
