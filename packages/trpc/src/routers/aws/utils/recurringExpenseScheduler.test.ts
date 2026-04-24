import { describe, it, expect } from "vitest";
import {
  buildRecurringExpenseScheduleName,
  signRecurringExpensePayload,
  verifyRecurringExpenseSignature,
  buildRecurringExpenseHttpTarget,
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

describe("buildRecurringExpenseHttpTarget", () => {
  it("produces a Universal HTTP target with payload + signature header", () => {
    process.env.AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN =
      "arn:aws:iam::000000000000:role/test";
    const target = buildRecurringExpenseHttpTarget({
      templateId: "tmpl-1",
      webhookUrl: "https://example.com/api/internal/recurring-expense-tick",
      secret: "s".repeat(64),
    });

    expect(target.Arn).toBe("arn:aws:scheduler:::http-invoke");
    expect(target.HttpParameters?.HeaderParameters?.["Content-Type"]).toBe(
      "application/json"
    );
    expect(
      target.HttpParameters?.HeaderParameters?.["X-Recurring-Signature"]
    ).toMatch(/^[a-f0-9]{64}$/);

    const body = JSON.parse(target.Input ?? "{}");
    expect(body.templateId).toBe("tmpl-1");
    expect(body.scheduleName).toBe("recurring-expense-tmpl-1");
    expect(body.occurrenceDate).toBe("<aws.scheduler.scheduled-time>");
  });
});
