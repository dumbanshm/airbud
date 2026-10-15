"""App settings, read from environment variables or backend/.env."""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DEFAULT_GMAIL_QUERY = (
    "newer_than:1y "
    '{subject:(itinerary OR e-ticket OR eticket OR "booking confirmation" OR "booking confirmed" '
    'OR "boarding pass" OR "flight confirmation" OR "schedule change" OR "your trip" OR PNR) '
    "filename:ics}"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore", populate_by_name=True)

    # Where this server is reachable from a browser. Google redirects here after sign-in,
    # so it must match the redirect URI registered in Google Cloud exactly.
    public_url: str = "http://localhost:8000"
    database_url: str = f"sqlite:///{DATA_DIR / 'airbud.db'}"

    google_client_id: str = ""
    # Where Google sends the browser after consent. Defaults to this server's /auth/google/callback.
    # Set it to the GitHub Pages relay (docs/oauth.html) to sign in without exposing this server.
    google_redirect_uri_override: str = Field(default="", alias="GOOGLE_REDIRECT_URI")
    google_client_secret: str = ""

    # Fernet key used to encrypt Gmail refresh tokens at rest. Generated into data/ if empty.
    encryption_key: str = ""

    # Deep-link prefixes the backend may redirect to after sign-in. Anything else is rejected,
    # so a malicious page can't use /auth/google/start to steal a login code.
    app_redirect_prefixes: str = "airbud://,exp://,exps://"

    sync_interval_minutes: int = 15
    gmail_query: str = DEFAULT_GMAIL_QUERY

    # Enables the "Try the demo" login that seeds sample bookings. Turn off on a public server.
    demo_mode: bool = True

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def google_redirect_uri(self) -> str:
        return self.google_redirect_uri_override or f"{self.public_url.rstrip('/')}/auth/google/callback"

    @property
    def redirect_prefixes(self) -> list[str]:
        return [p.strip() for p in self.app_redirect_prefixes.split(",") if p.strip()]


settings = Settings()
