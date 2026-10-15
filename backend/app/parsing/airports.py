"""Airport and airline lookups. Timezones come from the airport, never from the email."""

import re
from datetime import datetime, timezone
from functools import lru_cache
from math import asin, cos, radians, sin, sqrt
from zoneinfo import ZoneInfo

import airportsdata

from .airline_codes import AIRLINE_CODES

_AIRPORTS = airportsdata.load("IATA")

AIRLINES = AIRLINE_CODES

# Cities whose current name differs from the airport database's.
CITY_ALIASES = {
    "kochi": "COK", "cochin": "COK", "bengaluru": "BLR", "bangalore": "BLR", "mumbai": "BOM",
    "bombay": "BOM", "chennai": "MAA", "madras": "MAA", "kolkata": "CCU", "calcutta": "CCU",
    "delhi": "DEL", "new delhi": "DEL", "thiruvananthapuram": "TRV", "trivandrum": "TRV",
    "mysuru": "MYQ", "mangaluru": "IXE", "mangalore": "IXE", "hubballi": "HBX", "hubli": "HBX",
    "belagavi": "IXG", "belgaum": "IXG", "kozhikode": "CCJ", "calicut": "CCJ",
    "visakhapatnam": "VTZ", "vizag": "VTZ", "prayagraj": "IXD", "allahabad": "IXD",
    "vadodara": "BDQ", "baroda": "BDQ", "pune": "PNQ", "hyderabad": "HYD", "puducherry": "PNY",
    "frankfurt": "FRA", "munich": "MUC", "berlin": "BER", "dubai": "DXB", "doha": "DOH", "singapore": "SIN",
    "hong kong": "HKG", "amsterdam": "AMS", "zurich": "ZRH", "vienna": "VIE", "madrid": "MAD", "lisbon": "LIS",
    "istanbul": "IST", "abu dhabi": "AUH", "sydney": "SYD", "goa mopa": "GOX", "mopa": "GOX", "goa dabolim": "GOI", "dabolim": "GOI",
}


def code_for_city(name: str, country: str | None = None) -> str | None:
    """IATA code for a city name, or None if unknown or ambiguous (e.g. a city with two airports)."""
    key = " ".join(name.lower().replace(".", " ").split())
    if key in CITY_ALIASES:
        return CITY_ALIASES[key]
    hits = [
        code for code, a in _AIRPORTS.items()
        if (country is None or a.get("country") == country)
        and (a.get("city") or "").lower() == key
    ]
    return hits[0] if len(hits) == 1 else None


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


def distance_km(a: str, b: str) -> float | None:
    """Great-circle distance between two airports, used to sanity-check flight times."""
    pa, pb = airport(a), airport(b)
    if not (pa and pb and pa.get("lat") is not None and pb.get("lat") is not None):
        return None
    lat1, lon1, lat2, lon2 = map(radians, (float(pa["lat"]), float(pa["lon"]), float(pb["lat"]), float(pb["lon"])))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))


def expected_hours(a: str, b: str) -> float | None:
    """Rough block time: cruise at ~780 km/h plus ~40 min for taxi, climb and descent."""
    km = distance_km(a, b)
    return km / 780 + 0.65 if km is not None else None


@lru_cache(maxsize=1)
def _unique_cities() -> dict[str, str]:
    """City name -> code, for cities served by exactly one airport in the database."""
    seen: dict[str, list[str]] = {}
    for code, a in _AIRPORTS.items():
        city = (a.get("city") or "").strip().lower()
        if len(city) >= 4:
            seen.setdefault(city, []).append(code)
    return {city: codes[0] for city, codes in seen.items() if len(codes) == 1}


GENERIC_NAME_WORDS = {
    "airport", "international", "intl", "regional", "municipal", "domestic", "airfield", "field", "aerodrome",
    "air", "base", "county", "city", "the", "of", "de", "del", "da", "do", "and", "terminal",
}


def _key(text: str) -> str:
    return " ".join(w for w in re.sub(r"[^a-z ]", " ", text.lower()).split() if w not in GENERIC_NAME_WORDS)


@lru_cache(maxsize=1)
def _unique_names() -> dict[str, str]:
    """Distinctive airport names -> code: "heathrow", "london heathrow", "kempegowda", "indira gandhi"."""
    seen: dict[str, set[str]] = {}
    for code, a in _AIRPORTS.items():
        name, city = _key(a.get("name") or ""), _key(a.get("city") or "")
        for k in {name, name.removeprefix(city).strip()}:
            if len(k) >= 5:
                seen.setdefault(k, set()).add(code)
    return {k: next(iter(v)) for k, v in seen.items() if len(v) == 1}


def code_for_name(text: str) -> str | None:
    """Airport code for free text like "Kochi", "New Delhi" or "Frankfurt Airport" (None if unsure)."""
    key = " ".join(re.sub(r"[^a-z ]", " ", text.lower()).split())
    for suffix in (" international airport", " airport", " intl", " international"):
        key = key.removesuffix(suffix)
    if key in CITY_ALIASES:
        return CITY_ALIASES[key]
    if key in _unique_cities():
        return _unique_cities()[key]
    name = _key(text)
    # A single short word ("York", "Mobile") is too likely to be something else.
    if " " not in name and len(name) < 7:
        return None
    return _unique_names().get(name)