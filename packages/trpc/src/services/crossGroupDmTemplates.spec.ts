import { describe, expect, it } from "vitest";
import {
  buildNudgeCaption,
  buildSettleNotificationCaption,
  type CrossGroupSummary,
} from "./crossGroupDmTemplates.js";

const sample: CrossGroupSummary = {
  senderName: "Bubu",
  baseCurrency: "SGD",
  totalBaseAbs: 99.42,
  groups: [
    {
      chatId: 1,
      chatTitle: "Bali Trip",
      currency: "USD",
      nativeAbs: 40,
      baseAbs: 54.2,
    },
    {
      chatId: 1,
      chatTitle: "Bali Trip",
      currency: "AUD",
      nativeAbs: 30,
      baseAbs: 27,
    },
    {
      chatId: 2,
      chatTitle: "Roommates",
      currency: "CNY",
      nativeAbs: 100,
      baseAbs: 18.22,
    },
  ],
};

// Strip MarkdownV2 escape backslashes so substring assertions can match
// the rendered output rather than the wire payload.
function unescape(s: string): string {
  return s.replace(/\\([_*\[\]()~`>#+\-=|{}.!\\])/g, "$1");
}

describe("buildSettleNotificationCaption", () => {
  it("renders sender, total, group count, breakdown, and closing", () => {
    const text = buildSettleNotificationCaption(sample);
    const rendered = unescape(text);

    expect(rendered).toContain("✅ *Debts Settled*");
    expect(rendered).toContain("Bubu just settled with you");
    expect(rendered).toContain("S$99.42");
    expect(rendered).toContain("across 2 groups");
    expect(rendered).toContain("Bali Trip");
    expect(rendered).toContain("Roommates");
    expect(rendered).toContain("All shared balances are now zeroed 🎉");
  });

  it("renders the breakdown as a monospaced tree block", () => {
    const text = buildSettleNotificationCaption(sample);
    const codeBlock = text.match(/```\n([\s\S]+?)\n```/);
    expect(codeBlock).toBeTruthy();
    const tree = codeBlock![1];

    const NBSP = " "; // U+00A0 — survives iOS pre-block leading-space collapse

    // Bali Trip is not the last chat — uses ├─ at chat level
    // and │ + NBSP×2 for child indentation
    expect(tree).toContain("├─ Bali Trip");
    expect(tree).toContain(`│${NBSP}${NBSP}├─ $40.00`);
    expect(tree).toContain(`│${NBSP}${NBSP}└─ AU$30.00`);

    // Roommates is the last chat — uses └─ and NBSP×3 for child indent
    expect(tree).toContain("└─ Roommates");
    expect(tree).toContain(`${NBSP}${NBSP}${NBSP}└─ CN¥100.00`);
  });

  it("shows base-currency conversion only for foreign currencies", () => {
    const text = buildSettleNotificationCaption(sample);
    // USD bucket is foreign → must show ≈ S$54.20
    expect(text).toContain("≈ S$54.20");
    expect(text).toContain("≈ S$27.00");
    expect(text).toContain("≈ S$18.22");
  });

  it("singular 'group' when only one chat is involved", () => {
    const single: CrossGroupSummary = {
      senderName: "Bubu",
      baseCurrency: "SGD",
      totalBaseAbs: 40,
      groups: [
        {
          chatId: 1,
          chatTitle: "Roommates",
          currency: "SGD",
          nativeAbs: 40,
          baseAbs: 40,
        },
      ],
    };
    const text = unescape(buildSettleNotificationCaption(single));
    expect(text).toContain("across 1 group");
    expect(text).not.toContain("across 1 groups");
  });
});

describe("buildNudgeCaption", () => {
  it("renders sender, total, group count, breakdown, and CTA", () => {
    const text = buildNudgeCaption(sample);
    const rendered = unescape(text);

    expect(rendered).toContain("🔔 *Debt Reminder*");
    expect(rendered).toContain("You owe Bubu");
    expect(rendered).toContain("S$99.42");
    expect(rendered).toContain("across 2 groups");
    expect(rendered).toContain("Bali Trip");
    expect(rendered).toContain(
      "💁 Open Balances in your personal chat to settle"
    );
  });
});

describe("MarkdownV2 escaping", () => {
  it("escapes periods in amounts outside the code block", () => {
    const text = buildNudgeCaption(sample);
    // Summary line is outside the ``` block — period must be escaped
    expect(text).toMatch(/S\$99\\\.42/);
  });

  it("does NOT escape inside the code block", () => {
    const text = buildNudgeCaption(sample);
    const codeBlock = text.match(/```\n([\s\S]+?)\n```/);
    expect(codeBlock).toBeTruthy();
    // Tree content has raw amounts (no backslash before the period)
    expect(codeBlock![1]).toContain("$40.00");
    expect(codeBlock![1]).not.toContain("$40\\.00");
  });
});
