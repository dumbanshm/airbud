"""Away (heyaway.ai) booking confirmations: a label/value list in the HTML.

    Booking reference / CCTS2U / Flight / 6E 415 / Route / Bengaluru to Jaipur /
    Departs / 05 Nov 2026, 09:00 / Arrives / 05 Nov 2026, 11:35 / Passenger / Mr Devansh Mehta
"""

import re
from datetime import datetime

from .. import airports
from ..email_utils import html_to_text
from ..types import EmailContent, ParsedBooking, ParsedSegment

FLIGHT_RE = re.compile(r"^([A-Z0-9]{2})\s?(\d{1,4})$")
TITLE_RE = re.compile(r"^(?:Mr|Ms|Mrs|Miss|Mstr|Master|Dr)\.?\s+")


def matches(content: EmailContent) -> bool:
    return "heyaway.ai" in content.sender.lower() and bool(content.html)


def _fields(lines: list[str]) -> dict[str, str]:
    labels = {"Booking reference", "Flight", "Route", "Departs", "Arrives", "Passenger"}
    return {line: lines[i + 1] for i, line in enumerate(lines[:-1]) if line in labels}


def parse(content: EmailContent) -> ParsedBooking | None:
    f = _fields([line.strip() for line in html_to_text(content.html).splitlines() if line.strip()])
    flight = FLIGHT_RE.match(f.get("Flight", ""))
    route = f.get("Route", "").split(" to ")
    if not (flight and len(route) == 2 and "Departs" in f):
        return None
    dep_code, arr_code = airports.code_for_city(route[0]), airports.code_for_city(route[1])
    if not (dep_code and arr_code):
        return None
    code = flight.group(1)
    dep = datetime.strptime(f["Departs"], "%d %b %Y, %H:%M")
    arr = datetime.strptime(f["Arrives"], "%d %b %Y, %H:%M") if "Arrives" in f else None
    passenger = TITLE_RE.sub("", f.get("Passenger", "")).strip()
    return ParsedBooking(
        pnr=f.get("Booking reference"),
        segments=[ParsedSegment(
            flight_number=code + flight.group(2), airline_code=code, airline_name=airports.AIRLINES.get(code),
            dep_airport=dep_code, arr_airport=arr_code, dep_local=dep, arr_local=arr,
            passengers=[passenger] if passenger else [],
        )],
        airline_name=airports.AIRLINES.get(code),
        parser="away",
    )
