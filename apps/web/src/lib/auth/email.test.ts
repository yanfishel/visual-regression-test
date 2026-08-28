import { describe, expect, it } from "vitest";
import { DEFAULT_USER_EMAIL } from "@vrt/shared/constants";
import { hasRealEmail } from "./email.js";

describe("hasRealEmail", () => {
  it("treats the none-mode placeholder as no address", () => {
    expect(hasRealEmail({ email: DEFAULT_USER_EMAIL })).toBe(false);
  });
  it("accepts anything else", () => {
    expect(hasRealEmail({ email: "me@example.com" })).toBe(true);
  });
});
