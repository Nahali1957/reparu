from datetime import datetime, timedelta

from sqlalchemy import select

from app.core.rbac import MATRICE, autorise
from app.models.enums import Role
from app.models.tables import AuditLog, Outbox
from tests.conftest import COMPTES, MDP


def actions(db):
    db.expire_all()
    return [a.action for a in db.scalars(select(AuditLog).order_by(AuditLog.id))]


def test_login_ok_renvoie_jeton_et_permissions(client, db):
    r = client.post("/api/auth/login", json={"email": "c.vasseur@reparu.fr", "password": MDP})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "admin"
    assert "comptes" in body["user"]["permissions"]
    assert "login_ok" in actions(db)


def test_session_8h_ou_30j(client):
    court = client.post("/api/auth/login", json={"email": COMPTES["admin"][1], "password": MDP}).json()
    long = client.post("/api/auth/login", json={"email": COMPTES["admin"][1], "password": MDP, "se_souvenir": True}).json()
    d_court = datetime.fromisoformat(court["expire_le"]) - datetime.now()
    d_long = datetime.fromisoformat(long["expire_le"]) - datetime.now()
    assert timedelta(hours=7, minutes=59) < d_court <= timedelta(hours=8)
    assert timedelta(days=29, hours=23) < d_long <= timedelta(days=30)


def test_echec_journalise(client, db):
    r = client.post("/api/auth/login", json={"email": "c.vasseur@reparu.fr", "password": "faux"})
    assert r.status_code == 401
    assert "4 tentative(s) restante(s)" in r.json()["detail"]
    assert actions(db)[-1] == "login_echec"


def test_verrouillage_apres_5_echecs(client):
    for _ in range(4):
        assert client.post("/api/auth/login", json={"email": "c.vasseur@reparu.fr", "password": "x"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "c.vasseur@reparu.fr", "password": "x"}).status_code == 423
    # Même le bon mot de passe est refusé pendant le verrouillage.
    assert client.post("/api/auth/login", json={"email": "c.vasseur@reparu.fr", "password": MDP}).status_code == 423


def test_rate_limit_sur_auth(client):
    codes = [client.post("/api/auth/login", json={"email": "x@reparu.fr", "password": "x"}).status_code for _ in range(12)]
    assert codes[-1] == 429


def test_sans_jeton_401(client):
    assert client.get("/api/comptes").status_code == 401


def test_technicien_403_sur_routes_admin(client, auth, db):
    h = auth("technicien")
    for method, url, body in [
        ("get", "/api/comptes", None),
        ("post", "/api/comptes", {"nom": "X Y", "email": "x@reparu.fr", "role": "technicien", "password": "0123456789"}),
        ("patch", "/api/comptes/1/statut", {"actif": False}),
        ("get", "/api/audit/journal", None),
    ]:
        r = client.request(method.upper(), url, headers=h, json=body)
        assert r.status_code == 403, url
        assert "Accès refusé" in r.json()["detail"] and "Technicien" in r.json()["detail"]
    assert actions(db).count("acces_refuse") == 4


def test_responsable_sans_gestion_des_comptes(client, auth):
    assert client.get("/api/comptes", headers=auth("responsable")).status_code == 403
    assert client.get("/api/comptes", headers=auth("admin")).status_code == 200


def test_matrice_responsable_egale_admin_sauf_comptes():
    for perm in MATRICE:
        if perm in ("comptes", "audit"):
            assert not autorise(Role.responsable, perm)
        else:
            assert autorise(Role.responsable, perm) == autorise(Role.admin, perm)


def test_logout_revoque_la_session(client, auth):
    h = auth("admin")
    assert client.post("/api/auth/logout", headers=h).status_code == 200
    assert client.get("/api/auth/me", headers=h).status_code == 401


def test_creation_et_desactivation_compte(client, auth, db):
    h = auth("admin")
    r = client.post("/api/comptes", headers=h, json={"nom": "Farid Haddad", "email": "f.haddad@reparu.fr",
                                                      "role": "technicien", "password": "Atelier-2026-ok"})
    assert r.status_code == 201
    uid = r.json()["id"]
    assert client.patch(f"/api/comptes/{uid}/statut", headers=h, json={"actif": False}).json()["actif"] is False
    r = client.post("/api/auth/login", json={"email": "f.haddad@reparu.fr", "password": "Atelier-2026-ok"})
    assert r.status_code == 403
    a = actions(db)
    assert "compte_creation" in a and "compte_toggle" in a and "ecriture" in a


def test_domaine_email_impose(client, auth):
    r = client.post("/api/comptes", headers=auth("admin"),
                    json={"nom": "X Y", "email": "x@gmail.com", "role": "technicien", "password": "0123456789"})
    assert r.status_code == 422


def test_journal_sensible(client, auth):
    client.get("/api/comptes", headers=auth("technicien"))
    journal = client.get("/api/audit/journal", headers=auth("admin")).json()
    libelles = [j["libelle"] for j in journal]
    assert any(lib.startswith("Tentative d'accès refusée — Gestion des comptes — l.marchand@reparu.fr") for lib in libelles)
    assert any(lib.startswith("Connexion réussie — c.vasseur@reparu.fr (Administrateur)") for lib in libelles)


def test_mot_de_passe_oublie_outbox_sans_enumeration(client, db):
    r1 = client.post("/api/auth/mot-de-passe-oublie", json={"email": "c.vasseur@reparu.fr"})
    r2 = client.post("/api/auth/mot-de-passe-oublie", json={"email": "inconnu@reparu.fr"})
    assert r1.status_code == r2.status_code == 202 and r1.json() == r2.json()
    assert db.scalar(select(Outbox).where(Outbox.destinataire == "c.vasseur@reparu.fr")) is not None


def test_en_tetes_de_securite(client):
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
