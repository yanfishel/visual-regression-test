const COMPACT_FORMAT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

// Axis and legend figures: hundreds stay as digits, thousands abbreviate
// (1.2K) so labels never widen the chart's gutter.
export function formatCompact(value: number): string {
  return COMPACT_FORMAT.format(value);
}
