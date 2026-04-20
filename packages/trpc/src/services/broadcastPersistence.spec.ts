import { describe, expect, it } from "vitest";
import { dedupeTargetIds } from "./broadcastPersistence.js";

describe("dedupeTargetIds", () => {
  it("dedupes repeated ids preserving first-seen order", () => {
    expect(dedupeTargetIds([3, 1, 3, 2, 1])).toEqual([3, 1, 2]);
  });
  it("returns empty for empty input", () => {
    expect(dedupeTargetIds([])).toEqual([]);
  });
});
