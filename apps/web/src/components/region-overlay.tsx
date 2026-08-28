"use client";

import type { CSSProperties, DragEvent, Ref } from "react";
import type { RegionEntry, RegionReport, RegionStatus } from "@vrt/shared/regions";

export type RegionSide = "baseline" | "current";

export type Size = { width: number; height: number };

// Which entry (if any) is under the cursor / clicked - shared by the overlay
// and the layer that decides whether to emphasise it.
type RegionEmphasis = { highlightedKey: string | null; selectedKey: string | null };

// Hover/selection identity for an entry. Keys repeat (ten `section`s), so
// the index is part of it.
export function regionEntryId(entry: RegionEntry, index: number): string {
  return `${index}:${entry.key}`;
}

// Colour AND stroke pattern per status (CLAUDE.md §9: colour never the only
// carrier). SVG paint is the one place raw tokens are allowed.
const STROKES: Record<
  RegionStatus,
  { stroke: string; dasharray?: string; width: number; baseStrokeOpacity: number }
> = {
  changed: { stroke: "var(--danger)", width: 2, baseStrokeOpacity: 1 },
  resized: { stroke: "var(--danger)", width: 2, baseStrokeOpacity: 1 },
  added: { stroke: "var(--warning)", dasharray: "6 4", width: 2, baseStrokeOpacity: 1 },
  removed: { stroke: "var(--warning)", dasharray: "6 4", width: 2, baseStrokeOpacity: 1 },
  moved: { stroke: "var(--info)", dasharray: "2 3", width: 2, baseStrokeOpacity: 1 },
  unchanged: { stroke: "var(--border)", width: 1, baseStrokeOpacity: 0.5 },
};

export function RegionOverlay({
  regions,
  side,
  size,
  highlightedKey,
  selectedKey,
}: {
  regions: RegionReport;
  side: RegionSide;
  size: Size;
} & RegionEmphasis) {
  return (
    // viewBox in screenshot pixels + preserveAspectRatio="none": the rects
    // follow the image through every zoom/pan/clip with no maths here.
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${size.width} ${size.height}`}
      preserveAspectRatio="none"
    >
      {regions.entries.map((entry, index) => {
        const rect = side === "baseline" ? entry.baseline : entry.current;
        if (!rect) {
          return null;
        }
        const id = regionEntryId(entry, index);
        const style = STROKES[entry.status];
        const emphasised = id === selectedKey || id === highlightedKey;
        return (
          <rect
            key={id}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill={emphasised ? style.stroke : "none"}
            fillOpacity={emphasised ? 0.12 : 0}
            stroke={style.stroke}
            strokeWidth={emphasised ? style.width + 1 : style.width}
            strokeDasharray={style.dasharray}
            strokeOpacity={emphasised ? 1 : style.baseStrokeOpacity}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

export interface ShotLayerProps extends RegionEmphasis {
  src: string;
  alt: string;
  size: Size;
  transform: CSSProperties;
  regions: RegionReport | null;
  side: RegionSide;
  showRegions: boolean;
  /**
   * Position class for the wrapper - `relative` by default; onion passes
   * `absolute left-0 top-0`, which is still a containing block for the overlay.
   */
  className?: string;
  style?: CSSProperties;
  imageRef?: Ref<HTMLImageElement>;
  onLoad?: () => void;
  onDragStart: (event: DragEvent<HTMLImageElement>) => void;
}

// One capture as the viewer shows it: the image plus its region overlay in
// a wrapper that carries the pan/zoom transform. `w-fit` keeps the wrapper
// the image's own width (a 375px mobile shot does not fill the column), so
// the overlay's box is exactly the image's box.
export function ShotLayer({
  src,
  alt,
  size,
  transform,
  regions,
  side,
  showRegions,
  highlightedKey,
  selectedKey,
  className,
  style,
  imageRef,
  onLoad,
  onDragStart,
}: ShotLayerProps) {
  return (
    <div className={`w-fit ${className ?? "relative"}`} style={{ ...transform, ...style }}>
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className="block max-w-full h-auto select-none [-webkit-user-drag:none]"
        draggable={false}
        onDragStart={onDragStart}
        onLoad={onLoad}
      />
      {showRegions && regions && (
        <RegionOverlay
          regions={regions}
          side={side}
          size={size}
          highlightedKey={highlightedKey}
          selectedKey={selectedKey}
        />
      )}
    </div>
  );
}
