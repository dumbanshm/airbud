"""Groups flights into trips: "New Delhi · 16–21 Oct" (outbound + return) or "London" (DEL→DXB→LHR).

Works on serialized flights (the dicts /flights returns), so the app, widgets and exports all get the
same grouping. Two steps:

1. Journeys: a flight that leaves from the airport the previous flight landed at, within 24 hours,
   is a connection and joins that journey, even on a different booking. Landing back where a
   recent journey began ends it, so flying home tonight and out again tomorrow are two journeys.
2. Trips: a journey joins the trip before it when it's on the same booking, or when it starts where
   that trip ended up and goes back to where it began within 30 days (a return on another ticket).
"""

from datetime import datetime, timedelta

CONNECTION = timedelta(hours=24)
RETURN_WINDOW = timedelta(days=30)
DONE = {"landed", "cancelled"}


def _utc(iso: str | None) -> datetime | None:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")) if iso else None


def _dep(f: dict) -> datetime:
    return _utc(f["departure"]["utc"]) or _utc(f["boarding_utc"])


def _arr(f: dict) -> datetime:
    return _utc(f["arrival"]["utc"]) or _dep(f)


def _journeys(flights: list[dict]) -> list[list[dict]]:
    out: list[list[dict]] = []
    for f in sorted(flights, key=_dep):
        prev = out[-1][-1] if out else None
        # Airports you set off from recently. Landing back at one means you're home, not connecting.
        homes = {j[0]["departure"]["airport"] for j in out if _dep(f) - _dep(j[0]) <= RETURN_WINDOW}
        if (prev and prev["status"]["code"] != "cancelled" and f["departure"]["airport"] == prev["arrival"]["airport"]
                and prev["arrival"]["airport"] not in homes
                and timedelta(0) <= _dep(f) - _arr(prev) <= CONNECTION):
            out[-1].append(f)
        else:
            out.append([f])
    return out


def _joins(trip: list[list[dict]], journey: list[dict]) -> bool:
    flights = [f for j in trip for f in j]
    if {f["pnr"] for f in flights} & {f["pnr"] for f in journey}:
        return True
    origin, here = flights[0]["departure"]["airport"], flights[-1]["arrival"]["airport"]
    return (here != origin and journey[0]["departure"]["airport"] == here
            and journey[-1]["arrival"]["airport"] == origin
            and _dep(journey[0]) - _arr(flights[-1]) <= RETURN_WINDOW)


def _local_date(side: dict) -> str | None:
    return side["local_time"][:10] if side["local_time"] else None


def _summary(trip: list[list[dict]]) -> dict:
    flights = [f for j in trip for f in j]
    first, last = flights[0], flights[-1]
    round_trip = last["arrival"]["airport"] == first["departure"]["airport"]
    # Named after where you spend the most time between journeys; a one-way trip after where it ends.
    title = last["arrival"]["city"]
    if round_trip and len(trip) > 1:
        stays = [(_dep(b[0]) - _arr(a[-1]), a[-1]["arrival"]["city"]) for a, b in zip(trip, trip[1:])]
        title = max(stays, key=lambda s: s[0])[1]
    return {
        "id": first["id"],
        "title": title,
        "kind": "round_trip" if round_trip else "one_way",
        "start_date": _local_date(first["departure"]),
        "end_date": _local_date(last["arrival"]),
        "pnrs": list(dict.fromkeys(f["pnr"] for f in flights)),
        "past": all(f["status"]["code"] in DONE for f in flights),
        "journeys": [
            {
                "flight_ids": [f["id"] for f in j],
                "layovers": [
                    {"airport": a["arrival"]["airport"], "city": a["arrival"]["city"],
                     "minutes": int((_dep(b) - _arr(a)).total_seconds() // 60)}
                    for a, b in zip(j, j[1:])
                ],
            }
            for j in trip
        ],
        "flights": flights,
    }


def group(flights: list[dict]) -> list[dict]:
    """Trips in date order, each with its flights inline."""
    trips: list[list[list[dict]]] = []
    for journey in _journeys(flights):
        if trips and _joins(trips[-1], journey):
            trips[-1].append(journey)
        else:
            trips.append([journey])
    return [_summary(t) for t in trips]
