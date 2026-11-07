"""Parcours métier de bout en bout sur la base synthétique (M4)."""

from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models.tables import AuditLog, MouvementStock, Outbox, Piece, Reparation
from ml.data.generate import luhn_imei

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
IMEI_OK = "490154203237518"


def nouvel_imei() -> str:
    import random
    return luhn_imei(random.Random(), "99")


def ouvrir_dossier(api, role="technicien", priorite="normale") -> str:
    c = api.post("/api/clients", headers=api.h(role), json={"nom": "Test Client", "telephone": "06 11 22 33 44"}).json()
    a = api.post("/api/appareils", headers=api.h(role), json={"client_id": c["id"], "marque": "Apple", "modele": "iPhone 13",
                                                               "imei": nouvel_imei()}).json()
    r = api.post("/api/reparations", headers=api.h(role), json={"appareil_id": a["id"], "priorite": priorite,
                                                                 "symptomes_texte": "Écran fissuré après une chute, tactile mort"})
    assert r.status_code == 201, r.text
    return r.json()["numero"]


def photos_accueil(api, numero, role="technicien"):
    for t in ("etat_general", "zone_endommagee"):
        r = api.post(f"/api/reparations/{numero}/photos", headers=api.h(role), data={"type": t},
                     files={"fichier": ("p.png", PNG, "image/png")})
        assert r.status_code == 201, r.text


def statut(api, numero, cible, role="technicien"):
    return api.post(f"/api/reparations/{numero}/statut", headers=api.h(role), json={"statut": cible})


# ---------------------------------------------------------------- clients et appareils (F-01)


def test_liste_clients_paginee_triee(api):
    r = api.get("/api/clients?page=1&taille=20", headers=api.h("technicien")).json()
    noms = [c["nom"] for c in r["items"]]
    assert noms == sorted(noms) and len(noms) == 20 and r["total"] > 900
    assert api.get("/api/clients?q=zzzz-introuvable", headers=api.h("technicien")).json()["total"] == 0


def test_client_telephone_valide(api):
    assert api.post("/api/clients", headers=api.h("technicien"), json={"nom": "X Y", "telephone": "12345"}).status_code == 422


def test_imei_luhn_et_unicite(api):
    h = api.h("technicien")
    cid = api.post("/api/clients", headers=h, json={"nom": "Ada L", "telephone": "0612345678"}).json()["id"]
    base = {"client_id": cid, "marque": "Samsung", "modele": "Galaxy S22"}
    r = api.post("/api/appareils", headers=h, json={**base, "imei": "490154203237519"})
    assert r.status_code == 422 and "Luhn" in r.json()["detail"]
    assert api.post("/api/appareils", headers=h, json={**base, "imei": "4901542032"}).status_code == 422
    assert api.post("/api/appareils", headers=h, json={**base, "imei": IMEI_OK}).status_code == 201
    r = api.post("/api/appareils", headers=h, json={**base, "imei": IMEI_OK})
    assert r.status_code == 409
    assert api.post("/api/appareils", headers=h, json={**base, "client_id": 999999, "imei": nouvel_imei()}).status_code == 404


def test_fiche_client(api):
    fiche = api.get("/api/clients/1", headers=api.h("technicien")).json()
    assert fiche["appareils"] and fiche["historique"]
    assert fiche["conservation_jusquau"] is not None
    aid = fiche["appareils"][0]["id"]
    a = api.get(f"/api/appareils/{aid}", headers=api.h("technicien")).json()
    assert len(a["imei"]) == 15


def test_modeles_frequents(api):
    freq = api.get("/api/modeles/frequents", headers=api.h("technicien")).json()
    assert "iPhone 13" in freq[:3]


# ---------------------------------------------------------------- parcours complet d'un dossier (F-02, 5.14)


