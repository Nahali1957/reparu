#!/bin/sh
# Prépare le broker au démarrage : certificats TLS auto-signés (une seule fois),
# un compte par capteur et un compte backend, ACL par topic.
set -eu
CERTS=/mosquitto/certs
AUTH=/mosquitto/auth
mkdir -p "$CERTS" "$AUTH"

if [ ! -f "$CERTS/ca.crt" ]; then
  echo "[reparu-mqtt] génération de l'autorité de certification et du certificat serveur"
  openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -subj "/CN=Repar U MQTT CA" \
    -keyout "$CERTS/ca.key" -out "$CERTS/ca.crt" 2>/dev/null
  openssl req -newkey rsa:2048 -nodes -subj "/CN=mqtt" -keyout "$CERTS/server.key" -out "$CERTS/server.csr" 2>/dev/null
  printf "subjectAltName=DNS:mqtt,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n" > "$CERTS/ext.cnf"
  openssl x509 -req -in "$CERTS/server.csr" -CA "$CERTS/ca.crt" -CAkey "$CERTS/ca.key" -CAcreateserial \
    -days 825 -extfile "$CERTS/ext.cnf" -out "$CERTS/server.crt" 2>/dev/null
  rm -f "$CERTS/server.csr" "$CERTS/ext.cnf"
  chmod 644 "$CERTS/ca.crt" "$CERTS/server.crt"
  chmod 600 "$CERTS/ca.key"
  chown mosquitto:mosquitto "$CERTS/server.key" && chmod 600 "$CERTS/server.key"
fi
# seul le certificat PUBLIC de l'autorité est partagé avec les clients (volume séparé des clés)
mkdir -p /mosquitto/ca-public && cp "$CERTS/ca.crt" /mosquitto/ca-public/ca.crt && chmod 644 /mosquitto/ca-public/ca.crt

: "${MQTT_BACKEND_PASSWORD:?MQTT_BACKEND_PASSWORD manquant}"
: "${MQTT_SENSOR_PASSWORD:?MQTT_SENSOR_PASSWORD manquant}"
: "${IOT_CAPTEURS:?IOT_CAPTEURS manquant}"

rm -f "$AUTH/passwd"
touch "$AUTH/passwd"
mosquitto_passwd -b "$AUTH/passwd" backend "$MQTT_BACKEND_PASSWORD"
{
  echo "# backend : lit toutes les lectures, publie les consignes (stock comptable)"
  echo "user backend"
  echo "topic read reparu/capteurs/+/lecture"
  echo "topic write reparu/capteurs/+/consigne"
  echo ""
  echo "# chaque capteur : publie SA lecture, lit SA consigne (%u = identifiant du compte)"
  echo "pattern write reparu/capteurs/%u/lecture"
  echo "pattern read reparu/capteurs/%u/consigne"
} > "$AUTH/acl"
for id in $(echo "$IOT_CAPTEURS" | tr ',' ' '); do
  # mot de passe propre à chaque capteur, dérivé du secret commun (même calcul dans le simulateur)
  mdp=$(printf '%s' "$MQTT_SENSOR_PASSWORD:$id" | sha256sum | cut -c1-32)
  mosquitto_passwd -b "$AUTH/passwd" "$id" "$mdp"
done
chown -R mosquitto:mosquitto "$AUTH" /mosquitto/data
chmod 600 "$AUTH/passwd" "$AUTH/acl"
echo "[reparu-mqtt] $(echo "$IOT_CAPTEURS" | tr ',' '\n' | wc -l) comptes capteurs + backend, ACL par topic"
exec "$@"
