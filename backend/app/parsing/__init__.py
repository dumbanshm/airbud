"""Email → bookings. Parsers are tried in order of reliability; the first useful result wins."""

import logging
from dataclasses import dataclass, field

from . import generic_text, ics, schema_org, validate
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
    yield "generic_text", generic_text.parse


def parse_email(content: EmailContent) -> ParseResult:
    notes: list[str] = []
    for name, parser in _candidates(content):
        try:
            booking = parser(content)
        except Exception as exc:  # a broken parser must never stop the others
            log.exception("parser %s crashed", name)
            notes.append(f"{name}: crashed ({exc})")
            continue
        if not booking:
            continue
        good = []
        for seg in booking.segments:
            issues = validate.problems(seg)
            if issues:
                notes.append(f"{name}: dropped {seg.flight_number} ({'; '.join(issues)})")
            else:
                good.append(seg)
        if good:
            booking.segments = good
            booking.parser = name
            return ParseResult(booking, notes)
    return ParseResult(None, notes)
