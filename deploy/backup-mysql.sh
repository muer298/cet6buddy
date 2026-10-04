#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/var/backups/cet6-buddy
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
mysqldump --defaults-extra-file=/etc/cet6-buddy/mysql.cnf --single-transaction --routines --triggers cet6_buddy | gzip -9 > "$BACKUP_DIR/cet6_buddy-$STAMP.sql.gz"
find "$BACKUP_DIR" -type f -name 'cet6_buddy-*.sql.gz' -mtime +30 -delete
