# Visual Regression Testing Tool

A self-hosted service that periodically screenshots a list of URLs across multiple
viewports and reports perceptual diffs against approved baselines.

**Working name:** `vrt` (rename freely)

## How the docs are organised

This file is the **rules, the map and the trap index** — short on purpose,
it is loaded into every session. The detail lives next to it:

| Where                                   | What                                                                                   |
|-----------------------------------------|----------------------------------------------------------------------------------------|
| `docs/notes/ui.md`                      | Every UI decision and trap history, screen by screen, plus the **screen map** (which files make up which screen). **Read before touching UI code.** |
| `docs/notes/auth.md`                    | Auth modes, Clerk, roles/quotas, e2e. **Read before touching auth code.**               |
| `docs/notes/worker.md`                  | Capture, favicon, comparison thresholds, storage internals, queue helpers, scheduler internals. **Read before touching the worker or storage.** |
| `docs/notes/deploy.md`                  | Server setup, GitHub secrets, release/rollback procedure and trap history for the release deploy. **Read before touching `scripts/deploy.sh`, `docker-compose.prod.yml` or `deploy.yml`.** |
| Code comments                           | Non-obvious *local* reasoning; many cite a CLAUDE.md section number — **keep §-numbers stable** when editing this file. |

Durable knowledge belongs here or in `docs/notes/`, never in per-machine
assistant memory. When a rule in this file grows a story, move the
story to the notes and leave the rule + a one-line trap here.

### Daily commands (root `package.json`)

| Command                                   | Does                                                                     |
|-------------------------------------------|--------------------------------------------------------------------------|
| `npm run dev` / `npm run dev:clerk`       | `scripts/dev.mjs`: starts postgres+redis containers, waits, migrates, runs web + worker with watchers against localhost (§12, §14). **Nothing loads `.env` for a bare process** (no dotenv anywhere): only Compose and `dev.mjs` supply env, and Next reads `apps/web/.env` itself — `npm run dev:worker` / `start:worker` run directly need `DATABASE_URL`/`REDIS_URL`/`STORAGE_LOCAL_PATH` set by hand — except `scripts/dev.mjs` forwards `SMTP_URL`/`MAIL_FROM` from the root `.env` into the env of **both** children (and defaults `APP_URL`), which wins over Next's own `.env` loading: for mail under `npm run dev` the root `.env` alone is enough, and `apps/web/.env` matters only for a bare `next dev`. Mode-pinned `dev:web:none|clerk` / `start:web:none|clerk` go through `cross-env`. |
| `npm test` · `npm run typecheck` · `npm run lint` · `npm run format` / `format:check` | vitest · tsc across workspaces · ESLint (flat config, `--max-warnings 0`) · Prettier. **CI runs all of these plus `npm run build -w @vrt/web`** (alias `build:web`; `.github/workflows/ci.yml`; a build-only breakage fails CI without any local check failing). |
| `npm run db:generate` / `db:migrate` / `db:seed` | Drizzle migration generate/apply, demo projects. **A schema change needs a dev-server restart** (§9 trap index). |
| `npm run e2e`                             | Playwright auth suite against the real Clerk dev instance, local-only (§12). |
| `docker compose up -d`                    | Whole stack (§2).                                                        |
| `scripts/deploy.sh <tag>`                 | **Server-side only**: what a published GitHub Release runs (§15).       |

---

## 1. Core principle

The hard part is **not** "take a screenshot and compare". The hard part is making
runs **deterministic**. Flaky diffs kill this class of tool: if 8 of 10 runs show
false positives, nobody looks at the report anymore.

Page stabilization is an architectural concern, not a later patch. Every feature
decision should be checked against: *does this make runs more or less repeatable?*

---

## 2. Architecture

Four long-lived processes plus one one-shot, orchestrated with Docker Compose:

| Service    | Role                                                                          |
|------------|-------------------------------------------------------------------------------|
| `web`      | Next.js 15 (App Router) — UI, API routes, enqueues jobs                        |
| `worker`   | Plain Node process — Playwright, screenshots, comparison; on boot `reconcileStuckRuns()`, then the retention sweep (24 h), the schedule ticker (60 s) and the liveness heartbeat (5 s) beside the queue consumer (`apps/worker/src/index.ts`) |
| `postgres` | Metadata, runs, comparisons                                                    |
| `redis`    | BullMQ queue                                                                   |
| `migrate`  | One-shot (`packages/db/Dockerfile`, `npm run migrate`); `web` and `worker` `depends_on` it with `service_completed_successfully` — a stack that "won't come up" is often a failed migration. |

Playwright does **not** belong in serverless functions: heavy browser binaries,
long-running jobs, cold starts. The worker is a long-lived container based on
`mcr.microsoft.com/playwright` (ships every system library Chromium needs).

**Known trap:** use the `-noble` image tag, not `-jammy` — odiff-bin's prebuilt
binary needs `glibc >= 2.38` (jammy has 2.35; fails at *run* time, not build
time). Pin the tag to the `playwright` npm version exactly (currently
`v1.48.0-noble` ↔ `playwright@1.48.0`).

**Known trap:** `apps/web` depends on `sharp` directly too — its base image
(`node:22-slim`, glibc 2.36) can't run odiff, so the on-demand diff-overlay
route (§7) diffs raw pixels with `sharp` instead of shelling out to odiff.

**Known trap:** `docker compose up -d web` does **not** start `worker` (web
only needs Redis to enqueue), so a run can sit in `queued` forever with
nothing wrong at the web layer. The header worker indicator and the project
page's `docker compose up -d worker` hint (`components/live/queued-run-warning.tsx`)
exist to surface this.

### Repository layout

```
/apps
  /web            Next.js app (src/app routes, src/components, src/lib, src/middleware.ts, e2e/)
  /worker         Playwright runner + queue consumer + scheduler + retention (src/*.ts, flat)
/packages
  /db             Drizzle schema + migrations + client + seed + quota.ts (shared with the worker)
  /storage        Storage abstraction (shared)
  /shared         Types, constants, zod schemas, env schemas, schedule maths, redis helper
/scripts/dev.mjs  the one-command dev environment
docker-compose.yml
```

