"""Services externes SIMULÉS : rien ne part réellement, tout est écrit dans `outbox` et dans les logs."""

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.clock import maintenant
from app.models.enums import Canal, StatutOutbox
from app.models.tables import Outbox

log = logging.getLogger("reparu.outbox")


def envoyer(db: Session, canal: Canal, destinataire: str, corps: str, sujet: str | None = None,
            piece_jointe: str | None = None, programme_pour: datetime | None = None) -> Outbox:
    msg = Outbox(canal=canal, destinataire=destinataire, sujet=sujet, corps=corps, piece_jointe=piece_jointe,
                 programme_pour=programme_pour,
                 statut=StatutOutbox.en_attente if programme_pour else StatutOutbox.envoye_simule, cree_le=maintenant())
    db.add(msg)
    log.warning("[SIMULATION %s] -> %s | %s | %s%s", canal.value.upper(), destinataire, sujet or "", corps[:120],
                f" | programmé pour {programme_pour:%d/%m/%Y %H:%M}" if programme_pour else "")
    return msg
