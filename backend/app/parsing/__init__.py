"""Email → bookings.

Parsers are tried in order of reliability and the first one that yields a valid flight wins:
structured markup, calendar files, airline/agency-specific parsers, then the universal extractor
(any layout, including PDF attachments). Boarding passes (Apple Wallet / IATA barcodes) are read
on top of that and merged in: they add seats and passengers to the flights found.
"""

import logging
from dataclasses import dataclass, field

from . import boarding_pass, ics, schema_org, universal, validate
from .airlines import PARSERS as AIRLINE_PARSERS
from .email_utils import parse_raw
from .types import EmailContent, ParsedBooking, ParsedSegment

log = logging.getLogger(__name__)

__all__ = ["parse_email", "parse_raw", "ParseResult", "EmailContent", "ParsedBooking", "ParsedSegment"]


@dataclass
class ParseResult:
    booking: ParsedBooking | None
    notes: list[str] = field(default_factory=list)


def _candidates(content: EmailContent):
    yield "schema_org", schema_org.parse
    yield "ics", ics.parse
    for name, matches, parse in AIRLINE_PARSERS:
        if matches(content):
            yield name, parse
    yield "universal", universal.parse


def _run(name, parser, content: EmailContent, notes: list[str]) -> ParsedBooking | None:
    try:
        booking = parser(content)
    except Exception as exc:  # a broken parser must never stop the others
        log.exception("parser %s crashed", name)
        notes.append(f"{name}: crashed ({exc})")
        return None
    if not booking:
        return None
    notes += booking.notes
    good = []
    for seg in booking.segments:
        issues = validate.problems(seg)
        if issues:
            notes.append(f"{name}: dropped {seg.flight_number} ({'; '.join(issues)})")
        else:
            good.append(seg)
    if not good:
        return None
    booking.segments = good
    booking.parser = booking.parser or name
    return booking


def _merge_boarding_passes(booking: ParsedBooking | None, passes: ParsedBooking | None) -> ParsedBooking | None:
    if not passes:
        return booking
    if not booking:
        return passes
    by_flight = {(s.flight_number, s.dep_local.date()): s for s in booking.segments}
    for bp in passes.segments:
        seg = by_flight.get((bp.flight_number, bp.dep_local.date()))
        if seg:
            seg.seats = seg.seats or bp.seats
            seg.passengers = seg.passengers or bp.passengers
            seg.barcode_message = seg.barcode_message or bp.barcode_message
            seg.barcode_format = seg.barcode_format or bp.barcode_format
            seg.barcode_image = seg.barcode_image or bp.barcode_image
            seg.pass_file = seg.pass_file or bp.pass_file
        elif bp.time_known:
            booking.segments.append(bp)
    booking.pnr = booking.pnr or passes.pnr
    return booking


def parse_email(content: EmailContent) -> ParseResult:
    notes: list[str] = []
    booking = None
    for name, parser in _candidates(content):
        booking = _run(name, parser, content, notes)
        if booking:
            break
    has_pass = content.passes or content.pdf_barcodes or any("M1" in t for t in [content.text, *content.pdf_texts])
    passes = _run("boarding_pass", boarding_pass.parse, content, notes) if has_pass else None
    return ParseResult(_merge_boarding_passes(booking, passes), notes)
