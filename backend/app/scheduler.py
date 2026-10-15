import logging
from datetime import timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from sqlmodel import delete, select

from . import gmail
from .config import settings
from .db import session_scope
from .ingest import reparse_unmatched
from .models import LoginCode, OAuthState, User, utcnow

log = logging.getLogger(__name__)
scheduler = BackgroundScheduler(timezone="UTC")


def sync_everyone() -> None:
    with session_scope() as session:
        users = session.exec(select(User).where(User.gmail_connected == True)).all()  # noqa: E712
        for user in users:
            try:
                log.info("sync %s: %s", user.email, gmail.sync_user(session, user))
            except Exception:
                log.exception("sync failed for %s", user.email)
                session.rollback()


def reparse_everyone() -> None:
    """After a parser change, pick up flights in emails that didn't match before. No pushes:
    these are old emails, not news."""
    with session_scope() as session:
        for user in session.exec(select(User).where(User.is_demo == False)).all():  # noqa: E712
            changes = reparse_unmatched(session, user)
            if changes:
                log.info("re-read old emails for %s: %d flight changes", user.email, len(changes))


def clean_up() -> None:
    with session_scope() as session:
        session.exec(delete(OAuthState).where(OAuthState.created_at < utcnow() - timedelta(hours=1)))
        session.exec(delete(LoginCode).where(LoginCode.expires_at < utcnow()))
        session.commit()


def start() -> None:
    scheduler.add_job(clean_up, "interval", hours=1)
    scheduler.add_job(reparse_everyone)  # once, right after startup
    if settings.google_enabled:
        scheduler.add_job(sync_everyone, "interval", minutes=settings.sync_interval_minutes, max_instances=1, coalesce=True)
    scheduler.start()


def stop() -> None:
    scheduler.shutdown(wait=False)
