#!/usr/bin/env bash
# Restaure une sauvegarde chiffrée créée par backup-db.sh.
#
# Usage : BACKUP_PASSPHRASE=... backend/scripts/restore-db.sh fichier.archive.gz.gpg [URI_cible]
#   URI_cible par défaut : mongodb://127.0.0.1:27017 (base locale).
#   Par sécurité, une base distante (Atlas, mongodb.net…) est refusée sans --allow-remote :
#   la restauration remplace (--drop) les collections existantes.
set -euo pipefail

file="${1:?fichier de sauvegarde manquant}"
target="${2:-mongodb://127.0.0.1:27017}"
allow_remote="${3:-}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE manquant}"

case "$target" in
  *127.0.0.1*|*localhost*) ;;
  *)
    if [ "$allow_remote" != "--allow-remote" ]; then
      echo "Cible distante refusée ($target). Ajoute --allow-remote en 3e argument si c'est voulu." >&2
      exit 1
    fi
    ;;
esac

gpg --batch --quiet --decrypt --passphrase-fd 3 "$file" 3<<<"$BACKUP_PASSPHRASE" \
  | mongorestore --uri="$target" --archive --gzip --drop --quiet
echo "Restauration terminée vers $target"
