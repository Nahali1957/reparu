"""Surveillance par IA (M7) : anomalies dans le journal d'audit et dans les lectures capteurs.

Les alertes de sécurité alimentent le journal des accès sensibles (5.12) et la cloche
de l'administrateur ; les lectures atypiques alimentent l'écran 5.10.
"""

from datetime import timedelta

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.clock import maintenant
from app.ml import anomalies as A
from app.ml import registry
from app.models.enums import OrigineAnomalie, StatutAnomalie
from app.models.tables import Anomalie, Capteur, ModeleIA, User

FENETRE_ANALYSE = timedelta(hours=48)


class AlerteSecuriteOut(BaseModel):
    id: int
    type: str
    message: str
    score: float | None
    detectee_le: str
    statut: str
    modele_version: str | None


def _deja_signalee(db: Session, cle: str) -> bool:
    return any((a.details or {}).get("cle") == cle for a in db.scalars(
        select(Anomalie).where(Anomalie.origine == OrigineAnomalie.securite, Anomalie.detectee_le >= maintenant() - timedelta(days=3))))


def detecter_securite(db: Session) -> list[Anomalie]:
    actifs = set(db.scalars(select(ModeleIA.nom).where(ModeleIA.actif.is_(True))))
    if "securite" not in actifs:
        return []
    meta, bundle = registry.actif(db, "securite")
    fen = A.fenetres_securite(A.charger_audit(db, depuis=maintenant() - FENETRE_ANALYSE))
    if fen.empty:
        return []
    est = bundle["estimateur"]
    X = fen[bundle["metriques"]["colonnes"]]
    fen["anormal"] = est.predict(X) == -1
    fen["score"] = A.score_relatif(est, X, bundle["_reference_scores"])
    users = {u.email: u.id for u in db.scalars(select(User))}
    nouvelles = []
    for _, ligne in fen[fen["anormal"]].iterrows():
        cle = f"{ligne['identite']}@{ligne['heure']:%Y-%m-%dT%H}"
        if _deja_signalee(db, cle):
            continue
        type_, message = A.qualifier_securite(ligne)
        a = Anomalie(origine=OrigineAnomalie.securite, type=type_, user_id=users.get(ligne["identite"]),
                     score=round(float(ligne["score"]), 4), statut=StatutAnomalie.ouverte, detectee_le=maintenant(),
                     details={"cle": cle, "message": message, "modele_version": meta.version, "algorithme": meta.algorithme_retenu,
                              **{k: int(ligne[k]) for k in ("echecs", "succes", "refus", "exports", "nb_ip")}})
        db.add(a)
        par_ip = ligne["identite"].startswith("ip:")
        audit(db, "alerte_securite", user_id=a.user_id, email=None if par_ip else ligne["identite"], ressource=type_,
              details={"message": message, "score": a.score}, ip=ligne["identite"][3:] if par_ip else None, commit=False)
        nouvelles.append(a)
    db.commit()
    return nouvelles


def detecter_capteurs(db: Session) -> list[Anomalie]:
    actifs = set(db.scalars(select(ModeleIA.nom).where(ModeleIA.actif.is_(True))))
    if "capteurs" not in actifs:
        return []
    meta, bundle = registry.actif(db, "capteurs")
    f = A.features_capteurs(A.charger_lectures(db))
    if f.empty:
        return []
    dernieres = f.sort_values("recu_le").groupby("capteur_id").tail(1)
    X = dernieres[bundle["metriques"]["colonnes"]]
    pred = bundle["estimateur"].predict(X)
    scores = A.score_relatif(bundle["estimateur"], X, bundle["_reference_scores"])
    nouvelles = []
    for (_, ligne), p, score in zip(dernieres.iterrows(), pred, scores):
        if p != -1:
            continue
        cap = db.get(Capteur, int(ligne["capteur_id"]))
        deja = db.scalar(select(func.count()).select_from(Anomalie).where(Anomalie.capteur_id == cap.id,
                                                                          Anomalie.statut == StatutAnomalie.ouverte))
        if deja:  # une anomalie (règle ou IA) est déjà ouverte sur ce capteur
            continue
        a = Anomalie(origine=OrigineAnomalie.capteur, type="lecture_atypique", capteur_id=cap.id, statut=StatutAnomalie.ouverte,
                     score=round(float(score), 4), detectee_le=maintenant(), details={
                         "message": f"Bac {cap.code} ({cap.piece.designation}) : lecture atypique ({int(ligne['niveau'])}) "
                                    f"signalée par le modèle {meta.version}.",
                         "niveau_lu": int(ligne["niveau"]), "modele_version": meta.version, "lecture_id": int(ligne["id"])})
        db.add(a)
        nouvelles.append(a)
    db.commit()
    return nouvelles


def alertes(db: Session, limit: int = 20) -> list[AlerteSecuriteOut]:
    rows = db.scalars(select(Anomalie).where(Anomalie.origine == OrigineAnomalie.securite)
                      .order_by(Anomalie.detectee_le.desc(), Anomalie.id.desc()).limit(limit))
    return [AlerteSecuriteOut(id=a.id, type=a.type, message=(a.details or {}).get("message", a.type), score=a.score,
                              detectee_le=a.detectee_le.isoformat(), statut=a.statut.value,
                              modele_version=(a.details or {}).get("modele_version")) for a in rows]


def classer(db: Session, anomalie_id: int, faux_positif: bool, auteur: User, ip: str | None) -> AlerteSecuriteOut:
    a = db.get(Anomalie, anomalie_id)
    if a is None or a.origine != OrigineAnomalie.securite:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alerte introuvable.")
    a.statut = StatutAnomalie.faux_positif if faux_positif else StatutAnomalie.corrigee
    a.traitee_par, a.traitee_le = auteur.id, maintenant()
    audit(db, "alerte_traitee", user_id=auteur.id, email=auteur.email, ressource="anomalies", ressource_id=a.id,
          details={"faux_positif": faux_positif}, ip=ip)
    return next(x for x in alertes(db, 200) if x.id == a.id)
