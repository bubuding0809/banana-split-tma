import { describe, it, expect, vi } from "vitest";
import { reminderCommands } from "./reminder.js";

vi.mock("../output.js", async () => {
  const { createOutputMocks } = await import("./test-helpers.js");
  return createOutputMocks();
});

vi.mock("@bananasplitz/api-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@bananasplitz/api-client")>();
  const { createResolveChatIdMock } = await import("./test-helpers.js");
  return {
    ...actual,
    resolveChatId: createResolveChatIdMock(),
  };
});

describe("reminder commands", () => {
  it("send-group-reminder should call trpc.telegram.sendGroupReminderMessage", async () => {
    const cmd = reminderCommands.find((c) => c.name === "send-group-reminder");
    const mutateMock = vi
      .fn()
      .mockResolvedValue({ success: true, messageId: 101 });
    const trpcMock = {
      telegram: { sendGroupReminderMessage: { mutate: mutateMock } },
    } as never;

    await cmd?.execute({ "chat-id": "111" }, trpcMock);
    expect(mutateMock).toHaveBeenCalledWith({ chatId: "111" });
  });

  it("send-debt-reminder should fail if required options are missing", async () => {
    const cmd = reminderCommands.find((c) => c.name === "send-debt-reminder");
    const trpcMock = {} as never;

    expect(await cmd?.execute({}, trpcMock)).toMatchObject({
      code: "missing_option",
      message: "Missing required option: --debtor-user-id",
    });

    expect(
      await cmd?.execute({ "debtor-user-id": "1" }, trpcMock)
    ).toMatchObject({
      code: "missing_option",
      message: "Missing required option: --debtor-name",
    });

    expect(
      await cmd?.execute(
        { "debtor-user-id": "1", "debtor-name": "John" },
        trpcMock
      )
    ).toMatchObject({
      code: "missing_option",
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
      code: "missing_option",
      message: "Missing required option: --amount",
    });
  });

  it("send-debt-reminder should call trpc.telegram.sendDebtReminderMessage with valid inputs", async () => {
    const cmd = reminderCommands.find((c) => c.name === "send-debt-reminder");
    const mutateMock = vi.fn().mockResolvedValue({ messageId: 102 });
    const trpcMock = {
      telegram: { sendDebtReminderMessage: { mutate: mutateMock } },
    } as never;

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
