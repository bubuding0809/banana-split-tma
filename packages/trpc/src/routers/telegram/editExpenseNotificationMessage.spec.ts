import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  editExpenseMessageHandler,
  sendExpenseUpdateStandaloneHandler,
} from "./editExpenseNotificationMessage.js";

const mockTeleBot = {
  sendMessage: vi.fn(),
  editMessageText: vi.fn(),
  getMe: vi.fn(),
};

describe("sendExpenseUpdateStandaloneHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTeleBot.getMe.mockResolvedValue({ username: "testbot" });
    mockTeleBot.sendMessage.mockResolvedValue({ message_id: 42 });
  });

  it("sends a minimal 'updated by' message with a View Expense button", async () => {
    const messageId = await sendExpenseUpdateStandaloneHandler(
      {
        chatId: 1001,
        chatType: "group",
        expenseId: "123e4567-e89b-12d3-a456-426614174000",
        expenseDescription: "Brunch at Lola's",
        updaterUserId: 7,
        updaterName: "Xueting",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockTeleBot as any
    );

    expect(messageId).toBe(42);
    expect(mockTeleBot.sendMessage).toHaveBeenCalledOnce();

    const [chatId, text, extra] = mockTeleBot.sendMessage.mock.calls[0] ?? [];
    expect(chatId).toBe(1001);
    expect(text).toContain("Expense updated by");
    expect(text).toContain("Xueting");
    // Description is inline so readers can identify the expense without
    // tapping View Expense. Note the apostrophe gets MarkdownV2-escaped
    // if needed — here the description has no special chars.
    expect(text).toContain("Brunch at Lola");

    const button = (
      extra as {
        reply_markup?: {
          inline_keyboard: { text: string; url?: string }[][];
        };
      }
    )?.reply_markup?.inline_keyboard?.[0]?.[0];
    expect(button?.text).toBe("View Expense");
    expect(button?.url).toMatch(
      /\?startapp=v1_g_[A-Za-z0-9-]+_e_[A-Za-z0-9]+$/
    );
  });

  it("is standalone — sends without reply_parameters so it survives a deleted parent", async () => {
    await sendExpenseUpdateStandaloneHandler(
      {
        chatId: 1001,
        chatType: "group",
        expenseId: "123e4567-e89b-12d3-a456-426614174000",
        expenseDescription: "Brunch at Lola's",
        updaterUserId: 7,
        updaterName: "Xueting",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockTeleBot as any
    );

    const [, , extra] = mockTeleBot.sendMessage.mock.calls[0] ?? [];
    expect(
      (extra as { reply_parameters?: unknown })?.reply_parameters
    ).toBeUndefined();
  });

  it("uses the 'p' deep-link segment for private chats", async () => {
    await sendExpenseUpdateStandaloneHandler(
      {
        chatId: 42,
        chatType: "private",
        expenseId: "123e4567-e89b-12d3-a456-426614174000",
        expenseDescription: "Cab",
        updaterUserId: 7,
        updaterName: "Xueting",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockTeleBot as any
    );

    const [, , extra] = mockTeleBot.sendMessage.mock.calls[0] ?? [];
    const url = (
      extra as {
        reply_markup?: {
          inline_keyboard: { text: string; url?: string }[][];
        };
      }
    )?.reply_markup?.inline_keyboard?.[0]?.[0]?.url;
    expect(url).toMatch(/\?startapp=v1_p_/);
  });
});

describe("editExpenseMessageHandler — recurring keyboard", () => {
  const baseEditInput = {
    chatId: 1001,
    chatType: "group",
    expenseId: "123e4567-e89b-12d3-a456-426614174000",
    messageId: 555,
    payerId: 1,
    payerName: "Alice",
    expenseDescription: "Lunch",
    totalAmount: 20,
    participants: [
      { userId: 1, name: "Alice", amount: 10 },
      { userId: 2, name: "Bob", amount: 10 },
    ],
    currency: "SGD",
    expenseDate: new Date("2026-04-24T00:00:00Z"),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockTeleBot.getMe.mockResolvedValue({ username: "testbot" });
    mockTeleBot.editMessageText.mockResolvedValue({});
  });

  it("edits with two buttons when recurringTemplateId is set", async () => {
    await editExpenseMessageHandler(
      {
        ...baseEditInput,
        recurringTemplateId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockTeleBot as any
    );

    expect(mockTeleBot.editMessageText).toHaveBeenCalledOnce();
    const [, , , , extra] = mockTeleBot.editMessageText.mock.calls[0] ?? [];
    const row = (
      extra as {
        reply_markup?: { inline_keyboard: { text: string; url?: string }[][] };
      }
    )?.reply_markup?.inline_keyboard?.[0];

    expect(row).toHaveLength(2);
    expect(row?.[0]?.text).toBe("View Expense");
    expect(row?.[1]?.text).toBe("View Schedule");
    // View Schedule uses the "rt" entity type in the deep link
    expect(row?.[1]?.url).toMatch(
      /\?startapp=v1_g_[A-Za-z0-9-]+_rt_[A-Za-z0-9]+$/
    );
  });

  it("edits with one button when recurringTemplateId is not set", async () => {
    await editExpenseMessageHandler(
      { ...baseEditInput },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockTeleBot as any
    );

    expect(mockTeleBot.editMessageText).toHaveBeenCalledOnce();
    const [, , , , extra] = mockTeleBot.editMessageText.mock.calls[0] ?? [];
    const row = (
      extra as {
        reply_markup?: { inline_keyboard: { text: string; url?: string }[][] };
      }
    )?.reply_markup?.inline_keyboard?.[0];

    expect(row).toHaveLength(1);
    expect(row?.[0]?.text).toBe("View Expense");
  });

  it("edits with one button when recurringTemplateId is explicitly null", async () => {
    await editExpenseMessageHandler(
      { ...baseEditInput, recurringTemplateId: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockTeleBot as any
    );

    const [, , , , extra] = mockTeleBot.editMessageText.mock.calls[0] ?? [];
    const row = (
      extra as {
        reply_markup?: { inline_keyboard: { text: string; url?: string }[][] };
      }
    )?.reply_markup?.inline_keyboard?.[0];

    expect(row).toHaveLength(1);
    expect(row?.[0]?.text).toBe("View Expense");
  });
});
