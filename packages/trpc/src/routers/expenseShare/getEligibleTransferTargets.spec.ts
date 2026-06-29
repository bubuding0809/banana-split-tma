import { describe, it, expect, vi } from "vitest";
import { getEligibleTransferTargetsHandler } from "./getEligibleTransferTargets.js";

function makeDb(rows: Array<{ id: bigint; title: string }>) {
  const findMany = vi.fn(async () => rows);
  return { db: { chat: { findMany } } as never, findMany };
}

describe("getEligibleTransferTargetsHandler", () => {
  it("returns shared groups excluding the source, mapped to number ids", async () => {
    const { db, findMany } = makeDb([
      { id: 200n, title: "LADS 2026" },
      { id: 300n, title: "Ski 2026" },
    ]);

    const result = await getEligibleTransferTargetsHandler(
      { callerId: 1, counterpartyUserId: 2, sourceChatId: 100 },
      db
    );

    expect(result).toEqual([
      { chatId: 200, chatTitle: "LADS 2026" },
      { chatId: 300, chatTitle: "Ski 2026" },
    ]);

    // Membership-only filter: both users present, source excluded.
    const calls = findMany.mock.calls as unknown[][];
    const arg = calls[0]![0] as {
      where: {
        AND: Array<{ members: { some: { id: bigint } } }>;
        id: { not: bigint };
      };
    };
    expect(arg.where.id.not).toBe(100n);
    expect(arg.where.AND).toEqual([
      { members: { some: { id: 1n } } },
      { members: { some: { id: 2n } } },
    ]);
  });

  it("returns an empty array when there are no shared groups", async () => {
    const { db } = makeDb([]);
    const result = await getEligibleTransferTargetsHandler(
      { callerId: 1, counterpartyUserId: 2, sourceChatId: 100 },
      db
    );
    expect(result).toEqual([]);
  });
});
