import { describe, it, expect } from "vitest";
import { serializeForJson } from "./serialize.js";

describe("serializeForJson", () => {
  it("stringifies BigInt values", () => {
    expect(serializeForJson({ id: 1n })).toBe('{\n  "id": "1"\n}');
  });
});
