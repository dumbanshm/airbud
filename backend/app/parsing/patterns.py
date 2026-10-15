"""Regexes shared by the text-based parsers."""

import re
from datetime import date

from dateutil import parser as dateparser

from . import airports

# The label is case-insensitive, the code itself must be upper-case.
PNR_RE = re.compile(
    r"(?i:PNR|booking\s+(?:reference|ref\.?|code|id)|confirmation\s+(?:number|code|no\.?)|record\s+locator)"
    r"\s*(?:is|[:#-])?\s*([A-Z0-9]{5,8})\b"
)
FLIGHT_RE = re.compile(r"(?<![A-Za-z0-9])([A-Z0-9]{2})\s?-?(\d{1,4})(?![A-Za-z0-9:])")
ROUTE_RE = re.compile(r"\b([A-Z]{3})\s*(?:→|->|–|—|-|to)\s*([A-Z]{3})\b")
PAREN_CODE_RE = re.compile(r"\(([A-Z]{3})\)")
TIME_RE = re.compile(r"(?<![\d:])([01]?\d|2[0-3])[:.h]([0-5]\d)(?![\d:])\s*(am|pm|AM|PM)?")
DATE_RES = [
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
    re.compile(r"\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4}\b", re.I),
    re.compile(r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b", re.I),
]
TERMINAL_RE = re.compile(r"\bT(?:erminal)?\s?([0-9A-Z]{1,2})\b")
SEAT_RE = re.compile(r"(?i:seat)\s*:?\s*(\d{1,2}[A-K])\b")


def find_pnr(text: str) -> str | None:
    m = PNR_RE.search(text)
    return m.group(1) if m else None


def flight_matches(text: str):
    """Flight numbers whose prefix is a known airline, so 'A4' or 'T3' don't count."""
    for m in FLIGHT_RE.finditer(text):
        if m.group(1) in airports.AIRLINES:
            yield m


def find_route(text: str) -> tuple[str, str] | None:
    for m in ROUTE_RE.finditer(text):
        a, b = m.groups()
        if airports.tz_name(a) and airports.tz_name(b) and a != b:
            return a, b
    codes = [c for c in PAREN_CODE_RE.findall(text) if airports.tz_name(c)]
    if len(codes) >= 2 and codes[0] != codes[1]:
        return codes[0], codes[1]
    return None


def find_date(text: str) -> date | None:
    best = None
    for rx in DATE_RES:
        m = rx.search(text)
        if m and (best is None or m.start() < best.start()):
            best = m
    if not best:
        return None
    try:
        return dateparser.parse(best.group(0), dayfirst=True).date()
    except (ValueError, OverflowError):
        return None


def find_times(text: str) -> list[tuple[int, int]]:
    out = []
    for m in TIME_RE.finditer(text):
        h, mnt, ampm = int(m.group(1)), int(m.group(2)), (m.group(3) or "").lower()
        if ampm == "pm" and h < 12:
            h += 12
        elif ampm == "am" and h == 12:
            h = 0
        out.append((h, mnt))
    return out
