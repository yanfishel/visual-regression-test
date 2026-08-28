import { describe, expect, it } from "vitest";
import { selectKeysToDelete } from "./retention.js";

describe("selectKeysToDelete", () => {
  it("deletes a key only when no surviving shot still references it", () => {
    // Keys are content-addressed, so an old shot and a current one can share
    // a key byte-for-byte - the file must survive as long as any row uses it.
    const deletedKeys = ["aa.webp", "bb.webp", "bb.webp", "cc.png"];
    const stillReferenced = new Set(["bb.webp"]);
    expect(selectKeysToDelete(deletedKeys, stillReferenced)).toEqual(["aa.webp", "cc.png"]);
  });

  it("returns each key once even when several deleted shots shared it", () => {
    expect(selectKeysToDelete(["aa.webp", "aa.webp"], new Set())).toEqual(["aa.webp"]);
  });
});
