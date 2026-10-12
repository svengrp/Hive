#!/usr/bin/env bash
# Sauvegarde chiffrée de la base Hive : mongodump (archive gzip) puis chiffrement AES-256 (gpg).
# Le dépôt est public : la sauvegarde ne doit JAMAIS exister en clair hors de ce script.
#
# Usage : MONGO_URI=... BACKUP_PASSPHRASE=... backend/scripts/backup-db.sh [dossier_de_sortie]
# Sortie : hive-AAAA-MM-JJ-HHMM.archive.gz.gpg
set -euo pipefail

: "${MONGO_URI:?MONGO_URI manquant}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE manquant}"

out_dir="${1:-.}"
mkdir -p "$out_dir"
file="$out_dir/hive-$(date -u +%Y-%m-%d-%H%M).archive.gz.gpg"

# Le dump passe directement dans gpg : rien n'est écrit en clair sur le disque
mongodump --uri="$MONGO_URI" --archive --gzip --quiet \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase-fd 3 --output "$file" 3<<<"$BACKUP_PASSPHRASE"

# Une sauvegarde vide ou minuscule signale un problème (mauvaise base, accès refusé…)
size=$(wc -c < "$file" | tr -d ' ')
if [ "$size" -lt 1024 ]; then
  echo "Sauvegarde suspecte : $size octets" >&2
  exit 1
fi
echo "Sauvegarde chiffrée : $file ($size octets)"
