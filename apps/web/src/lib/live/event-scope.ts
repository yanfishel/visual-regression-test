import type { LiveEvent } from "@vrt/shared/schemas";

export interface EventScopeOptions {
  isAdmin: boolean;
  loadOwnedProjectIds: () => Promise<string[]>;
}

export interface EventScope {
  prime: () => Promise<void>;
  filter: (event: LiveEvent) => LiveEvent | null;
}

// Per-connection ownership filter for the SSE stream. Queue events (counts,
// worker liveness) are operational and go to everyone; run events and the
// snapshot's run list are narrowed to the user's projects.
//
// The owned set is loaded once at connect time. A run event for an unknown
// project triggers an async refresh instead of an await (the broker fan-out
// is synchronous): the first event of a brand-new project's run may be
// dropped, but the next one passes, and the client's debounced
// router.refresh makes the difference invisible.
export function createEventScope(options: EventScopeOptions): EventScope {
  const owned = new Set<string>();
  let refreshing: Promise<void> | null = null;

  const refresh = (): Promise<void> => {
    refreshing ??= options
      .loadOwnedProjectIds()
      .then((ids) => {
        for (const id of ids) {
          owned.add(id);
        }
      })
      .catch((error) => {
        console.error("Failed to refresh owned projects for live scope:", error);
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  };

  const allowsProject = (projectId: string): boolean => {
    if (owned.has(projectId)) {
      return true;
    }
    void refresh();
    return false;
  };

  return {
    prime: refresh,
    filter: (event) => {
      if (options.isAdmin) {
        return event;
      }
      if (event.type === "queue") {
        return event;
      }
      if (event.type === "run") {
        return allowsProject(event.run.projectId) ? event : null;
      }
      return { ...event, runs: event.runs.filter((run) => allowsProject(run.projectId)) };
    },
  };
}
