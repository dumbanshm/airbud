"""Boarding passes: the IATA BCBP barcode (Resolution 792), the same on every airline's pass.

Reads the barcode text from Apple Wallet passes (.pkpass), and from any email or PDF text that
happens to include it. The barcode has flight, route, date, seat and PNR, but no times; an
Apple Wallet pass usually adds the departure time in its fields.

Mandatory section layout (field widths):
  format 'M'(1) legs(1) name(20) e-ticket(1)
  per leg: PNR(7) from(3) to(3) carrier(3) flight(5) julian date(3) cabin(1) seat(4) seq(5)
           status(1) size-of-variable-section(2 hex) variable-section(size)
"""

import io
import json
import re
import zipfile
from datetime import date, datetime, timedelta

from dateutil import parser as dateparser

from . import airports
from .types import EmailContent, ParsedBooking, ParsedSegment

BCBP_IN_TEXT_RE = re.compile(r"M[1-4][A-Z/ .\-']{20}[E ][A-Z0-9 ]{7}[A-Z]{3}[A-Z]{3}[A-Z0-9 ]{3}[0-9 ]{4}[A-Z0-9 ][0-9]{3}[A-Z][0-9A-Z ]{4}[0-9A-Z ]{5}[0-9A-Z ]")


def decode_bcbp(data: str, ref: date) -> list[dict]:
    """Decode the mandatory fields of every leg. Returns [] if this isn't a BCBP string."""
    if len(data) < 60 or data[0] != "M" or not data[1].isdigit():
        return []
    legs_count = int(data[1])
    name = data[2:22].strip()
    pos = 23
    legs = []
    for _ in range(legs_count):
        leg = data[pos : pos + 35]
        if len(leg) < 35:
            break
        pnr, dep, arr, carrier = leg[0:7].strip(), leg[7:10], leg[10:13], leg[13:16].strip()
        flight = leg[16:21].strip().lstrip("0").rstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZ ") or "0"
        julian = leg[21:24]
        seat = leg[25:29].strip().lstrip("0")
        try:
            size = int(data[pos + 35 : pos + 37], 16)
        except ValueError:
            size = 0
        pos += 37 + size
        if not (julian.isdigit() and airports.tz_name(dep) and airports.tz_name(arr)):
            continue
        day = None
        for y in (ref.year - 1, ref.year, ref.year + 1):
            d = date(y, 1, 1) + timedelta(days=int(julian) - 1)
            if d >= ref - timedelta(days=7) and d.year == y:
                day = d
                break
        if day is None:
            continue
        last, _, first = name.partition("/")
        legs.append({
            "pnr": pnr, "dep": dep, "arr": arr, "carrier": carrier, "flight": flight, "date": day,
            "seat": seat or None, "passenger": f"{first.title()} {last.title()}".strip(),
        })
    return legs


def _pass_json(data: bytes) -> dict | None:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            return json.loads(z.read("pass.json").decode("utf-8-sig"))
    except (zipfile.BadZipFile, KeyError, ValueError):
        return None


def _departure_from_fields(p: dict) -> datetime | None:
    """Apple Wallet fields with an ISO date and a 'depart' key/label, e.g. {"key": "departs", "value": "2026-10-23T06:00+05:30"}."""
    style = p.get("boardingPass") or {}
    for group in ("primaryFields", "secondaryFields", "auxiliaryFields", "headerFields", "backFields"):
        for f in style.get(group, []):
            label = f"{f.get('key', '')} {f.get('label', '')}".lower()
            value = f.get("value")
            if "depart" in label and isinstance(value, str) and re.match(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", value):
                return dateparser.isoparse(value)
    return None


def _segment(leg: dict, dep_time: datetime | None) -> ParsedSegment:
    code = leg["carrier"]
    if dep_time is not None:
        dep_local = airports.to_airport_local(dep_time, leg["dep"])
        if dep_local.date() != leg["date"]:
            dep_time = None
    return ParsedSegment(
        flight_number=f"{code}{leg['flight']}", airline_code=code, airline_name=airports.AIRLINES.get(code),
        dep_airport=leg["dep"], arr_airport=leg["arr"],
        dep_local=dep_local if dep_time is not None else datetime.combine(leg["date"], datetime.min.time()),
        passengers=[leg["passenger"]] if leg["passenger"] else [], seats=[leg["seat"]] if leg["seat"] else [],
        time_known=dep_time is not None,
    )


def parse(content: EmailContent) -> ParsedBooking | None:
    ref = content.date.date() if content.date else date.today()
    segments, pnr = [], None
    for data in content.passes:
        p = _pass_json(data)
        if not p:
            continue
        codes = [b.get("message", "") for b in p.get("barcodes", [])] + [(p.get("barcode") or {}).get("message", "")]
        dep_time = _departure_from_fields(p)
        for message in filter(None, codes):
            for leg in decode_bcbp(message, ref):
                segments.append(_segment(leg, dep_time))
                pnr = pnr or leg["pnr"]
            if segments:
                break
    for text in [content.text, *content.pdf_texts]:
        for m in BCBP_IN_TEXT_RE.finditer(text or ""):
            for leg in decode_bcbp(text[m.start() :], ref):
                segments.append(_segment(leg, None))
                pnr = pnr or leg["pnr"]
    if not segments:
        return None
    unique = {(s.flight_number, s.dep_local.date()): s for s in segments}
    return ParsedBooking(pnr=pnr, segments=list(unique.values()), airline_name=segments[0].airline_name, parser="boarding_pass")
