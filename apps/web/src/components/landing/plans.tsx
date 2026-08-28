import Link from "next/link";
import type { ReactNode } from "react";
import { CameraIcon, GithubIcon, MailIcon, RocketIcon, ServerIcon } from "@/components/icons";
import { Reveal } from "@/components/landing/reveal";
import { PLANS_SECTION_ID } from "@/lib/landing-sections";
import { getPlanTiers, UNLIMITED_MARK, type PlanTierId } from "@/lib/plan-tiers";

// The three quota figures are the point of this section, so every card lists
// the same three labels in the same order (buildPlanTiers guarantees it) and
// prints the value in mono at one size — read across, the numbers line up as
// a column. Self-hosted is the emphasized card, not a middle "recommended"
// one: there is no checkout to nudge anybody toward, and running your own
// copy is what the project actually offers.
const FEATURED: PlanTierId = "self-hosted";

const TIER_ICON: Record<PlanTierId, ReactNode> = {
  free: <CameraIcon className="h-4 w-4" />,
  pro: <RocketIcon className="h-4 w-4" />,
  "self-hosted": <ServerIcon className="h-4 w-4" />,
};

// Hues carry the same meaning they do on role badges (§9): the free tier is
// the plain `user` role's info, Pro is the `pro` role's success. Self-hosted
// is no role at all, so it takes the app's accent.
const TIER_CHIP: Record<PlanTierId, string> = {
  free: "bg-info-soft text-info",
  pro: "bg-success-soft text-success",
  "self-hosted": "bg-accent-soft text-accent",
};

const CTA_ICON: Record<PlanTierId, ReactNode> = {
  free: null,
  pro: <MailIcon />,
  "self-hosted": <GithubIcon />,
};

/**
 * The About page's plan comparison, linkable as `/about#plans`. Reads the
 * live `role_limits` rows, so the figures are the ones quota.ts enforces —
 * which is why both pages rendering LandingContent must stay dynamic.
 */
export async function PlansSection() {
  const tiers = await getPlanTiers();

  return (
    <section id={PLANS_SECTION_ID} className="mx-auto w-full max-w-5xl scroll-mt-24 px-6 pb-24">
      <Reveal className="max-w-2xl">
        <h2 className="text-2xl font-extrabold tracking-tight">Limits, not paywalls</h2>
        <p className="mt-2 text-text-muted">
          Nothing here goes through a checkout. This instance caps how much one browser can chew through — ask
          for more, or run your own copy and drop the ceiling entirely.
        </p>
      </Reveal>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {tiers.map((tier, index) => {
          const featured = tier.id === FEATURED;
          const newTab = tier.cta.href.startsWith("http");
          const ctaClass = `btn ${featured ? "btn-primary" : "btn-quiet"} w-full justify-center`;
          const ctaIcon = CTA_ICON[tier.id];

          return (
            <Reveal key={tier.id} delay={index * 0.08}>
              <article className={`panel flex h-full flex-col gap-5 p-6 ${featured ? "border-accent" : ""}`}>
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${TIER_CHIP[tier.id]}`}
                  >
                    {TIER_ICON[tier.id]}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold leading-tight tracking-tight">{tier.name}</h3>
                    <p className="font-mono text-xs uppercase tracking-wider text-text-faint">{tier.price}</p>
                  </div>
                </div>

                {/* Rows are a fixed height, not baseline-aligned: the infinity
                    glyph draws small in a mono face and needs a size up, and a
                    taller figure on a baseline-aligned row pushes that row
                    down - three rows in, the self-hosted card's figures no
                    longer line up with its neighbours'. */}
                <dl className="divide-y divide-border border-y border-border">
                  {tier.quotas.map((quota) => (
                    <div key={quota.label} className="flex h-[3.25rem] items-center justify-between gap-3">
                      <dt className="text-sm text-text-muted">{quota.label}</dt>
                      <dd
                        className={`font-mono font-bold tabular-nums ${
                          quota.value === UNLIMITED_MARK ? "text-2xl" : "text-xl"
                        } ${featured ? "text-accent" : "text-text"}`}
                      >
                        {quota.spoken ? (
                          <>
                            <span aria-hidden>{quota.value}</span>
                            <span className="sr-only">{quota.spoken}</span>
                          </>
                        ) : (
                          quota.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>

                <p className="text-sm text-text-muted">{tier.body}</p>

                <div className="mt-auto">
                  {tier.cta.external ? (
                    <a
                      href={tier.cta.href}
                      className={ctaClass}
                      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      {ctaIcon}
                      {tier.cta.label}
                    </a>
                  ) : (
                    <Link href={tier.cta.href} className={ctaClass}>
                      {tier.cta.label}
                    </Link>
                  )}
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
