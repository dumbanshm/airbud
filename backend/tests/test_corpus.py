"""Many booking-email layouts, none with a dedicated parser, all read by the universal extractor.

Layouts are modelled on real airline and agency emails (Amadeus/GDS text, British Airways,
Ryanair, United, Expedia, Lufthansa, AirAsia, Qatar, Akasa, SpiceJet, Trip.com, ...); every
name, PNR and number in them is made up. Each case lists the flights it must produce.
"""

import io
import json
import zipfile
from datetime import datetime

import pytest

from app.parsing import parse_email, parse_raw
from app.parsing.types import EmailContent

HEADERS = "From: {sender}\nSubject: {subject}\nDate: Thu, 15 Oct 2026 10:00:00 +0000\nMIME-Version: 1.0\nContent-Type: text/{kind}; charset=utf-8\n\n"


def email(body: str, sender="Bookings <noreply@example.com>", subject="Your booking", kind="plain") -> str:
    return HEADERS.format(sender=sender, subject=subject, kind=kind) + body


# (id, raw email, expected PNR, [(flight, from, to, "YYYY-MM-DD HH:MM", "HH:MM" arrival or None)])
CASES = [
    ("amadeus_gds_names_only", email("""
BOOKING REF: QWE7RT
FLIGHT LH 401 - LUFTHANSA                    FRI 13 NOV 2026
DEPARTURE: FRANKFURT - 13 NOV 10:20
ARRIVAL:   NEW YORK JFK - 13 NOV 13:05
FLIGHT LH 400 - LUFTHANSA                    SUN 22 NOV 2026
DEPARTURE: NEW YORK JFK - 22 NOV 17:50
ARRIVAL:   FRANKFURT - 23 NOV 07:30
"""), "QWE7RT", [("LH401", "FRA", "JFK", "2026-11-13 10:20", "13:05"), ("LH400", "JFK", "FRA", "2026-11-22 17:50", "07:30")]),

    ("british_airways", email("""
British Airways booking reference: XK4P9Q
Your Itinerary
BA0981: British Airways | Euro Traveller | Confirmed
Depart: 28 Nov 2026 06:25 - Brandenburg (Berlin) - Terminal 1
Arrive: 28 Nov 2026 07:35 - Heathrow (London) - Terminal 5
Passenger list
MR ALEX RIVERA
""", sender="British Airways <BA@email.example.com>"), "XK4P9Q", [("BA981", "BER", "LHR", "2026-11-28 06:25", "07:35")]),

    ("ryanair_html", email("""<html><body>
<h2>Booking confirmed</h2><p>Reservation number: <b>RY7Z2K</b></p>
<table><tr><td>Flight FR 1234</td></tr>
<tr><td>Dublin (DUB)</td><td>to</td><td>London Stansted (STN)</td></tr>
<tr><td>Sat, 14 Nov 2026</td></tr><tr><td>Depart 06:30</td><td>Arrive 07:45</td></tr></table>
<p>Check-in closes 40 minutes before departure (05:50).</p></body></html>""", kind="html"),
     "RY7Z2K", [("FR1234", "DUB", "STN", "2026-11-14 06:30", "07:45")]),

    ("united_us_ampm_next_day", email("""
Confirmation number: F7GH2K
UA 857 · Wed, Nov 18, 2026
San Francisco, CA, US (SFO)
11:05 a.m.
Shanghai, CN (PVG)
3:50 p.m. Thu, Nov 19
Seat: 34C
"""), "F7GH2K", [("UA857", "SFO", "PVG", "2026-11-18 11:05", "15:50")]),

    ("expedia_flight_number_last", email("""
Expedia itinerary # 7312049981   Airline confirmation: BAX9P2
Departure Fri, Dec 4
New York (JFK) 6:00pm - London (LHR) 6:10am +1 day
British Airways 178
Return Thu, Dec 10
London (LHR) 11:40am - New York (JFK) 2:35pm
British Airways 117
""", sender="Expedia <travel@expedia.com>"),
     "BAX9P2", [("BA178", "JFK", "LHR", "2026-12-04 18:00", "06:10"), ("BA117", "LHR", "JFK", "2026-12-10 11:40", "14:35")]),

    ("lufthansa_german", email("""
Ihre Buchungsbestätigung – Buchungscode: LHDE42
LH 760   Frankfurt (FRA) – Bengaluru (BLR)
Mo, 23. Nov. 2026   Abflug 13:40   Ankunft 01:55 (+1)
Terminal 1
"""), "LHDE42", [("LH760", "FRA", "BLR", "2026-11-23 13:40", "01:55")]),

    ("airasia", email("""
Booking no.
AK7Q3X
Flight 1
  Sat, 05 Dec 2026
  Kuala Lumpur (KUL)
  08:30
  Terminal 2
  Singapore (SIN)
  09:35
  AK 701
"""), "AK7Q3X", [("AK701", "KUL", "SIN", "2026-12-05 08:30", "09:35")]),

    ("qatar_one_line", email("PNR: QR8M2L\nQR 557  Doha (DOH) to Bengaluru (BLR)  02 Dec 2026  02:10  08:50\n"),
     "QR8M2L", [("QR557", "DOH", "BLR", "2026-12-02 02:10", "08:50")]),

    ("akasa_pipes", email("PNR: AK2Z9W\nQP 1405 | BOM - BLR | 15 Dec 2026 | 06:05 - 07:50\n"),
     "AK2Z9W", [("QP1405", "BOM", "BLR", "2026-12-15 06:05", "07:50")]),

    ("spicejet_arrows", email("Booking Ref: SJ3K8M\nSG 8157   DEL 07:00 → BOM 09:10   Mon, 07 Dec 2026\n"),
     "SJ3K8M", [("SG8157", "DEL", "BOM", "2026-12-07 07:00", "09:10")]),

    ("singapore_overnight_plus1", email("Booking reference: SQ5T7N\nSQ 421   SIN 23:55 → BOM 02:50 (+1)   Tue, 01 Dec 2026\n"),
     "SQ5T7N", [("SQ421", "SIN", "BOM", "2026-12-01 23:55", "02:50")]),

    ("noise_boarding_gate_duration", email("""
PNR: NZ6Q1R
6E 556   Jaipur (JAI) → Bengaluru (BLR)   Fri, 20 Nov 2026
Bag drop closes 18:00   Boarding 18:25   Gate closes 18:35
Departs 19:00   Arrives 21:35   Duration 02:35
"""), "NZ6Q1R", [("6E556", "JAI", "BLR", "2026-11-20 19:00", "21:35")]),

    ("noise_unlabelled_times", email("""
Booking ID: UL7K2D
IX 1234 BLR DXB 27 Nov 2026
Check-in closes 20:40
21:40 00:30
Duration 4h 20m
"""), "UL7K2D", [("IX1234", "BLR", "DXB", "2026-11-27 21:40", "00:30")]),

    ("trip_com_iso_dates", email("""
Trip.com Booking No.: 1128834455
Airline Booking Reference: CA9B4Z
Flight: CA 984
2026-12-01 13:00 Los Angeles International Airport (LAX) T B
2026-12-02 18:30 Beijing Capital International Airport (PEK) T3
"""), "CA9B4Z", [("CA984", "LAX", "PEK", "2026-12-01 13:00", "18:30")]),

    ("round_trip_numeric_dates", email("""
Confirmation code: EZ4R8T
Outbound  U2 8001   London Gatwick (LGW) 07:15 → Geneva (GVA) 09:55   21/11/2026
Return    U2 8004   Geneva (GVA) 18:20 → London Gatwick (LGW) 19:00   28/11/2026
"""), "EZ4R8T", [("U28001", "LGW", "GVA", "2026-11-21 07:15", "09:55"), ("U28004", "GVA", "LGW", "2026-11-28 18:20", "19:00")]),

    ("no_year_dates_infer_upcoming", email("PNR: VA2N5S\nVistara UK 819  BLR 08:10 - DEL 11:00  Sun 08 Nov\n"),
     "VA2N5S", [("UK819", "BLR", "DEL", "2026-11-08 08:10", "11:00")]),

    ("connection_two_legs_same_day", email("""
Booking reference: EK3D6F
EK 511  DEL 04:15 → DXB 06:20  Tue, 27 Oct 2026
EK 29   DXB 08:30 → LHR 12:45  Tue, 27 Oct 2026
"""), "EK3D6F", [("EK511", "DEL", "DXB", "2026-10-27 04:15", "06:20"), ("EK29", "DXB", "LHR", "2026-10-27 08:30", "12:45")]),

    ("aircraft_type_not_a_flight", email("""
PNR: AI4G7H
AI 2810 (Airbus A321neo)   BLR 06:00 → DEL 08:45   Fri, 23 Oct 2026
"""), "AI4G7H", [("AI2810", "BLR", "DEL", "2026-10-23 06:00", "08:45")]),
]

