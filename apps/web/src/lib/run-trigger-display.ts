import type { RunTrigger } from "@vrt/shared/constants";

// How a run was started, as shown in run lists. "scheduled" rather than the
// enum's "schedule": the label answers "how did this run start", not "what
// kind of thing is it".
export const RUN_TRIGGER_LABEL: Record<RunTrigger, string> = {
  manual: "manual",
  schedule: "scheduled",
  webhook: "webhook",
};

// One hue per trigger so the column scans without reading: manual is the
// accent (the user's own action, same colour as the Run button), scheduled
// the info blue, webhook the warning amber. Deliberately none of
// success/danger - those mean outcomes, and a trigger is not a verdict.
export const RUN_TRIGGER_TEXT_CLASS: Record<RunTrigger, string> = {
  manual: "text-accent",
  schedule: "text-info",
  webhook: "text-warning",
};
