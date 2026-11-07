#!/usr/bin/env bash
# Sauvegarde logique de la base Repar U (mysqldump cohérent, compressé), rotation sur 14 jours.
# Usage : scripts/sauvegarde-mysql.sh            (à planifier, ex. cron quotidien à 2 h)
#         RETENTION_JOURS=30 scripts/sauvegarde-mysql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
DEST="${BACKUP_DIR:-backups}"
RETENTION_JOURS="${RETENTION_JOURS:-14}"
mkdir -p "$DEST"
chmod 700 "$DEST"
FICHIER="$DEST/reparu-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" db \
  mysqldump -u root --single-transaction --routines --triggers --set-gtid-purged=OFF --databases "$MYSQL_DATABASE" \
  | gzip -9 > "$FICHIER"
chmod 600 "$FICHIER"
gzip -t "$FICHIER"
echo "Sauvegarde : $FICHIER ($(du -h "$FICHIER" | cut -f1))"
find "$DEST" -name 'reparu-*.sql.gz' -mtime +"$RETENTION_JOURS" -print -delete | sed 's/^/Supprimée (rotation) : /'
