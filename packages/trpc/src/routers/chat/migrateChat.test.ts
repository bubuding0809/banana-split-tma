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

  it("acquires a transaction-scoped advisory lock on newChatId", async () => {
    const calls: string[] = [];
    const txMock = {
      ...makeTxMock({ oldChat: null, newChat: null }),
      $executeRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
        calls.push(strings.join("?") + " :: " + values.join(","));
        return 1;
      },
    };
    const db = {
      chat: { findUnique: async () => null },
      $transaction: async (cb: any) => cb(txMock),
    } as any;
    await migrateChatHandler({ oldChatId: 1n, newChatId: 2n }, db);
    expect(
      calls.some((c) => c.includes("pg_advisory_xact_lock") && c.includes("2"))
    ).toBe(true);
  });

  it("race-branch moves RecurringExpenseTemplate and ChatApiKey rows", async () => {
    const moves: Record<string, { from: bigint; to: bigint } | null> = {
      recurringExpenseTemplate: null,
      chatApiKey: null,
    };
    const tx = {
      ...makeTxMock({ oldChat: { id: 1n, members: [] }, newChat: { id: 2n } }),
      recurringExpenseTemplate: {
        updateMany: async ({ where, data }: any) => {
          moves.recurringExpenseTemplate = {
            from: where.chatId,
            to: data.chatId,
          };
          return { count: 0 };
        },
      },
      chatApiKey: {
        updateMany: async ({ where, data }: any) => {
          moves.chatApiKey = { from: where.chatId, to: data.chatId };
          return { count: 0 };
        },
      },
    };
    const db = {
      $transaction: async (cb: any) => cb(tx),
    } as any;
    await migrateChatHandler({ oldChatId: 1n, newChatId: 2n }, db);
    expect(moves.recurringExpenseTemplate).toEqual({ from: 1n, to: 2n });
    expect(moves.chatApiKey).toEqual({ from: 1n, to: 2n });
  });
});
