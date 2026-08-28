// List-slicing helpers shared by every paginated screen (/projects cards, the
// /settings user table). Kept free of any domain type so a new list can page
// itself without importing another feature's filter module.

// Clamps instead of 404ing: a stale ?page= link (project deleted, filter
// changed) lands on the nearest real page.
export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page)), pageCount);
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pageCount };
}

export function parsePage(value: unknown): number {
  if (typeof value !== "string") {
    return 1;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}
