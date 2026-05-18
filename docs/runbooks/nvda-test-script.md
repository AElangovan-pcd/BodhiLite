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
