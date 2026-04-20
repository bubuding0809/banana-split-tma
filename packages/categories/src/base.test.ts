import { describe, expect, it } from "vitest";
import { BASE_CATEGORIES } from "./base.js";

describe("BASE_CATEGORIES", () => {
  it("has exactly 10 entries", () => {
    expect(BASE_CATEGORIES).toHaveLength(10);
  });

  it("every id is prefixed with 'base:'", () => {
    for (const c of BASE_CATEGORIES) {
      expect(c.id.startsWith("base:")).toBe(true);
    }
  });

  it("ids are unique", () => {
    const ids = BASE_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the required ten categories", () => {
    const ids = new Set(BASE_CATEGORIES.map((c) => c.id));
    for (const expected of [
      "base:food",
      "base:transport",
      "base:home",
      "base:groceries",
      "base:entertainment",
      "base:travel",
      "base:health",
      "base:shopping",
      "base:utilities",
      "base:other",
    ]) {
      expect(ids.has(expected)).toBe(true);
    }
  });

  it("has non-empty emoji and title for every entry", () => {
    for (const c of BASE_CATEGORIES) {
      expect(c.emoji.length).toBeGreaterThan(0);
      expect(c.title.length).toBeGreaterThan(0);
    }
  });

  it("has non-empty keywords for every entry", () => {
    for (const c of BASE_CATEGORIES) {
      expect(c.keywords.length).toBeGreaterThan(0);
    }
  });

  it("titles are unique", () => {
    const titles = BASE_CATEGORIES.map((c) => c.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("no keyword appears in more than one category", () => {
    const seen = new Map<string, string>();
    for (const c of BASE_CATEGORIES) {
      for (const kw of c.keywords) {
        const prior = seen.get(kw);
        if (prior && prior !== c.id) {
          throw new Error(`"${kw}" appears in both ${prior} and ${c.id}`);
        }
        seen.set(kw, c.id);
      }
    }
  });
});