def test_parcours_complet_avec_garde_fous(api, sdb):
    n = ouvrir_dossier(api)
    d = api.get(f"/api/reparations/{n}", headers=api.h("technicien")).json()
    assert d["statut"] == "recu" and len(d["checklist"]) == 5 and "Écran fissuré / vitre cassée" in d["symptomes"]

    # 2 photos exigées à l'accueil
    r = statut(api, n, "en_diagnostic")
    assert r.status_code == 422 and "Deux clichés" in r.json()["detail"]
    photos_accueil(api, n)
    assert statut(api, n, "en_diagnostic").status_code == 200
    # pas de saut de colonne
    assert statut(api, n, "pret").status_code == 422

    # devis obligatoire avant l'intervention
    r = statut(api, n, "en_reparation")
    assert r.status_code == 422 and "devis" in r.json()["detail"]
    h = api.h("technicien")
    api.patch(f"/api/reparations/{n}", headers=h, json={"panne_code": "ecran", "diagnostic_final": "Écran OLED à remplacer",
                                                       "duree_estimee_min": 45, "cout_pieces_retenu": "80", "prix_retenu_ht": "185.75"})
    doc = api.post(f"/api/reparations/{n}/devis", headers=h).json()["document"]
    mo = next(li for li in doc["lignes"] if li["type"] == "main_oeuvre")
    assert Decimal(mo["qte"]) == Decimal("0.75") and Decimal(mo["total_ht"]) == Decimal("33.75")
    assert Decimal(doc["total_ht"]) == Decimal("185.75") and Decimal(doc["tva"]) == Decimal("37.15")
    assert Decimal(doc["total_ttc"]) == Decimal("222.90")
    assert doc["numero"].startswith("DV-") and doc["type"] == "DEVIS"
    api.post(f"/api/reparations/{n}/devis/envoyer", headers=h, json={"canal": "sms"})
    assert api.post(f"/api/reparations/{n}/devis/accepter", headers=h).status_code == 200
    assert api.post(f"/api/reparations/{n}/devis", headers=h).status_code == 422  # devis accepté figé
    assert statut(api, n, "en_reparation").status_code == 200

    # test de sortie obligatoire avant « Prêt à facturer »
    r = statut(api, n, "pret")
    assert r.status_code == 422 and "Prêt à facturer" in r.json()["detail"]
    r = api.post(f"/api/reparations/{n}/encaisser", headers=h, json={"mode": "carte"})
    assert r.status_code == 422
    api.patch(f"/api/reparations/{n}/checklist/5", headers=h, json={"faite": True})
    assert statut(api, n, "pret").status_code == 200
    assert api.patch(f"/api/reparations/{n}/checklist/5", headers=h, json={"faite": False}).status_code == 422

    # restitution impossible avant encaissement
    r = statut(api, n, "livre")
    assert r.status_code == 422 and "encaissé" in r.json()["detail"]
    fac = api.post(f"/api/reparations/{n}/encaisser", headers=h, json={"mode": "especes"}).json()["document"]
    assert fac["type"] == "FACTURE ACQUITTÉE" and fac["numero"].startswith("FA-") and fac["mode_reglement"] == "especes"
    assert all(e["fait"] for e in fac["etapes"])
    assert Decimal(fac["marge_nette"]) == Decimal("185.75") - 80 - Decimal("33.75")
    assert statut(api, n, "livre").status_code == 200
    d = api.get(f"/api/reparations/{n}", headers=h).json()
    assert d["cloture_le"] and [x["vers_statut"] for x in d["historique"]] == ["recu", "en_diagnostic", "en_reparation", "pret", "livre"]
    assert api.patch(f"/api/reparations/{n}", headers=h, json={"diagnostic_final": "x"}).status_code == 422
    assert sdb.scalar(select(func.count()).select_from(Outbox).where(Outbox.canal == "sms")) >= 1


def test_prix_inferieur_a_la_main_oeuvre(api):
    n = ouvrir_dossier(api)
    h = api.h("technicien")
    api.patch(f"/api/reparations/{n}", headers=h, json={"duree_estimee_min": 60, "prix_retenu_ht": "20"})
    r = api.post(f"/api/reparations/{n}/devis", headers=h)
    assert r.status_code == 422 and "main-d'œuvre" in r.json()["detail"]


