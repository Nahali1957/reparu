"""Simulateur de capteurs de bacs de pièces (SIMULATION : aucun matériel réel).

Chaque capteur est un client MQTT distinct (son propre compte, TLS) :
- il lit SA consigne `reparu/capteurs/<id>/consigne` (stock comptable publié par le backend, retained) ;
- il publie SA lecture `reparu/capteurs/<id>/lecture` toutes les IOT_PERIODE_S secondes.

Le bac « physique » est modélisé comme la consigne plus un décalage : bruit de comptage
ponctuel, dérive persistante (pièces sorties sans mouvement enregistré), valeur aberrante,
capteur muet. Un mouvement de stock (nouvelle consigne) remet le décalage à zéro.
"""

import hashlib
import json
import logging
import os
import random
import ssl
import threading
import time
from datetime import datetime

import paho.mqtt.client as mqtt

logging.basicConfig(level=logging.INFO, format="%(asctime)s [iot-sim] %(message)s")
log = logging.getLogger()

HOTE = os.environ.get("MQTT_HOST", "mqtt")
PORT = int(os.environ.get("MQTT_PORT", "8883"))
CA = os.environ.get("MQTT_CA", "/certs/ca.crt")
SECRET = os.environ["MQTT_SENSOR_PASSWORD"]
CAPTEURS = [c for c in os.environ.get("IOT_CAPTEURS", "").split(",") if c]
MUETS = set(filter(None, os.environ.get("IOT_CAPTEURS_MUETS", "").split(",")))
PERIODE = float(os.environ.get("IOT_PERIODE_S", "21600"))
# décalages initiaux injectés, ex. "iot-cap-002:-6" (bac presque vide alors que le stock comptable ne l'est pas)
ECARTS = dict((k, int(v)) for k, v in (e.split(":") for e in os.environ.get("IOT_ECARTS_INITIAUX", "iot-cap-002:-6").split(",") if e))
P_BRUIT, P_DERIVE, P_ABERRANT = 0.03, 0.01, 0.01
rng = random.Random(int(os.environ.get("IOT_SEED", "7")))


def mot_de_passe(code: str) -> str:
    return hashlib.sha256(f"{SECRET}:{code}".encode()).hexdigest()[:32]


class Capteur:
    def __init__(self, code: str):
        self.code = code
        self.consigne: int | None = None
        self.decalage = ECARTS.get(code, 0)
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"sim-{code}")
        self.client.username_pw_set(code, mot_de_passe(code))
        self.client.tls_set(ca_certs=CA, tls_version=ssl.PROTOCOL_TLS_CLIENT)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message

    def on_connect(self, client, _userdata, _flags, reason, _props):
        if reason.is_failure:
            log.error("%s : connexion refusée (%s)", self.code, reason)
            return
        client.subscribe(f"reparu/capteurs/{self.code}/consigne", qos=1)

    def on_message(self, _client, _userdata, msg):
        try:
            nouvelle = int(json.loads(msg.payload)["stock"])
        except (ValueError, KeyError, TypeError):
            return
        if self.consigne is not None and nouvelle != self.consigne:
            self.decalage = 0  # mouvement de stock ou correction : le bac et le comptable se réalignent
        self.consigne = nouvelle

    def mesurer(self) -> int | None:
        if self.consigne is None:
            return None
        if rng.random() < P_DERIVE:
            self.decalage -= rng.randint(1, 3)
            log.info("%s : dérive injectée (décalage %d)", self.code, self.decalage)
        niveau = max(0, self.consigne + self.decalage)
        if rng.random() < P_ABERRANT:
            log.info("%s : valeur aberrante injectée", self.code)
            return 999
        if rng.random() < P_BRUIT:
            niveau = max(0, niveau + rng.choice([-1, 1]))
        return niveau

    def publier(self) -> None:
        niveau = self.mesurer()
        if niveau is None:
            return
        charge = json.dumps({"device": self.code, "niveau": niveau, "ts": datetime.now().isoformat(timespec="seconds"),
                             "batterie": rng.randint(62, 100)})
        self.client.publish(f"reparu/capteurs/{self.code}/lecture", charge, qos=1)
        log.info("%s -> niveau %d (consigne %s)", self.code, niveau, self.consigne)


def main() -> None:
    actifs = [Capteur(c) for c in CAPTEURS if c not in MUETS]
    log.info("%d capteurs simulés, %d muet(s) (%s), période %.0f s", len(actifs), len(MUETS), ", ".join(sorted(MUETS)) or "aucun", PERIODE)
    for cap in actifs:
        while True:
            try:
                cap.client.connect(HOTE, PORT, keepalive=60)
                break
            except OSError as exc:
                log.warning("%s : broker indisponible (%s), nouvel essai dans 5 s", cap.code, exc)
                time.sleep(5)
        cap.client.loop_start()
    time.sleep(5)  # laisse arriver les consignes retenues
    stop = threading.Event()
    while not stop.is_set():
        for cap in actifs:
            cap.publier()
        stop.wait(PERIODE)


if __name__ == "__main__":
    main()
