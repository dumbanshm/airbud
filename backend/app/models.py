"""Database tables.

Times: every *_utc column is naive UTC. Every *_local column is the wall-clock time at that
airport (naive), paired with an IANA timezone name, which is how airlines print times.
Columns are typed NaiveDatetime because the naming convention, not tzinfo, says which clock it is.
"""

from datetime import datetime, timezone

from pydantic import NaiveDatetime
from sqlmodel import Field, SQLModel, UniqueConstraint


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    name: str | None = None
    picture: str | None = None
    google_refresh_token_enc: str | None = None
    gmail_connected: bool = False
    gmail_error: str | None = None
    is_demo: bool = False
    last_synced_at: NaiveDatetime | None = None
    created_at: NaiveDatetime = Field(default_factory=utcnow)


class SessionToken(SQLModel, table=True):
    token_hash: str = Field(primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    created_at: NaiveDatetime = Field(default_factory=utcnow)


class OAuthState(SQLModel, table=True):
    """Remembers where to send the app back to between /start and /callback."""

    state: str = Field(primary_key=True)
    app_redirect: str
    created_at: NaiveDatetime = Field(default_factory=utcnow)


class LoginCode(SQLModel, table=True):
    """Short-lived, single-use code handed to the app via deep link, swapped for a session token."""

    code_hash: str = Field(primary_key=True)
    user_id: int = Field(foreign_key="user.id", ondelete="CASCADE")
    expires_at: NaiveDatetime
    used: bool = False


class Booking(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "pnr"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    pnr: str
    airline_name: str | None = None
    cancelled: bool = False
    created_at: NaiveDatetime = Field(default_factory=utcnow)
    updated_at: NaiveDatetime = Field(default_factory=utcnow)


class Segment(SQLModel, table=True):
    """One flight leg."""

    id: int | None = Field(default=None, primary_key=True)
    booking_id: int = Field(foreign_key="booking.id", index=True, ondelete="CASCADE")
    user_id: int = Field(foreign_key="user.id", index=True, ondelete="CASCADE")

    flight_number: str  # normalised, e.g. "6E2134"
    airline_code: str | None = None
    airline_name: str | None = None

    dep_airport: str
    arr_airport: str
    dep_local: NaiveDatetime
    arr_local: NaiveDatetime | None = None
    dep_tz: str
    arr_tz: str
    dep_utc: NaiveDatetime = Field(index=True)
    arr_utc: NaiveDatetime | None = None
    dep_terminal: str | None = None
    arr_terminal: str | None = None

    passengers: str = ""  # comma-separated
    seats: str = ""  # comma-separated
    cancelled: bool = False
    change_note: str | None = None  # e.g. "Departure moved from 18:05 to 18:50"

    created_at: NaiveDatetime = Field(default_factory=utcnow)
    updated_at: NaiveDatetime = Field(default_factory=utcnow)


class InboundEmail(SQLModel, table=True):
    """Every email we looked at, and what happened. Failures keep the raw body for writing parsers."""

    __table_args__ = (UniqueConstraint("user_id", "message_id"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    message_id: str
    subject: str | None = None
    sender: str | None = None
    received_at: NaiveDatetime | None = None
    status: str  # parsed | no_match | error
    parser: str | None = None
    detail: str | None = None
    raw: str | None = None
    created_at: NaiveDatetime = Field(default_factory=utcnow)


class PushToken(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    token: str = Field(unique=True)
    platform: str | None = None
    created_at: NaiveDatetime = Field(default_factory=utcnow)
