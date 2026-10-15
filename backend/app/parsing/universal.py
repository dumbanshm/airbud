"""Universal flight extractor: no per-airline layout knowledge.

Booking emails differ wildly (see KDE Itinerary's extractor collection), but every one of them
puts a flight number near two airports, a date and some times. So for each flight number we:

  1. look at the text after it (then also just before it, for layouts that put the route first),
  2. collect airports (IATA codes, or city/airport names), dates (any common format, with or
     without a year) and times (24h, am/pm, "0705 hours", "14h30"),
  3. pick the departure/arrival pair of times whose duration fits the distance between the two
     airports. That's what tells real times apart from "bag drop closes 18:00", "boarding 06:25"
     or "duration 02:45", without knowing the layout.

Anything that doesn't add up is skipped rather than guessed.
"""

import math
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from . import airports
from .email_utils import html_to_text
from .types import EmailContent, ParsedBooking, ParsedSegment

MONTH = (r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|"
         r"sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)")
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}

FLIGHT_RE = re.compile(r"(?<![A-Za-z0-9])([A-Z]{2}|[A-Z][0-9]|[0-9][A-Z])(?:\s{0,3}-\s{0,3}|[ \t]{0,2}|\n)0*([1-9]\d{0,3})(?![A-Za-z0-9]|[.,:]\d)")
FLIGHT_LABEL_RE = re.compile(r"(?i)(?:flight|flt|flug|vuelo|vol|voo|volo)\s*(?:no\.?|number|nr\.?|#)?\s*[:.]?\s*$")
AIRCRAFT = {("A3", n) for n in ("18", "19", "20", "21", "30", "32", "38", "40", "43", "50", "59")} | {
    ("B7", n) for n in ("37", "38", "39", "47", "57", "67", "77", "87")}
CODE_RE = re.compile(r"(?<![A-Za-z0-9])([A-Z]{3})(?![A-Za-z0-9])")
STOPWORDS = set("""
THE AND FOR YOU ARE NOT CAN ANY OUR HAS WAS ITS TWO WHO WHY HOW GET SEE USE OFF TOP BUY PAY NET DUE WEB APP
BAG KGS OLD BIG LOW FLY SEA SKY FUN JOY WIN YES ONE ALL AIR OUT DAY CAR CAB BUS NEW NOW PER VIA NON MAX MIN
PNR GST VAT TAX FEE REF ADT CHD INF PAX MRS DOB ETA ETD STD STA UTC GMT IST CET CST EST PST EDT PDT BST SGT
INR USD EUR GBP AED SGD AUD CAD JPY CNY THB MYR IDR QAR SAR OMR KWD BHD NZD CHF HKD LKR NPR BDT PKR ZAR
JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC MON TUE WED THU FRI SAT SUN
SMS OTP PDF URL FAQ CEO VIP LTD PVT INC LLC QTY SKU RSVP TBA TBC OKY ATR ECO BIZ FLT NUM SEQ
""".split())
TIME_RES = [
    # 06:00, 08: 30, 7:05 PM
    re.compile(r"(?<![\d:.,])([01]?\d|2[0-3])\s?:\s?([0-5]\d)(?:\s*([AaPp])\.?\s?[Mm]\b\.?)?(?![\d:.]|\s?(?:kg|%|h\b|hrs?\s+\d))"),
    # 07.05 (two-digit hour only, so prices like 0.00 / 2.50 aren't times)
    re.compile(r"(?<![\d:.,₹$€£])(?<!Rs)(?<!Rs\.)(?<!INR )([01]\d|2[0-3])\.([0-5]\d)(?:\s*([AaPp])\.?\s?[Mm]\b\.?)?(?![\d:.,]|\s?(?:kg|%|h\b))"),
    # 0705 hours, 1930 hrs
    re.compile(r"(?<![\d:])([01]\d|2[0-3])([0-5]\d)\s*(?:hrs?|hours)\b"),
    # 14h30 (French/European), but not durations like 2h45m
    re.compile(r"(?<![\d])([01]?\d|2[0-3])h([0-5]\d)(?![\dm])"),
    # 7 PM
    re.compile(r"(?<![\d:.])(1[0-2]|[1-9])\s?([AaPp])\.?[Mm]\b\.?"),
]
PLUS_DAY_RE = re.compile(r"^\s*\(?\s*\+\s*(\d)\s*(?:day)?")
DATE_RES = [
    ("iso", re.compile(r"(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)")),
    ("dmy", re.compile(rf"(?<![\d:])(\d{{1,2}})(?:st|nd|rd|th)?[\s\-/.]*({MONTH})\.?(?:[\s\-/.,']*(\d{{4}}|\d{{2}})(?![\d:]))?", re.I)),
    ("mdy", re.compile(rf"(?<![A-Za-z])({MONTH})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?(?!\d|:)(?:,?\s+(\d{{4}}))?", re.I)),
    ("num", re.compile(r"(?<![\d/.])(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})(?![\d/.])")),
]
TERMINAL_RE = re.compile(r"(?i)\b(?:terminal|term\.?)\s*[-:]?\s*T?([0-9A-Z]{1,2})\b|\(T\s*([0-9A-Z]{1,2})\)|\bT([1-9][A-Z]?)\b")
SEAT_RE = re.compile(r"(?i)\bseats?\s*(?:no\.?|number)?\s*[:\-]?\s*(\d{1,2}[A-K])\b")
DEP_LABEL_RE = re.compile(r"(?i)\b(?:depart(?:s|ure|ing)?|dep\.?|takes? off|abflug|d[ée]part|salida|partenza|partida)\b")
ARR_LABEL_RE = re.compile(r"(?i)\b(?:arriv(?:e|es|al|ing)|arr\.?|lands?|ankunft|arriv[ée]e|llegada|arrivo|chegada)\b")
PNR_RES = [
    re.compile(r"(?i:PNR|booking\s*(?:reference|ref\.?|code|no\.?|number|id)|confirmation\s*(?:number|code|no\.?|#)|"
               r"record\s*locator|reservation\s*(?:code|number|no\.?)|airline\s*(?:pnr|reference|ref\.?|confirmation)|"
               r"buchungs(?:nummer|code)|r[ée]f[ée]rence\s*(?:de\s*r[ée]servation)?|localizador)"
               r"[^A-Za-z0-9]{0,12}(?:is\s+)?([A-Z0-9]{6})\b"),
]
NOT_PNR = {"STATUS", "NUMBER", "AMOUNT", "ADULTS", "DETAIL", "FLIGHT", "RETURN", "TRAVEL", "PLEASE", "CHANGE",
           "CANCEL", "ONWARD", "BOOKED", "ISSUED", "TICKET", "PERSON", "ADULT1", "ECONOM", "CABINS", "MANAGE"}
