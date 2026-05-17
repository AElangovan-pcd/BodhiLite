# BodhiLite Wave 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a deployable Next.js 16 app shell with Supabase magic-link auth, a complete Postgres data model under bulletproof RLS, and WCAG CI infrastructure — the foundation every subsequent BodhiLite Wave 1 plan builds on.

**Architecture:** Single Next.js 16 App Router project at the repo root, deployed to Vercel (Fluid Compute). Supabase manages Postgres + Auth + Storage in US-East. RLS policies enforce FERPA at the database layer; coverage is verified by a Playwright test suite that authenticates as two different students and asserts cross-user data invisibility. All UI surfaces shipped here are smoke-tested with `@axe-core/playwright` in CI.

**Tech Stack:** Next.js 16 (App Router, Server Actions, Node 24 LTS), TypeScript (strict), Tailwind CSS, shadcn/ui (Radix), Supabase Postgres + Auth + Storage, `@supabase/ssr`, Vitest (unit), Playwright (E2E + a11y + RLS), `@axe-core/playwright`, GitHub Actions CI, Vercel deploy.

**Status when done:** A signed-in user lands on a stub home page. RLS-tested data model is in place but no LMS surfaces are built yet — those are Plans 2-4. The restore-drill, gradebook, and quiz features are NOT in this plan.

**Spec:** `docs/superpowers/specs/2026-05-16-bodhilite-phase1-design.md`

---

## File structure produced by this plan

```
/                                            (repo root)
  package.json, tsconfig.json, next.config.ts, vercel.ts
  tailwind.config.ts, postcss.config.mjs
  .env.local.example, .nvmrc, .prettierrc, eslint.config.mjs
  middleware.ts                              Next.js root middleware (Supabase session refresh)
  playwright.config.ts, vitest.config.ts
  app/
    layout.tsx                               root layout (font, theme provider)
    page.tsx                                 stub home (redirects by role)
    globals.css                              Tailwind base + custom design tokens
    (auth)/
      sign-in/page.tsx                       magic-link form
      callback/route.ts                      magic-link callback handler
      sign-out/route.ts                      sign-out handler
  lib/
    supabase/
      client.ts                              browser client factory
      server.ts                              server-component client factory
      middleware.ts                          session-refresh helper used by root middleware
    types/
      database.ts                            generated from `supabase gen types`
  supabase/
    config.toml                              Supabase CLI config (local dev)
    migrations/
      0001_users.sql                         users + role enum
      0002_assessments.sql                   assessments table + assessment_type enum
      0003_questions.sql                     questions table + question_type enum
      0004_question_variables.sql            variable spec storage
      0005_attempts.sql                      attempts (seed, expires_at)
      0006_answers.sql                       answers with rendered_question_snapshot
      0007_media.sql                         media with alt_text
      0008_assessment_overrides.sql          accommodations
      0009_audit_log.sql                     append-only
      0010_rls_policies.sql                  all RLS policies in one ordered file
  tests/
    helpers/
      auth.ts                                shared helper to sign in as test users
      axe.ts                                 shared axe-core assertion helper
    auth/
      sign-in.spec.ts                        Playwright: sign-in → callback → home → sign-out
    rls/
      students-isolation.spec.ts             student A cannot read student B
      snapshot-immutability.spec.ts          answers.rendered_question_snapshot is write-once
      audit-log-append-only.spec.ts          audit_log rejects UPDATE/DELETE
    a11y/
      sign-in.spec.ts                        axe-core: sign-in page
  .github/workflows/
    ci.yml                                   lint + typecheck + vitest
    e2e.yml                                  Playwright (auth + RLS + a11y) against ephemeral Supabase
  docs/
    runbooks/
      nvda-test-script.md                    manual NVDA pass for Wave 1 launch
```

---

## Prerequisites the user must have ready before Task 1

These are out-of-scope for the agent; user actions:

1. **Node.js 24 LTS installed** (`node --version` → `v24.x.x`). Use `nvm` or download from nodejs.org.
2. **GitHub repository created** at e.g. `aelangovan/bodhilite`. Local git remote pointed at it: `git remote add origin <url>`.
3. **Vercel account** with the GitHub repo connected (free hobby tier is fine for Wave 1).
4. **Supabase account** with a new project created (free tier is fine for Wave 1). Project URL and `anon` + `service_role` keys collected.
5. **Supabase CLI installed** (`brew install supabase/tap/supabase` on macOS, or scoop/npm on Windows). Verify: `supabase --version`.

---

## Task 1: Initialize Next.js 16 + TypeScript + Tailwind project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `eslint.config.mjs`

- [ ] **Step 1: Run the Next.js scaffold non-interactively**

Run from repo root:
```bash
npx create-next-app@latest . \
  --typescript --tailwind --app --no-src-dir \
  --eslint --import-alias "@/*" --use-npm \
  --turbopack --skip-install --yes
```

Expected output: project files created in current directory; no `node_modules` yet.

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: ~1-2 minutes; `node_modules/` populated; `package-lock.json` written.

- [ ] **Step 3: Verify the dev server starts**

```bash
npm run dev
```

Expected: `Local: http://localhost:3000` printed; visit it; default Next.js page renders. Stop the server with Ctrl+C.

- [ ] **Step 4: Pin Node version**

Create `.nvmrc`:
```
24
```

- [ ] **Step 5: Enable TypeScript strict mode**

Edit `tsconfig.json` so `compilerOptions` includes:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true
  }
}
```

- [ ] **Step 6: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: scaffold Next.js 16 + TypeScript strict + Tailwind"
```

---

## Task 2: Add shadcn/ui baseline

**Files:**
- Modify: `tailwind.config.ts`, `app/globals.css`
- Create: `components/ui/` (button + input + label initially), `lib/utils.ts`, `components.json`

- [ ] **Step 1: Initialize shadcn**

```bash
npx shadcn@latest init --yes --base-color neutral --no-src-dir
```

Expected: `components.json`, `lib/utils.ts`, `app/globals.css` updated with CSS variables.

- [ ] **Step 2: Install the three components we need for sign-in**

```bash
npx shadcn@latest add button input label
```

Expected: `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/label.tsx` created.

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify the dev server still serves the home page**

```bash
npm run dev
```

Visit `http://localhost:3000`. Default page should render. Stop server.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add shadcn/ui baseline (button, input, label)"
```

---

## Task 3: Configure Prettier + project ESLint rules

**Files:**
- Create: `.prettierrc`, `.prettierignore`
- Modify: `eslint.config.mjs`, `package.json` (scripts)

- [ ] **Step 1: Install Prettier + the Tailwind plugin**

```bash
npm install -D prettier prettier-plugin-tailwindcss
```

- [ ] **Step 2: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
node_modules
.next
.vercel
out
build
coverage
lib/types/database.ts
supabase/.branches
supabase/.temp
```

- [ ] **Step 4: Add scripts to `package.json`**

