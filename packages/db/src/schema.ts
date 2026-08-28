import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Region, RegionReport } from "@vrt/shared";

export const runStatusEnum = pgEnum("run_status", ["queued", "running", "done", "failed"]);
export const runTriggerEnum = pgEnum("run_trigger", ["manual", "schedule", "webhook"]);
export const comparisonStatusEnum = pgEnum("comparison_status", ["new", "passed", "failed", "approved"]);
export const userRoleEnum = pgEnum("user_role", ["admin", "pro", "user"]);
// Mirrors CAPTURE_FAILURE_KINDS in @vrt/shared - drizzle needs the literal
// list here to type the column.
export const captureFailureKindEnum = pgEnum("capture_failure_kind", [
  "not-html",
  "http-error",
  "unreachable",
  "timeout",
  "selector-timeout",
  "other",
]);
// Mirror SCHEDULE_WINDOWS / SCHEDULE_SKIP_REASONS in @vrt/shared - drizzle
// needs the literal list here to type the columns.
export const scheduleWindowEnum = pgEnum("schedule_window", ["night", "day", "any"]);
export const scheduleSkipReasonEnum = pgEnum("schedule_skip_reason", [
  "run-in-progress",
  "no-pages",
  "quota-exceeded",
]);

// The canonical app user. Clerk only authenticates; a users row is created
// on first login (clerk mode) or silently as a fixed-id default (none mode,
// clerk_id NULL). Roles and quotas always resolve against this table.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").unique(),
  email: text("email").notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Limits are a property of the role only (no per-user overrides - the way to
// change one user's allowance is to change their role). No admin row: admins
// are unlimited on projects and pages, but not on automated runs -
// automatedRunLimitRoleFor (packages/db/src/quota.ts) holds them to the live
// `pro` row instead (CLAUDE.md §12).
export const roleLimits = pgTable("role_limits", {
  role: userRoleEnum("role").primaryKey(),
  maxProjects: integer("max_projects").notNull(),
  maxPagesPerProject: integer("max_pages_per_project").notNull(),
  // Automated runs only. Pressing Run is unlimited: a person clicking is
  // self-limiting and present to read the result, while a schedule can
  // quietly saturate a single-Chromium worker overnight - see CLAUDE.md §12.
  maxAutomatedRunsPerDay: integer("max_automated_runs_per_day").notNull(),
});

// Single-row settings (id is CHECKed to 1 in the migration SQL). Only holds
// what the admin chose for display; enforcement of registration lives in
// Clerk, PATCHed before this row is written (docs/notes/auth.md "Registration
// toggle").
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey(),
  registrationOpen: boolean("registration_open").notNull().default(true),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    diffThreshold: doublePrecision("diff_threshold").notNull().default(0.01),
    // The site's favicon as a content-addressed storage key (`<sha256>.<ext>`,
    // see faviconKeySchema in @vrt/shared), captured by the worker on the
    // first run that finds one and served through /api/favicons. NULL until
    // then, and reset to NULL whenever base_url changes so the next run
    // fetches the new site's icon.
    faviconKey: text("favicon_key"),
    // E-mail the owner (users.email) when a scheduled run of this project
    // fails (CLAUDE.md §4 "Notifications"). On the project, not on
    // project_schedules, so switching the schedule off and on (which
    // recreates that row) keeps the preference.
    notifyOnFailure: boolean("notify_on_failure").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("projects_owner_id_idx").on(table.ownerId)],
);

export const pages = pgTable("pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  label: text("label").notNull(),
  waitSelector: text("wait_selector"),
  maskSelectors: text("mask_selectors").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const viewports = pgTable(
  "viewports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    deviceScaleFactor: doublePrecision("device_scale_factor").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A viewport is matched back to its preset by width alone (see
    // lib/viewport-selection.ts and CLAUDE.md section 4), so two rows with
    // the same width in one project would make that mapping ambiguous - a
    // non-preset row at a preset's width would be mistaken for the preset and
    // block it from ever being added.
    uniqueIndex("viewports_project_id_width_idx").on(table.projectId, table.width),
  ],
);

