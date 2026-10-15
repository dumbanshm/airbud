"""Turn a raw RFC 822 message (or a bare HTML/text body) into EmailContent."""

import email
from email import policy
from email.utils import parsedate_to_datetime

from bs4 import BeautifulSoup

from .types import EmailContent


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "head"]):
        tag.decompose()
    lines = (line.strip() for line in soup.get_text("\n").splitlines())
    return "\n".join(line for line in lines if line)


def _looks_like_rfc822(raw: str) -> bool:
    head = raw.lstrip()[:2000].lower()
    return any(head.startswith(h) or f"\n{h}" in head for h in ("from:", "subject:", "mime-version:", "received:", "delivered-to:"))


def parse_raw(raw: bytes | str) -> EmailContent:
    text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
    if not _looks_like_rfc822(text):
        # A pasted body with no headers.
        is_html = "<html" in text.lower() or "<div" in text.lower() or "<table" in text.lower()
        return EmailContent(html=text if is_html else None, text=html_to_text(text) if is_html else text)

    msg = email.message_from_bytes(raw if isinstance(raw, bytes) else raw.encode(), policy=policy.default)
    content = EmailContent(
        subject=str(msg.get("Subject", "") or ""),
        sender=str(msg.get("From", "") or ""),
        message_id=str(msg.get("Message-ID", "") or "") or None,
    )
    try:
        content.date = parsedate_to_datetime(msg["Date"]) if msg["Date"] else None
    except (TypeError, ValueError):
        pass

    html_parts, text_parts = [], []
    for part in msg.walk():
        if part.is_multipart():
            continue
        ctype = part.get_content_type()
        filename = (part.get_filename() or "").lower()
        try:
            payload = part.get_content()
        except (LookupError, KeyError):
            payload = (part.get_payload(decode=True) or b"").decode("utf-8", errors="replace")
        if isinstance(payload, bytes):
            payload = payload.decode("utf-8", errors="replace")
        if ctype == "text/calendar" or filename.endswith(".ics"):
            content.calendars.append(payload)
        elif ctype == "text/html":
            html_parts.append(payload)
        elif ctype == "text/plain":
            text_parts.append(payload)

    if html_parts:
        content.html = "\n".join(html_parts)
    content.text = "\n".join(text_parts) if text_parts else (html_to_text(content.html) if content.html else "")
    return content