In `"scripts"` add:
```json
"format": "prettier --write .",
"format:check": "prettier --check .",
"lint": "next lint",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 5: Run formatter once over the repo**

```bash
npm run format
```

Expected: files reformatted; some changes shown.

- [ ] **Step 6: Verify lint + typecheck still pass**

```bash
npm run lint && npm run typecheck
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore: add Prettier with Tailwind plugin; npm scripts for lint/typecheck/format"
```

---

## Task 4: Install + configure Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts), `tsconfig.json` (types)

- [ ] **Step 1: Install Vitest and its companions**

```bash
npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['lib/**/*.test.ts', 'components/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/**', 'components/**'],
      exclude: ['lib/types/**', '**/*.test.*'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

- [ ] **Step 3: Add Vitest types to tsconfig**

Edit `tsconfig.json`, add `"vitest/globals"` to `compilerOptions.types`:
```json
{
  "compilerOptions": {
    "types": ["vitest/globals"]
  }
}
```

- [ ] **Step 4: Add `test` script to `package.json`**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Add a smoke test to confirm wiring**

Create `lib/utils.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn (className merger)', () => {
  it('joins classes', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, 'b')).toBe('a b');
  });
});
```

- [ ] **Step 6: Run the smoke test**

```bash
npm test
```

Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "test: add Vitest + jsdom; smoke test for cn() utility"
```

---

## Task 5: Install + configure Playwright

**Files:**
- Create: `playwright.config.ts`, `tests/helpers/.gitkeep`
- Modify: `package.json` (scripts), `.gitignore`

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

Expected: Chromium downloaded (~150MB). Firefox/Webkit not needed for CI minimum.

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/*.unit.test.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        port: 3000,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

```json
"e2e": "playwright test",
"e2e:ui": "playwright test --ui"
```

- [ ] **Step 4: Append Playwright artifacts to `.gitignore`**

Append to `.gitignore`:
```
test-results/
playwright-report/
playwright/.cache/
```

- [ ] **Step 5: Create the `tests/helpers/` placeholder**

```bash
mkdir -p tests/helpers && touch tests/helpers/.gitkeep
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "test: add Playwright + Chromium for E2E/a11y/RLS suites"
```

---

## Task 6: Set up GitHub Actions CI (lint + typecheck + unit)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run format:check
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage
          path: coverage/
```

- [ ] **Step 2: Verify it parses locally**

```bash
npx js-yaml .github/workflows/ci.yml > /dev/null
```

Expected: no output (means valid YAML). If `js-yaml` is missing, install temporarily: `npm install -D js-yaml`.

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint + typecheck + format:check + vitest workflow"
git push -u origin main
```

- [ ] **Step 4: Verify CI passes**

Open the GitHub Actions tab on the repo. The CI workflow should run and pass within ~2 minutes.

If it fails, fix the failure locally, commit, push, repeat. Do not proceed until CI is green.

---

## Task 7: Create `.env.local.example` and `next.config.ts`

**Files:**
- Create: `.env.local.example`
- Modify: `next.config.ts`

- [ ] **Step 1: Create `.env.local.example`**

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-server-only>

# App
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 2: Confirm `.env.local` is gitignored**

```bash
grep -E "^\.env(\.|$)" .gitignore || echo ".env*.local" >> .gitignore
```

Expected: either the rule is already there (silent) or it gets appended.

- [ ] **Step 3: Modify `next.config.ts`**

Replace the file contents:
```ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  // FERPA: do not expose internal redirects in headers
  poweredByHeader: false,
};

export default config;
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: env example + harden next.config.ts (typedRoutes, no x-powered-by)"
```

---

## Task 8: Configure `vercel.ts`

**Files:**
- Create: `vercel.ts`
- Install: `@vercel/config`

- [ ] **Step 1: Install `@vercel/config`**

```bash
npm install -D @vercel/config
```

- [ ] **Step 2: Create `vercel.ts`**

```ts
import { type VercelConfig } from '@vercel/config/v1';

const config: VercelConfig = {
  buildCommand: 'npm run build',
  framework: 'nextjs',
  regions: ['iad1'], // US-East; co-locates with the Supabase US-East region
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ],
};

export const config2 = config; // re-export to avoid "unused" warning in some setups
export default config;
```

- [ ] **Step 3: Verify TS compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: vercel.ts config (US-East, security headers)"
```

---

## Task 9: Install Supabase client libraries

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Verify lockfile changes look reasonable**

```bash
git diff package.json package-lock.json | head -40
```

Expected: `@supabase/supabase-js` and `@supabase/ssr` added.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: install @supabase/supabase-js and @supabase/ssr"
```

---

## Task 10: Create Supabase client factories (browser / server / middleware)

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `middleware.ts`

These are wrappers around `@supabase/ssr` that are imported wherever a Supabase client is needed. Each has a single responsibility (browser context / server-component context / Next.js middleware context).

- [ ] **Step 1: Write the failing unit test for the browser client factory**

Create `lib/supabase/client.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBrowserSupabaseClient } from './client';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-test');
});

describe('createBrowserSupabaseClient', () => {
  it('returns a client with auth and from()', () => {
    const c = createBrowserSupabaseClient();
    expect(c.auth).toBeDefined();
    expect(typeof c.from).toBe('function');
  });

  it('throws if SUPABASE_URL is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(() => createBrowserSupabaseClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
npm test -- lib/supabase/client.test.ts
```

Expected: FAIL with "Cannot find module './client'".

- [ ] **Step 3: Implement the browser client factory**

Create `lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types/database';

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  return createBrowserClient<Database>(url, key);
}
```

- [ ] **Step 4: Create a placeholder `Database` type so the import resolves**

Create `lib/types/database.ts`:
```ts
// Placeholder until Task 22 generates real types from the Supabase schema.
export type Database = Record<string, unknown>;
```

- [ ] **Step 5: Run the test and verify it passes**

```bash
npm test -- lib/supabase/client.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 6: Implement the server client factory**

Create `lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/types/database';

export async function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');

  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items) {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Read-only context (Server Component) — middleware handles refresh elsewhere
        }
      },
    },
  });
}
```

- [ ] **Step 7: Implement the middleware client + root middleware**

Create `lib/supabase/middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/types/database';

export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(items) {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}
```

Create `middleware.ts` at repo root:
```ts
import type { NextRequest } from 'next/server';
import { refreshSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

- [ ] **Step 8: Verify typecheck and unit tests pass**

```bash
npm run typecheck && npm test
```

Expected: typecheck passes; existing tests pass.

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: Supabase client factories (browser/server/middleware) + session refresh"
```

---

## Task 11: Build the sign-in page (magic-link form)

**Files:**
- Create: `app/(auth)/sign-in/page.tsx`, `app/(auth)/sign-in/actions.ts`

- [ ] **Step 1: Write the failing E2E test for the sign-in form**

Create `tests/auth/sign-in.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('sign-in page renders form and accepts email', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /send magic link/i })).toBeVisible();
});

test('sign-in form has the correct accessibility tree', async ({ page }) => {
  await page.goto('/sign-in');
  // Page has exactly one h1
  await expect(page.locator('h1')).toHaveCount(1);
  // Form input has a programmatically associated label
  const email = page.getByLabel(/email/i);
  await expect(email).toHaveAttribute('type', 'email');
  await expect(email).toHaveAttribute('required', '');
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
npm run e2e -- tests/auth/sign-in.spec.ts
```

Expected: FAIL with route 404.

- [ ] **Step 3: Implement the sign-in form**

Create `app/(auth)/sign-in/actions.ts`:
```ts
'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function sendMagicLinkAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) redirect('/sign-in?error=missing-email');

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/callback`,
    },
  });

  if (error) {
    redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  }
  redirect('/sign-in?sent=1');
}
```

Create `app/(auth)/sign-in/page.tsx`:
```tsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendMagicLinkAction } from './actions';

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-2xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Enter your email and we&apos;ll send a sign-in link.
      </p>

      <SearchParamsBanner searchParams={searchParams} />

      <form action={sendMagicLinkAction} className="flex flex-col gap-3">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
        <Button type="submit">Send magic link</Button>
      </form>
    </main>
  );
}

