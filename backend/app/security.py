"""Token generation/hashing and at-rest encryption for Gmail refresh tokens."""

import hashlib
import secrets

from cryptography.fernet import Fernet

from .config import DATA_DIR, settings


def _load_fernet() -> Fernet:
    key = settings.encryption_key
    if not key:
        key_file = DATA_DIR / "secret.key"
        if not key_file.exists():
            key_file.write_text(Fernet.generate_key().decode())
            key_file.chmod(0o600)
        key = key_file.read_text().strip()
    return Fernet(key.encode())


_fernet = _load_fernet()


def encrypt(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return _fernet.decrypt(value.encode()).decode()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    # Only hashes are stored, so a leaked database can't be used to log in.
    return hashlib.sha256(token.encode()).hexdigest()
