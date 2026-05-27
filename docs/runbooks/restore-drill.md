# Runbook: Pre-launch restore drill

**Purpose:** Validate the daily backup pipeline end-to-end by restoring the latest
production B2 backup into a fresh Supabase project and verifying it's queryable.

**Frequency:** Once before Wave 1 launch (Jul 5, 2026) as the spec §9 hard gate.
Then quarterly thereafter.

**Owner:** A. Elangovan.

**Time budget:** First run < 60 min. Quarterly re-runs target < 30 min.

---

## Prerequisites

- The `age` private key is accessible (1Password — "BodhiLite age private key" — or paper backup).
- A Supabase account that can create projects (the instructor's account).
- `psql` or the Supabase dashboard SQL editor for the smoke queries.
- Followed `docs/runbooks/restore-from-b2.md` once before, OR willing to read it inline.

---

## Steps

### 1. Pre-flight

- [ ] Confirm B2 has a backup ≤ 24 h old:
  ```bash
  rclone lsf "b2:bodhilite-backups-prod/" | sort | tail -n 1
  ```
- [ ] Confirm the age private key opens with a test decrypt (do NOT decrypt the real backup yet):
  ```bash
  echo "test" | age -r <PUBLIC_KEY> | age --decrypt --identity age-bodhilite.key
  ```
  Expected output: `test`.
- [ ] Note the start time (for RTO measurement).

### 2. Insert a marker row into PROD audit_log

In the production Supabase SQL editor, run:

```sql
INSERT INTO audit_log (actor_user_id, action, target_kind, target_id, after)
VALUES (
  '<your-instructor-user-id>',
  'restore_drill_canary',
  'system',
  NULL,
  jsonb_build_object('canary_id', gen_random_uuid())
)
RETURNING (after->>'canary_id') AS canary_id;
```

Copy the returned `canary_id` UUID. This is the "known row" that the restore drill verifies survived the backup → restore cycle.

### 3. Wait for the next scheduled backup OR trigger one manually

Either:

- Wait until the next 09:00 UTC scheduled run, OR
- Manually trigger via GitHub Actions → "Daily backup" → Run workflow.

Confirm the new B2 object exists with `rclone lsf` (Step 1 query, expect a newer timestamp).

### 4. Create a temp Supabase project

In supabase.com:

- New project → name: `bodhilite-restore-test-YYYYMMDD` (use today's date)
- Region: same as production (US East)
- Database password: random; store in 1Password temporarily ("BodhiLite restore drill — temp DB pwd, $(date)")
- Wait for the project to provision (~2 min).

### 5. Restore the backup into the temp project

Follow `docs/runbooks/restore-from-b2.md` steps 1–4 with:

- `TS` = the timestamp of the backup uploaded in Step 3.
- `TARGET_URL` = the temp project's postgres URI (Project Settings → Database → Connection string).

Expected: `pg_restore` completes with N warnings (ownership/ACL skips are normal) and no errors.

### 6. Smoke SQL verification

In the temp project's SQL editor:

```sql
SELECT 'users' AS table, count(*) FROM users
UNION ALL SELECT 'assessments', count(*) FROM assessments
UNION ALL SELECT 'questions',   count(*) FROM questions
UNION ALL SELECT 'attempts',    count(*) FROM attempts
UNION ALL SELECT 'answers',     count(*) FROM answers
UNION ALL SELECT 'audit_log',   count(*) FROM audit_log;
```

- [ ] Counts roughly match the production DB (within ±5 since some rows may have been added between dump and now).

### 7. Known-row assertion

In the temp project, query for the canary UUID from Step 2:

```sql
SELECT count(*) FROM audit_log
WHERE action = 'restore_drill_canary'
  AND after->>'canary_id' = '<paste-canary-uuid-here>';
```

- [ ] Result: **exactly 1**. If 0, the restore is incomplete — STOP and escalate.

### 8. Write the drill evidence row to PRODUCTION audit_log

Back in the production Supabase SQL editor:

```sql
INSERT INTO audit_log (actor_user_id, action, target_kind, target_id, after)
VALUES (
  '<your-instructor-user-id>',
  'restore_drill',
  'system',
  NULL,
  jsonb_build_object(
    'drill_id', gen_random_uuid(),
    'completed_at', now(),
    'restored_dump_timestamp', '<the TS used in Step 5>',
    'temp_project_name', 'bodhilite-restore-test-YYYYMMDD',
    'rto_minutes', <end_time - start_time>,
    'ok', true
  )
);
```

### 9. Tear down

- [ ] In supabase.com: delete the temp project.
- [ ] In 1Password: archive the temp DB password note (or delete).
- [ ] Securely delete local copies of the decrypted dump + age private key:
  ```bash
  shred -u restore-*/dump.pgc restore-*/dump.pgc.age age-bodhilite.key 2>/dev/null || true
  rm -rf restore-*
  ```

### 10. Document deviations

If any step required deviation from this runbook (unclear instructions, unexpected
errors, etc.), fix the runbook inline and commit the improvement. Treat each
deviation as a runbook bug.

---

## Failure modes

| Symptom                                          | Action                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Latest B2 backup is corrupted (decrypt fails)    | Try the next-most-recent. If 3 in a row fail, ESCALATE before Wave 1 launch.                        |
| Temp Supabase project hits free-tier quota       | Use the paid scratch project for this drill ($0.25 prorated).                                       |
| RTO exceeds 30 min on first run                  | Document as a finding; not a launch blocker for Wave 1.                                             |
| `pg_restore` errors on schema-mismatch (large N) | Schema drift between prod and dump. Investigate before launch.                                      |
| Known-row assertion returns 0                    | Restore is incomplete OR canary row was inserted AFTER backup. Re-check timing in Step 2 vs Step 3. |
