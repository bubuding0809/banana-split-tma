import { describe, it, expect, vi } from "vitest";
import {
  buildRecurringUpdatePayload,
  validateTemplateId,
} from "./recurring.js";

describe("recurring ops", () => {
  it("validateTemplateId throws when missing", () => {
    expect(() => validateTemplateId(undefined)).toThrow();
  });

  it("buildRecurringUpdatePayload requires at least one field", () => {
    expect(() => buildRecurringUpdatePayload({ templateId: "t-1" })).toThrow();
  });

  it("buildRecurringUpdatePayload maps amount updates", () => {
    const payload = buildRecurringUpdatePayload({
      templateId: "t-1",
      amount: "50",
    });
    expect(payload).toEqual({ templateId: "t-1", amount: 50 });
  });
});