def test_devis_refuse_puis_restitution(api):
    n = ouvrir_dossier(api)
    h = api.h("technicien")
    photos_accueil(api, n)
    statut(api, n, "en_diagnostic")
    api.patch(f"/api/reparations/{n}", headers=h, json={"duree_estimee_min": 30, "prix_retenu_ht": "60"})
    api.post(f"/api/reparations/{n}/devis", headers=h)
    api.post(f"/api/reparations/{n}/devis/refuser", headers=h)
    assert api.get(f"/api/reparations/{n}/facturation", headers=h).json()["document"]["statut_reglement"] == "Devis refusé"
    # un nouveau devis après refus prend un nouveau numéro
    premier = api.get(f"/api/reparations/{n}", headers=h).json()["devis_numero"]
    second = api.post(f"/api/reparations/{n}/devis", headers=h).json()["document"]["numero"]
    assert second != premier


def test_pieces_engagees_et_stock(api, sdb):
    n = ouvrir_dossier(api)
    h = api.h("technicien")
    piece = sdb.scalar(select(Piece).where(Piece.stock >= 2).order_by(Piece.id))
    avant = piece.stock
    d = api.post(f"/api/reparations/{n}/pieces", headers=h, json={"piece_id": piece.id, "qte": 2}).json()
    assert d["pieces"][0]["qte"] == 2 and Decimal(d["cout_pieces_retenu"]) == piece.prix_achat * 2
    sdb.expire_all()
    assert sdb.get(Piece, piece.id).stock == avant - 2
    mvt = sdb.scalar(select(MouvementStock).order_by(MouvementStock.id.desc()))
    assert mvt.qte == -2 and mvt.motif == f"Réparation {n}" and mvt.par_user_id is not None
    d = api.delete(f"/api/reparations/{n}/pieces/{d['pieces'][0]['id']}", headers=h).json()
    sdb.expire_all()
    assert d["pieces"] == [] and sdb.get(Piece, piece.id).stock == avant
    rupture = sdb.scalar(select(Piece).where(Piece.stock == 0))
    if rupture:
        assert api.post(f"/api/reparations/{n}/pieces", headers=h, json={"piece_id": rupture.id}).status_code == 409


def test_chrono_et_notification(api, sdb):
    n = ouvrir_dossier(api)
    h = api.h("technicien")
    d = api.post(f"/api/reparations/{n}/chrono/demarrer", headers=h).json()
    assert d["chrono_depuis"] is not None
    assert api.post(f"/api/reparations/{n}/chrono/demarrer", headers=h).status_code == 422
    d = api.post(f"/api/reparations/{n}/chrono/arreter", headers=h).json()
    assert d["chrono_depuis"] is None
    assert api.post(f"/api/reparations/{n}/chrono/pause", headers=h).status_code == 404
    r = api.post(f"/api/reparations/{n}/notifier", headers=h)
    assert "SMS simulé" in r.json()["detail"]


def test_photos(api):
    n = ouvrir_dossier(api)
    h = api.h("technicien")
    r = api.post(f"/api/reparations/{n}/photos", headers=h, data={"type": "autre"}, files={"fichier": ("x.gif", b"GIF89a", "image/gif")})
    assert r.status_code == 422
    photos_accueil(api, n)
    d = api.get(f"/api/reparations/{n}", headers=h).json()
    img = api.get(d["photos"][0]["url"], headers=h)
    assert img.status_code == 200 and img.content == PNG


def test_kanban_filtres(api):
    h = api.h("technicien")
    tous = api.get("/api/reparations", headers=h).json()
    mes = api.get("/api/reparations?filtre=mes", headers=h).json()
    haute = api.get("/api/reparations?filtre=haute", headers=h).json()
    assert len(mes) <= len(tous) and all(c["priorite"] == "haute" for c in haute)
    me = api.get("/api/auth/me", headers=h).json()
    assert all(c["technicien"]["id"] == me["id"] for c in mes)
    assert all(c["statut"] != "livre" or c["recu_le"] for c in tous)


