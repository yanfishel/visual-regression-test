// Compact relative-time label for the project cards. Rendered server-side on
// a force-dynamic page, so "now" is request time; beyond 30 days a relative
// count stops being useful and the calendar date is clearer.
export function formatTimeAgo(date: Date, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return date.toISOString().slice(0, 10);
}
