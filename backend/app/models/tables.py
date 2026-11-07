"""Modèle de données Repar U. Voir docs/MCD.md pour le diagramme."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, CHAR, Date, DateTime, Float, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import MONEY, Base, TimestampMixin, fk
from app.models.enums import (
    Canal, Disponibilite, ModeReglement, OrigineAnomalie, Priorite, Role, SourceMouvement, Statut,
    StatutAnomalie, StatutBonCommande, StatutDevis, StatutOutbox, TypeLigne, TypeMouvement, TypePhoto, db_enum,
)

# ---------------------------------------------------------------- Sécurité


class User(TimestampMixin, Base):
    __tablename__ = "users"
    nom: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(190), unique=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[Role] = mapped_column(db_enum(Role, "role"))
    specialite: Mapped[str | None] = mapped_column(String(120))
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    echecs_connexion: Mapped[int] = mapped_column(Integer, default=0)
    verrouille_jusqu: Mapped[datetime | None] = mapped_column(DateTime)
    derniere_connexion: Mapped[datetime | None] = mapped_column(DateTime, index=True)


class Session(TimestampMixin, Base):
    __tablename__ = "sessions"
    user_id: Mapped[int] = fk("users.id", ondelete="CASCADE")
    jti: Mapped[str] = mapped_column(String(64), unique=True)
    expire_le: Mapped[datetime] = mapped_column(DateTime, index=True)
    se_souvenir: Mapped[bool] = mapped_column(Boolean, default=False)
    revoquee: Mapped[bool] = mapped_column(Boolean, default=False)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(255))


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_log"
    user_id: Mapped[int | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    email_tente: Mapped[str | None] = mapped_column(String(190))
    action: Mapped[str] = mapped_column(String(40), index=True)
    ressource: Mapped[str | None] = mapped_column(String(60))
    ressource_id: Mapped[str | None] = mapped_column(String(60))
    details: Mapped[dict | None] = mapped_column(JSON)
    ip: Mapped[str | None] = mapped_column(String(64))
    horodatage: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


# ---------------------------------------------------------------- Clients et appareils (F-01)


class Client(TimestampMixin, Base):
    __tablename__ = "clients"
    nom: Mapped[str] = mapped_column(String(120), index=True)
    telephone: Mapped[str] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(190))
    ville: Mapped[str | None] = mapped_column(String(80))
    derniere_intervention_le: Mapped[datetime | None] = mapped_column(DateTime, index=True)

    appareils: Mapped[list["Appareil"]] = relationship(back_populates="client")


class ModeleAppareil(TimestampMixin, Base):
    __tablename__ = "modeles_appareil"
    __table_args__ = (UniqueConstraint("marque", "modele"),)
    marque: Mapped[str] = mapped_column(String(60))
    modele: Mapped[str] = mapped_column(String(80))


class Appareil(TimestampMixin, Base):
    __tablename__ = "appareils"
    client_id: Mapped[int] = fk("clients.id")
    modele_id: Mapped[int] = fk("modeles_appareil.id")
    imei: Mapped[str] = mapped_column(CHAR(15), unique=True)
    couleur: Mapped[str | None] = mapped_column(String(40))
    depose_le: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)

    client: Mapped[Client] = relationship(back_populates="appareils")
    modele: Mapped[ModeleAppareil] = relationship()


# ---------------------------------------------------------------- Réparations (F-02, F-03)


class Reparation(TimestampMixin, Base):
    __tablename__ = "reparations"
    numero: Mapped[str] = mapped_column(String(12), unique=True)
    appareil_id: Mapped[int] = fk("appareils.id")
    client_id: Mapped[int] = fk("clients.id")
    tech_id: Mapped[int | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    statut: Mapped[Statut] = mapped_column(db_enum(Statut, "statut"), default=Statut.recu, index=True)
    priorite: Mapped[Priorite] = mapped_column(db_enum(Priorite, "priorite"), default=Priorite.normale)
    recu_le: Mapped[datetime] = mapped_column(DateTime, index=True)
    planifie_le: Mapped[date | None] = mapped_column(Date, index=True)
    cloture_le: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    retour_de_id: Mapped[int | None] = fk("reparations.id", nullable=True, ondelete="SET NULL")
    symptomes_texte: Mapped[str] = mapped_column(Text)
    diagnostic_final: Mapped[str | None] = mapped_column(Text)
    duree_estimee_min: Mapped[int | None] = mapped_column(Integer)
    cout_pieces_retenu: Mapped[Decimal | None] = mapped_column(MONEY)
    prix_retenu_ht: Mapped[Decimal | None] = mapped_column(MONEY)
    valide_client_le: Mapped[datetime | None] = mapped_column(DateTime)

    appareil: Mapped[Appareil] = relationship()
    client: Mapped[Client] = relationship()
    technicien: Mapped[User | None] = relationship()
    checklist: Mapped[list["ChecklistEtape"]] = relationship(order_by="ChecklistEtape.ordre", cascade="all, delete-orphan")
    historique: Mapped[list["HistoriqueStatut"]] = relationship(order_by="HistoriqueStatut.le", cascade="all, delete-orphan")
    photos: Mapped[list["Photo"]] = relationship(cascade="all, delete-orphan")
    pieces: Mapped[list["ReparationPiece"]] = relationship(cascade="all, delete-orphan")


class Symptome(TimestampMixin, Base):
    __tablename__ = "symptomes"
    code: Mapped[str] = mapped_column(String(40), unique=True)
    libelle: Mapped[str] = mapped_column(String(120))
    mots_cles: Mapped[str] = mapped_column(String(500))


class ReparationSymptome(Base):
    __tablename__ = "reparation_symptomes"
    reparation_id: Mapped[int] = fk("reparations.id", ondelete="CASCADE", primary_key=True)
    symptome_id: Mapped[int] = fk("symptomes.id", primary_key=True)


class Panne(TimestampMixin, Base):
    __tablename__ = "pannes"
    code: Mapped[str] = mapped_column(String(40), unique=True)
    libelle: Mapped[str] = mapped_column(String(120))
    categorie: Mapped[str] = mapped_column(String(60), index=True)


class ReparationPanne(TimestampMixin, Base):
    __tablename__ = "reparation_pannes"
    __table_args__ = (UniqueConstraint("reparation_id", "panne_id"),)
    reparation_id: Mapped[int] = fk("reparations.id", ondelete="CASCADE")
    panne_id: Mapped[int] = fk("pannes.id")
    finale: Mapped[bool] = mapped_column(Boolean, default=True)

    panne: Mapped[Panne] = relationship()


class DiagnosticIA(TimestampMixin, Base):
    __tablename__ = "diagnostics_ia"
    reparation_id: Mapped[int] = fk("reparations.id", ondelete="CASCADE")
    modele_version: Mapped[str] = mapped_column(String(20))
    resultat: Mapped[dict] = mapped_column(JSON)
    confiance: Mapped[float] = mapped_column(Float)
    cout_suggere: Mapped[Decimal | None] = mapped_column(MONEY)
    prix_suggere: Mapped[Decimal | None] = mapped_column(MONEY)
    marge_suggeree: Mapped[Decimal | None] = mapped_column(MONEY)
    duree_suggeree_min: Mapped[int | None] = mapped_column(Integer)
    cree_le: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class HistoriqueStatut(TimestampMixin, Base):
    __tablename__ = "historique_statuts"
    reparation_id: Mapped[int] = fk("reparations.id", ondelete="CASCADE")
    de_statut: Mapped[Statut | None] = mapped_column(db_enum(Statut, "statut"))
    vers_statut: Mapped[Statut] = mapped_column(db_enum(Statut, "statut"))
    par_user_id: Mapped[int | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    le: Mapped[datetime] = mapped_column(DateTime, index=True)

    par: Mapped[User | None] = relationship()


class ChecklistEtape(TimestampMixin, Base):
    __tablename__ = "checklist_etapes"
    __table_args__ = (UniqueConstraint("reparation_id", "ordre"),)
    reparation_id: Mapped[int] = fk("reparations.id", ondelete="CASCADE")
    ordre: Mapped[int] = mapped_column(Integer)
    libelle: Mapped[str] = mapped_column(String(120))
    duree_min: Mapped[int] = mapped_column(Integer)
    faite: Mapped[bool] = mapped_column(Boolean, default=False)
    faite_par: Mapped[int | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    faite_le: Mapped[datetime | None] = mapped_column(DateTime)


class Photo(TimestampMixin, Base):
    __tablename__ = "photos"
    reparation_id: Mapped[int] = fk("reparations.id", ondelete="CASCADE")
    type: Mapped[TypePhoto] = mapped_column(db_enum(TypePhoto, "type_photo"))
    chemin: Mapped[str] = mapped_column(String(255))
    sha256: Mapped[str] = mapped_column(CHAR(64))
    prise_le: Mapped[datetime] = mapped_column(DateTime, index=True)
    par_user_id: Mapped[int | None] = fk("users.id", nullable=True, ondelete="SET NULL")


class TempsPasse(TimestampMixin, Base):
    __tablename__ = "temps_passe"
    reparation_id: Mapped[int] = fk("reparations.id", ondelete="CASCADE")
    user_id: Mapped[int] = fk("users.id")
    debut: Mapped[datetime] = mapped_column(DateTime, index=True)
    fin: Mapped[datetime | None] = mapped_column(DateTime)


class ReparationPiece(TimestampMixin, Base):
    __tablename__ = "reparation_pieces"
    reparation_id: Mapped[int] = fk("reparations.id", ondelete="CASCADE")
    piece_id: Mapped[int] = fk("pieces.id")
    qte: Mapped[int] = mapped_column(Integer, default=1)
    prix_achat_unitaire: Mapped[Decimal] = mapped_column(MONEY)

    piece: Mapped["Piece"] = relationship()


# ---------------------------------------------------------------- Stocks et fournisseurs (F-06, F-07, F-08)


class Piece(TimestampMixin, Base):
    __tablename__ = "pieces"
    designation: Mapped[str] = mapped_column(String(160), index=True)
    reference: Mapped[str] = mapped_column(String(40), unique=True)
    categorie: Mapped[str] = mapped_column(String(60), index=True)
    stock: Mapped[int] = mapped_column(Integer, default=0)
    seuil: Mapped[int] = mapped_column(Integer, default=0)
    prix_achat: Mapped[Decimal] = mapped_column(MONEY)

    compatibilites: Mapped[list["Compatibilite"]] = relationship(cascade="all, delete-orphan")


class Compatibilite(Base):
    __tablename__ = "compatibilites"
    piece_id: Mapped[int] = fk("pieces.id", ondelete="CASCADE", primary_key=True)
    modele_id: Mapped[int] = fk("modeles_appareil.id", ondelete="CASCADE", primary_key=True)

    modele: Mapped[ModeleAppareil] = relationship()


class MouvementStock(TimestampMixin, Base):
    __tablename__ = "mouvements_stock"
    piece_id: Mapped[int] = fk("pieces.id")
    type: Mapped[TypeMouvement] = mapped_column(db_enum(TypeMouvement, "type_mouvement"))
    qte: Mapped[int] = mapped_column(Integer)
    source: Mapped[SourceMouvement] = mapped_column(db_enum(SourceMouvement, "source_mouvement"))
    motif: Mapped[str] = mapped_column(String(255))
    reparation_id: Mapped[int | None] = fk("reparations.id", nullable=True, ondelete="SET NULL")
    bon_commande_id: Mapped[int | None] = fk("bons_commande.id", nullable=True, ondelete="SET NULL")
    anomalie_id: Mapped[int | None] = fk("anomalies.id", nullable=True, ondelete="SET NULL")
    par_user_id: Mapped[int] = fk("users.id")
    le: Mapped[datetime] = mapped_column(DateTime, index=True)

    piece: Mapped[Piece] = relationship()
    par: Mapped[User] = relationship()


class Fournisseur(TimestampMixin, Base):
    __tablename__ = "fournisseurs"
    nom: Mapped[str] = mapped_column(String(120), unique=True)
    contact: Mapped[str | None] = mapped_column(String(190))
    ville: Mapped[str | None] = mapped_column(String(80))
    delai_jours: Mapped[int] = mapped_column(Integer)
    fiabilite: Mapped[float] = mapped_column(Float)


class OffreFournisseur(TimestampMixin, Base):
    __tablename__ = "offres_fournisseur"
    __table_args__ = (UniqueConstraint("fournisseur_id", "piece_id"),)
    fournisseur_id: Mapped[int] = fk("fournisseurs.id", ondelete="CASCADE")
    piece_id: Mapped[int] = fk("pieces.id", ondelete="CASCADE")
    prix_ht: Mapped[Decimal] = mapped_column(MONEY)
    delai_jours: Mapped[int] = mapped_column(Integer)
    disponibilite: Mapped[Disponibilite] = mapped_column(db_enum(Disponibilite, "disponibilite"), default=Disponibilite.dispo)
    minimum_commande: Mapped[int] = mapped_column(Integer, default=1)

    fournisseur: Mapped[Fournisseur] = relationship()


class BonCommande(TimestampMixin, Base):
    __tablename__ = "bons_commande"
    numero: Mapped[str] = mapped_column(String(20), unique=True)
    fournisseur_id: Mapped[int] = fk("fournisseurs.id")
    statut: Mapped[StatutBonCommande] = mapped_column(db_enum(StatutBonCommande, "statut_bc"), default=StatutBonCommande.brouillon)
    cree_par: Mapped[int] = fk("users.id")
    le: Mapped[datetime] = mapped_column(DateTime, index=True)

    lignes: Mapped[list["LigneBonCommande"]] = relationship(cascade="all, delete-orphan")
    fournisseur: Mapped[Fournisseur] = relationship()


class LigneBonCommande(TimestampMixin, Base):
    __tablename__ = "lignes_bon_commande"
    bon_commande_id: Mapped[int] = fk("bons_commande.id", ondelete="CASCADE")
    piece_id: Mapped[int] = fk("pieces.id")
    qte: Mapped[int] = mapped_column(Integer)
    prix_ht: Mapped[Decimal] = mapped_column(MONEY)

    piece: Mapped[Piece] = relationship()


# ---------------------------------------------------------------- Devis et facturation (5.14)


class Devis(TimestampMixin, Base):
    __tablename__ = "devis"
    numero: Mapped[str] = mapped_column(String(20), unique=True)
    reparation_id: Mapped[int] = fk("reparations.id")
    statut: Mapped[StatutDevis] = mapped_column(db_enum(StatutDevis, "statut_devis"), default=StatutDevis.emis)
    emis_le: Mapped[datetime] = mapped_column(DateTime, index=True)
    envoye_le: Mapped[datetime | None] = mapped_column(DateTime)
    accepte_le: Mapped[datetime | None] = mapped_column(DateTime)
    total_ht: Mapped[Decimal] = mapped_column(MONEY)
    tva: Mapped[Decimal] = mapped_column(MONEY)
    total_ttc: Mapped[Decimal] = mapped_column(MONEY)

    lignes: Mapped[list["LigneDevis"]] = relationship(cascade="all, delete-orphan")


class LigneDevis(TimestampMixin, Base):
    __tablename__ = "lignes_devis"
    devis_id: Mapped[int] = fk("devis.id", ondelete="CASCADE")
    designation: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str | None] = mapped_column(String(255))
    qte: Mapped[Decimal] = mapped_column(MONEY)
    pu_ht: Mapped[Decimal] = mapped_column(MONEY)
    type: Mapped[TypeLigne] = mapped_column(db_enum(TypeLigne, "type_ligne"))


class Facture(TimestampMixin, Base):
    __tablename__ = "factures"
    numero: Mapped[str] = mapped_column(String(20), unique=True)
    devis_id: Mapped[int] = fk("devis.id")
    reparation_id: Mapped[int] = fk("reparations.id")
    emise_le: Mapped[datetime] = mapped_column(DateTime, index=True)
    total_ht: Mapped[Decimal] = mapped_column(MONEY)
    tva: Mapped[Decimal] = mapped_column(MONEY)
    total_ttc: Mapped[Decimal] = mapped_column(MONEY)
    acquittee: Mapped[bool] = mapped_column(Boolean, default=False)

    lignes: Mapped[list["LigneFacture"]] = relationship(cascade="all, delete-orphan")
    reglements: Mapped[list["Reglement"]] = relationship(cascade="all, delete-orphan")


class LigneFacture(TimestampMixin, Base):
    __tablename__ = "lignes_facture"
    facture_id: Mapped[int] = fk("factures.id", ondelete="CASCADE")
    designation: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str | None] = mapped_column(String(255))
    qte: Mapped[Decimal] = mapped_column(MONEY)
    pu_ht: Mapped[Decimal] = mapped_column(MONEY)
    type: Mapped[TypeLigne] = mapped_column(db_enum(TypeLigne, "type_ligne"))


class Reglement(TimestampMixin, Base):
    __tablename__ = "reglements"
    facture_id: Mapped[int] = fk("factures.id", ondelete="CASCADE")
    mode: Mapped[ModeReglement] = mapped_column(db_enum(ModeReglement, "mode_reglement"))
    montant: Mapped[Decimal] = mapped_column(MONEY)
    encaisse_le: Mapped[datetime] = mapped_column(DateTime, index=True)
    par_user_id: Mapped[int] = fk("users.id")


# ---------------------------------------------------------------- IoT (M6)


class Capteur(TimestampMixin, Base):
    __tablename__ = "capteurs"
    code: Mapped[str] = mapped_column(String(40), unique=True)
    piece_id: Mapped[int] = fk("pieces.id")
    emplacement: Mapped[str] = mapped_column(String(80))
    device_id: Mapped[str] = mapped_column(String(60), unique=True)
    mqtt_username: Mapped[str] = mapped_column(String(60), unique=True)
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    derniere_lecture_le: Mapped[datetime | None] = mapped_column(DateTime, index=True)

    piece: Mapped[Piece] = relationship()


class LectureCapteur(TimestampMixin, Base):
    __tablename__ = "lectures_capteurs"
    capteur_id: Mapped[int] = fk("capteurs.id", ondelete="CASCADE")
    niveau: Mapped[int] = mapped_column(Integer)
    recu_le: Mapped[datetime] = mapped_column(DateTime, index=True)
    brut: Mapped[dict | None] = mapped_column(JSON)


class Anomalie(TimestampMixin, Base):
    __tablename__ = "anomalies"
    origine: Mapped[OrigineAnomalie] = mapped_column(db_enum(OrigineAnomalie, "origine_anomalie"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    capteur_id: Mapped[int | None] = fk("capteurs.id", nullable=True, ondelete="SET NULL")
    user_id: Mapped[int | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    score: Mapped[float | None] = mapped_column(Float)
    details: Mapped[dict | None] = mapped_column(JSON)
    statut: Mapped[StatutAnomalie] = mapped_column(db_enum(StatutAnomalie, "statut_anomalie"), default=StatutAnomalie.ouverte, index=True)
    traitee_par: Mapped[int | None] = fk("users.id", nullable=True, ondelete="SET NULL")
    traitee_le: Mapped[datetime | None] = mapped_column(DateTime)
    detectee_le: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


# ---------------------------------------------------------------- IA, paramètres, services simulés


class ModeleIA(TimestampMixin, Base):
    __tablename__ = "modeles_ia"
    __table_args__ = (UniqueConstraint("nom", "version"),)
    nom: Mapped[str] = mapped_column(String(40), index=True)
    version: Mapped[str] = mapped_column(String(20))
    algorithme_retenu: Mapped[str] = mapped_column(String(80))
    metriques: Mapped[dict] = mapped_column(JSON)
    chemin_joblib: Mapped[str] = mapped_column(String(255))
    nb_lignes_entrainement: Mapped[int] = mapped_column(Integer)
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    entraine_le: Mapped[datetime] = mapped_column(DateTime, index=True)


class Parametre(TimestampMixin, Base):
    __tablename__ = "parametres"
    cle: Mapped[str] = mapped_column(String(60), unique=True)
    valeur: Mapped[str] = mapped_column(String(255))


class Outbox(TimestampMixin, Base):
    __tablename__ = "outbox"
    canal: Mapped[Canal] = mapped_column(db_enum(Canal, "canal"))
    destinataire: Mapped[str] = mapped_column(String(190))
    sujet: Mapped[str | None] = mapped_column(String(190))
    corps: Mapped[str] = mapped_column(Text)
    piece_jointe: Mapped[str | None] = mapped_column(String(255))
    programme_pour: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    statut: Mapped[StatutOutbox] = mapped_column(db_enum(StatutOutbox, "statut_outbox"), default=StatutOutbox.en_attente)
    cree_le: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
