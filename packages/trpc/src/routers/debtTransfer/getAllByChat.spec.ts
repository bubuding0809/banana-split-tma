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
  sourceAmount: new Decimal(71.79),
  sourceCurrency: "SGD",
  targetAmount: new Decimal(71.79),
  targetCurrency: "SGD",
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
    expect(t.sourceChatTitle).toBe("Ho Chi Minh 2026");
    expect(t.targetChatTitle).toBe("LADS 2026");
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

  it("returns the viewing chat's leg amount and currency", async () => {
    const mockDb = makeDb([
      {
        id: "t1",
        date: new Date("2026-09-07"),
        createdAt: new Date("2026-09-07"),
        updatedAt: new Date("2026-09-07"),
        debtorId: BigInt(200),
        creditorId: BigInt(100),
        creatorId: BigInt(100),
        sourceChatId: BigInt(1),
        targetChatId: BigInt(2),
        sourceAmount: new Decimal(50),
        sourceCurrency: "AUD",
        targetAmount: new Decimal(44),
        targetCurrency: "SGD",
        description: null,
        sourceChat: { title: "Trip" },
        targetChat: { title: "Flat" },
      },
    ]);

    const asTarget = await getAllByChatHandler({ chatId: 2 }, mockDb);
    expect(asTarget[0]!.amount).toBe(44);
    expect(asTarget[0]!.currency).toBe("SGD");
    expect(asTarget[0]!.direction).toBe("in");

    const asSource = await getAllByChatHandler({ chatId: 1 }, mockDb);
    expect(asSource[0]!.amount).toBe(50);
    expect(asSource[0]!.currency).toBe("AUD");
    expect(asSource[0]!.direction).toBe("out");
  });
});
