import { describe, expect, it } from "vitest";
import { createChatHandler } from "./createChat.js";

describe("createChatHandler", () => {
  it("returns the existing chat when one already exists with the same id", async () => {
    const existing = {
      id: 42n,
      title: "existing",
      photo: "p",
      type: "group",
      threadId: null,
      baseCurrency: "SGD",
      debtSimplificationEnabled: false,
      notifyOnExpense: true,
      notifyOnExpenseUpdate: true,
      notifyOnSettlement: true,
      timezone: null,
      migratedFromChatId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = {
      chat: {
        findUnique: async () => existing,
        create: async () => {
          throw new Error("should not be called");
        },
      },
    } as any;
    const result = await createChatHandler(
      { chatId: 42n, chatTitle: "ignored", chatType: "group", chatPhoto: null },
      db
    );
    expect(result.id).toBe(42n);
    expect(result.title).toBe("existing");
  });
});
