"""Template for an airline-specific parser. Copy this file, then register it in __init__.py."""

import re

from .. import airports, patterns
from ..types import EmailContent, ParsedBooking, ParsedSegment


def matches(content: EmailContent) -> bool:
    return "example-airline.com" in content.sender.lower()


def parse(content: EmailContent) -> ParsedBooking | None:
    # Write regexes against the exact layout this airline uses, e.g.:
    # rows = re.findall(r"Flight (\w\w\d+) .*? from (\w{3}) at (\d\d:\d\d) on (\d\d \w{3} \d{4})", content.text)
    return None
