"""Dossiers de réparation et Kanban (F-02, F-03, écrans 5.3 et 5.4)."""

import hashlib
import uuid
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import audit
from app.core.clock import maintenant
from app.core.config import get_settings
from app.models.enums import STATUTS_ORDRE, Canal, Priorite, Role, SourceMouvement, Statut, StatutDevis, TypeMouvement, TypePhoto
from app.models.tables import (
    Appareil, ChecklistEtape, Devis, DiagnosticIA, Facture, HistoriqueStatut, MouvementStock, Panne, Photo, Piece,
    Reparation, ReparationPanne, ReparationPiece, ReparationSymptome, Symptome, TempsPasse, User,
)
from app.schemas import reparations as s
from app.services.outbox import envoyer
from app.services.regles import heures, montants, parametre, prochain_numero, refus_metier

CHECKLIST = [("Réception et constat photo", 5), ("Diagnostic et devis validé client", 15),
             ("Démontage et remplacement pièce", 30), ("Remontage et nettoyage", 10), ("Test de sortie complet", 10)]
ETAPE_TEST_SORTIE = 5
LIBELLES_STATUT = {Statut.recu: "Reçu", Statut.en_diagnostic: "En diagnostic", Statut.en_reparation: "En réparation",
                   Statut.pret: "Prêt", Statut.livre: "Livré"}
PHOTOS_ACCUEIL = {TypePhoto.etat_general, TypePhoto.zone_endommagee}
TYPES_IMAGE = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
TAILLE_MAX_PHOTO = 8 * 1024 * 1024
LIVRES_VISIBLES_JOURS = 7  # colonne « Livré » du Kanban : clôtures récentes seulement


def initiales(nom: str) -> str:
    return "".join(p[0] for p in nom.split()[:2]).upper()


def personne(u: User | None) -> s.Personne | None:
    return s.Personne(id=u.id, nom=u.nom, initiales=initiales(u.nom)) if u else None


def get(db: Session, numero: str) -> Reparation:
    rep = db.scalar(select(Reparation).where(Reparation.numero == numero.upper()))
    if rep is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Dossier {numero} introuvable.")
    return rep


def sla_depasse(db: Session, rep: Reparation) -> bool:
    """Engagement de 48 h depuis la réception ; exclut les dossiers prêts/livrés et ceux en attente de pièce (5.2)."""
    if rep.statut in (Statut.pret, Statut.livre):
        return False
    return maintenant() - rep.recu_le > timedelta(hours=parametre(db, "sla_h")) and not attente_piece(db, rep)


def attente_piece(db: Session, rep: Reparation) -> bool:
    """Le diagnostic désigne une pièce compatible actuellement en rupture."""
    if rep.statut not in (Statut.en_diagnostic, Statut.en_reparation) or rep.pieces:
        return False
    panne = db.scalar(select(Panne).join(ReparationPanne).where(ReparationPanne.reparation_id == rep.id))
    if panne is None:
        return False
    from app.services.stocks import pieces_compatibles  # import local : évite un cycle
    compatibles = pieces_compatibles(db, rep.appareil.modele_id, panne.code)
    return bool(compatibles) and all(p.stock <= 0 for p in compatibles)


# ---------------------------------------------------------------- Kanban


def carte(db: Session, r: Reparation) -> s.CarteOut:
    return s.CarteOut(
        numero=r.numero, statut=r.statut, priorite=r.priorite, client_nom=r.client.nom,
        appareil=f"{r.appareil.modele.marque} {r.appareil.modele.modele}", technicien=personne(r.technicien),
        recu_le=r.recu_le, planifie_le=r.planifie_le, symptomes=r.symptomes_texte[:140],
        duree_estimee_min=r.duree_estimee_min, sla_depasse=sla_depasse(db, r), attente_piece=attente_piece(db, r),
        retour=r.retour_de_id is not None,
    )


def kanban(db: Session, user: User, filtre: str | None) -> list[s.CarteOut]:
    recents = maintenant() - timedelta(days=LIVRES_VISIBLES_JOURS)
    q = (select(Reparation).where(or_(Reparation.statut != Statut.livre, Reparation.cloture_le >= recents))
         .options(selectinload(Reparation.pieces)).order_by(Reparation.recu_le))
    if filtre == "mes":
        q = q.where(Reparation.tech_id == user.id)
    elif filtre == "haute":
        q = q.where(Reparation.priorite == Priorite.haute)
    return [carte(db, r) for r in db.scalars(q)]


