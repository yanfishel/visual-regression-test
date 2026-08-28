// A comparison's diff percentage for display: rounded to `maxDecimals` and
// stripped of trailing zeros, so a clean pass reads "0%" and a 2.7% diff
// "2.7%" - not "0.00%" / "2.70%". Number → string via the numeric value, so
// the rounding is toFixed's and the zero-stripping is free.
export function formatDiffScore(score: number, maxDecimals: number): string {
  return `${Number(score.toFixed(maxDecimals))}%`;
}