async function SearchParamsBanner({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  if (sp.sent) {
    return (
      <div role="status" className="mb-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900">
        Magic link sent. Check your email.
      </div>
    );
  }
  if (sp.error) {
    return (
      <div role="alert" className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
        {sp.error}
      </div>
    );
  }
  return null;
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
npm run e2e -- tests/auth/sign-in.spec.ts
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: magic-link sign-in page with server action"
```

---

## Task 12: Magic-link callback + sign-out routes

**Files:**
- Create: `app/(auth)/callback/route.ts`, `app/(auth)/sign-out/route.ts`

These are route handlers (not pages); the callback exchanges the code for a session, the sign-out destroys it.

- [ ] **Step 1: Implement the callback route**

Create `app/(auth)/callback/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing-code`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
```

- [ ] **Step 2: Implement the sign-out route**

Create `app/(auth)/sign-out/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/sign-in`, { status: 303 });
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: magic-link callback + sign-out route handlers"
```

---

## Task 13: Stub home page that redirects by auth state

**Files:**
- Modify: `app/page.tsx`, `app/layout.tsx`

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">BodhiLite</h1>
      <p className="mt-2 text-muted-foreground">Signed in as {user.email}.</p>
      <form action="/sign-out" method="post" className="mt-6">
        <button type="submit" className="rounded border px-3 py-1.5 text-sm hover:bg-muted">
          Sign out
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Ensure `app/layout.tsx` has accessible defaults**

Replace `app/layout.tsx`:
```tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BodhiLite',
  description: 'Learner- and faculty-friendly LMS — Phase 1 quiz tool',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verify typecheck and build**

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: stub home page redirects unauthenticated users to /sign-in"
```

---

## Task 14: Add the a11y test helper and a sign-in a11y test

**Files:**
- Create: `tests/helpers/axe.ts`, `tests/a11y/sign-in.spec.ts`
- Modify: `package.json` (install dep)

- [ ] **Step 1: Install `@axe-core/playwright`**

```bash
npm install -D @axe-core/playwright
```

- [ ] **Step 2: Create the axe helper**

Create `tests/helpers/axe.ts`:
```ts
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function assertNoSeriousAxeViolations(page: Page, ctx: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
      .join('\n');
    throw new Error(`axe violations on ${ctx}:\n${summary}`);
  }

  expect(blocking).toEqual([]);
}
```

- [ ] **Step 3: Write the failing sign-in a11y test**

Create `tests/a11y/sign-in.spec.ts`:
```ts
import { test } from '@playwright/test';
import { assertNoSeriousAxeViolations } from '../helpers/axe';

test('sign-in page has no serious/critical axe violations', async ({ page }) => {
  await page.goto('/sign-in');
  await assertNoSeriousAxeViolations(page, '/sign-in');
});

test('sign-in page with success banner has no serious/critical axe violations', async ({ page }) => {
  await page.goto('/sign-in?sent=1');
  await assertNoSeriousAxeViolations(page, '/sign-in?sent=1');
});

test('sign-in page with error banner has no serious/critical axe violations', async ({ page }) => {
  await page.goto('/sign-in?error=Something%20broke');
  await assertNoSeriousAxeViolations(page, '/sign-in?error=...');
});
```

- [ ] **Step 4: Run the a11y test**

```bash
npm run e2e -- tests/a11y/sign-in.spec.ts
```

Expected: all 3 tests pass. If any axe violation is reported, fix the markup (likely a missing landmark or contrast issue) and re-run.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test(a11y): @axe-core/playwright helper + sign-in WCAG 2.2 AA pass"
```

---

## Task 15: Add the E2E GitHub Actions workflow

**Files:**
- Create: `.github/workflows/e2e.yml`

This workflow runs Playwright tests (auth + a11y; RLS added by Task 26) against an **ephemeral Supabase project per PR**. To keep CI cheap and parallel, we use Supabase branches. The user must enable Supabase Branching on their project in the Supabase dashboard before this works in CI; for now the workflow is structured to be enabled later — it runs the local Supabase via the CLI.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/e2e.yml`:
```yaml
name: E2E

on:
  push:
    branches: [main]
  pull_request:

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Start local Supabase
        run: supabase start
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      - name: Apply migrations
        run: supabase db reset --linked=false
      - name: Build app
        env:
          NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ steps.supabase.outputs.anon-key || 'replace-me' }}
          NEXT_PUBLIC_SITE_URL: http://127.0.0.1:3000
        run: npm run build
      - name: Run Playwright tests
        env:
          NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ steps.supabase.outputs.anon-key || 'replace-me' }}
          NEXT_PUBLIC_SITE_URL: http://127.0.0.1:3000
          PLAYWRIGHT_BASE_URL: http://127.0.0.1:3000
        run: |
          npm run start &
          npx wait-on http://127.0.0.1:3000 -t 60000
          npm run e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

- [ ] **Step 2: Install `wait-on` (used by the workflow)**

```bash
npm install -D wait-on
```

- [ ] **Step 3: Add a `start` script if it's missing**

Confirm `package.json` has `"start": "next start"`. If not, add it.

- [ ] **Step 4: Validate the workflow YAML**

```bash
npx js-yaml .github/workflows/e2e.yml > /dev/null
```

- [ ] **Step 5: Commit (do NOT push yet)**

```bash
git add .
git commit -m "ci: E2E workflow scaffold (Playwright + Supabase local); not yet wired"
```

The workflow is committed locally but not pushed. Task 27 finalizes the workflow (wires Supabase keys, adds RLS test runs) and pushes it then. This avoids a stretch of red CI runs between commits.

---

## Task 16: Initialize the Supabase CLI for this project

**Files:**
- Create: `supabase/config.toml`, `.gitignore` additions