# ---------------------------------------------------------------- création et lecture


def categoriser_symptomes(db: Session, texte: str) -> list[Symptome]:
    t = texte.lower()
    return [sy for sy in db.scalars(select(Symptome)) if any(k.strip() and k.strip() in t for k in sy.mots_cles.split(","))]


def _poser_symptomes(db: Session, rep: Reparation) -> None:
    db.query(ReparationSymptome).filter(ReparationSymptome.reparation_id == rep.id).delete()
    for sy in categoriser_symptomes(db, rep.symptomes_texte):
        db.add(ReparationSymptome(reparation_id=rep.id, symptome_id=sy.id))


def creer(db: Session, data: s.ReparationIn, auteur: User) -> Reparation:
    appareil = db.get(Appareil, data.appareil_id)
    if appareil is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Appareil introuvable : rattachez d'abord l'appareil au client.")
    if data.tech_id is not None:
        _technicien_valide(db, data.tech_id)
    now = maintenant()
    rep = Reparation(numero=prochain_numero(db, Reparation.numero, "REP"), appareil_id=appareil.id,
                     client_id=appareil.client_id, tech_id=data.tech_id, statut=Statut.recu, priorite=data.priorite,
                     recu_le=now, symptomes_texte=data.symptomes_texte.strip())
    db.add(rep)
    db.flush()
    for ordre, (libelle, duree) in enumerate(CHECKLIST, start=1):
        db.add(ChecklistEtape(reparation_id=rep.id, ordre=ordre, libelle=libelle, duree_min=duree))
    db.add(HistoriqueStatut(reparation_id=rep.id, de_statut=None, vers_statut=Statut.recu, par_user_id=auteur.id, le=now))
    _poser_symptomes(db, rep)
    appareil.client.derniere_intervention_le = now
    db.commit()
    db.refresh(rep)
    return rep


