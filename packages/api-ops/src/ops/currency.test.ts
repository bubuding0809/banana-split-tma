import { describe, it, expect, vi } from "vitest";
import { ApiValidationError } from "../errors.js";
import { getExchangeRate } from "./currency.js";

describe("currency ops", () => {
  it("getExchangeRate requires base and target currencies", async () => {
    const trpc = {} as never;
    await expect(getExchangeRate(trpc, {})).rejects.toBeInstanceOf(
      ApiValidationError
    );
    await expect(
      getExchangeRate(trpc, { baseCurrency: "USD" })
    ).rejects.toMatchObject({ message: "--target-currency is required" });
  });

  it("getExchangeRate calls trpc.currency.getCurrentRate", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rate: 1.35 });
    const trpc = {
      currency: { getCurrentRate: { query: queryMock } },
    } as never;

    await getExchangeRate(trpc, {
      baseCurrency: "USD",
      targetCurrency: "SGD",
    });

    expect(queryMock).toHaveBeenCalledWith({
      baseCurrency: "USD",
      targetCurrency: "SGD",
    });
  });
});
