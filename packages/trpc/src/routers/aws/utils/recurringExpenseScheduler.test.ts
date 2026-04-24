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
  const OCCURRENCE_DATE = "2026-04-24T09:00:00Z";

  it("round-trips", () => {
    const sig = signRecurringExpensePayload(
      "template-123",
      OCCURRENCE_DATE,
      SECRET
    );
    expect(
      verifyRecurringExpenseSignature(
        "template-123",
        OCCURRENCE_DATE,
        sig,
        SECRET
      )
    ).toBe(true);
  });

  it("rejects tampered templateId", () => {
    const sig = signRecurringExpensePayload(
      "template-123",
      OCCURRENCE_DATE,
      SECRET
    );
    expect(
      verifyRecurringExpenseSignature(
        "template-456",
        OCCURRENCE_DATE,
        sig,
        SECRET
      )
    ).toBe(false);
  });

  it("rejects tampered signature", () => {
    expect(
      verifyRecurringExpenseSignature(
        "template-123",
        OCCURRENCE_DATE,
        "deadbeef",
        SECRET
      )
    ).toBe(false);
  });

  it("constant-time compare even with mismatched lengths", () => {
    expect(
      verifyRecurringExpenseSignature(
        "template-123",
        OCCURRENCE_DATE,
        "short",
        SECRET
      )
    ).toBe(false);
  });

  it("same templateId but different occurrenceDate produces different signature", () => {
    const sig1 = signRecurringExpensePayload(
      "template-123",
      "2026-04-24T09:00:00Z",
      SECRET
    );
    const sig2 = signRecurringExpensePayload(
      "template-123",
      "2026-04-25T09:00:00Z",
      SECRET
    );
    expect(sig1).not.toBe(sig2);
    // Signature from day 1 must not verify against day 2.
    expect(
      verifyRecurringExpenseSignature(
        "template-123",
        "2026-04-25T09:00:00Z",
        sig1,
        SECRET
      )
    ).toBe(false);
  });
});
