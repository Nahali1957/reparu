"""Devis et facturation (écran 5.14, DECISIONS D-B3 à D-B6)."""

from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import maintenant
from app.models.enums import Canal, Statut, StatutDevis, TypeLigne
from app.models.tables import Devis, Facture, LigneDevis, LigneFacture, Reglement, Reparation, User
from app.schemas import facturation as s
from app.services.outbox import envoyer
from app.services.regles import heures, main_oeuvre, money, parametre, prochain_numero, refus_metier

LIBELLES_MODE = {"carte": "carte bancaire", "especes": "espèces", "virement": "virement", "trois_fois": "paiement en 3 fois"}


def dernier_devis(db: Session, rep: Reparation) -> Devis | None:
    return db.scalar(select(Devis).where(Devis.reparation_id == rep.id).order_by(Devis.id.desc()))


def facture_de(db: Session, rep: Reparation) -> Facture | None:
    return db.scalar(select(Facture).where(Facture.reparation_id == rep.id))


def _lignes_devis(db: Session, rep: Reparation) -> list[LigneDevis]:
    if rep.prix_retenu_ht is None or not rep.duree_estimee_min:
        raise refus_metier("Renseignez la valeur retenue (prix client et durée) dans le dossier avant d'éditer le devis.")
    taux = parametre(db, "taux_horaire")
    mo = main_oeuvre(rep.duree_estimee_min, taux)
    pieces_ht = money(rep.prix_retenu_ht) - mo
    if pieces_ht < 0:
        raise refus_metier(f"Le prix retenu ({rep.prix_retenu_ht} € HT) est inférieur à la main-d'œuvre ({mo} € HT).")
    lignes = []
    if pieces_ht > 0:
        noms = ", ".join(rp.piece.designation for rp in rep.pieces) or "Pièces détachées"
        lignes.append(LigneDevis(designation=noms, detail="Pièce(s) de remplacement", qte=1, pu_ht=pieces_ht, type=TypeLigne.piece))
    lignes.append(LigneDevis(designation="Main-d'œuvre atelier",
                             detail=f"{rep.duree_estimee_min} min · taux horaire {taux:g} € HT",
                             qte=heures(rep.duree_estimee_min), pu_ht=money(taux), type=TypeLigne.main_oeuvre))
    lignes.append(LigneDevis(designation="Forfait diagnostic", detail="déduit si réparation acceptée", qte=1, pu_ht=0,
                             type=TypeLigne.forfait))
    return lignes


def _totaux(db: Session, lignes) -> tuple[Decimal, Decimal, Decimal]:
    ht = money(sum((Decimal(str(li.qte)) * Decimal(str(li.pu_ht)) for li in lignes), Decimal(0)))
    tva = money(ht * Decimal(str(parametre(db, "tva"))))
    return ht, tva, ht + tva


def editer_devis(db: Session, rep: Reparation) -> Devis:
    if rep.retour_de_id:
        raise refus_metier("Retour sous garantie : aucune facturation.")
    if rep.statut == Statut.livre:
        raise refus_metier("Dossier clôturé.")
    devis = dernier_devis(db, rep)
    if devis and devis.statut == StatutDevis.accepte:
        raise refus_metier("Le devis a déjà été accepté par le client : il n'est plus modifiable.")
    lignes = _lignes_devis(db, rep)
    now = maintenant()
    if devis is None or devis.statut == StatutDevis.refuse:
        devis = Devis(numero=prochain_numero(db, Devis.numero, "DV", now.year), reparation_id=rep.id, statut=StatutDevis.emis,
                      emis_le=now, total_ht=0, tva=0, total_ttc=0)
        db.add(devis)
    devis.lignes = lignes
    devis.emis_le = now
    devis.total_ht, devis.tva, devis.total_ttc = _totaux(db, lignes)
    db.commit()
    return devis


def _devis_requis(db: Session, rep: Reparation) -> Devis:
    devis = dernier_devis(db, rep)
    if devis is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aucun devis pour ce dossier : éditez-le d'abord.")
    return devis


def envoyer_devis(db: Session, rep: Reparation, canal: Canal) -> Devis:
    devis = _devis_requis(db, rep)
    texte = (f"Repar U : votre devis {devis.numero} pour {rep.appareil.modele.modele} s'élève à {devis.total_ttc} € TTC. "
             f"Répondez OUI pour accepter.")
    if canal == Canal.email:
        if not rep.client.email:
            raise refus_metier("Ce client n'a pas d'adresse e-mail : envoyez le devis par SMS.")
        envoyer(db, Canal.email, rep.client.email, texte, sujet=f"Devis {devis.numero}", piece_jointe=f"{devis.numero}.pdf")
    else:
        envoyer(db, Canal.sms, rep.client.telephone, texte)
    devis.envoye_le = maintenant()
    db.commit()
    return devis


def envoyer_document(db: Session, rep: Reparation, doc: s.DocumentOut) -> None:
    if not rep.client.email:
        raise refus_metier("Ce client n'a pas d'adresse e-mail.")
    envoyer(db, Canal.email, rep.client.email, f"Bonjour, veuillez trouver ci-joint votre {doc.type.lower()} {doc.numero}.",
            sujet=f"Repar U — {doc.type.capitalize()} {doc.numero}", piece_jointe=f"{doc.numero}.pdf")
    db.commit()


def repondre(db: Session, rep: Reparation, accepte: bool, auteur: User) -> Devis:
    devis = _devis_requis(db, rep)
    if devis.statut != StatutDevis.emis:
        raise refus_metier("Le client a déjà répondu à ce devis.")
    now = maintenant()
    devis.statut = StatutDevis.accepte if accepte else StatutDevis.refuse
    if accepte:
        devis.accepte_le = now
        rep.valide_client_le = now
        etape = next((e for e in rep.checklist if e.ordre == 2), None)
        if etape and not etape.faite:
            etape.faite, etape.faite_par, etape.faite_le = True, auteur.id, now
    db.commit()
    return devis


