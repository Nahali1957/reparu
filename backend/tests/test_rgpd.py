"""RGPD (M9) : purge à 3 ans, factures préservées, droits d'accès et d'effacement."""

from datetime import timedelta

from sqlalchemy import select

from app.core.clock import maintenant
from app.models.tables import AuditLog, Client, Facture, Reparation
from app.services import rgpd


def test_purge_anonymise_les_clients_inactifs_depuis_3_ans(sdb):
    now = maintenant() + timedelta(days=365 * 3 + 200)  # on se projette : tout l'historique a plus de 3 ans
    rep = sdb.scalar(select(Reparation).join(Facture, Facture.reparation_id == Reparation.id))
    nom_facture = sdb.scalar(select(Facture.client_nom).where(Facture.reparation_id == rep.id))
    out = rgpd.purger(sdb, now)
    sdb.expire_all()
    assert out.clients_anonymises > 900 and out.journaux_supprimes > 0
    c = sdb.get(Client, rep.client_id)
    assert c.nom.startswith("Client anonymisé") and c.email is None and c.telephone == "anonymisé"
    assert all(a.imei.startswith("X") for a in c.appareils)
    assert sdb.scalar(select(Facture.client_nom).where(Facture.reparation_id == rep.id)) == nom_facture  # obligation légale
    ouverts = sdb.scalars(select(Reparation).where(Reparation.statut != "livre")).all()
    assert all(not r.client.nom.startswith("Client anonymisé") for r in ouverts)  # dossier en cours : pas d'anonymisation
    assert rgpd.purger(sdb, now).clients_anonymises == 0  # idempotent
    assert sdb.scalar(select(AuditLog).where(AuditLog.action == "rgpd_purge")) is not None


def test_purge_ne_touche_pas_aux_clients_recents(sdb):
    assert rgpd.purger(sdb).clients_anonymises == 0


def test_droits_acces_et_effacement(api, sdb):
    rep = sdb.scalar(select(Reparation).where(Reparation.statut == "livre").order_by(Reparation.id.desc()))
    cid = rep.client_id
    assert api.get(f"/api/clients/{cid}/export-rgpd", headers=api.h("technicien")).status_code == 403
    export = api.get(f"/api/clients/{cid}/export-rgpd", headers=api.h("responsable")).json()
    assert export["client"]["id"] == cid and export["reparations"] and export["finalite"]
    assert api.post(f"/api/clients/{cid}/anonymiser", headers=api.h("responsable")).status_code == 403
    if not any(r.statut.value != "livre" for r in sdb.scalars(select(Reparation).where(Reparation.client_id == cid))):
        fiche = api.post(f"/api/clients/{cid}/anonymiser", headers=api.h("admin")).json()
        assert fiche["nom"].startswith("Client anonymisé")
    ouvert = sdb.scalar(select(Reparation).where(Reparation.statut != "livre"))
    assert api.post(f"/api/clients/{ouvert.client_id}/anonymiser", headers=api.h("admin")).status_code == 409