- [ ] **Step 1: Initialize Supabase**

```bash
supabase init
```

Expected: `supabase/config.toml` and `.gitignore` entries added.

- [ ] **Step 2: Link to the user's hosted Supabase project (user has the ref)**

```bash
supabase link --project-ref <project-ref>
```

The agent should NOT run this step — the project ref is a user secret. Document it as a **user action** in the runbook and skip during agent execution.

For agent execution: confirm `supabase/config.toml` exists; verify `supabase start` works locally:

```bash
supabase start
```

Expected: local Supabase containers boot; URLs printed.

- [ ] **Step 3: Verify `supabase status` works**

```bash
supabase status
```

Expected: API URL, anon key, service role key printed.

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml .gitignore
git commit -m "chore: initialize Supabase CLI config"
```

---

## Task 17: Migration 0001 — users table

**Files:**
- Create: `supabase/migrations/0001_users.sql`

- [ ] **Step 1: Generate the migration file**

```bash
supabase migration new users
```

Expected: a file like `supabase/migrations/YYYYMMDDHHMMSS_users.sql` is created. Rename it to `0001_users.sql` for ordering clarity:

```bash
mv supabase/migrations/*_users.sql supabase/migrations/0001_users.sql
```

- [ ] **Step 2: Write the migration**

Replace contents of `supabase/migrations/0001_users.sql`:
```sql
-- App-level users table; rows are created by a trigger when an auth.users row is inserted.
-- We keep auth.users (Supabase-managed) and public.users (app-managed) in 1:1 lockstep.

CREATE TYPE app_role AS ENUM ('instructor', 'student');

CREATE TABLE public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  role        app_role NOT NULL DEFAULT 'student',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: when an auth.users row is created, create a matching public.users row.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'student')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Enable RLS but defer policies to migration 0010.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: Apply migration locally**

```bash
supabase db reset
```

Expected: local DB is reset and all migrations (just this one) are applied. No errors.

- [ ] **Step 4: Verify the table exists**

```bash
supabase db dump --local -- --schema public --table users
```

Expected: SQL printing the `users` table definition.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_users.sql
git commit -m "feat(db): migration 0001 — users + role enum + auth-trigger"
```

---

## Task 18: Migration 0002 — assessments table

**Files:**
- Create: `supabase/migrations/0002_assessments.sql`

- [ ] **Step 1: Generate + rename migration file**

```bash
supabase migration new assessments
mv supabase/migrations/*_assessments.sql supabase/migrations/0002_assessments.sql
```

- [ ] **Step 2: Write the migration**

```sql
CREATE TYPE assessment_type AS ENUM ('quiz', 'exam');
CREATE TYPE assessment_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE public.assessments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  slug                  TEXT NOT NULL,
  status                assessment_status NOT NULL DEFAULT 'draft',
  assessment_type       assessment_type   NOT NULL DEFAULT 'quiz',
  time_limit_seconds    INT,
  randomize_questions   BOOLEAN NOT NULL DEFAULT FALSE,
  randomize_choices     BOOLEAN NOT NULL DEFAULT FALSE,
  default_attempts      INT NOT NULL DEFAULT 3 CHECK (default_attempts > 0),
  opens_at              TIMESTAMPTZ,
  closes_at             TIMESTAMPTZ,
  settings              JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, slug),
  CHECK (
    (assessment_type = 'quiz' AND time_limit_seconds IS NULL)
    OR
    (assessment_type = 'exam' AND time_limit_seconds IS NOT NULL AND time_limit_seconds > 0)
  )
);

CREATE INDEX idx_assessments_owner ON public.assessments (owner_user_id);
CREATE INDEX idx_assessments_status ON public.assessments (status) WHERE status = 'published';

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER assessments_set_updated_at
  BEFORE UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

- [ ] **Step 3: Apply + verify**

```bash
supabase db reset
```

Expected: clean apply.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_assessments.sql
git commit -m "feat(db): migration 0002 — assessments table with Quiz/Exam constraints"
```

---

## Task 19: Migration 0003 — questions + 0004 question_variables

**Files:**
- Create: `supabase/migrations/0003_questions.sql`, `supabase/migrations/0004_question_variables.sql`

- [ ] **Step 1: Generate + rename both files**

```bash
supabase migration new questions
mv supabase/migrations/*_questions.sql supabase/migrations/0003_questions.sql
supabase migration new question_variables
mv supabase/migrations/*_question_variables.sql supabase/migrations/0004_question_variables.sql
```

- [ ] **Step 2: Write `0003_questions.sql`**

```sql
CREATE TYPE question_type AS ENUM (
  'mc', 'ma', 'tf', 'numeric', 'short_answer', 'fill_in',
  'chem_draw_to_target', 'chem_pick_product', 'chem_identify_functional_group'
);

CREATE TABLE public.questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  position        INT  NOT NULL,
  type            question_type NOT NULL,
  body            JSONB NOT NULL DEFAULT '{}'::JSONB,
  scoring         JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, position)
);

CREATE INDEX idx_questions_assessment ON public.questions (assessment_id);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER questions_set_updated_at
  BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

- [ ] **Step 3: Write `0004_question_variables.sql`**

```sql
CREATE TYPE variable_type AS ENUM ('choice', 'randint', 'randfloat', 'derived', 'chemistry_compound');

CREATE TABLE public.question_variables (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          variable_type NOT NULL,
  spec          JSONB NOT NULL,
  position      INT  NOT NULL,
  UNIQUE (question_id, name),
  UNIQUE (question_id, position)
);

CREATE INDEX idx_question_variables_question ON public.question_variables (question_id);

ALTER TABLE public.question_variables ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Apply + verify**

```bash
supabase db reset
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_questions.sql supabase/migrations/0004_question_variables.sql
git commit -m "feat(db): migrations 0003-0004 — questions + question_variables"
```

---

## Task 20: Migrations 0005-0007 — attempts, answers, media

**Files:**
- Create: `supabase/migrations/0005_attempts.sql`, `0006_answers.sql`, `0007_media.sql`

- [ ] **Step 1: Generate + rename**

```bash
for n in attempts answers media; do
  supabase migration new "$n"
done
mv supabase/migrations/*_attempts.sql supabase/migrations/0005_attempts.sql
mv supabase/migrations/*_answers.sql  supabase/migrations/0006_answers.sql
mv supabase/migrations/*_media.sql    supabase/migrations/0007_media.sql
```

- [ ] **Step 2: Write `0005_attempts.sql`**

```sql
CREATE TYPE attempt_status AS ENUM ('in_progress', 'submitted', 'graded', 'auto_submitted');

CREATE TABLE public.attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id     UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  student_user_id   UUID NOT NULL REFERENCES public.users(id)       ON DELETE CASCADE,
  attempt_no        INT  NOT NULL CHECK (attempt_no >= 1),
  seed              BIGINT NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  status            attempt_status NOT NULL DEFAULT 'in_progress',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, student_user_id, attempt_no)
);

CREATE INDEX idx_attempts_student ON public.attempts (student_user_id);
CREATE INDEX idx_attempts_assessment ON public.attempts (assessment_id);

ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: Write `0006_answers.sql`**

```sql
CREATE TABLE public.answers (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id                    UUID NOT NULL REFERENCES public.attempts(id)  ON DELETE CASCADE,
  question_id                   UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  rendered_question_snapshot    JSONB,
  response                      JSONB,
  auto_score                    NUMERIC,
  manual_score                  NUMERIC,
  score_method                  TEXT,
  graded_at                     TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX idx_answers_attempt ON public.answers (attempt_id);

-- Application-level enforcement of snapshot write-once
CREATE OR REPLACE FUNCTION public.enforce_snapshot_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.rendered_question_snapshot IS NOT NULL
     AND NEW.rendered_question_snapshot IS DISTINCT FROM OLD.rendered_question_snapshot THEN
    RAISE EXCEPTION 'rendered_question_snapshot is immutable once set';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER answers_snapshot_immutable
  BEFORE UPDATE ON public.answers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_snapshot_immutability();

CREATE TRIGGER answers_set_updated_at
  BEFORE UPDATE ON public.answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Write `0007_media.sql`**

```sql
CREATE TABLE public.media (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mime                TEXT NOT NULL,
  storage_path        TEXT NOT NULL UNIQUE,
  alt_text            TEXT NOT NULL CHECK (length(alt_text) > 0),
  attached_to_kind    TEXT,
  attached_to_id      UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_owner ON public.media (owner_user_id);

ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 5: Apply + verify**

```bash
supabase db reset
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0005_attempts.sql supabase/migrations/0006_answers.sql supabase/migrations/0007_media.sql
git commit -m "feat(db): migrations 0005-0007 — attempts, answers (snapshot trigger), media"
```

---

## Task 21: Migrations 0008-0009 — assessment_overrides + audit_log

**Files:**
- Create: `supabase/migrations/0008_assessment_overrides.sql`, `0009_audit_log.sql`

- [ ] **Step 1: Generate + rename**

```bash
supabase migration new assessment_overrides
mv supabase/migrations/*_assessment_overrides.sql supabase/migrations/0008_assessment_overrides.sql
supabase migration new audit_log
mv supabase/migrations/*_audit_log.sql supabase/migrations/0009_audit_log.sql
```

- [ ] **Step 2: Write `0008_assessment_overrides.sql`**

```sql
CREATE TABLE public.assessment_overrides (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id             UUID NOT NULL REFERENCES public.users(id)       ON DELETE CASCADE,
  assessment_id               UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  extra_time_seconds          INT,
  extra_attempts              INT,
  available_until_override    TIMESTAMPTZ,
  alternative_format          TEXT,
  reason                      TEXT,
  granted_by_user_id          UUID NOT NULL REFERENCES public.users(id),
  granted_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  audit_log_id                UUID,
  UNIQUE (student_user_id, assessment_id)
);

CREATE INDEX idx_overrides_student ON public.assessment_overrides (student_user_id);
CREATE INDEX idx_overrides_assessment ON public.assessment_overrides (assessment_id);

ALTER TABLE public.assessment_overrides ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: Write `0009_audit_log.sql`**

```sql
CREATE TABLE public.audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   UUID REFERENCES public.users(id),
  action          TEXT NOT NULL,
  target_kind     TEXT NOT NULL,
  target_id       UUID,
  before          JSONB,
  after           JSONB,
  at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_target ON public.audit_log (target_kind, target_id);
CREATE INDEX idx_audit_log_at ON public.audit_log (at DESC);

-- Reject UPDATE and DELETE at the function level (RLS will also block, but trigger is belt-and-suspenders).
CREATE OR REPLACE FUNCTION public.audit_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log rows are immutable';
END;
$$;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Apply + verify**

```bash
supabase db reset
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_assessment_overrides.sql supabase/migrations/0009_audit_log.sql
git commit -m "feat(db): migrations 0008-0009 — assessment_overrides + immutable audit_log"
```

---

## Task 22: Migration 0010 — RLS policies (all tables)

**Files:**
- Create: `supabase/migrations/0010_rls_policies.sql`

All RLS policies live in one ordered file for clarity; future policy changes get their own numbered migration.

- [ ] **Step 1: Generate + rename**

```bash
supabase migration new rls_policies
mv supabase/migrations/*_rls_policies.sql supabase/migrations/0010_rls_policies.sql
```

- [ ] **Step 2: Write `0010_rls_policies.sql`**

```sql
-- =========================================================================
-- Helper: is the current auth.uid() an instructor?
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_instructor()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'instructor');
$$;

-- =========================================================================
-- public.users
-- =========================================================================
CREATE POLICY users_self_select ON public.users FOR SELECT
  USING (id = (SELECT auth.uid()));

CREATE POLICY users_instructor_select_all ON public.users FOR SELECT
  USING (public.is_instructor());

-- =========================================================================
-- public.assessments
-- =========================================================================
-- Owners (instructors) full CRUD
CREATE POLICY assessments_owner_all ON public.assessments FOR ALL
  USING (owner_user_id = (SELECT auth.uid()))
  WITH CHECK (owner_user_id = (SELECT auth.uid()));

-- Students see published assessments they have an attempt for, OR that they have an override on.
CREATE POLICY assessments_student_select ON public.assessments FOR SELECT
  USING (
    status = 'published'
    AND (
      EXISTS (SELECT 1 FROM public.attempts a
              WHERE a.assessment_id = assessments.id
                AND a.student_user_id = (SELECT auth.uid()))
      OR
      EXISTS (SELECT 1 FROM public.assessment_overrides ovr
              WHERE ovr.assessment_id = assessments.id
                AND ovr.student_user_id = (SELECT auth.uid()))
    )
  );

-- =========================================================================
-- public.questions  (visible to instructor-owner; students see via attempt)
-- =========================================================================
CREATE POLICY questions_owner_all ON public.questions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.assessments a
                 WHERE a.id = questions.assessment_id
                   AND a.owner_user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assessments a
                      WHERE a.id = questions.assessment_id
                        AND a.owner_user_id = (SELECT auth.uid())));

CREATE POLICY questions_student_select ON public.questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.attempts att
                 WHERE att.assessment_id = questions.assessment_id
                   AND att.student_user_id = (SELECT auth.uid())));

-- =========================================================================
-- public.question_variables  (variables follow the question's policy)
-- =========================================================================
CREATE POLICY question_variables_owner_all ON public.question_variables FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.assessments a ON a.id = q.assessment_id
    WHERE q.id = question_variables.question_id
      AND a.owner_user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.assessments a ON a.id = q.assessment_id
    WHERE q.id = question_variables.question_id
      AND a.owner_user_id = (SELECT auth.uid())));

CREATE POLICY question_variables_student_select ON public.question_variables FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.attempts att ON att.assessment_id = q.assessment_id
    WHERE q.id = question_variables.question_id
      AND att.student_user_id = (SELECT auth.uid())));

-- =========================================================================
-- public.attempts
-- =========================================================================
CREATE POLICY attempts_student_select ON public.attempts FOR SELECT
  USING (student_user_id = (SELECT auth.uid()));

CREATE POLICY attempts_student_insert ON public.attempts FOR INSERT
  WITH CHECK (student_user_id = (SELECT auth.uid()));

CREATE POLICY attempts_student_update_own ON public.attempts FOR UPDATE
  USING (student_user_id = (SELECT auth.uid()))
  WITH CHECK (student_user_id = (SELECT auth.uid()));

CREATE POLICY attempts_instructor_select ON public.attempts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.assessments a
                 WHERE a.id = attempts.assessment_id
                   AND a.owner_user_id = (SELECT auth.uid())));

-- =========================================================================
-- public.answers
-- =========================================================================
CREATE POLICY answers_student_select ON public.answers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.attempts att
                 WHERE att.id = answers.attempt_id
                   AND att.student_user_id = (SELECT auth.uid())));

CREATE POLICY answers_student_insert ON public.answers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.attempts att
                      WHERE att.id = answers.attempt_id
                        AND att.student_user_id = (SELECT auth.uid())));

CREATE POLICY answers_student_update_own ON public.answers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.attempts att
                 WHERE att.id = answers.attempt_id
                   AND att.student_user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.attempts att
                      WHERE att.id = answers.attempt_id
                        AND att.student_user_id = (SELECT auth.uid())));

CREATE POLICY answers_instructor_select ON public.answers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.attempts att
    JOIN public.assessments a ON a.id = att.assessment_id
    WHERE att.id = answers.attempt_id
      AND a.owner_user_id = (SELECT auth.uid())));

-- =========================================================================
-- public.assessment_overrides
-- =========================================================================
CREATE POLICY overrides_owner_all ON public.assessment_overrides FOR ALL
  USING (EXISTS (SELECT 1 FROM public.assessments a
                 WHERE a.id = assessment_overrides.assessment_id
                   AND a.owner_user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assessments a
                      WHERE a.id = assessment_overrides.assessment_id
                        AND a.owner_user_id = (SELECT auth.uid())));

CREATE POLICY overrides_student_select_own ON public.assessment_overrides FOR SELECT
  USING (student_user_id = (SELECT auth.uid()));

-- =========================================================================
-- public.audit_log  (insert by anyone authenticated; reads only by instructors)
-- =========================================================================
CREATE POLICY audit_log_insert_auth ON public.audit_log FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY audit_log_instructor_select ON public.audit_log FOR SELECT
  USING (public.is_instructor());

-- =========================================================================
-- public.media  (owner full CRUD; others must use signed URLs for storage)
-- =========================================================================
CREATE POLICY media_owner_all ON public.media FOR ALL
  USING (owner_user_id = (SELECT auth.uid()))
  WITH CHECK (owner_user_id = (SELECT auth.uid()));
```

- [ ] **Step 3: Apply + verify**

```bash
supabase db reset
```

Expected: clean apply.

- [ ] **Step 4: Sanity check from `psql` — confirm RLS is on for every table**

```bash
supabase db psql -- -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('users','assessments','questions','question_variables','attempts','answers','media','assessment_overrides','audit_log');"
```

Expected: every row shows `relrowsecurity = t`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0010_rls_policies.sql
git commit -m "feat(db): migration 0010 — RLS policies for all 9 tables"
```

---

## Task 23: Generate TypeScript types from the Supabase schema

**Files:**
- Modify: `lib/types/database.ts` (replace placeholder), `package.json` (script)

- [ ] **Step 1: Add a script**

In `package.json`:
```json
"db:types": "supabase gen types typescript --local > lib/types/database.ts"
```

- [ ] **Step 2: Run it**

```bash
npm run db:types
```

Expected: `lib/types/database.ts` is overwritten with real generated types (a few hundred lines).

- [ ] **Step 3: Verify everything still typechecks**

```bash
npm run typecheck
```

Expected: no errors. If the Supabase generator produces type issues with our placeholder usages, fix the consumers.

- [ ] **Step 4: Commit**

```bash
git add package.json lib/types/database.ts
git commit -m "feat(types): generate Database types from Supabase schema"
```

---

## Task 24: RLS coverage test — students cannot see other students' data

**Files:**
- Create: `tests/helpers/auth.ts`, `tests/rls/students-isolation.spec.ts`

This is the load-bearing FERPA test. It directly proves that student A cannot read student B's `attempts`, `answers`, or `assessment_overrides` rows. The test uses two Supabase auth tokens directly (not through the UI) to test the DB layer.

- [ ] **Step 1: Write the auth helper**

Create `tests/helpers/auth.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !serviceRoleKey || !anonKey) {
  throw new Error('Missing Supabase env vars for RLS tests');
}

/** Service-role client used to seed test data and to mint user tokens. */
export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Creates a confirmed auth.user with the given email + password and returns:
 *   - the user id
 *   - a Supabase client authenticated as that user (using anon key + bearer token)
 */
