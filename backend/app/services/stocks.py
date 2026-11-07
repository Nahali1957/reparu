"""Stocks, fournisseurs et achats (F-06, F-08, écrans 5.8 et 5.9).

Règle IoT (5.10) : une lecture capteur ne modifie jamais le stock. Toute
correction passe par `ajuster`, qui crée un mouvement nominatif et journalisé.
"""

from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.clock import maintenant
from app.models.enums import Canal, Disponibilite, SourceMouvement, StatutAnomalie, StatutBonCommande, TypeMouvement
from app.models.tables import (
    Anomalie, BonCommande, Compatibilite, Fournisseur, LigneBonCommande, ModeleAppareil, MouvementStock, OffreFournisseur,
    Piece, Reparation, User,
)
from app.schemas import stocks as s
from app.services.outbox import envoyer
from app.services.regles import niveau_stock, prochain_numero, refus_metier, statut_stock

TYPE_PIECE_PAR_PANNE = {"ecran": "Écran", "batterie": "Batterie", "connecteur": "Connecteur de charge",
                        "camera": "Module caméra", "haut_parleur": "Haut-parleur", "pmic": "Carte mère"}
# Pondération de la recommandation d'achat (D-B8) : prix 50 %, délai 25 %, fiabilité 25 %.
POIDS_PRIX, POIDS_DELAI, POIDS_FIABILITE = 0.5, 0.25, 0.25
EN_COURS = (StatutBonCommande.brouillon, StatutBonCommande.envoye)


def libelle_fiabilite(f: float) -> str:
    return "Excellente" if f >= 0.9 else "Bonne" if f >= 0.8 else "Moyenne"


def get_piece(db: Session, piece_id: int) -> Piece:
    piece = db.get(Piece, piece_id)
    if piece is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pièce introuvable.")
    return piece


def pieces_compatibles(db: Session, modele_id: int, panne_code: str) -> list[Piece]:
    typ = TYPE_PIECE_PAR_PANNE.get(panne_code)
    if typ is None:
        return []
    return list(db.scalars(select(Piece).join(Compatibilite).where(Compatibilite.modele_id == modele_id, Piece.categorie == typ)))


# ---------------------------------------------------------------- inventaire


def mouvement_out(m: MouvementStock, reparations: dict[int, str] | None = None) -> s.MouvementOut:
    return s.MouvementOut(id=m.id, piece_id=m.piece_id, piece=m.piece.designation, type=m.type, qte=m.qte, source=m.source,
                          motif=m.motif, par=m.par.nom, le=m.le,
                          reparation=(reparations or {}).get(m.reparation_id) if m.reparation_id else None)


def inventaire(db: Session, statut: str | None = None, q: str | None = None) -> s.InventaireOut:
    pieces = db.scalars(select(Piece).order_by(Piece.categorie, Piece.designation)).all()
    compat: dict[int, list[str]] = {}
    for pid, modele in db.execute(select(Compatibilite.piece_id, ModeleAppareil.modele).join(ModeleAppareil)):
        compat.setdefault(pid, []).append(modele)
    derniers_ids = db.execute(select(MouvementStock.piece_id, func.max(MouvementStock.id)).group_by(MouvementStock.piece_id)).all()
    derniers = {m.piece_id: m for m in db.scalars(select(MouvementStock).where(MouvementStock.id.in_([i for _, i in derniers_ids])))}
    en_commande = set(db.scalars(select(LigneBonCommande.piece_id).join(BonCommande).where(BonCommande.statut.in_(EN_COURS))))
    lignes, compteurs = [], {"Toutes": 0, "En stock": 0, "Seuil bas": 0, "Rupture": 0}
    for p in pieces:
        st = statut_stock(p.stock, p.seuil)
        compteurs["Toutes"] += 1
        compteurs[st] += 1
        if statut and statut != st:
            continue
        if q and q.lower() not in f"{p.designation} {p.reference}".lower():
            continue
        lignes.append(s.PieceOut(id=p.id, designation=p.designation, reference=p.reference, categorie=p.categorie,
                                 compatibilite=compat.get(p.id, []), stock=p.stock, seuil=p.seuil, statut=st,
                                 niveau=niveau_stock(p.stock, p.seuil), prix_achat=p.prix_achat,
                                 dernier_mouvement=mouvement_out(derniers[p.id]) if p.id in derniers else None,
                                 commande_en_cours=p.id in en_commande))
    return s.InventaireOut(compteurs=compteurs, pieces=lignes)


