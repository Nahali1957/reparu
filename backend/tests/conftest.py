import os

os.environ["MQTT_HOST"] = ""  # jamais de vrai broker pendant les tests (avant tout import de l'application)

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base


@pytest.fixture
def engine():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(eng, "connect")
    def _fk_on(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine):
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


# ---------------------------------------------------------------- API

from fastapi.testclient import TestClient  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.models.enums import Role  # noqa: E402
from app.models.tables import User  # noqa: E402

MDP = "MotDePasse-Test-1"
_HASH = hash_password(MDP)
COMPTES = {
    "admin": ("Claire Vasseur", "c.vasseur@reparu.fr", Role.admin),
    "responsable": ("Rémi Lambert", "r.lambert@reparu.fr", Role.responsable),
    "technicien": ("Lucas Marchand", "l.marchand@reparu.fr", Role.technicien),
}


@pytest.fixture
def users(db):
    out = {}
    for key, (nom, email, role) in COMPTES.items():
        u = User(nom=nom, email=email, role=role, password_hash=_HASH, actif=True)
        db.add(u)
        out[key] = u
    db.commit()
    return out


@pytest.fixture
def client(engine, users):
    fastapi_app.state.session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    fastapi_app.state.auth_limiter.reset()
    with TestClient(fastapi_app) as c:
        yield c


def login(client, role: str, remember: bool = False) -> dict:
    r = client.post("/api/auth/login", json={"email": COMPTES[role][1], "password": MDP, "se_souvenir": remember})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def auth(client):
    return lambda role: login(client, role)


# ---------------------------------------------------------------- base remplie (données synthétiques)

import sqlite3  # noqa: E402
from datetime import date  # noqa: E402

from app.seed import charger  # noqa: E402

_SEED_CACHE: dict[str, sqlite3.Connection] = {}


def _base_seed() -> sqlite3.Connection:
    """Génère une fois par session une base SQLite complète, copiée ensuite en mémoire pour chaque test."""
    if "conn" not in _SEED_CACHE:
        eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(eng)
        with sessionmaker(bind=eng)() as session:
            charger(session, date.today(), mot_de_passe=MDP, data_dir="/tmp/reparu-test")
        _SEED_CACHE["conn"] = eng.raw_connection().driver_connection
        _SEED_CACHE["engine"] = eng
    return _SEED_CACHE["conn"]


@pytest.fixture
def seeded_engine():
    source = _base_seed()
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    dest = eng.raw_connection().driver_connection
    source.backup(dest)
    dest.execute("PRAGMA foreign_keys=ON")
    yield eng
    eng.dispose()


@pytest.fixture
def sdb(seeded_engine):
    session = sessionmaker(bind=seeded_engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


@pytest.fixture
def api(seeded_engine, tmp_path, monkeypatch):
    """Client HTTP sur la base remplie ; `api.h(role)` renvoie les en-têtes d'un compte de démo."""
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "data_dir", str(tmp_path))
    fastapi_app.state.session_factory = sessionmaker(bind=seeded_engine, autoflush=False, expire_on_commit=False)
    fastapi_app.state.auth_limiter.reset()
    with TestClient(fastapi_app) as c:
        cache = {}

        def h(role: str) -> dict:
            if role not in cache:
                cache[role] = login(c, role)
                fastapi_app.state.auth_limiter.reset()
            return cache[role]

        c.h = h
        yield c
