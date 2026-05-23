import { describe, it, expect, vi } from "vitest";
import { chatCommands } from "./chat.js";

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

describe("chat commands", () => {
  it("list-chats should call trpc.chat.getAllChats", async () => {
    const cmd = chatCommands.find((c) => c.name === "list-chats");
    const queryMock = vi.fn().mockResolvedValue([{ id: 1, type: "group" }]);
    const trpcMock = { chat: { getAllChats: { query: queryMock } } } as never;

    await cmd?.execute({ "exclude-types": "private,sender" }, trpcMock);

    expect(queryMock).toHaveBeenCalledWith({
      excludeTypes: ["private", "sender"],
    });
  });

  it("get-chat should call trpc.chat.getChat with resolved ID", async () => {
    const cmd = chatCommands.find((c) => c.name === "get-chat");
    const queryMock = vi.fn().mockResolvedValue({ id: 999 });
    const trpcMock = { chat: { getChat: { query: queryMock } } } as never;

    await cmd?.execute({ "chat-id": "999" }, trpcMock);

    expect(queryMock).toHaveBeenCalledWith({ chatId: 999 });
  });

  it("get-debts should call trpc.chat.getBulkChatDebts", async () => {
    const cmd = chatCommands.find((c) => c.name === "get-debts");
    const queryMock = vi.fn().mockResolvedValue([]);
    const trpcMock = {
      chat: { getBulkChatDebts: { query: queryMock } },
    } as never;

    await cmd?.execute({ "chat-id": "888", currencies: "USD,EUR" }, trpcMock);

    expect(queryMock).toHaveBeenCalledWith({
      chatId: 888,
      currencies: ["USD", "EUR"],
    });
  });

  it("get-simplified-debts should fail if currency is missing", async () => {
    const cmd = chatCommands.find((c) => c.name === "get-simplified-debts");
    const trpcMock = {} as never;
    const result = await cmd?.execute({}, trpcMock);

    expect(result).toMatchObject({
      code: "missing_option",
      message: "--currency is required",
    });
  });

  it("get-simplified-debts should call trpc.chat.getSimplifiedDebts", async () => {
    const cmd = chatCommands.find((c) => c.name === "get-simplified-debts");
    const queryMock = vi.fn().mockResolvedValue([]);
    const trpcMock = {
      chat: { getSimplifiedDebts: { query: queryMock } },
    } as never;

    await cmd?.execute({ "chat-id": "777", currency: "JPY" }, trpcMock);

    expect(queryMock).toHaveBeenCalledWith({ chatId: 777, currency: "JPY" });
  });

  it("update-chat-settings should call trpc.chat.updateChat", async () => {
    const cmd = chatCommands.find((c) => c.name === "update-chat-settings");
    const mutateMock = vi.fn().mockResolvedValue({ success: true });
    const trpcMock = { chat: { updateChat: { mutate: mutateMock } } } as never;

    await cmd?.execute(
      {
        "chat-id": "555",
        "debt-simplification": "true",
        "base-currency": "GBP",
      },
      trpcMock
    );

    expect(mutateMock).toHaveBeenCalledWith({
      chatId: 555,
      debtSimplificationEnabled: true,
      baseCurrency: "GBP",
    });
  });
});