export async function createTestUserClient(opts: {
  email: string;
  password: string;
  role?: 'instructor' | 'student';
}): Promise<{ userId: string; client: SupabaseClient<Database> }> {
  const admin = adminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error('createUser returned no user');

  // Bump role if requested (trigger seeded 'student')
  if (opts.role && opts.role !== 'student') {
    const { error: roleErr } = await admin
      .from('users')
      .update({ role: opts.role })
      .eq('id', created.user.id);
    if (roleErr) throw roleErr;
  }

  const userClient = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await userClient.auth.signInWithPassword({
    email: opts.email,
    password: opts.password,
  });
  if (signInErr) throw signInErr;

  return { userId: created.user.id, client: userClient };
}

/** Tear down by deleting auth.users (CASCADE removes public.users rows). */
export async function deleteTestUser(userId: string): Promise<void> {
  const admin = adminClient();
  await admin.auth.admin.deleteUser(userId);
}
```

- [ ] **Step 2: Write the failing RLS test**

Create `tests/rls/students-isolation.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test.describe('RLS: student A cannot see student B', () => {
  let instructorId: string;
  let studentAId: string;
  let studentBId: string;
  let assessmentId: string;
  let attemptBId: string;
  let answerBId: string;

  test.beforeAll(async () => {
    const admin = adminClient();

    const instructor = await createTestUserClient({
      email: `instructor+${Date.now()}@test.local`,
      password: 'test-pw-instructor-1!',
      role: 'instructor',
    });
    instructorId = instructor.userId;

    const studentA = await createTestUserClient({
      email: `studenta+${Date.now()}@test.local`,
      password: 'test-pw-studenta-1!',
    });
    studentAId = studentA.userId;

    const studentB = await createTestUserClient({
      email: `studentb+${Date.now()}@test.local`,
      password: 'test-pw-studentb-1!',
    });
    studentBId = studentB.userId;

    const { data: a, error: aErr } = await admin.from('assessments').insert({
      owner_user_id: instructorId,
      title: 'Test quiz',
      slug: 'test-quiz',
      status: 'published',
    }).select().single();
    if (aErr || !a) throw aErr ?? new Error('no assessment');
    assessmentId = a.id;

    const { data: q, error: qErr } = await admin.from('questions').insert({
      assessment_id: assessmentId,
      position: 1,
      type: 'mc',
      body: { stem: '2+2?' },
      scoring: { correct: 'b' },
    }).select().single();
    if (qErr || !q) throw qErr ?? new Error('no question');

    const { data: att, error: attErr } = await admin.from('attempts').insert({
      assessment_id: assessmentId,
      student_user_id: studentBId,
      attempt_no: 1,
      seed: 12345,
    }).select().single();
    if (attErr || !att) throw attErr ?? new Error('no attempt');
    attemptBId = att.id;

    const { data: ans, error: ansErr } = await admin.from('answers').insert({
      attempt_id: attemptBId,
      question_id: q.id,
      rendered_question_snapshot: { stem: 'snapshot for B' },
      response: { choice: 'b' },
    }).select().single();
    if (ansErr || !ans) throw ansErr ?? new Error('no answer');
    answerBId = ans.id;
  });

  test.afterAll(async () => {
    await deleteTestUser(instructorId);
    await deleteTestUser(studentAId);
    await deleteTestUser(studentBId);
  });

  test('student A cannot SELECT student B attempts', async () => {
    const { client } = await createTestUserClient({
      email: `studenta-read+${Date.now()}@test.local`,
      password: 'test-pw-1!',
    });
    const { data, error } = await client.from('attempts').select('*').eq('id', attemptBId);
    if (error) throw error;
    expect(data).toEqual([]);
  });

  test('student A cannot SELECT student B answers', async () => {
    const { client } = await createTestUserClient({
      email: `studenta-read2+${Date.now()}@test.local`,
      password: 'test-pw-1!',
    });
    const { data, error } = await client.from('answers').select('*').eq('id', answerBId);
    if (error) throw error;
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test against local Supabase**

Make sure local Supabase is running (`supabase start`). Make sure the dev env has `SUPABASE_SERVICE_ROLE_KEY` set — get it from `supabase status` output.

Run:
```bash
SUPABASE_SERVICE_ROLE_KEY=$(supabase status --output json | jq -r '.SERVICE_ROLE_KEY') \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=$(supabase status --output json | jq -r '.ANON_KEY') \
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 \
npm run e2e -- tests/rls/students-isolation.spec.ts
```

Expected: both isolation tests pass. If they fail (data returned that should be empty), the RLS policy has a hole — investigate and fix before proceeding.

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/auth.ts tests/rls/students-isolation.spec.ts
git commit -m "test(rls): student A cannot see student B's attempts or answers"
```

---

## Task 25: RLS coverage test — snapshot is immutable

**Files:**
- Create: `tests/rls/snapshot-immutability.spec.ts`

- [ ] **Step 1: Write the test**

Create `tests/rls/snapshot-immutability.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test('rendered_question_snapshot is write-once', async () => {
  const admin = adminClient();

  const instructor = await createTestUserClient({
    email: `instr-snap+${Date.now()}@test.local`,
    password: 'test-pw-1!',
    role: 'instructor',
  });
  const student = await createTestUserClient({
    email: `student-snap+${Date.now()}@test.local`,
    password: 'test-pw-1!',
  });

  try {
    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: instructor.userId, title: 't', slug: 't-snap', status: 'published',
    }).select().single();
    const { data: q } = await admin.from('questions').insert({
      assessment_id: a!.id, position: 1, type: 'mc',
      body: {}, scoring: {},
    }).select().single();
    const { data: att } = await admin.from('attempts').insert({
      assessment_id: a!.id, student_user_id: student.userId, attempt_no: 1, seed: 1,
    }).select().single();

    // Student writes their snapshot the first time (allowed).
    const { error: insertErr } = await student.client.from('answers').insert({
      attempt_id: att!.id,
      question_id: q!.id,
      rendered_question_snapshot: { v: 1 },
      response: {},
    });
    expect(insertErr).toBeNull();

    // Student attempts to mutate the snapshot (must fail at the trigger level).
    const { error: updateErr } = await student.client
      .from('answers')
      .update({ rendered_question_snapshot: { v: 2 } })
      .eq('attempt_id', att!.id);
    expect(updateErr).not.toBeNull();
    expect(updateErr!.message).toMatch(/immutable/i);

    // Even the admin (service role) is blocked by the trigger.
    const { error: adminUpdateErr } = await admin
      .from('answers')
      .update({ rendered_question_snapshot: { v: 3 } })
      .eq('attempt_id', att!.id);
    expect(adminUpdateErr).not.toBeNull();
  } finally {
    await deleteTestUser(instructor.userId);
    await deleteTestUser(student.userId);
  }
});
```

- [ ] **Step 2: Run the test**

```bash
SUPABASE_SERVICE_ROLE_KEY=$(supabase status --output json | jq -r '.SERVICE_ROLE_KEY') \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=$(supabase status --output json | jq -r '.ANON_KEY') \
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 \
npm run e2e -- tests/rls/snapshot-immutability.spec.ts
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/snapshot-immutability.spec.ts
git commit -m "test(rls): rendered_question_snapshot is write-once (trigger-enforced)"
```

---

## Task 26: RLS coverage test — audit_log is append-only

**Files:**
- Create: `tests/rls/audit-log-append-only.spec.ts`

- [ ] **Step 1: Write the test**

Create `tests/rls/audit-log-append-only.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test('audit_log rejects UPDATE and DELETE', async () => {
  const admin = adminClient();
  const instructor = await createTestUserClient({
    email: `instr-audit+${Date.now()}@test.local`,
    password: 'test-pw-1!',
    role: 'instructor',
  });

  try {
    const { data: row, error: insertErr } = await admin.from('audit_log').insert({
      actor_user_id: instructor.userId,
      action: 'TEST_EVENT',
      target_kind: 'test',
      target_id: null,
      before: null,
      after: { foo: 'bar' },
    }).select().single();
    expect(insertErr).toBeNull();
    expect(row).toBeTruthy();

    const { error: updateErr } = await admin
      .from('audit_log')
      .update({ action: 'CHANGED' })
      .eq('id', row!.id);
    expect(updateErr).not.toBeNull();

    const { error: deleteErr } = await admin.from('audit_log').delete().eq('id', row!.id);
    expect(deleteErr).not.toBeNull();
  } finally {
    await deleteTestUser(instructor.userId);
  }
});
```

- [ ] **Step 2: Run**

```bash
SUPABASE_SERVICE_ROLE_KEY=$(supabase status --output json | jq -r '.SERVICE_ROLE_KEY') \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=$(supabase status --output json | jq -r '.ANON_KEY') \
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 \
npm run e2e -- tests/rls/audit-log-append-only.spec.ts
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/audit-log-append-only.spec.ts
git commit -m "test(rls): audit_log rejects UPDATE/DELETE (trigger-enforced)"
```

---

## Task 27: Wire RLS tests into the E2E workflow

**Files:**
- Modify: `.github/workflows/e2e.yml`

- [ ] **Step 1: Update the workflow to export Supabase keys before the test step**

Replace the `Run Playwright tests` step in `.github/workflows/e2e.yml` with:

```yaml
      - name: Capture local Supabase keys
        id: keys
        run: |
          ANON=$(supabase status --output json | jq -r '.ANON_KEY')
          SVC=$(supabase status --output json | jq -r '.SERVICE_ROLE_KEY')
          echo "anon=$ANON" >> $GITHUB_OUTPUT
          echo "service=$SVC" >> $GITHUB_OUTPUT
      - name: Run Playwright tests
        env:
          NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ steps.keys.outputs.anon }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ steps.keys.outputs.service }}
          NEXT_PUBLIC_SITE_URL: http://127.0.0.1:3000
          PLAYWRIGHT_BASE_URL: http://127.0.0.1:3000
        run: |
          npm run start &
          npx wait-on http://127.0.0.1:3000 -t 60000
          npm run e2e
