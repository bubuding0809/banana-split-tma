import { describe, it, expect } from "vitest";
import { convertNativeToBase } from "./currencyConversion.js";

const ratesUsdBase = { USD: 1, SGD: 1.355, AUD: 1.5, CNY: 7.2 };

describe("convertNativeToBase", () => {
  it("identity when currencies match", () => {
    expect(convertNativeToBase(100, "SGD", "SGD", ratesUsdBase)).toBeCloseTo(
      100,
      6
    );
  });

  it("USD → SGD direct", () => {
    expect(convertNativeToBase(40, "USD", "SGD", ratesUsdBase)).toBeCloseTo(
      54.2,
      6
    );
  });

  it("AUD → SGD via USD pivot", () => {
    // 30 AUD ÷ 1.5 = 20 USD; 20 USD × 1.355 = 27.10 SGD
    expect(convertNativeToBase(30, "AUD", "SGD", ratesUsdBase)).toBeCloseTo(
      27.1,
      6
    );
  });

  it("returns null when rate missing", () => {
    expect(convertNativeToBase(50, "XYZ", "SGD", ratesUsdBase)).toBeNull();
  });

  it("preserves sign", () => {
    expect(convertNativeToBase(-40, "USD", "SGD", ratesUsdBase)).toBeCloseTo(
      -54.2,
      6
    );
  });
});
