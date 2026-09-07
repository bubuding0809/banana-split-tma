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
    debtTransfer: {
      count: async () => 0,
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
      transfers: 0,
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

  it("race-branch replaces new chat's categories+ordering with old chat's", async () => {
    const ops: string[] = [];
    const tx = {
      ...makeTxMock({ oldChat: { id: 1n, members: [] }, newChat: { id: 2n } }),
      chatCategory: {
        deleteMany: async ({ where }: any) => {
          ops.push(`category.deleteMany(chatId=${where.chatId})`);
          return { count: 0 };
        },
        updateMany: async ({ where, data }: any) => {
          ops.push(`category.updateMany(${where.chatId}->${data.chatId})`);
          return { count: 0 };
        },
      },
      chatCategoryOrdering: {
        deleteMany: async ({ where }: any) => {
          ops.push(`ordering.deleteMany(chatId=${where.chatId})`);
          return { count: 0 };
        },
        updateMany: async ({ where, data }: any) => {
          ops.push(`ordering.updateMany(${where.chatId}->${data.chatId})`);
          return { count: 0 };
        },
      },
    };
    const db = { $transaction: async (cb: any) => cb(tx) } as any;
    await migrateChatHandler({ oldChatId: 1n, newChatId: 2n }, db);
    expect(ops).toContain("category.deleteMany(chatId=2)");
    expect(ops).toContain("category.updateMany(1->2)");
    expect(ops).toContain("ordering.deleteMany(chatId=2)");
    expect(ops).toContain("ordering.updateMany(1->2)");
    // Delete must come before move for both.
    expect(ops.indexOf("category.deleteMany(chatId=2)")).toBeLessThan(
      ops.indexOf("category.updateMany(1->2)")
    );
    expect(ops.indexOf("ordering.deleteMany(chatId=2)")).toBeLessThan(
      ops.indexOf("ordering.updateMany(1->2)")
    );
  });
  it("race-branch repoints transfers on both legs to the new chat", async () => {
    const ops: string[] = [];
    const tx = {
      ...makeTxMock({ oldChat: { id: 1n, members: [] }, newChat: { id: 2n } }),
      debtTransfer: {
        count: async () => 3,
        deleteMany: async () => ({ count: 0 }),
        updateMany: async ({ where, data }: any) => {
          const leg = where.sourceChatId !== undefined ? "source" : "target";
          const from = where.sourceChatId ?? where.targetChatId;
          const to = data.sourceChatId ?? data.targetChatId;
          ops.push(`transfer.${leg}(${from}->${to})`);
          return { count: 0 };
        },
      },
      chat: {
        ...makeTxMock({ oldChat: { id: 1n, members: [] }, newChat: { id: 2n } })
          .chat,
        delete: async () => {
          ops.push("chat.delete");
          return { id: 1n };
        },
      },
    };
    const db = { $transaction: async (cb: any) => cb(tx) } as any;
    await migrateChatHandler({ oldChatId: 1n, newChatId: 2n }, db);

    // Both legs move, and both move BEFORE the old chat row is deleted —
    // otherwise ON DELETE CASCADE shreds the rows we were trying to save.
    expect(ops).toContain("transfer.source(1->2)");
    expect(ops).toContain("transfer.target(1->2)");
    expect(ops.indexOf("transfer.source(1->2)")).toBeLessThan(
      ops.indexOf("chat.delete")
    );
    expect(ops.indexOf("transfer.target(1->2)")).toBeLessThan(
      ops.indexOf("chat.delete")
    );
  });

  it("race-branch deletes transfers that would collapse onto one chat", async () => {
    const ops: string[] = [];
    let deleteWhere: any = null;
    const tx = {
      ...makeTxMock({ oldChat: { id: 1n, members: [] }, newChat: { id: 2n } }),
      debtTransfer: {
        count: async () => 1,
        deleteMany: async ({ where }: any) => {
          deleteWhere = where;
          ops.push("transfer.deleteMany");
          return { count: 1 };
        },
        updateMany: async () => {
          ops.push("transfer.updateMany");
          return { count: 0 };
        },
      },
    };
    const db = { $transaction: async (cb: any) => cb(tx) } as any;
    await migrateChatHandler({ oldChatId: 1n, newChatId: 2n }, db);

    // Only rows whose two ends are exactly the two chats being merged.
    expect(deleteWhere).toEqual({
      OR: [
        { sourceChatId: 1n, targetChatId: 2n },
        { sourceChatId: 2n, targetChatId: 1n },
      ],
    });
    // The collapse must be resolved before the repoint, or the repoint
    // creates the self-referencing row we are trying to avoid.
    expect(ops.indexOf("transfer.deleteMany")).toBeLessThan(
      ops.indexOf("transfer.updateMany")
    );
  });

  it("logs a warning naming the collapsed transfers", async () => {
    const warnings: any[] = [];
    const log = {
      info: () => {},
      error: () => {},
      warn: (payload: any, msg: string) => warnings.push({ payload, msg }),
    } as any;
    const tx = {
      ...makeTxMock({ oldChat: { id: 1n, members: [] }, newChat: { id: 2n } }),
      debtTransfer: {
        count: async () => 0,
        deleteMany: async () => ({ count: 2 }),
        updateMany: async () => ({ count: 0 }),
      },
    };
    const db = { $transaction: async (cb: any) => cb(tx) } as any;
    await migrateChatHandler({ oldChatId: 1n, newChatId: 2n }, db, log);

    const collapsed = warnings.find((w) =>
      w.msg.includes("transfer.collapsed")
    );
    expect(collapsed).toBeDefined();
    expect(collapsed.payload.collapsed_count).toBe(2);
  });

  it("does not warn when nothing collapsed", async () => {
    const warnings: any[] = [];
    const log = {
      info: () => {},
      error: () => {},
      warn: (payload: any, msg: string) => warnings.push({ payload, msg }),
    } as any;
    const db = makeDb({
      oldChat: { id: 1n, members: [] },
      newChat: { id: 2n },
    });
    await migrateChatHandler({ oldChatId: 1n, newChatId: 2n }, db, log);
    expect(warnings).toHaveLength(0);
  });

  it("reports how many transfers it moved", async () => {
    const tx = {
      ...makeTxMock({ oldChat: { id: 1n, members: [] }, newChat: { id: 2n } }),
      debtTransfer: {
        count: async () => 4,
        deleteMany: async () => ({ count: 0 }),
        updateMany: async () => ({ count: 0 }),
      },
    };
    const db = { $transaction: async (cb: any) => cb(tx) } as any;
    const result = await migrateChatHandler(
      { oldChatId: 1n, newChatId: 2n },
      db
    );
    expect(result.migratedRecords.transfers).toBe(4);
  });

  it("Branch B leaves transfers alone (ON UPDATE CASCADE carries them)", async () => {
    let touched = false;
    const tx = {
      ...makeTxMock({ oldChat: { id: 1n, members: [] }, newChat: null }),
      debtTransfer: {
        count: async () => 2,
        deleteMany: async () => {
          touched = true;
          return { count: 0 };
        },
        updateMany: async () => {
          touched = true;
          return { count: 0 };
        },
      },
    };
    const db = { $transaction: async (cb: any) => cb(tx) } as any;
    await migrateChatHandler({ oldChatId: 1n, newChatId: 2n }, db);
    expect(touched).toBe(false);
  });
});
