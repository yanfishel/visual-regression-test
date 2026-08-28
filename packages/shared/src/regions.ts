import { z } from "zod";

/**
 * Region report - the per-block companion to a comparison's one verdict
 * (CLAUDE.md §6). A region is a top-level block of the page found in the
 * DOM at capture time; the report pairs the baseline's regions with the
 * current shot's and says, block by block, what happened. It is derived
 * data: it never changes `comparisons.status` or `diff_score`.
 *
 * Coordinates are screenshot pixels (CSS px × deviceScaleFactor), already
 * clipped to the image - see the worker's `clipRegions`.
 */
export const REGION_STATUSES = ["unchanged", "moved", "changed", "resized", "added", "removed"] as const;
export type RegionStatus = (typeof REGION_STATUSES)[number];

export const rectSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Rect = z.infer<typeof rectSchema>;

export const regionSchema = rectSchema.extend({
  /** What the comparison matches on across runs: `tag#id`, `tag[role]` or `tag`. */
  key: z.string().min(1),
  /** For people: the key plus the block's first heading, when it has one. */
  label: z.string().min(1),
});
export type Region = z.infer<typeof regionSchema>;

export const regionEntrySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(REGION_STATUSES),
  /** null for `added` */
  baseline: rectSchema.nullable(),
  /** null for `removed` */
  current: rectSchema.nullable(),
  /** odiff's diffPercentage for a compared pair; null when the pair was not pixel-compared. */
  diffScore: z.number().nullable(),
});
export type RegionEntry = z.infer<typeof regionEntrySchema>;

export const regionReportSchema = z.object({
  /** Current-side order; added/removed entries sit where the alignment put them. */
  entries: z.array(regionEntrySchema),
});
export type RegionReport = z.infer<typeof regionReportSchema>;

// Both jsonb columns are read through these, never trusted raw: a row
// written by an older or newer shape must read as "no report", not throw.
export function parseRegions(value: unknown): Region[] | null {
  const parsed = z.array(regionSchema).safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseRegionReport(value: unknown): RegionReport | null {
  const parsed = regionReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function summarizeRegionReport(report: RegionReport): Record<RegionStatus, number> {
  const counts = Object.fromEntries(REGION_STATUSES.map((status) => [status, 0])) as Record<
    RegionStatus,
    number
  >;
  for (const entry of report.entries) {
    counts[entry.status]++;
  }
  return counts;
}
