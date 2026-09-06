import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { TRPCError } from "@trpc/server";
import { createTransferHandler, type CreateTransferInput } from "./index.js";

// Cast: handlers only use the subset of Db we stub here.
type Stub = Record<string, unknown>;

interface DbOpts {
  /** chatId(string) -> member rows. Omit a chat to simulate "not found". */
  membersByChat: Record<string, { id: bigint }[]>;
  shares?: {
    userId: bigint;
    amount: Decimal;
    expense: { payerId: bigint; currency: string };
  }[];
  settlements?: {
    senderId: bigint;
    receiverId: bigint;
    amount: Decimal;
    currency: string;
  }[];
  transfers?: unknown[];
}

function makeDb(opts: DbOpts) {
  const { membersByChat, shares = [], settlements = [], transfers = [] } = opts;
  const create = async ({ data }: { data: Stub }) => ({
    id: "transfer-1",
    date: new Date("2026-05-29T00:00:00Z"),
    createdAt: new Date("2026-05-29T00:00:00Z"),
    updatedAt: new Date("2026-05-29T00:00:00Z"),
    ...data,
  });
  return {
    chat: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: bigint };
        select: { members: { where: { id: { in: bigint[] } } } };
      }) => {
        const members = membersByChat[where.id.toString()];
        if (!members) return null;
        const wanted = select.members.where.id.in.map(String);
        return {
          members: members.filter((m) => wanted.includes(m.id.toString())),
        };
      },
    },
    expenseShare: { findMany: async () => shares },
    settlement: { findMany: async () => settlements },
    debtTransfer: { findMany: async () => transfers, create },
    // The tx client mirrors the reader surface plus $executeRaw so the
    // solvency check + advisory lock + write run against the same client.
    $transaction: async (fn: (tx: Stub) => unknown) =>
      fn({
        $executeRaw: async () => 1,
        expenseShare: { findMany: async () => shares },
        settlement: { findMany: async () => settlements },
        debtTransfer: { findMany: async () => transfers, create },
      }),
  } as never;
}

const silentLog = {
  error: () => {},
  info: () => {},
  warn: () => {},
  debug: () => {},
} as never;

// Creator=1, debtor=2, creditor=3. source chat=100, target chat=200.
const baseInput = (
  overrides: Partial<CreateTransferInput> = {}
): CreateTransferInput => ({
  creatorId: 1n,
  debtorId: 2n,
  creditorId: 3n,
  amount: 50,
  currency: "SGD",
  sourceChatId: 100n,
  targetChatId: 200n,
  description: undefined,
  ...overrides,
});

const allMembers = {
  "100": [{ id: 1n }, { id: 2n }, { id: 3n }],
  "200": [{ id: 1n }, { id: 2n }, { id: 3n }],
};

// Debtor (2) owes creditor (3) $100 in source chat: creditor paid, debtor took a share.
const owesHundred = [
  {
    userId: 2n,
    amount: new Decimal(100),
    expense: { payerId: 3n, currency: "SGD" },
  },
];