TITLE_NAME_RE = re.compile(r"(?m)^\s*(?:\d+\.\s*)?(?:Mr|Mrs|Ms|Miss|Mstr|Master|Dr|Mx)\.?\s*([A-Z][A-Za-z'\-]+(?:[ ]+[A-Z][A-Za-z'\-]+){0,3})\s*$")
SLASH_NAME_RE = re.compile(r"(?m)^\s*([A-Z]{2,})/([A-Z]{2,})(?:\s*(?:MR|MRS|MS|MISS|MSTR|DR))?\s*$")
CANCELLED_RE = re.compile(r"(?i)\b(?:has been|was|is|are|been)\s+cancell?ed\b|\bcancell?ation\s+(?:confirmation|confirmed)\b|^\s*cancell?ed\b")


@dataclass
class Item:
    pos: int
    value: object


def _resolve_year(month: int, day: int, year: int | None, ref: date) -> date | None:
    try:
        if year is not None:
            return date(year + 2000 if year < 100 else year, month, day)
        # No year printed: the first occurrence from two months before the email onwards.
        for y in (ref.year - 1, ref.year, ref.year + 1):
            d = date(y, month, day)
            if d >= ref - timedelta(days=60):
                return d
    except ValueError:
        return None
    return None


def find_dates(text: str, ref: date) -> list[Item]:
    found: dict[int, Item] = {}
    for kind, rx in DATE_RES:
        for m in rx.finditer(text):
            if m.start() in found:
                continue
            g = m.groups()
            if kind == "iso":
                d = _resolve_year(int(g[1]), int(g[2]), int(g[0]), ref)
            elif kind == "dmy":
                d = _resolve_year(MONTHS[g[1][:3].lower()], int(g[0]), int(g[2]) if g[2] else None, ref)
            elif kind == "mdy":
                d = _resolve_year(MONTHS[g[0][:3].lower()], int(g[1]), int(g[2]) if g[2] else None, ref)
            else:
                a, b, y = int(g[0]), int(g[1]), int(g[2])
                day, month = (a, b) if a > 12 or b <= 12 else (b, a)  # day-first unless impossible
                d = _resolve_year(month, day, y, ref)
            if d:
                found[m.start()] = Item(m.start(), d)
    return sorted(found.values(), key=lambda i: i.pos)


