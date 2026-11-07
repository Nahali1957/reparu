"""Documents PDF (WeasyPrint) : devis/facture, étiquette, bon de restitution, rapport."""

from datetime import datetime
from html import escape

from weasyprint import HTML

from app.schemas.facturation import DocumentOut
from app.schemas.pilotage import RapportOut

ATELIER = "Repar U · 14 rue des Ateliers · 34000 Montpellier · SIRET 902 118 447"
GARANTIE = ("Garantie pièce et main-d'œuvre : 6 mois à compter de la date de restitution, hors casse et oxydation. "
            "TVA 20 % — TVA acquittée sur les débits. Pénalités de retard : 3 × le taux d'intérêt légal.")
CSS = """
@page { size: A4; margin: 18mm 16mm; }
body { font-family: 'DejaVu Sans', sans-serif; font-size: 10pt; color: #1f2633; }
.mono { font-family: 'DejaVu Sans Mono', monospace; }
.entete { display: flex; justify-content: space-between; border-bottom: 2px solid #2d55b8; padding-bottom: 8px; }
.logo { font-size: 18pt; font-weight: 700; color: #2d55b8; }
.petit { font-size: 8pt; color: #5a6475; }
h1 { font-size: 16pt; margin: 14px 0 2px; letter-spacing: .04em; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; }
th { text-align: left; font-size: 8pt; letter-spacing: .08em; color: #5a6475; border-bottom: 1px solid #c9d0dc; padding: 6px 4px; }
td { padding: 6px 4px; border-bottom: 1px solid #eceff4; vertical-align: top; }
td.n, th.n { text-align: right; }
.bloc { display: inline-block; width: 31%; vertical-align: top; margin-right: 2%; margin-top: 10px; }
.totaux { margin-left: 55%; margin-top: 10px; }
.totaux div { display: flex; justify-content: space-between; padding: 3px 0; }
.ttc { font-weight: 700; font-size: 12pt; border-top: 1px solid #1f2633; }
.mentions { margin-top: 24px; font-size: 8pt; color: #5a6475; }
.signature { margin-top: 30px; height: 60px; border: 1px dashed #9aa3b2; padding: 6px; }
"""


def eur(v) -> str:
    return f"{float(v):,.2f} €".replace(",", " ").replace(".", ",")


def _pdf(corps: str, css: str = CSS) -> bytes:
    return HTML(string=f"<html><head><meta charset='utf-8'><style>{css}</style></head><body>{corps}</body></html>").write_pdf()


def _entete(titre: str, numero: str, date: datetime) -> str:
    return (f"<div class='entete'><div><div class='logo'>Ʀ Repar U</div><div class='petit'>{ATELIER}</div></div>"
            f"<div style='text-align:right'><h1>{escape(titre)}</h1><div class='mono'>{escape(numero)}</div>"
            f"<div class='petit'>émis le {date:%d/%m/%Y}</div></div></div>")


def document(doc: DocumentOut) -> bytes:
    lignes = "".join(
        f"<tr><td><b>{escape(li.designation)}</b><br><span class='petit'>{escape(li.detail or '')}</span></td>"
        f"<td class='n'>{li.qte:g}{' h' if li.type == 'main_oeuvre' else ''}</td><td class='n'>{eur(li.pu_ht)}</td>"
        f"<td class='n'>{'offert' if li.total_ht == 0 else eur(li.total_ht)}</td></tr>" for li in doc.lignes)
    corps = (
        _entete(doc.type, doc.numero, doc.emis_le)
        + f"<div class='bloc'><div class='petit'>CLIENT</div><b>{escape(doc.client_nom)}</b><br>{escape(doc.client_telephone)}"
          f"<br>{escape(doc.client_ville or '')}</div>"
        + f"<div class='bloc'><div class='petit'>APPAREIL</div><b>{escape(doc.appareil)}</b><br><span class='mono'>IMEI {doc.imei}</span></div>"
        + f"<div class='bloc'><div class='petit'>DOSSIER</div><b class='mono'>{doc.dossier}</b><br>{escape(doc.technicien or 'technicien non affecté')}</div>"
        + f"<table><tr><th>DÉSIGNATION</th><th class='n'>QTÉ</th><th class='n'>P.U. HT</th><th class='n'>TOTAL HT</th></tr>{lignes}</table>"
        + f"<div class='totaux'><div><span>Total HT</span><span>{eur(doc.total_ht)}</span></div>"
          f"<div><span>TVA 20 %</span><span>{eur(doc.tva)}</span></div>"
          f"<div class='ttc'><span>Total TTC</span><span>{eur(doc.total_ttc)}</span></div></div>"
        + f"<div class='mentions'>{GARANTIE}</div>"
    )
    return _pdf(corps)


