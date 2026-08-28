# Auth modes — full notes

Detailed write-ups behind CLAUDE.md §12. The summary and trap index live
there; this file keeps the full reasoning and trap histories.

## Mode selection

`AUTH_MODE=none` (default) or `AUTH_MODE=clerk`, read at request time by
`apps/web/src/lib/auth/mode.ts` — never at module load, since `next build`
imports route modules during page-data collection before the runtime env
exists (same reasoning as `packages/db/src/client.ts`). One build image
serves either mode; switching is a redeploy with a different env var, not a
different build.

## Modal auth flow

**Auth runs in Clerk's modals — there are no `/sign-in` or `/sign-up`
pages.** The header's "Sign in" is `<SignInButton mode="modal">`; sign-up is
reached from the sign-in modal's own footer link. Middleware and
`getCurrentUser` send signed-out visitors to `SIGN_IN_HREF`
(`/?sign-in=1`, `lib/query-params.ts`) and the landing page auto-opens the
modal via `components/sign-in-opener.tsx`, which strips the param right
after so a dismissed modal doesn't reopen on refresh. Finishing either flow
lands on `/projects` via the provider-level
`signInFallbackRedirectUrl`/`signUpFallbackRedirectUrl` — fallback, not
force, so Clerk's own `redirect_url` (set when middleware bounced a deep
link) still wins when present.

## Dev commands & environment

Root `package.json` carries mode-pinned commands so switching never means
hand-editing env files: `dev:web:none` / `dev:web:clerk` (watcher dev
server), `build:web` + `start:web:none` / `start:web:clerk` (production
build and serve), and `start:worker` (the worker is mode-agnostic; note
that no script loads `.env` for it — outside Compose and `scripts/dev.mjs`
its `DATABASE_URL`/`REDIS_URL`/`STORAGE_LOCAL_PATH` must be in the shell
environment). The
mode is forced with `cross-env`, which wins over `apps/web/.env` because a
variable already present in the process environment is never overridden by
Next's env-file loading; plain `dev:web` still uses whatever the env files
say.