// One cadence per project; no row means no schedule, which keeps eight
// nullable columns out of `projects`. Fired by the worker's scheduler
// (apps/worker/src/scheduler.ts), never by the web process.
export const projectSchedules = pgTable(
  "project_schedules",
  {
    projectId: uuid("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    // How many times a day this project runs itself, and which part of the
    // day those runs are spread across. The exact minutes are derived, never
    // stored - see runTimesFor in @vrt/shared.
    runsPerDay: integer("runs_per_day").notNull(),
    window: scheduleWindowEnum("window").notNull().default("night"),
    // IANA zone, captured from the viewer when the schedule is saved. "Daily
    // at 03:00" without a zone is not a schedule, and the stored zone
    // deliberately does not follow the browser afterwards.
    timeZone: text("time_zone").notNull(),
    paused: boolean("paused").notNull().default(false),
    // Materialised rather than computed: it makes the due query one indexed
    // read, and lets the project page render "next run" without redoing the
    // arithmetic per request. Recomputed on save, on resume, and after every
    // tick that consumes it - never accepted from the client.
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastSkippedAt: timestamp("last_skipped_at", { withTimezone: true }),
    lastSkipReason: scheduleSkipReasonEnum("last_skip_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Partial index: the ticker only ever asks for unpaused rows that are due.
  (table) => [
    index("project_schedules_due_idx")
      .on(table.nextRunAt)
      .where(sql`paused = false`),
  ],
);

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: runStatusEnum("status").notNull().default("queued"),
    trigger: runTriggerEnum("trigger").notNull().default("manual"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The project page's run list and the homepage's recent-runs sidebar both
  // order by createdAt (per project and globally).
  (table) => [index("runs_project_id_created_at_idx").on(table.projectId, table.createdAt)],
);

// Content-addressed: storageKey is the sha256 of the image bytes, not
// derived from runId/pageId. Most pages are byte-identical between runs, so
// only genuinely changed pages ever get a new file - see CLAUDE.md section 7.
export const shots = pgTable(
  "shots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    viewportId: uuid("viewport_id")
      .notNull()
      .references(() => viewports.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    // The page's top-level blocks as found in the DOM at capture time, in
    // screenshot pixels (apps/worker/src/regions.ts). NULL = the scan failed
    // or the shot predates region reports; [] = scanned, nothing
    // significant on the page. Read through parseRegions, never raw.
    regions: jsonb("regions").$type<Region[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Every run-results read and the failure aggregation join on run_id; the
  // page/viewport FKs also back the cascade-delete paths. storage_key backs
  // canAccessStorageKey's per-image-request authz lookup (apps/web/src/lib/authz.ts).
  (table) => [
    index("shots_run_id_idx").on(table.runId),
    index("shots_page_id_idx").on(table.pageId),
    index("shots_viewport_id_idx").on(table.viewportId),
    index("shots_storage_key_idx").on(table.storageKey),
  ],
);

// A shot that didn't happen: one row per page/viewport pair the worker could
// not capture in a run (404, PDF instead of a page, timeout...). Lets the run
// grid show the missing pair as a card with its reason instead of dropping
// it silently; `runs.error` keeps only whole-run failures and the count.
export const captureFailures = pgTable(
  "capture_failures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    viewportId: uuid("viewport_id")
      .notNull()
      .references(() => viewports.id, { onDelete: "cascade" }),
    kind: captureFailureKindEnum("kind").notNull(),
    // Human-readable, ANSI-free; the classifier's own wording for the kinds
    // it detects itself, Playwright's message (minus its call log) otherwise.
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("capture_failures_run_id_idx").on(table.runId),
    index("capture_failures_page_id_idx").on(table.pageId),
    index("capture_failures_viewport_id_idx").on(table.viewportId),
  ],
);

// The pointer that "approving" moves. Old shots are never deleted on
// approval - this table only ever tracks the current approved shot per
// page/viewport, which gives a free per-page history via the shots table.
export const baselines = pgTable(
  "baselines",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    viewportId: uuid("viewport_id")
      .notNull()
      .references(() => viewports.id, { onDelete: "cascade" }),
    shotId: uuid("shot_id")
      .notNull()
      .references(() => shots.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.pageId, table.viewportId] }),
    // The save action's baseline guard reads all of a project's baselines
    // inside the edit transaction.
    index("baselines_project_id_idx").on(table.projectId),
  ],
);

export const comparisons = pgTable(
  "comparisons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shotId: uuid("shot_id")
      .notNull()
      .references(() => shots.id, { onDelete: "cascade" }),
    baselineShotId: uuid("baseline_shot_id").references(() => shots.id, { onDelete: "set null" }),
    diffScore: doublePrecision("diff_score"),
    // Set only when odiff reports 'layout-diff' (page dimensions changed
    // between runs) - see CLAUDE.md section 6. current shot minus baseline
    // shot, in pixels; null when there was no layout difference. Width can
    // change too (scrollbar/dsf edge cases), so both deltas are recorded.
    heightDelta: integer("height_delta"),
    widthDelta: integer("width_delta"),
    // Per-block companion to diffScore (CLAUDE.md §6): which regions
    // changed, moved, appeared, disappeared. Derived data - never part of
    // the verdict. NULL = no baseline, a side without regions, or the
    // region pipeline failed (logged by the worker). Read through
    // parseRegionReport.
    regionReport: jsonb("region_report").$type<RegionReport>(),
    status: comparisonStatusEnum("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("comparisons_shot_id_idx").on(table.shotId)],
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  schedule: one(projectSchedules),
  pages: many(pages),
  viewports: many(viewports),
  runs: many(runs),
}));

