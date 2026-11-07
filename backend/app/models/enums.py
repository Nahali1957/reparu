from enum import StrEnum

from sqlalchemy import Enum as SAEnum


def db_enum(enum_cls: type[StrEnum], name: str) -> SAEnum:
    """Enum MySQL natif stockant la valeur (et non le nom) du membre."""
    return SAEnum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e], validate_strings=True)


class Role(StrEnum):
    admin = "admin"
    responsable = "responsable"
    technicien = "technicien"


class Statut(StrEnum):
    recu = "recu"
    en_diagnostic = "en_diagnostic"
    en_reparation = "en_reparation"
    pret = "pret"
    livre = "livre"


STATUTS_ORDRE = [Statut.recu, Statut.en_diagnostic, Statut.en_reparation, Statut.pret, Statut.livre]


class Priorite(StrEnum):
    basse = "basse"
    normale = "normale"
    haute = "haute"


class TypePhoto(StrEnum):
    etat_general = "etat_general"
    zone_endommagee = "zone_endommagee"
    apres_intervention = "apres_intervention"
    autre = "autre"


class TypeMouvement(StrEnum):
    entree = "entree"
    sortie = "sortie"
    ajustement = "ajustement"


class SourceMouvement(StrEnum):
    manuel = "manuel"
    capteur = "capteur"


class Disponibilite(StrEnum):
    dispo = "dispo"
    rupture = "rupture"


class StatutBonCommande(StrEnum):
    brouillon = "brouillon"
    envoye = "envoye"
    recu = "recu"


class StatutDevis(StrEnum):
    emis = "emis"
    accepte = "accepte"
    refuse = "refuse"


class TypeLigne(StrEnum):
    piece = "piece"
    main_oeuvre = "main_oeuvre"
    forfait = "forfait"


class ModeReglement(StrEnum):
    carte = "carte"
    especes = "especes"
    virement = "virement"
    trois_fois = "trois_fois"


class OrigineAnomalie(StrEnum):
    capteur = "capteur"
    securite = "securite"


class StatutAnomalie(StrEnum):
    ouverte = "ouverte"
    corrigee = "corrigee"
    faux_positif = "faux_positif"


class Canal(StrEnum):
    sms = "sms"
    email = "email"


class StatutOutbox(StrEnum):
    en_attente = "en_attente"
    envoye_simule = "envoye_simule"
