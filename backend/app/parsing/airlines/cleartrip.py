"""Cleartrip flight bookings. Read from the HTML (the plain-text part glues fields together).

Each leg, one value per line:

    Air India / STANDARD / AI 2810 / BLR / 06:00 / 08:45 / DEL / Fri, 23 Oct 2026 / 2h 45m / Fri, 23 Oct 2026

and the travellers table: "PNR" header, then "Mr Devansh Mehta", "9TZJBU".
"""

import re
from datetime import datetime, timedelta

from .. import airports
from ..email_utils import html_to_text
from ..types import EmailContent, ParsedBooking, ParsedSegment

FLIGHT_RE = re.compile(r"^([A-Z0-9]{2})[ -]?(\d{1,4})$")
CODE_RE = re.compile(r"^[A-Z]{3}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
DATE_RE = re.compile(r"^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4}$")
PNR_RE = re.compile(r"^[A-Z0-9]{6}$")
TITLE_RE = re.compile(r"^(?:Mr|Ms|Mrs|Miss|Mstr|Master|Dr)\.?\s+(.+)$")


def matches(content: EmailContent) -> bool:
    return "cleartrip.com" in content.sender.lower() and bool(content.html)


def _leg(lines: list[str], i: int) -> ParsedSegment | None:
    code, num = FLIGHT_RE.match(lines[i]).groups()
    if code not in airports.AIRLINES:
        return None
    window = lines[i + 1 : i + 12]
    if len(window) < 5 or not (CODE_RE.match(window[0]) and TIME_RE.match(window[1])
                               and TIME_RE.match(window[2]) and CODE_RE.match(window[3])):
        return None
    dates = [line for line in window[4:] if DATE_RE.match(line)]
    if not dates:
        return None
    dep = datetime.strptime(f"{dates[0]} {window[1]}", "%a, %d %b %Y %H:%M")
    arr = datetime.strptime(f"{dates[-1]} {window[2]}", "%a, %d %b %Y %H:%M")
    if arr <= dep:
        arr += timedelta(days=1)
    return ParsedSegment(
        flight_number=code + num, airline_code=code, airline_name=airports.AIRLINES.get(code),
        dep_airport=window[0], arr_airport=window[3], dep_local=dep, arr_local=arr,
    )


def parse(content: EmailContent) -> ParsedBooking | None:
    lines = [line.strip() for line in html_to_text(content.html).splitlines() if line.strip()]
    segments = {}
    for i, line in enumerate(lines):
        if FLIGHT_RE.match(line) and (seg := _leg(lines, i)):
            segments.setdefault((seg.flight_number, seg.dep_local), seg)
    if not segments:
        return None

    pnr, passengers = None, []
    if "PNR" in lines:
        for line in lines[lines.index("PNR") + 1 : lines.index("PNR") + 20]:
            if m := TITLE_RE.match(line):
                passengers.append(m.group(1))
            elif PNR_RE.match(line):
                pnr = pnr or line
            else:
                break
    segs = list(segments.values())
    for seg in segs:
        seg.passengers = passengers
    return ParsedBooking(pnr=pnr, segments=segs, airline_name=segs[0].airline_name, parser="cleartrip")
