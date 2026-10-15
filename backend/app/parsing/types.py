from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class EmailContent:
    subject: str = ""
    sender: str = ""
    message_id: str | None = None
    date: datetime | None = None
    html: str | None = None
    text: str = ""
    calendars: list[str] = field(default_factory=list)  # raw .ics bodies


@dataclass
class ParsedSegment:
    flight_number: str  # normalised, e.g. "6E2134"
    dep_airport: str
    arr_airport: str
    dep_local: datetime  # naive wall-clock time at the departure airport
    arr_local: datetime | None = None  # naive wall-clock time at the arrival airport
    airline_code: str | None = None
    airline_name: str | None = None
    passengers: list[str] = field(default_factory=list)
    seats: list[str] = field(default_factory=list)
    dep_terminal: str | None = None
    arr_terminal: str | None = None


@dataclass
class ParsedBooking:
    pnr: str | None
    segments: list[ParsedSegment]
    airline_name: str | None = None
    cancelled: bool = False
    parser: str = ""
