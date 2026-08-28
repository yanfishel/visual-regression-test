import Link from "next/link";
import type { ReactNode } from "react";
import { CameraIcon, GitCompareArrowsIcon, LayersIcon, ServerIcon } from "@/components/icons";
import { FaqSection } from "@/components/landing/faq";
import { HeroDiffSlider, ParallaxViewports } from "@/components/landing/hero-visual";
import { PlansSection } from "@/components/landing/plans";
import { Reveal } from "@/components/landing/reveal";
import { NEW_PROJECT_HREF } from "@/lib/query-params";

const FEATURES: { eyebrow: string; title: string; body: string; icon: ReactNode }[] = [
  {
    eyebrow: "Stabilization",
    title: "Deterministic captures",
    body: "Fonts, animations, lazy images, timers and third-party noise are frozen before every shot — so a reported diff means a real change, not a flaky run.",
    icon: <CameraIcon className="h-4 w-4" />,
  },
  {
    eyebrow: "Diff viewer",
    title: "Four ways to review",
    body: "Side-by-side, curtain, onion skin and a red-tint overlay — all sharing one synchronized zoom and pan, so the spot you're inspecting stays put.",
    icon: <GitCompareArrowsIcon className="h-4 w-4" />,
  },
  {
    eyebrow: "Baselines",
    title: "Approvals keep history",
    body: "Approving a change only moves a pointer. Old shots stay on disk, so every page keeps a visual timeline you can walk back through.",
    icon: <LayersIcon className="h-4 w-4" />,
  },
  {
    eyebrow: "Self-hosted",
    title: "Your stack, your disk",
    body: "Docker Compose, Postgres and content-addressed local storage. Live run updates stream over SSE. No cloud accounts, no per-screenshot pricing.",
    icon: <ServerIcon className="h-4 w-4" />,
  },
];

/**
 * The full-bleed landing sections, without any auth or query-param handling:
 * `/` renders them for signed-out visitors, `/about` for everyone (the
 * header's info icon and the footer link point there, since `/` sends a
 * signed-in visitor straight to their projects).
 *
 * `PlansSection` reads `role_limits`, so both routes rendering this must opt
 * out of prerendering — there is no database during `next build`.
 */
export function LandingContent() {
  return (
    <main className="flex-1 overflow-x-clip">
      {/* Hero */}
      <section className="relative">
        <div className="landing-grid absolute inset-0" aria-hidden />
        <ParallaxViewports />
        <div className="relative mx-auto w-full max-w-5xl px-6 pb-24 pt-20 text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-text-faint">
            Self-hosted visual regression testing
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            See every pixel that changed
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-text-muted">
            Screenshot your pages across viewports, compare them against approved baselines, and review
            exactly what moved — with the flaky noise stabilized out of every run.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={NEW_PROJECT_HREF} className="btn btn-primary">
              Create a project
            </Link>
            <Link href="/projects" className="btn btn-quiet">
              Browse projects
            </Link>
          </div>

          <div className="mt-16">
            <HeroDiffSlider />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <Reveal className="max-w-2xl">
          <h2 className="text-2xl font-extrabold tracking-tight">Diffs you can trust</h2>
          <p className="mt-2 text-text-muted">
            False positives kill visual testing. Every part of the pipeline exists to make two runs of an
            unchanged page come back identical.
          </p>
        </Reveal>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 0.08}>
              <article className="panel h-full space-y-3 p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent">
                    {feature.icon}
                  </span>
                  <span className="font-mono text-xs uppercase tracking-wider text-text-faint">
                    {feature.eyebrow}
                  </span>
                </div>
                <h3 className="text-lg font-bold tracking-tight">{feature.title}</h3>
                <p className="text-sm text-text-muted">{feature.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Plans */}
      <PlansSection />

      {/* FAQ — the app's help text, after the pitch and before the ask */}
      <FaqSection />

      {/* Final call to action */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <Reveal>
          <div className="panel space-y-4 p-10 text-center">
            <h2 className="text-2xl font-extrabold tracking-tight">Point it at a URL</h2>
            <p className="mx-auto max-w-xl text-text-muted">
              Add a project with a base URL, pick the viewports to watch, and run. The first run becomes your
              baseline.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link href={NEW_PROJECT_HREF} className="btn btn-primary">
                Create a project
              </Link>
              <Link href="/projects" className="btn btn-quiet">
                Browse projects
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
