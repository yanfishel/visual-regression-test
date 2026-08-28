"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { liveEventSchema, type LiveQueueState, type LiveRunState } from "@vrt/shared/schemas";
import { deriveOwnQueue } from "@/lib/live/own-queue";
import { pruneTerminalRuns } from "@/lib/live/prune-runs";
import { workerJoined } from "@/lib/live/worker-return";

const EMPTY_QUEUE: LiveQueueState = { waiting: 0, active: 0, workersOnline: 0 };

interface LiveState {
  queue: LiveQueueState;
  runs: Record<string, LiveRunState>;
  connected: boolean;
}

interface LiveContextValue extends LiveState {
  /** True for a non-admin: the indicators count this viewer's runs only. */
  scopeToOwnRuns: boolean;
}

const LiveContext = createContext<LiveContextValue>({
  queue: EMPTY_QUEUE,
  runs: {},
  connected: false,
  scopeToOwnRuns: false,
});

/**
 * `scopeToOwnRuns` comes from the server (see app/layout.tsx): an admin's
 * indicators show the whole installation's queue, everyone else's show only
 * their own work. The stream already narrows `runs` per connection, so the
 * scoped counts are derived from those rather than fetched again - `queue`
 * frames stay unscoped on the wire because they also carry worker liveness.
 */
export function LiveProvider({
  children,
  scopeToOwnRuns = false,
}: {
  children: ReactNode;
  scopeToOwnRuns?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<LiveState>({
    queue: EMPTY_QUEUE,
    runs: {},
    connected: false,
  });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Mirrors `value.runs` outside React state so a `run` event can compare
  // against the previously known status synchronously, without waiting on a
  // render. SSE messages are handled one at a time by a single callback, so
  // there's no concurrency to worry about.
  const runsRef = useRef<Record<string, LiveRunState>>({});
  // Same trick for the worker count: a booting worker sweeps stuck runs
  // straight in Postgres, which reaches no page as a `run` event (see
  // lib/live/worker-return.ts). null until the first frame arrives.
  const workersOnlineRef = useRef<number | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/events");

    // Events are a signal, not a data channel: the lists and cards re-render
    // from Postgres through the server components, so a run event only needs
    // to nudge the router. Debounced because a finishing run fires several
    // events in a row.
    const scheduleRefresh = (): void => {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }
      refreshTimer.current = setTimeout(() => router.refresh(), 300);
    };

    source.onopen = () => setValue((current) => ({ ...current, connected: true }));

    source.onerror = () => setValue((current) => ({ ...current, connected: false }));

    source.onmessage = (message) => {
      // A truncated frame (e.g. through a misbehaving proxy) must not throw
      // out of the event handler - safeParse guards the schema, but only
      // valid JSON ever reaches it.
      let raw: unknown;
      try {
        raw = JSON.parse(message.data);
      } catch {
        return;
      }
      const parsed = liveEventSchema.safeParse(raw);
      if (!parsed.success) {
        return;
      }
      const event = parsed.data;

      const noteWorkers = (queue: LiveQueueState): void => {
        if (workerJoined(workersOnlineRef.current, queue.workersOnline)) {
          scheduleRefresh();
        }
        workersOnlineRef.current = queue.workersOnline;
      };

      if (event.type === "snapshot") {
        runsRef.current = Object.fromEntries(event.runs.map((run) => [run.runId, run]));
        noteWorkers(event.queue);
        setValue({ connected: true, queue: event.queue, runs: runsRef.current });
        return;
      }

      if (event.type === "queue") {
        noteWorkers(event.queue);
        setValue((current) => ({ ...current, connected: true, queue: event.queue }));
        return;
      }

      // event.type === "run": progress lives only in the BullMQ job, not
      // Postgres, so a refresh only helps when the status itself changed - a
      // brand-new run id counts as a change. Refreshing on every `run` event
      // (including per-shot progress updates) would re-render the server
      // components for data that never moved.
      const previousStatus = runsRef.current[event.run.runId]?.status;
      runsRef.current = pruneTerminalRuns(
        { ...runsRef.current, [event.run.runId]: event.run },
        event.run.runId,
      );
      setValue((current) => ({ ...current, connected: true, runs: runsRef.current }));

      if (previousStatus === undefined || previousStatus !== event.run.status) {
        scheduleRefresh();
      }
    };

    return () => {
      source.close();
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }
    };
  }, [router]);

  // The flag is server-rendered per request and never changes with the
  // stream, so it is merged in here rather than kept in the event state.
  const contextValue = useMemo(() => ({ ...value, scopeToOwnRuns }), [value, scopeToOwnRuns]);

  return <LiveContext.Provider value={contextValue}>{children}</LiveContext.Provider>;
}

export function useLiveQueue(): { queue: LiveQueueState; connected: boolean } {
  const { queue, runs, connected, scopeToOwnRuns } = useContext(LiveContext);
  return useMemo(
    () => ({ queue: scopeToOwnRuns ? deriveOwnQueue(queue, runs) : queue, connected }),
    [queue, runs, connected, scopeToOwnRuns],
  );
}

export function useLiveRun(runId: string): LiveRunState | null {
  return useContext(LiveContext).runs[runId] ?? null;
}
