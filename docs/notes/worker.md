# Worker, comparison & storage — full notes

Detailed write-ups behind CLAUDE.md §4 (favicon, scheduling), §5, §6, §7 and
§8. The rules and the trap index live there; this file keeps the reasoning
that used to sit only in code comments. Started 2026-08-18.

## Capture & navigation (`apps/worker/src/capture.ts`)

- One browser context per **viewport** (outer loop), pages inside it. The
  context-level steps of §5 (reduced motion, frozen `Date`/`Math.random`,
  UTC + `en-US`, the third-party blocklist) are `newContext` options plus
  `prepareContext`; fonts, lazy images, masks, explicit waits and the
  scroll pass are per page in `stabilizePage()` / `page.screenshot()`.
- `goto` uses `waitUntil: "load"`. HTTP ≥ 400 and non-HTML responses throw a
  `CaptureError` (classified in `capture-failure.ts`) — before this a 404
  page was silently screenshotted and, on a first run, became the baseline.
  A download (PDF) surfaces as `net::ERR_ABORTED`; the content type is then
  probed with `context.request.head()`.
- `context.route` (`BLOCKED_HOST_PATTERNS`) does **not** cover
  `page.request` / `context.request` — the favicon fetch and the HEAD probe
  rely on being unrouted, so a CDN-hosted icon still loads.

## Scroll pass (§5.8)

`buildScrollSettleScript(500)`: viewport-height steps, 500 ms settle per
step, `scrollTo(0, 0)`, another 500 ms, then the caller waits ~300 ms more
before the screenshot. The page height is **re-read from
`document.documentElement.scrollHeight` on every iteration**, never
snapshotted from `document.body` before the loop: `body.scrollHeight`
misses pages that scroll on a wrapper, and a pre-loop snapshot never
reaches content that lazily *grows* the page while the pass runs — both put
Playwright's `fullPage` stitching scroll back in the position of a first
visitor, re-firing reveal animations mid-capture (the §5.8 false positive).

The re-read is also what makes the pass unbounded on a page that grows *as*
it is scrolled — an infinite feed, a "load more on scroll" list — so the loop
stops after `MAX_SCROLL_STEPS` (40) steps regardless of height. 40 viewport
heights is far past anything worth diffing as one screenshot, and at 500 ms a
step it keeps the pass inside the per-page deadline below.

## Watchdogs (`apps/worker/src/deadline.ts`)

**The hang of 2026-08-31.** A scheduled run of one project started at
07:00:54 and was still `running` 27 hours later. The evidence, in the order
it was read:

- the BullMQ job's stored progress was
  `{"phase":"capturing","completed":2,"total":3,"label":"Home @ Mobile"}` —
  the third and last capture of the run, and no `shots` row existed for the
  run at all (they are all written after the capture loop returns);
- from 07:22 onwards, `Error: could not renew lock for job 18` every 7.5 s,
  13 047 times — the lock had expired, the stalled check had moved the job
  back to `wait`, and `bull:vrt-runs:active` was **empty** while the worker
  process was still awaiting that very job's promise;
- inside the container, the Chromium *browser* process was alive with the
  run's uptime, and there was **no renderer process at all**, at 0.12 % CPU;
- the host: 4 GB, **no swap**, shared with a database and three other Node
  apps, ~950 MB available.

So the renderer was killed under memory pressure, Playwright never turned
that into an error, and the call awaiting it never settled. The three
mechanisms that should have caught it each didn't: BullMQ's stalled check
freed the *job* but cannot free a `concurrency: 1` slot held by a promise;
`reconcileStuckRuns` only sweeps at startup and only runs *without* a job;
and the run stayed `running`, so `assertNoActiveRun` skipped both projects'
schedules every minute (`run-in-progress`) — including the other project,
whose own run sat `queued` behind the wedged slot. `docker compose restart
worker` was the whole cure: the stalled-retry guard failed the dead run and
the queued one finished in 30 s.

**What guards it now.** `withDeadline(work, ms, label)` races the work
against a timer and, just as importantly, swallows the abandoned work's
later rejection — a Playwright call abandoned this way usually *does* reject
once its page closes, and an unhandled rejection ends the process. It cannot
cancel anything: nothing in Playwright can cancel an in-flight protocol
call, so every caller has to survive the work finishing later.