def mouvements(db: Session, limit: int, piece_id: int | None = None) -> list[s.MouvementOut]:
    q = select(MouvementStock).order_by(MouvementStock.le.desc(), MouvementStock.id.desc()).limit(limit)
    if piece_id:
        q = q.where(MouvementStock.piece_id == piece_id)
    mvts = db.scalars(q).all()
    reps = dict(db.execute(select(Reparation.id, Reparation.numero).where(
        Reparation.id.in_([m.reparation_id for m in mvts if m.reparation_id]))).all())
    return [mouvement_out(m, reps) for m in mvts]


def ajuster(db: Session, piece_id: int, data: s.AjustementIn, auteur: User, ip: str | None) -> Piece:
    piece = get_piece(db, piece_id)
    if data.qte == 0:
        raise refus_metier("Quantité nulle : aucun mouvement à enregistrer.")
    if piece.stock + data.qte < 0:
        raise refus_metier(f"Le stock ne peut pas devenir négatif ({piece.stock} en stock).")
    source = SourceMouvement.manuel
    anomalie = None
    if data.anomalie_id is not None:
        anomalie = db.get(Anomalie, data.anomalie_id)
        if anomalie is None or anomalie.statut != StatutAnomalie.ouverte:
            raise refus_metier("Anomalie introuvable ou déjà traitée.")
        source = SourceMouvement.capteur
    now = maintenant()
    piece.stock += data.qte
    db.add(MouvementStock(piece_id=piece.id, type=TypeMouvement.ajustement, qte=data.qte, source=source, motif=data.motif,
                          anomalie_id=data.anomalie_id, par_user_id=auteur.id, le=now))
    if anomalie:
        anomalie.statut, anomalie.traitee_par, anomalie.traitee_le = StatutAnomalie.corrigee, auteur.id, now
    audit(db, "stock_correction", user_id=auteur.id, email=auteur.email, ressource="pieces", ressource_id=piece.id,
          details={"qte": data.qte, "motif": data.motif, "anomalie_id": data.anomalie_id}, ip=ip)
    return piece


# ---------------------------------------------------------------- fournisseurs et offres


def fournisseurs(db: Session) -> list[s.FournisseurOut]:
    refs = dict(db.execute(select(OffreFournisseur.fournisseur_id, func.count()).group_by(OffreFournisseur.fournisseur_id)).all())
    return [s.FournisseurOut(id=f.id, nom=f.nom, contact=f.contact, ville=f.ville, delai_jours=f.delai_jours,
                             fiabilite=f.fiabilite, fiabilite_libelle=libelle_fiabilite(f.fiabilite), references=refs.get(f.id, 0))
            for f in db.scalars(select(Fournisseur).order_by(Fournisseur.nom))]


