import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the ai package so we don't hit a real model.
const generateObjectMock = vi.fn();
vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

import { classifyCategory } from "./classify.js";

const MOCK_MODEL = "mock-model" as never;

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
      model: MOCK_MODEL,
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
      model: MOCK_MODEL,
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
      model: MOCK_MODEL,
    });

    expect(result).toBeNull();
  });

  it("returns null when the LLM call throws", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("boom"));

    const result = await classifyCategory({
      description: "x",
      chatCategories: [],
      model: MOCK_MODEL,
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
      model: MOCK_MODEL,
      signal: controller.signal,
    });

    expect(result).toBeNull();
  });

  it("returns null when external signal aborts mid-call", async () => {
    const outer = new AbortController();
    let rejectHold!: (err: Error) => void;
    generateObjectMock.mockImplementationOnce(
      () =>
        new Promise<never>((_, reject) => {
          rejectHold = reject;
        })
    );

    const promise = classifyCategory({
      description: "bali trip",
      chatCategories: [],
      model: MOCK_MODEL,
      signal: outer.signal,
    });

    // Simulate: external signal aborts while generateObject is still pending.
    outer.abort();
    // The onAbort listener in classify.ts should have triggered the local controller,
    // which would cause ai's generateObject to reject in real life. We simulate that here.
    rejectHold(Object.assign(new Error("abort"), { name: "AbortError" }));

    expect(await promise).toBeNull();
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
      model: MOCK_MODEL,
    });

    expect(result).toEqual({ categoryId: "chat:abc", confidence: 0.95 });
    const call = generateObjectMock.mock.calls[0][0] as {
      schema: { shape: { categoryId: { options: string[] } } };
    };
    expect(call.schema.shape.categoryId.options).toContain("chat:abc");
  });
});
