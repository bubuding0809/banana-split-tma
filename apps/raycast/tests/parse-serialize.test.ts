import { describe, expect, it } from "vitest";
import {
  parseBooleanString,
  parseCommaSeparatedNumbers,
  parseJsonArray,
  parseNumber,
  parsePositiveNumber,
  requireField,
} from "@bananasplitz/api-ops";
import { serializeToolResult } from "../src/lib/tools/serialize";

describe("parse helpers", () => {
  it("requires present fields", () => {
    expect(requireField("value", "field")).toBe("value");
    expect(() => requireField("", "field")).toThrow("field is required");
    expect(() => requireField(undefined, "field")).toThrow("field is required");
  });

  it("parses numeric inputs and rejects invalid values", () => {
    expect(parseNumber("42.5", "amount")).toBe(42.5);
    expect(parseNumber(7, "amount")).toBe(7);
    expect(() => parseNumber("nope", "amount")).toThrow("amount must be a valid number");

    expect(parsePositiveNumber("0.01", "amount")).toBe(0.01);
    expect(() => parsePositiveNumber("0", "amount")).toThrow("amount must be a positive number");
  });

  it("parses comma-separated numeric IDs", () => {
    expect(parseCommaSeparatedNumbers("1, 2,3", "participantIds")).toEqual([1, 2, 3]);
    expect(() => parseCommaSeparatedNumbers("1, nope", "participantIds")).toThrow(
      "participantIds must be comma-separated numbers",
    );
  });

  it("parses JSON arrays and rejects invalid JSON or non-arrays", () => {
    expect(parseJsonArray<{ userId: number }>('[{"userId":123}]', "customSplits")).toEqual([{ userId: 123 }]);
    expect(() => parseJsonArray("{}", "customSplits")).toThrow("customSplits must be a valid JSON array");
    expect(() => parseJsonArray("not-json", "customSplits")).toThrow("customSplits must be a valid JSON array");
  });

  it("parses boolean strings", () => {
    expect(parseBooleanString("true", "enabled")).toBe(true);
    expect(parseBooleanString("FALSE", "enabled")).toBe(false);
    expect(() => parseBooleanString("yes", "enabled")).toThrow("enabled must be true or false");
  });
});

describe("serializeToolResult", () => {
  it("serializes BigInt values as strings", () => {
    expect(JSON.parse(serializeToolResult({ chatId: 123n, nested: { userId: 456n } }))).toEqual({
      chatId: "123",
      nested: {
        userId: "456",
      },
    });
  });
});
