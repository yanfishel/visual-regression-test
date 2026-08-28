import { count, eq, gte, inArray, max, sql } from "drizzle-orm";
import { db, projects, runs } from "@vrt/db";

export interface UserStats {
  projects: number;
  runs30d: number;
  /** Newest run across all of the user's projects, or null if they never ran one. */
  lastRunAt: Date | null;
}

export interface ProjectCountRow {
  userId: string;
  projects: number;
}

export interface RunAggregateRow {
  userId: string;
  runs30d: number;
  lastRunAt: Date | null;
}

const ACTIVITY_WINDOW_DAYS = 30;

const EMPTY_STATS: UserStats = { projects: 0, runs30d: 0, lastRunAt: null };

// Every requested user gets a row, including one who owns nothing: the table
// renders a figure per user, and a missing entry would force each cell to
// re-state the zero default.
export function toUserStats(
  userIds: string[],
  projectCounts: ProjectCountRow[],
  runAggregates: RunAggregateRow[],
): Map<string, UserStats> {
  const byProjects = new Map(projectCounts.map((row) => [row.userId, row.projects]));
  const byRuns = new Map(runAggregates.map((row) => [row.userId, row]));
  return new Map(
    userIds.map((userId) => {
      const runRow = byRuns.get(userId);
      return [
        userId,
        {
          ...EMPTY_STATS,
          projects: byProjects.get(userId) ?? 0,
          runs30d: runRow?.runs30d ?? 0,
          lastRunAt: runRow?.lastRunAt ?? null,
        },
      ];
    }),
  );
}

/**
 * Two grouped queries for the whole user table, never one per row - the same
 * batching rule the project cards follow. Run activity is keyed off
 * `runs.createdAt` rather than `startedAt`: a queued run is still something
 * the user did, and `startedAt` is null until the worker picks it up.
 */
export async function getUserStats(userIds: string[]): Promise<Map<string, UserStats>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [projectCounts, runAggregates] = await Promise.all([
    db
      .select({ userId: projects.ownerId, projects: count() })
      .from(projects)
      .where(inArray(projects.ownerId, userIds))
      .groupBy(projects.ownerId),
    db
      .select({
        userId: projects.ownerId,
        // Counted over the window, but the newest run is not: a user whose
        // last activity was two months ago should still show it, so the
        // filter lives in the count expression alone. The condition is built
        // with `gte`, not interpolated by hand - a bare Date in a raw sql
        // template reaches the driver unencoded and throws at query time.
        runs30d: sql<number>`count(*) filter (where ${gte(runs.createdAt, since)})`.mapWith(Number),
        lastRunAt: max(runs.createdAt),
      })
      .from(runs)
      .innerJoin(projects, eq(runs.projectId, projects.id))
      .where(inArray(projects.ownerId, userIds))
      .groupBy(projects.ownerId),
  ]);
  return toUserStats(userIds, projectCounts, runAggregates);
}
