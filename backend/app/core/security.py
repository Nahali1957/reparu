import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.clock import maintenant
from app.core.config import get_settings

ALGO = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def session_duration(remember: bool) -> timedelta:
    s = get_settings()
    return timedelta(days=s.jwt_remember_days) if remember else timedelta(hours=s.jwt_session_hours)


def create_token(user_id: int, role: str, remember: bool) -> tuple[str, str, datetime]:
    """Renvoie (jeton, jti, expiration en heure locale naïve)."""
    jti = secrets.token_hex(16)
    duree = session_duration(remember)
    exp = datetime.now(timezone.utc) + duree
    token = jwt.encode({"sub": str(user_id), "role": role, "jti": jti, "exp": exp}, get_settings().jwt_secret, algorithm=ALGO)
    return token, jti, maintenant() + duree


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGO])
    except jwt.PyJWTError:
        return None
