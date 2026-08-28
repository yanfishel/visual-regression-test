import { describe, expect, it } from "vitest";
import { WORKER_HEARTBEAT_KEY_PATTERN } from "@vrt/shared/worker-heartbeat";
import { countLiveWorkers } from "./workers.js";

// SCAN answers with a cursor and a page of keys; "0" means the iteration is
// over. Pages are handed out in order, and the requests are recorded so a
// test can assert what was asked for.
function createFakeRedis(pages: ReadonlyArray<readonly [string, string[]]>) {
  const requests: Array<{ cursor: string; pattern: string }> = [];
  let next = 0;
  return {
    requests,
    async scan(cursor: string, options: { MATCH?: string; COUNT?: number }) {
      requests.push({ cursor, pattern: options.MATCH ?? "" });
      expect(options.COUNT).toBeGreaterThan(0);
      const page = pages[next] ?? (["0", []] as const);
      next += 1;
      return [page[0], page[1]] as [string, string[]];
    },
  };
}

describe("countLiveWorkers", () => {
  it("counts the heartbeat keys of every page the cursor walks", async () => {
    const redis = createFakeRedis([
      ["17", ["vrt:worker:a:1"]],
      ["0", ["vrt:worker:b:2", "vrt:worker:c:3"]],
    ]);

    expect(await countLiveWorkers(redis)).toBe(3);
    expect(redis.requests).toEqual([
      { cursor: "0", pattern: WORKER_HEARTBEAT_KEY_PATTERN },
      { cursor: "17", pattern: WORKER_HEARTBEAT_KEY_PATTERN },
    ]);
  });

  it("reports no worker when every heartbeat has expired", async () => {
    expect(await countLiveWorkers(createFakeRedis([["0", []]]))).toBe(0);
  });

  it("counts a key once even though SCAN may return it on two pages", async () => {
    const redis = createFakeRedis([
      ["9", ["vrt:worker:a:1"]],
      ["0", ["vrt:worker:a:1"]],
    ]);

    expect(await countLiveWorkers(redis)).toBe(1);
  });
});
