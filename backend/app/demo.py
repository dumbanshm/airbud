"""Demo account: sample emails with dates relative to now, run through the real parsing pipeline."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from string import Template
from zoneinfo import ZoneInfo

from sqlmodel import Session, delete, select

from .config import BASE_DIR
from .ingest import ingest_email
from .models import Booking, InboundEmail, Segment, User

DEMO_EMAIL = "demo@airbud.local"
EMAILS_DIR = BASE_DIR / "demo_emails"


def _at(day_offset: int, hhmm: str, tz: str, now: datetime) -> datetime:
    zone = ZoneInfo(tz)
    day = now.astimezone(zone).date() + timedelta(days=day_offset)
    h, m = map(int, hhmm.split(":"))
    return datetime(day.year, day.month, day.day, h, m, tzinfo=zone)


def template_values(now: datetime | None = None) -> dict[str, str]:
    now = now or datetime.now(timezone.utc)
    ist = ZoneInfo("Asia/Kolkata")
    # First flight leaves ~3h from now, so the countdown and reminders have something to show.
    soon = (now + timedelta(hours=3, minutes=5)).astimezone(ist)
    soon = soon.replace(minute=soon.minute - soon.minute % 5, second=0, microsecond=0)
    ek_day = (now.astimezone(ist) + timedelta(days=12)).date()
    indigo = (now - timedelta(days=10)).replace(hour=14, minute=30, second=0, microsecond=0)
    return {
        "ai503_dep": soon.isoformat(),
        "ai503_arr": (soon + timedelta(hours=2, minutes=50)).isoformat(),
        "ai504_dep": _at(5, "18:05", "Asia/Kolkata", now).isoformat(),
        "ai504_arr": _at(5, "20:55", "Asia/Kolkata", now).isoformat(),
        "ai504_new_dep": _at(5, "18:50", "Asia/Kolkata", now).isoformat(),
        "ai504_new_arr": _at(5, "21:40", "Asia/Kolkata", now).isoformat(),
        "ek_date_text": ek_day.strftime("%a, %d %b %Y"),
        "indigo_dep_utc": indigo.strftime("%Y%m%dT%H%M%SZ"),
        "indigo_arr_utc": (indigo + timedelta(hours=1, minutes=40)).strftime("%Y%m%dT%H%M%SZ"),
    }


def render_demo_emails(now: datetime | None = None) -> list[tuple[str, str]]:
    values = template_values(now)
    return [(p.stem, Template(p.read_text()).safe_substitute(values)) for p in sorted(EMAILS_DIR.glob("*.eml"))]


def seed_demo_user(session: Session) -> User:
    """Reset the demo account so its flights are always in the near future."""
    user = session.exec(select(User).where(User.email == DEMO_EMAIL)).first()
    if user is None:
        user = User(email=DEMO_EMAIL, name="Demo Traveler", is_demo=True)
        session.add(user)
        session.commit()
        session.refresh(user)
    for table in (Segment, Booking, InboundEmail):
        session.exec(delete(table).where(table.user_id == user.id))
    session.commit()

    for name, raw in render_demo_emails():
        ingest_email(session, user, raw, f"demo-{name}")
    return user
