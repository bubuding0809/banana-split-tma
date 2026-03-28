import { describe, it, expect } from "vitest";
import { encodeBase62, decodeBase62 } from "./base62.js";

describe("Base62 Utils", () => {
  it("should correctly encode and decode a BigInt", () => {
    const num = 1001234567890n;
    const encoded = encodeBase62(num);
    expect(encoded).toBeTypeOf("string");
    expect(encoded.length).toBeGreaterThan(0);
    expect(decodeBase62(encoded)).toBe(num);
  });

  it("should handle 0 correctly", () => {
    expect(encodeBase62(0n)).toBe("0");
    expect(decodeBase62("0")).toBe(0n);
  });

  it("should handle very large numbers (e.g., UUID-sized)", () => {
    const hex = "123e4567e89b12d3a456426614174000";
    const largeNum = BigInt("0x" + hex);
    const encoded = encodeBase62(largeNum);
    expect(decodeBase62(encoded)).toBe(largeNum);
  });

  it("should throw an error when encoding a negative number", () => {
    expect(() => encodeBase62(-1n)).toThrow("Cannot encode negative numbers");
  });

  it("should throw an error when decoding an invalid character", () => {
    expect(() => decodeBase62("12-34")).toThrow("Invalid base62 character: -");
    expect(() => decodeBase62("!")).toThrow("Invalid base62 character: !");
  });
});
