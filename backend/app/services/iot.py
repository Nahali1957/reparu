"""Capteurs IoT (écran 5.10).

Règle centrale : une lecture capteur ne modifie JAMAIS le stock comptable. Elle est
stockée, rapprochée du stock, et peut ouvrir une anomalie ; la correction éventuelle
est un mouvement de stock nominatif et journalisé (`stocks.ajuster`).
"""

from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.clock import maintenant
from app.core.config import get_settings
from app.models.enums import OrigineAnomalie, StatutAnomalie
from app.models.tables import Anomalie, Capteur, LectureCapteur, Piece, User
from app.schemas import iot as s
from app.schemas.stocks import AjustementIn
from app.services import stocks

ECART_MIN = 2           # écart (unités) à partir duquel un bac est suspect…
LECTURES_CONFIRMATION = 2  # …s'il se répète sur 2 lectures consécutives (filtre le bruit de comptage)
FACTEUR_MUET = 2.5      # muet après 2,5 périodes sans remontée
MUET_MIN = timedelta(minutes=10)


def periode() -> timedelta:
    return timedelta(seconds=get_settings().iot_periode_s)


def _anomalie_ouverte(db: Session, capteur_id: int, type_: str) -> Anomalie | None:
    return db.scalar(select(Anomalie).where(Anomalie.capteur_id == capteur_id, Anomalie.type == type_,
                                            Anomalie.statut == StatutAnomalie.ouverte))


def _ouvrir(db: Session, cap: Capteur, type_: str, message: str, **details) -> Anomalie:
    a = _anomalie_ouverte(db, cap.id, type_)
    if a is None:
        a = Anomalie(origine=OrigineAnomalie.capteur, type=type_, capteur_id=cap.id, statut=StatutAnomalie.ouverte,
                     detectee_le=maintenant())
        db.add(a)
    a.details = {"message": message, **details}
    return a


def _aberrant(niveau: int, piece: Piece) -> bool:
    return niveau > max(50, 10 * max(piece.stock, piece.seuil * 3))


# ---------------------------------------------------------------- réception et rapprochement


def enregistrer_lecture(db: Session, code_topic: str, data: s.LectureIn) -> LectureCapteur:
    """Appelé par le client MQTT. Le topic fait foi pour l'identité (l'ACL du broker garantit qu'un capteur
    ne peut publier que sur son propre topic) ; une charge utile incohérente est rejetée."""
    if data.device != code_topic:
        raise ValueError(f"identité incohérente : topic {code_topic}, charge utile {data.device}")
    cap = db.scalar(select(Capteur).where(Capteur.code == code_topic))
    if cap is None or not cap.actif:
        raise ValueError(f"capteur inconnu ou inactif : {code_topic}")
    now = maintenant()
    lec = LectureCapteur(capteur_id=cap.id, niveau=data.niveau, recu_le=now, brut=data.model_dump(mode="json"))
    db.add(lec)
    cap.derniere_lecture_le = now
    muet = _anomalie_ouverte(db, cap.id, "capteur_muet")
    if muet:  # le capteur émet de nouveau : l'anomalie se referme d'elle-même
        muet.statut, muet.traitee_le = StatutAnomalie.corrigee, now
        muet.details = {**(muet.details or {}), "resolution": "reprise automatique des remontées"}
    db.flush()
    rapprocher_capteur(db, cap)
    db.commit()
    return lec


def rapprocher_capteur(db: Session, cap: Capteur) -> None:
    piece = cap.piece
    dernieres = db.scalars(select(LectureCapteur).where(LectureCapteur.capteur_id == cap.id)
                           .order_by(LectureCapteur.recu_le.desc(), LectureCapteur.id.desc()).limit(LECTURES_CONFIRMATION)).all()
    if not dernieres:
        return
    derniere = dernieres[0]
    if _aberrant(derniere.niveau, piece):
        _ouvrir(db, cap, "valeur_aberrante", f"Bac {cap.code} ({piece.designation}) : valeur aberrante {derniere.niveau} "
                                             f"ignorée (stock comptable {piece.stock}).", niveau_lu=derniere.niveau,
                stock_comptable=piece.stock)
        return
    if len(dernieres) == LECTURES_CONFIRMATION and all(abs(piece.stock - lec.niveau) >= ECART_MIN for lec in dernieres):
        _ouvrir(db, cap, "ecart_stock",
                f"Bac {cap.code} ({piece.designation}) : {derniere.niveau} unité(s) lue(s) pour {piece.stock} en stock comptable.",
                niveau_lu=derniere.niveau, stock_comptable=piece.stock, ecart=piece.stock - derniere.niveau)


def rapprocher(db: Session, maintenant_: datetime | None = None) -> int:
    """Passe périodique : écarts persistants et capteurs muets. Renvoie le nombre d'anomalies ouvertes."""
    now = maintenant_ or maintenant()
    seuil_muet = max(periode() * FACTEUR_MUET, MUET_MIN)
    for cap in db.scalars(select(Capteur).where(Capteur.actif.is_(True))):
        rapprocher_capteur(db, cap)
        if cap.derniere_lecture_le is None or now - cap.derniere_lecture_le > seuil_muet:
            depuis = f"depuis le {cap.derniere_lecture_le:%d/%m à %H:%M}" if cap.derniere_lecture_le else "jamais"
            _ouvrir(db, cap, "capteur_muet", f"Capteur {cap.code} ({cap.piece.designation}) muet : aucune remontée {depuis}.")
    db.commit()
    return db.scalar(select(func.count()).select_from(Anomalie).where(Anomalie.origine == OrigineAnomalie.capteur,
                                                                       Anomalie.statut == StatutAnomalie.ouverte))