**`npm run dev` (or `npm run dev:clerk`) is the one-command dev
environment**: `scripts/dev.mjs` starts `postgres`+`redis` via Docker
Compose (finding the Docker CLI in its default Windows install dir when
it's not on PATH), waits for `pg_isready`, applies migrations, then runs
the web dev server and the worker with watchers. It overrides
`DATABASE_URL`/`REDIS_URL` to `localhost` and `STORAGE_LOCAL_PATH` to
`./.data/shots` in the children's environment — the values in `.env` are
compose-internal hostnames that don't resolve from the host (CLAUDE.md §7).
Ctrl+C stops both processes; the containers stay up. If port 3000 is taken,
Next picks the next free port and prints it — check the log rather than
assuming 3000.

**Local dev needs `apps/web/.env`, not just the repo-root `.env`.**
`docker-compose.yml` loads the root `.env` automatically (Compose's own
behavior for a `.env` next to the compose file), but a locally-run `next
dev -w @vrt/web` has its cwd inside `apps/web`, and Next's own env loader
resolves env files relative to that directory. Confirmed empirically
2026-08-13: with `AUTH_MODE=clerk` set only in the root `.env`, a
locally-run `next dev` still read `process.env.AUTH_MODE` as `"none"`.
Keep `apps/web/.env` (git-ignored) in sync with the root `.env`'s
`AUTH_MODE`/`CLERK_*` values for anyone running the web app outside
Docker. (One file by choice: it briefly existed as a `.env` +
`.env.local` pair, but both were git-ignored and locally-scoped, so the
committable-defaults vs local-secrets distinction carried no meaning.)

## E2E suite

**`npm run e2e`** runs the Playwright auth suite (`apps/web/e2e/`,
`@clerk/testing`, `global.setup.ts` wired as Playwright's `globalSetup`):
six tests — signed-out redirect, public landing, the full modal sign-in
(password, then the 424242 code, landing on `/projects` — the one test that
drives Clerk's real UI and so the first to break on a Clerk UI change),
`/` redirecting a signed-in visitor to `/projects` with the landing still
reachable at `/about` (through the footer link and the avatar menu's
"About VRT" item), admin vs plain-user avatar-menu contents and
`/settings` access — driven
against the real Clerk dev instance with the `+clerk_test` users (the
programmatic sign-ins use `clerk.signIn({ strategy: "email_code" })`; the
code is always 424242). Local-only by design: it needs postgres+redis running and
Clerk dev keys in `apps/web/.env`, so it is deliberately not wired into CI.
The config's `webServer` starts (or reuses) the dev server in clerk mode
itself.

**Known trap (2026-08-16):** that `webServer` block sets
`reuseExistingServer: true`, and its `AUTH_MODE=clerk` only reaches a server
*it* starts. A plain `npm run dev` left running on port 3000 is none mode, so
the suite silently runs against the wrong mode — and since `/` now redirects
whenever `getOptionalUser()` resolves (§9), none mode has no landing page and
*every* test fails, including the ones that never sign in. Stop the dev
server before `npm run e2e` (and check the port really freed: killing the
`npm run dev` wrapper on Windows can leave the Next child listening).

The test users on the Clerk dev instance are `vrt+clerk_test@example.com`
(first sign-in, so role `admin`) and `vrt2+clerk_test@example.com` (role
`user`). Only the admin signs in with a password (the modal test), read from
`E2E_ADMIN_PASSWORD` in `apps/web/.env` — the suite throws naming the
variable when it is missing; the plain user only ever signs in by email code. Sign-in order
on this instance: password first, then a "new device" email-code step
(`424242`).

**Known trap:** Clerk's sign-*up* UI sits behind Cloudflare Turnstile, so
browser automation of sign-up fails — create test users via Clerk's Backend
API instead; sign-*in* automates fine. Clerk's email input isn't reachable
via `getByLabel` — use `input[name="identifier"]` / `input[name="password"]`;
the OTP screen accepts `page.keyboard.type`.

## Users, roles, quotas

- **The local `users` table is canonical, not Clerk.** `getOptionalUser()`
  (`apps/web/src/lib/auth/user.ts`) is the one function everything else calls
  in both modes:
  - In `none` mode it returns a fixed-id default user
    (`00000000-0000-0000-0000-000000000001`, email `local@vrt`), created on
    first access. Every pre-multi-user project/run in the DB is owned by this
    row, so switching back to `none` mode makes them visible again exactly as
    before — confirmed by manual smoke test: toggling `AUTH_MODE` back after
    exercising clerk mode left every pre-existing project reachable again
    with no login.
  - In `clerk` mode it resolves `auth().userId` and JIT-provisions a `users`
    row on first sight (`provisionClerkUser`, `lib/auth/provision.ts`),
    keyed by `clerk_id`. **The first Clerk user to ever sign in becomes
    `admin`**; every user after that starts as `user`. Provisioning runs in
    a transaction behind `pg_advisory_xact_lock(hashtext('vrt-user-provision'))`,
    so two simultaneous first logins can't both count zero and both become
    admin, and the count excludes the none-mode default row (`clerk_id`
    NULL) — a local DB flipped from `none` to `clerk` still hands admin to
    its first login. It is a one-time event, not a per-session check — sign
    in once as the intended admin before creating any other account.
- **`users.email` is what e-mail notifications are sent to** (CLAUDE.md §4
  "Notifications"), which gave that column a job it never had before —
  `local@vrt` used to be a harmless placeholder nobody read.
  `hasRealEmail(user)` (`apps/web/src/lib/auth/email.ts`) is the one test
  **in the web UI**: anything equal to `DEFAULT_USER_EMAIL` (`local@vrt`)
  means **unset**, and the UI says so instead of pretending (the
  notification toggle stays disabled with "Add your e-mail address in the
  account menu first.", and the test-mail action refuses with the same
  sentence — both from `lib/mail-copy.ts`). The worker does **not** re-check
  it — it sends to `run.project.owner.email` unconditionally — and relies on
  `notify_on_failure` never having been turned on without a real address,
  which is a **client-side** gate only: the schemas accept the flag
  unconditionally, so a hand-edited DB row does reach the worker, and the
  send then simply fails at SMTP and is logged.
  - **None mode**: the address is editable, from the header's avatar menu →
    "E-mail address…" (`local-user-menu.tsx` → `email-address-dialog.tsx`,
    ui.md "Shell & theming"). `updateEmailAction` (`apps/web/src/app/
    actions.ts`) parses `updateEmailSchema` and writes `users.email` of the
    default row, then `revalidatePath("/", "layout")`. It **throws in clerk
    mode** on purpose — first thing it checks is `getAuthMode() !== "none"`
    — so the address a signed-in account notifies to can never be edited
    behind Clerk's back.
    **Known limitation:** an address can only be changed, never cleared
    (the zod schema requires a valid one). Opting out of notifications is
    per project, which is where the setting lives anyway.
  - **Clerk mode**: the address is Clerk's, copied into the `users` row by
    `provisionClerkUser` at JIT provisioning time.
    **Known limitation:** it is **not re-synced afterwards** — a user who
    changes their primary e-mail in Clerk's "Manage account" keeps getting
    notifications at the old address, and the avatar menu's header (which
    reads Clerk's live `useUser()` data, not the row) will disagree with it.
    Fixing it properly means a Clerk webhook (`user.updated`) or a re-read
    on each `getOptionalUser()`; neither is worth it while the app has one
    real user. Worth knowing before debugging "the mail went to the wrong
    address".
- **Role quotas live in `role_limits`** (`max_projects`,
  `max_pages_per_project`, `max_automated_runs_per_day` per role) and are
  enforced at every point of use, not just in the UI: project creation, the
  page-list save path, and a project's automated-run allowance — checked
  when a schedule's count is saved or resumed and, silently, by the
  worker's scheduler before firing each occurrence
  (`packages/db/src/quota.ts`, shared with the web app so the scheduler
  gets the same guard). **Admins are unlimited on projects and pages, but
  not on automated runs** — `automatedRunLimitRoleFor` caps them at the
  live `pro` row instead, since one worker runs one Chromium at a time
  regardless of who owns the schedule. **Manual runs (the Run button) are
  never quota-checked** — only a second concurrent run of the same project
  is refused (`assertNoActiveRun`) — and the automated-run allowance is
  spent **per project**, not per owner. Rejections surface as a plain
  error string next to the form/button (e.g. `Project limit reached: 2 of
  2 used.`, `Page limit exceeded: 6 pages, at most 5 allowed.`, or, saving
  a schedule above what the plan allows, `Your plan allows 2 automated
  runs a day for this project.`) — confirmed by manual smoke test, not
  just unit-tested in isolation. The allowance being *used up* (rather
  than the requested count being too high) never rejects a click the same
  way — the scheduler just skips that occurrence and the project page
  shows why. `/settings` (admin, clerk-mode only) edits `role_limits`
  directly and a role change takes effect immediately, since limits are
  looked up by role on every check rather than cached on the user row.
- **What the per-project quota does and doesn't bound.** Because the
  allowance is spent per project, it no longer bounds a whole account's
  automated load — the worst case for one owner is `max_projects ×
  max_automated_runs_per_day` runs a day, spread across their projects.
  **The intended sizes are `DEFAULT_ROLE_LIMITS`** (`packages/shared/src/
  constants.ts`): `user` 3 projects · 3 pages · 1 automated run a day,
  `pro` 6 · 6 · 3 — lowered on 2026-08-19 from 6/5/12 and 12/20/24 after
  working out the worst case in captures (pages × up to 3 viewports ×
  runs × projects, ~10–15 s each on one Chromium): the old `pro` ceiling
  was ~17 000 captures a day for one account, more than the worker can do
  in two days; the new one is 324 (~1 h). The live rows are edited by hand
  in `/settings` (no migration rewrites them — migration 0004's seed is
  older and larger); an existing schedule above the new ceiling is not
  deleted: the scheduler skips its surplus occurrences with
  `quota-exceeded`, and the dialog clamps its count on next open with a
  "reduced from N" notice (ui.md "Scheduling"). That figure bounds *daily
  volume*, not in-flight load: `assertNoActiveRun`
  is the real backpressure on both the manual and the scheduled path — a
  project can never have more than one `queued`-or-`running` run at a time,
  so work in flight across the whole system is capped at one run per
  project, and the scheduler degrades by skipping visibly
  (`last_skip_reason`) rather than by letting a queue grow.

## Clerk keys

**`CLERK_PUBLISHABLE_KEY` is deliberately not `NEXT_PUBLIC_*`.** It's read
server-side at request time (`clerkEnvSchema.parse(process.env)`) and
handed to `<ClerkProvider publishableKey={...}>` as a prop, so one build
artifact can serve any Clerk instance chosen at deploy time via env vars,
instead of baking a specific instance's key into the client bundle at
build time the way `NEXT_PUBLIC_*` would.

**Known trap, confirmed 2026-08-13:** `apps/web/src/middleware.ts` passes
`publishableKey` and `secretKey` as explicit `clerkMiddleware` options
(same request-time reasoning), which puts Clerk into its "dynamic keys" mode, which
additionally requires `CLERK_ENCRYPTION_KEY` (a random 32-byte hex string)
to encrypt those options across the middleware → RSC boundary. Without it,
`clerkMiddleware` throws `Missing CLERK_ENCRYPTION_KEY` — at request time,
not at build time, so it only surfaces once you actually hit a protected
route in clerk mode. It's read automatically from `process.env` by
`@clerk/nextjs` — there's no option to pass it explicitly.

## Registration toggle

**The registration toggle mirrors state into `app_settings`** because
Clerk's Backend API has no single "disable sign-ups" switch, and both
calls it does offer are write-only (`lib/clerk-admin.ts`: `PATCH
/instance/restrictions` with `allowlist: true` plus `PATCH
/beta_features/instance_settings` with `restricted_to_allowlist: true`,
keeping the allowlist itself empty). Since nothing in Clerk's API can be
read back to render a toggle state, `app_settings.registration_open` is the
only place that state exists for the UI to read — kept in sync by writing
both together in the same admin action. (A closed registration surfaces as
Clerk's own restricted-instance message inside the sign-up modal — the
former `/sign-up` page's friendlier "ask the administrator" panel went away
with the page itself, a known trade-off of the modal-auth flow.)

## Ownership & storage authz

**Storage stays unpartitioned; ownership is enforced at the route layer.**
Shots remain content-addressed and globally deduplicated (CLAUDE.md §7) even
under Clerk ownership scoping — `apps/web/src/lib/authz.ts`'s
`canAccessStorageKey` walks shot → run → project → `owner_id` on every
request instead (`canAccessFaviconKey` does the same walk for
`/api/favicons/[key]` — favicon keys are content hashes too). `/api/shots/[key]`,
`/api/favicons/[key]` and the comparison routes 404 (not
403) for a shot or project a non-admin doesn't own, so a direct URL guess
can't even confirm the hash exists. Confirmed by manual smoke test with a
positive/negative pair: the owning admin gets 200 on a shot key, a second
non-owning user gets 404 on the identical key.