MONEY_RE = re.compile(r"(?i)(?:amount|total|tax|fare|price|paid|charge|fee|cost|inr|rs\.?|usd|eur|gbp|aed|[₹$€£])\W{0,4}$")


def find_times(text: str) -> list[Item]:
    found: dict[int, Item] = {}
    taken: list[range] = []
    for rx in TIME_RES:
        for m in rx.finditer(text):
            if any(m.start() in r for r in taken):
                continue
            if rx is TIME_RES[1] and MONEY_RE.search(text[max(0, m.start() - 16) : m.start()]):
                continue  # "Amount 10.40" is money, not a time
            g = m.groups()
            if len(g) == 2 and g[1] and g[1].isalpha():  # "7 PM"
                h, mnt, ampm = int(g[0]), 0, g[1].lower()
            else:
                h, mnt, ampm = int(g[0]), int(g[1]), (g[2] or "").lower() if len(g) > 2 else ""
            if ampm == "p" and h < 12:
                h += 12
            elif ampm == "a" and h == 12:
                h = 0
            plus = PLUS_DAY_RE.match(text, m.end())
            found[m.start()] = Item(m.start(), (h, mnt, int(plus.group(1)) if plus else 0))
            taken.append(range(m.start(), m.end()))
    return sorted(found.values(), key=lambda i: i.pos)


def find_airports(text: str) -> list[Item]:
    items = [Item(m.start(), m.group(1)) for m in CODE_RE.finditer(text)
             if m.group(1) not in STOPWORDS and airports.tz_name(m.group(1))]
    if len({i.value for i in items}) >= 2:
        return items
    # No usable codes: try names ("Frankfurt Airport", "BENGALURU", "New Delhi (Terminal 3)").
    for m in re.finditer(r"[^\n|→>–—\-,():]+", text):
        if any(c not in STOPWORDS and airports.tz_name(c) for c in CODE_RE.findall(m.group(0))):
            continue  # "NEW YORK JFK": the code is there, don't guess from the name
        words = [(w.start(), w.group(0)) for w in re.finditer(r"[A-Za-z][A-Za-z'.]*", m.group(0))]
        if not words or len(words) > 8:
            continue
        i = 0
        while i < len(words):  # longest name starting at each word: "NEW YORK JFK", "London Heathrow"
            for n in range(min(4, len(words) - i), 0, -1):
                code = airports.code_for_name(" ".join(w for _, w in words[i : i + n]))
                if code and words[i][1][0].isupper():
                    items.append(Item(m.start() + words[i][0], code))
                    i += n - 1
                    break
            i += 1
    return sorted(items, key=lambda i: i.pos)


@dataclass
class Anchor:
    start: int
    end: int
    code: str
    num: str


NAME_TO_CODE = {name.lower(): code for code, name in airports.AIRLINES.items()}
AIRLINE_NAME_RE = re.compile(
    r"(?i)\b(" + "|".join(re.escape(n) for n in sorted(NAME_TO_CODE, key=len, reverse=True)) + r")"
    r"\s+(?:flight\s*)?(?:no\.?\s*|#\s*)?0*([1-9]\d{0,3})(?![A-Za-z0-9:.,/]|\s?(?:kg|bag|pc|%))"
)


def flight_anchors(text: str) -> list[Anchor]:
    out = []
    for m in FLIGHT_RE.finditer(text):
        code, num = m.groups()
        if (code, num) in AIRCRAFT or text[max(0, m.start() - 8) : m.start()].rstrip().endswith(("Airbus", "Boeing", "(")):
            continue
        if code in airports.AIRLINES or FLIGHT_LABEL_RE.search(text[max(0, m.start() - 24) : m.start()]):
            out.append(Anchor(m.start(), m.end(), code, num))
    # "British Airways 178": airline name instead of its code (not years like "Emirates 2026").
    for m in AIRLINE_NAME_RE.finditer(text):
        num = m.group(2)
        if len(num) == 4 and num[:2] in ("19", "20"):
            continue
        if not any(a.start <= m.end() and m.start() <= a.end for a in out):
            out.append(Anchor(m.start(), m.end(), NAME_TO_CODE[m.group(1).lower()], num))
    return sorted(out, key=lambda a: a.start)


