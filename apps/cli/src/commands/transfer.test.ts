import { describe, it, expect, vi } from "vitest";
import { transferCommands } from "./transfer.js";

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
  resolveChatId: vi.fn(async (_trpc, chatId) =>
    chatId ? Number(chatId) : 12345
  ),
}));

describe("transfer commands", () => {
  it("list-transfers calls trpc.debtTransfer.getAllByChat", async () => {
    const cmd = transferCommands.find((c) => c.name === "list-transfers");
    const queryMock = vi.fn().mockResolvedValue([]);
    const trpcMock = {
      debtTransfer: { getAllByChat: { query: queryMock } },
    } as any;

    await cmd?.execute({ "chat-id": "111" }, trpcMock);

    expect(queryMock).toHaveBeenCalledWith({ chatId: 111 });
  });

  it("delete-transfer fails when --transfer-id is missing", async () => {
    const cmd = transferCommands.find((c) => c.name === "delete-transfer");
    const trpcMock = {} as any;

    expect(await cmd?.execute({}, trpcMock)).toMatchObject({
      code: "missing_option",
      message: "--transfer-id is required",
    });
  });

  it("delete-transfer calls trpc.debtTransfer.deleteTransfer with the id", async () => {
    const cmd = transferCommands.find((c) => c.name === "delete-transfer");
    const mutateMock = vi.fn().mockResolvedValue({ success: true });
    const trpcMock = {
      debtTransfer: { deleteTransfer: { mutate: mutateMock } },
    } as any;

    await cmd?.execute({ "transfer-id": "tr-123" }, trpcMock);

    expect(mutateMock).toHaveBeenCalledWith({ transferId: "tr-123" });
  });
});

describe("transfer commands (create)", () => {
  it("create-transfer fails when required options are missing", async () => {
    const cmd = transferCommands.find((c) => c.name === "create-transfer");
    const trpcMock = {} as any;

    expect(await cmd?.execute({}, trpcMock)).toMatchObject({
      code: "missing_option",
      message: "--from-chat is required",
    });

    expect(await cmd?.execute({ "from-chat": "100" }, trpcMock)).toMatchObject({
      code: "missing_option",
      message: "--to-chat is required",
    });

    expect(
      await cmd?.execute({ "from-chat": "100", "to-chat": "200" }, trpcMock)
    ).toMatchObject({
      code: "missing_option",
      message: "--debtor is required",
    });

    expect(
      await cmd?.execute(
        { "from-chat": "100", "to-chat": "200", debtor: "2" },
        trpcMock
      )
    ).toMatchObject({
      code: "missing_option",
      message: "--creditor is required",
    });

    expect(
      await cmd?.execute(
        { "from-chat": "100", "to-chat": "200", debtor: "2", creditor: "3" },
        trpcMock
      )
    ).toMatchObject({
      code: "missing_option",
      message: "--amount is required",
    });
  });

  it("create-transfer calls trpc.debtTransfer.createTransfer with parsed args", async () => {
    const cmd = transferCommands.find((c) => c.name === "create-transfer");
    const mutateMock = vi.fn().mockResolvedValue({ id: "transfer-1" });
    const trpcMock = {
      debtTransfer: { createTransfer: { mutate: mutateMock } },
    } as any;

    await cmd?.execute(
      {
        "from-chat": "100",
        "to-chat": "200",
        debtor: "2",
        creditor: "3",
        amount: "71.79",
        currency: "SGD",
        description: "Trip consolidation",
      },
      trpcMock
    );

    expect(mutateMock).toHaveBeenCalledWith({
      sourceChatId: 100,
      targetChatId: 200,
      debtorId: 2,
      creditorId: 3,
      amount: 71.79,
      currency: "SGD",
      description: "Trip consolidation",
    });
  });

  it("create-transfer omits optional currency/description when not provided", async () => {
    const cmd = transferCommands.find((c) => c.name === "create-transfer");
    const mutateMock = vi.fn().mockResolvedValue({ id: "transfer-2" });
    const trpcMock = {
      debtTransfer: { createTransfer: { mutate: mutateMock } },
    } as any;

    await cmd?.execute(
      {
        "from-chat": "100",
        "to-chat": "200",
        debtor: "2",
        creditor: "3",
        amount: "10",
      },
      trpcMock
    );

    expect(mutateMock).toHaveBeenCalledWith({
      sourceChatId: 100,
      targetChatId: 200,
      debtorId: 2,
      creditorId: 3,
      amount: 10,
      currency: undefined,
      description: undefined,
    });
  });
});
