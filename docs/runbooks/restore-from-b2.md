# Runbook: Restore from a B2 backup

**Purpose:** Decrypt a B2-stored pg_dump and restore it into a Postgres database.
Called by the restore-drill runbook and used during real incidents.

## Prerequisites

- `age` installed locally (≥ 1.1)
- `rclone` installed locally and configured with the same B2 application key used by
  the GH Actions workflow (or the production application key from 1Password).
  Config at `~/.config/rclone/rclone.conf`:
  ```
  [b2]
  type = b2
  account = <B2_ACCOUNT_ID>
  key = <B2_APPLICATION_KEY>
  ```
- `pg_restore` (`postgresql-client` package) installed.
- The `age` PRIVATE key from 1Password ("BodhiLite — age private key"). Save it to
  a file `age-bodhilite.key` in a secure temp location. **Never commit this file.**

## Steps

1. **List recent backups:**

   ```bash
   rclone lsf "b2:bodhilite-backups-prod/" | sort | tail -n 5
   ```

   Pick the most recent timestamp directory (or a specific older one if doing a
   point-in-time restore).

2. **Download the encrypted dump:**

   ```bash
   TS="2026-07-06T09-00-12Z"   # replace with the chosen timestamp
   rclone copy "b2:bodhilite-backups-prod/${TS}/dump.pgc.age" "./restore-${TS}/"
   ```

3. **Decrypt with age:**

   ```bash
   age --decrypt --identity age-bodhilite.key \
     -o "./restore-${TS}/dump.pgc" \
     "./restore-${TS}/dump.pgc.age"
   ```

4. **Restore into a target Postgres:**

   ```bash
   TARGET_URL="postgresql://postgres:<password>@db.<target>.supabase.co:5432/postgres"
   pg_restore --verbose --no-owner --no-acl \
     --dbname="${TARGET_URL}" \
     "./restore-${TS}/dump.pgc"
   ```

   - `--no-owner --no-acl` skip ownership commands that fail against managed Postgres.
   - `--verbose` shows progress for ~thousands of objects.

5. **Verify with smoke SQL:**

   ```sql
   SELECT 'users' AS table, count(*) FROM users
   UNION ALL SELECT 'assessments', count(*) FROM assessments
   UNION ALL SELECT 'attempts',    count(*) FROM attempts
   UNION ALL SELECT 'answers',     count(*) FROM answers
   UNION ALL SELECT 'audit_log',   count(*) FROM audit_log;
   ```

6. **Securely delete local copies:**
   ```bash
   shred -u "./restore-${TS}/"*.pgc "./restore-${TS}/"*.pgc.age age-bodhilite.key
   ```

## Troubleshooting

- **`age: error: no identity matched any of the recipients`** — the private key is
  not the one paired with the public key used at encryption time. Verify you're
  using the production keypair from 1Password, not a different keypair.
- **`pg_restore: error: connection failed`** — confirm the target DB allows
  connections from your IP (Supabase Project Settings → Database → Connection
  pooling / Allowed IPs).
- **`pg_restore: warning: errors ignored on restore: N`** — N small means
  expected ownership/ACL skips (we use `--no-owner --no-acl`). N large means
  schema mismatch — escalate.
