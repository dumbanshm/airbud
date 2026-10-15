from fastapi import Depends, Header, HTTPException
from sqlmodel import Session

from . import security
from .db import get_session
from .models import SessionToken, User


def current_user(authorization: str = Header(default=""), session: Session = Depends(get_session)) -> User:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Not signed in")
    row = session.get(SessionToken, security.hash_token(token))
    user = session.get(User, row.user_id) if row else None
    if not user:
        raise HTTPException(401, "Session expired, sign in again")
    return user
