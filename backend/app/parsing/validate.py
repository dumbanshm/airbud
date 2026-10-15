"""Sanity checks. A segment that fails these is dropped and the reason is logged, never stored."""

import re

from . import airports
from .types import ParsedSegment

FLIGHT_NUMBER_RE = re.compile(r"^[A-Z0-9]{2}\d{1,4}[A-Z]?$")


def problems(seg: ParsedSegment) -> list[str]:
    issues = []
    if not FLIGHT_NUMBER_RE.match(seg.flight_number):
        issues.append(f"odd flight number {seg.flight_number!r}")
    for label, code in (("departure", seg.dep_airport), ("arrival", seg.arr_airport)):
        if not airports.tz_name(code):
            issues.append(f"unknown {label} airport {code!r}")
    if seg.dep_airport == seg.arr_airport:
        issues.append("departure and arrival airports are the same")
    if issues or seg.arr_local is None:
        return issues

    dep_utc = airports.local_to_utc(seg.dep_local, seg.dep_airport)
    arr_utc = airports.local_to_utc(seg.arr_local, seg.arr_airport)
    hours = (arr_utc - dep_utc).total_seconds() / 3600
    if hours <= 0:
        issues.append("arrives before it departs")
    elif hours > 20:
        issues.append(f"implausible duration ({hours:.1f}h)")
    return issues
