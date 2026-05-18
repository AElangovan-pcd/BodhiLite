# BodhiLite

A learner- and faculty-friendly Learning Management System.

**Phase 1 (Summer Quiz Tool)** — a standalone quiz tool that runs alongside Canvas during the 2026 Pierce College Summer Session A course (Jul 6 – Aug 27). Designed to prove the keystone differentiator (chem/math parameterized assessments with WYSIWYG render fidelity) on real students before the rest of the LMS is built.

**Phase 2** — Fall 2026 full Lean v1 LMS.

Design spec: [`docs/superpowers/specs/2026-05-16-bodhilite-phase1-design.md`](docs/superpowers/specs/2026-05-16-bodhilite-phase1-design.md)

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Boot the local Supabase stack (Postgres + Auth + Storage + Studio)
#    Requires Docker Desktop running. First start pulls ~13 images (~10 min).
npx --yes supabase start

# 3. Apply migrations + seed
npx --yes supabase db reset

# 4. Capture the local Supabase keys and write them to .env.local
SB_STATUS=$(npx --yes supabase status --output json)
cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=$(echo "$SB_STATUS" | grep -oP '"ANON_KEY":\s*"\K[^"]+')
SUPABASE_SERVICE_ROLE_KEY=$(echo "$SB_STATUS" | grep -oP '"SERVICE_ROLE_KEY":\s*"\K[^"]+')
NEXT_PUBLIC_SITE_URL=http://localhost:3000
EOF

# 5. Run the dev server
npm run dev
```

Visit `http://localhost:3000` — you'll be redirected to `/sign-in`.

## Testing

```bash
npm run lint            # Next/ESLint check
npm run typecheck       # tsc --noEmit
npm run format:check    # Prettier
npm test                # Vitest unit tests
npm run e2e             # Playwright E2E + a11y + RLS suites
```

E2E tests need the local Supabase running and the env vars above exported (the test helper reads them).

## First production deploy (manual user actions)

This is a one-time setup. Subsequent deploys happen automatically on push to `main`.

### 1. Supabase project (production)

- Sign in to https://supabase.com → create a new project (e.g. `bodhilite-prod`).
- Region: **US East** (matches the Vercel deploy region).
- After provisioning, go to Settings → API and copy:
  - `URL`
  - `anon` public key
  - `service_role` secret key
- In Settings → Database, **enable point-in-time recovery** (PITR) for 7-day retention.

### 2. Apply migrations to the hosted Supabase

```bash
npx --yes supabase login                                # one-time, opens browser
npx --yes supabase link --project-ref <your-project-ref>
npx --yes supabase db push                              # applies all migrations from supabase/migrations/
```

### 3. Vercel (production)

- Sign in to https://vercel.com and import this GitHub repo (`AElangovan-pcd/BodhiLite`).
- Settings → Environment Variables (set for both Production and Preview):
  - `NEXT_PUBLIC_SUPABASE_URL` = your project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon key
  - `SUPABASE_SERVICE_ROLE_KEY` = the service-role key (mark **Sensitive**)
  - `NEXT_PUBLIC_SITE_URL` = `https://<your-vercel-prod-domain>`
- Trigger a deploy (push to `main`, or click Redeploy).

### 4. Supabase auth callback whitelisting

- Supabase dashboard → Authentication → URL Configuration:
  - **Site URL:** `https://<your-vercel-prod-domain>`
  - **Redirect URLs:** add `https://<your-vercel-prod-domain>/callback`

### 5. Smoke test

- Visit `https://<your-vercel-prod-domain>`.
- You're redirected to `/sign-in`.
- Enter your real email; click "Send magic link".
- Check your inbox; click the link.
- You land on the home page; "Signed in as &lt;your email&gt;" is shown.
- Click "Sign out" — redirected back to `/sign-in`.

If all five steps pass, **Wave 1 Foundation is complete.** Proceed to Plan 2 (Authoring).

## Manual accessibility verification

Before each Wave ships to students, run the NVDA test script at [`docs/runbooks/nvda-test-script.md`](docs/runbooks/nvda-test-script.md).

## Repository layout

```
app/                 Next.js 16 App Router
  (auth)/            magic-link sign-in/callback/sign-out
  page.tsx           home (redirects by auth state)
components/ui/       shadcn/ui primitives (Radix-based)
lib/
  supabase/          browser/server/middleware client factories
  types/database.ts  generated from `supabase gen types`
  utils.ts           cn() helper
supabase/
  config.toml        local CLI config
  migrations/        SQL migrations (0001-0012)
tests/
  auth/              Playwright E2E (sign-in flow)
  a11y/              axe-core WCAG 2.2 AA checks
  rls/               cross-user / immutability / append-only DB tests
  helpers/           shared test utilities
docs/
  superpowers/specs/ design spec
  superpowers/plans/ implementation plans
  runbooks/          NVDA test script, etc.
```

## License

TBD.
