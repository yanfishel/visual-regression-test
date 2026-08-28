import { describe, expect, it } from "vitest";
import { CAPTURE_FAILURE_KINDS } from "@vrt/shared/constants";
import { CAPTURE_FAILURE_HINT, CAPTURE_FAILURE_LABEL } from "./capture-failure-display";

describe("capture failure display maps", () => {
  it("has a label and a hint for every kind the worker can record", () => {
    for (const kind of CAPTURE_FAILURE_KINDS) {
      expect(CAPTURE_FAILURE_LABEL[kind]).toEqual(expect.any(String));
      expect(CAPTURE_FAILURE_HINT[kind]).toEqual(expect.any(String));
    }
  });
});
