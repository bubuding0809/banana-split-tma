import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock @repo/agent before importing classify.
vi.mock("@repo/agent", () => ({
  getAgentModel: vi.fn(() => "mock-model"),
}));

// Mock the ai package so we don't hit a real model.
const generateObjectMock = vi.fn();
vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

import { classifyCategory } from "./classify.js";

describe("classifyCategory", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("returns the categoryId and confidence from the model", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { categoryId: "base:food", confidence: 0.9 },
    });

    const result = await classifyCategory({
      description: "biryani",
      chatCategories: [],
    });

    expect(result).toEqual({ categoryId: "base:food", confidence: 0.9 });
  });

  it("returns null when model returns 'none'", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { categoryId: "none", confidence: 0.1 },
    });

    const result = await classifyCategory({
      description: "whatever",
      chatCategories: [],
    });

    expect(result).toBeNull();
  });

  it("returns null when confidence is below 0.4", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { categoryId: "base:food", confidence: 0.2 },
    });

    const result = await classifyCategory({
      description: "biryani",
      chatCategories: [],
    });

    expect(result).toBeNull();
  });

  it("returns null when the LLM call throws", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("boom"));

    const result = await classifyCategory({
      description: "x",
      chatCategories: [],
    });

    expect(result).toBeNull();
  });

  it("returns null on abort", async () => {
    const controller = new AbortController();
    generateObjectMock.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          setTimeout(
            () =>
              reject(Object.assign(new Error("abort"), { name: "AbortError" })),
            10
          );
        })
    );

    controller.abort();
    const result = await classifyCategory({
      description: "x",
      chatCategories: [],
      signal: controller.signal,
    });

    expect(result).toBeNull();
  });

  it("includes custom categories as allowed ids in the call", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { categoryId: "chat:abc", confidence: 0.95 },
    });

    const result = await classifyCategory({
      description: "bali trip",
      chatCategories: [
        { id: "abc", chatId: 1n, emoji: "🏖️", title: "Bali trip" },
      ],
    });

    expect(result).toEqual({ categoryId: "chat:abc", confidence: 0.95 });
    const call = generateObjectMock.mock.calls[0][0];
    expect(JSON.stringify(call.schema)).toContain("chat:abc");
  });
});
