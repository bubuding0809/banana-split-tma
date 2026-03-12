import { describe, it, expect, vi } from "vitest";
import { settlementCommands } from "./settlement.js";

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

describe("settlement commands", () => {
  it("list-settlements should call trpc.settlement.getSettlementByChat", async () => {
    const cmd = settlementCommands.find((c) => c.name === "list-settlements");
    const queryMock = vi.fn().mockResolvedValue([]);
    const trpcMock = {
      settlement: { getSettlementByChat: { query: queryMock } },
    } as any;

    await cmd?.execute({ "chat-id": "111", currency: "USD" }, trpcMock);

    expect(queryMock).toHaveBeenCalledWith({ chatId: 111, currency: "USD" });
  });

  it("create-settlement should fail if required options are missing", async () => {
    const cmd = settlementCommands.find((c) => c.name === "create-settlement");
    const trpcMock = {} as any;

    expect(await cmd?.execute({}, trpcMock)).toMatchObject({
      code: "missing_option",
      message: "--sender-id is required",
    });

    expect(await cmd?.execute({ "sender-id": "1" }, trpcMock)).toMatchObject({
      code: "missing_option",
      message: "--receiver-id is required",
    });

    expect(
      await cmd?.execute({ "sender-id": "1", "receiver-id": "2" }, trpcMock)
    ).toMatchObject({
      code: "missing_option",
      message: "--amount is required",
    });
  });

  it("create-settlement should call trpc.settlement.createSettlement", async () => {
    const cmd = settlementCommands.find((c) => c.name === "create-settlement");
    const mutateMock = vi.fn().mockResolvedValue({ id: "new-settlement" });
    const chatQueryMock = vi.fn().mockResolvedValue({
      id: 12345,
      threadId: 999,
      members: [
        { id: 1, firstName: "Alice", username: "alice" },
        { id: 2, firstName: "Bob", username: "bob" },
      ],
    });

    const trpcMock = {
      chat: { getChat: { query: chatQueryMock } },
      settlement: { createSettlement: { mutate: mutateMock } },
    } as any;

    await cmd?.execute(
      {
        "sender-id": "1",
        "receiver-id": "2",
        amount: "50",
        currency: "USD",
        description: "Thanks!",
      },
      trpcMock
    );

    expect(mutateMock).toHaveBeenCalledWith({
      chatId: 12345,
      senderId: 1,
      receiverId: 2,
      amount: 50,
      currency: "USD",
      description: "Thanks!",
      sendNotification: true,
      creditorName: "Bob",
      creditorUsername: "bob",
      debtorName: "Alice",
      threadId: 999,
    });
  });

  it("delete-settlement should fail when settlement-id is missing", async () => {
    const cmd = settlementCommands.find((c) => c.name === "delete-settlement");
    const trpcMock = {} as any;
    const result = await cmd?.execute({}, trpcMock);

    expect(result).toMatchObject({
      code: "missing_option",
      message: "--settlement-id is required",
    });
  });

  it("delete-settlement should call trpc.settlement.deleteSettlement with the correct ID", async () => {
    const cmd = settlementCommands.find((c) => c.name === "delete-settlement");
    const mutateMock = vi.fn().mockResolvedValue({ message: "Deleted" });
    const trpcMock = {
      settlement: { deleteSettlement: { mutate: mutateMock } },
    } as any;

    await cmd?.execute({ "settlement-id": "set-123" }, trpcMock);
    expect(mutateMock).toHaveBeenCalledWith({ settlementId: "set-123" });
  });
});