def etiquette(numero: str, client: str, appareil: str, imei: str, recu_le: datetime) -> bytes:
    css = ("@page { size: 62mm 29mm; margin: 2mm 3mm; } body { font-family: 'DejaVu Sans', sans-serif; font-size: 7pt; margin: 0 }"
           ".num { font-family: 'DejaVu Sans Mono', monospace; font-size: 15pt; font-weight: 700 }")
    return _pdf(f"<div class='num'>{numero}</div><div><b>{escape(client)}</b></div><div>{escape(appareil)} · IMEI …{imei[-6:]}</div>"
                f"<div>Reçu le {recu_le:%d/%m/%Y %H:%M} · Repar U</div>", css)


def bon_restitution(doc: DocumentOut, diagnostic: str | None, restitue_le: datetime | None) -> bytes:
    corps = (
        _entete("BON DE RESTITUTION", doc.dossier, restitue_le or doc.emis_le)
        + f"<p><b>Client :</b> {escape(doc.client_nom)} — {escape(doc.client_telephone)}</p>"
        + f"<p><b>Appareil :</b> {escape(doc.appareil)} — <span class='mono'>IMEI {doc.imei}</span></p>"
        + f"<p><b>Intervention :</b> {escape(diagnostic or '—')}</p>"
        + f"<p><b>Document de règlement :</b> <span class='mono'>{doc.numero}</span> — {eur(doc.total_ttc)} TTC</p>"
        + "<p>Le client reconnaît avoir récupéré son appareil en état de fonctionnement après test de sortie.</p>"
        + "<div class='signature'>Signature du client</div>"
        + f"<div class='mentions'>{GARANTIE}</div>"
    )
    return _pdf(corps)


def rapport(r: RapportOut) -> bytes:
    def ligne_kpi(lib, k, suffixe=""):
        v = "—" if k.valeur is None else (eur(k.valeur) if suffixe == "€" else f"{k.valeur:g}{suffixe}")
        d = "" if k.delta_pct is None else f"{k.delta_pct:+.1f} %"
        return f"<tr><td>{lib}</td><td class='n'>{v}</td><td class='n'>{d}</td></tr>"
    mois = "".join(f"<tr><td>{p.libelle} {p.mois[:4]}</td><td class='n'>{p.reparations}</td><td class='n'>{eur(p.ca)}</td>"
                   f"<td class='n'>{eur(p.marge)}</td></tr>" for p in r.marge_par_mois)
    renta = "".join(f"<tr><td>{escape(x.label)}</td><td class='n'>{x.dossiers}</td><td class='n'>{eur(x.marge)}</td></tr>"
                    for x in r.rentabilite)
    corps = (
        _entete("RAPPORT D'ACTIVITÉ", r.periode.libelle, datetime.now())
        + "<table><tr><th>INDICATEUR</th><th class='n'>VALEUR</th><th class='n'>VS PÉRIODE PRÉC.</th></tr>"
        + ligne_kpi("Chiffre d'affaires HT", r.ca, "€") + ligne_kpi("Marge brute", r.marge_brute, "€")
        + ligne_kpi("Réparations clôturées", r.reparations) + ligne_kpi("Délai moyen (j)", r.delai_moyen_j)
        + ligne_kpi("Taux de retour (%)", r.taux_retour_pct) + ligne_kpi("Panier moyen HT", r.panier_moyen, "€") + "</table>"
        + "<h1 style='font-size:12pt'>Marge par mois</h1><table><tr><th>MOIS</th><th class='n'>RÉPARATIONS</th>"
          f"<th class='n'>CA HT</th><th class='n'>MARGE BRUTE</th></tr>{mois}</table>"
        + "<h1 style='font-size:12pt'>Rentabilité par type de panne</h1><table><tr><th>TYPE</th><th class='n'>DOSSIERS</th>"
          f"<th class='n'>MARGE BRUTE</th></tr>{renta}</table>"
        + "<div class='mentions'>Document généré par la plateforme Repar U. Les données de démonstration sont synthétiques.</div>"
    )
    return _pdf(corps)
