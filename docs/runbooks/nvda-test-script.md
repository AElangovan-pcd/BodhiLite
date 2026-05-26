# NVDA Manual Test — Critical Paths (Wave 1)

Run this before every Wave launches to production. Estimated time: ~30 min for Wave 1 surface area; grows as Wave 2-4 add features.

## Setup

- Windows machine
- NVDA 2024.x or later installed (free: https://www.nvaccess.org/)
- Latest Chrome
- A confirmed test instructor account + a confirmed test student account on the production Supabase project

## Test 1: Sign-in flow (student)

1. Start NVDA. Open Chrome. Navigate to `https://<your-vercel-prod-url>/sign-in`.
2. **Expected announcement:** page title "BodhiLite", heading "Sign in".
3. Tab through the form. Expected order: Email field → Send magic link button.
4. NVDA announces "Email, edit, required, autocomplete email" for the email field.
5. Type the test email. Tab to button. Press Enter.
6. After submit: success banner "Magic link sent. Check your email." is announced by NVDA (uses `role="status"`).
7. Open the magic-link email, click the link. The callback redirects to the home page.
8. NVDA announces the heading "BodhiLite" and the signed-in-as message.

**Pass criteria:** every step's expected announcement actually happens, no silent regions.

## Test 2: Sign-out flow

1. From the home page, Tab to the "Sign out" button (no keyboard trap reaching it).
2. Press Enter. Page redirects to `/sign-in`.
3. NVDA announces the sign-in heading.

**Pass criteria:** above happens with keyboard only, no mouse.

## Test 3: Zoom to 200% (WCAG 1.4.4)

1. On `/sign-in`, press `Ctrl` + `+` repeatedly to zoom to 200%.
2. Form remains usable; no content cut off, no horizontal scroll on standard desktop width.

## Test 4: Prefers-reduced-motion (WCAG 2.3.3)

1. Enable "Reduce motion" in Windows accessibility settings.
2. Reload `/sign-in`. Any animations should be absent or instantaneous.

## Test 5: Error banner (sign-in)

1. Visit `/sign-in?error=Test%20error%20message`.
2. NVDA should announce the error banner immediately (it uses `role="alert"`).
3. Banner text should be readable; contrast ≥ 4.5:1.

## Result recording

After running, record results in `docs/runbooks/nvda-results/YYYY-MM-DD.md`:

- Tester name
- Date
- Browser version + NVDA version
- Pass/fail per test
- Any new issues discovered (with screenshots if applicable)

## Expanding for later Waves

When Wave 2-4 ship, add tests here for:

- Wave 2 (chem exact-match): drawing a structure with keyboard alternatives (or the `typed-smiles` accommodation path)
- Wave 3 (exam mode): countdown announcement at 5-min / 1-min remaining; timer is not annoying (no continuous polite-region updates)
- Wave 4 (chem rich modes): structure-tree navigation via screen reader; substructure-match feedback

Each Wave's NVDA pass is a hard gate before that Wave's launch.

## Plan 2 — Authoring critical path (added 2026-05-25)

Before merging Plan 2 to `main`, run this script with NVDA on Windows. Target time: ~20 minutes. If any step fails, fix in code (not the runbook) and re-run.

1. **Sign in as the instructor.** Magic link → land on home. NVDA announces "BodhiLite" heading + "Signed in as <email>" + "Go to your assessments →" link.
2. **Open the assessments list.** Tab to the link, Enter. NVDA reads the page heading "Assessments" + "+ New assessment" button.
3. **Create an assessment.** Activate "+ New assessment". Tab through title, slug, type, time-limit. Every input must announce its label. Submit. NVDA announces navigation to the new assessment's overview page.
4. **Edit settings.** Tab into the Settings form. Change the title. Tab to "Save settings". Confirm a screen-reader-perceivable confirmation (page re-renders with updated title).
5. **Add a question.** Activate "+ Add question". NVDA reads "New question" heading + 6 cards. Tab through; activate "Numeric (with tolerance)".
6. **Author the question.** In the editor, type a stem with a variable token (`{{m}}`). Tab to the variables section, activate "+ Add variable", set name to `m`, type to `randint`, expand "Configure", set min=10 / max=100. Tab to the formula field, type `m / 58.44`. Tab to tolerance, type 0.01.
7. **Verify preview is keyboard-accessible.** Use Tab/Shift+Tab to navigate to the preview pane's seed switcher. Activate it (Enter), pick "Test student 2" with arrow keys + Enter. Confirm the materialized values in the Reveal panel change.
8. **Save.** Tab to "Save", activate. No errors. Reload the page; the values persist.
9. **Reorder.** Back on the assessment overview, use Tab to reach the ↑ / ↓ buttons. Confirm the order changes and that the "disabled" state on the topmost ↑ / bottom-most ↓ is announced.
10. **Delete.** Activate the × button on a question. Confirm the question is removed and other positions compact.

**Pass criteria:** every interactive element is reachable and labeled; no NVDA "unlabeled button"/"unlabeled edit field" announcements; the preview pane and form remain readable when zoomed to 200%.

## Plan 3 — Student attempt + result + gradebook critical path (added 2026-05-26)

**Setup:** local Supabase up; seed one published assessment with 3 questions (one mc, one numeric, one tf). Seed a student account.

**Steps (with NVDA running, Firefox or Chrome):**

1. Navigate to `/sign-in`. Tab into the email field — NVDA reads "Email, edit text". Enter the student email; submit. Navigate to the magic-link in the mock inbox; land on `/`.
2. On `/`: tab to "Your assessments" list. Read the row → "Not yet attempted, Start link". Activate "Start" with Enter.
3. Landing on `/attempts/[aid]`: NVDA reads "Attempt 1 of 3, Saved" (the header). Heading-jump (H) skims Q1, Q2, Q3.
4. Q1 (mc): tab to radios; Up/Down arrows move between choices and read labels. Pick the correct choice.
5. Q2 (numeric): tab to the input; NVDA reads "Numeric answer, edit text". Type the right value.
6. Q3 (tf): radios; pick True or False as appropriate.
7. After each input change, the header should announce "Saving…" then "Saved 0s ago" within ~1 second. Confirm with NVDA's read-current-line (Insert+Up).
8. Activate "Submit attempt" via Tab + Enter. Dialog opens — NVDA reads "Submit attempt? This will end your attempt…". Activate "Submit".
9. Land on `/attempts/[aid]/result`. NVDA reads the score banner. Heading-jump confirms each question card has H2 "Q1", "Q2", "Q3". The "Correct answer" reveal block is read via Tab into the card region.
10. Navigate back to `/`. NVDA reads "Your assessments" with "Best: N/M" status. Activate "Retake" → starts a fresh attempt with new materialization.

**Pass criteria:**

- All form controls have non-default accessible names.
- The autosave indicator change is read by NVDA on each save.
- The submit dialog announces unanswered counts when applicable.
- Per-question correctness badges (Correct / Incorrect / Partial) are read inline with the heading.

**Run before merging Plan 3.**
