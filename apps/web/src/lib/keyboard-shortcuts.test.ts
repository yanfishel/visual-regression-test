import { describe, expect, it } from "vitest";
import { isEditableTarget, isPlainKey } from "./keyboard-shortcuts.js";

describe("isEditableTarget", () => {
  it("treats form fields and contenteditable as editable", () => {
    expect(isEditableTarget({ tagName: "INPUT", isContentEditable: false })).toBe(true);
    expect(isEditableTarget({ tagName: "textarea", isContentEditable: false })).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT", isContentEditable: false })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("treats everything else, and a missing target, as not editable", () => {
    expect(isEditableTarget({ tagName: "BUTTON", isContentEditable: false })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({})).toBe(false);
  });
});

describe("isPlainKey", () => {
  it("rejects any modifier so browser shortcuts stay untouched", () => {
    expect(isPlainKey({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false })).toBe(true);
    expect(isPlainKey({ altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })).toBe(false);
    expect(isPlainKey({ altKey: false, ctrlKey: false, metaKey: true, shiftKey: false })).toBe(false);
  });
});
