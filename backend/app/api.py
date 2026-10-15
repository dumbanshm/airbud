import hashlib
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from . import checkin, flight_status, gmail, push
from .config import settings
from .db import get_session
from .deps import current_user
from .ingest import ingest_email
from .models import Booking, InboundEmail, PushToken, Segment, User, utcnow
from .parsing import airports

router = APIRouter(tags=["app"])


def _iso_utc(dt: datetime | None) -> str | None:
    return dt.replace(microsecond=0).isoformat() + "Z" if dt else None


def _side(code: str, local: datetime | None, tz: str, utc: datetime | None, terminal: str | None) -> dict:
    a = airports.airport(code) or {}
    return {
        "airport": code,
        "city": a.get("city") or code,
        "name": a.get("name"),
        "terminal": terminal,
        # Wall-clock time with the airport's offset, e.g. 2026-10-20T18:05:00+05:30. The app shows
        # this as-is, so times always read the way the airline printed them.
        "local_time": local.replace(tzinfo=ZoneInfo(tz)).isoformat() if local else None,
        "tz": tz,
        "utc": _iso_utc(utc),
    }


def serialize(seg: Segment, booking: Booking, now: datetime) -> dict:
    duration = int((seg.arr_utc - seg.dep_utc).total_seconds() // 60) if seg.arr_utc else None
    return {
        "id": seg.id,
        "pnr": booking.pnr,
        "flight_number": airports.display_flight_number(seg.flight_number),
        "airline_code": seg.airline_code,
        "airline_name": seg.airline_name or booking.airline_name,
        "passengers": [p for p in seg.passengers.split(", ") if p],
        "seats": [s for s in seg.seats.split(", ") if s],
        "departure": _side(seg.dep_airport, seg.dep_local, seg.dep_tz, seg.dep_utc, seg.dep_terminal),
        "arrival": _side(seg.arr_airport, seg.arr_local, seg.arr_tz, seg.arr_utc, seg.arr_terminal),
        "boarding_utc": _iso_utc(flight_status.boarding_utc(seg)),
        "boarding_is_estimate": True,
        "duration_minutes": duration,
        "status": flight_status.status_for(seg, now),
        "change_note": seg.change_note,
        "boarding_pass": {"message": seg.barcode_message, "format": seg.barcode_format} if seg.barcode_message else None,
        "checkin": checkin.window(seg),
        # DigiYatra covers departures from Indian airports.
        "digiyatra": (airports.airport(seg.dep_airport) or {}).get("country") == "IN",
        "updated_at": _iso_utc(seg.updated_at),
    }


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "is_demo": user.is_demo,
        "gmail_connected": user.gmail_connected,
        "gmail_error": user.gmail_error,
        "last_synced_at": _iso_utc(user.last_synced_at),
    }


@router.get("/flights")
def flights(user: User = Depends(current_user), session: Session = Depends(get_session)):
    rows = session.exec(
        select(Segment, Booking).join(Booking).where(Segment.user_id == user.id).order_by(Segment.dep_utc)
    ).all()
    now = utcnow()
    return [serialize(seg, booking, now) for seg, booking in rows]


@router.get("/flights/{segment_id}")
def flight(segment_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)):
    seg = session.get(Segment, segment_id)
    if not seg or seg.user_id != user.id:
        raise HTTPException(404, "Flight not found")
    return serialize(seg, session.get(Booking, seg.booking_id), utcnow())


@router.post("/sync")
def sync(user: User = Depends(current_user), session: Session = Depends(get_session)):
    if user.is_demo:
        return {"ok": True, "demo": True, "checked": 0, "parsed": 0, "changes": 0}
    if not settings.google_enabled:
        raise HTTPException(503, "Google isn't configured on this server")
    return gmail.sync_user(session, user)


@router.get("/emails")
def emails(user: User = Depends(current_user), session: Session = Depends(get_session)):
    rows = session.exec(
        select(InboundEmail).where(InboundEmail.user_id == user.id).order_by(InboundEmail.id.desc()).limit(100)
    ).all()
    return [
        {"id": r.id, "subject": r.subject, "sender": r.sender, "status": r.status, "parser": r.parser,
         "detail": r.detail, "received_at": _iso_utc(r.received_at or r.created_at)}
        for r in rows
    ]


class ImportIn(BaseModel):
    raw: str  # a full .eml, or just the HTML/text body


@router.post("/emails/import")
def import_email(body: ImportIn, user: User = Depends(current_user), session: Session = Depends(get_session)):
    """Feed in an email by hand. Handy for testing a parser against a real email."""
    mid = "manual-" + hashlib.sha256(body.raw.encode()).hexdigest()[:16]
    row, changes = ingest_email(session, user, body.raw, mid)
    push.notify_changes(session, user.id, changes)
    return {"status": row.status, "parser": row.parser, "detail": row.detail, "changes": len(changes)}


class PushRegisterIn(BaseModel):
    token: str
    platform: str | None = None


@router.post("/push/register")
def push_register(body: PushRegisterIn, user: User = Depends(current_user), session: Session = Depends(get_session)):
    if not body.token.startswith(("ExponentPushToken[", "ExpoPushToken[")):
        raise HTTPException(400, "Expected an Expo push token")
    row = session.exec(select(PushToken).where(PushToken.token == body.token)).first() or PushToken(token=body.token, user_id=user.id)
    row.user_id, row.platform = user.id, body.platform  # a phone can switch accounts
    session.add(row)
    session.commit()
    return {"ok": True}


@router.post("/push/test")
def push_test(user: User = Depends(current_user), session: Session = Depends(get_session)):
    return push.send_to_user(session, user.id, "Test from your server ✈️", "Remote push works.", {"url": "/settings"})
