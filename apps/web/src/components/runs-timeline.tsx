"use client";

import { Fragment } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { formatCompact } from "@/lib/chart-ticks";
// Types only: a runtime import of this module would pull `@vrt/db` -> postgres
// -> `net` into the browser bundle (CLAUDE.md section 9's trap index).
import type { RunHistory, RunHistoryDay } from "@/lib/run-history";
import { CaretDownIcon, CaretUpIcon } from "./icons";

// No date formatting here: every label comes pre-rendered on `RunHistoryDay`
// (lib/run-history.ts), in the zone the buckets were built in. Formatting
// `day.date` in the browser would use the viewer's zone and could name a
// different day than the server did - a hydration mismatch.

// Runs per calendar day in the /projects sidebar, under a pass-rate headline:
// the columns answer "how busy", the headline and its week-over-week delta
// answer "is it healthy". There is no y axis - the tallest day is labelled
// directly and the tooltips carry the rest, which buys the columns the width
// the axis gutter used to take. Status palette under the CLAUDE.md section 9
// deuteranopia rule: green vs red is a validated CVD collision, so the failed fill
// carries the 45-degree hatch, the baseline goes danger under every day that
// broke, and all three totals are spelled out in the legend. Bar heights are
// percentages of the busiest day inside a fixed-height plot, so the panel
// never grows no matter how busy the window was.
export function RunsTimeline({ history }: { history: RunHistory }) {
  const { days, totalPassed, totalFailed, totalPending, passRatePercent, passRateDeltaPoints } = history;
  // No finished run in the window means no rate to lead with - and an empty
  // chart above the sidebar panels would only be noise, so the whole panel
  // stays out. A brand-new install with a single queued run is that case.
  if (passRatePercent === null) {
    return null;
  }

  const totals = days.map((day) => day.passed + day.failed + day.pending);
  const scaleMax = Math.max(...totals);
  const peakIndex = totals.indexOf(scaleMax);

  return (
    <section className="panel">
      <div className="flex items-baseline justify-between gap-2 border-b border-border px-5 pb-3 pt-4">
        <h3 className="text-sm font-bold">Runs</h3>
        <span className="font-mono text-xs text-text-faint">{days.length}d</span>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[32px] font-bold leading-none tracking-tight">
              {passRatePercent}
              <span className="text-base font-semibold text-text-muted">%</span>
            </p>
            <p className="mt-1.5 text-xs text-text-muted">pass rate</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5 pt-1 font-mono text-xs">
            <span className="text-text-muted">
              {formatCompact(totalPassed + totalFailed + totalPending)} runs
            </span>
            <TrendDelta delta={passRateDeltaPoints} days={days.length} />
          </div>
        </div>

        {/* The visual chart is decoration over the sr-only table below;
            per-day figures reach sighted users through the day tooltips. */}
        <div aria-hidden className="mt-6">
          <ol className="flex h-[92px] items-end">
            {days.map((day, index) => (
              <DayColumn key={day.key} day={day} scaleMax={scaleMax} labelled={index === peakIndex} />
            ))}
          </ol>

          {/* The baseline carries data too: a danger tick sits under every day
              that broke, so a failure is found by position before colour. */}
          <div className="relative flex h-[3px]">
            <span className="absolute inset-x-0 top-0 h-px bg-border" />
            {days.map((day) => (
              <span key={day.key} className="relative flex-1">
                {/* Capped, not fixed: the tick has to track the bar above it,
                    and the bar gives its slot back once the panel narrows. */}
                {day.failed > 0 && (
                  <span className="absolute inset-x-0 top-0 mx-auto h-[3px] w-full max-w-[22px] rounded-b-[2px] bg-danger" />
                )}
              </span>
            ))}
          </div>

          <div className="mt-1.5 flex font-mono text-[10px] leading-none text-text-faint">
            {days.map((day, index) => (
              <span
                key={day.key}
                className={`flex-1 text-center ${
                  // The last bucket is today by construction, and today is
                  // still counting - the accent says so without a legend row.
                  index === days.length - 1 ? "font-bold text-accent" : ""
                }`}
              >
                {day.weekdayInitial}
              </span>
            ))}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-text-faint">
            <span>{days[0]!.label}</span>
            <span>{days[days.length - 1]!.label}</span>
          </div>
        </div>

        <ul className="mt-4 flex items-center justify-center gap-4 border-t border-border pt-3 text-xs">
          <LegendItem label="passed" value={totalPassed} swatchClassName="bg-success" />
          <LegendItem label="failed" value={totalFailed} swatchClassName="bg-danger" hatched />
          {totalPending > 0 && (
            <LegendItem label="running" value={totalPending} swatchClassName="bg-surface-alt" pending />
          )}
        </ul>
      </div>

      <table className="sr-only">
        <caption>Runs per day over the last {days.length} days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Passed</th>
            <th scope="col">Failed</th>
            <th scope="col">Running</th>
          </tr>
        </thead>
        <tbody>
          {days.map(
            (day) =>
              day.passed + day.failed + day.pending > 0 && (
                <tr key={day.key}>
                  <th scope="row">{day.label}</th>
                  <td>{day.passed}</td>
                  <td>{day.failed}</td>
                  <td>{day.pending}</td>
                </tr>
              ),
          )}
        </tbody>
      </table>
    </section>
  );
}

