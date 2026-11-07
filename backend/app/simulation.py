"""Scénarios d'attaque SIMULÉS contre l'API locale, pour démontrer la détection d'anomalies (M7).

    docker compose exec backend python -m app.simulation brute-force [email]
"""

import sys

import httpx

from app.core.db import SessionLocal
from app.services.securite import detecter_securite

API = "http://localhost:8000/api"


def brute_force(email: str, essais: int = 30) -> None:
    codes: dict[int, int] = {}
    with httpx.Client(timeout=5) as c:
        for k in range(essais):
            r = c.post(f"{API}/auth/login", json={"email": email, "password": f"devine-{k}"})
            codes[r.status_code] = codes.get(r.status_code, 0) + 1
    print(f"{essais} tentatives sur {email} : réponses {codes} (401 refus, 423 compte verrouillé, 429 débit limité)")
    with SessionLocal() as db:
        alertes = detecter_securite(db)
    for a in alertes:
        print(f"ALERTE [{a.type}] score {a.score} : {a.details['message']}")
    if not alertes:
        print("Aucune nouvelle alerte (déjà signalée pour cette heure ?)")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] != "brute-force":
        sys.exit(__doc__)
    brute_force(sys.argv[2] if len(sys.argv) > 2 else "l.marchand@reparu.fr")
