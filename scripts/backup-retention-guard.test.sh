#!/usr/bin/env bash
# Test: backup-retention-guard.sh refuses to sweep when no recent backup exists.
#
# Uses a stub `rclone` on PATH that returns canned output.
# Requires bash 4+; no other dependencies.
set -euo pipefail

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Test 1: no recent backups → script exits 1
cat > "$TMP/rclone" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  lsf) ;;  # empty output: zero lines
  delete) echo "should not run"; exit 99 ;;
esac
STUB
chmod +x "$TMP/rclone"

if PATH="$TMP:$PATH" B2_BUCKET=test bash scripts/backup-retention-guard.sh 2>/dev/null; then
  echo "FAIL: expected exit 1 when no recent backup, got 0"
  exit 1
fi
echo "OK: refuses to sweep with no recent backup"

# Test 2: at least one recent backup → script exits 0 and calls rclone delete
cat > "$TMP/rclone" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  lsf) echo "2026-07-06T09-00-00Z/dump.pgc.age" ;;
  delete) echo "rclone-delete-called" ;;
esac
STUB
chmod +x "$TMP/rclone"

out="$(PATH="$TMP:$PATH" B2_BUCKET=test bash scripts/backup-retention-guard.sh 2>&1)"
echo "$out" | grep -q "rclone-delete-called" || {
  echo "FAIL: rclone delete was not invoked"
  echo "Output was: $out"
  exit 1
}
echo "OK: sweeps when recent backup exists"

echo "All retention-guard tests passed."