NEGATIVE = [
    ("promo", email("Fly to Goa from ₹2,999! Book IndiGo flights DEL, BOM and BLR. Sale ends 20 Oct 2026, 23:59.")),
    ("newsletter", email("Air India's AI 171 crash report is out. Read at 07:30 tomorrow. Markets closed at 15:30 on 12 Oct 2026.")),
    ("ride_receipt", email("Your ride on 14 Oct 2026 from Koramangala to BLR Airport T1. Pickup 05:10, drop 06:05. Fare ₹1,240.")),
    ("hotel", email("Booking confirmed: Hotel Mango Hill, Chennai. Check-in 15 Nov 2026 14:00, check-out 17 Nov 2026 11:00. Booking ID: HT88231.")),
]


@pytest.mark.parametrize("name,raw,pnr,legs", CASES, ids=[c[0] for c in CASES])
def test_layout(name, raw, pnr, legs):
    booking = parse_email(parse_raw(raw)).booking
    assert booking is not None, f"{name}: nothing extracted"
    got = [(s.flight_number, s.dep_airport, s.arr_airport, f"{s.dep_local:%Y-%m-%d %H:%M}",
            f"{s.arr_local:%H:%M}" if s.arr_local else None) for s in booking.segments]
    assert got == legs
    assert booking.pnr == pnr