```

(`jq` is preinstalled on `ubuntu-latest`.)

- [ ] **Step 2: Validate YAML**

```bash
npx js-yaml .github/workflows/e2e.yml > /dev/null
```

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci: pipe local Supabase anon + service keys into Playwright env"
git push
```

Verify on GitHub Actions: the E2E workflow runs. All tests (auth + a11y + 3 RLS tests) should pass.

If anything fails, **fix it before moving on**. Foundation must be green.

---

## Task 28: NVDA manual test script (runbook)

**Files:**
- Create: `docs/runbooks/nvda-test-script.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/nvda-test-script.md`:
```markdown
# NVDA Manual Test — Critical Paths (Wave 1)

Run this before every Wave launches to production. Estimated time: ~30 min for Wave 1 surface area; grows as Wave 2-4 add features.

## Setup
- Windows machine
- NVDA 2024.x or later installed (free: https://www.nvaccess.org/)
- Latest Chrome
- A confirmed test instructor account + a confirmed test student account

## Test 1: Sign-in flow (student)
1. Start NVDA. Open Chrome. Navigate to `https://<your-vercel-url>/sign-in`.
2. Expected announcement: page title "Sign in — BodhiLite", heading "Sign in".
3. Tab through the form. Expected order: Email field → Send magic link button.
4. NVDA announces "Email, edit, required, autocomplete email" for the email field.
5. Type the test email. Tab to button. Press Enter.
6. After submit: success banner "Magic link sent. Check your email." is announced by NVDA (uses role=status).
7. Open the magic-link email, click the link. The callback redirects to the home page.
8. NVDA announces the heading "BodhiLite" and the signed-in-as message.

