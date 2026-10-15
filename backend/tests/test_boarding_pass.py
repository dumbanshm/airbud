"""Boarding pass barcodes are kept so the app can show the real pass. All data here is made up."""

import io
import json
import zipfile
from datetime import datetime, timezone
from email.message import EmailMessage

import zxingcpp
from PIL import Image
from sqlmodel import Session, select

from app.api import serialize
from app.db import engine, init_db
from app.ingest import ingest_email
from app.models import Booking, Segment, User
from app.parsing import parse_email, parse_raw

BCBP = "M1RIVERA/ALEX         EPK4X7Z BLRDELAI 2810 296Y014C0042 100"  # day 296 = 23 Oct
INDIGO_BCBP = "M1SHARMA/PRIYA        EQ7TEST BLRGOI6E 0512 297Y012A0007 100"  # day 297 = 24 Oct
HEADER = "From: {sender}\nSubject: {subject}\nDate: Thu, 15 Oct 2026 10:00:00 +0000\n\n"


def _pkpass(message: str, fmt: str) -> bytes:
    pass_json = {"formatVersion": 1, "barcodes": [{"format": fmt, "message": message, "messageEncoding": "iso-8859-1"}],
                 "boardingPass": {"transitType": "PKTransitTypeAir",
                                  "primaryFields": [{"key": "departs", "label": "Departs", "value": "2026-10-23T06:00+05:30"}]}}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("pass.json", json.dumps(pass_json))
    return buf.getvalue()


def _pdf417_pdf(message: str) -> bytes:
    """A one-page PDF with a PDF417 barcode image on it, like an airline's boarding pass PDF."""
    code = zxingcpp.write_barcode_to_image(zxingcpp.create_barcode(message, zxingcpp.BarcodeFormat.PDF417), scale=3)
    height, width = code.shape[:2]
    barcode = Image.frombytes("L", (width, height), bytes(memoryview(code)))
    page = Image.new("L", (1240, 1754), 255)  # A4 at 150 dpi
    page.paste(barcode, (200, 900))
    buf = io.BytesIO()
    page.save(buf, "PDF", resolution=150)
    return buf.getvalue()


def _email_with_pdf(pdf: bytes) -> bytes:
    msg = EmailMessage()
    msg["From"] = "IndiGo <noreply@goindigo.in>"
    msg["Subject"] = "Boarding Pass for PNR Q7TEST"
    msg["Date"] = "Thu, 22 Oct 2026 10:00:00 +0000"
    msg.set_content("Please find your boarding pass attached.")
    # IndiGo sends it as application/octet-stream with a .pdf name.
    msg.add_attachment(pdf, maintype="application", subtype="octet-stream", filename="BoardingPass-Q7TEST.pdf")
    return msg.as_bytes()


def test_wallet_pass_keeps_barcode_and_format():
    content = parse_raw(HEADER.format(sender="Air India <noreply@airindia.com>", subject="Boarding pass") + "Attached.")
    content.passes.append(_pkpass(BCBP, "PKBarcodeFormatPDF417"))
    (seg,) = parse_email(content).booking.segments
    assert (seg.barcode_message, seg.barcode_format) == (BCBP, "pdf417")
    assert seg.seats == ["14C"] and seg.time_known


def test_wallet_pass_barcode_merges_into_flight_from_email():
    content = parse_raw(HEADER.format(sender="Bookings <noreply@example.com>", subject="Your booking")
                        + "PNR: PK4X7Z\nAI 2810  BLR 06:00 → DEL 08:45  Fri, 23 Oct 2026")
    content.passes.append(_pkpass(BCBP, "PKBarcodeFormatQR"))
    (seg,) = parse_email(content).booking.segments
    assert (seg.barcode_message, seg.barcode_format) == (BCBP, "qr")


def test_pdf417_image_in_pdf_is_decoded():
    content = parse_raw(_email_with_pdf(_pdf417_pdf(INDIGO_BCBP)))
    assert content.pdf_barcodes == [(INDIGO_BCBP, "pdf417")]
    (seg,) = parse_email(content).booking.segments
    assert (seg.flight_number, seg.dep_airport, seg.arr_airport, seg.seats) == ("6E512", "BLR", "GOI", ["12A"])
    assert seg.barcode_format == "pdf417" and not seg.time_known


def test_pdf_boarding_pass_attaches_barcode_to_known_flight():
    init_db()
    with Session(engine) as s:
        user = User(email="boarding-pass-test@example.com")
        s.add(user)
        s.commit()
        s.refresh(user)
        itinerary = HEADER.format(sender="Bookings <noreply@example.com>", subject="Your booking") + \
            "PNR: Q7TEST\n6E 512  BLR 09:15 → GOI 10:40  Sat, 24 Oct 2026"
        ingest_email(s, user, itinerary, "bp1")
        (seg,) = s.exec(select(Segment).where(Segment.user_id == user.id)).all()
        assert seg.barcode_message is None
        ingest_email(s, user, _email_with_pdf(_pdf417_pdf(INDIGO_BCBP)), "bp2")
        s.refresh(seg)
        assert seg.dep_local == datetime(2026, 10, 24, 9, 15) and seg.seats == "12A"
        out = serialize(seg, s.get(Booking, seg.booking_id), datetime.now(timezone.utc).replace(tzinfo=None))
        assert out["boarding_pass"] == {"message": INDIGO_BCBP, "format": "pdf417"}


def test_wallet_pass_does_not_erase_arrival_or_report_a_change():
    init_db()
    with Session(engine) as s:
        user = User(email="wallet-pass-test@example.com")
        s.add(user)
        s.commit()
        s.refresh(user)
        itinerary = HEADER.format(sender="Bookings <noreply@example.com>", subject="Your booking") + \
            "PNR: PK4X7Z\nAI 2810  BLR 06:00 → DEL 08:45  Fri, 23 Oct 2026"
        ingest_email(s, user, itinerary, "wp1")
        msg = EmailMessage()
        msg["From"], msg["Subject"], msg["Date"] = "Air India <noreply@airindia.com>", "Boarding pass", "Thu, 22 Oct 2026 10:00:00 +0000"
        msg.set_content("Attached.")
        msg.add_attachment(_pkpass(BCBP, "PKBarcodeFormatPDF417"), maintype="application", subtype="vnd.apple.pkpass", filename="pass.pkpass")
        _, changes = ingest_email(s, user, msg.as_bytes(), "wp2")
        (seg,) = s.exec(select(Segment).where(Segment.user_id == user.id)).all()
        assert changes == [] and seg.change_note is None
        assert seg.arr_local == datetime(2026, 10, 23, 8, 45) and seg.barcode_format == "pdf417"
