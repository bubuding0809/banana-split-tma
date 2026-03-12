import { describe, it, expect, vi } from "vitest";
import { currencyCommands } from "./currency.js";

vi.mock("../output.js", () => ({
  success: vi.fn((data) => data),
  error: vi.fn((code, message) => ({ code, message })),
  run: vi.fn(async (cmd, fn) => {
    try {
      return await fn();
    } catch (err: any) {
      return { code: "api_error", message: err.message };
    }
  }),
}));

describe("currency commands", () => {
  it("get-exchange-rate should fail if base-currency is missing", async () => {
    const cmd = currencyCommands.find((c) => c.name === "get-exchange-rate");
    const trpcMock = {} as any;
    const result = await cmd?.execute({ "target-currency": "USD" }, trpcMock);

    expect(result).toMatchObject({
      code: "missing_option",
      message: "--base-currency is required",
    });
  });

  it("get-exchange-rate should fail if target-currency is missing", async () => {
    const cmd = currencyCommands.find((c) => c.name === "get-exchange-rate");
    const trpcMock = {} as any;
    const result = await cmd?.execute({ "base-currency": "USD" }, trpcMock);

    expect(result).toMatchObject({
      code: "missing_option",
      message: "--target-currency is required",
    });
  });

  it("get-exchange-rate should call trpc.currency.getCurrentRate", async () => {
    const cmd = currencyCommands.find((c) => c.name === "get-exchange-rate");
    const queryMock = vi.fn().mockResolvedValue(1.5);
    const trpcMock = {
      currency: { getCurrentRate: { query: queryMock } },
    } as any;

    await cmd?.execute(
      { "base-currency": "GBP", "target-currency": "USD" },
      trpcMock
    );

    expect(queryMock).toHaveBeenCalledWith({
      baseCurrency: "GBP",
      targetCurrency: "USD",
    });
  });
});