Pass criteria: every step's expected announcement actually happens, no silent regions.

## Test 2: Sign-out flow
1. From the home page, Tab to the "Sign out" button (no keyboard trap reaching it).
2. Press Enter. Page redirects to /sign-in.
3. NVDA announces the sign-in heading.

Pass criteria: above happens with keyboard only, no mouse.

## Test 3: Zoom to 200% (WCAG 1.4.4)
1. On /sign-in, press Ctrl + + repeatedly to zoom to 200%.
2. Form remains usable; no content cut off, no horizontal scroll on standard desktop width.

## Test 4: Prefers-reduced-motion
1. Enable "Reduce motion" in Windows accessibility settings.
2. Reload /sign-in. Any animations should be absent or instantaneous.

## Result recording
After running, record results in `docs/runbooks/nvda-results/YYYY-MM-DD.md`:
- Tester name
- Date
- Pass/fail per test
- Any new issues discovered
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/nvda-test-script.md
git commit -m "docs(runbook): NVDA manual test script for Wave 1 critical paths"
```

---

## Task 29: First production deploy + smoke test

**Files:**
- Modify: `README.md` (or create it) with deploy instructions

This is partly a user task: the user adds Supabase env vars to Vercel and clicks Deploy. The agent provides the runbook.

- [ ] **Step 1: Write deploy instructions in `README.md`**

Create `README.md` (or append):
```markdown
# BodhiLite

