"""Parser 1: schema.org FlightReservation markup (JSON-LD or microdata).

Many airlines and booking sites embed this in confirmation emails (it's what powers Gmail's
trip cards), so when it's present it's the most reliable source.
"""

from collections import OrderedDict

import extruct
from dateutil import parser as dateparser

from . import airports
from .types import EmailContent, ParsedBooking, ParsedSegment


def _type(item: dict) -> str:
    t = item.get("@type", "")
    if isinstance(t, list):
        t = t[0] if t else ""
    return str(t).rsplit("/", 1)[-1]


def _walk(node):
    if isinstance(node, list):
        for child in node:
            yield from _walk(child)
    elif isinstance(node, dict):
        yield node
        for key in ("@graph", "itemListElement"):
            if key in node:
                yield from _walk(node[key])


def _get(item: dict | None, *path):
    for key in path:
        if isinstance(item, list):
            item = item[0] if item else None
        if not isinstance(item, dict):
            return None
        item = item.get(key)
    if isinstance(item, list):
        item = item[0] if item else None
    return item


def _airport_code(node) -> str | None:
    code = _get(node, "iataCode") if isinstance(node, dict) else node
    return str(code).strip().upper() if code else None


def parse(content: EmailContent) -> ParsedBooking | None:
    if not content.html:
        return None
    data = extruct.extract(content.html, syntaxes=["json-ld", "microdata"], uniform=True, errors="ignore")
    items = [i for i in _walk(data.get("json-ld", []) + data.get("microdata", [])) if _type(i) == "FlightReservation"]
    if not items:
        return None

    pnr = None
    cancelled = False
    airline_name = None
    segments: "OrderedDict[tuple, ParsedSegment]" = OrderedDict()

    for res in items:
        pnr = pnr or _get(res, "reservationNumber")
        if "cancel" in str(_get(res, "reservationStatus") or "").lower():
            cancelled = True

        flight = _get(res, "reservationFor") or {}
        airline_code = _get(flight, "airline", "iataCode")
        airline = _get(flight, "airline", "name") or airports.AIRLINES.get(str(airline_code or "").upper())
        airline_name = airline_name or airline
        dep = _airport_code(_get(flight, "departureAirport"))
        arr = _airport_code(_get(flight, "arrivalAirport"))
        dep_time = _get(flight, "departureTime")
        number = _get(flight, "flightNumber")
        if not (dep and arr and dep_time and number):
            continue

        dep_local = airports.to_airport_local(dateparser.isoparse(str(dep_time)), dep)
        arr_time = _get(flight, "arrivalTime")
        arr_local = airports.to_airport_local(dateparser.isoparse(str(arr_time)), arr) if arr_time else None
        fn = airports.normalise_flight_number(str(number), airline_code)
        code = str(airline_code).upper() if airline_code else fn[:2]

        key = (fn, dep, dep_local.date())
        seg = segments.get(key)
        if seg is None:
            seg = segments[key] = ParsedSegment(
                flight_number=fn,
                airline_code=code,
                airline_name=airline or airports.AIRLINES.get(code),
                dep_airport=dep,
                arr_airport=arr,
                dep_local=dep_local,
                arr_local=arr_local,
                dep_terminal=_get(flight, "departureTerminal"),
                arr_terminal=_get(flight, "arrivalTerminal"),
            )
        # One reservation item per passenger, so merge them onto the same leg.
        name = _get(res, "underName", "name")
        if name and name not in seg.passengers:
            seg.passengers.append(str(name))
        seat = _get(res, "airplaneSeat") or _get(res, "reservedTicket", "ticketedSeat", "seatNumber")
        if seat and str(seat) not in seg.seats:
            seg.seats.append(str(seat))

    if not segments:
        return None
    return ParsedBooking(
        pnr=str(pnr).strip().upper() if pnr else None,
        segments=list(segments.values()),
        airline_name=airline_name,
        cancelled=cancelled,
        parser="schema_org",
    )