def creer_fournisseur(db: Session, data: s.FournisseurIn) -> Fournisseur:
    if db.scalar(select(Fournisseur).where(func.lower(Fournisseur.nom) == data.nom.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ce fournisseur existe déjà.")
    f = Fournisseur(**data.model_dump())
    db.add(f)
    db.commit()
    return f


def enregistrer_offre(db: Session, data: s.OffreIn) -> OffreFournisseur:
    get_piece(db, data.piece_id)
    if db.get(Fournisseur, data.fournisseur_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fournisseur introuvable.")
    offre = db.scalar(select(OffreFournisseur).where(OffreFournisseur.fournisseur_id == data.fournisseur_id,
                                                     OffreFournisseur.piece_id == data.piece_id))
    if offre is None:
        offre = OffreFournisseur(fournisseur_id=data.fournisseur_id, piece_id=data.piece_id)
        db.add(offre)
    for k, v in data.model_dump(exclude={"fournisseur_id", "piece_id"}).items():
        setattr(offre, k, v)
    db.commit()
    return offre


def scorer(offres: list[OffreFournisseur]) -> dict[int, float]:
    """Score de 0 à 1 par offre disponible : prix bas, délai court, fournisseur fiable. Les ruptures sont exclues.

    Prix et délai sont notés en ratio du meilleur (prix min / prix, (délai min + 1) / (délai + 1)) : un écart de
    quelques euros pèse peu, contrairement à une normalisation min-max qui le rendrait décisif.
    """
    dispo = [o for o in offres if o.disponibilite == Disponibilite.dispo]
    if not dispo:
        return {}
    prix_min = min(float(o.prix_ht) for o in dispo)
    delai_min = min(o.delai_jours for o in dispo)
    return {o.id: round(POIDS_PRIX * prix_min / float(o.prix_ht) + POIDS_DELAI * (delai_min + 1) / (o.delai_jours + 1)
                        + POIDS_FIABILITE * o.fournisseur.fiabilite, 3) for o in dispo}


def comparer(db: Session, piece_id: int) -> s.ComparaisonOut:
    piece = get_piece(db, piece_id)
    offres = db.scalars(select(OffreFournisseur).where(OffreFournisseur.piece_id == piece.id)).all()
    refs = dict(db.execute(select(OffreFournisseur.fournisseur_id, func.count()).group_by(OffreFournisseur.fournisseur_id)).all())
    scores = scorer(offres)
    dispo = [o for o in offres if o.id in scores]
    best = max(dispo, key=lambda o: scores[o.id]) if dispo else None
    rapide = min(dispo, key=lambda o: (o.delai_jours, o.prix_ht)) if dispo else None
    cher = min(dispo, key=lambda o: o.prix_ht) if dispo else None
    out = [s.OffreOut(fournisseur_id=o.fournisseur_id, fournisseur=o.fournisseur.nom, ville=o.fournisseur.ville, prix_ht=o.prix_ht,
                      delai_jours=o.delai_jours, disponibilite=o.disponibilite, minimum_commande=o.minimum_commande,
                      references=refs.get(o.fournisseur_id, 0), fiabilite=o.fournisseur.fiabilite,
                      fiabilite_libelle=libelle_fiabilite(o.fournisseur.fiabilite), score=scores.get(o.id),
                      recommande=o is best, plus_rapide=o is rapide, moins_cher=o is cher)
           for o in sorted(offres, key=lambda o: (o.id not in scores, -(scores.get(o.id) or 0)))]
    if best is None:
        texte = "Recommandation d'achat. Aucune offre référencée." if not offres else \
            "Recommandation d'achat. Toutes les offres sont en rupture chez les fournisseurs."
        return s.ComparaisonOut(piece_id=piece.id, piece=piece.designation, offres=out, recommandation=texte, economie_pct=None)
    plus_cher = max(float(o.prix_ht) for o in dispo)
    eco = round((plus_cher - float(best.prix_ht)) / plus_cher * 100, 1) if plus_cher else None
    texte = (f"Recommandation d'achat : {best.fournisseur.nom} — {best.prix_ht} € HT, livré en {best.delai_jours} j, "
             f"fiabilité {libelle_fiabilite(best.fournisseur.fiabilite).lower()} (score {scores[best.id]:.2f})."
             + (f" Économie de {eco} % par rapport à l'offre la plus chère." if eco else ""))
    return s.ComparaisonOut(piece_id=piece.id, piece=piece.designation, offres=out, recommandation=texte, economie_pct=eco)


def meilleure_offre(db: Session, piece_id: int) -> OffreFournisseur | None:
    offres = db.scalars(select(OffreFournisseur).where(OffreFournisseur.piece_id == piece_id)).all()
    scores = scorer(offres)
    return max((o for o in offres if o.id in scores), key=lambda o: scores[o.id], default=None)


# ---------------------------------------------------------------- bons de commande


def bon_out(bc: BonCommande) -> s.BonCommandeOut:
    lignes = [s.LigneBCOut(piece_id=li.piece_id, designation=li.piece.designation, qte=li.qte, prix_ht=li.prix_ht) for li in bc.lignes]
    return s.BonCommandeOut(id=bc.id, numero=bc.numero, fournisseur=bc.fournisseur.nom, statut=bc.statut, le=bc.le, lignes=lignes,
                            total_ht=sum((li.prix_ht * li.qte for li in bc.lignes), Decimal(0)))


def bons(db: Session, limit: int = 20) -> list[s.BonCommandeOut]:
    return [bon_out(bc) for bc in db.scalars(select(BonCommande).order_by(BonCommande.le.desc()).limit(limit))]


def _creer_bon(db: Session, fournisseur_id: int, lignes: list[tuple[int, int, Decimal]], auteur: User) -> BonCommande:
    now = maintenant()
    bc = BonCommande(numero=prochain_numero(db, BonCommande.numero, "BC", now.year), fournisseur_id=fournisseur_id,
                     statut=StatutBonCommande.brouillon, cree_par=auteur.id, le=now)
    bc.lignes = [LigneBonCommande(piece_id=p, qte=q, prix_ht=px) for p, q, px in lignes]
    db.add(bc)
    db.flush()
    return bc


def generer_bons(db: Session, auteur: User, quantites: dict[int, int] | None = None) -> list[s.BonCommandeOut]:
    """Bon de commande des pièces sous le seuil, regroupées par meilleur fournisseur.

    `quantites` (pièce -> quantité) permet d'utiliser la prévision du modèle 3 ; sinon on vise 3 × le seuil.
    """
    en_commande = set(db.scalars(select(LigneBonCommande.piece_id).join(BonCommande).where(BonCommande.statut.in_(EN_COURS))))
    par_fournisseur: dict[int, list] = {}
    for p in db.scalars(select(Piece).where(Piece.stock <= Piece.seuil)):
        if p.id in en_commande:
            continue
        offre = meilleure_offre(db, p.id)
        if offre is None:
            continue
        qte = (quantites or {}).get(p.id) or (p.seuil * 3 - p.stock)
        qte = max(qte, offre.minimum_commande, 1)
        par_fournisseur.setdefault(offre.fournisseur_id, []).append((p.id, qte, offre.prix_ht))
    crees = [_creer_bon(db, f, lignes, auteur) for f, lignes in par_fournisseur.items()]
    db.commit()
    return [bon_out(bc) for bc in crees]


def commander(db: Session, fournisseur_id: int, data: s.CommandeIn, auteur: User) -> s.BonCommandeOut:
    offre = db.scalar(select(OffreFournisseur).where(OffreFournisseur.fournisseur_id == fournisseur_id,
                                                     OffreFournisseur.piece_id == data.piece_id))
    if offre is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ce fournisseur ne propose pas cette pièce.")
    if offre.disponibilite == Disponibilite.rupture:
        raise refus_metier("Pièce en rupture chez ce fournisseur.")
    bc = _creer_bon(db, fournisseur_id, [(data.piece_id, max(data.qte, offre.minimum_commande), offre.prix_ht)], auteur)
    db.commit()
    return bon_out(bc)


def _get_bon(db: Session, bc_id: int) -> BonCommande:
    bc = db.get(BonCommande, bc_id)
    if bc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bon de commande introuvable.")
    return bc


def envoyer_bon(db: Session, bc_id: int) -> s.BonCommandeOut:
    bc = _get_bon(db, bc_id)
    if bc.statut != StatutBonCommande.brouillon:
        raise refus_metier("Ce bon de commande a déjà été envoyé.")
    out = bon_out(bc)
    corps = "\n".join(f"- {li.designation} × {li.qte} à {li.prix_ht} € HT" for li in out.lignes)
    envoyer(db, Canal.email, bc.fournisseur.contact or bc.fournisseur.nom, f"Repar U — bon de commande {bc.numero}\n{corps}",
            sujet=f"Bon de commande {bc.numero}")
    bc.statut = StatutBonCommande.envoye
    db.commit()
    return bon_out(bc)


def receptionner(db: Session, bc_id: int, auteur: User) -> s.BonCommandeOut:
    bc = _get_bon(db, bc_id)
    if bc.statut == StatutBonCommande.recu:
        raise refus_metier("Bon de commande déjà réceptionné.")
    now = maintenant()
    for li in bc.lignes:
        piece = db.get(Piece, li.piece_id)
        piece.stock += li.qte
        db.add(MouvementStock(piece_id=li.piece_id, type=TypeMouvement.entree, qte=li.qte, source=SourceMouvement.manuel,
                              motif=f"Réception fournisseur ({bc.numero})", bon_commande_id=bc.id, par_user_id=auteur.id, le=now))
    bc.statut = StatutBonCommande.recu
    db.commit()
    return bon_out(bc)
