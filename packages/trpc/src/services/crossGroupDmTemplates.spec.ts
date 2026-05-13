import { describe, it, expect } from "vitest";
import {
  buildSettleNotificationCaption,
  buildNudgeCaption,
} from "./crossGroupDmTemplates.js";

const sample = {
  senderName: "Bubu",
  baseCurrency: "SGD",
  totalBaseAbs: 99.42,
  groups: [
    { chatTitle: "Bali Trip", currency: "USD", nativeAbs: 40 },
    { chatTitle: "Dinner Club", currency: "AUD", nativeAbs: 30 },
    { chatTitle: "Roommates", currency: "CNY", nativeAbs: 100 },
  ],
};

describe("buildSettleNotificationCaption", () => {
  it("includes sender, total, and per-group native breakdown", () => {
    const text = buildSettleNotificationCaption(sample);
    expect(text).toContain("Bubu");
    expect(text).toContain("S$99.42");
    expect(text).toContain("Bali Trip");
    expect(text).toContain("$40.00");
    expect(text).toContain("AU$30.00");
  });
});

describe("buildNudgeCaption", () => {
  it("addresses the debtor and lists the breakdown", () => {
    const text = buildNudgeCaption(sample);
    expect(text).toContain("Bubu is awaiting settlement");
    expect(text).toContain("S$99.42");
    expect(text).toContain("Bali Trip");
  });
});
