from fastapi.testclient import TestClient

from app.main import app


def test_demo_login_flow_and_schedule_change():
    with TestClient(app) as client:
        token = client.post("/auth/demo").json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        flights = client.get("/flights", headers=h).json()
        assert [f["flight_number"] for f in flights] == ["6E 2134", "AI 503", "AI 504", "EK 511", "EK 29"]

        ai504 = next(f for f in flights if f["flight_number"] == "AI 504")
        assert ai504["departure"]["local_time"].endswith("T18:50:00+05:30")  # the schedule-change email won
        assert "moved" in ai504["change_note"]

        statuses = {e["status"] for e in client.get("/emails", headers=h).json()}
        assert statuses == {"parsed", "no_match"}
        assert client.get("/flights").status_code == 401


def test_google_start_rejects_foreign_redirects(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "google_client_id", "x")
    monkeypatch.setattr(settings, "google_client_secret", "y")
    with TestClient(app) as client:
        r = client.get("/auth/google/start", params={"app_redirect": "https://evil.example/steal"}, follow_redirects=False)
        assert r.status_code == 400
        r = client.get("/auth/google/start", params={"app_redirect": "airbud://auth"}, follow_redirects=False)
        assert r.status_code == 307 and r.headers["location"].startswith("https://accounts.google.com/")
