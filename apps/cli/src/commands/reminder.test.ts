import { describe, it, expect, vi } from "vitest";
import { reminderCommands } from "./reminder.js";

vi.mock("../output.js", () => ({
  success: vi.fn((data) => data),
  error: vi.fn((code, message) => ({ code, message })),
  run: vi.fn(async (cmd, fn) => {
    try {
      return await fn();
    } catch (err: any) {
      return { code: "api_error", message: err.message };
    }
  }),
}));

vi.mock("../scope.js", () => ({
  resolveChatId: vi.fn(async (trpc, chatId) => {
    if (chatId) return Number(chatId);
    return 12345;
  }),
}));

describe("reminder commands", () => {
  it("send-group-reminder should call trpc.telegram.sendGroupReminderMessage", async () => {
    const cmd = reminderCommands.find((c) => c.name === "send-group-reminder");
    const mutateMock = vi
      .fn()
      .mockResolvedValue({ success: true, messageId: 101 });
    const trpcMock = {
      telegram: { sendGroupReminderMessage: { mutate: mutateMock } },
    } as any;

    await cmd?.execute({ "chat-id": "111" }, trpcMock);
    expect(mutateMock).toHaveBeenCalledWith({ chatId: "111" });
  });

  it("send-debt-reminder should fail if required options are missing", async () => {
    const cmd = reminderCommands.find((c) => c.name === "send-debt-reminder");
    const trpcMock = {} as any;

    expect(await cmd?.execute({}, trpcMock)).toMatchObject({
      code: "api_error",
      message: "Missing required option: --debtor-user-id",
    });

    expect(
      await cmd?.execute({ "debtor-user-id": "1" }, trpcMock)
    ).toMatchObject({
      code: "api_error",
      message: "Missing required option: --debtor-name",
    });

    expect(
      await cmd?.execute(
        { "debtor-user-id": "1", "debtor-name": "John" },
        trpcMock
      )
    ).toMatchObject({
      code: "api_error",
      message: "Missing required option: --creditor-name",
    });

    expect(
      await cmd?.execute(
        {
          "debtor-user-id": "1",
          "debtor-name": "John",
          "creditor-name": "Jane",
        },
        trpcMock
      )
    ).toMatchObject({
      code: "api_error",
      message: "Missing required option: --amount",
    });
  });

  it("send-debt-reminder should call trpc.telegram.sendDebtReminderMessage with valid inputs", async () => {
    const cmd = reminderCommands.find((c) => c.name === "send-debt-reminder");
    const mutateMock = vi.fn().mockResolvedValue({ messageId: 102 });
    const trpcMock = {
      telegram: { sendDebtReminderMessage: { mutate: mutateMock } },
    } as any;

    await cmd?.execute(
      {
        "chat-id": "123",
        "debtor-user-id": "1",
        "debtor-name": "John",
        "creditor-name": "Jane",
        amount: "50.5",
        currency: "SGD",
        "thread-id": "99",
      },
      trpcMock
    );

    expect(mutateMock).toHaveBeenCalledWith({
      chatId: 123,
      debtorUserId: 1,
      debtorName: "John",
      creditorName: "Jane",
      amount: 50.5,
      currency: "SGD",
      threadId: 99,
    });
  });
});