export const projectSchedulesRelations = relations(projectSchedules, ({ one }) => ({
  project: one(projects, { fields: [projectSchedules.projectId], references: [projects.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
  project: one(projects, { fields: [pages.projectId], references: [projects.id] }),
  shots: many(shots),
}));

export const viewportsRelations = relations(viewports, ({ one, many }) => ({
  project: one(projects, { fields: [viewports.projectId], references: [projects.id] }),
  shots: many(shots),
}));

export const runsRelations = relations(runs, ({ one, many }) => ({
  project: one(projects, { fields: [runs.projectId], references: [projects.id] }),
  shots: many(shots),
  captureFailures: many(captureFailures),
}));

export const captureFailuresRelations = relations(captureFailures, ({ one }) => ({
  run: one(runs, { fields: [captureFailures.runId], references: [runs.id] }),
  page: one(pages, { fields: [captureFailures.pageId], references: [pages.id] }),
  viewport: one(viewports, { fields: [captureFailures.viewportId], references: [viewports.id] }),
}));

export const shotsRelations = relations(shots, ({ one }) => ({
  run: one(runs, { fields: [shots.runId], references: [runs.id] }),
  page: one(pages, { fields: [shots.pageId], references: [pages.id] }),
  viewport: one(viewports, { fields: [shots.viewportId], references: [viewports.id] }),
}));

export const baselinesRelations = relations(baselines, ({ one }) => ({
  project: one(projects, { fields: [baselines.projectId], references: [projects.id] }),
  page: one(pages, { fields: [baselines.pageId], references: [pages.id] }),
  viewport: one(viewports, { fields: [baselines.viewportId], references: [viewports.id] }),
  shot: one(shots, { fields: [baselines.shotId], references: [shots.id] }),
}));

export const comparisonsRelations = relations(comparisons, ({ one }) => ({
  shot: one(shots, { fields: [comparisons.shotId], references: [shots.id] }),
  baselineShot: one(shots, { fields: [comparisons.baselineShotId], references: [shots.id] }),
}));

export type Project = typeof projects.$inferSelect;
// Named PageRow, not Page, to avoid colliding with Playwright's Page type
// wherever both are imported (the worker does exactly that).
export type PageRow = typeof pages.$inferSelect;
export type Viewport = typeof viewports.$inferSelect;
export type ProjectSchedule = typeof projectSchedules.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Shot = typeof shots.$inferSelect;
export type Baseline = typeof baselines.$inferSelect;
export type Comparison = typeof comparisons.$inferSelect;
export type CaptureFailureRow = typeof captureFailures.$inferSelect;
// Named UserRow (not User) to avoid colliding with Clerk's User type in the
// web app, matching the PageRow precedent above.
export type UserRow = typeof users.$inferSelect;
export type RoleLimitsRow = typeof roleLimits.$inferSelect;
export type AppSettingsRow = typeof appSettings.$inferSelect;