| Where | Limit | On expiry |
|---|---|---|
| One page/viewport pair (`capture.ts`, `capturePage`) | 120 s | `capture_failures` row, `kind: timeout` (`classifyCaptureError` knows `DeadlineError` — our watchdog fires where Playwright would never have thrown, so no message says "Timeout"); the run continues with the other pages |
| `page.close()` / `context.close()` / `browser.close()` (`closeQuietly`) | 15 s | logged only — cleanup must never end a run that already has its shots |
| The whole job (`queue.ts`) | 30 min | `process.exit(1)` |
| The region scan (`regions.ts`) | 5 s | null report, screenshot taken regardless (pre-dates this, now on the shared helper) |

The job-level exit is the deliberate part. By 30 minutes the job's lock is
long gone and the queue already counts the worker idle, so the only thing
still held is the concurrency slot — and no in-process cleanup can hand that
back, because the work behind it cannot be cancelled. Docker's `restart:
unless-stopped` brings the worker back in seconds and the stalled-retry
guard in `run-processor.ts` ends the run exactly as it does for any other
worker death mid-run. `capturePage` also owns no cleanup on purpose: the
caller's `finally` closes the page, which is what finally releases whatever
protocol call was parked on it.

Not covered by the per-page deadline, and left to the job-level one:
`browser.newContext()` and `context.newPage()`, which are protocol calls
outside `capturePage`.

## Site favicon (`apps/worker/src/favicon.ts`)

Captured by the worker, never fetched by the web app: while a project has
no `favicon_key`, every run asks `captureProjectShots` for one
(`wantFavicon`), and the first page that captured is asked in order for
`<link rel="icon">` (raster before SVG), `apple-touch-icon` /
`apple-touch-icon-precomposed`, then `/favicon.ico` — via `page.request`
(http(s) only, `maxRedirects: 5`, 512 KB / 5 s caps). Plain `/favicon.ico`
alone is not enough: playwright.dev 404s there and declares its icon in
HTML only. The format is sniffed from the bytes (`sniffImageFormat`; the
SVG sniff inspects the first 1024 bytes; unknown bytes are dropped), never
from the site's Content-Type. The pointer is written only while `base_url`
is still what the run captured from. Release (`apps/web/src/lib/favicon-release.ts`,
on base-URL change and project deletion, only when no other project shares
the key) is best-effort and swallows errors — an orphaned icon file is the
accepted failure mode; the retention sweep is shots-row driven and never
touches favicon files.

## Comparison thresholds (§6)

- ODiff is called with `antialiasing: true`; `failOnLayoutDiff: true` only
  on the first pass — the top-aligned re-compare (`diffTopAlignedRegion`)
  omits it because cropping already equalised the dimensions. ODiff's own
  per-pixel `threshold` is never passed; its default applies.
- `projects.diff_threshold` is a **fraction** (`0.01`); `run-processor.ts`
  multiplies by 100 before comparing with ODiff's `diffPercentage`.
- A first capture writes its comparison as `new` with `baseline_shot_id`
  NULL — the third status alongside `passed`/`failed`.
- The web diff overlay (`app/api/comparisons/[comparisonId]/diff/overlay.ts`)
  has its own sensitivity: `DIFF_THRESHOLD = 24` (sum of per-channel
  deltas), alpha 0.6, `rgb(255,0,64)`. The red picture can therefore
  disagree with the stored `diff_score` — expected, not a bug.

## Region reports (§6)

- **Scan** (`regions.ts`, `segmentPage` runs in the page via `page.evaluate`,
  so it is self-contained): breadth-first from `body`; a node with ≥ 2
  significant children (visible, ≥ 32×64 CSS px, not script/style/
  template/noscript) is split unless it is a semantic unit (`header nav
  section article aside footer form svg` or a landmark role); `main` and
  single-child wrappers are always descended through; a level that would
  exceed 40 regions is not taken; depth ≤ 6. Keys: `tag#id` → `tag[role]`
  → `tag` — no classes (bundler hashes) and no text (a renamed heading is
  a *changed* block). Runs **before** the screenshot (fullPage resizes the
  viewport, §5.8); rects are clipped to the image afterwards
  (`clipRegionsToImage`, `clipRegions` rounds each edge independently —
  `Math.round` on all four, not on the derived size — so two regions that
  share a DOM edge still share it here, though it can shift a size by 1px
  on a non-integer edge). 5 s timeout; any failure logs once and yields
  `null` — the shot is stored regardless.
  **Known trap:** under tsx/esbuild (keep-names), `segmentPage`'s inner
  functions are wrapped in an `__name(fn, "name")` helper that only exists
  in the transpiling process — Playwright serialises the function's
  *source* into the page, where the helper is undefined, so every real
  scan threw `ReferenceError: __name is not defined` and every shot got
  `regions: null`. vitest's transform doesn't inject the helper, so
  `regions.browser.test.ts` never caught it; found by a live run.
  `collectRegions` now evaluates a string prelude,
  `globalThis.__name ??= (fn) => fn`, in the page before the scan, making
  the fix independent of who transpiled the worker.
