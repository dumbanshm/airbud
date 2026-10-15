"""Parser 4 (last resort): plain-text itineraries.

Looks for a known airline flight number, then reads the route, date and times printed next to it.
Works for the usual "6E 2134  Delhi (DEL) → Mumbai (BOM)  12 Oct 2026  06:10  08:25" layout.
Anything it can't read confidently is skipped rather than guessed.
"""

from datetime import datetime, timedelta

from . import airports, patterns
from .types import EmailContent, ParsedBooking, ParsedSegment

LOOK_BEHIND = 120  # dates are often printed just before the flight number
LOOK_AHEAD = 300


def parse(content: EmailContent) -> ParsedBooking | None:
    text = content.text
    if not text:
        return None
    is_cancellation = "cancel" in (content.subject + " " + text[:500]).lower()

    matches = list(patterns.flight_matches(text))
    segments: dict[tuple, ParsedSegment] = {}
    for i, m in enumerate(matches):
        prev_end = matches[i - 1].end() if i else 0
        next_start = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        before = text[max(prev_end, m.start() - LOOK_BEHIND) : m.start()]
        after = text[m.end() : min(next_start, m.end() + LOOK_AHEAD)]

        route = patterns.find_route(after)
        day = patterns.find_date(after) or patterns.find_date(before)
        times = patterns.find_times(after)
        if not (route and day and times):
            continue

        dep_local = datetime.combine(day, datetime.min.time()).replace(hour=times[0][0], minute=times[0][1])
        arr_local = None
        if len(times) > 1:
            arr_local = dep_local.replace(hour=times[1][0], minute=times[1][1])
            if arr_local <= dep_local:  # "+1" overnight arrival
                arr_local += timedelta(days=1)

        code = m.group(1)
        fn = code + m.group(2)
        if (fn, dep_local) in segments:
            continue  # same flight mentioned twice
        terms = patterns.TERMINAL_RE.findall(after)
        seat = patterns.SEAT_RE.search(after)
        segments[(fn, dep_local)] = ParsedSegment(
            flight_number=fn,
            airline_code=code,
            airline_name=airports.AIRLINES.get(code),
            dep_airport=route[0],
            arr_airport=route[1],
            dep_local=dep_local,
            arr_local=arr_local,
            dep_terminal=terms[0] if terms else None,
            arr_terminal=terms[1] if len(terms) > 1 else None,
            seats=[seat.group(1)] if seat else [],
        )

    if not segments:
        return None
    segs = list(segments.values())
    return ParsedBooking(
        pnr=patterns.find_pnr(text) or patterns.find_pnr(content.subject),
        segments=segs,
        airline_name=segs[0].airline_name,
        cancelled=is_cancellation,
        parser="generic_text",
    )