def test_affectation_reservee_au_planning(api, sdb):
    n = ouvrir_dossier(api)
    tech = api.get("/api/auth/me", headers=api.h("technicien")).json()
    assert api.post(f"/api/reparations/{n}/affecter", headers=api.h("technicien"), json={"tech_id": tech["id"]}).status_code == 403
    d = api.post(f"/api/reparations/{n}/affecter", headers=api.h("responsable"), json={"tech_id": tech["id"]}).json()
    assert d["technicien"]["id"] == tech["id"] and d["planifie_le"]
    assert sdb.scalar(select(AuditLog).where(AuditLog.action == "affectation")) is not None


# ---------------------------------------------------------------- documents PDF


def test_pdfs(api, sdb):
    h = api.h("technicien")
    rep = sdb.scalar(select(Reparation).where(Reparation.statut == "livre", Reparation.retour_de_id.is_(None),
                                              Reparation.valide_client_le.is_not(None)).order_by(Reparation.id.desc()))
    for url in (f"/api/reparations/{rep.numero}/document.pdf", f"/api/reparations/{rep.numero}/bon-restitution.pdf",
                f"/api/reparations/{rep.numero}/etiquette.pdf"):
        r = api.get(url, headers=h)
        assert r.status_code == 200 and r.content.startswith(b"%PDF"), url
    assert api.get("/api/facturation/recents", headers=h).json()[0]["numero"]


# ---------------------------------------------------------------- stocks et fournisseurs (F-06, F-08)


def test_inventaire_et_statuts(api):
    inv = api.get("/api/pieces", headers=api.h("technicien")).json()
    c = inv["compteurs"]
    assert c["Toutes"] == c["En stock"] + c["Seuil bas"] + c["Rupture"] == len(inv["pieces"])
    rupt = api.get("/api/pieces?statut=Rupture", headers=api.h("technicien")).json()["pieces"]
    assert all(p["stock"] == 0 and p["statut"] == "Rupture" for p in rupt)
    assert all(0 <= p["niveau"] <= 1 for p in inv["pieces"])


def test_correction_stock_tracee(api, sdb):
    p = sdb.scalar(select(Piece).where(Piece.stock > 1))
    corps = {"qte": -1, "motif": "Recomptage inventaire"}
    assert api.post(f"/api/pieces/{p.id}/ajustement", headers=api.h("technicien"), json=corps).status_code == 403
    r = api.post(f"/api/pieces/{p.id}/ajustement", headers=api.h("responsable"), json=corps)
    assert r.status_code == 201 and r.json()["par"] == "Rémi Lambert" and r.json()["source"] == "manuel"
    assert api.post(f"/api/pieces/{p.id}/ajustement", headers=api.h("admin"), json={"qte": -9999, "motif": "x"}).status_code == 422
    assert sdb.scalar(select(AuditLog).where(AuditLog.action == "stock_correction")) is not None


def test_bons_de_commande(api, sdb):
    h = api.h("admin")
    bons = api.post("/api/bons-commande/generer", headers=h).json()
    if not bons:
        pytest.skip("aucune pièce sous le seuil sans commande en cours")
    bc = bons[0]
    assert bc["statut"] == "brouillon" and bc["lignes"]
    assert api.post("/api/bons-commande/generer", headers=h).json() == []  # pas de doublon
    assert api.post(f"/api/bons-commande/{bc['id']}/envoyer", headers=h).json()["statut"] == "envoye"
    piece_id, qte = bc["lignes"][0]["piece_id"], bc["lignes"][0]["qte"]
    avant = sdb.get(Piece, piece_id).stock
    assert api.post(f"/api/bons-commande/{bc['id']}/receptionner", headers=h).json()["statut"] == "recu"
    sdb.expire_all()
    assert sdb.get(Piece, piece_id).stock == avant + qte
    assert api.post(f"/api/bons-commande/{bc['id']}/receptionner", headers=h).status_code == 422


