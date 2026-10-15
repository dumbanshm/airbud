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


def test_relay_flow_finishes_over_lan(monkeypatch):
    """Google → relay page → app → POST /auth/google/finish, without the server being public."""
    import base64
    from urllib.parse import parse_qs, urlparse

    from app import gmail
    from app.config import settings

    monkeypatch.setattr(settings, "google_client_id", "x")
    monkeypatch.setattr(settings, "google_client_secret", "y")
    monkeypatch.setattr(settings, "google_redirect_uri_override", "https://example.github.io/airbud/oauth.html")
    monkeypatch.setattr(gmail, "exchange_code", lambda code: {
        "access_token": "a", "refresh_token": "r", "scope": "openid https://www.googleapis.com/auth/gmail.readonly"})
    monkeypatch.setattr(gmail, "userinfo", lambda token: {"email": "relay@example.com", "name": "Relay"})
    monkeypatch.setattr(gmail, "sync_user", lambda s, u: {"ok": True})

    with TestClient(app) as client:
        app_url = "exp://192.168.1.5:8081/--/auth"
        r = client.get("/auth/google/start", params={"app_redirect": app_url}, follow_redirects=False)
        google = parse_qs(urlparse(r.headers["location"]).query)
        assert google["redirect_uri"] == ["https://example.github.io/airbud/oauth.html"]

        # What docs/oauth.html does: decode the app URL from state.
        encoded = google["state"][0].split(".")[1]
        assert base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode() == app_url

        state = google["state"][0]
        token = client.post("/auth/google/finish", json={"code": "g", "state": state}).json()["token"]
        me = client.get("/me", headers={"Authorization": f"Bearer {token}"}).json()
        assert me["email"] == "relay@example.com" and me["gmail_connected"]

        # States are single-use.
        assert client.post("/auth/google/finish", json={"code": "g", "state": state}).status_code == 400