- **Alignment** (`region-compare.ts`, `alignRegions`): LCS over the key
  sequences; duplicates resolve by position; reorders are removed + added.
- **Comparison** (`compareRegions`): `resized` when the rects differ in
  size (no pixels compared); otherwise both crops go through odiff with
  `antialiasing: true` and the project threshold × 100 — `unchanged` /
  `moved` (same pixels, different origin) / `changed`. Up to 40 odiff
  spawns per shot on small crops; under `concurrency: 1` roughly a minute
  worst-case on a large project. Each side decodes to raw pixels at most
  once, lazily. Byte-identical captures (content-addressed keys, §7 — the
  common case) skip odiff and sharp for identically-placed pairs entirely
  via `identicalImages` — a fully unchanged shot decodes nothing.
- **All-or-nothing**: `regionReportFor` wraps everything, logs `Region
  report for shot <id> failed:` and returns `null` on any throw — a partial
  report would read as "everything else unchanged".
- Tested with a real Chromium (`regions.browser.test.ts`); CI installs it
  (`npx playwright install --with-deps chromium`) between `npm ci` and
  `typecheck`.

## Storage details (§7)

- Keys are `<sha256 of the *encoded* bytes>.<ext>` (WebP or PNG after the
  sharp re-encode; favicons `<sha256>.<format>`). Sharding takes the first
  two hex pairs of the key: `ab/cd/abcd….webp`.
- `put()` writes `<target>.<uuid>.tmp` beside the target and `rename`s it
  (atomic on POSIX; an existing target is simply overwritten — identical
  bytes by construction). If the rename fails the temp file is removed and
  the error rethrown. Not handled: on a Windows host-dev, `rename` over a
  target held open by a reader can fail with `EPERM`.
- `delete()` is `rm --force` (a missing file is not an error); empty shard
  directories are never pruned.
- Serving (`lib/stored-image-response.ts`, shots + favicons):
  `Cache-Control: public, max-age=31536000, immutable`,
  `X-Content-Type-Options: nosniff`, `Content-Length` from `getStream`'s
  size; ENOENT → 404, any other storage error → 500.
- The overlay cache lives under `os.tmpdir()/vrt-diff-overlays` (so `%TEMP%`
  on a Windows host, not `/tmp`). Pruning (`overlay-cache.ts`) removes
  files older than 7 days by mtime, at most hourly per process
  (`lastPruneAt` is module state — N Next.js workers each prune), and only
  runs after a cache **miss + fresh write**: a cache that stops receiving new
  pairs never prunes. The route decodes both images to raw RGBA per request
  with no concurrency limit — fine single-user, a real memory spike on a
  20 000 px page.
