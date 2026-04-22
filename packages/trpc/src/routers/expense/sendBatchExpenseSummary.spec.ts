import { describe, it, expect } from "vitest";
import { formatBatchSummaryMessage } from "./sendBatchExpenseSummary.js";

describe("formatBatchSummaryMessage", () => {
  it("formats a single created expense (singular noun)", () => {
    const msg = formatBatchSummaryMessage(
      "created",
      [{ description: "Lunch", amount: 12.5, currency: "SGD" }],
      "Ruoqian"
    );
    expect(msg).toContain("📥 *1 expense imported*");
    expect(msg).toContain("Lunch");
    expect(msg).toContain("SGD 12\\.50");
    expect(msg).toContain("_— imported by Ruoqian_");
  });

  it("formats multiple updated expenses (plural) with categories", () => {
    const msg = formatBatchSummaryMessage(
      "updated",
      [
        {
          description: "Ramen",
          amount: 48.5,
          currency: "SGD",
          categoryEmoji: "🍜",
          categoryTitle: "Food",
        },
        {
          description: "Taxi",
          amount: 35,
          currency: "SGD",
          categoryEmoji: "🚕",
          categoryTitle: "Transport",
        },
      ],
      "Ruoqian"
    );
    expect(msg).toContain("📝 *2 expenses updated*");
    expect(msg).toContain("Ramen");
    expect(msg).toContain("🍜 Food");
    expect(msg).toContain("Taxi");
    expect(msg).toContain("🚕 Transport");
    expect(msg).toContain("updated by Ruoqian");
  });

  it("escapes MarkdownV2 special characters in description, amount, title", () => {
    const msg = formatBatchSummaryMessage(
      "updated",
      [
        {
          description: "Meal (with tax) + tip!",
          amount: 10.5,
          currency: "USD",
          categoryEmoji: "🍔",
          categoryTitle: "Food & Drink",
        },
      ],
      "Jo.Doe"
    );
    // dots, parentheses, plus, exclamation, ampersand should be escaped
    expect(msg).toContain("Meal \\(with tax\\) \\+ tip\\!");
    expect(msg).toContain("USD 10\\.50");
    // Ampersand is NOT in MarkdownV2 escape set, but dot in user name is
    expect(msg).toContain("updated by Jo\\.Doe");
  });

  it("truncates beyond 10 items and shows overflow count", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      description: `Expense ${i + 1}`,
      amount: i + 1,
      currency: "SGD",
    }));
    const msg = formatBatchSummaryMessage("created", items);
    expect(msg).toContain("📥 *15 expenses imported*");
    // First 10 shown
    expect(msg).toContain("Expense 1 ");
    expect(msg).toContain("Expense 10 ");
    // 11+ not shown
    expect(msg).not.toContain("Expense 11 ");
    expect(msg).toContain("…and 5 more");
  });

  it("omits footer when no actorName provided", () => {
    const msg = formatBatchSummaryMessage("updated", [
      { description: "X", amount: 1, currency: "SGD" },
    ]);
    expect(msg).not.toContain("_— ");
  });

  it("omits category suffix when only emoji or only title provided", () => {
    const msg = formatBatchSummaryMessage("updated", [
      {
        description: "A",
        amount: 1,
        currency: "SGD",
        categoryEmoji: "🍜",
      },
      {
        description: "B",
        amount: 1,
        currency: "SGD",
        categoryTitle: "Food",
      },
    ]);
    // Neither line should have the " · " category suffix since they lack the pair
    expect(msg).not.toContain(" · 🍜");
    expect(msg).not.toContain(" · Food");
  });
});
