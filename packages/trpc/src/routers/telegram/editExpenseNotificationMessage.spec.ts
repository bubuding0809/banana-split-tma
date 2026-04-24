import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendExpenseUpdateStandaloneHandler } from "./editExpenseNotificationMessage.js";

const mockTeleBot = {
  sendMessage: vi.fn(),
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
