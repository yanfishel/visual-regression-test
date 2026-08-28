import type { ComponentType } from "react";
import type { Viewport } from "@vrt/db";
import { MonitorIcon, SmartphoneIcon, TabletIcon } from "@/components/icons";
import { presetOf, viewportKindOf, type ViewportKind } from "@/lib/viewport-selection";

const VIEWPORT_KIND_ICON: Record<ViewportKind, ComponentType<{ className?: string }>> = {
  desktop: MonitorIcon,
  tablet: TabletIcon,
  mobile: SmartphoneIcon,
};

/**
 * The viewport marker used everywhere a viewport is named: kind icon, preset
 * label (or the row's own label for a non-preset width), and width. On the
 * project page it lists the configuration as a bordered chip; on run cards
 * (grouped by page) it is the card's title and renders `plain` - the same
 * icon + label + width as running text, no pill chrome (the status pill
 * beside it is the one pill on the row).
 */
export function ViewportChip({
  viewport,
  plain = false,
  className = "",
}: {
  viewport: Pick<Viewport, "label" | "width">;
  plain?: boolean;
  className?: string;
}) {
  const preset = presetOf(viewport);
  const KindIcon = VIEWPORT_KIND_ICON[viewportKindOf(viewport)];
  // The plain form aligns its texts by baseline and exposes that baseline
  // to the row (`items-baseline` on the card's title row): sans label and
  // mono width/pill text have different ascent/descent, so centring their
  // line boxes leaves the glyphs visibly off by a pixel or two - a
  // `leading-none` attempt clipped descenders instead. The icon centres on
  // the line box like it does in the chip, nudged 1px down in the plain
  // form: the 20px line box's centre sits above the x-height centre of the
  // text beside it (measured at 5x: icon ~2px high without the nudge).
  const chrome = plain
    ? "items-baseline text-sm font-medium"
    : "items-center rounded-full border border-border bg-surface-alt px-2.5 py-1 text-xs font-semibold";
  return (
    <span className={`inline-flex min-w-0 gap-1.5 ${chrome} ${className}`}>
      <KindIcon
        className={`shrink-0 self-center text-text-muted ${plain ? "h-4 w-4 translate-y-px" : "h-3.5 w-3.5"}`}
      />
      <span className="truncate">{preset?.label ?? viewport.label}</span>
      <span className="font-mono font-light text-text-muted">{viewport.width}px</span>
    </span>
  );
}
