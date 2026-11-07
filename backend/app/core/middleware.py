import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.audit import audit
from app.core.security import decode_token

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(self), geolocation=(), microphone=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cache-Control": "no-store",
}
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Routes déjà journalisées finement par leur propre service.
AUDIT_EXCLUS = ("/api/auth/login", "/api/auth/mot-de-passe-oublie")


class RateLimiter:
    """Fenêtre glissante en mémoire, par IP (un seul worker uvicorn)."""

    def __init__(self, max_requests: int, window_s: int):
        self.max, self.window = max_requests, window_s
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.max:
            return False
        q.append(now)
        return True

    def reset(self) -> None:
        self.hits.clear()


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        ip = request.client.host if request.client else "?"
        if path.startswith("/api/auth/") and request.method == "POST":
            if not request.app.state.auth_limiter.allow(ip):
                return JSONResponse({"detail": "Trop de tentatives : réessayez dans une minute."}, status_code=429)

        response = await call_next(request)

        if not path.startswith("/api/docs"):
            for k, v in SECURITY_HEADERS.items():
                response.headers.setdefault(k, v)
        if request.method in WRITE_METHODS and path.startswith("/api/") and not path.startswith(AUDIT_EXCLUS):
            self._audit_write(request, response.status_code, ip)
        return response

    @staticmethod
    def _audit_write(request: Request, status_code: int, ip: str) -> None:
        user_id = getattr(request.state, "user_id", None)
        if user_id is None:
            auth = request.headers.get("authorization", "")
            payload = decode_token(auth[7:]) if auth.lower().startswith("bearer ") else None
            user_id = int(payload["sub"]) if payload else None
        db = request.app.state.session_factory()
        try:
            audit(db, "ecriture", user_id=user_id, ressource=request.url.path,
                  details={"methode": request.method, "statut_http": status_code}, ip=ip)
        finally:
            db.close()
