"use client";

import { useEffect } from "react";
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { DraggableHorizontalIcon } from "../icons";

// A stylized page skeleton rendered twice inside the hero mock: once as the
// approved baseline and once as the current run, where a promo banner has
// appeared and pushed the layout down. The changed regions on the current
// side carry the diff viewer's red tint.
function SkeletonPage({ changed }: { changed: boolean }) {
  return (
    <div className="space-y-3 p-4">
      {/* Site header: logo dot + nav dashes */}
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-accent" />
        <div className="h-2 w-10 rounded-full bg-surface-alt" />
        <div className="ml-auto flex gap-2">
          <div className="h-2 w-7 rounded-full bg-surface-alt" />
          <div className="h-2 w-7 rounded-full bg-surface-alt" />
          <div className="h-2 w-7 rounded-full bg-surface-alt" />
        </div>
      </div>

      {/* The regression: a banner that only exists on the current run */}
      {changed ? (
        <div className="flex h-6 items-center justify-center rounded-sm border border-danger bg-danger-soft">
          <div className="h-1.5 w-24 rounded-full bg-danger" />
        </div>
      ) : null}

      {/* Page hero block */}
      <div className="space-y-2 py-1">
        <div className="h-4 w-3/5 rounded-sm bg-text-faint" />
        <div className="h-2 w-4/5 rounded-full bg-surface-alt" />
        <div className="h-2 w-2/3 rounded-full bg-surface-alt" />
        <div
          className={
            changed
              ? "h-5 w-24 rounded-sm border border-danger bg-danger-soft"
              : "h-5 w-20 rounded-sm bg-accent"
          }
        />
      </div>

      {/* Card row */}
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((card) => (
          <div key={card} className="space-y-1.5 rounded-sm border border-border p-2">
            <div className="h-8 rounded-sm bg-surface-alt" />
            <div className="h-1.5 w-4/5 rounded-full bg-surface-alt" />
            <div className="h-1.5 w-3/5 rounded-full bg-surface-alt" />
          </div>
        ))}
      </div>
    </div>
  );
}

// The hero centerpiece: a browser-window mock where an automated curtain
// sweeps between the approved baseline and the current run, echoing the diff
// viewer's curtain mode.
export function HeroDiffSlider() {
  const reducedMotion = useReducedMotion();
  const position = useMotionValue(55);
  // The current run (with the extra banner) is taller, so it sits in flow and
  // sets the height; the baseline is layered on top, clipped to the left of
  // the curtain.
  const baselineClipRight = useTransform(position, (value) => 100 - value);
  const clipPath = useMotionTemplate`inset(0 ${baselineClipRight}% 0 0)`;
  const curtainLeft = useMotionTemplate`${position}%`;

  useEffect(() => {
    if (reducedMotion) return;
    const controls = animate(position, [55, 90, 12, 55], {
      duration: 10,
      repeat: Infinity,
      ease: "easeInOut",
    });
    return () => controls.stop();
  }, [position, reducedMotion]);

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="panel relative overflow-hidden shadow-xl">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-surface-alt px-3 py-2">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-danger" />
            <div className="h-2.5 w-2.5 rounded-full bg-text-faint" />
            <div className="h-2.5 w-2.5 rounded-full bg-success" />
          </div>
          <div className="mx-auto rounded-sm bg-bg px-3 py-0.5 font-mono text-[10px] text-text-faint">
            staging.yoursite.com/pricing
          </div>
        </div>

        <div className="relative">
          {/* Current-run layer, revealed to the right of the curtain */}
          <SkeletonPage changed />

          {/* Baseline layer, clipped to the left of the curtain */}
          <motion.div aria-hidden style={{ clipPath }} className="absolute inset-0 bg-surface">
            <SkeletonPage changed={false} />
          </motion.div>

          {/* Curtain line + handle */}
          <motion.div
            aria-hidden
            style={{ left: curtainLeft }}
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent"
          >
            <div className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-md">
              <DraggableHorizontalIcon className="h-4 w-4" />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Layer labels + verdict */}
      <div className="mt-3 flex items-center justify-between font-mono text-xs">
        <span className="text-text-faint">baseline</span>
        <span className="pill pill-failed">2.4% diff</span>
        <span className="text-text-faint">current run</span>
      </div>
    </div>
  );
}

// The tool's three viewport presets, drifting at different rates as the page
// scrolls. Pure decoration behind the hero, hidden from assistive tech and
// from small screens.
export function ParallaxViewports() {
  const reducedMotion = useReducedMotion();
  const { scrollY } = useScroll();

  const slow = useTransform(scrollY, [0, 800], [0, -50]);
  const medium = useTransform(scrollY, [0, 800], [0, -110]);
  const fast = useTransform(scrollY, [0, 800], [0, -180]);

  const frames = [
    { label: "1200 · desktop", y: slow, className: "left-[2%] top-28 h-44 w-56" },
    { label: "768 · tablet", y: medium, className: "right-[3%] top-44 h-40 w-40" },
    { label: "375 · mobile", y: fast, className: "left-[9%] top-[27rem] h-36 w-24" },
  ];

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      {frames.map((frame) => (
        <motion.div
          key={frame.label}
          style={reducedMotion ? undefined : { y: frame.y }}
          className={`absolute overflow-hidden rounded-md border border-border bg-surface opacity-60 ${frame.className}`}
        >
          <div className="flex h-5 items-center border-b border-border px-2">
            <span className="font-mono text-[10px] text-text-faint">{frame.label}</span>
          </div>
          <div className="space-y-1.5 p-2.5">
            <div className="h-8 rounded-sm bg-surface-alt" />
            <div className="h-1.5 w-4/5 rounded-full bg-surface-alt" />
            <div className="h-1.5 w-3/5 rounded-full bg-surface-alt" />
            <div className="h-1.5 w-2/3 rounded-full bg-surface-alt" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
