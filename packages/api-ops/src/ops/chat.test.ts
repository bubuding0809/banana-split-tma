import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiValidationError } from "../errors.js";
import {
  getChat,
  getDebts,
  getSimplifiedDebts,
  listChats,
  updateChatSettings,
} from "./chat.js";

vi.mock("@bananasplitz/api-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@bananasplitz/api-client")>();
  return {
    ...actual,
    resolveChatId: vi.fn(async (_trpc, chatId?: string) => {
      if (chatId) return Number(chatId);
      return 12345;
    }),
  };
});

describe("chat ops", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listChats calls trpc.chat.getAllChats", async () => {
    const queryMock = vi.fn().mockResolvedValue([{ id: 1, type: "group" }]);
    const trpc = { chat: { getAllChats: { query: queryMock } } } as never;

    await listChats(trpc, { excludeTypes: ["private", "sender"] });

    expect(queryMock).toHaveBeenCalledWith({
      excludeTypes: ["private", "sender"],
    });
  });

  it("getChat calls trpc.chat.getChat with resolved ID", async () => {
    const queryMock = vi.fn().mockResolvedValue({ id: 999 });
    const trpc = { chat: { getChat: { query: queryMock } } } as never;

    await getChat(trpc, { chatId: "999" });

    expect(queryMock).toHaveBeenCalledWith({ chatId: 999 });
  });

  it("getDebts calls trpc.chat.getBulkChatDebts", async () => {
    const queryMock = vi.fn().mockResolvedValue([]);
    const trpc = { chat: { getBulkChatDebts: { query: queryMock } } } as never;

    await getDebts(trpc, { chatId: "888", currencies: ["USD", "EUR"] });

    expect(queryMock).toHaveBeenCalledWith({
      chatId: 888,
      currencies: ["USD", "EUR"],
    });
  });

  it("getSimplifiedDebts throws when currency is missing", async () => {
    const trpc = {} as never;
    await expect(getSimplifiedDebts(trpc, {})).rejects.toBeInstanceOf(
      ApiValidationError
    );
    await expect(getSimplifiedDebts(trpc, {})).rejects.toMatchObject({
      code: "missing_field",
      message: "--currency is required",
    });
  });

  it("getSimplifiedDebts calls trpc.chat.getSimplifiedDebts", async () => {
    const queryMock = vi.fn().mockResolvedValue([]);
    const trpc = {
      chat: { getSimplifiedDebts: { query: queryMock } },
    } as never;

    await getSimplifiedDebts(trpc, { chatId: "777", currency: "JPY" });

    expect(queryMock).toHaveBeenCalledWith({ chatId: 777, currency: "JPY" });
  });

  it("updateChatSettings calls trpc.chat.updateChat", async () => {
    const mutateMock = vi.fn().mockResolvedValue({ success: true });
    const trpc = { chat: { updateChat: { mutate: mutateMock } } } as never;

    await updateChatSettings(trpc, {
      chatId: "555",
      debtSimplificationEnabled: true,
      baseCurrency: "GBP",
    });

    expect(mutateMock).toHaveBeenCalledWith({
      chatId: 555,
      debtSimplificationEnabled: true,
      baseCurrency: "GBP",
    });
  });
});
