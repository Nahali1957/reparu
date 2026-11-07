"""Affectation et planning (écran 5.13) : capacité 7 h/jour/technicien, alerte au-delà de 85 %."""

from datetime import date, datetime, time, timedelta

from sqlalchemy import case, select
from sqlalchemy.orm import Session

from app.core.clock import maintenant
from app.models.enums import Priorite, Role, Statut
from app.models.tables import Reparation, TempsPasse, User
from app.schemas.pilotage import ChargeTechOut, JourOut, PlanningOut
from app.services.regles import parametre
from app.services.reparations import carte, initiales

DUREE_DEFAUT_MIN = 45  # dossier pas encore chiffré
JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
EN_ATELIER = (Statut.recu, Statut.en_diagnostic, Statut.en_reparation)


def techniciens(db: Session) -> list[User]:
    return list(db.scalars(select(User).where(User.actif.is_(True), User.role.in_([Role.technicien, Role.responsable]))
                           .order_by(User.role.desc(), User.nom)))


def statut_charge(ouverts: int) -> str:
    return "Surchargé" if ouverts >= 4 else "Chargé" if ouverts >= 2 else "Disponible"


def charges(db: Session) -> list[ChargeTechOut]:
    ouverts: dict[int, list[Reparation]] = {}
    for r in db.scalars(select(Reparation).where(Reparation.statut.in_(EN_ATELIER), Reparation.tech_id.is_not(None))):
        ouverts.setdefault(r.tech_id, []).append(r)
    return [ChargeTechOut(id=t.id, nom=t.nom, initiales=initiales(t.nom), specialite=t.specialite, ouverts=len(ouverts.get(t.id, [])),
                          charge_min=sum(r.duree_estimee_min or DUREE_DEFAUT_MIN for r in ouverts.get(t.id, [])),
                          statut=statut_charge(len(ouverts.get(t.id, []))))
            for t in techniciens(db)]


def equilibre(ch: list[ChargeTechOut]) -> str:
    if not ch:
        return "Charge équilibrée"
    ecart = max(c.ouverts for c in ch) - min(c.ouverts for c in ch)
    return "Charge déséquilibrée" if ecart >= 3 else "Écart modéré" if ecart == 2 else "Charge équilibrée"


def semaine(db: Session, n_techs: int, aujourdhui: date | None = None) -> list[JourOut]:
    """Charge de la semaine : temps réellement pointé pour les jours passés, durées planifiées ensuite."""
    aujourdhui = aujourdhui or maintenant().date()
    lundi = aujourdhui - timedelta(days=aujourdhui.weekday())
    capacite_min = parametre(db, "capacite_jour_h") * 60 * max(n_techs, 1)
    seuil = parametre(db, "seuil_charge")
    reps = db.scalars(select(Reparation).where(Reparation.statut.in_(EN_ATELIER), Reparation.planifie_le.is_not(None),
                                               Reparation.planifie_le.between(aujourdhui, lundi + timedelta(days=5)))).all()
    pointages = db.scalars(select(TempsPasse).where(TempsPasse.debut >= datetime.combine(lundi, time.min),
                                                    TempsPasse.debut < datetime.combine(aujourdhui, time.min))).all()
    out = []
    for k, lib in enumerate(JOURS):
        jour = lundi + timedelta(days=k)
        if jour < aujourdhui:
            minutes = sum(((t.fin or t.debut) - t.debut).total_seconds() / 60 for t in pointages if t.debut.date() == jour)
        else:
            minutes = sum(r.duree_estimee_min or DUREE_DEFAUT_MIN for r in reps if r.planifie_le == jour)
        charge = minutes / capacite_min
        out.append(JourOut(jour=jour, libelle=lib, charge_pct=round(charge * 100), alerte=charge > seuil))
    return out


def planning(db: Session) -> PlanningOut:
    ch = charges(db)
    non_affectes = db.scalars(select(Reparation).where(Reparation.statut.in_(EN_ATELIER), Reparation.tech_id.is_(None))
                              .order_by(case((Reparation.priorite == Priorite.haute, 0), else_=1), Reparation.recu_le)).all()
    return PlanningOut(techniciens=ch, non_affectes=[carte(db, r) for r in non_affectes], equilibre=equilibre(ch),
                       semaine=semaine(db, len(ch)), capacite_jour_h=parametre(db, "capacite_jour_h"),
                       seuil_alerte_pct=round(parametre(db, "seuil_charge") * 100))
