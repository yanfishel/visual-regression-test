import { db, type RoleLimitsRow } from "@vrt/db";
import { DEFAULT_ROLE_LIMITS, type UserRole } from "@vrt/shared/constants";
import { GITHUB_REPO_URL, mailtoHref } from "./external-links.js";
import { NEW_PROJECT_HREF } from "./query-params.js";

// The About page's plan cards. The two hosted tiers are the `user` and `pro`
// rows of `role_limits` — the same numbers quota.ts enforces and an admin
// edits in /settings — so the pitch can never promise a ceiling the app does
// not honour. The third tier is not a role: self-hosting has no projects/pages
// quota rows to read (every none-mode visitor is the admin those checks skip,
// §12), but its automated-runs row does read the `pro` row — admins are
// capped at the `pro` allowance on automated runs (CLAUDE.md §12), so the
// single none-mode admin has that one ceiling and the card must say so.

/** The mark standing in for a figure a self-hosted install never reaches. */
export const UNLIMITED_MARK = "∞";

export type PlanTierId = "free" | "pro" | "self-hosted";

export type PlanQuota = {
  /** What the figure counts, in the reader's words. */
  label: string;
  /** The figure as rendered — a number, or `UNLIMITED_MARK`. */
  value: string;
  /** Spoken form, set only when `value` is a symbol a screen reader can't say. */
  spoken?: string;
};

export type PlanTier = {
  id: PlanTierId;
  name: string;
  /** Sits where the feature cards put their eyebrow, so it reads as a label. */
  price: string;
  quotas: PlanQuota[];
  body: string;
  cta: { label: string; href: string; external: boolean };
};

/** The columns the cards need, so a test can pass plain objects. */
type LimitsLike = Pick<
  RoleLimitsRow,
  "role" | "maxProjects" | "maxPagesPerProject" | "maxAutomatedRunsPerDay"
>;

type Limits = Omit<LimitsLike, "role">;

// Every card lists the same three figures in the same order, so the numbers
// line up as a column across the grid. Named individually (not just indexed
// into the array) so the self-hosted card can single out the automated-runs
// row below without an unchecked array access.
const PROJECTS_QUOTA: [label: string, read: (limits: Limits) => number] = [
  "Projects",
  (limits) => limits.maxProjects,
];
const PAGES_QUOTA: [label: string, read: (limits: Limits) => number] = [
  "Pages per project",
  (limits) => limits.maxPagesPerProject,
];
const AUTOMATED_RUNS_QUOTA: [label: string, read: (limits: Limits) => number] = [
  "Automated runs per project per day",
  (limits) => limits.maxAutomatedRunsPerDay,
];
const QUOTA_LABELS: [label: string, read: (limits: Limits) => number][] = [
  PROJECTS_QUOTA,
  PAGES_QUOTA,
  AUTOMATED_RUNS_QUOTA,
];

// Pressing Run costs nothing on any plan, and that is the single most
// reassuring fact on the page - so it is a row, not a footnote.
const MANUAL_RUNS_QUOTA: PlanQuota = { label: "Manual runs", value: "Unlimited" };

// A role with no row falls back to the seeded defaults rather than dropping
// the card: the migration inserts both rows, and a public page is the wrong
// place to expose that something is missing.
function limitsFor(rows: readonly LimitsLike[], role: Exclude<UserRole, "admin">): Limits {
  return rows.find((row) => row.role === role) ?? DEFAULT_ROLE_LIMITS[role];
}

function hostedQuotas(limits: Limits): PlanQuota[] {
  return [
    ...QUOTA_LABELS.map(([label, read]) => ({ label, value: String(read(limits)) })),
    MANUAL_RUNS_QUOTA,
  ];
}

// Projects and pages genuinely have no ceiling self-hosted. Automated runs no
// longer belong in that list: admins are capped at the `pro` allowance
// (CLAUDE.md §12), and in AUTH_MODE=none the single local user *is* an admin,
// so this row states the same figure the Pro plan gets instead of a promise
// the code doesn't keep.
function unlimitedQuotas(automatedRunsLimits: Limits): PlanQuota[] {
  return [
    ...[PROJECTS_QUOTA, PAGES_QUOTA].map(([label]) => ({
      label,
      value: UNLIMITED_MARK,
      spoken: "Unlimited",
    })),
    { label: AUTOMATED_RUNS_QUOTA[0], value: String(AUTOMATED_RUNS_QUOTA[1](automatedRunsLimits)) },
    MANUAL_RUNS_QUOTA,
  ];
}

export function buildPlanTiers(rows: readonly LimitsLike[]): PlanTier[] {
  return [
    {
      id: "free",
      name: "Free",
      price: "No cost",
      quotas: hostedQuotas(limitsFor(rows, "user")),
      body: "Enough to watch a small site and find out whether the diffs hold up on your pages.",
      cta: { label: "Create a project", href: NEW_PROJECT_HREF, external: false },
    },
    {
      id: "pro",
      name: "Pro",
      price: "On request",
      quotas: hostedQuotas(limitsFor(rows, "pro")),
      body: "Higher ceilings on this instance. Nothing goes through a checkout — write to me and I raise them.",
      cta: { label: "Ask for Pro", href: mailtoHref("VRT Pro access"), external: true },
    },
    {
      id: "self-hosted",
      name: "Self-hosted",
      price: "Your hardware",
      quotas: unlimitedQuotas(limitsFor(rows, "pro")),
      body: "Docker Compose on a machine you own. No accounts, and the screenshots stay on your disk — projects and pages have no ceiling; automated runs share the same daily cap as Pro.",
      cta: { label: "Get the source", href: GITHUB_REPO_URL, external: true },
    },
  ];
}

/** One query for the whole section — see §9 on batching per screen. */
export async function getPlanTiers(): Promise<PlanTier[]> {
  const rows = await db.query.roleLimits.findMany({
    columns: { role: true, maxProjects: true, maxPagesPerProject: true, maxAutomatedRunsPerDay: true },
  });
  return buildPlanTiers(rows);
}
