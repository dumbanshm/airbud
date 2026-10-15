"""Airport and airline lookups. Timezones come from the airport, never from the email."""

from datetime import datetime, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

import airportsdata

_AIRPORTS = airportsdata.load("IATA")

# Common carriers, used to tell real flight numbers ("6E 2134") from noise ("A4 paper").
# Add yours here if a parser misses them.
AIRLINES = {
    "6E": "IndiGo", "AI": "Air India", "IX": "Air India Express", "UK": "Vistara",
    "SG": "SpiceJet", "QP": "Akasa Air", "I5": "AIX Connect", "EK": "Emirates",
    "EY": "Etihad", "QR": "Qatar Airways", "SQ": "Singapore Airlines", "TG": "Thai Airways",
    "CX": "Cathay Pacific", "BA": "British Airways", "VS": "Virgin Atlantic", "LH": "Lufthansa",
    "LX": "SWISS", "AF": "Air France", "KL": "KLM", "TK": "Turkish Airlines", "UA": "United",
    "AA": "American Airlines", "DL": "Delta", "WN": "Southwest", "B6": "JetBlue", "AS": "Alaska",
    "AC": "Air Canada", "NH": "ANA", "JL": "Japan Airlines", "KE": "Korean Air",
    "QF": "Qantas", "NZ": "Air New Zealand", "FR": "Ryanair", "U2": "easyJet", "W6": "Wizz Air",
    "IB": "Iberia", "AY": "Finnair", "SK": "SAS", "MH": "Malaysia Airlines", "AK": "AirAsia",
    "FZ": "flydubai", "G9": "Air Arabia", "WY": "Oman Air", "GF": "Gulf Air", "SV": "Saudia",
    "UL": "SriLankan", "VN": "Vietnam Airlines", "GA": "Garuda", "PR": "Philippine Airlines",
    "ET": "Ethiopian", "MS": "EgyptAir", "LO": "LOT", "OS": "Austrian", "SN": "Brussels",
    "TP": "TAP", "EI": "Aer Lingus", "VA": "Virgin Australia", "TR": "Scoot", "3K": "Jetstar Asia",
}


def airport(code: str | None) -> dict | None:
    return _AIRPORTS.get((code or "").upper())


@lru_cache(maxsize=None)
def tz_name(code: str) -> str | None:
    a = airport(code)
    return a["tz"] if a and a.get("tz") else None


def tz(code: str) -> ZoneInfo | None:
    name = tz_name(code)
    return ZoneInfo(name) if name else None


def to_airport_local(dt: datetime, code: str) -> datetime:
    """Aware datetimes are converted to the airport's wall clock; naive ones are assumed to be it."""
    if dt.tzinfo is None:
        return dt
    zone = tz(code)
    if zone is None:
        raise ValueError(f"Unknown airport {code}")
    return dt.astimezone(zone).replace(tzinfo=None)


def local_to_utc(local: datetime, code: str) -> datetime:
    zone = tz(code)
    if zone is None:
        raise ValueError(f"Unknown airport {code}")
    return local.replace(tzinfo=zone).astimezone(timezone.utc).replace(tzinfo=None)


def normalise_flight_number(raw: str, airline_code: str | None = None) -> str:
    fn = "".join(str(raw).split()).replace("-", "").upper()
    if airline_code and fn.isdigit():
        fn = airline_code.upper() + fn
    return fn


def display_flight_number(fn: str) -> str:
    return f"{fn[:2]} {fn[2:]}" if len(fn) > 2 else fn
