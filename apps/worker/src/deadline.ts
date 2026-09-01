/**
 * A hard time limit for work that has none of its own.
 *
 * Playwright's actions carry a default 30 s timeout, but the calls this
 * module exists for have none at all: `page.evaluate` (both
 * `document.fonts.ready` awaits and the scroll pass in stabilize.ts), and
 * `page.close()` / `context.close()` / `browser.close()`. When a renderer
 * dies without Playwright noticing - an OOM kill on a memory-tight host is
 * the way we met this - the awaiting promise simply parks for ever. On
 * 2026-08-31 that left a run `running` for 27 hours beside a worker BullMQ
 * had already written off (worker.md "Stuck runs and stalled retries").
 *
 * The losing work is **not** cancelled - nothing in Playwright can cancel an
 * in-flight protocol call - it is only stopped being waited on, so every
 * caller has to be able to live with it finishing later.
 */
export class DeadlineError extends Error {
  constructor(
    readonly label: string,
    readonly ms: number,
  ) {
    super(`${label} exceeded its ${ms}ms deadline`);
    this.name = "DeadlineError";
  }
}

export function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(label, ms)), ms);
  });
  // Attached unconditionally, and this is the point of the function as much
  // as the race is: Promise.race stops listening to `work` the moment the
  // deadline wins, so a rejection arriving after that would be unhandled and
  // take the whole worker process down. While `work` wins the race this
  // handler changes nothing - the race observes the same settlement.
  void work.catch(() => {});
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