def consignes(db: Session) -> dict[str, int]:
    """Stock comptable de chaque bac surveillé, publié aux capteurs (jumeau numérique de la simulation)."""
    return {cap.code: cap.piece.stock for cap in db.scalars(select(Capteur).where(Capteur.actif.is_(True)))}


# ---------------------------------------------------------------- écran 5.10


def _anomalie_out(a: Anomalie, codes: dict[int, Capteur]) -> s.AnomalieOut:
    cap = codes.get(a.capteur_id)
    d = a.details or {}
    return s.AnomalieOut(id=a.id, origine=a.origine.value, type=a.type, capteur=cap.code if cap else None,
                         piece_id=cap.piece_id if cap else None, message=d.get("message", a.type), score=a.score,
                         detectee_le=a.detectee_le, statut=a.statut.value, stock_comptable=cap.piece.stock if cap else None,
                         niveau_lu=d.get("niveau_lu"))


def vue(db: Session) -> s.IotOut:
    now = maintenant()
    caps = db.scalars(select(Capteur).order_by(Capteur.code)).all()
    ouvertes = db.scalars(select(Anomalie).where(Anomalie.origine == OrigineAnomalie.capteur, Anomalie.statut == StatutAnomalie.ouverte)
                          .order_by(Anomalie.detectee_le.desc())).all()
    par_capteur = {(a.capteur_id, a.type) for a in ouvertes}
    seuil_muet = max(periode() * FACTEUR_MUET, MUET_MIN)
    depuis = now - timedelta(days=7)
    out = []
    for cap in caps:
        hist = db.scalars(select(LectureCapteur).where(LectureCapteur.capteur_id == cap.id, LectureCapteur.recu_le >= depuis)
                          .order_by(LectureCapteur.recu_le.desc()).limit(28)).all()[::-1]
        dernier = hist[-1].niveau if hist else None
        if not cap.actif:
            st = "Inactif"
        elif cap.derniere_lecture_le is None or now - cap.derniere_lecture_le > seuil_muet:
            st = "Muet"
        elif (cap.id, "ecart_stock") in par_capteur or (cap.id, "valeur_aberrante") in par_capteur:
            st = "Écart"
        else:
            st = "OK"
        out.append(s.CapteurOut(id=cap.id, code=cap.code, emplacement=cap.emplacement, piece_id=cap.piece_id,
                                piece=cap.piece.designation, stock_comptable=cap.piece.stock, dernier_niveau=dernier,
                                ecart=None if dernier is None else cap.piece.stock - dernier,
                                derniere_lecture_le=cap.derniere_lecture_le, statut=st,
                                historique=[s.PointOut(le=lec.recu_le, niveau=lec.niveau) for lec in hist]))
    codes = {c.id: c for c in caps}
    return s.IotOut(capteurs_actifs=sum(1 for c in out if c.statut in ("OK", "Écart")), capteurs_total=len(caps),
                    anomalies_ouvertes=len(ouvertes), derniere_remontee=max((c.derniere_lecture_le for c in caps if c.derniere_lecture_le), default=None),
                    periode_s=get_settings().iot_periode_s, capteurs=out, anomalies=[_anomalie_out(a, codes) for a in ouvertes])


def lectures(db: Session, capteur_id: int, limit: int) -> list[s.PointOut]:
    if db.get(Capteur, capteur_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Capteur introuvable.")
    rows = db.scalars(select(LectureCapteur).where(LectureCapteur.capteur_id == capteur_id)
                      .order_by(LectureCapteur.recu_le.desc()).limit(limit)).all()
    return [s.PointOut(le=lec.recu_le, niveau=lec.niveau) for lec in reversed(rows)]


def _anomalie(db: Session, anomalie_id: int) -> Anomalie:
    a = db.get(Anomalie, anomalie_id)
    if a is None or a.origine != OrigineAnomalie.capteur:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Anomalie introuvable.")
    if a.statut != StatutAnomalie.ouverte:
        raise HTTPException(status.HTTP_409_CONFLICT, "Anomalie déjà traitée.")
    return a


def corriger(db: Session, anomalie_id: int, data: s.CorrectionIn, auteur: User, ip: str | None) -> s.AnomalieOut:
    """Recomptage physique par un humain : le stock comptable est aligné par un mouvement tracé et nominatif."""
    a = _anomalie(db, anomalie_id)
    cap = db.get(Capteur, a.capteur_id)
    ecart = data.recompte - cap.piece.stock
    if ecart == 0:  # le recomptage confirme le stock comptable : c'est le capteur qui se trompait
        a.statut, a.traitee_par, a.traitee_le = StatutAnomalie.faux_positif, auteur.id, maintenant()
        a.details = {**(a.details or {}), "recompte": data.recompte, "resolution": "recomptage conforme au stock comptable"}
        audit(db, "anomalie_faux_positif", user_id=auteur.id, email=auteur.email, ressource="anomalies", ressource_id=a.id, ip=ip)
    else:
        stocks.ajuster(db, cap.piece_id, AjustementIn(qte=ecart, motif=f"{data.motif} ({cap.code})", anomalie_id=a.id), auteur, ip)
        a.details = {**(a.details or {}), "recompte": data.recompte}
        db.commit()
    return _anomalie_out(a, {cap.id: cap})


def ignorer(db: Session, anomalie_id: int, auteur: User, ip: str | None) -> s.AnomalieOut:
    a = _anomalie(db, anomalie_id)
    a.statut, a.traitee_par, a.traitee_le = StatutAnomalie.faux_positif, auteur.id, maintenant()
    audit(db, "anomalie_faux_positif", user_id=auteur.id, email=auteur.email, ressource="anomalies", ressource_id=a.id, ip=ip)
    cap = db.get(Capteur, a.capteur_id)
    return _anomalie_out(a, {cap.id: cap} if cap else {})
