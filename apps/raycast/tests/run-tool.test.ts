import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPreferenceValues } from "@raycast/api";
import type { BananaTrpcClient } from "../src/lib/trpc";

const mocks = vi.hoisted(() => ({
  getTrpcClient: vi.fn(),
}));

vi.mock("../src/lib/trpc", () => ({
  getTrpcClient: mocks.getTrpcClient,
}));

import { runTool, withToolErrors } from "../src/lib/tools/run-tool";

const getPreferenceValuesMock = vi.mocked(getPreferenceValues);

describe("runTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTrpcClient.mockReturnValue({} as unknown as BananaTrpcClient);
  });

  it("returns a serialized tool error when the API key is missing", async () => {
    getPreferenceValuesMock.mockReturnValue({ apiKey: "" });
    const callback = vi.fn(async () => ({ ok: true }));

    const result = JSON.parse(await runTool("demo-tool", {}, callback)) as {
      _toolError: boolean;
      tool: string;
      message: string;
    };

    expect(result).toMatchObject({
      _toolError: true,
      tool: "demo-tool",
    });
    expect(result.message).toContain("API key is not configured");
    expect(callback).not.toHaveBeenCalled();
    expect(mocks.getTrpcClient).not.toHaveBeenCalled();
  });

  it("returns a serialized tool error when the callback throws", async () => {
    getPreferenceValuesMock.mockReturnValue({ apiKey: "banana-key" });

    const result = JSON.parse(
      await runTool("demo-tool", {}, async () => {
        throw new Error("amount must be a positive number");
      }),
    ) as {
      _toolError: boolean;
      tool: string;
      message: string;
    };

    expect(result).toMatchObject({
      _toolError: true,
      tool: "demo-tool",
    });
    expect(result.message).toContain("amount must be a positive number");
  });

  it("wraps validation errors thrown before runTool starts", async () => {
    const result = JSON.parse(
      await withToolErrors("demo-tool", {}, async () => {
        throw new Error("payerId is required");
      }),
    ) as {
      _toolError: boolean;
      tool: string;
      message: string;
    };

    expect(result).toMatchObject({
      _toolError: true,
      tool: "demo-tool",
    });
    expect(result.message).toContain("payerId is required");
  });
});
