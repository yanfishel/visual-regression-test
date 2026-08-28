import { z } from "zod";
import {
  FAVICON_FORMAT_IDS,
  VIEWPORT_PRESET_IDS,
  RUN_STATUSES,
  SCHEDULE_WINDOWS,
  USER_ROLES,
} from "./constants.js";

// What the dialog submits for a project's cadence; `null` means no schedule.
// `max(24)` is only an outer bound - the window's real ceiling (at most one
// run an hour, see maxRunsPerDay) and the project's plan allowance are both
// re-checked server-side, where the limit is known (schedule-write.ts).
export const scheduleInputSchema = z.object({
  runsPerDay: z.number().int().min(1).max(24),
  window: z.enum(SCHEDULE_WINDOWS),
  // Validated as a real IANA zone server-side (isSupportedTimeZone); the
  // length bound here only keeps a hostile payload small.
  timeZone: z.string().min(1).max(100),
});
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

// A page as entered in the UI, without a project id - the new-project dialog
// submits these before the project exists, and createPageSchema reuses the
// same shape once it does.
export const pageInputSchema = z.object({
  path: z.string().min(1),
  label: z.string().min(1).max(200),
  waitSelector: z.string().max(500).optional().or(z.literal("")),
  maskSelectors: z.array(z.string().min(1)).default([]),
});
export type PageInput = z.infer<typeof pageInputSchema>;

const viewportPresetIdSchema = z.enum(VIEWPORT_PRESET_IDS);

const uniquePresetIds = z.array(viewportPresetIdSchema).transform((ids) => [...new Set(ids)]);

// A project is created together with its viewports and pages in one dialog, so
// it is validated as one payload and inserted in one transaction: a project
// with no pages or no viewports can never be run anyway.
export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  baseUrl: z.string().url(),
  viewportPresetIds: uniquePresetIds.refine((ids) => ids.length > 0, {
    message: "Pick at least one viewport",
  }),
  pages: z.array(pageInputSchema).min(1, "Add at least one page"),
  schedule: scheduleInputSchema.nullable().default(null),
  // E-mail the owner when a scheduled run fails (CLAUDE.md §4 "Notifications").
  // Stored even when the instance has no SMTP configured - the UI disables
  // the toggle then, but a value saved earlier must not be lost.
  notifyOnFailure: z.boolean().default(false),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// Editing goes through the same dialog as creating, so it submits the whole
// project at once: an existing page carries its id, a new one doesn't, and an
// id that disappears from the list means the page was removed.
export const pageDraftSchema = pageInputSchema.extend({
  id: z.string().uuid().optional(),
});
export type PageDraftInput = z.infer<typeof pageDraftSchema>;

export const saveProjectSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(200),
  baseUrl: z.string().url(),
  // A preset is always required - presets are the only supported
  // configuration, see the viewport-presets notes in CLAUDE.md section 4.
  viewportPresetIds: uniquePresetIds.refine((ids) => ids.length > 0, {
    message: "Pick at least one viewport",
  }),
  pages: z.array(pageDraftSchema).min(1, "Add at least one page"),
  schedule: scheduleInputSchema.nullable().default(null),
  // E-mail the owner when a scheduled run fails (CLAUDE.md §4 "Notifications").
  // Stored even when the instance has no SMTP configured - the UI disables
  // the toggle then, but a value saved earlier must not be lost.
  notifyOnFailure: z.boolean().default(false),
});
export type SaveProjectInput = z.infer<typeof saveProjectSchema>;

// Aggregate mismatch budget across the whole image, applied by our own code
// after odiff returns its per-pixel diff - see CLAUDE.md section 6.
export const projectSettingsSchema = z.object({
  diffThreshold: z.number().min(0).max(1).default(0.01),
});
export type ProjectSettingsInput = z.infer<typeof projectSettingsSchema>;

// Storage keys are content hashes used directly in URLs - validated at the
// route-handler boundary so a crafted key can never escape the storage root
// (the local driver joins it straight into a filesystem path). Extension is
// usually webp, but the worker falls back to png for shots too tall for
// WebP's 16383px dimension cap.
export const shotKeySchema = z.string().regex(/^[a-f0-9]{64}\.(webp|png)$/, "Invalid shot key");

