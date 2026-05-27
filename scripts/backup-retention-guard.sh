#!/usr/bin/env bash
# Refuse to delete old backups unless a backup from the last 24h exists.
# Run after a successful upload step in .github/workflows/backup-daily.yml.
#
# Required env vars:
#   B2_BUCKET — bucket name (rclone remote is configured as `b2:` in the workflow)
#
# Exits 0 on success (sweep performed or no sweep needed).
# Exits 1 if no recent backup exists (sweep would be unsafe).
set -euo pipefail

: "${B2_BUCKET:?B2_BUCKET must be set}"

recent=$(rclone lsf "b2:${B2_BUCKET}/" --max-age 24h | wc -l)
if [ "$recent" -lt 1 ]; then
  echo "ERROR: no backup uploaded in last 24h; refusing to sweep" >&2
  exit 1
fi

rclone delete "b2:${B2_BUCKET}/" --min-age 30d
echo "Retention sweep complete."
