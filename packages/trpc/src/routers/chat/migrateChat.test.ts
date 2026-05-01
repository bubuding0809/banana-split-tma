import { describe, expect, it } from "vitest";
import { migrateChatHandler } from "./migrateChat.js";

function makeTxMock(state: { oldChat: any; newChat: any }) {
  return {
    $executeRaw: async () => 1,
    chat: {
      findUnique: async ({ where }: any) => {
        if (where.id === 1n) return state.oldChat;
        if (where.id === 2n) return state.newChat;
        return null;
      },
      delete: async () => state.oldChat,
      update: async () => state.newChat,
    },
    expense: { count: async () => 0, updateMany: async () => ({ count: 0 }) },
    settlement: {
      count: async () => 0,
      updateMany: async () => ({ count: 0 }),
    },
    expenseSnapshot: {
      count: async () => 0,
      updateMany: async () => ({ count: 0 }),
    },
    recurringExpenseTemplate: { updateMany: async () => ({ count: 0 }) },
    chatApiKey: { updateMany: async () => ({ count: 0 }) },
    chatCategory: {
      deleteMany: async () => ({ count: 0 }),
      updateMany: async () => ({ count: 0 }),
    },
    chatCategoryOrdering: {
      deleteMany: async () => ({ count: 0 }),
      updateMany: async () => ({ count: 0 }),
    },
  };
}

function makeDb(state: { oldChat: any; newChat: any }) {
  return {
    chat: {
      findUnique: async ({ where }: any) => {
        if (where.id === 1n) return state.oldChat;
        if (where.id === 2n) return state.newChat;
        return null;
      },
    },
    $transaction: async (cb: any) => cb(makeTxMock(state)),
  } as any;
}

describe("migrateChatHandler", () => {
  it("returns migrated:true when running Branch B (new chat doesn't exist)", async () => {
    const db = makeDb({ oldChat: { id: 1n, members: [] }, newChat: null });
    const result = await migrateChatHandler(
      { oldChatId: 1n, newChatId: 2n },
      db
    );
    expect(result.migrated).toBe(true);
  });

  it("returns migrated:false when old chat doesn't exist (idempotent)", async () => {
    const db = makeDb({ oldChat: null, newChat: { id: 2n } });
    const result = await migrateChatHandler(
      { oldChatId: 1n, newChatId: 2n },
      db
    );
    expect(result.migrated).toBe(false);
    expect(result.migratedRecords).toEqual({
      expenses: 0,
      settlements: 0,
      snapshots: 0,
      schedules: 0,
    });
  });
});
