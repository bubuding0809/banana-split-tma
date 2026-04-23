import { describe, expect, it } from "vitest";
import { resolveCategory } from "./resolve.js";
import type { ChatCategoryRow } from "./types.js";

const rows: ChatCategoryRow[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    emoji: "🏖️",
    title: "Bali trip",
  },
];

describe("resolveCategory", () => {
  it("returns null for null id", () => {
    expect(resolveCategory(null, rows)).toBeNull();
  });

  it("resolves a base id", () => {
    expect(resolveCategory("base:food", rows)).toMatchObject({
      id: "base:food",
      emoji: "🍜",
      title: "Food",
      kind: "base",
    });
  });

  it("resolves a custom id", () => {
    const r = resolveCategory(
      "chat:11111111-1111-1111-1111-111111111111",
      rows
    );
    expect(r).toMatchObject({
      id: "chat:11111111-1111-1111-1111-111111111111",
      emoji: "🏖️",
      title: "Bali trip",
      kind: "custom",
    });
  });

  it("returns null for unknown base id", () => {
    expect(resolveCategory("base:nope", rows)).toBeNull();
  });

  it("returns null for unknown custom uuid", () => {
    expect(
      resolveCategory("chat:99999999-9999-9999-9999-999999999999", rows)
    ).toBeNull();
  });

  it("returns null for malformed id", () => {
    expect(resolveCategory("", rows)).toBeNull();
    expect(resolveCategory("nope", rows)).toBeNull();
  });

  it("returns null for 'base:' with empty slug", () => {
    expect(resolveCategory("base:", rows)).toBeNull();
  });

  it("returns null for 'chat:' with empty uuid", () => {
    expect(resolveCategory("chat:", rows)).toBeNull();
  });
});
