import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_LIMITS } from "@vrt/shared/constants";
import { buildPlanTiers, UNLIMITED_MARK, type PlanTier, type PlanTierId } from "./plan-tiers.js";

const rows = [
  { role: "user" as const, maxProjects: 3, maxPagesPerProject: 7, maxAutomatedRunsPerDay: 11 },
  { role: "pro" as const, maxProjects: 30, maxPagesPerProject: 70, maxAutomatedRunsPerDay: 110 },
];

function tier(tiers: PlanTier[], id: PlanTierId): PlanTier {
  const found = tiers.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`no ${id} tier`);
  }
  return found;
}

describe("buildPlanTiers", () => {
  it("shows the figures an admin edited, not the seeded defaults", () => {
    const tiers = buildPlanTiers(rows);

    expect(tier(tiers, "free").quotas.map((quota) => quota.value)).toEqual(["3", "7", "11", "Unlimited"]);
    expect(tier(tiers, "pro").quotas.map((quota) => quota.value)).toEqual(["30", "70", "110", "Unlimited"]);
  });

  it("falls back to the seeded defaults when a role has no row", () => {
    const tiers = buildPlanTiers([]);

    expect(tier(tiers, "free").quotas[0]?.value).toBe(String(DEFAULT_ROLE_LIMITS.user.maxProjects));
    expect(tier(tiers, "pro").quotas[2]?.value).toBe(String(DEFAULT_ROLE_LIMITS.pro.maxAutomatedRunsPerDay));
    expect(tier(tiers, "pro").quotas[3]?.value).toBe("Unlimited");
  });

  it("marks projects and pages unlimited, with a spoken form", () => {
    const quotas = tier(buildPlanTiers(rows), "self-hosted").quotas;

    // The manual-runs row is unlimited on every tier already, so it reads as
    // plain text there too - only the two genuinely ceiling-free figures need
    // the symbol-plus-spoken-form treatment.
    expect(quotas.slice(0, 2).map((quota) => quota.value)).toEqual([UNLIMITED_MARK, UNLIMITED_MARK]);
    expect(quotas.slice(0, 2).every((quota) => quota.spoken === "Unlimited")).toBe(true);
  });

  it("shows the Pro automated-runs figure on the self-hosted card, not the unlimited mark", () => {
    // Admins are capped at the `pro` allowance on automated runs (CLAUDE.md
    // §12), and in AUTH_MODE=none the single local user is an admin - the
    // "no ceilings" claim would overstate what the code does if this row
    // stayed unlimited.
    const quotas = tier(buildPlanTiers(rows), "self-hosted").quotas;

    expect(quotas[2]).toEqual({ label: "Automated runs per project per day", value: "110" });
  });

  // The cards are read across, not down: the same labels in the same order is
  // what lets the figures line up as a column in the grid.
  it("lists the same quota labels in the same order on every tier", () => {
    const [free, pro, selfHosted] = buildPlanTiers(rows);
    const labels = (candidate: PlanTier | undefined) => candidate?.quotas.map((quota) => quota.label);

    expect(labels(free)).toEqual([
      "Projects",
      "Pages per project",
      "Automated runs per project per day",
      "Manual runs",
    ]);
    expect(labels(pro)).toEqual(labels(free));
    expect(labels(selfHosted)).toEqual(labels(free));
  });
});
