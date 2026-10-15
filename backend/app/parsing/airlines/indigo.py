"""IndiGo "Your IndiGo Itinerary - PNR" emails.

Each flight is a row in the text version of the email, on one or two lines:

    03 Jul 26   Jaipur   (T 2)   19:00   6E  556
    ( A321)   18:00   Bengaluru   (T 1)   21:35

(date, from, departs, flight no. / aircraft, bag-drop closes, to, arrives; the aircraft is
sometimes missing). Rows use city names; the IATA codes appear later as "JAI    BLR" lines.
"""

import re
from datetime import datetime, timedelta

from .. import airports
from ..types import EmailContent, ParsedBooking, ParsedSegment

PNR_RE = re.compile(r"PNR/Booking Ref\.?\s*:\s*([A-Z0-9]{6})")
ROW_RE = re.compile(
    r"(?P<date>\d{1,2} [A-Z][a-z]{2} \d{2})\s+(?P<from>[A-Za-z .()-]+?)\s*(?:\(T\s*(?P<from_t>\w+)\))?\s+"
    r"(?P<dep>\d{2}:\d{2})\s+(?P<code>6E)\s*(?P<num>\d{1,4})\s+"
    r"(?:\(\s*[A-Z0-9 ]+\)\s+)?\d{2}:\d{2}\s+(?P<to>[A-Za-z .()-]+?)\s*(?:\(T\s*(?P<to_t>\w+)\))?\s+(?P<arr>\d{2}:\d{2})"
)
PAIR_RE = re.compile(r"^\s*([A-Z]{3})\s+([A-Z]{3})\s*$", re.M)
PASSENGER_RE = re.compile(r"^\s*(?:Mr|Ms|Mrs|Miss|Mstr|Master|Dr)\.?\s*([A-Z][A-Za-z.' -]+?)\s*$", re.M)


def matches(content: EmailContent) -> bool:
    return "goindigo.in" in content.sender.lower() and "itinerary" in content.subject.lower()


def _normalise(text: str) -> str:
    text = text.replace("\xa0", " ").replace("\t", " ")
    return "\n".join(re.sub(r" {2,}", "  ", line).strip() for line in text.splitlines())


def _names(code: str, city: str) -> bool:
    a = airports.airport(code) or {}
    city = city.split("(")[0].strip().lower()
    return bool(city) and (city in (a.get("city") or "").lower() or city in (a.get("name") or "").lower())


def _pick_pair(i: int, row, pairs: list[tuple[str, str]]) -> tuple[str, str] | None:
    """Airport codes for row i: the pair whose airports match the row's city names, falling back to
    position (e.g. "Goa" fits both GOI and GOX)."""
    named = [p for p in pairs if _names(p[0], row["from"]) and _names(p[1], row["to"])]
    if len(named) == 1:
        return named[0]
    if i < len(pairs) and (not named or pairs[i] in named):
        return pairs[i]
    return named[0] if named else None


def _passengers(text: str) -> list[str]:
    # The same person appears as "Mr.DevanshMehta" and "Mr. Devansh Mehta"; keep the spaced one.
    best: dict[str, str] = {}
    for name in PASSENGER_RE.findall(text):
        name = " ".join(name.split())
        key = name.replace(" ", "").lower()
        if name.count(" ") > best.get(key, "").count(" ") or key not in best:
            best[key] = name
    return list(best.values())


def parse(content: EmailContent) -> ParsedBooking | None:
    text = _normalise(content.text)
    pnr = PNR_RE.search(text)
    rows = list(ROW_RE.finditer(text))
    if not rows:
        return None

    pairs: list[tuple[str, str]] = []
    for a, b in PAIR_RE.findall(text):
        if airports.tz_name(a) and airports.tz_name(b) and (a, b) not in pairs:
            pairs.append((a, b))
    passengers = _passengers(text)

    segments = []
    for i, row in enumerate(rows):
        pair = _pick_pair(i, row, pairs)
        if pair is None:
            continue  # can't tell which airports this leg uses; skip rather than guess
        dep_code, arr_code = pair
        day = datetime.strptime(row["date"], "%d %b %y")
        dep = datetime.combine(day.date(), datetime.strptime(row["dep"], "%H:%M").time())
        arr = datetime.combine(day.date(), datetime.strptime(row["arr"], "%H:%M").time())
        if arr <= dep:  # overnight
            arr += timedelta(days=1)
        segments.append(
            ParsedSegment(
                flight_number=f"6E{row['num']}",
                airline_code="6E",
                airline_name="IndiGo",
                dep_airport=dep_code,
                arr_airport=arr_code,
                dep_local=dep,
                arr_local=arr,
                dep_terminal=row["from_t"],
                arr_terminal=row["to_t"],
                passengers=passengers,
            )
        )
    if not segments:
        return None
    return ParsedBooking(
        pnr=pnr.group(1) if pnr else None,
        segments=segments,
        airline_name="IndiGo",
        cancelled="CANCELLED" in text[:600].upper(),
        parser="indigo",
    )
