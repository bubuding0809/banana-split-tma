import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendExpenseNotificationMessageHandler,
  formatExpenseMessage,
} from "./sendExpenseNotificationMessage.js";
import type { PrismaClient } from "@dko/database";

const mockDb = {
  chat: {
    findUnique: vi.fn(),
  },
} as unknown as PrismaClient;

const mockTeleBot = {
  sendMessage: vi.fn(),
  getMe: vi.fn(),
};

const baseInput = {
  chatId: 42,
  chatType: "group",
  expenseId: "123e4567-e89b-12d3-a456-426614174000",
  payerId: 1,
  payerName: "Alice",
  creatorUserId: 1,
  creatorName: "Alice",
  expenseDescription: "Lunch",
  totalAmount: 20,
  participants: [
    { userId: 1, name: "Alice", amount: 10 },
    { userId: 2, name: "Bob", amount: 10 },
  ],
  currency: "SGD",
  expenseDate: new Date(),
};

describe("sendExpenseNotificationMessage gating", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTeleBot.getMe.mockResolvedValue({ username: "testbot" });
    mockTeleBot.sendMessage.mockResolvedValue({ message_id: 99 });
  });

  it("returns null when chat.notifyOnExpense is false and force is false", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({
      notifyOnExpense: false,
    });

    const result = await sendExpenseNotificationMessageHandler(
      { ...baseInput, force: false },
      mockDb,
      mockTeleBot as any
    );

    expect(result).toBeNull();
    expect(mockTeleBot.sendMessage).not.toHaveBeenCalled();
  });

  it("sends when chat.notifyOnExpense is true", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({
      notifyOnExpense: true,
    });

    const result = await sendExpenseNotificationMessageHandler(
      { ...baseInput, force: false },
      mockDb,
      mockTeleBot as any
    );

    expect(result).toBe(99);
    expect(mockTeleBot.sendMessage).toHaveBeenCalledOnce();
  });

  it("bypasses the pref check when force is true", async () => {
    const result = await sendExpenseNotificationMessageHandler(
      { ...baseInput, force: true },
      mockDb,
      mockTeleBot as any
    );

    expect(result).toBe(99);
    expect(mockDb.chat.findUnique).not.toHaveBeenCalled();
    expect(mockTeleBot.sendMessage).toHaveBeenCalledOnce();
  });

  it("includes a category row when emoji + title are provided", async () => {
    await sendExpenseNotificationMessageHandler(
      {
        ...baseInput,
        categoryEmoji: "🍜",
        categoryTitle: "Food",
        force: true,
      },
      mockDb,
      mockTeleBot as any
    );
    const call = mockTeleBot.sendMessage.mock.calls[0];
    if (!call) throw new Error("sendMessage was not called");
    const message = call[1];
    expect(message).toContain("> 🏷 • 🍜 Food");
  });

  it("skips the category row when emoji or title is missing", async () => {
    await sendExpenseNotificationMessageHandler(
      { ...baseInput, categoryEmoji: "🍜", force: true },
      mockDb,
      mockTeleBot as any
    );
    const call = mockTeleBot.sendMessage.mock.calls[0];
    if (!call) throw new Error("sendMessage was not called");
    const message = call[1];
    expect(message).not.toContain("🏷");
  });

  it("uses 'View Expense' CTA pointing at the v1 deep link", async () => {
    await sendExpenseNotificationMessageHandler(
      { ...baseInput, force: true },
      mockDb,
      mockTeleBot as any
    );
    const call = mockTeleBot.sendMessage.mock.calls[0];
    if (!call) throw new Error("sendMessage was not called");
    const extra = call[2] as {
      reply_markup?: {
        inline_keyboard: { text: string; url?: string }[][];
      };
    };
    const button = extra?.reply_markup?.inline_keyboard?.[0]?.[0];
    expect(button?.text).toBe("View Expense");
    // v1 payload format: v1_<chatType>_<chatIdBase62>_<entityType>_<entityIdBase62>
    expect(button?.url).toMatch(
      /\?startapp=v1_g_[A-Za-z0-9-]+_e_[A-Za-z0-9]+$/
    );
  });
});

describe("formatExpenseMessage — update variant", () => {
  const common = {
    payerId: 1,
    payerName: "Alice",
    description: "Lunch",
    totalAmount: 20,
    participants: [
      { userId: 1, name: "Alice", amount: 10 },
      { userId: 2, name: "Bob", amount: 10 },
    ],
    currency: "SGD",
    expenseDate: new Date("2026-04-24T00:00:00Z"),
  };

  it("renders 'New Expense' title and no ✏️ markers for initial send", () => {
    const message = formatExpenseMessage(
      common.payerId,
      common.payerName,
      common.description,
      common.totalAmount,
      common.participants,
      common.currency,
      common.expenseDate
    );
    expect(message).toContain("🧾 New Expense by");
    expect(message).not.toContain("✏️");
  });

  it("renders 'Expense' (no 'New') when isUpdate=true", () => {
    const message = formatExpenseMessage(
      common.payerId,
      common.payerName,
      common.description,
      common.totalAmount,
      common.participants,
      common.currency,
      common.expenseDate,
      undefined,
      undefined,
      { isUpdate: true }
    );
    expect(message).toContain("🧾 Expense by");
    expect(message).not.toContain("🧾 New Expense");
  });

  it("marks only the fields present in changedFields", () => {
    const message = formatExpenseMessage(
      common.payerId,
      common.payerName,
      common.description,
      common.totalAmount,
      common.participants,
      common.currency,
      common.expenseDate,
      "🍜",
      "Food",
      { isUpdate: true, changedFields: ["amount", "split"] }
    );
    // amount + split are marked
    expect(message).toMatch(/Total: SGD 20\\\.00 ✏️/);
    expect(message).toContain("💸 Splits ✏️");
    // description, category, payer are NOT marked
    expect(message).not.toMatch(/Lunch ✏️/);
    expect(message).not.toMatch(/🍜 Food ✏️/);
    expect(message).not.toMatch(/🧾 Expense by [^\n]+ ✏️/);
  });

  it("marks the category line and payer mention when those fields change", () => {
    const message = formatExpenseMessage(
      common.payerId,
      common.payerName,
      common.description,
      common.totalAmount,
      common.participants,
      common.currency,
      common.expenseDate,
      "🍜",
      "Food",
      { isUpdate: true, changedFields: ["category", "payer"] }
    );
    expect(message).toMatch(/🍜 Food ✏️/);
    expect(message).toMatch(/🧾 Expense by .+ ✏️/);
  });
});
