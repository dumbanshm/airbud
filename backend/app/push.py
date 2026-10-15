"""Remote push through Expo's push service (free, no server keys needed on our side).

Only used for things the phone can't know ahead of time: a new booking found, a schedule
change, a cancellation. Time-based reminders are scheduled on the phone itself.
"""

import logging

import httpx
from sqlmodel import Session, delete, select

from .models import PushToken

log = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_to_user(session: Session, user_id: int, title: str, body: str, data: dict | None = None) -> dict:
    tokens = [t.token for t in session.exec(select(PushToken).where(PushToken.user_id == user_id)).all()]
    if not tokens:
        return {"sent": 0, "errors": ["No push tokens registered for this account"]}

    messages = [{"to": t, "title": title, "body": body, "data": data or {}, "sound": "default"} for t in tokens]
    try:
        resp = httpx.post(EXPO_PUSH_URL, json=messages, timeout=15)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        log.warning("expo push failed: %s", exc)
        return {"sent": 0, "errors": [str(exc)]}

    errors, dead = [], []
    for token, ticket in zip(tokens, resp.json().get("data", [])):
        if ticket.get("status") == "error":
            errors.append(ticket.get("message", "unknown error"))
            if (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                dead.append(token)
    if dead:
        session.exec(delete(PushToken).where(PushToken.token.in_(dead)))
        session.commit()
    return {"sent": len(tokens) - len(errors), "errors": errors}


def notify_changes(session: Session, user_id: int, changes) -> None:
    if not changes:
        return
    if len(changes) == 1:
        c = changes[0]
        titles = {"new": "New flight added", "updated": "Schedule change", "cancelled": "Flight cancelled"}
        send_to_user(session, user_id, f"{titles[c.kind]}: {c.segment.flight_number}", c.note,
                     {"url": f"/flight/{c.segment.id}"})
    else:
        send_to_user(session, user_id, "Your trips were updated", f"{len(changes)} flight changes found in your email",
                     {"url": "/"})
