from fastapi.testclient import TestClient

from app import trips
from app.main import app


def _f(id, pnr, dep, arr, dep_utc, arr_utc, status="on_time"):
    city = {"BLR": "Bangalore", "DEL": "New Delhi", "BOM": "Mumbai", "DXB": "Dubai", "LHR": "London", "GOI": "Goa"}
    side = lambda code, utc: {"airport": code, "city": city[code], "local_time": utc[:16] + ":00+05:30", "utc": utc}
    return {"id": id, "pnr": pnr, "departure": side(dep, dep_utc), "arrival": side(arr, arr_utc),
            "boarding_utc": dep_utc, "status": {"code": status}}


def test_demo_account_groups_into_three_trips():
    with TestClient(app) as client:
        token = client.post("/auth/demo").json()["token"]
        got = client.get("/trips", headers={"Authorization": f"Bearer {token}"}).json()

    assert [(t["title"], t["kind"]) for t in got] == [
        ("Bangalore", "one_way"), ("New Delhi", "round_trip"), ("London", "one_way")]
    past, delhi, london = got
    assert past["past"] and not delhi["past"]
    assert (delhi["start_date"], delhi["end_date"]) == ("2026-10-16", "2026-10-21")
    assert [f["flight_number"] for f in delhi["flights"]] == ["AI 503", "AI 504"]
    assert len(delhi["journeys"]) == 2
    assert [f["flight_number"] for f in london["flights"]] == ["EK 511", "EK 29"]
    assert london["journeys"][0]["layovers"] == [{"airport": "DXB", "city": "Dubai", "minutes": 130}]


def test_connection_on_separate_tickets_is_one_journey():
    got = trips.group([
        _f(1, "AAA", "DEL", "DXB", "2026-10-28T00:00:00Z", "2026-10-28T03:00:00Z"),
        _f(2, "BBB", "DXB", "LHR", "2026-10-28T05:00:00Z", "2026-10-28T12:00:00Z"),
    ])
    assert len(got) == 1 and got[0]["title"] == "London" and len(got[0]["journeys"]) == 1


def test_long_gap_is_not_a_connection():
    got = trips.group([
        _f(1, "AAA", "DEL", "DXB", "2026-10-28T00:00:00Z", "2026-10-28T03:00:00Z"),
        _f(2, "BBB", "DXB", "LHR", "2026-10-30T05:00:00Z", "2026-10-30T12:00:00Z"),
    ])
    assert [t["title"] for t in got] == ["Dubai", "London"]


def test_return_on_another_ticket_closes_the_trip():
    got = trips.group([
        _f(1, "AAA", "BLR", "GOI", "2026-11-01T04:00:00Z", "2026-11-01T05:30:00Z"),
        _f(2, "BBB", "GOI", "BLR", "2026-11-05T12:00:00Z", "2026-11-05T13:30:00Z"),
        _f(3, "CCC", "BLR", "DEL", "2026-11-06T04:00:00Z", "2026-11-06T07:00:00Z"),
    ])
    assert [(t["title"], t["kind"], len(t["flights"])) for t in got] == [("Goa", "round_trip", 2), ("New Delhi", "one_way", 1)]


def test_trip_is_named_after_the_longest_stay():
    got = trips.group([
        _f(1, "AAA", "BLR", "BOM", "2026-11-01T04:00:00Z", "2026-11-01T06:00:00Z"),
        _f(2, "AAA", "BOM", "DEL", "2026-11-03T04:00:00Z", "2026-11-03T06:00:00Z"),
        _f(3, "AAA", "DEL", "BLR", "2026-11-10T04:00:00Z", "2026-11-10T07:00:00Z"),
    ])
    assert len(got) == 1 and got[0]["title"] == "New Delhi" and got[0]["kind"] == "round_trip"