def _date_for(pos: int, dates: list[Item], fallback: date | None) -> tuple[date | None, int]:
    # A date right after the time belongs to it ("3:50 p.m. Thu, Nov 19"); otherwise the last date before.
    right_after = [d for d in dates if pos < d.pos <= pos + 22]
    if right_after:
        return right_after[0].value, right_after[0].pos
    before = [d for d in dates if d.pos < pos]
    if before:
        return before[-1].value, before[-1].pos
    after = [d for d in dates if d.pos > pos]
    if after:
        return after[0].value, after[0].pos
    return fallback, -1


def _hours(dep: datetime, dep_code: str, arr: datetime, arr_code: str) -> float:
    return (airports.local_to_utc(arr, arr_code) - airports.local_to_utc(dep, dep_code)).total_seconds() / 3600


def _labelled(region: str, times: list[Item], label_re: re.Pattern) -> Item | None:
    for m in label_re.finditer(region):
        for t in times:
            if 0 <= t.pos - m.end() <= 60 and "\n\n" not in region[m.end() : t.pos]:
                return t
    return None


def _segment_from(region: str, code: str, num: str, ref: date, header_date: date | None) -> tuple[ParsedSegment | None, str | None]:
    aps = find_airports(region)
    codes: list[Item] = []
    for a in aps:
        if not codes or a.value != codes[-1].value:
            codes.append(a)
    if len(codes) < 2:
        return None, None
    dep_ap, arr_ap = codes[0], next((c for c in codes[1:] if c.value != codes[0].value), None)
    if arr_ap is None:
        return None, None
    times = find_times(region)
    if not times:
        return None, None
    dates = find_dates(region, ref)

    def build(t: Item, is_arr: bool, dep: datetime | None = None) -> datetime | None:
        d, _ = _date_for(t.pos, dates, header_date)
        if d is None:
            return None
        h, mnt, plus = t.value
        dt = datetime(d.year, d.month, d.day, h, mnt) + timedelta(days=plus)
        if is_arr and dep and dt <= dep and plus == 0:
            dt += timedelta(days=1)  # overnight arrival printed without a date
        return dt

    expected = airports.expected_hours(dep_ap.value, arr_ap.value)
    dep_t, arr_t = _labelled(region, times, DEP_LABEL_RE), _labelled(region, times, ARR_LABEL_RE)
    candidates: list[tuple[Item, Item | None]] = []
    if dep_t and arr_t and dep_t.pos < arr_t.pos:
        candidates.append((dep_t, arr_t))
    head = times[:8]
    candidates += [(a, b) for i, a in enumerate(head) for b in head[i + 1 :]]
    if len(times) == 1:
        candidates.append((times[0], None))

    best, best_score = None, math.inf
    for i, (a, b) in enumerate(candidates):
        dep = build(a, False)
        if dep is None:
            continue
        if b is None:
            best = (dep, None) if best is None else best
            continue
        arr = build(b, True, dep)
        if arr is None:
            continue
        hours = _hours(dep, dep_ap.value, arr, arr_ap.value)
        if hours <= 0:  # arrival is the next day but its date wasn't printed (eastbound overnight)
            arr += timedelta(days=1)
            hours += 24
        if hours <= 0:
            continue
        if expected is None:
            score = i  # no coordinates: trust the order
        else:
            if not (0.55 * expected - 0.3 <= hours <= 1.8 * expected + 1.0):
                continue
            score = abs(math.log(hours / expected)) + i * 0.01  # prefer earlier pairs on ties
        if score < best_score:
            best, best_score = (dep, arr), score
    if best is None:
        return None, f"{code}{num}: times don't fit a {dep_ap.value}→{arr_ap.value} flight"

    terms = [Item(m.start(), next(g for g in m.groups() if g)) for m in TERMINAL_RE.finditer(region)]
    between = [t.value for t in terms if dep_ap.pos < t.pos < arr_ap.pos]
    after = [t.value for t in terms if t.pos > arr_ap.pos]
    if between:  # "DEL T3 ... DXB T1"
        dep_term, arr_term = between[0], (after[0] if after else None)
    elif len(after) >= 2:  # "DEL → DXB ... Terminal 3 / Terminal 1"
        dep_term, arr_term = after[0], after[1]
    else:
        dep_term, arr_term = None, (after[0] if after else None)
    seat = SEAT_RE.search(region)
    return ParsedSegment(
        flight_number=f"{code}{num}", airline_code=code, airline_name=airports.AIRLINES.get(code),
        dep_airport=dep_ap.value, arr_airport=arr_ap.value, dep_local=best[0], arr_local=best[1],
        dep_terminal=dep_term, arr_terminal=arr_term, seats=[seat.group(1)] if seat else [],
    ), None


