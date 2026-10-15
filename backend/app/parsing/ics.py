"""Parser 2: calendar (.ics) attachments, which many airlines and booking sites include."""

from datetime import datetime

from icalendar import Calendar

from . import airports, patterns
from .types import EmailContent, ParsedBooking, ParsedSegment


def parse(content: EmailContent) -> ParsedBooking | None:
    segments = []
    pnr = None
    for raw in content.calendars:
        try:
            cal = Calendar.from_ical(raw)
        except ValueError:
            continue
        for event in cal.walk("VEVENT"):
            text = " ".join(str(event.get(k, "")) for k in ("SUMMARY", "LOCATION", "DESCRIPTION"))
            pnr = pnr or patterns.find_pnr(text)
            fm = next(patterns.flight_matches(text), None)
            route = patterns.find_route(text)
            start = event.get("DTSTART")
            if not (fm and route and start):
                continue
            start, end = start.dt, event.get("DTEND").dt if event.get("DTEND") else None
            if not isinstance(start, datetime):  # all-day event, no time to use
                continue
            dep, arr = route
            code = fm.group(1)
            segments.append(
                ParsedSegment(
                    flight_number=code + fm.group(2),
                    airline_code=code,
                    airline_name=airports.AIRLINES.get(code),
                    dep_airport=dep,
                    arr_airport=arr,
                    dep_local=airports.to_airport_local(start, dep),
                    arr_local=airports.to_airport_local(end, arr) if isinstance(end, datetime) else None,
                )
            )
    if not segments:
        return None
    return ParsedBooking(
        pnr=pnr or patterns.find_pnr(content.text),
        segments=segments,
        airline_name=segments[0].airline_name,
        parser="ics",
    )
