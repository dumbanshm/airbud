from sqlmodel import Session, SQLModel, select

from app.db import engine, init_db
from app.ingest import ingest_email
from app.models import Segment, User

CONFIRMATION = """From: Alliance Air Booking <bookings@allianceair.in>
Subject: Booking Confirmation - ALLIANCE AIR - TEST34
Date: Thu, 24 Sep 2026 10:00:00 +0000

Dear MR/MRS/MS ALEX RIVERA
Your PNR is TEST34 – 9I507 09 OCT 2026 BENGALURU Departure 0705 hours KOCHI Arrival 0840 hours.
"""
ALERT = """From: Flight Alliance Air <flightalerts@allianceair.in>
Subject: Important information for your Alliance Air flight
Date: Mon, 05 Oct 2026 10:00:00 +0000

Dear Customer,
Flight 9I-507 BLR-COK on 09-Oct-26 is rescheduled to DEP 08:05 Hours & ARR 09:40 Hours.
"""


def test_reschedule_alert_without_reference_updates_the_existing_flight():
    init_db()
    with Session(engine) as s:
        user = User(email="ingest-test@example.com")
        s.add(user)
        s.commit()
        s.refresh(user)
        ingest_email(s, user, CONFIRMATION, "m1")
        _, changes = ingest_email(s, user, ALERT, "m2")
        (seg,) = s.exec(select(Segment).where(Segment.user_id == user.id)).all()
        assert f"{seg.dep_local:%H:%M}-{seg.arr_local:%H:%M}" == "08:05-09:40"
        assert seg.change_note == "Departure moved from 07:05 to 08:05"
        assert [c.kind for c in changes] == ["updated"]
