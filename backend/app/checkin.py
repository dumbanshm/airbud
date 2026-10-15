"""Web check-in windows and pages, per airline.

Windows are each airline's published policy as of Oct 2026 (hours before departure it opens,
minutes before departure it closes). They change, and some fares/routes differ, so the app
always labels them as estimates and links to the airline's own page as the source of truth.
Sources: airline FAQs (e.g. airindia.com check-in FAQ), plus happyfares.in and magnify.club
check-in guides. URLs were checked to load in Oct 2026.
"""

from dataclasses import dataclass
from datetime import timedelta

from .models import Segment
from .parsing import airports


@dataclass(frozen=True)
class Policy:
    url: str | None
    domestic: tuple[int, int]  # (opens hours before, closes minutes before)
    international: tuple[int, int]


POLICIES = {
    "6E": Policy("https://www.goindigo.in/web-check-in.html", (48, 60), (24, 75)),
    "AI": Policy("https://www.airindia.com/in/en/manage/web-checkin.html", (48, 60), (48, 120)),
    "IX": Policy("https://www.airindiaexpress.com/checkin", (48, 60), (48, 75)),
    "QP": Policy("https://www.akasaair.com/check-in/web-check-in", (48, 60), (48, 60)),
    "SG": Policy("https://www.spicejet.com/check-in", (48, 60), (48, 75)),
    "9I": Policy("https://www.allianceair.in/web-checkin", (48, 60), (48, 60)),
}
DEFAULT = Policy(None, (24, 60), (24, 60))  # the most common window worldwide


def is_international(seg: Segment) -> bool:
    a, b = airports.airport(seg.dep_airport) or {}, airports.airport(seg.arr_airport) or {}
    return a.get("country") != b.get("country")


def window(seg: Segment) -> dict:
    policy = POLICIES.get(seg.airline_code or "", DEFAULT)
    opens_h, closes_min = policy.international if is_international(seg) else policy.domestic
    opens = seg.dep_utc - timedelta(hours=opens_h)
    closes = seg.dep_utc - timedelta(minutes=closes_min)
    return {
        "opens_utc": opens.replace(microsecond=0).isoformat() + "Z",
        "closes_utc": closes.replace(microsecond=0).isoformat() + "Z",
        "url": policy.url,
        "estimated": True,
        "known_airline": policy is not DEFAULT,
    }

