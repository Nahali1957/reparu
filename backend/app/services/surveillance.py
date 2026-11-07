"""Tâche de fond (désactivée dans les tests) : détection d'anomalies par IA chaque minute, purge RGPD chaque jour."""

import logging
import threading
from datetime import date

from app.services import rgpd, securite

log = logging.getLogger("reparu.surveillance")
INTERVALLE_S = 60


class Surveillance:
    def __init__(self, session_factory):
        self.session_factory = session_factory
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self._boucle, name="surveillance-ia", daemon=True)
        self.derniere_purge: date | None = None

    def demarrer(self) -> None:
        self.thread.start()

    def arreter(self) -> None:
        self.stop.set()

    def _boucle(self) -> None:
        while not self.stop.wait(INTERVALLE_S):
            try:
                with self.session_factory() as db:
                    for a in securite.detecter_securite(db) + securite.detecter_capteurs(db):
                        log.warning("Alerte IA (%s/%s) : %s", a.origine.value, a.type, (a.details or {}).get("message"))
                    if self.derniere_purge != date.today():  # purge RGPD quotidienne
                        log.warning("Purge RGPD : %s", rgpd.purger(db))
                        self.derniere_purge = date.today()
            except Exception:
                log.exception("Surveillance IA : erreur")