A learner- and faculty-friendly Learning Management System. Phase 1 is a standalone Summer Quiz Tool.

## First production deploy (manual user actions)

1. In the **Supabase dashboard** → your project → Settings → API:
   - Copy `URL`, `anon key`, and `service_role key`.

2. In the **Vercel dashboard** → your project → Settings → Environment Variables, add (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` = your project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key (mark "Sensitive")
   - `NEXT_PUBLIC_SITE_URL` = `https://<your-vercel-prod-domain>`

3. In the Supabase dashboard → Authentication → URL Configuration:
   - Add `https://<your-vercel-prod-domain>/callback` to "Redirect URLs"
   - Set "Site URL" to `https://<your-vercel-prod-domain>`

4. From the repo, push to `main` to trigger a production deploy. Wait for it to finish.

5. **Apply the migrations to the hosted Supabase project**:
   ```bash
   supabase db push
   ```
   (Requires `supabase link --project-ref <ref>` first.)

6. **Smoke test:**
   - Visit `https://<your-vercel-prod-domain>`.
   - You're redirected to `/sign-in`.
   - Enter your real email. Click "Send magic link."
   - Check your email; click the link.
   - You land on the home page; "Signed in as <your email>" is shown.
   - Click "Sign out"; redirected back to /sign-in.

If all of that works, Wave 1 Foundation is **complete**. Proceed to Plan 2 (Authoring).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: production deploy + smoke test instructions for Wave 1 Foundation"
```

---

## Done. What ships from this plan

After all 29 tasks complete:

- A Next.js 16 + Tailwind + shadcn project deployable to Vercel
- TypeScript strict mode + Prettier + ESLint + Vitest + Playwright wired up
- GitHub Actions CI: lint, typecheck, format check, unit tests
- GitHub Actions E2E: Playwright (auth + a11y + RLS) against a fresh Supabase per PR
- Magic-link sign-in flow that passes WCAG 2.2 AA via `@axe-core/playwright`
- Full Phase 1 data model under RLS, with policies tested at the DB level (student-A-cannot-see-student-B + snapshot immutability + audit_log append-only)
- An accessible stub home page that redirects unauthenticated users to /sign-in
- Manual NVDA test runbook for Wave 1
- Production deployed, smoke-tested, ready for Plan 2 (Authoring) to add LMS surfaces on top

**This plan does NOT include:** quiz authoring, student attempt UI, grading, gradebook, chem integration, exam timer, accommodations UI, daily backup automation, restore drill — those are Plans 2-4.
