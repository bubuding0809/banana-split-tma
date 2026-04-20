import { describe, expect, it } from "vitest";
import { buildClassifierPrompt, FEW_SHOTS } from "./prompt.js";
import { BASE_CATEGORIES } from "./base.js";

describe("buildClassifierPrompt", () => {
  it("lists every allowed category by id, emoji, and title", () => {
    const prompt = buildClassifierPrompt({
      description: "lunch with Dan",
      allowed: BASE_CATEGORIES.map((c) => ({
        id: c.id,
        emoji: c.emoji,
        title: c.title,
        keywords: c.keywords,
      })),
    });

    for (const c of BASE_CATEGORIES) {
      expect(prompt).toContain(c.id);
      expect(prompt).toContain(c.title);
    }
  });

  it("embeds the description verbatim", () => {
    const prompt = buildClassifierPrompt({
      description: "Airbnb Bali deposit",
      allowed: [],
    });
    expect(prompt).toContain("Airbnb Bali deposit");
  });

  it("instructs 'none' when no category fits", () => {
    const prompt = buildClassifierPrompt({ description: "x", allowed: [] });
    expect(prompt.toLowerCase()).toContain("none");
  });

  it("exposes at least 5 few-shot examples", () => {
    expect(FEW_SHOTS.length).toBeGreaterThanOrEqual(5);
  });
});
