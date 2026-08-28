import { describe, expect, it } from "vitest";
import { parseTimeZone } from "./time-zone.js";

describe("parseTimeZone", () => {
  it("accepts a real IANA zone", () => {
    expect(parseTimeZone("Asia/Jerusalem")).toBe("Asia/Jerusalem");
    expect(parseTimeZone("UTC")).toBe("UTC");
  });

  it("rejects garbage - a cookie is user input", () => {
    expect(parseTimeZone("Mars/Olympus")).toBeNull();
    expect(parseTimeZone("")).toBeNull();
    expect(parseTimeZone(undefined)).toBeNull();
    expect(parseTimeZone("<script>")).toBeNull();
  });
});
