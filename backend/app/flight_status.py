"""Flight status. Mocked for now: real status needs a paid API (e.g. AeroDataBox's free tier).

Swap `status_for` for an API call and keep the same return shape; the app won't need changes.
"""

import zlib
from datetime import datetime, timedelta

from .models import Segment

BOARDING_BEFORE = timedelta(minutes=35)  # typical; real boarding time only appears on the boarding pass


def boarding_utc(seg: Segment) -> datetime:
    return seg.dep_utc - BOARDING_BEFORE


def status_for(seg: Segment, now: datetime) -> dict:
    if seg.cancelled:
        return {"code": "cancelled", "label": "Cancelled", "delay_minutes": 0, "source": "email"}
    if seg.arr_utc and now >= seg.arr_utc:
        return {"code": "landed", "label": "Landed", "delay_minutes": 0, "source": "mock"}
    if now >= seg.dep_utc:
        return {"code": "departed", "label": "In the air", "delay_minutes": 0, "source": "mock"}
    if now >= boarding_utc(seg):
        return {"code": "boarding", "label": "Boarding", "delay_minutes": 0, "source": "mock"}
    # Deterministic fake delays so the UI shows both states.
    if zlib.crc32(seg.flight_number.encode()) % 4 == 0:
        return {"code": "delayed", "label": "Delayed 25m", "delay_minutes": 25, "source": "mock"}
    return {"code": "on_time", "label": "On time", "delay_minutes": 0, "source": "mock"}
