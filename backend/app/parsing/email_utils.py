"""Turn a raw RFC 822 message (or a bare HTML/text body) into EmailContent."""

import email
import io
import logging
from email import policy
from email.utils import parsedate_to_datetime

from bs4 import BeautifulSoup

from .types import EmailContent

log = logging.getLogger(__name__)
MAX_PDF_PAGES = 15
MAX_BARCODE_PAGES = 4


def pdf_to_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages[:MAX_PDF_PAGES])
    except Exception as exc:  # encrypted, scanned or malformed PDFs just contribute nothing
        log.info("could not read PDF attachment: %s", exc)
        return ""


def scan_pdf(data: bytes) -> list[tuple[str, str, bytes | None]]:
    """Barcodes drawn in a PDF (e.g. a boarding pass): [(text, "pdf417" | "qr" | "aztec", png)].

    Renders each page and scans it, so it works whether the barcode is an embedded image or vector
    art. `png` is the barcode cut out of the page exactly as the airline printed it.
    """
    try:
        import pypdfium2 as pdfium
        import zxingcpp

        formats = {zxingcpp.BarcodeFormat.PDF417: "pdf417", zxingcpp.BarcodeFormat.QRCode: "qr", zxingcpp.BarcodeFormat.Aztec: "aztec"}
        pdf = pdfium.PdfDocument(data)
        found: list[tuple[str, str, bytes | None]] = []
        for i in range(min(len(pdf), MAX_BARCODE_PAGES)):
            image = pdf[i].render(scale=4, grayscale=True).to_pil()
            for b in zxingcpp.read_barcodes(image, formats=list(formats), text_mode=zxingcpp.TextMode.Plain):
                if b.text and b.format in formats and all(f[0] != b.text for f in found):
                    found.append((b.text, formats[b.format], _crop(image, b.position)))
        return found
    except Exception as exc:
        log.info("could not scan PDF attachment for barcodes: %s", exc)
        return []


def _crop(image, position) -> bytes | None:
    """Cut the barcode out of the rendered page, with a white margin so scanners can read it."""
    try:
        from PIL import Image

        pts = [position.top_left, position.top_right, position.bottom_right, position.bottom_left]
        xs, ys = [p.x for p in pts], [p.y for p in pts]
        left, top, right, bottom = min(xs), min(ys), max(xs), max(ys)
        pad = int(max(right - left, bottom - top) * 0.08) + 4
        box = (max(0, left - pad), max(0, top - pad), min(image.width, right + pad), min(image.height, bottom + pad))
        crop = image.crop(box)
        out = Image.new("L", (crop.width + 2 * pad, crop.height + 2 * pad), 255)
        out.paste(crop, (pad, pad))
        buf = io.BytesIO()
        out.save(buf, format="PNG", optimize=True)
        return buf.getvalue()
    except Exception as exc:
        log.info("could not crop barcode: %s", exc)
        return None


def pdf_barcodes(data: bytes) -> list[tuple[str, str]]:
    return [(text, fmt) for text, fmt, _ in scan_pdf(data)]


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
        if ctype == "application/pdf" or filename.endswith(".pdf"):
            data = part.get_payload(decode=True) or b""
            content.pdf_texts.append(pdf_to_text(data))
            for text, fmt, png in scan_pdf(data):
                content.pdf_barcodes.append((text, fmt))
                if png:
                    content.barcode_crops[text] = png
                content.barcode_sources[text] = (part.get_filename() or "boarding-pass.pdf", "application/pdf", data)
            continue
        if ctype == "application/vnd.apple.pkpass" or filename.endswith(".pkpass"):
            content.passes.append(part.get_payload(decode=True) or b"")
            content.pass_names.append(part.get_filename() or "boarding-pass.pkpass")
            continue
        if part.get_content_maintype() not in ("text",) and not filename.endswith(".ics"):
            continue  # images etc.
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
    plain = "\n".join(text_parts)
    html_text = html_to_text(content.html) if content.html else ""
    # Some senders ship an empty plain-text part (even an empty HTML skeleton) next to the real
    # HTML. Use the HTML's text in that case.
    if len(html_to_text(plain)) < 200 <= len(html_text):
        plain = ""
    content.text = plain or html_text
    return content