def test_comparaison_fournisseurs(api):
    h = api.h("admin")
    comp = api.get("/api/pieces/1/offres", headers=h).json()
    reco = [o for o in comp["offres"] if o["recommande"]]
    assert len(reco) <= 1
    assert all(o["disponibilite"] == "dispo" for o in reco)
    assert comp["recommandation"].startswith("Recommandation d'achat")
    assert api.get("/api/pieces/1/offres", headers=api.h("technicien")).status_code == 403
    f = api.post("/api/fournisseurs", headers=h, json={"nom": "Nouveau Fournisseur", "delai_jours": 4, "fiabilite": 0.99}).json()
    comp = api.post("/api/offres", headers=h, json={"fournisseur_id": f["id"], "piece_id": 1, "prix_ht": "0.50", "delai_jours": 0}).json()
    assert next(o for o in comp["offres"] if o["recommande"])["fournisseur"] == "Nouveau Fournisseur"
    bc = api.post(f"/api/fournisseurs/{f['id']}/commander", headers=h, json={"piece_id": 1, "qte": 3}).json()
    assert bc["fournisseur"] == "Nouveau Fournisseur" and bc["numero"].startswith("BC-")


# ---------------------------------------------------------------- pilotage (F-09) et en-tête


def test_dashboard(api, sdb):
    assert api.get("/api/dashboard", headers=api.h("technicien")).status_code == 403
    d = api.get("/api/dashboard?periode=12m", headers=api.h("admin")).json()
    assert d["reparations"]["valeur"] > 500
    assert d["ruptures"] == sdb.scalar(select(func.count()).select_from(Piece).where(Piece.stock <= Piece.seuil))
    assert len(d["alertes"]) <= 3 and d["alertes_total"] == d["ruptures"]
    assert len(d["serie"]) == 12 and d["serie"][-1]["courant"]
    assert abs(sum(r["pct"] for r in d["repartition"]) - 100) < 1


def test_rapports_et_exports(api, sdb):
    h = api.h("responsable")
    r = api.get("/api/rapports?periode=12m", headers=h).json()
    for k in ("ca", "marge_brute", "reparations", "delai_moyen_j", "taux_retour_pct", "panier_moyen"):
        assert r[k]["valeur"] is not None, k
    assert r["rentabilite"][0]["label"] == "Écran cassé"
    csv = api.get("/api/rapports/export.csv?periode=12m", headers=h)
    assert csv.status_code == 200 and csv.text.lstrip("﻿").startswith("dossier;recu_le")
    assert "Client" not in csv.text  # pas de données personnelles dans l'export
    assert api.get("/api/rapports/export.pdf?periode=mois", headers=h).content.startswith(b"%PDF")
    prog = api.post("/api/rapports/programmer", headers=h, json={"format": "pdf"}).json()
    assert prog["programme_pour"].endswith("08:00:00")
    assert sdb.scalar(select(Outbox).where(Outbox.programme_pour.is_not(None))) is not None
    assert sdb.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == "export")) >= 2
    perso = api.get("/api/rapports?du=2026-01-01&au=2026-01-31", headers=h).json()
    assert perso["periode"]["code"] == "perso"


def test_planning(api):
    assert api.get("/api/planning", headers=api.h("technicien")).status_code == 403
    p = api.get("/api/planning", headers=api.h("admin")).json()
    assert [j["libelle"] for j in p["semaine"]] == ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
    assert p["capacite_jour_h"] == 7 and p["seuil_alerte_pct"] == 85
    assert {t["statut"] for t in p["techniciens"]} <= {"Disponible", "Chargé", "Surchargé"}
    assert api.get("/api/techniciens", headers=api.h("technicien")).status_code == 200


def test_recherche_et_notifications(api):
    h = api.h("technicien")
    res = api.get("/api/recherche?q=REP-00", headers=h).json()
    assert res and res[0]["type"] == "dossier"
    notif_tech = api.get("/api/notifications", headers=h).json()
    notif_admin = api.get("/api/notifications", headers=api.h("admin")).json()
    assert notif_tech["total"] == len(notif_tech["alertes"])
    assert notif_admin["total"] >= notif_tech["total"]