---

## 3. Stack

- **Next.js 15**, App Router, Server Actions, React 19
- **TypeScript** — strict mode + `noUncheckedIndexedAccess`, no `any`
- **Drizzle ORM** + PostgreSQL (`postgres` driver); **BullMQ** + Redis (ioredis)
- **Playwright** (Chromium only today; Firefox/WebKit later)
- **ODiff** (`odiff-bin`) for image comparison (native binary, fast on large
  images, antialiasing flag)
- **sharp** for PNG → lossless WebP in the worker, and the diff overlay in
  `apps/web` (see §2's glibc note)
- **Tailwind CSS 3** + **Radix UI primitives** (tooltip, slider, dialog,
  dropdown-menu, popover, select, tabs, toast, accordion) styled with the
  app's own design tokens — no full component library. **react-day-picker**
  for the one calendar (run date-range filter). **framer-motion** on the
  landing page only. No Zustand: the diff viewer's state is local to one
  component tree (§9)
- **vitest** for unit tests (`*.test.ts` beside the module), **Playwright
  test** for the local-only e2e auth suite

---

## 4. Data model

Source of truth: `packages/db/src/schema.ts` (enums live in
`packages/shared/src/constants.ts` and are mirrored as pg enums; most tables
carry `created_at` — `role_limits`/`app_settings` don't, `baselines` has
`updated_at` instead).

```
users             id, clerk_id (nullable UNIQUE; null in none mode), email, role (admin|pro|user)
role_limits       role PK, max_projects, max_pages_per_project, max_automated_runs_per_day  -- §12
app_settings      id (CHECKed = 1), registration_open                     -- §12
projects          id, owner_id → users (NOT NULL), name, base_url, diff_threshold (default 0.01), favicon_key,
                  notify_on_failure (default false)
pages             id, project_id, path, label, wait_selector, mask_selectors[]
viewports         id, project_id, label, width, height, device_scale_factor
                  UNIQUE (project_id, width)                              -- see presets
project_schedules project_id PK → projects, runs_per_day, window, time_zone, paused,
                  next_run_at, last_run_at, last_skipped_at, last_skip_reason  -- see "Scheduling"
runs              id, project_id, status, trigger, error, started_at, finished_at, created_at
shots             id, run_id, page_id, viewport_id, storage_key, width, height, regions
baselines         PK (page_id, viewport_id) → shot_id, project_id (from the shot's page), updated_at
comparisons       id, shot_id (UNIQUE — one per shot), baseline_shot_id (nullable, SET NULL),
                  diff_score, height_delta, width_delta (nullable), status, region_report
capture_failures  id, run_id, page_id, viewport_id, kind, message  -- a shot that didn't happen
```

`comparisons.status`: `new | passed | failed | approved` (`new` = first
capture, no baseline yet) · `runs.status`: `queued | running | done |
failed` · `runs.trigger`: `manual | schedule | webhook` (`schedule` written
by the worker's ticker; `webhook` a reserved placeholder known only to the
display maps) · `capture_failures.kind`: `not-html | http-error |
unreachable | timeout | selector-timeout | other` · `project_schedules.window`:
`night | day | any` · `project_schedules.last_skip_reason`:
`run-in-progress | no-pages | quota-exceeded` (a *null* reason with a
non-null `last_skipped_at` means the ticker itself errored — worker.md).

Run lists order by `runs.created_at` (indexed with `project_id`), not
`started_at` — a queued run has no `started_at` yet.

A page/viewport pair the worker couldn't capture gets a `capture_failures`
row (classified in `apps/worker/src/capture-failure.ts`, message ANSI-free);
`runs.error` then holds only the count ("3 of 6 captures failed") and is
otherwise reserved for whole-run failures. **The worker fails a capture on
4xx/5xx and on non-HTML responses** — before this a 404 page was silently
screenshotted and, on a first run, became the baseline (worker.md).

`shots.regions` (jsonb, `Region[]`, NULL = not scanned / pre-feature, `[]` =
scanned, nothing significant) and `comparisons.region_report` (jsonb,
`RegionReport`, NULL = no baseline, a side without regions, or the pipeline
failed) — types and zod schemas in `packages/shared/src/regions.ts`
(`@vrt/shared/regions`), **always read through `parseRegions` /
`parseRegionReport`**, never raw.

### Site favicon

`projects.favicon_key` is a content-addressed storage key
(`<sha256>.<ico|png|svg|gif|jpg|webp>`, `faviconKeySchema` in `packages/shared`),
**captured by the worker** (`apps/worker/src/favicon.ts`, off the first page
that captured, format sniffed from the bytes — details in worker.md), never
fetched by the web app; written only while `base_url` is still what the run
captured from. **A base-URL change resets it to NULL** (`saveProjectAction`);
the old file — and a deleted project's — is released best-effort by
`lib/favicon-release.ts` when no other project shares the key (the
retention sweep never touches favicon files). Served by `/api/favicons/[key]`
(scoped by `canAccessFaviconKey`, immutable cache, CSP `sandbox` — an SVG
opened directly would otherwise script on our origin). The UI shows a globe
placeholder until the key exists (`components/site-favicon.tsx`).

### Viewport presets

`viewports` rows are only ever created from `VIEWPORT_PRESETS`
(`packages/shared/src/constants.ts`: Desktop 1200×800 / Tablet 768×1024 /
Mobile 375×812, `deviceScaleFactor: 1`); a preset just fills the columns.

- `height` is the **browser window** height, never asked in the UI — captures
  are `fullPage`; window height only affects lazy loading and sticky elements.
- **Preset widths must stay unique** — there is no `preset` column; rows are
  matched back to presets by width (`lib/viewport-selection.ts`) and the DB
  enforces `UNIQUE (project_id, width)`. Custom viewports were dropped
  (§13): a non-matching row is a leftover that can only be deleted —
  saving drops it unconditionally (subject to the baseline guard). Saving
  requires at least one preset.
- Deselecting a preset (or removing a page) **deletes** it, cascading to
  shots — unless a shot is still an approved baseline.
  **Known trap:** `baselines.shot_id`'s `ON DELETE RESTRICT` does *not*
  enforce this — Postgres fires RI triggers in constraint-creation order, and
  the cascade FKs delete the `baselines` row before RESTRICT can see it. The
  real guard is application-level (`lib/baseline-guard.ts`, inside the save
  transaction); the `23503` catch is only a backstop.

### Run-result ordering

One comparator, `compareGridOrder` in `apps/web/src/lib/grid-order.ts`:
page (label, then id — two pages may share a label; a missing page row sorts
last), then viewport (widest first, label as tiebreaker), then the entry's
own id (`shot_id` for shots, `capture_failures.id` for failure cards). The
run-results grid (`buildRunGrid` + `groupRunGrid` in the run route's
`data.ts`), the comparison-detail prev/next (shots only), the project page's
shot slider (`lib/run-slides.ts`) and the `/projects` card preview
(`lib/project-cards.ts`) all sort through it and must keep doing so — the
slider and the preview once had their own label-based sorts and disagreed.

### Approval model

Approving a comparison **only moves the pointer** in `baselines`. Old shots
are never deleted on approval — free per-page history timeline. Single and
bulk approve (the run page's "Approve all" / per-page "Approve N") share
`lib/approve-comparisons.ts`; bulk takes every *pending* comparison of the
run — `PENDING_APPROVAL_STATUSES` = `failed` + `new`, never `passed` (within
threshold means the baseline stands) — in one transaction. A fully passed
run shows no approve buttons at all.

### Scheduling

One optional `project_schedules` row per project — no row means no
schedule. A schedule is a **count and a window**, not a clock time:
`runs_per_day` (1..`maxRunsPerDay(window)`) and `window` (`night | day |
any` — 20:00–08:00, 08:00–20:00, the full day; `SCHEDULE_WINDOW_HOURS`).
Clock times are **derived, never stored** — `runTimesFor`
(`packages/shared/src/schedule.ts`) spreads them evenly, centred in their
intervals, capped at one run an hour (so 12/12/24 max).

`next_run_at` is **materialised** — recomputed server-side on save, on
resume and after every tick, never accepted from the client — so the due
query is one indexed read (`project_schedules_due_idx`, partial on
`paused = false`). All zone arithmetic lives in `schedule.ts`
(`computeNextRunAt` is strictly-after, which is what makes "no catch-up" an
invariant — see its doc comment). The worker's ticker
(`apps/worker/src/scheduler.ts`, 60 s) claims due rows with `for update
skip locked`, isolates each row in its own savepoint and enqueues through
BullMQ only after the transaction commits — like any other run
(internals: worker.md). A due occurrence that cannot run records
`last_skip_reason` instead of creating a run — a skipped occurrence is not
a failed run and must never enter the run history. UI side: ui.md
"Scheduling".

### Notifications

E-mail only, **worker-sent, best-effort** (`apps/worker/src/notify.ts`;
package `packages/mail` — nodemailer wrapper + pure renderers; env
`SMTP_URL`/`MAIL_FROM`/`APP_URL` via `mailEnvSchema` in
`packages/shared/src/env.ts`). Mail is **configured iff both SMTP vars are
set**; exactly one of them, or a missing `APP_URL` beside them, throws
naming what is missing — and that throw comes out of `getMailConfigured()`
(`lib/mail-status.ts`), which the none-mode header and both project screens
call on render, so a half-config **takes the whole UI down**, not just the
mail path: deliberately loud, because a silently-never-sending toggle is
worse. `APP_URL` alone is *not* "half-configured" (Compose and
`scripts/dev.mjs` both default it, so it is the normal state of an instance
that sends no mail) — and it is only *validated* once the switch is on, so
a typo in it can't take the pages down on an instance with no SMTP.
Recipient is always the owner's `users.email` (none mode: `local@vrt` =
unset, entered from the avatar menu — §9, auth.md).

The rule (`shouldNotifyRunFailure`): `trigger != manual` ∧
`projects.notify_on_failure` ∧ outcome `failed` ∧ the previous *finished*
run's outcome — evaluated **now**, from its comparisons as they stand — not
`failed`. So it is **one mail per failure**, and approving the previous
run's diffs re-arms the next one. `runOutcome` lives in
`@vrt/shared/run-outcome` for exactly this: the worker and the UI must not
grow a second "did it fail" rule (§9). **Nothing about mail is persisted** —
no log table, no "sent" flag; the run history is the source of truth.
Internals (call sites, logging): worker.md.

---

## 5. Page stabilization (critical)

`apps/worker/src/stabilize.ts` (`prepareContext` + `stabilizePage`) and
`capture.ts`. One browser context per **viewport**, pages inside it: steps
1, 4, 5 are context-level, the rest per page. Each step exists because it
caused a false positive (details: worker.md):

1. **Animations** — the context is created with `reducedMotion: "reduce"`,
   and a context-level init script (with a MutationObserver) zeroes
   `animation-*`/`transition-*` duration and delay, `scroll-behavior`, and
   hides the caret. Otherwise you catch a button mid-hover-transition.
2. **Fonts** — await `document.fonts.ready`, **twice**: before and after the
   scroll pass (scrolling mounts sections that start new webfont loads).
3. **Lazy images** — scroll to the bottom, scroll back to top, wait until every
   `img` reports `complete === true`.
4. **Time and randomness** — `context.addInitScript` replaces the whole `Date`
   constructor with one frozen at `FIXED_EPOCH_MS` and `Math.random` with a
   seeded LCG. Kills "5 minutes ago" labels, rotating banners, carousels.
   The context also pins `timezoneId: "UTC"` + `locale: "en-US"` — a frozen
   instant still *renders* through the host zone/locale.
5. **Third-party requests** — `context.route` blocks analytics, chat widgets,
   ads (`BLOCKED_HOST_PATTERNS`). They load unpredictably and often paint over
   content. (`page.request`/`context.request` are not routed — the favicon
   fetch and the content-type probe rely on this.)
6. **Masks** — `page.screenshot({ mask: selectors.map(s => page.locator(s)) })`
   for avatars, counters, timestamps; per page via `mask_selectors`.
7. **Explicit waits** — prefer a per-page `wait_selector` over
   `waitForLoadState('networkidle')`, which is unreliable on sites that poll.
8. **Scroll-triggered reveal animations** — `animation-duration: 0s` doesn't
   kill JS/spring-driven (Framer Motion) animations, and `fullPage` screenshots
   scroll the page again internally to stitch, re-firing `whileInView` reveals
   mid-capture. Fix: our own top-to-bottom scroll pass first (500 ms settle
   per step, **re-reading `scrollHeight` every step** so lazily-growing pages
   are walked to their real end) plus a final ~300 ms settle. Confirmed on a
   real site: identical-run diff dropped from ~7.7% to ~1.2%.
9. **One Chromium at a time** — the BullMQ worker runs with `concurrency: 1`
   (`apps/worker/src/queue.ts`); concurrent runs fight over CPU and make the
   timing-sensitive steps above less reliable.

---

## 6. Comparison

ODiff, `antialiasing: true`, `failOnLayoutDiff: true` on the first pass
(the top-aligned re-compare omits it — dimensions are already equal);
ODiff's own per-pixel `threshold` is never passed. The project's
`diff_threshold` is applied by our code after ODiff (`run-processor.ts`).

**Known trap:** if page heights differ between runs, naive comparison reports
"everything changed" from the vertical shift. Handling: align to the top edge
(`diffTopAlignedRegion`) and store the size difference separately in
`comparisons.height_delta` / `width_delta` (region-based comparison from DOM
bounding boxes, below, is what shipped on top of this).

**Two different thresholds — don't conflate them.** ODiff's `threshold` is a
*per-pixel* color tolerance, not a mismatch budget. The project's
`diffThreshold` is the *aggregate* acceptable mismatch — a **fraction**
(`0.01`), multiplied by 100 before comparing with ODiff's `diffPercentage`.
Even back-to-back runs of a stabilized page differ by a few hundred pixels
(~0.01%, antialiasing noise) — the aggregate check is what makes those
`passed`. The web diff overlay (§7) has a third, independent sensitivity
(`overlay.ts`), so the red picture may disagree with `diff_score` — expected.

**Region report**: beside the verdict, not part of it. The
worker scans the DOM before each screenshot (`apps/worker/src/regions.ts`,
≤ 40 blocks, semantic elements as units), aligns baseline and current
blocks by key with an LCS (`region-compare.ts`) and runs **the same odiff
call and the same threshold** on each matched pair's crops, so a region's
`unchanged` means what a comparison's `passed` means. Statuses `unchanged
| moved | changed | resized | added | removed`; a reordered block is
`removed` + `added` by design. The whole pipeline is best-effort — any
failure logs and stores NULL; it never changes `status`/`diff_score` and
never fails a run (worker.md "Region reports").

---

## 7. Storage

No S3 dependency. One `Storage` interface (`packages/storage/src/types.ts`),
local filesystem driver by default and the only one today
(`STORAGE_DRIVER=local` — the only accepted value; `STORAGE_LOCAL_PATH`;
`STORAGE_URL_PREFIX` optional, `/api/shots` defaulted by the `LocalStorage`
constructor — `packages/shared/src/env.ts`).

```ts
interface Storage {
  put(key: string, buf: Buffer): Promise<void>
  get(key: string): Promise<Buffer>
  getStream(key: string): Promise<StorageStream>   // { stream: ReadableStream<Uint8Array>; size: number }
  delete(key: string): Promise<void>
  urlFor(key: string): string
}
```

`getStream` exists for serving routes: a `fullPage` PNG can be tens of MB and
`get()` holds a full copy per concurrent request; the size lets routes set
`Content-Length` (`lib/stored-image-response.ts`, shared by the shots and
favicon routes).

### Rules

- **Content-addressed keys** — `<sha256 of the encoded bytes>.<ext>`. Most
  pages are byte-identical between runs (~85–90% less disk), and deletion is
  safe: a file is removed only when no `shots` row references its hash.
- **Directory sharding** — `ab/cd/abcdef….webp` (first two hex pairs of the key).
- **Lossless WebP** via sharp in the worker (30–50% smaller than PNG).
  **Known trap:** WebP hard-caps dimensions at 16383px; tall `fullPage` shots
  exceed it and sharp throws. Fall back to lossless PNG, detected by decoded
  pixel dimensions before encoding — not by matching the error string.
- **Never store diff images.** Diffs are derived — generated on demand in an
  API route (`api/comparisons/[comparisonId]/diff`), cached under
  `os.tmpdir()/vrt-diff-overlays` (age-bounded, best-effort prune —
  `overlay-cache.ts`, worker.md; no size cap — fine single-user). Only
  `diff_score` (+ deltas) goes to the DB.
- **Serving** — stream through a Route Handler with `Cache-Control:
  immutable`; a content-hash URL's bytes never change.
- **Write race** — write a temp file beside the target, then `rename`
  (atomic; overwriting an existing target is harmless — identical bytes).
- **Feature code never touches `fs`** — only via `Storage`. The two deliberate
  exceptions are ephemeral: the overlay cache above, and the worker's
  `mkdtemp` scratch dir that hands PNGs to the odiff binary.

### Retention

`apps/worker/src/retention.ts`, run at worker start and every 24 h after
(`startRetentionSweeps`, no fixed clock time; failures logged and swallowed
— an orphan file is the accepted failure mode, never a dangling row). Keep
all shots 30 days; after that keep only current baselines and **both sides**
of a `failed` comparison (deleting the baseline side would orphan the diff's
provenance). The sweep deletes the unprotected `shots` rows first, then any
file whose hash no remaining row references.

### Migration path

If external storage is ever needed: **Cloudflare R2** (zero egress fees —
the thing that makes S3 expensive for a screenshot gallery). Swapping drivers
should be one env variable.

### Local development

`docker-compose.yml` mounts `./.data/shots` into `worker` and `web` at
`/data/shots` — a **bind mount, not a named volume**, deliberately: a
host-run `next dev`/worker (against `docker compose up postgres redis`)
points its own `STORAGE_LOCAL_PATH` at the same host path and reads the same
shots (`scripts/dev.mjs` sets this). With a named volume the host process
sees every run `done` but every image 404s.

---

## 8. Roadmap

Everything once planned has shipped — capture pipeline, Compose stack + §4
schema + BullMQ worker + CRUD, the four-mode diff viewer with approvals
(§9), scheduling (§4), e-mail notifications (§4) and region reports (§6).
§13 lists the decisions that must not be reverted. One item stays open:

- **GitHub Action (deferred, uncertain).** Running against a PR preview
  deploy and commenting with diff images needs an external API and a second
  authorization model; not committed to. `runs.trigger = "webhook"` is the
  reserved placeholder (no producer yet).

  Starting points for it (scheduling followed this pattern; the Action
  would reuse it too): `triggerRunAction`
  (`app/(app)/projects/[projectId]/actions.ts` — one transaction:
  `findProjectForUser` + `assertNoActiveRun`, insert the `runs` row,
  `getRunQueue().add("run", { runId })`, mark the run `failed` if enqueue
  throws) is the enqueue path to reuse; `startRetentionSweeps`
  (`apps/worker/src/retention.ts`, wired in `index.ts`) is the pattern for a
  periodic worker task; enqueue **only via the BullMQ queue** — live updates
  hang off its `QueueEvents`; keep `concurrency: 1`.
  **Known trap:** web (`lib/queue.ts`) and worker (`run-queue.ts`) each have
  a `getRunQueue()` whose `defaultJobOptions` must stay identical;
  `removeOnComplete: { count: 100 }` is load-bearing for live updates
  (worker.md).

---

## 9. UI & theming

Full write-ups, trap histories and the **screen map** (which components/lib
modules make up each screen): **`docs/notes/ui.md`** — read it before
touching UI code. Layout: `components/*.tsx` is flat except `landing/`,
`live/`, `settings/`; pure helpers are plain modules in `lib/*.ts` with a
vitest file beside them; route folders hold only `page.tsx`/`data.ts`/
`actions.ts`. The rules that must not be broken (→ ui.md heading):

- **Design tokens** — CSS custom properties in `app/globals.css` (`:root`
  light, `.dark` dark) exposed as Tailwind colors via `tailwind.config.ts`;
  components use the utilities, never `var(--…)` (only SVG paint / inline
  gradients in the charts may). Hues carry meaning: `success`/`danger` are
  verdicts, never a run *trigger* (`accent`/`info`/`warning` = manual/
  scheduled/webhook; `info` also = plain-user role). Theme menu flips `dark`
  on `<html>`; only an explicit choice persists (`localStorage` `vrt-theme`,
  applied by a `beforeInteractive` script). → *Shell & theming*
- **One primitive per job**: reusable classes (`.btn*`, `.panel`,
  `.field-input`, `.pill-*`, `.status-dot`) in `globals.css` `@layer
  components`; SVG icons in `components/icons.tsx`; **every modal
  `modal.tsx` (Radix dialog), every value picker `select-menu.tsx` (Radix
  Select) or `combobox.tsx` (Radix Popover + search), menus Radix
  DropdownMenu, every notification a toast (`useToast()`), every tooltip
  Radix — never the native `title` attribute.** → *Shell & theming*, *Toasts*
- **Colour is never the only carrier of meaning**: hatch + spelled-out
  legend on charts, role names in `sr-only` text next to role dots.
- **Two shells, one header/footer**: `app/(app)/layout.tsx` is the centered
  `max-w-5xl` column; the landing (`components/landing/`, framer-motion with
  `useReducedMotion` fallbacks) is full-bleed at `/` for signed-out visitors
  and permanently at `/about`. **Home is `/projects` for anyone
  `getOptionalUser()` resolves** (`app/page.tsx`). `/about#plans` reads
  `role_limits` live (the whole app is `force-dynamic`, `app/layout.tsx`);
  **`/about#faq` (`lib/faq.ts`) is the app's only help text** — a behaviour
  change changes an answer. Header: no nav, no "New project", wordmark
  `hidden sm:inline`, three 30px controls (worker indicator, avatar, theme).
  **The avatar menu exists in both modes** — `user-menu.tsx` (clerk; a
  "Sign in" button in its place when signed out) and `local-user-menu.tsx`
  (none), both on the shared chrome of `user-menu-frame.tsx`, never Clerk's
  `UserButton`. It holds admin `/settings`, "Help & FAQ" (`/about#faq`) and
  "About VRT"; the none-mode one adds "E-mail address…" (§4
  "Notifications") and drops Settings and Sign out. Nested screens open with
  `Breadcrumbs`, not back-links. → *Landing page*, *Shell & theming*
- **List state lives in the URL**, param names only in `lib/query-params.ts`
  (`/projects` `q`/`filter`/`page`/`owner`; `/settings` `tab`/`uq`/`urole`/
  `upage`; run table `outcome`/`from`/`to`/`rpage`); filtering/paging in JS
  on the server page over batched queries, never one per row/card
  (`lib/project-cards.ts` six for the whole list, `lib/user-stats.ts` two,
  `lib/run-comparison-counts.ts` one). → *Project cards*, *Settings screen*,
  *Project run table*
- **Project config is modal-only** (`project-dialog.tsx` creates and edits,
  three tabs General · Pages · Schedule with state summaries on the
  triggers, local until Save, one zod-parsed JSON `payload` via
  `lib/form-state.ts`, existing pages update in place by id) — the only
  write path for pages/viewports after creation. `/settings` autosaves (plain-argument
  actions returning `ActionResult` + toasts). → *Project setup dialogs*,
  *Settings screen*
- **A run's pill shows its *outcome*, never raw `runs.status`**:
  `runOutcome(status, hasFailedComparisons)` — exported from
  `@vrt/shared/run-outcome` (`lib/run-outcome.ts` re-exports it and adds
  only the pill classes), so the worker's e-mail rule (§4 "Notifications")
  applies the very same definition →
  `queued | running | passed | failed`; `failed` on `runs.status = failed`
  (worker error, any capture failure, reconciled lost job) *or* any `failed`
  comparison (approving flips it back). `run-outcome-pill.tsx` renders it
  everywhere; the same function drives the `/projects` outcome filter and
  the timeline. No second "did it fail" rule.
- **Every run timestamp renders through `components/local-time.tsx`** in the
  viewer's zone (`vrt-tz` cookie, `lib/viewer-time-zone.ts` +
  `TimeZoneProvider` — no flash); only the `/projects` timeline buckets by
  the *server's* day (`lib/run-history.ts`) — and **names the buckets there
  too** (`key`/`weekdayInitial`/`label`/`tooltipLabel` on `RunHistoryDay`):
  `runs-timeline.tsx` must never format `day.date` itself. In a browser
  whose calendar day differs from the server's the letters disagree,
  hydration fails, React 19 re-renders the root and the theme class on
  `<html>` is gone. → *Project run table*
- **Run page**: grid grouped by page (`groupRunGrid`), cards titled by
  viewport, capture failures as cards in the same grid, per-page "Approve N"
  + footer "Approve all" (hidden at 0 pending or while running). Cards carry
  a one-line region summary (`formatRegionSummary`) only when something
  other than `unchanged` happened. → *Run results grid*
- **Diff viewer** (`comparison-viewer.tsx`): one client component, four
  modes (`SelectMenu`, keys `1`–`4`) sharing its `mode`/`zoom`/`pan`;
  controls in a toolbar above the image, never floating over it; caption
  strip names the sides (baseline left / current right); pan clamped and
  re-clamped on drag/zoom/mode/image-load. Prev/next (`comparison-nav.tsx`,
  `←`/`→`) walk the run in grid order (§4); approving redirects to the next
  pending one (`lib/comparison-walk.ts`). Region overlays are SVGs with a
  `viewBox` in screenshot pixels inside the transformed `ShotLayer` wrapper
  (`region-overlay.tsx`), never positioned by hand; statuses are encoded by
  colour **and** stroke pattern; `R` toggles; the list under the image
  (`region-list.tsx`) pans to a region through `clampPan`.
  → *Diff viewer*, *Comparison page*
- **Live updates**: one SSE feed (`app/api/events/`, client
  `live/live-provider.tsx`), not WebSockets; events are a *signal* (a `run`
  event debounces `router.refresh()` ~300 ms), Postgres stays the source of
  truth; progress lives only in the BullMQ job (`job.updateProgress()`).
  `workersOnline` counts **worker heartbeat keys** (`vrt:worker:<host>:<pid>`,
  written every 5 s with a 15 s TTL — `packages/shared/src/worker-heartbeat.ts`,
  `apps/worker/src/heartbeat.ts`, `lib/live/workers.ts`), never BullMQ's
  `getWorkers()`, which counts Redis connections and so calls a wedged worker
  online. An expiring key fires no event, so the bridge also re-reads the
  queue state every 5 s and publishes only what changed
  (`lib/live/queue-changes.ts`); a **rising** `workersOnline` also triggers
  `router.refresh()` (`workerJoined`, `lib/live/worker-return.ts`) — a
  booting worker reconciles stuck runs straight in Postgres, which reaches
  the page as no event at all. Queue figures are role-scoped
  (`deriveOwnQueue`, `lib/live/own-queue.ts`); `workersOnline` stays global.
  → *Live updates*

**Trap index** (full stories in `docs/notes/ui.md`):

- A `"use client"` file's named exports are client-reference stubs on the
  server: query-param names live in `lib/query-params.ts`, `OFF_SCHEDULE`
  and the schedule-copy helpers in `lib/schedule-display.ts` (both plain
  modules); `schedule-fields.tsx` only *re-exports* `OFF_SCHEDULE` for client
  callers — server code imports the lib.
- Client components import `@vrt/shared/constants` / `@vrt/shared/schedule`
  by subpath, never the package root — the barrel drags `ioredis` into the
  bundle (`Can't resolve 'net'`). Same failure one module further: a runtime
  import of a `lib/*` module that touches `@vrt/db` (`owner-filter.tsx` and
  `runs-timeline.tsx` import types only — that is why the timeline's trend is
  a *field* on `RunHistory`, not a helper the component calls).
- Tokens are raw `var(--…)` colors: Tailwind alpha modifiers
  (`border-danger/40`) can't work — use a `-soft` token.
- The global `:focus-visible` ring belongs in `@layer base` and must set no
  `border-radius` — unlayered it outranks `outline-none` on Radix items; a
  radius squares off the round avatar trigger.
- Flex toolbar rows need `shrink-0` per group, or `min-width: auto` lets one
  group wrap its text at surprisingly wide viewports.
- A schema change needs a **dev-server restart**, not just a migration:
  `packages/db/src/client.ts` caches the drizzle instance on `globalThis`, so
  a new table is `undefined` under `db.query.*` until `npm run dev` restarts.
- Never run `next build` while `next dev` serves the same `.next` dir (it
  corrupts the dev manifest). A **new color in `tailwind.config.ts`** also
  needs `.next` cleared — a plain restart reuses the cached CSS.
- Landing: `HeroDiffSlider`'s current-run skeleton must stay the in-flow
  child (it gives the mock its height), the baseline is the absolute
  overlay; `.landing-grid` draws its grid + mask on a `::before` layer; the
  FAQ's `.accordion-answer` keyframes stay plain CSS (they interpolate
  `--radix-accordion-content-height`).
- Diff-viewer pan: `draggable={false}` alone doesn't stop native image drag —
  also `select-none`, `[-webkit-user-drag:none]`, `onDragStart` preventDefault.
  The curtain handle pins to the *container's* center and must
  `stopPropagation()` on `onPointerDown`.
- SSE: `createEventStreamResponse` (`app/api/events/handler.ts`) checks
  `signal.aborted` before subscribing *and* after the snapshot await — an
  abort listener added after the event fired never runs, and each
  early-aborted request would leak a subscriber + keep-alive timer.
- Unsized inline SVG icons (`CheckIcon`, `XIcon`) inside a `.btn` grab the
  width and wrap the label — always pass `className="h-4 w-4"`. A
  server-rendered `<img>` needs a `complete && naturalWidth === 0` mount
  check besides `onError` (`site-favicon.tsx`).
- react-day-picker: convert Dates ↔ `YYYY-MM-DD` through `getFullYear/Month/
  Date`, never `toISOString`; a hover style on `.rdp-day_button` must exclude
  `.rdp-selected`.
- A bare `Date` interpolated into a raw drizzle `sql` template reaches the
  driver unencoded and throws — use `gte(...)` etc. (`lib/user-stats.ts`).
- Resuming a paused schedule **recomputes `next_run_at` from now**
  (`toggleScheduleAction`) — otherwise a week-old pause fires the instant it
  resumes. No client component reads the clock for a schedule's relative
  label: `now` arrives as a prop fixed at request time (a `Date` on the
  server-rendered `project-card.tsx`, an ISO string on the client
  `schedule-status.tsx`) — a client `new Date()` would hydrate differently on
  these `force-dynamic` pages.

---

## 10. Conventions

- **All code, identifiers, comments, commit messages and documentation in English.**
- **Prettier owns formatting** (`.prettierrc.json`, `printWidth` 110,
  `endOfLine: "lf"`): run `npm run format` before committing; CI runs
  `format:check`. **Markdown is deliberately excluded** (`.prettierignore`) —
  the docs are hand-wrapped.
  **Known trap:** `endOfLine: "lf"` needs `.gitattributes` (`* text=auto
  eol=lf`); without it a Windows clone checks out CRLF and `format:check`
  fails locally on every file. After pulling that file the first time,
  refresh once with `git rm --cached -r . && git reset --hard`.
- **One branch per task, never commit to `master` directly** — even for
  one-line fixes: `git checkout -b <descriptive-name>` before the first edit,
  without asking. Continuing the same task on its existing feature branch is
  fine.
- Strict TypeScript. Shared types live in `packages/shared`, never duplicated.
- Zod for every external boundary (env vars — `packages/shared/src/env.ts`,
  parsed at call time, never at module load; API payloads; config files).
- Unit tests with vitest next to the module (`foo.test.ts`); pure logic goes
  in `lib/*.ts` so it is testable without React or the DB. vitest has no
  `@/` alias — a unit-tested route module imports `lib/*` relatively.
- No secrets in the repo — `.env.example` is committed, `.env` is not.
- Storage access only through the `Storage` interface, never `fs` directly from
  feature code (the two ephemeral exceptions are listed in §7).
- Batched queries per screen, never per row/card (§9).

## 11. Anti-patterns

- Do **not** put Playwright behind a serverless function.
- Do **not** store screenshots in Postgres.
- Do **not** serve images through anything other than the storage layer.
- Do **not** add MinIO or any S3 client while the local driver works.
- Do **not** skip stabilization steps "for now". Every one of them is there
  because it produced a false positive.
- Do **not** delete shots on approval; the pointer moves, history stays.
- Do **not** use native `title` tooltips, native `<select>` where options
  carry markup, or a second "did the run fail" rule (§9).

---

## 12. Auth modes

Full write-ups and trap histories: **`docs/notes/auth.md`** — read it before
touching auth code. The essentials (→ auth.md heading):

`AUTH_MODE=none` (default) or `clerk`, read at request time by
`apps/web/src/lib/auth/mode.ts` — never at module load (`next build` imports
route modules before the runtime env exists). One build serves either mode.
→ *Mode selection*

- **Auth runs in Clerk's modals** — no `/sign-in`/`/sign-up` pages (route
  dirs must not exist). Signed-out visitors are sent to `SIGN_IN_HREF`
  (`/?sign-in=1`, `lib/query-params.ts`); the landing auto-opens the modal
  (`components/sign-in-opener.tsx`). Both flows land on `/projects` via
  provider-level `*FallbackRedirectUrl` (fallback, not force — a bounced deep
  link's `redirect_url` still wins). `/` and `/about` are the only public
  routes in `middleware.ts`; `/` itself redirects a *signed-in* visitor to
  `/projects` (§9). → *Modal auth flow*
- **The local `users` table is canonical, not Clerk.** `getOptionalUser()`
  (`lib/auth/user.ts`) is the one entry point in both modes: `none` uses the
  fixed default user (`…0001`, `local@vrt`); `clerk` JIT-provisions by
  `clerk_id` (`lib/auth/provision.ts`). **The first Clerk user ever to sign
  in becomes `admin`** — a one-time event, so sign in as the intended admin
  before any other account exists. → *Users, roles, quotas*
- **Role quotas** live in `role_limits` (project and page quotas in
  `apps/web/src/lib/quota.ts`; the automated-run quota and the one-active-run
  rule in `packages/db/src/quota.ts`, shared with the worker's scheduler),
  edited in `/settings` (admin, clerk-mode only). Admins are unlimited on
  projects and pages (`roleLimitsFor` returns `null`) but **not** on
  automated runs (`automatedRunLimitRoleFor` holds them to the live `pro`
  row — one worker, one Chromium). **Manual runs are unlimited on every
  role**; `max_automated_runs_per_day` counts only non-`manual` triggers,
  **spent per project, not per owner**. `assertNoActiveRun` (one
  `queued`-or-`running` run per project) is the real in-flight backpressure
  on both paths — the scheduler degrades by skipping visibly, never by
  letting a queue grow. Limits are looked up by role on every check, never
  cached on the user row. → *Users, roles, quotas*
- **`npm run e2e`** is the Playwright auth suite against the real Clerk dev
  instance (six tests incl. the full modal sign-in; test users, the 424242
  code and the admin password are in auth.md); local-only, deliberately not
  in CI. **Stop any `npm run dev` first** — the config reuses an existing
  server on port 3000, and a none-mode one fails every test.
  → *Dev commands & environment*, *E2E suite*

**Trap index** (full stories in `docs/notes/auth.md`):

- `CLERK_PUBLISHABLE_KEY` is deliberately **not** `NEXT_PUBLIC_*` (a
  request-time prop, so one build serves any instance). `middleware.ts`
  passes `publishableKey` + `secretKey` explicitly → "dynamic keys" mode →
  `CLERK_ENCRYPTION_KEY` becomes required; missing it throws at request time
  only. → *Clerk keys*
- The registration toggle mirrors its state into
  `app_settings.registration_open` — Clerk's restriction APIs are write-only.
  → *Registration toggle*
- Ownership is enforced at the route layer (`lib/authz.ts`); non-owners get
  **404, not 403** on `/api/shots/[key]`, `/api/favicons/[key]` and the
  comparison routes, so a URL guess can't confirm a hash exists.
  → *Ownership & storage authz*
- Local dev needs `apps/web/.env` kept in sync with the root `.env` — Next
  resolves env files from `apps/web`'s cwd, Compose from the repo root.
- Clerk's sign-*up* UI sits behind Cloudflare Turnstile — automate sign-*in*
  only; create test users via the Backend API.

---

## 13. Decisions to keep

This file plus `docs/notes/` is the project knowledge that travels with
the repo — assistant auto-memory is per-machine and does not transfer, so
anything durable belongs here, not there. Decisions that are easy to
"improve" back into a mistake:

- Custom (non-preset) viewports were dropped — don't re-add them; presets
  are matched by width (§4 "Viewport presets").
- Scheduling is per-project count-and-window, not a per-owner allowance
  with clock times (§4 "Scheduling").
- Notifications are e-mail only; a chat-bot channel was considered and
  dropped before any code.
- The run-outcome donut on the project page was removed once the shot
  slider took its slot — don't restore it.
- The SSE keep-alive has no second race: `ReadableStream.start()` runs
  synchronously at construction and no await separates the aborted check
  from the subscription — don't "fix" it.

## 14. New machine setup

Everything except secrets is in the repo. On a fresh machine:

1. Prereqs: Node 22+ (CI pins 22; there is no `engines` field, so an older
   Node fails late, not at `npm install`), Docker Desktop. `scripts/dev.mjs`
   finds the Docker CLI in its default Windows install dir even when it's not
   on PATH.
2. `npm install` at the repo root.
3. Recreate the two git-ignored env files from `.env.example` (or copy them
   from the old machine): repo-root `.env` and `apps/web/.env`, kept in sync
   (§12). `.env.example` carries everything Compose needs (`POSTGRES_*`,
   `DATABASE_URL`, `REDIS_URL`, `STORAGE_*`, `AUTH_MODE`); the Clerk values
   (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_ENCRYPTION_KEY`)
   exist **only** in those files — without them only `AUTH_MODE=none` works.
   The three mail variables (`SMTP_URL`, `MAIL_FROM`, `APP_URL`) are
   optional: leave them out and notifications are simply off (§4
   "Notifications").
4. `npm run dev` (or `dev:clerk`) — starts postgres+redis containers, waits,
   migrates, then runs web + worker with watchers. `npm run db:seed` for the
   demo projects.
5. Don't copy `.data/shots` or the Postgres volume: a fresh machine simply
   starts with an empty DB, and the first run per page/viewport auto-creates
   its baseline.

---

## 15. Deployment

Full write-up (server setup commands, secrets, trap history):
**`docs/notes/deploy.md`**. The rules:

- **A published GitHub Release deploys itself.** `.github/workflows/deploy.yml`
  (`release: published`, drafts and prereleases excluded) SSHes into the
  server as the `deploy` user, checks the tag out in the server's clone
  (`DEPLOY_PATH`, `/home/vrt/app`) and runs `scripts/deploy.sh <tag>` from *that*
  checkout: fetch → checkout → `docker compose build --pull` → `up -d
  --remove-orphans` → prune dangling layers → poll the published web port
  for up to 60 s. **Rollback = the same workflow by hand** (`workflow_dispatch`
  with an older tag) or `scripts/deploy.sh <old-tag>` on the server.
- **Images build on the server, there is no registry.** The build is the
  slow part (Playwright base image + `next build`); a VPS under 4 GB needs
  swap or `next build` dies of OOM. Deploys serialise
  (`concurrency: deploy`, no cancel) — a cancelled build would leave the
  old containers already stopped.
- **`docker-compose.prod.yml` is layered over the base file** and only
  changes ports: `web` on `127.0.0.1:${WEB_PORT:-3000}` (server `.env`)
  behind the host's own reverse proxy, `postgres`/`redis` unpublished
  (`!override`, not a merge — the base file's `"3000:3000"` would otherwise
  stay). `deploy.sh` asks `compose port web 3000` which host port to poll
  instead of assuming it. Everything else
  (migrate one-shot, bind-mounted `.data/shots`, env from `.env`) is the
  §2 stack as-is; the migrations run on every deploy through the
  `migrate` dependency.
- **Secrets live in two places, never three:** the server's `.env`
  (hand-edited, `chmod 600`, never in GitHub) and five GitHub Actions
  secrets that only describe the SSH hop (`DEPLOY_HOST`, `DEPLOY_USER`,
  `DEPLOY_PATH`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`). The deploy key is
  a dedicated ed25519 pair; `known_hosts` is pinned, not `ssh-keyscan`ned
  at run time.
- **Known trap:** `.data/shots` must exist and be owned by **uid 1001**
  before the first `up` — `pwuser` in the `-noble` Playwright image is
  1001 (1000 is Ubuntu's own user there), and a bind-mount directory
  Docker creates itself is root-owned. `web` (`node`, uid 1000) only
  reads, plus a best-effort favicon delete that just logs. `deploy.sh`
  `mkdir -p`s the directory; the one-time `chown 1001:1001` is in
  deploy.md.
- **Known trap:** Compose interpolates `$NAME` inside `.env` values — a
  password containing `$` reaches the containers truncated, with only a
  `"NAME" variable is not set` warning. Escape it as `$$`.
- **Known trap:** `deploy.sh` replaces *itself* mid-run (`git checkout`),
  so the whole body sits in `main()` called on the last line — bash reads
  scripts incrementally and would otherwise continue in the new file at
  the old offset.
- The reverse proxy must not buffer `/api/events` (SSE, §9 "Live updates")
  — nginx: `proxy_buffering off` + a long `proxy_read_timeout` for that
  location.