def _read(text: str, ref: date, anchors: list[Anchor], all_dates: list[Item], details: str) -> tuple[dict, list[str]]:
    """details="after": each flight's route/times follow its number (most emails).
    details="before": they precede it ("New York (JFK) 6:00pm - London (LHR) 6:10am / British Airways 178")."""
    segments: dict[tuple, ParsedSegment] = {}
    notes: list[str] = []
    for i, m in enumerate(anchors):
        code, num = m.code, m.num
        if details == "after":
            next_start = anchors[i + 1].start if i + 1 < len(anchors) else len(text)
            region = text[m.end : min(next_start, m.end + 900)]
            if not find_times(region):  # route printed just before the number, details after it
                prev_end = anchors[i - 1].end if i else 0
                region = text[max(prev_end, m.start - 300) : m.start] + "\n" + region
        else:
            prev_end = anchors[i - 1].end if i else 0
            region = text[max(prev_end, m.start - 900) : m.start]
        header = next((d.value for d in reversed(all_dates) if d.pos < m.start), None)
        seg, note = _segment_from(region, code, num, ref, header)
        if seg is None:
            if note:
                notes.append(note)
            continue
        if any((o.dep_airport, o.arr_airport, o.dep_local) == (seg.dep_airport, seg.arr_airport, seg.dep_local)
               for o in segments.values()):
            continue  # same route and time under another number: a codeshare, or data read twice
        segments.setdefault((seg.flight_number, seg.dep_local.date()), seg)
    return segments, notes


def extract_segments(text: str, ref: date) -> tuple[list[ParsedSegment], list[str]]:
    anchors = flight_anchors(text)
    all_dates = find_dates(text, ref)
    after, after_notes = _read(text, ref, anchors, all_dates, "after")
    before, before_notes = _read(text, ref, anchors, all_dates, "before")
    if len(before) > len(after):
        return list(before.values()), before_notes
    return list(after.values()), after_notes


def find_pnr(text: str) -> str | None:
    for rx in PNR_RES:
        for m in rx.finditer(text):
            if any(c.isalpha() for c in m.group(1)) and m.group(1) not in NOT_PNR:
                return m.group(1)
    return None


def find_passengers(text: str) -> list[str]:
    best: dict[str, str] = {}
    for name in TITLE_NAME_RE.findall(text):
        key = name.replace(" ", "").lower()
        if name.count(" ") >= best.get(key, "").count(" "):
            best[key] = name
    for last, first in SLASH_NAME_RE.findall(text):
        name = f"{first.title()} {last.title()}"
        best.setdefault(name.replace(" ", "").lower(), name)
    return list(best.values())[:9]


def _texts(content: EmailContent) -> list[str]:
    texts = [content.text]
    if content.html:
        html_text = html_to_text(content.html)
        if html_text.strip() != content.text.strip():
            texts.append(html_text)
    texts += content.pdf_texts
    return [_normalise(t) for t in texts if t and t.strip()]


def _normalise(text: str) -> str:
    text = text.replace("\xa0", " ").replace("\t", "  ").replace("​", "")
    return "\n".join(line.rstrip() for line in text.splitlines())


NOT_ITINERARY_RE = re.compile(r"(?i)\b(?:tax\s*invoice|gst\s*invoice|invoice|refund|credit\s*note)\b")


def parse(content: EmailContent) -> ParsedBooking | None:
    if NOT_ITINERARY_RE.search(content.subject.replace("TaxInvoice", "Tax Invoice")):
        return None
    ref = content.date.date() if content.date else date.today()
    best: tuple[list[ParsedSegment], str] | None = None
    notes: list[str] = []
    for text in _texts(content):
        segs, n = extract_segments(text, ref)
        notes += n
        if segs and (best is None or len(segs) > len(best[0])):
            best = (segs, text)
    if not best:
        # Still report why, e.g. "times don't fit a DEL→JFK flight", so it shows in "Emails read".
        return ParsedBooking(pnr=None, segments=[], notes=sorted(set(notes))) if notes else None
    segs, text = best
    passengers = find_passengers(text)
    for s in segs:
        s.passengers = s.passengers or passengers
    head = content.subject + "\n" + text[:300]
    return ParsedBooking(
        pnr=find_pnr(text) or find_pnr(content.subject),
        segments=segs,
        airline_name=segs[0].airline_name,
        cancelled=bool(CANCELLED_RE.search(head)),
        parser="universal",
    )
