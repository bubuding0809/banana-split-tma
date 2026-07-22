import { describe, expect, it } from "vitest";
import { updateChatHandler } from "./updateChat.js";

const stubLog = { error: () => {} } as any;

const existingChat = {
  id: 42n,
  title: "test group",
  photo: "p",
  type: "group",
  threadId: null,
  baseCurrency: "SGD",
  debtSimplificationEnabled: false,
  agentEnabled: false,
  notifyOnExpense: true,
  notifyOnExpenseUpdate: true,
  notifyOnSettlement: true,
  notifyOnTransfer: true,
  timezone: null,
  migratedFromChatId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makeDb = () => {
  const calls: { data?: Record<string, unknown> } = {};
  const db = {
    chat: {
      findUnique: async () => existingChat,
      update: async (args: { data: Record<string, unknown> }) => {
        calls.data = args.data;
        return { ...existingChat, ...args.data };
      },
    },
  } as any;
  return { db, calls };
};

describe("updateChatHandler agentEnabled", () => {
  it("updates agentEnabled when provided", async () => {
    const { db, calls } = makeDb();
    const result = await updateChatHandler(
      { chatId: 42n, agentEnabled: true } as any,
      db,
      stubLog
    );
    expect(calls.data).toEqual({ agentEnabled: true });
    expect((result as any).agentEnabled).toBe(true);
  });

  it("leaves agentEnabled out of the update when omitted", async () => {
    const { db, calls } = makeDb();
    await updateChatHandler(
      { chatId: 42n, title: "renamed" } as any,
      db,
      stubLog
    );
    expect(calls.data).toEqual({ title: "renamed" });
  });
});
