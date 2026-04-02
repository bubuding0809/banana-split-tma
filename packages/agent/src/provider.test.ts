import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAgentModel } from "./provider.js";
import { google } from "@ai-sdk/google";

// Mock the ai-sdk providers
vi.mock("@ai-sdk/google", () => ({
  google: vi.fn((model) => `mocked-google-${model}`),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn((model) => `mocked-openai-${model}`)),
}));

describe("getAgentModel", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should default to Google Gemini when AGENT_PROVIDER is missing", () => {
    delete process.env.AGENT_PROVIDER;
    process.env.AGENT_MODEL = "gemini-test";
    const model = getAgentModel();
    expect(model).toBe("mocked-google-gemini-test");
    expect(google).toHaveBeenCalledWith("gemini-test");
  });

  it("should use Minimax when AGENT_PROVIDER is 'minimax'", () => {
    process.env.AGENT_PROVIDER = "minimax";
    process.env.AGENT_MODEL = "minimax-test";
    process.env.MINIMAX_API_KEY = "test-key";
    process.env.MINIMAX_BASE_URL = "https://test.url";

    const model = getAgentModel();
    expect(model).toBe("mocked-openai-minimax-test");
    // Note: testing internal call arguments of the mocked createOpenAI is complex,
    // but verifying the result string confirms it took the minimax path.
  });

  it("should throw an error if Minimax is used without an API key", () => {
    process.env.AGENT_PROVIDER = "minimax";
    delete process.env.MINIMAX_API_KEY;
    expect(() => getAgentModel()).toThrow("MINIMAX_API_KEY is required");
  });

  it("should throw an error for unsupported provider", () => {
    process.env.AGENT_PROVIDER = "unsupported";
    expect(() => getAgentModel()).toThrow(
      "Unsupported AGENT_PROVIDER: unsupported"
    );
  });
});
