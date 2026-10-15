"""Alliance Air booking confirmations. The flight is a single sentence:

    Your PNR is NPHSEN – 9I507 09 OCT 2026 BENGALURU Departure 0705 hours KOCHI Arrival 0840 hours.
"""

import re
from datetime import datetime, timedelta

from .. import airports
from ..types import EmailContent, ParsedBooking, ParsedSegment

PNR_RE = re.compile(r"Your PNR is\s+([A-Z0-9]{6})")
LEG_RE = re.compile(
    r"(?P<code>[A-Z0-9]{2})\s?(?P<num>\d{1,4})\s+(?P<date>\d{1,2} [A-Z]{3} \d{4})\s+"
    r"(?P<from>[A-Z][A-Z .]+?)\s+Departure\s+(?P<dep>\d{4})\s*hours\s+"
    r"(?P<to>[A-Z][A-Z .]+?)\s+Arrival\s+(?P<arr>\d{4})\s*hours"
)
NAME_RE = re.compile(r"^\s*Dear\s+(?:MR/MRS/MS\s+)?([A-Z][A-Z .']+?)\s*,?\s*$", re.M)


def matches(content: EmailContent) -> bool:
    return "allianceair.in" in content.sender.lower()


def parse(content: EmailContent) -> ParsedBooking | None:
    text = " ".join(content.text.split())
    pnr = PNR_RE.search(text)
    name = NAME_RE.search(content.text)  # line by line, so the next sentence isn't swallowed
    passengers = [name.group(1).strip().title()] if name else []

    segments = []
    for m in LEG_RE.finditer(text):
        dep_code = airports.code_for_city(m["from"], "IN")
        arr_code = airports.code_for_city(m["to"], "IN")
        if not (dep_code and arr_code):
            continue
        day = datetime.strptime(m["date"].title(), "%d %b %Y")
        dep = day.replace(hour=int(m["dep"][:2]), minute=int(m["dep"][2:]))
        arr = day.replace(hour=int(m["arr"][:2]), minute=int(m["arr"][2:]))
        if arr <= dep:
            arr += timedelta(days=1)
        segments.append(ParsedSegment(
            flight_number=m["code"] + m["num"], airline_code=m["code"],
            airline_name=airports.AIRLINES.get(m["code"], "Alliance Air"),
            dep_airport=dep_code, arr_airport=arr_code, dep_local=dep, arr_local=arr, passengers=passengers,
        ))
    if not segments:
        return None
    return ParsedBooking(pnr=pnr.group(1) if pnr else None, segments=segments, airline_name="Alliance Air", parser="alliance_air")
