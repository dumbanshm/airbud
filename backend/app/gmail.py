"""Google sign-in and read-only Gmail access, using plain HTTPS calls."""

import base64
import logging
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from sqlmodel import Session

from . import push, security
from .config import settings
from .ingest import ingest_email
from .models import User, utcnow

log = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
SCOPES = "openid email profile https://www.googleapis.com/auth/gmail.readonly"
MAX_MESSAGES_PER_SYNC = 200


class GmailAccessRevoked(Exception):
    pass


def auth_url(state: str) -> str:
    return AUTH_URL + "?" + urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "access_type": "offline",  # we need a refresh token to read mail in the background
        "prompt": "consent",  # Google only returns a refresh token on the consent screen
        "include_granted_scopes": "true",
    })


def exchange_code(code: str) -> dict:
    resp = httpx.post(TOKEN_URL, data={
        "code": code,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "redirect_uri": settings.google_redirect_uri,
        "grant_type": "authorization_code",
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def userinfo(access_token: str) -> dict:
    resp = httpx.get(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _access_token(user: User) -> str:
    if not user.google_refresh_token_enc:
        raise GmailAccessRevoked("Gmail not connected")
    resp = httpx.post(TOKEN_URL, data={
        "refresh_token": security.decrypt(user.google_refresh_token_enc),
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "grant_type": "refresh_token",
    }, timeout=15)
    if resp.status_code == 400 and resp.json().get("error") == "invalid_grant":
        raise GmailAccessRevoked("Google access was revoked or expired. Sign in again.")
    resp.raise_for_status()
    return resp.json()["access_token"]


def _message_ids(client: httpx.Client) -> list[str]:
    ids, page = [], None
    while len(ids) < MAX_MESSAGES_PER_SYNC:
        params = {"q": settings.gmail_query, "maxResults": 100}
        if page:
            params["pageToken"] = page
        data = client.get(f"{GMAIL}/messages", params=params).raise_for_status().json()
        ids += [m["id"] for m in data.get("messages", [])]
        page = data.get("nextPageToken")
        if not page:
            break
    return ids[:MAX_MESSAGES_PER_SYNC]


class UnreadableMessage(Exception):
    pass


class GmailRateLimited(Exception):
    pass


RATE_LIMIT_REASONS = {"rateLimitExceeded", "userRateLimitExceeded"}


def _gmail_error(resp: httpx.Response) -> tuple[str, set[str]]:
    try:
        err = resp.json().get("error", {})
        return str(err.get("message", "")), {e.get("reason") for e in err.get("errors", [])}
    except ValueError:
        return resp.text[:200], set()


def _fetch_raw(client: httpx.Client, mid: str) -> tuple[bytes, datetime]:
    """Download one message. Retries rate limits (Gmail reports those as 403 or 429)."""
    for attempt in range(4):
        resp = client.get(f"{GMAIL}/messages/{mid}", params={"format": "raw"})
        if resp.status_code == 200:
            msg = resp.json()
            received = datetime.fromtimestamp(int(msg.get("internalDate", 0)) / 1000, timezone.utc).replace(tzinfo=None)
            return base64.urlsafe_b64decode(msg["raw"] + "=="), received
        message, reasons = _gmail_error(resp)
        if resp.status_code == 429 or reasons & RATE_LIMIT_REASONS:
            time.sleep(2**attempt)
            continue
        if resp.status_code in (403, 404):
            raise UnreadableMessage(f"Gmail refused this message ({resp.status_code}): {message or ', '.join(reasons)}")
        resp.raise_for_status()
    raise GmailRateLimited()


def sync_user(session: Session, user: User) -> dict:
    """Fetch matching emails we haven't seen yet, parse them, and push any changes to the phone."""
    from sqlmodel import select

    from .models import InboundEmail

    try:
        token = _access_token(user)
    except GmailAccessRevoked as exc:
        user.gmail_connected, user.gmail_error = False, str(exc)
        session.add(user)
        session.commit()
        return {"ok": False, "error": str(exc)}

    seen = set(session.exec(select(InboundEmail.message_id).where(InboundEmail.user_id == user.id)).all())
    stats = {"ok": True, "checked": 0, "parsed": 0, "changes": 0, "skipped": 0}
    all_changes = []
    with httpx.Client(headers={"Authorization": f"Bearer {token}"}, timeout=30) as client:
        for mid in _message_ids(client):
            if mid in seen:
                continue
            try:
                raw, received = _fetch_raw(client, mid)
            except UnreadableMessage as exc:
                # One email Gmail won't hand over must not stop the rest. Record it so it shows in
                # the app's "Emails read" list and isn't retried every 15 minutes.
                log.warning("skipping %s: %s", mid, exc)
                session.add(InboundEmail(user_id=user.id, message_id=mid, status="error", detail=str(exc)[:500]))
                session.commit()
                stats["skipped"] += 1
                continue
            except GmailRateLimited:
                log.warning("gmail rate limit hit; continuing next sync")
                stats["partial"] = True
                break
            row, changes = ingest_email(session, user, raw, mid, received)
            stats["checked"] += 1
            stats["parsed"] += row.status == "parsed"
            all_changes += changes

    user.last_synced_at, user.gmail_error, user.gmail_connected = utcnow(), None, True
    session.add(user)
    session.commit()
    stats["changes"] = len(all_changes)
    push.notify_changes(session, user.id, all_changes)
    return stats
