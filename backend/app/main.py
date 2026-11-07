from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, clients, comptes, health, ia, pilotage, reparations, stocks
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.middleware import RateLimiter, SecurityMiddleware

settings = get_settings()

app = FastAPI(
    title="Repar U API",
    description="Plateforme d'aide à la décision pour l'atelier Repar U.",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.state.session_factory = SessionLocal
app.state.auth_limiter = RateLimiter(max_requests=10, window_s=60)

app.add_middleware(SecurityMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

for module in (health, auth, comptes, clients, reparations, stocks, pilotage, ia):
    app.include_router(module.router, prefix="/api")
