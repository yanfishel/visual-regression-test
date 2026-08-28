import { describe, expect, it } from "vitest";
import { USER_ROLES } from "@vrt/shared/constants";
import { ROLE_DOT_CLASS, ROLE_LABEL, ROLE_TEXT_CLASS } from "./role-display.js";

describe("role display maps", () => {
  it("labels every role with a capitalized name", () => {
    expect(ROLE_LABEL.admin).toBe("Admin");
    expect(ROLE_LABEL.pro).toBe("Pro");
    expect(ROLE_LABEL.user).toBe("User");
  });

  it("gives each role its own colour", () => {
    expect(ROLE_DOT_CLASS.admin).toContain("danger");
    expect(ROLE_DOT_CLASS.pro).toContain("success");
    expect(ROLE_DOT_CLASS.user).toContain("info");
  });

  // A role added to the shared enum without a colour would render an
  // unstyled badge, which is easy to miss by eye and never by this test.
  it("covers every role in the shared enum", () => {
    for (const role of USER_ROLES) {
      expect(ROLE_LABEL[role]).toBeTruthy();
      expect(ROLE_DOT_CLASS[role]).toBeTruthy();
      expect(ROLE_TEXT_CLASS[role]).toBeTruthy();
    }
  });
});