describe("createTransferHandler", () => {
  it("creates a transfer when the debtor owes enough in the source chat", async () => {
    const db = makeDb({ membersByChat: allMembers, shares: owesHundred });

    const result = await createTransferHandler(baseInput(), db, silentLog);

    expect(result.id).toBe("transfer-1");
    expect(result.debtorId).toBe(2);
    expect(result.creditorId).toBe(3);
    expect(result.creatorId).toBe(1);
    expect(result.sourceChatId).toBe(100);
    expect(result.targetChatId).toBe(200);
    expect(result.sourceAmount).toBe(50);
    expect(result.sourceCurrency).toBe("SGD");
    expect(result.targetAmount).toBe(50);
    expect(result.targetCurrency).toBe("SGD");
  });

  it("rejects when the debtor does not owe enough in the source chat", async () => {
    const db = makeDb({
      membersByChat: allMembers,
      shares: [
        {
          userId: 2n,
          amount: new Decimal(10),
          expense: { payerId: 3n, currency: "SGD" },
        },
      ],
    });

    await expect(
      createTransferHandler(baseInput({ amount: 50 }), db, silentLog)
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
  });

  it("rejects when a participant is not a member of the target chat", async () => {
    const db = makeDb({
      membersByChat: {
        "100": [{ id: 1n }, { id: 2n }, { id: 3n }],
        "200": [{ id: 1n }, { id: 3n }], // debtor (2) missing
      },
      shares: owesHundred,
    });

    await expect(
      createTransferHandler(baseInput(), db, silentLog)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects when source and target chats are identical", async () => {
    const db = makeDb({ membersByChat: allMembers, shares: owesHundred });

    await expect(
      createTransferHandler(baseInput({ targetChatId: 100n }), db, silentLog)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects when debtor and creditor are the same user", async () => {
    const db = makeDb({ membersByChat: allMembers, shares: owesHundred });

    await expect(
      createTransferHandler(baseInput({ creditorId: 2n }), db, silentLog)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an amount below the minimum threshold", async () => {
    const db = makeDb({ membersByChat: allMembers, shares: owesHundred });

    await expect(
      createTransferHandler(baseInput({ amount: 0 }), db, silentLog)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("acquires the advisory lock before reading balances or writing (atomic solvency check)", async () => {
    // Records the order of operations on the tx client to prove the lock is
    // taken first and the solvency read + write happen inside the same tx.
    const calls: string[] = [];
    const create = async ({ data }: { data: Record<string, unknown> }) => {
      calls.push("create");
      return {
        id: "transfer-1",
        date: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
    };
    const tx = {
      $executeRaw: async () => {
        calls.push("lock");
        return 1;
      },
      expenseShare: {
        findMany: async () => {
          calls.push("read");
          return owesHundred;
        },
      },
      settlement: { findMany: async () => [] },
      debtTransfer: { findMany: async () => [], create },
    };
    const db = {
      chat: {
        findUnique: async ({
          select,
        }: {
          select: { members: { where: { id: { in: bigint[] } } } };
        }) => {
          const wanted = select.members.where.id.in.map(String);
          return {
            members: [{ id: 1n }, { id: 2n }, { id: 3n }].filter((m) =>
              wanted.includes(m.id.toString())
            ),
          };
        },
      },
      // If the handler read balances on the OUTER client, this would throw,
      // proving the read moved inside the transaction.
      expenseShare: {
        findMany: async () => {
          throw new Error("balances must be read inside the transaction");
        },
      },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    } as never;

    await createTransferHandler(baseInput({ amount: 50 }), db, silentLog);

    expect(calls).toEqual(["lock", "read", "create"]);
  });

  it("writes both legs with the requested amount and currency", async () => {
    const members = [{ id: BigInt(100) }, { id: BigInt(200) }];
    const db = makeDb({
      membersByChat: { "1": members, "2": members },
      // Debtor 200 owes creditor 100 AUD 50 in chat 1, so the solvency
      // check passes for a 50 AUD transfer.
      shares: [
        {
          userId: BigInt(200),
          amount: new Decimal(50),
          expense: { payerId: BigInt(100), currency: "AUD" },
        },
      ],
    });

    const out = await createTransferHandler(
      {
        creatorId: BigInt(100),
        debtorId: BigInt(200),
        creditorId: BigInt(100),
        amount: 50,
        currency: "AUD",
        sourceChatId: BigInt(1),
        targetChatId: BigInt(2),
      } as CreateTransferInput,
      db as never
    );

    expect(out.sourceAmount).toBe(50);
    expect(out.targetAmount).toBe(50);
    expect(out.sourceCurrency).toBe("AUD");
    expect(out.targetCurrency).toBe("AUD");
    expect(out).not.toHaveProperty("amount");
    expect(out).not.toHaveProperty("currency");
  });

  it("scopes computePairwiseOwed's prior-transfer lookup to the leg matching this chat+currency, not any chat/currency pairing", async () => {
    const members = [{ id: 1n }, { id: 2n }, { id: 3n }];
    const membersByChat = { "100": members, "200": members };

    // Debtor (2) originally owed creditor (3) $100 SGD in chat 100.
    const shares = [
      {
        userId: 2n,
        amount: new Decimal(100),
        expense: { payerId: 3n, currency: "SGD" },
      },
    ];

    // A prior transfer already moved $30 SGD of that debt OUT of chat 100
    // (its source leg). Its target leg — arriving in chat 300 — has
    // diverged to AUD because chat 300 separately converted its own
    // currency. Only $70 SGD should be left owed in chat 100.
    //
    // If the leg predicate ever paired {sourceChatId} with the WRONG leg's
    // currency (e.g. targetCurrency instead of sourceCurrency, or vice
    // versa), this stub — which only matches a clause when its chat field
    // and currency field belong to the *same* leg — would stop returning
    // this prior transfer, and the debtor would appear to still owe the
    // full $100 instead of $70.
    const priorTransfers = [
      {
        sourceChatId: 100n,
        targetChatId: 300n,
        debtorId: 2n,
        creditorId: 3n,
        sourceAmount: new Decimal(30),
        sourceCurrency: "SGD",
        targetAmount: new Decimal(26.4),
        targetCurrency: "AUD",
      },
    ];

    const findManyTransfers = async (args: {
      where: { OR: Array<Record<string, unknown>> };
    }) => {
      const or = args.where.OR;
      return priorTransfers.filter((r) =>
        or.some(
          (c) =>
            (c.sourceChatId !== undefined &&
              Number(r.sourceChatId) === Number(c.sourceChatId) &&
              c.sourceCurrency !== undefined &&
              r.sourceCurrency === c.sourceCurrency) ||
            (c.targetChatId !== undefined &&
              Number(r.targetChatId) === Number(c.targetChatId) &&
              c.targetCurrency !== undefined &&
              r.targetCurrency === c.targetCurrency)
        )
      );
    };

    const create = async ({ data }: { data: Stub }) => ({
      id: "transfer-leg-scoped",
      date: new Date("2026-09-07T00:00:00Z"),
      createdAt: new Date("2026-09-07T00:00:00Z"),
      updatedAt: new Date("2026-09-07T00:00:00Z"),
      ...data,
    });

    const db = {
      chat: {
        findUnique: async ({
          where,
          select,
        }: {
          where: { id: bigint };
          select: { members: { where: { id: { in: bigint[] } } } };
        }) => {
          const rows = membersByChat[where.id.toString() as "100" | "200"];
          if (!rows) return null;
          const wanted = select.members.where.id.in.map(String);
          return {
            members: rows.filter((m) => wanted.includes(m.id.toString())),
          };
        },
      },
      $transaction: async (fn: (tx: Stub) => unknown) =>
        fn({
          $executeRaw: async () => 1,
          expenseShare: { findMany: async () => shares },
          settlement: { findMany: async () => [] },
          debtTransfer: { findMany: findManyTransfers, create },
        }),
    } as never;

    // Only $70 SGD is actually left owed in chat 100 (100 - 30 already
    // moved out) — a transfer of $69 should succeed...
    const ok = await createTransferHandler(
      baseInput({ amount: 69, currency: "SGD" }),
      db,
      silentLog
    );
    expect(ok.id).toBe("transfer-leg-scoped");

    // ...but $71 exceeds what's left and must be rejected.
    await expect(
      createTransferHandler(
        baseInput({ amount: 71, currency: "SGD" }),
        db,
        silentLog
      )
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
  });
});