function TrendDelta({ delta, days }: { delta: number | null; days: number }) {
  if (delta === null) {
    return null;
  }
  if (delta === 0) {
    return <span className="text-[11px] text-text-faint">level with prev {days}d</span>;
  }
  // Direction is spelled by the caret and the sign, never by the colour alone.
  const rising = delta > 0;
  const Caret = rising ? CaretUpIcon : CaretDownIcon;
  return (
    <span className={`flex items-center gap-1 text-[11px] ${rising ? "text-success" : "text-danger"}`}>
      <Caret className="h-2.5 w-2.5 shrink-0" />
      <span className="font-bold">{Math.abs(delta)} pts</span>
      <span className="text-text-faint">vs prev {days}d</span>
    </span>
  );
}

// A 2px surface gap separates the stacked segments - the panel surface itself
// does the separating, no strokes around marks - and only the topmost segment
// is rounded, so the stack reads as one column.
function DayColumn({ day, scaleMax, labelled }: { day: RunHistoryDay; scaleMax: number; labelled: boolean }) {
  const total = day.passed + day.failed + day.pending;
  const segments = [
    { key: "pending", count: day.pending, className: "bg-surface-alt", style: PENDING_FILL },
    { key: "failed", count: day.failed, className: "bg-danger", style: HATCH_FILL },
    { key: "passed", count: day.passed, className: "bg-success", style: undefined },
  ].filter((segment) => segment.count > 0);

  const figures =
    total === 0
      ? "no runs"
      : [
          day.passed > 0 && `${formatCompact(day.passed)} passed`,
          day.failed > 0 && `${formatCompact(day.failed)} failed`,
          day.pending > 0 && `${formatCompact(day.pending)} running`,
        ]
          .filter(Boolean)
          .join(", ");

  return (
    // The whole column is the hover target - taller and wider than the bar
    // itself, so thin marks stay easy to hit. The tooltip is Radix (project
    // rule - never the native `title`), fed by the provider in the root
    // layout.
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <li className="relative flex h-full flex-1 flex-col items-center justify-end rounded-t-sm hover:bg-surface-alt">
          {labelled && (
            <span className="absolute inset-x-0 -top-3.5 text-center font-mono text-[10px] leading-none text-text-muted">
              {formatCompact(total)}
            </span>
          )}
          {total === 0 ? (
            // A day nobody ran anything on is not a day everything passed.
            <span className="mb-px h-1 w-1 rounded-full bg-text-faint" />
          ) : (
            <span className="flex h-full w-full max-w-[22px] flex-col justify-end">
              {segments.map((segment, index) => (
                <Fragment key={segment.key}>
                  {index > 0 && <span className="h-0.5 w-full shrink-0" />}
                  <span
                    className={segment.className}
                    style={{
                      height: `${(segment.count / scaleMax) * 100}%`,
                      borderRadius: index === 0 ? "4px 4px 0 0" : undefined,
                      ...segment.style,
                    }}
                  />
                </Fragment>
              ))}
            </span>
          )}
        </li>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className="z-50 select-none rounded-md bg-text px-2 py-1 text-xs font-medium text-bg shadow-md"
        >
          {`${day.tooltipLabel} — ${figures}`}
          <Tooltip.Arrow className="fill-text" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function LegendItem({
  label,
  value,
  swatchClassName,
  hatched = false,
  pending = false,
}: {
  label: string;
  value: number;
  swatchClassName: string;
  hatched?: boolean;
  pending?: boolean;
}) {
  return (
    <li className="flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className={`h-2.5 w-2.5 shrink-0 rounded-sm ${swatchClassName}`}
        style={hatched ? LEGEND_HATCH_FILL : pending ? LEGEND_PENDING_FILL : undefined}
      />
      <span className="font-mono font-bold text-text">{formatCompact(value)}</span>
      <span className="text-text-muted">{label}</span>
    </li>
  );
}

// Tailwind has no utility for a repeating gradient, so these are the file's
// only raw token references (CLAUDE.md section 9) - the pattern is drawn in
// the panel's own surface, and the pending fill outlines itself because
// surface-alt alone is a whisper against the surface.
const HATCH_FILL = {
  backgroundImage: "repeating-linear-gradient(45deg, var(--surface) 0 1.5px, transparent 1.5px 5px)",
} as const;

const PENDING_FILL = {
  boxShadow: "inset 0 0 0 1px var(--border)",
  backgroundImage: "repeating-linear-gradient(45deg, var(--border) 0 1px, transparent 1px 5px)",
} as const;

const LEGEND_HATCH_FILL = {
  backgroundImage: "repeating-linear-gradient(45deg, var(--surface) 0 1px, transparent 1px 3px)",
} as const;

const LEGEND_PENDING_FILL = {
  boxShadow: "inset 0 0 0 1px var(--border)",
  backgroundImage: "repeating-linear-gradient(45deg, var(--border) 0 1px, transparent 1px 4px)",
} as const;