def dossier(db: Session, rep: Reparation) -> s.DossierOut:
    db.refresh(rep)
    taux = parametre(db, "taux_horaire")
    m = None
    if rep.prix_retenu_ht is not None:
        mt = montants(rep.prix_retenu_ht, rep.cout_pieces_retenu, rep.duree_estimee_min or 0, taux, parametre(db, "tva"))
        m = s.MontantsOut(cout_pieces=mt.cout_pieces, main_oeuvre=mt.main_oeuvre, heures=heures(rep.duree_estimee_min or 0),
                          taux_horaire=Decimal(str(taux)), prix_ht=mt.prix_ht, tva=mt.tva, prix_ttc=mt.prix_ttc,
                          marge_brute=mt.marge_brute, marge_nette=mt.marge_nette)
    ia = db.scalar(select(DiagnosticIA).where(DiagnosticIA.reparation_id == rep.id).order_by(DiagnosticIA.id.desc()))
    suggestion = s.SuggestionOut(modele_version=ia.modele_version, confiance=ia.confiance, pannes=ia.resultat.get("pannes", []),
                                 cout=ia.cout_suggere, prix=ia.prix_suggere, marge=ia.marge_suggeree,
                                 duree_min=ia.duree_suggeree_min, cree_le=ia.cree_le) if ia else None
    temps = db.scalars(select(TempsPasse).where(TempsPasse.reparation_id == rep.id)).all()
    now = maintenant()
    total_min = int(sum(((t.fin or now) - t.debut).total_seconds() for t in temps) // 60)
    en_cours = next((t.debut for t in temps if t.fin is None), None)
    devis = db.scalar(select(Devis).where(Devis.reparation_id == rep.id).order_by(Devis.id.desc()))
    facture = db.scalar(select(Facture).where(Facture.reparation_id == rep.id))
    panne = db.scalar(select(Panne).join(ReparationPanne).where(ReparationPanne.reparation_id == rep.id))
    symptomes = db.scalars(select(Symptome.libelle).join(ReparationSymptome).where(ReparationSymptome.reparation_id == rep.id)).all()
    auteurs = {u.id: u.nom for u in db.scalars(select(User))}
    a = rep.appareil
    return s.DossierOut(
        numero=rep.numero, statut=rep.statut, priorite=rep.priorite,
        client=s.ClientMini(id=rep.client.id, nom=rep.client.nom, telephone=rep.client.telephone, email=rep.client.email),
        appareil=s.AppareilMini(id=a.id, marque=a.modele.marque, modele=a.modele.modele, imei=a.imei, couleur=a.couleur),
        technicien=personne(rep.technicien), recu_le=rep.recu_le, planifie_le=rep.planifie_le, cloture_le=rep.cloture_le,
        retour_de=db.get(Reparation, rep.retour_de_id).numero if rep.retour_de_id else None,
        symptomes_texte=rep.symptomes_texte, symptomes=list(symptomes), diagnostic_final=rep.diagnostic_final,
        panne_code=panne.code if panne else None, duree_estimee_min=rep.duree_estimee_min,
        cout_pieces_retenu=rep.cout_pieces_retenu, prix_retenu_ht=rep.prix_retenu_ht, valide_client_le=rep.valide_client_le,
        montants=m, suggestion=suggestion,
        photos=[s.PhotoOut(id=p.id, type=p.type, prise_le=p.prise_le, url=f"/api/photos/{p.id}", par=auteurs.get(p.par_user_id))
                for p in sorted(rep.photos, key=lambda p: p.prise_le)],
        temps_passe_min=total_min, chrono_depuis=en_cours,
        checklist=[s.EtapeOut(ordre=e.ordre, libelle=e.libelle, duree_min=e.duree_min, faite=e.faite, faite_le=e.faite_le)
                   for e in rep.checklist],
        pieces=[s.PieceEngageeOut(id=rp.id, piece_id=rp.piece_id, designation=rp.piece.designation,
                                  reference=rp.piece.reference, qte=rp.qte, prix_achat_unitaire=rp.prix_achat_unitaire)
                for rp in rep.pieces],
        devis_numero=devis.numero if devis else None, devis_statut=devis.statut.value if devis else None,
        facture_numero=facture.numero if facture else None,
        historique=[s.HistoriqueOut(de_statut=h.de_statut, vers_statut=h.vers_statut, par=auteurs.get(h.par_user_id), le=h.le)
                    for h in rep.historique],
        sla_depasse=sla_depasse(db, rep),
        transitions=[s.TransitionOut(statut=st, possible=raison is None, raison=raison)
                     for st, raison in transitions_possibles(db, rep).items()],
    )


def modifier(db: Session, rep: Reparation, data: s.ReparationPatch) -> Reparation:
    if rep.statut == Statut.livre:
        raise refus_metier("Dossier clôturé : il n'est plus modifiable.")
    champs = data.model_dump(exclude_unset=True)
    code = champs.pop("panne_code", None)
    for k, v in champs.items():
        setattr(rep, k, v)
    if "symptomes_texte" in champs:
        _poser_symptomes(db, rep)
    if code is not None:
        panne = db.scalar(select(Panne).where(Panne.code == code))
        if panne is None:
            raise refus_metier(f"Panne inconnue : {code}.")
        db.query(ReparationPanne).filter(ReparationPanne.reparation_id == rep.id).delete()
        db.add(ReparationPanne(reparation_id=rep.id, panne_id=panne.id, finale=True))
    db.commit()
    return rep


# ---------------------------------------------------------------- transitions de statut


def _raison_blocage(db: Session, rep: Reparation, cible: Statut) -> str | None:
    i, j = STATUTS_ORDRE.index(rep.statut), STATUTS_ORDRE.index(cible)
    if rep.statut == Statut.livre:
        return "Dossier clôturé."
    if abs(i - j) != 1:
        return "Un dossier avance ou recule d'une colonne à la fois."
    if j < i:
        return None
    if cible == Statut.en_diagnostic:
        types = {p.type for p in rep.photos}
        if not PHOTOS_ACCUEIL <= types:
            return "Deux clichés minimum sont exigés à l'accueil (état général + zone endommagée)."
    if cible == Statut.en_reparation and rep.retour_de_id is None:
        devis = db.scalar(select(Devis).where(Devis.reparation_id == rep.id).order_by(Devis.id.desc()))
        if devis is None or devis.statut == StatutDevis.emis:
            return "Le devis doit être accepté (ou refusé) par le client avant l'intervention."
    if cible == Statut.pret:
        test = next((e for e in rep.checklist if e.ordre == ETAPE_TEST_SORTIE), None)
        if test is None or not test.faite:
            return "Le passage au statut « Prêt à facturer » exige que le test de sortie soit coché."
    if cible == Statut.livre and rep.retour_de_id is None:
        devis = db.scalar(select(Devis).where(Devis.reparation_id == rep.id).order_by(Devis.id.desc()))
        facture = db.scalar(select(Facture).where(Facture.reparation_id == rep.id))
        if not (facture and facture.acquittee) and not (devis and devis.statut == StatutDevis.refuse):
            return "Le règlement doit être encaissé avant la restitution."
    return None


def transitions_possibles(db: Session, rep: Reparation) -> dict[Statut, str | None]:
    i = STATUTS_ORDRE.index(rep.statut)
    voisins = [STATUTS_ORDRE[k] for k in (i - 1, i + 1) if 0 <= k < len(STATUTS_ORDRE)]
    return {st: _raison_blocage(db, rep, st) for st in voisins}


def changer_statut(db: Session, rep: Reparation, cible: Statut, auteur: User) -> Reparation:
    if cible == rep.statut:
        return rep
    raison = _raison_blocage(db, rep, cible)
    if raison:
        raise refus_metier(raison)
    now = maintenant()
    db.add(HistoriqueStatut(reparation_id=rep.id, de_statut=rep.statut, vers_statut=cible, par_user_id=auteur.id, le=now))
    rep.statut = cible
    rep.cloture_le = now if cible == Statut.livre else None
    if cible == Statut.livre:
        rep.client.derniere_intervention_le = now
    db.commit()
    return rep


# ---------------------------------------------------------------- checklist, photos, chrono


def cocher(db: Session, rep: Reparation, ordre: int, faite: bool, auteur: User) -> Reparation:
    etape = next((e for e in rep.checklist if e.ordre == ordre), None)
    if etape is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Étape de checklist introuvable.")
    if rep.statut == Statut.livre:
        raise refus_metier("Dossier clôturé : la checklist n'est plus modifiable.")
    if not faite and ordre == ETAPE_TEST_SORTIE and rep.statut == Statut.pret:
        raise refus_metier("Le test de sortie ne peut pas être décoché sur un dossier prêt : repassez-le en réparation.")
    etape.faite, etape.faite_par, etape.faite_le = faite, auteur.id if faite else None, maintenant() if faite else None
    db.commit()
    return rep


def dossier_photos() -> Path:
    return Path(get_settings().data_dir) / "photos"


async def ajouter_photo(db: Session, rep: Reparation, type_photo: TypePhoto, fichier: UploadFile, auteur: User) -> Photo:
    ext = TYPES_IMAGE.get(fichier.content_type or "")
    if ext is None:
        raise refus_metier("Format accepté : JPEG, PNG ou WebP.")
    contenu = await fichier.read(TAILLE_MAX_PHOTO + 1)
    if len(contenu) > TAILLE_MAX_PHOTO:
        raise refus_metier("Photo trop lourde (8 Mo maximum).")
    if not contenu:
        raise refus_metier("Fichier vide.")
    relatif = Path(rep.numero) / f"{uuid.uuid4().hex}{ext}"
    chemin = dossier_photos() / relatif
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_bytes(contenu)
    photo = Photo(reparation_id=rep.id, type=type_photo, chemin=str(relatif), sha256=hashlib.sha256(contenu).hexdigest(),
                  prise_le=maintenant(), par_user_id=auteur.id)
    db.add(photo)
    db.commit()
    return photo


def fichier_photo(db: Session, photo_id: int) -> tuple[Path, str]:
    photo = db.get(Photo, photo_id)
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo introuvable.")
    racine = dossier_photos().resolve()
    chemin = (racine / photo.chemin).resolve()
    if racine not in chemin.parents or not chemin.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fichier photo absent du volume.")
    media = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml"}[chemin.suffix]
    return chemin, media


def chrono(db: Session, rep: Reparation, action: str, auteur: User) -> Reparation:
    en_cours = db.scalar(select(TempsPasse).where(TempsPasse.reparation_id == rep.id, TempsPasse.fin.is_(None)))
    if action == "demarrer":
        if en_cours:
            raise refus_metier("Le chronomètre tourne déjà sur ce dossier.")
        if rep.statut == Statut.livre:
            raise refus_metier("Dossier clôturé.")
        db.add(TempsPasse(reparation_id=rep.id, user_id=auteur.id, debut=maintenant()))
    else:
        if not en_cours:
            raise refus_metier("Aucun chronomètre en cours.")
        en_cours.fin = maintenant()
    db.commit()
    return rep


# ---------------------------------------------------------------- pièces engagées


def _recalculer_cout(rep: Reparation) -> None:
    rep.cout_pieces_retenu = sum((rp.prix_achat_unitaire * rp.qte for rp in rep.pieces), Decimal(0))


def engager_piece(db: Session, rep: Reparation, data: s.PieceEngageeIn, auteur: User) -> Reparation:
    if rep.statut == Statut.livre:
        raise refus_metier("Dossier clôturé.")
    piece = db.get(Piece, data.piece_id)
    if piece is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pièce introuvable.")
    if piece.stock < data.qte:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Stock insuffisant pour {piece.designation} ({piece.stock} en stock) : "
                                                      "générez un bon de commande.")
    now = maintenant()
    piece.stock -= data.qte
    db.add(MouvementStock(piece_id=piece.id, type=TypeMouvement.sortie, qte=-data.qte, source=SourceMouvement.manuel,
                          motif=f"Réparation {rep.numero}", reparation_id=rep.id, par_user_id=auteur.id, le=now))
    rep.pieces.append(ReparationPiece(piece_id=piece.id, qte=data.qte, prix_achat_unitaire=piece.prix_achat))
    db.flush()
    _recalculer_cout(rep)
    db.commit()
    return rep


