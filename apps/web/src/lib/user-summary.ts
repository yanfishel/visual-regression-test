import { formatTimeAgo } from "./time-ago.js";
import type { UserStats } from "./user-stats.js";

// One line carrying everything the /settings user table drops below `sm`,
// where four numeric columns would push the row wider than the panel. It
// sits under the email so the narrow layout loses no data - only the column
// headings, which this line spells out instead.
export function formatUserSummary(
  stats: Pick<UserStats, "projects" | "runs30d" | "lastRunAt">,
  { projectLimit, joinedAt, now = new Date() }: { projectLimit: number | null; joinedAt: Date; now?: Date },
): string {
  const quota = projectLimit === null ? `${stats.projects}` : `${stats.projects} / ${projectLimit}`;
  return [
    `${quota} ${stats.projects === 1 ? "project" : "projects"}`,
    `${stats.runs30d} ${stats.runs30d === 1 ? "run" : "runs"}`,
    stats.lastRunAt ? formatTimeAgo(stats.lastRunAt, now) : "never run",
    `joined ${joinedAt.toISOString().slice(0, 10)}`,
  ].join(" · ");
}