// Same shape for a project's stored favicon (projects.favicon_key), with the
// formats of FAVICON_FORMATS.
export const faviconKeySchema = z
  .string()
  .regex(new RegExp(`^[a-f0-9]{64}\\.(${FAVICON_FORMAT_IDS.join("|")})$`), "Invalid favicon key");

// Validated at the diff-route boundary for the same reason shotKeySchema
// is - reject a malformed path param before it reaches a DB query.
export const comparisonIdSchema = z.string().uuid();

// The run page's bulk approve: every not-yet-approved comparison of the run,
// or only those of one page (the per-group button).
export const approveRunSchema = z.object({
  runId: z.string().uuid(),
  pageId: z.string().uuid().optional(),
});
export type ApproveRunInput = z.infer<typeof approveRunSchema>;

// Payload enqueued onto the BullMQ run queue - deliberately minimal, the
// worker re-reads pages/viewports/masks from the DB at job time so config
// edited after enqueue but before the job runs is never stale.
export const runJobDataSchema = z.object({
  runId: z.string().uuid(),
});
export type RunJobData = z.infer<typeof runJobDataSchema>;

// What the worker reports through job.updateProgress and what the browser
// receives verbatim - one definition, validated at both boundaries.
// `comparing` is a separate phase because WebP encoding plus odiff is a large
// share of a run's wall clock on long pages; without it a run looks stuck at
// "8/8 captured".
export const runProgressSchema = z.object({
  phase: z.enum(["capturing", "comparing"]),
  completed: z.number().int().min(0),
  total: z.number().int().min(0),
  label: z.string(),
});
export type RunProgress = z.infer<typeof runProgressSchema>;

export const liveQueueStateSchema = z.object({
  waiting: z.number().int().min(0),
  active: z.number().int().min(0),
  workersOnline: z.number().int().min(0),
});
export type LiveQueueState = z.infer<typeof liveQueueStateSchema>;

export const liveRunStateSchema = z.object({
  runId: z.string().uuid(),
  projectId: z.string().uuid(),
  status: z.enum(RUN_STATUSES),
  progress: runProgressSchema.nullable(),
});
export type LiveRunState = z.infer<typeof liveRunStateSchema>;

// Everything the SSE stream can send. `snapshot` is sent once per connection
// (and again after a reconnect), so a client never has to replay history.
export const liveEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("snapshot"),
    queue: liveQueueStateSchema,
    runs: z.array(liveRunStateSchema),
  }),
  z.object({ type: z.literal("queue"), queue: liveQueueStateSchema }),
  z.object({ type: z.literal("run"), run: liveRunStateSchema }),
]);
export type LiveEvent = z.infer<typeof liveEventSchema>;

export const updateUserRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(USER_ROLES),
});
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

const limitValue = z.number().int().min(0).max(100000);
export const saveRoleLimitsSchema = z.object({
  limits: z
    .array(
      z.object({
        // Admin has no limits row by design - only the two limited roles.
        role: z.enum(["user", "pro"]),
        maxProjects: limitValue,
        maxPagesPerProject: limitValue.pipe(z.number().min(1)),
        maxAutomatedRunsPerDay: limitValue,
      }),
    )
    .min(1),
});
export type SaveRoleLimitsInput = z.infer<typeof saveRoleLimitsSchema>;

export const toggleRegistrationSchema = z.object({ registrationOpen: z.boolean() });
export type ToggleRegistrationInput = z.infer<typeof toggleRegistrationSchema>;

// Pause/resume is a one-click action separate from the project dialog - see
// toggleScheduleAction. The row must already exist; this never creates one.
export const toggleScheduleSchema = z.object({
  projectId: z.string().uuid(),
  paused: z.boolean(),
});
export type ToggleScheduleInput = z.infer<typeof toggleScheduleSchema>;

// The none-mode owner's address, entered through the account menu.
export const updateEmailSchema = z.object({
  email: z.string().trim().email("Enter a valid e-mail address").max(320),
});
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
