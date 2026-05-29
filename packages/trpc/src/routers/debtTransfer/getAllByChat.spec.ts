import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { getAllByChatHandler } from "./getAllByChat.js";

const row = {
  id: "t1",
  date: new Date("2026-04-26T00:00:00Z"),
  createdAt: new Date("2026-04-26T00:00:00Z"),
  updatedAt: new Date("2026-04-26T00:00:00Z"),
  debtorId: 2n,
  creditorId: 1n,
  creatorId: 1n,
  amount: new Decimal(71.79),
  currency: "SGD",
  description: null,
  sourceChat: { title: "Ho Chi Minh 2026" },
  targetChat: { title: "LADS 2026" },
};

function makeDb(rows: unknown[]) {
  return { debtTransfer: { findMany: async () => rows } } as never;
}

describe("getAllByChatHandler", () => {
  it("tags a transfer as 'out' when the viewed chat is the source", async () => {
    const db = makeDb([{ ...row, sourceChatId: 100n, targetChatId: 200n }]);

    const t = (await getAllByChatHandler({ chatId: 100 }, db))[0]!;

    expect(t.direction).toBe("out");
    expect(t.counterpartChatId).toBe(200);
    expect(t.counterpartChatTitle).toBe("LADS 2026");
    expect(t.debtorId).toBe(2);
    expect(t.creditorId).toBe(1);
    expect(t.amount).toBe(71.79);
    expect(t.currency).toBe("SGD");
  });

  it("tags a transfer as 'in' when the viewed chat is the target", async () => {
    const db = makeDb([{ ...row, sourceChatId: 100n, targetChatId: 200n }]);

    const t = (await getAllByChatHandler({ chatId: 200 }, db))[0]!;

    expect(t.direction).toBe("in");
    expect(t.counterpartChatId).toBe(100);
    expect(t.counterpartChatTitle).toBe("Ho Chi Minh 2026");
  });
});
