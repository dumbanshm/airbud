"""Sign-in for a native app, done on the server so the app never handles Google tokens.

  1. App opens  GET /auth/google/start?app_redirect=airbud://auth  in an in-app browser
     (ASWebAuthenticationSession on iOS, Custom Tabs on Android).
  2. We redirect to Google. Google redirects back to /auth/google/callback with a code.
  3. We swap that code for Google tokens, keep the encrypted refresh token for Gmail sync,
     and send the browser to  airbud://auth?code=<one-time code>.
  4. The in-app browser sees its own scheme, closes, and hands the URL to the app.
  5. App POSTs the one-time code to /auth/exchange and gets its session token.

The one-time code (valid 2 minutes, single use) means the real session token never appears
in a URL, browser history or another app that registered the same scheme.
"""

import html
import logging
from datetime import timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from sqlmodel import Session, delete, select

from . import gmail, security
from .config import settings
from .db import get_session, session_scope
from .deps import current_user
from .models import LoginCode, OAuthState, PushToken, SessionToken, User, utcnow

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

STATE_TTL = timedelta(minutes=10)
CODE_TTL = timedelta(minutes=2)


def _issue_session(session: Session, user: User) -> str:
    token = security.new_token()
    session.add(SessionToken(token_hash=security.hash_token(token), user_id=user.id))
    session.commit()
    return token


def _back_to_app(app_redirect: str, **params) -> HTMLResponse:
    """A page that bounces into the app. A plain 302 to a custom scheme is blocked by some Android
    browsers, so this redirects with JS and also shows a button as a fallback."""
    sep = "&" if "?" in app_redirect else "?"
    url = html.escape(app_redirect + sep + urlencode(params), quote=True)
    message = "Signed in. Returning to Airbud…" if "code" in params else f"Sign-in failed: {html.escape(params.get('error', ''))}"
    return HTMLResponse(f"""<!doctype html><meta name=viewport content="width=device-width">
<body style="font-family:-apple-system,system-ui;text-align:center;padding:48px 20px">
<p>{message}</p><p><a href="{url}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:10px;text-decoration:none">Open the app</a></p>
<script>location.href = "{url}";</script></body>""")


@router.get("/config")
def auth_config():
    return {"google": settings.google_enabled, "demo": settings.demo_mode}


@router.get("/google/start")
def google_start(app_redirect: str, session: Session = Depends(get_session)):
    if not settings.google_enabled:
        raise HTTPException(503, "Google sign-in isn't configured on this server. See README → Google setup.")
    if not any(app_redirect.startswith(p) for p in settings.redirect_prefixes):
        raise HTTPException(400, "app_redirect is not an allowed app URL")
    state = security.new_token()
    session.add(OAuthState(state=state, app_redirect=app_redirect))
    session.commit()
    return RedirectResponse(gmail.auth_url(state))


def _initial_sync(user_id: int) -> None:
    with session_scope() as s:
        user = s.get(User, user_id)
        if user:
            try:
                log.info("initial sync for %s: %s", user.email, gmail.sync_user(s, user))
            except Exception:
                log.exception("initial sync failed")


@router.get("/google/callback")
def google_callback(
    background: BackgroundTasks,
    state: str,
    code: str | None = None,
    error: str | None = None,
    session: Session = Depends(get_session),
):
    saved = session.get(OAuthState, state)
    if not saved or utcnow() - saved.created_at > STATE_TTL:
        return HTMLResponse("<p>This sign-in link expired. Go back to the app and try again.</p>", status_code=400)
    app_redirect = saved.app_redirect
    session.delete(saved)
    session.commit()

    if error or not code:
        return _back_to_app(app_redirect, error=error or "cancelled")
    try:
        tokens = gmail.exchange_code(code)
        info = gmail.userinfo(tokens["access_token"])
    except httpx.HTTPError as exc:
        log.warning("google token exchange failed: %s", exc)
        return _back_to_app(app_redirect, error="google_exchange_failed")

    if "gmail.readonly" not in tokens.get("scope", ""):
        return _back_to_app(app_redirect, error="gmail_permission_not_granted")

    user = session.exec(select(User).where(User.email == info["email"])).first() or User(email=info["email"])
    user.name, user.picture = info.get("name"), info.get("picture")
    if tokens.get("refresh_token"):
        user.google_refresh_token_enc = security.encrypt(tokens["refresh_token"])
        user.gmail_connected, user.gmail_error = True, None
    session.add(user)
    session.commit()
    session.refresh(user)

    one_time = security.new_token()
    session.add(LoginCode(code_hash=security.hash_token(one_time), user_id=user.id, expires_at=utcnow() + CODE_TTL))
    session.commit()
    background.add_task(_initial_sync, user.id)
    return _back_to_app(app_redirect, code=one_time)


class ExchangeIn(BaseModel):
    code: str


@router.post("/exchange")
def exchange(body: ExchangeIn, session: Session = Depends(get_session)):
    row = session.get(LoginCode, security.hash_token(body.code))
    if not row or row.used or row.expires_at < utcnow():
        raise HTTPException(400, "Login code is invalid or expired. Try signing in again.")
    row.used = True
    session.add(row)
    user = session.get(User, row.user_id)
    return {"token": _issue_session(session, user)}


@router.post("/demo")
def demo_login(session: Session = Depends(get_session)):
    if not settings.demo_mode:
        raise HTTPException(404)
    from .demo import seed_demo_user

    user = seed_demo_user(session)
    return {"token": _issue_session(session, user)}


class LogoutIn(BaseModel):
    push_token: str | None = None


@router.post("/logout")
def logout(
    body: LogoutIn,
    authorization: str = Header(default=""),
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    token = authorization.partition(" ")[2]
    session.exec(delete(SessionToken).where(SessionToken.token_hash == security.hash_token(token)))
    if body.push_token:  # stop pushes to a phone that signed out
        session.exec(delete(PushToken).where(PushToken.token == body.push_token, PushToken.user_id == user.id))
    session.commit()
    return {"ok": True}