- Retention (`retention.ts`): `startRetentionSweeps` runs once at boot and
  every 24 h (`timer.unref()` so the interval can't hold the process open);
  failures are logged and swallowed — an orphan file is the accepted failure
  mode, never a dangling row. `runRetentionSweep(now)` takes the clock as an
  argument for tests.

## Queue helpers (§8)

There are **two** `getRunQueue()` implementations — `apps/web/src/lib/queue.ts`
(cached on `globalThis`, used by `triggerRunAction`) and
`apps/worker/src/run-queue.ts` (module-cached, used by the scheduler). Their
`defaultJobOptions` (`removeOnComplete: { count: 100 }`,
`removeOnFail: { count: 500 }`) must stay identical. `removeOnComplete` is
a *count*, not `true`, on purpose: `apps/web/src/lib/live/source.ts`
re-reads the job by id on the `completed` event. `triggerRunAction` calls
`getRunQueue().add("run", { runId })` without a schema parse — the payload
is validated by `runJobDataSchema` on the consumer side (`queue.ts`).

## Stuck runs and stalled retries

Three different mechanisms end a run whose worker died or wedged, and they
cover different moments:

- **`reconcileStuckRuns()`** (`reconcile.ts`) sweeps at worker **startup**:
  every `queued`/`running` run older than `MIN_ORPHAN_AGE_MS` (60 s) with no
  job in `waiting|active|delayed|paused|prioritized` becomes `failed`. The
  age floor exists because the web action inserts the row *before* it
  enqueues.
- **The stalled-retry guard** in `processRun` catches the other half:
  BullMQ hands the job of a dead worker to the next one, and a run already
  `running` means a previous attempt captured part of it. Re-capturing would
  insert a second `shots` row per page, so the run is **failed on the spot**
  (with `notifyRunFinished`) and only then does the job throw.
  **Known trap:** the throw alone is not enough, and used to be all this did
  — it fails the *job*, and once that job is gone nothing else looks at the
  row again, so the run sat `running` for ever next to a healthy idle
  worker; only the *next* worker restart swept it. Fixed 2026-08-23 with the
  worker heartbeat; the UI half of the same bug is in ui.md "Live updates".
- **The job deadline** in `queue.ts` covers the third case, which neither of
  the two above can see: a worker that is alive, heartbeating and holding a
  job that will never finish (the 2026-08-31 hang — "Watchdogs" above). It
  exits the process, which turns that case back into the ordinary
  worker-died-mid-run one the stalled-retry guard already handles.

## Scheduler internals (`apps/worker/src/scheduler.ts`)

- Each tick claims at most `MAX_DUE_PER_TICK` (50) due rows with
  `for update skip locked`, **ordered by `next_run_at`**, and isolates each
  row in its own savepoint. The order is *why* the savepoint matters: a row
  that throws would otherwise be re-claimed first on every tick and stall
  everything behind it. Enqueue happens only after the transaction commits.
- A row whose tick **threw** gets `last_skipped_at = now` with
  `last_skip_reason = NULL` and `next_run_at` pushed out by
  `FALLBACK_RETRY_MS` (1 h). A non-null `last_skipped_at` with a null reason
  is therefore a legal state meaning "the ticker itself errored", distinct
  from the three business skip reasons (`run-in-progress | no-pages |
  quota-exceeded`).

## Notifications (`apps/worker/src/notify.ts`)

The worker is the **only** sender, because the worker is where a run turns
terminal. Nothing about a sent mail is persisted — no log table, no "notified"
flag on `runs`; the rule is re-derived from the run history each time (see
CLAUDE.md §4 "Notifications" for the rule itself).

- **Five call sites**, all `await notifyRunFinished(runId)` and all after the
  `runs` row has been written to its terminal state:
  `run-processor.ts` ×3 — the capture-failure branch (`status = failed` with
  "N of M captures failed"), the clean finish (`status = done`, which can
  still carry failed *comparisons*), and the `catch` that records a thrown
  worker error before re-throwing to BullMQ; `reconcile.ts` once, per run
  reconciled at startup (a lost scheduled run is a failed scheduled run and
  must notify like any other); and `scheduler.ts` once, in the
  enqueue-failure `catch` — the run row is marked `failed` there and never
  reaches the processor, so without this call that one failure would be
  silent.
- **`notifyRunFinished` never throws.** The whole body is inside one
  `try/catch` that logs `Notification for run <id> failed:` and returns:
  notification is a side effect of a run, not part of it, and a dead SMTP
  host must not fail a run or (in the processor's `catch` branch) mask the
  original error. A successful send logs
  `Notified <address> about failed run <id>`.
- **Mail config is resolved first**, before any DB read: with notifications
  off there is nothing to query for. `mailConfigFrom(process.env)` returning
  `null` logs **one** line per process — "E-mail notifications are off:
  SMTP_URL and MAIL_FROM are not set" — guarded by a module-level
  `unconfiguredLogged` flag, so a worker without SMTP doesn't print it once
  per run forever. A *half* configuration throws instead, and that throw is
  caught by the same handler and logged with the missing variable named.
- **Three DB reads**, and they are injectable `NotifyDeps` functions rather
  than one injected `Database`: the tests stub `loadRun`,
  `failedComparisonCount` and `previousFinishedOutcome` instead of faking
  drizzle's query builder, which would only ever assert against itself.
  - `loadRun` pulls the run `with: { project: { with: { owner: true,
    schedule: true } } }` — the owner for the address, the schedule for the
    IANA zone the e-mail's timestamp is formatted in (falling back to UTC).
  - `failedComparisonCount` groups this run's comparisons by status through
    a join on `shots.run_id`, giving both the failed count and the total for
    the "N of M comparisons failed" line.
  - `previousFinishedOutcome(projectId, before)` is the anti-spam clause:
    the newest run of the same project with `created_at < before` and
    `status in (done, failed)`, run through `runOutcome` with *its* current
    failed-comparison count. Evaluated **now**, not as of when it finished —
    that is what makes approving the previous run's diffs re-arm the next
    e-mail, with the approval model doubling as an acknowledgement.
    Ordering by `created_at` matches every run list (§4): a queued run has
    no `started_at`.
- **`packages/mail`** is the transport and the copy: `createMailer(config)`
  wraps `nodemailer.createTransport` (a plain per-call SMTP session — no
  pooling; a few messages a day) and lets send errors propagate to the
  caller, while `render.ts` holds two pure renderers,
  `renderRunFailedEmail` and `renderTestEmail`, with no transport and no DB
  so the copy is unit-tested. Plain text is the primary body; the HTML twin
  is one inline-styled column with no images — the diffs are looked at in
  the app, the mail's job is to get someone there. `renderTestEmail` is used
  by the web app's `sendTestEmailAction`, which sends directly rather than
  through the run queue: a test must not wait behind a ten-minute run.
- **The transport's timeouts are bounded** — 10 s connect, 10 s greeting,
  30 s socket (`smtpTransportOptions`, `packages/mail/src/mailer.ts`).
  Every caller *awaits* the send inside the job that just finished a run,
  and the worker is `concurrency: 1`, so with nodemailer's defaults
  (2 min connect, 10 min socket) one black-holed SMTP host would stall runs
  — and the live UI, which waits on the job's completion event — for
  minutes each. **Known trap:** the URL is expanded through nodemailer's own
  `parseConnectionUrl` and spread into the options; passing it as
  `createTransport({ url, ...timeouts })` silently drops every sibling
  option, because `createTransport` *replaces* the options object with the
  parsed URL when `url` is present.

## Heartbeat (`apps/worker/src/heartbeat.ts`)

`startWorkerHeartbeat()` writes `vrt:worker:<hostname>:<pid>` to Redis every
`WORKER_HEARTBEAT_INTERVAL_MS` (5 s) with `PX WORKER_HEARTBEAT_TTL_MS`
(15 s), starting with one write at boot so a fresh worker shows up without
waiting a beat. Both constants live in
`packages/shared/src/worker-heartbeat.ts` — the web app reads the same
prefix, and drifting halves would be a silently permanent "offline". Why the
key exists at all, and how the web side reads it: ui.md "Live updates".

- **Why not BullMQ's `getWorkers()`.** It counts Redis connections, and
  ioredis keeps those alive by itself — a worker whose event loop is wedged
  stays "online" forever. A key that must be *rewritten* to survive can only
  be refreshed by a process that still runs timers.
- **Best-effort, like the sweeps.** A failed write is logged and swallowed:
  a Redis blip must not kill the worker, and the next beat corrects the
  state as long as the TTL hasn't elapsed. The interval is `unref()`ed so it
  never keeps the process alive on its own.
- **The stop function deletes the key**, and `index.ts` awaits it as the
  *first* step of `shutdown()` — before `worker.close()`, which waits for
  the active job and can take minutes. A worker on its way out should read
  as offline immediately; the alternative is a UI that claims a healthy
  worker while the container is already stopping.
- **The connection is the heartbeat's own** (`createRedisConnection()`), not
  the BullMQ worker's: BullMQ owns its connections' lifecycle and closes
  them in `close()`, which is exactly when the last `del` still needs to go
  out. It is never closed explicitly — `shutdown()` ends in `process.exit`.
- Tests fake the two commands (`set`/`del`) and run on vitest's fake timers,
  so the interval behaviour is asserted without a Redis.
