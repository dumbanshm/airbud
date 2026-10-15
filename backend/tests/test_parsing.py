from datetime import datetime, timezone
from pathlib import Path

from app.demo import render_demo_emails
from app.parsing import parse_email, parse_raw
from app.parsing.airports import local_to_utc

NOW = datetime(2026, 10, 15, 6, 0, tzinfo=timezone.utc)
EMAILS = dict(render_demo_emails(NOW))


def parse(name):
    return parse_email(parse_raw(EMAILS[name])).booking


def test_schema_org_merges_passengers_and_converts_timezone():
    b = parse("01_air_india_confirmation")
    assert b.parser == "schema_org" and b.pnr == "QX7P2M"
    out, back = b.segments
    assert out.flight_number == "AI503" and (out.dep_airport, out.arr_airport) == ("BLR", "DEL")
    assert out.passengers == ["Demo Traveler", "Sam Traveler"] and out.seats == ["14C", "14D"]
    assert out.dep_terminal == "2"
    # 06:00Z + 3h05 = 09:05Z = 14:35 IST
    assert out.dep_local == datetime(2026, 10, 15, 14, 35)
    assert back.flight_number == "AI504" and back.dep_local == datetime(2026, 10, 20, 18, 5)


def test_plain_text_itinerary():
    b = parse("02_emirates_itinerary")
    assert b.parser == "generic_text" and b.pnr == "K4T9WD"
    first, second = b.segments
    assert (first.flight_number, first.dep_airport, first.arr_airport) == ("EK511", "DEL", "DXB")
    assert first.dep_local == datetime(2026, 10, 27, 4, 15) and first.arr_local == datetime(2026, 10, 27, 6, 20)
    assert first.dep_terminal == "3" and first.seats == ["34K"]
    assert (second.flight_number, second.dep_airport, second.arr_airport) == ("EK29", "DXB", "LHR")


def test_calendar_attachment_utc_becomes_airport_local():
    b = parse("03_indigo_calendar")
    assert b.parser == "ics" and b.pnr == "R8LMQZ"
    (seg,) = b.segments
    assert seg.flight_number == "6E2134"
    assert seg.dep_local == datetime(2026, 10, 5, 20, 0)  # 14:30Z in Mumbai


def test_newsletter_is_ignored():
    assert parse("04_newsletter") is None


def test_overnight_arrival_rolls_to_next_day():
    raw = "Booking reference: ABC123\n6E 1001  Bengaluru (BLR) → Delhi (DEL)\n12 Nov 2026  Departs 23:10  Arrives 01:55"
    (seg,) = parse_email(parse_raw(raw)).booking.segments
    assert seg.arr_local == datetime(2026, 11, 13, 1, 55)


def test_impossible_flight_is_dropped():
    raw = "PNR: ZZZ999\nAI 101  Delhi (DEL) → New York (JFK)\n12 Nov 2026  Departs 02:00  Arrives 01:00"
    result = parse_email(parse_raw(raw))
    # 02:00 IST → 01:00 next day EST is ~23h30, longer than any real flight
    assert result.booking is None and "implausible" in result.notes[0]


def test_dst_handled_by_airport_zone():
    # London is on GMT after the last Sunday of October 2026 (Oct 25)
    assert local_to_utc(datetime(2026, 10, 24, 12, 0), "LHR") == datetime(2026, 10, 24, 11, 0)
    assert local_to_utc(datetime(2026, 10, 27, 12, 0), "LHR") == datetime(2026, 10, 27, 12, 0)


def test_indigo_itinerary_one_and_two_line_rows():
    raw = (Path(__file__).parent / "emails" / "indigo_itinerary.eml").read_text()
    b = parse_email(parse_raw(raw)).booking
    assert b.parser == "indigo" and b.pnr == "TEST12"
    first, second = b.segments
    assert (first.flight_number, first.dep_airport, first.arr_airport) == ("6E7163", "IXM", "BLR")
    assert first.dep_local == datetime(2026, 4, 23, 17, 25) and first.dep_terminal == "1"
    # One-line row (no aircraft type), city "Goa" resolved from the code pairs.
    assert (second.flight_number, second.dep_airport, second.arr_airport) == ("6E977", "BLR", "GOI")
    assert second.arr_local == datetime(2026, 4, 23, 23, 55) and second.arr_terminal is None
    assert first.passengers == ["Alex Rivera"]


def _fixture(name):
    return parse_email(parse_raw((Path(__file__).parent / "emails" / name).read_text())).booking


def test_alliance_air_sentence_and_city_names():
    b = _fixture("alliance_air.eml")
    (seg,) = b.segments
    assert (b.parser, b.pnr) == ("alliance_air", "TEST34")
    assert (seg.flight_number, seg.dep_airport, seg.arr_airport) == ("9I507", "BLR", "COK")  # KOCHI -> COK
    assert seg.dep_local == datetime(2026, 10, 9, 7, 5) and seg.passengers == ["Alex Rivera"]


def test_amazonpay_uses_html_when_plain_text_is_empty():
    b = _fixture("amazonpay_makemytrip.eml")
    assert (b.parser, b.pnr) == ("makemytrip", "TEST56")
    first, second = b.segments  # the baggage table's repeat of AI-414 is ignored
    assert (first.flight_number, first.dep_airport, first.arr_airport) == ("AI414", "JAI", "BOM")
    assert second.arr_local == datetime(2026, 11, 13, 1, 45) and first.passengers == ["Alex Rivera"]


def test_cleartrip_reads_html_not_glued_plain_text():
    b = _fixture("cleartrip.eml")
    (seg,) = b.segments
    assert (b.parser, b.pnr, seg.passengers) == ("cleartrip", "TEST78", ["Alex Rivera"])
    assert (seg.flight_number, seg.dep_airport, seg.arr_airport) == ("AI2810", "BLR", "DEL")
    assert seg.arr_local == datetime(2026, 10, 23, 8, 45)


def test_away_label_value_list():
    b = _fixture("away.eml")
    (seg,) = b.segments
    assert (b.parser, b.pnr, seg.flight_number) == ("away", "TEST90", "6E415")
    assert (seg.dep_airport, seg.arr_airport, seg.dep_local) == ("BLR", "JAI", datetime(2026, 11, 5, 9, 0))
