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
    pdf_texts: list[str] = field(default_factory=list)  # text of PDF attachments (e-tickets)
    passes: list[bytes] = field(default_factory=list)  # Apple Wallet .pkpass attachments
    pdf_barcodes: list[tuple[str, str]] = field(default_factory=list)  # (text, format) read from PDF images
    # The airline's originals, keyed by barcode text: the code exactly as printed (PNG cut from the
    # PDF page) and the file it came from ((filename, content type, bytes): the PDF or .pkpass).
    barcode_crops: dict[str, bytes] = field(default_factory=dict)
    barcode_sources: dict[str, tuple[str, str, bytes]] = field(default_factory=dict)
    pass_names: list[str] = field(default_factory=list)  # filenames of `passes`


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
    # False when only the date is known (e.g. a boarding-pass barcode). Such legs only add seat /
    # passenger details to a flight we already know; they never create one or move its time.
    time_known: bool = True
    # The boarding pass barcode, to show at the gate: raw message and "pdf417" | "qr" | "aztec".
    barcode_message: str | None = None
    barcode_format: str | None = None
    barcode_image: bytes | None = None  # the airline's own barcode, cropped from its PDF (PNG)
    pass_file: tuple[str, str, bytes] | None = None  # the original boarding pass file


@dataclass
class ParsedBooking:
    pnr: str | None
    segments: list[ParsedSegment]
    airline_name: str | None = None
    cancelled: bool = False
    parser: str = ""
    notes: list[str] = field(default_factory=list)  # why legs were skipped, shown in the app
