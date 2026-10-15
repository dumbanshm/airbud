"""Parser 3: airline-specific parsers, for emails the generic parsers get wrong.

To add one, copy _template.py, fill in `matches` and `parse`, and add it to PARSERS below.
Put the real email (with personal details changed) in tests/emails/ and add a test.
"""

from collections.abc import Callable

from ..types import EmailContent, ParsedBooking
from . import alliance_air, away, cleartrip, indigo, makemytrip

AirlineParser = tuple[str, Callable[[EmailContent], bool], Callable[[EmailContent], ParsedBooking | None]]

PARSERS: list[AirlineParser] = [
    ("indigo", indigo.matches, indigo.parse),
    ("alliance_air", alliance_air.matches, alliance_air.parse),
    ("makemytrip", makemytrip.matches, makemytrip.parse),
    ("cleartrip", cleartrip.matches, cleartrip.parse),
    ("away", away.matches, away.parse),
]
