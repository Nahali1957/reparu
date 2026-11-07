"""Inférence des trois modèles (F-04, F-05, F-07), recommandation d'achat (5.9) et fiabilité (F-11).

Le modèle propose, il ne décide pas : la suggestion est historisée en lecture seule,
la valeur retenue par le technicien reste la seule à faire foi pour le devis.
"""

import math
import time
from datetime import timedelta
from decimal import Decimal

import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import maintenant
from app.ml import features as F
from app.ml import registry
from app.models.enums import TypeMouvement
from app.models.tables import (
    Capteur, DiagnosticIA, LectureCapteur, ModeleAppareil, ModeleIA, MouvementStock, OffreFournisseur, Panne, Piece, Reparation,
    ReparationPanne,
)
from app.schemas import ia as s
from app.services import reparations as reps
from app.services import stocks
from app.services.regles import main_oeuvre, money, parametre, prix_conseille, statut_stock

Z_SERVICE = 1.65  # niveau de service ≈ 95 % pour le stock de sécurité
LIBELLES_MODELES = {"diagnostic": "Diagnostic des pannes", "estimation": "Estimation du temps et du prix",
                    "prevision": "Prévision des besoins en pièces", "securite": "Détection d'anomalies (sécurité)",
                    "capteurs": "Détection de lectures capteurs atypiques"}


def niveau_confiance(score: float) -> str:
    """Codes imposés : ≥ 80 % haute, 50 à 79 % moyenne, < 50 % indéterminée (jamais de rouge)."""
    return "haute" if score >= 0.8 else "moyenne" if score >= 0.5 else "indéterminée"


# ---------------------------------------------------------------- diagnostic (modèle 1)


def _pieces_pour(db: Session, modele_id: int, code: str) -> tuple[list[s.PieceSuggereeOut], str | None]:
    pieces = stocks.pieces_compatibles(db, modele_id, code)
    sugg = [s.PieceSuggereeOut(piece_id=p.id, designation=p.designation, stock=p.stock, statut=statut_stock(p.stock, p.seuil))
            for p in sorted(pieces, key=lambda p: -p.stock)][:2]
    typ = stocks.TYPE_PIECE_PAR_PANNE.get(code)
    manque = typ if typ and not pieces else None
    return sugg, manque


def diagnostiquer(db: Session, data: s.DiagnosticIn) -> s.DiagnosticOut:
    t0 = time.perf_counter()
    rep = reps.get(db, data.reparation) if data.reparation else None
    modele = rep.appareil.modele if rep else db.get(ModeleAppareil, data.modele_id)
    if modele is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modèle d'appareil introuvable.")
    texte = rep.symptomes_texte if rep else data.symptomes_texte
    symptomes = reps.categoriser_symptomes(db, texte)
    meta, bundle = registry.actif(db, "diagnostic")
    ligne = pd.DataFrame([{"symptomes": [sy.code for sy in symptomes], "modele": modele.modele, "marque": modele.marque,
                           "recu_le": pd.Timestamp(rep.recu_le if rep else maintenant())}])
    X = F.matrice_diagnostic(ligne, bundle["ref"])[bundle["metriques"]["colonnes"]]
    est = bundle["estimateur"]
    proba = est.predict_proba(X)[0]
    ordre = np.argsort(proba)[::-1][:3]
    libelles = dict(db.execute(select(Panne.code, Panne.libelle)).all())
    hypotheses = []
    for k in ordre:
        code = str(est.classes_[k])
        pieces, manque = _pieces_pour(db, modele.id, code)
        hypotheses.append(s.HypotheseOut(code=code, label=libelles.get(code, code), score=round(float(proba[k]), 3),
                                         pieces=pieces, manque=manque))
    estimation = estimer(db, s.EstimationIn(modele_id=modele.id, panne_code=hypotheses[0].code))
    confiance = hypotheses[0].score
    if rep:
        db.add(DiagnosticIA(reparation_id=rep.id, modele_version=meta.version, confiance=confiance,
                            resultat={"pannes": [h.model_dump() for h in hypotheses],
                                      "symptomes": [sy.libelle for sy in symptomes]},
                            cout_suggere=estimation.cout_pieces, prix_suggere=estimation.prix_conseille_ht,
                            marge_suggeree=estimation.marge_brute, duree_suggeree_min=estimation.duree_min, cree_le=maintenant()))
        db.commit()
    return s.DiagnosticOut(modele_version=meta.version, confiance=confiance, niveau=niveau_confiance(confiance),
                           symptomes_reconnus=[sy.libelle for sy in symptomes], pannes=hypotheses, estimation=estimation,
                           historique_interventions=meta.nb_lignes_entrainement,
                           duree_ms=int((time.perf_counter() - t0) * 1000))


# ---------------------------------------------------------------- estimation (modèle 2 + règles de prix)