@pytest.mark.parametrize("name,raw", NEGATIVE, ids=[c[0] for c in NEGATIVE])
def test_not_a_flight(name, raw):
    assert parse_email(parse_raw(raw)).booking is None


def test_cancellation_is_detected():
    raw = email("We're sorry. Your flight 6E 2134 BLR 10:00 → DEL 12:45 on 12 Dec 2026 has been cancelled. PNR: CX4L9P",
                subject="Flight cancelled")
    booking = parse_email(parse_raw(raw)).booking
    assert booking.cancelled and booking.pnr == "CX4L9P"


def test_confirmation_mentioning_cancel_link_is_not_cancelled():
    raw = email("PNR: OK3J5H\n6E 2134 BLR 10:00 → DEL 12:45 12 Dec 2026\nCancel or change your booking online.")
    assert not parse_email(parse_raw(raw)).booking.cancelled


def _pdf(lines: list[str]) -> bytes:
    """A minimal single-page PDF with the given text lines (enough for pypdf to extract)."""
    stream = "BT /F1 11 Tf 40 800 Td 14 TL " + " ".join(f"({line}) Tj T*" for line in lines) + " ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = "%PDF-1.4\n", []
    for i, obj in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{obj}\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offsets)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF"
    return out.encode("latin-1")


def test_pdf_attachment_eticket():
    pdf = _pdf(["E-TICKET   Booking reference: PD7F3T", "Flight QR 557   Doha (DOH) - Bengaluru (BLR)",
                "02 Dec 2026   Departure 02:10   Arrival 08:50"])
    content = EmailContent(subject="Your e-ticket", sender="tickets@agency.example", text="Your e-ticket is attached.",
                           date=datetime(2026, 10, 15), pdf_texts=[])
    from app.parsing.email_utils import pdf_to_text

    content.pdf_texts.append(pdf_to_text(pdf))
    booking = parse_email(content).booking
    assert booking.pnr == "PD7F3T"
    (seg,) = booking.segments
    assert (seg.flight_number, seg.dep_airport, seg.arr_airport, seg.dep_local) == ("QR557", "DOH", "BLR", datetime(2026, 12, 2, 2, 10))


