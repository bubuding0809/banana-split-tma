import { describe, it, expect } from "vitest";
import { BASE_CATEGORIES } from "./base.js";
import {
  isBaseKey,
  isCustomKey,
  parseCustomKey,
  assertKnownKey,
} from "./keys.js";

describe("category keys", () => {
  const sampleBaseId = BASE_CATEGORIES[0]!.id; // e.g. "base:food"

  it("isBaseKey recognizes base:* ids", () => {
    expect(isBaseKey(sampleBaseId)).toBe(true);
    expect(isBaseKey("base:nonexistent")).toBe(false);
    expect(isBaseKey("chat:abc")).toBe(false);
    expect(isBaseKey("random")).toBe(false);
  });

  it("isCustomKey recognizes chat:<uuid> ids", () => {
    expect(isCustomKey("chat:11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isCustomKey("chat:not-a-uuid")).toBe(false);
    expect(isCustomKey(sampleBaseId)).toBe(false);
  });

  it("parseCustomKey returns the uuid or null", () => {
    expect(parseCustomKey("chat:11111111-1111-1111-1111-111111111111")).toBe(
      "11111111-1111-1111-1111-111111111111"
    );
    expect(parseCustomKey(sampleBaseId)).toBe(null);
    expect(parseCustomKey("chat:nope")).toBe(null);
  });

  it("assertKnownKey accepts a valid base key and known custom uuid", () => {
    const customIds = new Set(["11111111-1111-1111-1111-111111111111"]);
    expect(() => assertKnownKey(sampleBaseId, customIds)).not.toThrow();
    expect(() =>
      assertKnownKey("chat:11111111-1111-1111-1111-111111111111", customIds)
    ).not.toThrow();
  });

  it("assertKnownKey throws on unknown keys", () => {
    const customIds = new Set<string>();
    expect(() => assertKnownKey("base:nonexistent", customIds)).toThrow(
      /Unknown category key/
    );
    expect(() =>
      assertKnownKey("chat:22222222-2222-2222-2222-222222222222", customIds)
    ).toThrow(/Unknown category key/);
    expect(() => assertKnownKey("garbage", customIds)).toThrow(
      /Unknown category key/
    );
  });
});
