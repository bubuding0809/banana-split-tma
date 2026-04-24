import { describe, it, expect } from "vitest";
import {
  buildRecurringExpenseScheduleName,
  signRecurringExpensePayload,
  verifyRecurringExpenseSignature,
} from "./recurringExpenseScheduler.js";

describe("buildRecurringExpenseScheduleName", () => {
  it("uses fixed prefix + uuid", () => {
    expect(buildRecurringExpenseScheduleName("abc-123")).toBe(
      "recurring-expense-abc-123"
    );
  });
});

describe("signRecurringExpensePayload / verifyRecurringExpenseSignature", () => {
  const SECRET = "a".repeat(64);

  it("round-trips", () => {
    const sig = signRecurringExpensePayload("template-123", SECRET);
    expect(verifyRecurringExpenseSignature("template-123", sig, SECRET)).toBe(
      true
    );
  });

  it("rejects tampered templateId", () => {
    const sig = signRecurringExpensePayload("template-123", SECRET);
    expect(verifyRecurringExpenseSignature("template-456", sig, SECRET)).toBe(
      false
    );
  });

  it("rejects tampered signature", () => {
    expect(
      verifyRecurringExpenseSignature("template-123", "deadbeef", SECRET)
    ).toBe(false);
  });

  it("constant-time compare even with mismatched lengths", () => {
    expect(
      verifyRecurringExpenseSignature("template-123", "short", SECRET)
    ).toBe(false);
  });
});