def retirer_piece(db: Session, rep: Reparation, ligne_id: int, auteur: User) -> Reparation:
    ligne = next((rp for rp in rep.pieces if rp.id == ligne_id), None)
    if ligne is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pièce engagée introuvable.")
    if rep.statut == Statut.livre:
        raise refus_metier("Dossier clôturé.")
    ligne.piece.stock += ligne.qte
    db.add(MouvementStock(piece_id=ligne.piece_id, type=TypeMouvement.entree, qte=ligne.qte, source=SourceMouvement.manuel,
                          motif=f"Retour en stock (annulation {rep.numero})", reparation_id=rep.id, par_user_id=auteur.id,
                          le=maintenant()))
    rep.pieces.remove(ligne)
    db.flush()
    _recalculer_cout(rep)
    db.commit()
    return rep


# ---------------------------------------------------------------- affectation et notification


def _technicien_valide(db: Session, tech_id: int) -> User:
    tech = db.get(User, tech_id)
    if tech is None or not tech.actif or tech.role not in (Role.technicien, Role.responsable):
        raise refus_metier("Technicien introuvable ou inactif.")
    return tech


def affecter(db: Session, rep: Reparation, tech_id: int | None, planifie_le, auteur: User, ip: str | None) -> Reparation:
    if rep.statut == Statut.livre:
        raise refus_metier("Dossier clôturé.")
    if tech_id is not None:
        _technicien_valide(db, tech_id)
    rep.tech_id = tech_id
    if planifie_le is not None:
        rep.planifie_le = planifie_le
    elif tech_id is not None and rep.planifie_le is None:
        rep.planifie_le = maintenant().date()
    audit(db, "affectation", user_id=auteur.id, email=auteur.email, ressource="reparations", ressource_id=rep.numero,
          details={"tech_id": tech_id}, ip=ip, commit=False)
    db.commit()
    return rep


