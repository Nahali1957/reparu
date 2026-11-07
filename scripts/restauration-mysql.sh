#!/usr/bin/env bash
# Restaure une sauvegarde produite par sauvegarde-mysql.sh (écrase la base courante).
# Usage : scripts/restauration-mysql.sh backups/reparu-AAAAMMJJ-HHMMSS.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
FICHIER="${1:?chemin de la sauvegarde attendu}"
set -a; source .env; set +a
gzip -t "$FICHIER"
read -r -p "Restaurer $FICHIER dans la base « $MYSQL_DATABASE » (les données actuelles seront remplacées) ? [oui/non] " rep
[ "$rep" = "oui" ] || { echo "Annulé."; exit 1; }
gunzip -c "$FICHIER" | docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" db mysql -u root
echo "Restauration terminée. Redémarrage du backend :"
docker compose restart backend
