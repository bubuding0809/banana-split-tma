import { describe, it, expect } from "vitest";
import { isValidSgMobile, extractMobileNumber } from "../paynow";

// ── isValidSgMobile ──────────────────────────────────────────────────────────

describe("isValidSgMobile", () => {
  it.each([
    ["6591234567", "without +"],
    ["+6591234567", "with +"],
    ["6581234567", "starting with 8"],
    ["+6581234567", "starting with 8 with +"],
    ["65 9123 4567", "with spaces"],
  ])("returns true for valid SG mobile: %s (%s)", (phone) => {
    expect(isValidSgMobile(phone)).toBe(true);
  });

  it.each([
    ["6571234567", "starts with 7"],
    ["6512345678", "starts with 1"],
    ["659123456", "too short"],
    ["65912345678", "too long"],
    ["1234567890", "non-SG country code"],
    ["", "empty string"],
  ])("returns false for invalid SG mobile: %s (%s)", (phone) => {
    expect(isValidSgMobile(phone)).toBe(false);
  });
});

// ── extractMobileNumber ──────────────────────────────────────────────────────

describe("extractMobileNumber", () => {
  it("extracts 8-digit number from phone without +", () => {
    expect(extractMobileNumber("6591234567")).toBe("91234567");
  });

  it("extracts 8-digit number from phone with +", () => {
    expect(extractMobileNumber("+6591234567")).toBe("91234567");
  });

  it("handles phone with spaces", () => {
    expect(extractMobileNumber("65 9123 4567")).toBe("91234567");
  });

  it("handles 8-digit number starting with 8", () => {
    expect(extractMobileNumber("6581234567")).toBe("81234567");
  });
});