def estimer(db: Session, data: s.EstimationIn) -> s.EstimationOut:
    modele = db.get(ModeleAppareil, data.modele_id)
    if modele is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modèle d'appareil introuvable.")
    if db.scalar(select(Panne).where(Panne.code == data.panne_code)) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Panne inconnue : {data.panne_code}.")
    meta, bundle = registry.actif(db, "estimation")
    ligne = pd.DataFrame([{"panne": data.panne_code, "modele": modele.modele, "marque": modele.marque}])
    X = F.matrice_estimation(ligne, bundle["ref"])[bundle["metriques"]["colonnes"]]
    duree = int(max(10, round(float(bundle["estimateur"].predict(X)[0]) / 5) * 5))

    cout_estime = False
    if data.piece_id:
        piece = stocks.get_piece(db, data.piece_id)
        cout = piece.prix_achat
    else:
        compatibles = sorted(stocks.pieces_compatibles(db, modele.id, data.panne_code), key=lambda p: -p.stock)
        typ = stocks.TYPE_PIECE_PAR_PANNE.get(data.panne_code)
        if compatibles:
            cout = compatibles[0].prix_achat
        elif typ:  # pièce nécessaire mais non référencée pour ce modèle : coût médian de la catégorie
            prix = sorted(float(p) for p in db.scalars(select(Piece.prix_achat).where(Piece.categorie == typ)))
            cout, cout_estime = money(prix[len(prix) // 2] if prix else 35), True
        else:
            cout = Decimal(0)
    taux, tva, marge = parametre(db, "taux_horaire"), parametre(db, "tva"), parametre(db, "marge_visee")
    prix = prix_conseille(float(cout), duree, taux, marge)
    return s.EstimationOut(panne_code=data.panne_code, duree_min=duree, erreur_p80_min=bundle["metriques"].get("erreur_p80_min"),
                           cout_pieces=money(cout), cout_estime=cout_estime, main_oeuvre=main_oeuvre(duree, taux),
                           prix_conseille_ht=prix, prix_conseille_ttc=money(prix * Decimal(str(1 + tva))),
                           marge_brute=prix - money(cout), modele_version=meta.version)


# ---------------------------------------------------------------- prévision (modèle 3)


def _stock_observe(db: Session) -> dict[int, int]:
    """Dernière lecture capteur récente (< 24 h) par pièce. Sert à la prudence, jamais à corriger le stock."""
    limite = maintenant() - timedelta(hours=24)
    rows = db.execute(select(Capteur.piece_id, LectureCapteur.niveau, LectureCapteur.recu_le)
                      .join(LectureCapteur, LectureCapteur.capteur_id == Capteur.id)
                      .where(Capteur.actif.is_(True), LectureCapteur.recu_le >= limite)
                      .order_by(LectureCapteur.recu_le)).all()
    return {pid: niveau for pid, niveau, _ in rows}


def previsions(db: Session, piece_id: int | None = None) -> list[s.PrevisionOut]:
    meta, bundle = registry.actif(db, "prevision")
    est, cols = bundle["estimateur"], bundle["metriques"]["colonnes"]
    serie = F.consommation_hebdo(db)
    sigma = bundle["metriques"].get("ecart_type_hebdo", {})
    observe = _stock_observe(db)
    debut_30j = maintenant() - timedelta(days=30)
    conso30 = dict(db.execute(select(MouvementStock.piece_id, func.sum(-MouvementStock.qte))
                              .where(MouvementStock.type == TypeMouvement.sortie, MouvementStock.reparation_id.is_not(None),
                                     MouvementStock.le >= debut_30j).group_by(MouvementStock.piece_id)).all())
    q = select(Piece).order_by(Piece.designation)
    if piece_id:
        q = q.where(Piece.id == piece_id)
    out = []
    for p in db.scalars(q):
        hist = serie[serie["piece_id"] == p.id].sort_values("semaine")["conso"].astype(float).tolist()
        prevu = _prevoir_4_semaines(est, cols, hist)
        prev30 = round(prevu * 30 / 28, 1)
        offre = stocks.meilleure_offre(db, p.id)
        delai_sem = max((offre.delai_jours if offre else 7) / 7, 1 / 7)
        ss = math.ceil(Z_SERVICE * float(sigma.get(str(p.id), sigma.get(p.id, 0))) * math.sqrt(delai_sem))
        stock_obs = observe.get(p.id)
        stock_ref = min(p.stock, stock_obs) if stock_obs is not None else p.stock  # prudence si le bac semble plus vide
        quantite = max(0, math.ceil(prev30 + ss - stock_ref))
        couverture = round(stock_ref / (prev30 / 30), 1) if prev30 > 0 else None
        delai_j = offre.delai_jours if offre else 7
        if quantite and (stock_ref == 0 or (couverture is not None and couverture <= delai_j)):
            action = f"Commander {quantite} — urgent"
        elif quantite:
            action = f"Commander {quantite}"
        else:
            action = "Stock suffisant"
        out.append(s.PrevisionOut(piece_id=p.id, designation=p.designation, stock=p.stock, stock_observe=stock_obs, seuil=p.seuil,
                                  conso_30j=int(conso30.get(p.id, 0) or 0), prevision_30j=prev30, couverture_j=couverture,
                                  stock_securite=ss, quantite_a_commander=quantite, action=action, modele_version=meta.version))
    return out


def _prevoir_4_semaines(est, cols: list[str], hist: list[float]) -> float:
    """Prévision récursive des 4 prochaines semaines (≈ 30 jours)."""
    h = list(hist) if len(hist) >= 4 else [0.0] * (4 - len(hist)) + list(hist)
    total = 0.0
    prochaine = pd.Timestamp(maintenant()).to_period("W-SUN").start_time
    for k in range(4):
        semaine = (prochaine + pd.Timedelta(weeks=k)).isocalendar().week
        ligne = {f"lag{i}": h[-i] for i in range(1, F.LAGS + 1)}
        ligne["ma4"] = float(np.mean(h[-4:]))
        ligne["ma12"] = float(np.mean(h[-12:]))
        ligne["sin"], ligne["cos"] = math.sin(2 * math.pi * semaine / 52), math.cos(2 * math.pi * semaine / 52)
        y = max(0.0, float(est.predict(pd.DataFrame([ligne])[cols])[0]))
        total += y
        h.append(y)
    return total


def recommandation_achat(db: Session, piece_id: int) -> s.RecommandationAchatOut:
    stocks.get_piece(db, piece_id)
    prev = previsions(db, piece_id)[0]
    offres = db.scalars(select(OffreFournisseur).where(OffreFournisseur.piece_id == piece_id)).all()
    scores = stocks.scorer(offres)
    best = max((o for o in offres if o.id in scores), key=lambda o: scores[o.id], default=None)
    if best is None:
        return s.RecommandationAchatOut(prevision=prev, fournisseur_id=None, fournisseur=None, prix_ht=None, delai_jours=None,
                                        score=None, cout_total_ht=None, justification="Aucune offre disponible pour cette pièce.")
    qte = max(prev.quantite_a_commander, best.minimum_commande) if prev.quantite_a_commander else 0
    justif = (f"Prévision {prev.prevision_30j:g} pièce(s) sur 30 j, stock de sécurité {prev.stock_securite}, stock "
              f"{prev.stock_observe if prev.stock_observe is not None and prev.stock_observe < prev.stock else prev.stock} : "
              + (f"commander {qte} chez {best.fournisseur.nom} (score {scores[best.id]:.2f} : prix, délai {best.delai_jours} j, "
                 f"fiabilité {stocks.libelle_fiabilite(best.fournisseur.fiabilite).lower()})." if qte else "aucune commande nécessaire."))
    return s.RecommandationAchatOut(prevision=prev, fournisseur_id=best.fournisseur_id, fournisseur=best.fournisseur.nom,
                                    prix_ht=best.prix_ht, delai_jours=best.delai_jours, score=scores[best.id],
                                    cout_total_ht=money(best.prix_ht * qte) if qte else Decimal(0), justification=justif)


# ---------------------------------------------------------------- fiabilité (F-11)


def fiabilite(db: Session) -> s.FiabiliteOut:
    modeles = []
    for m in db.scalars(select(ModeleIA).where(ModeleIA.actif.is_(True)).order_by(ModeleIA.id)):
        met = m.metriques
        cle = met["metrique_selection"]
        versions = list(db.scalars(select(ModeleIA.version).where(ModeleIA.nom == m.nom).order_by(ModeleIA.id)))
        modeles.append(s.ModeleFiabiliteOut(
            nom=m.nom, libelle=LIBELLES_MODELES.get(m.nom, m.nom), version=m.version, algorithme_retenu=m.algorithme_retenu,
            metrique=cle, valeur=met["candidats"][met["retenu"]][cle], baseline=met["candidats"][met["baseline"]][cle],
            gain_vs_baseline=met["gain_vs_baseline"], plus_grand_est_meilleur=met["plus_grand_est_meilleur"],
            candidats=met["candidats"], nb_lignes=m.nb_lignes_entrainement, entraine_le=m.entraine_le, versions=versions))
    # Suivi en production : la panne confirmée figurait-elle dans la suggestion ?
    rows = db.execute(select(DiagnosticIA.resultat, Panne.code)
                      .join(ReparationPanne, ReparationPanne.reparation_id == DiagnosticIA.reparation_id)
                      .join(Panne, Panne.id == ReparationPanne.panne_id).join(Reparation, Reparation.id == DiagnosticIA.reparation_id)
                      ).all()
    n = len(rows)
    top1 = sum(1 for res, code in rows if res["pannes"] and res["pannes"][0]["code"] == code)
    top3 = sum(1 for res, code in rows if code in [p["code"] for p in res["pannes"][:3]])
    return s.FiabiliteOut(modeles=modeles, suivi_diagnostic=s.SuiviProductionOut(
        suggestions_evaluees=n, top1_pct=round(top1 / n * 100, 1) if n else None, top3_pct=round(top3 / n * 100, 1) if n else None))
