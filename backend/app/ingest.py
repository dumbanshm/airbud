"""Store parsed bookings, merging updates (schedule changes, cancellations) into existing rows."""

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlmodel import Session, select

from .models import Booking, InboundEmail, Segment, User, utcnow
from .parsing import ParsedBooking, ParsedSegment, airports, parse_email, parse_raw

log = logging.getLogger(__name__)

RAW_KEEP_LIMIT = 300_000  # characters of a failed email kept for writing a parser


@dataclass
class Change:
    kind: str  # new | updated | cancelled
    segment: Segment
    note: str


def _fmt(dt: datetime | None) -> str:
    return dt.strftime("%a %d %b %H:%M") if dt else "?"


def _find_existing(session: Session, booking: Booking, seg: ParsedSegment) -> Segment | None:
    """Same flight number in the same booking, within two days: a schedule change, not a new leg."""
    rows = session.exec(
        select(Segment).where(Segment.booking_id == booking.id, Segment.flight_number == seg.flight_number)
    ).all()
    rows = [r for r in rows if abs(r.dep_local - seg.dep_local) <= timedelta(days=2)]
    return min(rows, key=lambda r: abs(r.dep_local - seg.dep_local)) if rows else None


def _apply(row: Segment, seg: ParsedSegment) -> None:
    row.airline_code = seg.airline_code or row.airline_code
    row.airline_name = seg.airline_name or row.airline_name
    row.dep_airport, row.arr_airport = seg.dep_airport, seg.arr_airport
    row.dep_local, row.arr_local = seg.dep_local, seg.arr_local
    row.dep_tz = airports.tz_name(seg.dep_airport)
    row.arr_tz = airports.tz_name(seg.arr_airport)
    row.dep_utc = airports.local_to_utc(seg.dep_local, seg.dep_airport)
    row.arr_utc = airports.local_to_utc(seg.arr_local, seg.arr_airport) if seg.arr_local else None
    row.dep_terminal = seg.dep_terminal or row.dep_terminal
    row.arr_terminal = seg.arr_terminal or row.arr_terminal
    if seg.passengers:
        row.passengers = ", ".join(seg.passengers)
    if seg.seats:
        row.seats = ", ".join(seg.seats)
    row.updated_at = utcnow()


def store_booking(session: Session, user: User, parsed: ParsedBooking) -> list[Change]:
    pnr = parsed.pnr
    if not pnr:
        # No reference found: key on the first leg so re-reading the same email doesn't duplicate it.
        first = parsed.segments[0]
        pnr = "NOREF-" + hashlib.sha1(f"{first.flight_number}{first.dep_local:%Y%m%d}".encode()).hexdigest()[:6].upper()

    booking = session.exec(select(Booking).where(Booking.user_id == user.id, Booking.pnr == pnr)).first()
    if booking is None:
        booking = Booking(user_id=user.id, pnr=pnr, airline_name=parsed.airline_name)
        session.add(booking)
        session.flush()
    booking.updated_at = utcnow()

    changes: list[Change] = []
    if parsed.cancelled:
        booking.cancelled = True
        for seg in parsed.segments:
            row = _find_existing(session, booking, seg)
            if row and not row.cancelled:
                row.cancelled = True
                row.change_note = "Cancelled by the airline"
                changes.append(Change("cancelled", row, f"{row.flight_number} on {_fmt(row.dep_local)} was cancelled"))
        return changes

    for seg in parsed.segments:
        row = _find_existing(session, booking, seg)
        if row is None:
            row = Segment(booking_id=booking.id, user_id=user.id, flight_number=seg.flight_number,
                          dep_airport="", arr_airport="", dep_local=seg.dep_local, dep_tz="", arr_tz="", dep_utc=seg.dep_local)
            _apply(row, seg)
            session.add(row)
            session.flush()
            changes.append(Change("new", row, f"{seg.dep_airport} → {seg.arr_airport} on {_fmt(seg.dep_local)}"))
        elif row.dep_local != seg.dep_local or row.arr_local != seg.arr_local:
            old = row.dep_local
            _apply(row, seg)
            fmt = (lambda d: d.strftime("%H:%M")) if old.date() == seg.dep_local.date() else _fmt
            row.change_note = f"Departure moved from {fmt(old)} to {fmt(seg.dep_local)}"
            changes.append(Change("updated", row, row.change_note))
        else:
            _apply(row, seg)
    return changes


def reparse_unmatched(session: Session, user: User) -> list[Change]:
    """Re-run the parsers over emails that failed before (their raw body is kept for this).

    Runs when the server starts, so adding or fixing an airline parser picks up old emails.
    """
    rows = session.exec(
        select(InboundEmail).where(
            InboundEmail.user_id == user.id, InboundEmail.status.in_(["no_match", "error"]), InboundEmail.raw.is_not(None)
        )
    ).all()
    changes: list[Change] = []
    for row in rows:
        try:
            result = parse_email(parse_raw(row.raw))
            if not result.booking:
                continue
            changes += store_booking(session, user, result.booking)
        except Exception:
            log.exception("reparse failed for %s", row.message_id)
            session.rollback()
            continue
        n = len(result.booking.segments)
        row.status, row.parser, row.raw = "parsed", result.booking.parser, None
        row.detail = "; ".join([f"{n} flight{'s' * (n != 1)} (re-read)"] + result.notes)
        session.add(row)
        session.commit()
    return changes


def ingest_email(
    session: Session, user: User, raw: bytes | str, message_id: str, received_at: datetime | None = None
) -> tuple[InboundEmail, list[Change]]:
    """Parse one email and store the result. Safe to call twice with the same message_id."""
    existing = session.exec(
        select(InboundEmail).where(InboundEmail.user_id == user.id, InboundEmail.message_id == message_id)
    ).first()
    if existing:
        return existing, []

    log_row = InboundEmail(user_id=user.id, message_id=message_id, received_at=received_at, status="error")
    changes: list[Change] = []
    try:
        content = parse_raw(raw)
        log_row.subject = content.subject[:300] or None
        log_row.sender = content.sender[:300] or None
        result = parse_email(content)
        if result.booking:
            changes = store_booking(session, user, result.booking)
            log_row.status = "parsed"
            log_row.parser = result.booking.parser
            n = len(result.booking.segments)
            log_row.detail = "; ".join([f"{n} flight{'s' * (n != 1)}"] + result.notes)
        else:
            log_row.status = "no_match"
            log_row.detail = "; ".join(result.notes) or "No flight details found"
    except Exception as exc:
        log.exception("failed to ingest %s", message_id)
        session.rollback()
        log_row.status = "error"
        log_row.detail = f"{type(exc).__name__}: {exc}"[:500]
        changes = []

    if log_row.status != "parsed":
        text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
        log_row.raw = text[:RAW_KEEP_LIMIT]
    session.add(log_row)
    session.commit()
    return log_row, changes
