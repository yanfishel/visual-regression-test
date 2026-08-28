"use client";

import Link from "next/link";
import { useState } from "react";
import { CameraIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import type { RunSlide } from "@/lib/run-slides";

// Preview slider on the project page: flips through the latest finished run's
// captures; the image itself links to that run. Pure preview - no zoom/pan,
// that lives on the run and comparison pages.
export function RunShotSlider({
  projectId,
  runId,
  slides,
}: {
  projectId: string;
  runId: string | null;
  slides: RunSlide[];
}) {
  const [index, setIndex] = useState(0);

  if (!runId || slides.length === 0) {
    return (
      <section className="panel flex min-h-[200px] flex-col overflow-hidden">
        <h2 className="sr-only">Latest run captures</h2>
        <div className="landing-grid flex flex-1 flex-col items-center justify-center gap-2 text-text-faint">
          <CameraIcon className="h-6 w-6" />
          <span className="text-xs">No captures yet</span>
        </div>
      </section>
    );
  }

  // A live refresh can shrink the slide list under a kept index - clamp
  // instead of trusting state.
  const current = Math.min(index, slides.length - 1);
  const slide = slides[current]!;
  const caption = [slide.pageLabel, slide.viewportLabel].filter(Boolean).join(" · ");

  return (
    // min-h keeps a short config card from squashing the preview; the row
    // still stretches both panels when the config card grows taller.
    <section className="panel flex min-h-[200px] min-w-0 flex-col overflow-hidden">
      <h2 className="sr-only">Latest run captures</h2>
      <div className="relative flex-1 border-b border-border bg-surface-alt">
        <Link
          href={`/projects/${projectId}/runs/${runId}`}
          aria-label={`Open run: ${caption || "capture"}`}
          className="absolute inset-0"
        >
          <img
            src={`/api/shots/${slide.storageKey}`}
            alt={caption || "Capture"}
            className="h-full w-full object-cover object-top"
          />
        </Link>
        {slides.length > 1 && (
          <>
            <SlideButton
              direction="prev"
              disabled={current === 0}
              onClick={() => setIndex(Math.max(0, current - 1))}
            />
            <SlideButton
              direction="next"
              disabled={current === slides.length - 1}
              onClick={() => setIndex(Math.min(slides.length - 1, current + 1))}
            />
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
        <span className="min-w-0 truncate font-medium">
          {slide.pageLabel}
          {slide.viewportLabel && <span className="text-text-muted"> · {slide.viewportLabel}</span>}
        </span>
        <span className="shrink-0 font-mono text-text-faint">
          {current + 1} / {slides.length}
        </span>
      </div>
    </section>
  );
}

function SlideButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      aria-label={direction === "prev" ? "Previous capture" : "Next capture"}
      disabled={disabled}
      onClick={onClick}
      className={`btn-icon absolute top-1/2 -translate-y-1/2 rounded-full border border-border bg-surface shadow-sm hover:text-text disabled:cursor-default disabled:opacity-40 disabled:hover:text-text-muted ${
        direction === "prev" ? "left-2" : "right-2"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