MESSAGES_SMS = {
    Statut.recu: "Repar U : votre {appareil} est bien enregistré (dossier {numero}). Nous revenons vers vous après diagnostic.",
    Statut.en_diagnostic: "Repar U : diagnostic en cours sur votre {appareil} (dossier {numero}).",
    Statut.en_reparation: "Repar U : la réparation de votre {appareil} est en cours (dossier {numero}).",
    Statut.pret: "Repar U : votre {appareil} est prêt ! Retrait au 14 rue des Ateliers, Montpellier (dossier {numero}).",
    Statut.livre: "Repar U : merci pour votre confiance. Garantie 6 mois pièce et main-d'œuvre (dossier {numero}).",
}


def notifier(db: Session, rep: Reparation) -> str:
    texte = MESSAGES_SMS[rep.statut].format(appareil=rep.appareil.modele.modele, numero=rep.numero)
    envoyer(db, Canal.sms, rep.client.telephone, texte)
    db.commit()
    return texte


def stats_ouverts(db: Session) -> dict[int, list[Reparation]]:
    """Dossiers ouverts par technicien (clé None = non affectés)."""
    out: dict[int, list[Reparation]] = {}
    for r in db.scalars(select(Reparation).where(Reparation.statut != Statut.livre)):
        out.setdefault(r.tech_id, []).append(r)
    return out


def derniers_clotures(db: Session, n: int = 5) -> list[Reparation]:
    return list(db.scalars(select(Reparation).where(Reparation.statut == Statut.livre)
                           .order_by(Reparation.cloture_le.desc()).limit(n)))
