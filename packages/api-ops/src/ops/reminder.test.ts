import { describe, it, expect, vi } from "vitest";
import {
  sendGroupReminder,
  validateSendDebtReminderInput,
} from "./reminder.js";

vi.mock("@bananasplitz/api-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@bananasplitz/api-client")>();
  return {
    ...actual,
    resolveChatId: vi.fn(async (_trpc, chatId?: string) =>
      chatId ? Number(chatId) : 12345
    ),
  };
});

describe("reminder ops", () => {
  it("sendGroupReminder calls trpc.telegram.sendGroupReminderMessage", async () => {
    const mutateMock = vi
      .fn()
      .mockResolvedValue({ success: true, messageId: 101 });
    const trpc = {
      telegram: { sendGroupReminderMessage: { mutate: mutateMock } },
    } as never;

    await sendGroupReminder(trpc, { chatId: "111" });
    expect(mutateMock).toHaveBeenCalledWith({ chatId: "111" });
  });

  it("validateSendDebtReminderInput throws for missing fields", () => {
    expect(() => validateSendDebtReminderInput({})).toThrow(
      "Missing required option: --debtor-user-id"
    );
  });
});
