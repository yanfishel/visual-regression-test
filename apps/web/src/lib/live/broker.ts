import type { LiveEvent } from "@vrt/shared/schemas";

export type LiveSubscriber = (event: LiveEvent) => void;

// Fan-out inside one Node process: the Redis subscription is shared, every
// open SSE stream is a subscriber here.
export class LiveBroker {
  private readonly subscribers = new Set<LiveSubscriber>();

  subscribe(subscriber: LiveSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  publish(event: LiveEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch (error) {
        // A stream closed between the client disconnecting and its cleanup
        // running must not stop the other subscribers from getting the event.
        console.error("Live subscriber failed:", error);
      }
    }
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }
}

declare global {
  var __vrtLiveBroker: LiveBroker | undefined;
}

// Cached on globalThis for the same reason getRunQueue() is: dev-mode module
// reloads must not silently create a second broker that nobody publishes to.
export function getLiveBroker(): LiveBroker {
  if (!globalThis.__vrtLiveBroker) {
    globalThis.__vrtLiveBroker = new LiveBroker();
  }
  return globalThis.__vrtLiveBroker;
}