def _pkpass(bcbp: str, departs: str | None) -> bytes:
    fields = [{"key": "departs", "label": "Departs", "value": departs}] if departs else []
    pass_json = {"formatVersion": 1, "barcodes": [{"format": "PKBarcodeFormatPDF417", "message": bcbp}],
                 "boardingPass": {"transitType": "PKTransitTypeAir", "primaryFields": fields}}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("pass.json", json.dumps(pass_json))
    return buf.getvalue()


BCBP = "M1RIVERA/ALEX         EPK4X7Z BLRDELAI 2810 296Y014C0042 100"  # day 296 = 23 Oct


def test_wallet_pass_adds_seat_to_flight_from_email():
    content = parse_raw(email("PNR: PK4X7Z\nAI 2810  BLR 06:00 → DEL 08:45  Fri, 23 Oct 2026"))
    content.passes.append(_pkpass(BCBP, None))
    booking = parse_email(content).booking
    (seg,) = booking.segments
    assert seg.seats == ["14C"] and seg.dep_local == datetime(2026, 10, 23, 6, 0)


def test_wallet_pass_alone_with_departure_time():
    content = parse_raw(email("Your boarding pass is attached."))
    content.passes.append(_pkpass(BCBP, "2026-10-23T06:00+05:30"))
    booking = parse_email(content).booking
    (seg,) = booking.segments
    assert (seg.flight_number, seg.dep_airport, seg.arr_airport) == ("AI2810", "BLR", "DEL")
    assert seg.dep_local == datetime(2026, 10, 23, 6, 0) and seg.time_known and seg.passengers == ["Alex Rivera"]


def test_barcode_without_time_never_creates_a_flight():
    content = parse_raw(email("Your boarding pass is attached."))
    content.passes.append(_pkpass(BCBP, None))
    booking = parse_email(content).booking
    assert booking is not None and not booking.segments[0].time_known  # stored only as an enrichment


def test_split_flight_number_and_airline_name_line():
    # EaseMyTrip: "IndiGo" then "6E" / "-" / "5108" on separate lines; "IndiGo 6" is not a flight.
    raw = email("PNR: Z7H6ZQ\nIndiGo\n6E\n-\n5108\nTue 16 Dec 2026\nGOI\n18:55\n"
                "Dabolim Goa International Airport\n01h 30m\nBOM\n20:25\n")
    (seg,) = parse_email(parse_raw(raw)).booking.segments
    assert (seg.flight_number, seg.dep_airport, seg.arr_airport) == ("6E5108", "GOI", "BOM")


def test_invoice_amounts_are_not_times():
    raw = email("PNR : N5L8FI  Flight No : 6E - 556  From : JAI  To : BLR\nDate : 23-Jun-2026\n"
                "IGST 0.00  CGST 2.50  Total 3,050.00", subject="TaxInvoice - RJ1262706AE48723")
    assert parse_email(parse_raw(raw)).booking is None
    raw = email("Flight 6E 556 JAI BLR 23-Jun-2026 Amount 10.40 Tax 12.50", subject="Payment")
    assert parse_email(parse_raw(raw)).booking is None