def _raison_encaissement(db: Session, rep: Reparation, devis: Devis | None, facture: Facture | None) -> str | None:
    if facture and facture.acquittee:
        return "Règlement déjà encaissé."
    if devis is None or devis.statut != StatutDevis.accepte:
        return "Le devis doit être accepté par le client."
    if rep.statut != Statut.pret:
        return "La réparation doit être terminée (statut « Prêt »)."
    return None


def encaisser(db: Session, rep: Reparation, mode, auteur: User) -> Facture:
    devis, facture = dernier_devis(db, rep), facture_de(db, rep)
    raison = _raison_encaissement(db, rep, devis, facture)
    if raison:
        raise refus_metier(raison)
    now = maintenant()
    facture = Facture(numero=prochain_numero(db, Facture.numero, "FA", now.year), devis_id=devis.id, reparation_id=rep.id,
                      client_nom=rep.client.nom, emise_le=now, total_ht=devis.total_ht, tva=devis.tva, total_ttc=devis.total_ttc, acquittee=True)
    facture.lignes = [LigneFacture(designation=li.designation, detail=li.detail, qte=li.qte, pu_ht=li.pu_ht, type=li.type)
                      for li in devis.lignes]
    facture.reglements = [Reglement(mode=mode, montant=devis.total_ttc, encaisse_le=now, par_user_id=auteur.id)]
    db.add(facture)
    db.commit()
    return facture


def document(db: Session, rep: Reparation) -> s.FacturationOut:
    devis, facture = dernier_devis(db, rep), facture_de(db, rep)
    if devis is None:
        raison = ("Retour sous garantie : aucune facturation." if rep.retour_de_id
                  else "Aucun devis édité : renseignez la valeur retenue dans le dossier puis « Éditer le devis ».")
        return s.FacturationOut(dossier=rep.numero, document=None, raison_absence=raison)
    source = facture or devis
    lignes = [s.LigneOut(designation=li.designation, detail=li.detail, qte=li.qte, pu_ht=li.pu_ht,
                         total_ht=money(Decimal(str(li.qte)) * li.pu_ht), type=li.type.value) for li in source.lignes]
    mo = sum((li.total_ht for li in lignes if li.type == "main_oeuvre"), Decimal(0))
    marge_nette = source.total_ht - money(rep.cout_pieces_retenu or 0) - mo
    reglement = facture.reglements[0] if facture and facture.reglements else None
    termine = rep.statut in (Statut.pret, Statut.livre)
    etapes = [
        s.EtapeReglementOut(libelle="Devis émis", fait=True,
                            detail=f"envoyé le {devis.envoye_le:%d/%m à %H:%M}" if devis.envoye_le else f"émis le {devis.emis_le:%d/%m}"),
        s.EtapeReglementOut(libelle="Accepté par le client", fait=devis.statut == StatutDevis.accepte,
                            detail={"accepte": f"le {devis.accepte_le:%d/%m}" if devis.accepte_le else "accepté",
                                    "refuse": "devis refusé", "emis": "en attente de réponse"}[devis.statut.value]),
        s.EtapeReglementOut(libelle="Réparation terminée", fait=termine, detail="terminée" if termine else "en cours"),
        s.EtapeReglementOut(libelle="Règlement encaissé", fait=reglement is not None,
                            detail=f"{LIBELLES_MODE[reglement.mode.value]} · {reglement.encaisse_le:%d/%m}" if reglement else "en attente"),
    ]
    if facture:
        type_doc, statut = ("FACTURE ACQUITTÉE" if facture.acquittee else "FACTURE"), "Réglé"
    else:
        type_doc = "DEVIS"
        statut = {"emis": "Devis en attente", "accepte": "Devis accepté", "refuse": "Devis refusé"}[devis.statut.value]
    raison = _raison_encaissement(db, rep, devis, facture)
    a = rep.appareil
    return s.FacturationOut(dossier=rep.numero, raison_absence=None, document=s.DocumentOut(
        type=type_doc, numero=source.numero, emis_le=facture.emise_le if facture else devis.emis_le, dossier=rep.numero,
        client_nom=(facture.client_nom if facture and facture.client_nom else rep.client.nom), client_telephone=rep.client.telephone, client_email=rep.client.email,
        client_ville=rep.client.ville, appareil=f"{a.modele.marque} {a.modele.modele}", imei=a.imei,
        technicien=rep.technicien.nom if rep.technicien else None, lignes=lignes, total_ht=source.total_ht, tva=source.tva,
        total_ttc=source.total_ttc, marge_nette=marge_nette, statut_reglement=statut, etapes=etapes,
        mode_reglement=reglement.mode if reglement else None, peut_encaisser=raison is None, raison_encaissement=raison))


def recents(db: Session, limit: int = 20) -> list[s.DocumentRecentOut]:
    out = []
    for d in db.scalars(select(Devis).order_by(Devis.emis_le.desc()).limit(limit)):
        rep = db.get(Reparation, d.reparation_id)
        f = facture_de(db, rep)
        out.append(s.DocumentRecentOut(
            numero=f.numero if f else d.numero, type="Facture" if f else "Devis", dossier=rep.numero, client_nom=rep.client.nom,
            emis_le=f.emise_le if f else d.emis_le, total_ttc=(f or d).total_ttc,
            statut="Réglé" if f else {"emis": "En attente", "accepte": "Accepté", "refuse": "Refusé"}[d.statut.value]))
    return out
