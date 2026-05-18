@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Read first:** the auto-memory at `~/.claude/projects/C--Users-easam-Documents-ClaudeProjects-Bodhi-Lite/memory/` is loaded into every session via `MEMORY.md`. It contains the current project-state (which Wave we're on, what's shipped, what's next) and a list of non-obvious technical gotchas discovered during Plan 1 execution (Next 16 quirks, shadcn `radix-nova` style, Supabase CLI, RLS recursion pattern, etc.). **Don't re-discover those.** This file describes the codebase shape — auto-memory describes the project history.

## What this is

BodhiLite Phase 1 — a standalone quiz tool that runs alongside Canvas during the 2026 Pierce College CHEM 139 Summer Session. The keystone differentiator is **parameterized chem/math assessments with WYSIWYG render fidelity**. Phase 2 (Fall 2026) is the full LMS. The design spec is the source of truth for product/architectural decisions:

- Spec: `docs/superpowers/specs/2026-05-16-bodhilite-phase1-design.md`
- Phase-1 Wave plans: `docs/superpowers/plans/`

## Commands

```bash
npm run dev            # Next dev server (port 3000)
npm run build          # Production build
npm run lint           # eslint . (NOT `next lint` — removed in Next 16)
npm run typecheck      # tsc --noEmit
npm run format:check   # Prettier check  ;  npm run format to write
npm test               # Vitest (unit) — single run
npm run test:watch     # Vitest watch
npm run e2e            # Playwright — auth + a11y + RLS suites
npm run e2e:ui         # Playwright UI mode
npm run db:types       # Regenerate lib/types/database.ts from local Supabase
```

Run a single Vitest file: `npx vitest run lib/utils.test.ts`
Run a single Playwright spec: `npx playwright test tests/rls/students-isolation.spec.ts`
Run Playwright against an already-running server: set `PLAYWRIGHT_BASE_URL=http://localhost:3000` (skips the auto-`npm run dev` from `playwright.config.ts`).

**E2E and RLS tests require the local Supabase stack running** (`npx --yes supabase start`) **and all four env vars** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`) exported. The README's "Local development" section has the one-shot setup.

**The Supabase CLI is invoked as `npx --yes supabase ...` everywhere** — it is not npm-installable globally (see auto-memory `tech-gotchas` for why).

## Architecture

### Auth client trio (`lib/supabase/`)

Three Supabase client factories, one per execution context — **do not mix them**:

- `client.ts` → `createBrowserSupabaseClient()` for Client Components.
- `server.ts` → `createServerSupabaseClient()` for Server Components, Server Actions, Route Handlers. Reads/writes auth cookies via `next/headers`; setAll swallows errors in read-only RSC contexts because middleware does the refresh.
- `middleware.ts` → `refreshSession()` is called from the root `middleware.ts` on every non-static request (matcher excludes `_next/static`, images, favicon). This is what keeps sessions alive.

All three are typed against `lib/types/database.ts`, regenerated from the live Supabase schema via `npm run db:types`.

### Auth flow

Magic-link only. `app/(auth)/sign-in/page.tsx` posts to the `sendMagicLinkAction` Server Action, which calls `signInWithOtp` with `emailRedirectTo` = `${NEXT_PUBLIC_SITE_URL}/callback`. The user clicks the email link → lands on `app/(auth)/callback/route.ts` → `exchangeCodeForSession(code)` → redirect to `/`. The home page (`app/page.tsx`) redirects unauthenticated users back to `/sign-in`.

`typedRoutes: true` is enabled in `next.config.ts`, so any `redirect()` to a parameterized URL needs `as Route`. `NextResponse.redirect()` accepts plain strings.

### Database (`supabase/migrations/`)

9 tables driving the assessment domain: `users`, `assessments`, `questions`, `question_variables`, `attempts`, `answers`, `assessment_overrides`, `media`, `audit_log`. Twelve migrations (`0001`–`0012`); the last two patch RLS recursion bugs (see below). Apply with `npx --yes supabase db reset --local`.

Two invariants are enforced **at the DB trigger layer (not RLS)** because they must hold even for the service role:

- **Snapshot immutability** — `answers.rendered_question_snapshot` is write-once. Once set, any `UPDATE` that changes it raises `rendered_question_snapshot is immutable once set` (trigger in `0006_answers.sql`). This is the foundation for grading integrity: the snapshot captured at first view is the source of truth.
- **Audit-log append-only** — `audit_log` rejects all `UPDATE` and `DELETE` via trigger (`0009_audit_log.sql`). Insert is the only legal operation.

### RLS recursion pattern — critical to know before adding policies

**Any RLS policy that exists-checks another RLS-protected table will infinite-loop** when evaluated as a non-admin user. The fix is a `SECURITY DEFINER` helper function that bypasses RLS to do the cross-table check. See `0011_fix_rls_recursion.sql` and `0012_fix_answers_rls_recursion.sql` for the canonical pattern (functions `student_has_attempt`, `instructor_owns_assessment`, `instructor_owns_attempt_assessment`). When writing a new policy that joins another RLS table, follow that pattern from the start. The bug only surfaces under a real user session — admin queries and `db reset` won't catch it; the RLS suite in `tests/rls/` will.

### Tests

- `tests/auth/` — Playwright E2E of the sign-in flow.
- `tests/a11y/` — axe-core WCAG 2.2 AA checks (one per route shipped to students; required before each Wave).
- `tests/rls/` — DB-level RLS coverage, including the cross-user isolation matrix, snapshot-immutability trigger, and audit-log-append-only trigger. These tests use the service role to seed and to mint authenticated user tokens (`tests/helpers/auth.ts`).
- `lib/**/*.test.ts`, `components/**/*.test.tsx` — Vitest unit tests (jsdom). Playwright's `testIgnore` excludes `**/*.unit.test.ts`, but the actual convention in this repo is `*.test.ts(x)` for Vitest and `*.spec.ts` for Playwright — keep it that way.

### CI

`.github/workflows/ci.yml` runs lint + typecheck + format-check + vitest with coverage on every PR. `.github/workflows/e2e.yml` boots the Supabase stack, applies migrations, builds, and runs Playwright. Both workflows trigger on `push: branches: [main, master]` and `pull_request` — **pushes to feature branches do NOT fire CI directly**, so open a draft PR early to get CI coverage while iterating.

### Deploy

Vercel, US-East (`iad1`), configured via `vercel.ts` (typed config — not `vercel.json`). Security headers (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`) and `poweredByHeader: false` are FERPA-driven, not cosmetic — don't relax them without a reason. The README "First production deploy" section has the one-time Supabase-link + env-var setup.

## Conventions

- **TypeScript is strict-plus**: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`. The last one means you cannot pass `undefined` to a non-optional-undefined property — use spread for conditional config (see `playwright.config.ts`'s `...(condition ? {} : { webServer: { ... } })` pattern).
- **`@/*` path alias** points at the repo root (see `tsconfig.json` paths and `vitest.config.ts` resolve).
- **shadcn style is `radix-nova`** (Radix primitives + Nova preset) — see `components.json`. Don't run `shadcn init` again; new components added with `npx shadcn add <name>` will inherit this style.
- **`docs/` is currently Prettier-formatted.** `npm run format` will reformat spec/plan markdown. If that's noisy, add `docs/` to `.prettierignore` — currently not excluded.
- **Migration filenames are zero-padded sequential** (`0001_…sql` … `0012_…sql`). Never edit a shipped migration; add a new numbered one.
- **Before shipping each Wave to students**, run `docs/runbooks/nvda-test-script.md` manually. axe-core in CI catches static a11y violations; NVDA catches the dynamic ones.

## Workflow notes

- The auto-memory `collaboration-notes` captures user-preferred review/scope behavior — read it before deciding how heavy a plan to write.
- New work belongs on a `wave-N-…` branch off `main`, with a PR opened immediately for CI coverage.
- When implementing a phased Wave plan, follow the plan document in `docs/superpowers/plans/` task-by-task with atomic commits; the spec is locked, the plan is the execution contract.
