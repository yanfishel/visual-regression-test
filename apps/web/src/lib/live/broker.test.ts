import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@vrt/shared/schemas";
import { getLiveBroker, LiveBroker } from "./broker.js";

const QUEUE_EVENT: LiveEvent = {
  type: "queue",
  queue: { waiting: 1, active: 0, workersOnline: 1 },
};

describe("LiveBroker", () => {
  it("delivers a published event to every subscriber", () => {
    const broker = new LiveBroker();
    const first: LiveEvent[] = [];
    const second: LiveEvent[] = [];
    broker.subscribe((event) => first.push(event));
    broker.subscribe((event) => second.push(event));

    broker.publish(QUEUE_EVENT);

    expect(first).toEqual([QUEUE_EVENT]);
    expect(second).toEqual([QUEUE_EVENT]);
  });

  it("stops delivering after unsubscribe and forgets the subscriber", () => {
    const broker = new LiveBroker();
    const received: LiveEvent[] = [];
    const unsubscribe = broker.subscribe((event) => received.push(event));

    unsubscribe();
    broker.publish(QUEUE_EVENT);

    expect(received).toEqual([]);
    expect(broker.subscriberCount).toBe(0);
  });

  it("keeps delivering to the others when one subscriber throws", () => {
    const broker = new LiveBroker();
    const received: LiveEvent[] = [];
    broker.subscribe(() => {
      throw new Error("closed stream");
    });
    broker.subscribe((event) => received.push(event));

    expect(() => broker.publish(QUEUE_EVENT)).not.toThrow();
    expect(received).toEqual([QUEUE_EVENT]);
  });

  it("returns the same broker for the whole process", () => {
    expect(getLiveBroker()).toBe(getLiveBroker());
  });
});
