"""Client MQTT du backend (TLS + compte dédié) : consomme les lectures, publie les consignes, rapproche périodiquement."""

import json
import logging
import ssl
import threading

import paho.mqtt.client as mqtt
from pydantic import ValidationError

from app.core.config import get_settings
from app.schemas.iot import LectureIn
from app.services import iot

log = logging.getLogger("reparu.mqtt")
TOPIC_LECTURES = "reparu/capteurs/+/lecture"
INTERVALLE_S = 30


class ConsommateurMQTT:
    def __init__(self, session_factory):
        self.session_factory = session_factory
        self.stop = threading.Event()
        cfg = get_settings()
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="reparu-backend")
        self.client.username_pw_set(cfg.mqtt_user, cfg.mqtt_backend_password)
        self.client.tls_set(ca_certs=cfg.mqtt_ca, tls_version=ssl.PROTOCOL_TLS_CLIENT)
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.thread = threading.Thread(target=self._boucle, name="iot-rapprochement", daemon=True)

    def demarrer(self) -> None:
        cfg = get_settings()
        self.client.connect_async(cfg.mqtt_host, cfg.mqtt_port, keepalive=60)
        self.client.loop_start()
        self.thread.start()
        log.warning("MQTT : connexion TLS à %s:%s en tant que %s", cfg.mqtt_host, cfg.mqtt_port, cfg.mqtt_user)

    def arreter(self) -> None:
        self.stop.set()
        self.client.loop_stop()
        self.client.disconnect()

    def _on_connect(self, client, _userdata, _flags, reason, _props):
        if reason.is_failure:
            log.error("MQTT : connexion refusée (%s)", reason)
            return
        client.subscribe(TOPIC_LECTURES, qos=1)
        self._publier_consignes()

    def _on_message(self, _client, _userdata, msg):
        code = msg.topic.split("/")[2]
        try:
            data = LectureIn.model_validate(json.loads(msg.payload))
            with self.session_factory() as db:
                iot.enregistrer_lecture(db, code, data)
        except (ValueError, ValidationError) as exc:  # json invalide, identité incohérente, capteur inconnu
            log.warning("MQTT : lecture rejetée sur %s : %s", msg.topic, exc)

    def _publier_consignes(self) -> None:
        with self.session_factory() as db:
            for code, stock in iot.consignes(db).items():
                self.client.publish(f"reparu/capteurs/{code}/consigne", json.dumps({"stock": stock}), qos=1, retain=True)

    def _boucle(self) -> None:
        while not self.stop.wait(INTERVALLE_S):
            try:
                if self.client.is_connected():
                    self._publier_consignes()
                with self.session_factory() as db:
                    iot.rapprocher(db)
            except Exception:  # la boucle de fond ne doit jamais mourir
                log.exception("MQTT : erreur pendant le rapprochement périodique")
