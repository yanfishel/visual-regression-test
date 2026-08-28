export const COMPARISON_STATUS_CLASS: Record<string, string> = {
  new: "pill-new",
  passed: "pill-passed",
  failed: "pill-failed",
  approved: "pill-approved",
};

// The same verdict colours as the pills, for a bare status dot where a whole
// pill is too loud (the comparison page's prev/next labels and jump list).
// The dot is never the only carrier: its row also names the status in text
// (visible or sr-only).
export const COMPARISON_STATUS_DOT_CLASS: Record<string, string> = {
  new: "bg-text-faint",
  passed: "bg-success",
  failed: "bg-danger",
  approved: "bg-accent",
};
