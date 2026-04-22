import { describe, it, expect, vi } from "vitest";
import {
  formatBatchSummaryMessage,
  sendBatchExpenseSummaryHandler,
} from "./sendBatchExpenseSummary.js";
import { Telegram } from "telegraf";

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
    // First 10 shown (each row is a blockquote with 🧾 <desc> on its own line)
    expect(msg).toContain(">🧾 Expense 1\n");
    expect(msg).toContain(">🧾 Expense 10\n");
    // 11+ not shown
    expect(msg).not.toContain(">🧾 Expense 11");
    expect(msg).toContain("…and 5 more");
  });

  it("renders a tree-style blockquote per item with every field on its own branch", () => {
    const msg = formatBatchSummaryMessage(
      "created",
      [
        {
          description: "Ramen dinner",
          amount: 48.5,
          currency: "SGD",
          payerName: "Ruoqian",
          splitMode: "EQUAL" as any,
          participantCount: 3,
          categoryEmoji: "🍜",
          categoryTitle: "Food",
        },
      ],
      "Ruoqian"
    );
    expect(msg).toContain(">🧾 Ramen dinner");
    expect(msg).toContain(">┣ SGD 48\\.50");
    expect(msg).toContain(">┣ paid by Ruoqian");
    expect(msg).toContain(">┣ 🍜 Food");
    expect(msg).toContain(">┗ EQUAL split across 3");
  });

  it("marks changed branches with ✏️ when kind is updated", () => {
    const msg = formatBatchSummaryMessage(
      "updated",
      [
        {
          description: "Ramen",
          amount: 48.5,
          currency: "SGD",
          payerName: "Ruoqian",
          splitMode: "EQUAL" as any,
          participantCount: 3,
          categoryEmoji: "🍜",
          categoryTitle: "Food",
          changedFields: ["category", "split"],
        },
      ],
      "Ruoqian"
    );
    // Only the category and split branches should carry the marker.
    expect(msg).toContain(">┣ 🍜 Food ✏️");
    expect(msg).toContain(">┗ EQUAL split across 3 ✏️");
    expect(msg).toContain(">┣ SGD 48\\.50\n"); // amount NOT marked
    expect(msg).toContain(">┣ paid by Ruoqian\n"); // payer NOT marked
    expect(msg).toContain(">🧾 Ramen\n"); // description NOT marked
  });

  it("marks the title line with ✏️ when description changed", () => {
    const msg = formatBatchSummaryMessage("updated", [
      {
        description: "New name",
        amount: 10,
        currency: "SGD",
        changedFields: ["description"],
      },
    ]);
    expect(msg).toContain(">🧾 New name ✏️");
  });

  it("does NOT mark branches on a created summary even when changedFields is set", () => {
    const msg = formatBatchSummaryMessage("created", [
      {
        description: "Brand new",
        amount: 10,
        currency: "SGD",
        payerName: "R",
        splitMode: "EQUAL" as any,
        participantCount: 2,
        changedFields: ["amount", "payer", "category", "split", "description"],
      },
    ]);
    expect(msg).not.toContain("✏️");
  });

  it("promotes the last present branch to ┗ when later ones are absent", () => {
    const msgOnlyAmount = formatBatchSummaryMessage("created", [
      { description: "Bare", amount: 1, currency: "SGD" },
    ]);
    expect(msgOnlyAmount).toContain(">┗ SGD 1\\.00");
    expect(msgOnlyAmount).not.toContain(">┣ ");

    const msgAmountAndPayer = formatBatchSummaryMessage("created", [
      { description: "Two", amount: 2, currency: "SGD", payerName: "R" },
    ]);
    expect(msgAmountAndPayer).toContain(">┣ SGD 2\\.00");
    expect(msgAmountAndPayer).toContain(">┗ paid by R");
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

describe("sendBatchExpenseSummaryHandler gating", () => {
  const baseItem = {
    description: "Test",
    amount: 1,
    currency: "SGD",
  };

  function makeDb(chat: {
    notifyOnExpense: boolean;
    notifyOnExpenseUpdate: boolean;
  }) {
    return {
      chat: {
        findUnique: vi.fn().mockResolvedValue({
          id: BigInt(123),
          threadId: null,
          ...chat,
        }),
      },
      chatCategory: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
  }

  function makeTeleBot() {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 999 });
    return { bot: { sendMessage } as unknown as Telegram, sendMessage };
  }

  it("skips the send when kind=updated and notifyOnExpenseUpdate is false", async () => {
    const db = makeDb({
      notifyOnExpense: true,
      notifyOnExpenseUpdate: false,
    });
    const { bot, sendMessage } = makeTeleBot();

    const result = await sendBatchExpenseSummaryHandler(
      {
        chatId: BigInt(123),
        kind: "updated",
        items: [baseItem],
      },
      db,
      bot
    );

    expect(result).toEqual({ sent: false, messageId: null });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("skips the send when kind=created and notifyOnExpense is false", async () => {
    const db = makeDb({
      notifyOnExpense: false,
      notifyOnExpenseUpdate: true,
    });
    const { bot, sendMessage } = makeTeleBot();

    const result = await sendBatchExpenseSummaryHandler(
      {
        chatId: BigInt(123),
        kind: "created",
        items: [baseItem],
      },
      db,
      bot
    );

    expect(result).toEqual({ sent: false, messageId: null });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("still sends when the opposite kind's flag is false", async () => {
    // notifyOnExpense=false should NOT silence kind=updated.
    const db = makeDb({
      notifyOnExpense: false,
      notifyOnExpenseUpdate: true,
    });
    const { bot, sendMessage } = makeTeleBot();

    const result = await sendBatchExpenseSummaryHandler(
      {
        chatId: BigInt(123),
        kind: "updated",
        items: [baseItem],
      },
      db,
      bot
    );

    expect(result).toEqual({ sent: true, messageId: 999 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
