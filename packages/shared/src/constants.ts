export const RUN_STATUSES = ["queued", "running", "done", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_TRIGGERS = ["manual", "schedule", "webhook"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const COMPARISON_STATUSES = ["new", "passed", "failed", "approved"] as const;
export type ComparisonStatus = (typeof COMPARISON_STATUSES)[number];

// Why one page/viewport pair produced no shot. Assigned by the worker
// (apps/worker/src/capture-failure.ts) and rendered by the run page; the
// raw Playwright message travels alongside, this is the coarse bucket the UI
// labels and gives advice for.
export const CAPTURE_FAILURE_KINDS = [
  "not-html", // the URL answered with a PDF/download/other non-HTML document
  "http-error", // 4xx/5xx status - a wrong path, auth wall, or a broken server
  "unreachable", // DNS, connection or TLS failure before any response
  "timeout", // navigation (or a stabilization wait) never finished
  "selector-timeout", // the page's wait_selector never became visible
  "other",
] as const;
export type CaptureFailureKind = (typeof CAPTURE_FAILURE_KINDS)[number];

export const RUN_QUEUE_NAME = "vrt-runs";

// Image formats a site favicon may be stored in, keyed by the extension the
// worker puts on the storage key (chosen by sniffing the bytes, never by
// trusting the site's Content-Type) and mapped to the type the serving
// route answers with. Anything else the site hands out is dropped.
export const FAVICON_FORMATS = {
  ico: "image/x-icon",
  png: "image/png",
  svg: "image/svg+xml",
  gif: "image/gif",
  jpg: "image/jpeg",
  webp: "image/webp",
} as const;
export type FaviconFormat = keyof typeof FAVICON_FORMATS;
export const FAVICON_FORMAT_IDS = Object.keys(FAVICON_FORMATS) as [FaviconFormat, ...FaviconFormat[]];

// Viewports are picked from this fixed set rather than typed in by hand: a
// project's viewport list is part of what makes runs comparable over time, and
// three well-known widths keep baselines meaningful. `height` is the browser
// window height only - every capture is fullPage, so the shot is as tall as the
// page turns out to be - which is why it is never asked for in the UI. Widths
// must stay unique: an existing viewport row is matched back to its preset by
// width (see apps/web/src/lib/viewport-selection.ts).
export const VIEWPORT_PRESETS = [
  { id: "desktop", label: "Desktop", width: 1200, height: 800, deviceScaleFactor: 1 },
  { id: "tablet", label: "Tablet", width: 768, height: 1024, deviceScaleFactor: 1 },
  { id: "mobile", label: "Mobile", width: 375, height: 812, deviceScaleFactor: 1 },
] as const;

export type ViewportPreset = (typeof VIEWPORT_PRESETS)[number];
export type ViewportPresetId = ViewportPreset["id"];

export const VIEWPORT_PRESET_IDS = VIEWPORT_PRESETS.map((preset) => preset.id) as [
  ViewportPresetId,
  ...ViewportPresetId[],
];

export const USER_ROLES = ["admin", "pro", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// The none-mode default user has a fixed id so get-or-create can race safely
// on `ON CONFLICT (id) DO NOTHING` — users.clerk_id is nullable-unique, and
// Postgres treats NULLs as distinct, so clerk_id can't dedupe this row.
export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_USER_EMAIL = "local@vrt";

// The intended role_limits values: what the /about plan cards fall back to
// when a row is missing (lib/plan-tiers.ts) and what a fresh instance should
// be set to in /settings, where the admin owns the live rows. (Migration 0004
// seeded a fresh database with an older, larger set; the live rows are the
// source of truth, never this constant.) Admin has no row — projects and
// pages are unlimited for admins, but automated runs are not:
// automatedRunLimitRoleFor (packages/db/src/quota.ts) holds admins to the
// live `pro` row instead, since one worker runs one Chromium at a time
// regardless of who owns the schedule (CLAUDE.md §12).
//
// Sized for one worker on a small box. A run is pages x
// viewports (up to 3) captures at ~10-15 s each, strictly one at a time, so
// an account's worst case is max_projects x max_automated_runs_per_day x
// max_pages_per_project x 3: 27 captures (~6 min of worker time) a day for
// `user`, 324 (~1 h) for `pro`. Manual runs are unlimited on top of that
// (CLAUDE.md §12) - these numbers bound only what schedules can ask for.
export const DEFAULT_ROLE_LIMITS: Record<
  Exclude<UserRole, "admin">,
  { maxProjects: number; maxPagesPerProject: number; maxAutomatedRunsPerDay: number }
> = {
  user: { maxProjects: 2, maxPagesPerProject: 4, maxAutomatedRunsPerDay: 3 },
  pro: { maxProjects: 4, maxPagesPerProject: 6, maxAutomatedRunsPerDay: 6 },
};

// A schedule says how many times a day and which part of the day, never at
// which minute - the minutes are derived (see runTimesFor). Windows are
// local wall-clock spans; `night` crosses midnight, which is why the span is
// expressed as a start hour plus a length rather than start/end.
export const SCHEDULE_WINDOWS = ["night", "day", "any"] as const;
export type ScheduleWindow = (typeof SCHEDULE_WINDOWS)[number];

export const SCHEDULE_WINDOW_HOURS: Record<ScheduleWindow, { start: number; length: number }> = {
  night: { start: 20, length: 12 },
  day: { start: 8, length: 12 },
  any: { start: 0, length: 24 },
};

// Why a due occurrence produced no run. Assigned by the worker's scheduler
// and rendered by the project page; the enum is the coarse bucket, the UI
// owns the wording and the advice (lib/schedule-display.ts) - the same
// arrangement CAPTURE_FAILURE_KINDS uses.
export const SCHEDULE_SKIP_REASONS = ["run-in-progress", "no-pages", "quota-exceeded"] as const;
export type ScheduleSkipReason = (typeof SCHEDULE_SKIP_REASONS)[number];
