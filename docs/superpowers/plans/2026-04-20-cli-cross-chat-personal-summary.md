# CLI Cross-Chat Personal Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two tRPC procedures and two CLI commands so a user-scoped API key can see outstanding balances across all their chats and their monthly expense-share damage per chat in one call each.

**Architecture:** Extract the pairwise-net math from `getBulkChatDebts.ts` into a shared `chatBalances` helper. Use it for both a new `expenseShare.getMyBalancesAcrossChats` (aggregates caller's position per chat, honors per-chat debt simplification) and as infra for consistency. Add a separate `expenseShare.getMySpendByMonth` that sums caller's expense shares in a month window. Wire both into CLI as `list-my-balances` and `list-my-spending --month YYYY-MM`. Update the bundled agent skill + README.

**Tech Stack:** TypeScript, tRPC v11, Zod, Prisma (+ `@dko/database`), `decimal.js`, Vitest, pnpm workspaces (Turbo).

**Spec:** `docs/superpowers/specs/2026-04-20-cli-cross-chat-personal-summary-design.md`

---

## File Map

**Create:**
- `packages/trpc/src/utils/chatBalances.ts` — shared pairwise-net helper extracted from `getBulkChatDebts.ts`. Exports `computeChatPairwiseBalances`, `buildUserBalanceMap`.
- `packages/trpc/src/utils/chatBalances.spec.ts` — unit tests for the helper.
- `packages/trpc/src/utils/monthRange.ts` — tiny helper: `YYYY-MM` → `[start, endExclusive)` Date pair in UTC.
- `packages/trpc/src/utils/monthRange.spec.ts` — edge-case tests (Dec→Jan rollover, leap year Feb, timezone invariance).
- `packages/trpc/src/routers/expenseShare/getMyBalancesAcrossChats.ts` — new procedure.
- `packages/trpc/src/routers/expenseShare/getMyBalancesAcrossChats.spec.ts` — handler tests.
- `packages/trpc/src/routers/expenseShare/getMySpendByMonth.ts` — new procedure.
- `packages/trpc/src/routers/expenseShare/getMySpendByMonth.spec.ts` — handler tests.
- `apps/cli/src/commands/me.ts` — `list-my-balances` + `list-my-spending` CLI commands.
- `apps/cli/src/commands/me.test.ts` — CLI dispatch + validation tests.

**Modify:**
- `packages/trpc/src/routers/chat/getBulkChatDebts.ts` — replace inline `calculateNetShareBulk` and pair loop with calls into `chatBalances` helper (pure refactor, no behavior change).
- `packages/trpc/src/routers/expenseShare/index.ts` — register the two new procedures.
- `apps/cli/src/cli.ts` — import and spread `meCommands` into `ALL_COMMANDS`.
- `apps/cli/skills/banana-cli/SKILL.md` — add table rows, workflow block, common-mistake note.
- `apps/cli/README.md` — add commands to usage block and table.

**Do NOT touch:** existing procedures beyond the pure refactor above; existing CLI commands; anything in `apps/web`, `apps/bot`, `apps/admin`, `apps/mcp`.

---

## Task 1: Extract pairwise-net helper

**Files:**
- Create: `packages/trpc/src/utils/chatBalances.ts`
- Create: `packages/trpc/src/utils/chatBalances.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/trpc/src/utils/chatBalances.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import {
  computeChatPairwiseBalances,
  buildUserBalanceMap,
} from "./chatBalances.js";

const d = (n: number) => new Decimal(n);

describe("buildUserBalanceMap", () => {
  it("aggregates per-user net from shares and settlements", () => {
    // Alice (1) paid $30; Bob (2) and Carol (3) each have $10 share; Alice has $10 share
    const shares = [
      { userId: 1n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
      { userId: 2n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
      { userId: 3n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
    ];
    const settlements: never[] = [];
    const memberIds = [1, 2, 3];

    const map = buildUserBalanceMap(memberIds, shares, settlements);

    // Alice paid 30, owes 10 of own share → net +20
    // Bob owes 10
    // Carol owes 10
    expect(map.get(1)).toBe(20);
    expect(map.get(2)).toBe(-10);
    expect(map.get(3)).toBe(-10);
  });

  it("settlements transfer balance from sender to receiver", () => {
    // Bob (2) pays Alice (1) $5 → Alice's position increases, Bob's decreases
    const shares: never[] = [];
    const settlements = [
      { senderId: 2n, receiverId: 1n, amount: d(5), currency: "SGD" },
    ];
    const memberIds = [1, 2];

    const map = buildUserBalanceMap(memberIds, shares, settlements);

    expect(map.get(1)).toBe(5);
    expect(map.get(2)).toBe(-5);
  });
});

describe("computeChatPairwiseBalances", () => {
  it("returns pairwise debts only for significant amounts", () => {
    // Alice paid 30, split equally among Alice, Bob, Carol
    const shares = [
      { userId: 1n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
      { userId: 2n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
      { userId: 3n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
    ];
    const memberIds = [1, 2, 3];

    const pairs = computeChatPairwiseBalances(memberIds, shares, []);

    // Bob owes Alice 10; Carol owes Alice 10; Bob↔Carol = 0 → excluded
    expect(pairs).toHaveLength(2);
    expect(pairs).toContainEqual({ debtorId: 2, creditorId: 1, amount: 10 });
    expect(pairs).toContainEqual({ debtorId: 3, creditorId: 1, amount: 10 });
  });

  it("drops near-zero pairs under 0.01 threshold", () => {
    const shares = [
      {
        userId: 1n,
        amount: d(0.005),
        expense: { payerId: 2n, currency: "SGD" },
      },
    ];
    const memberIds = [1, 2];

    const pairs = computeChatPairwiseBalances(memberIds, shares, []);

    expect(pairs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dko/trpc test src/utils/chatBalances.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helper**

Create `packages/trpc/src/utils/chatBalances.ts`:

```ts
import { Decimal } from "decimal.js";
import { toNumber, sumAmounts } from "./financial.js";

export interface PairwiseDebt {
  debtorId: number;
  creditorId: number;
  amount: number;
}

interface ShareRow {
  userId: bigint;
  amount: Decimal | null;
  expense: {
    payerId: bigint;
    currency: string;
  };
}

interface SettlementRow {
  senderId: bigint;
  receiverId: bigint;
  amount: Decimal;
  currency: string;
}

/**
 * Aggregates per-user signed net balance for one currency.
 * Positive = user is owed; negative = user owes.
 *
 * Formula per user U:
 *   net(U) = sum(shares paid by U for others) - sum(U's shares on others' expenses)
 *          + sum(settlements U received) - sum(settlements U sent)
 *
 * Equivalent to getBulkChatDebts.calculateNetShareBulk unrolled for every member.
 */
export function buildUserBalanceMap(
  memberIds: number[],
  shares: ShareRow[],
  settlements: SettlementRow[]
): Map<number, number> {
  const balance = new Map<number, Decimal>();
  for (const id of memberIds) balance.set(id, new Decimal(0));

  for (const share of shares) {
    if (share.amount === null) continue;
    const shareUserId = Number(share.userId);
    const payerId = Number(share.expense.payerId);
    if (shareUserId === payerId) continue; // payer's own share is not a debt
    // shareUserId owes the payer `amount`
    balance.set(
      payerId,
      (balance.get(payerId) ?? new Decimal(0)).plus(share.amount)
    );
    balance.set(
      shareUserId,
      (balance.get(shareUserId) ?? new Decimal(0)).minus(share.amount)
    );
  }

  for (const s of settlements) {
    const sender = Number(s.senderId);
    const receiver = Number(s.receiverId);
    // Sender pays receiver: sender's debt drops (balance up), receiver's credit drops (balance down)
    balance.set(
      sender,
      (balance.get(sender) ?? new Decimal(0)).plus(s.amount)
    );
    balance.set(
      receiver,
      (balance.get(receiver) ?? new Decimal(0)).minus(s.amount)
    );
  }

  const out = new Map<number, number>();
  for (const [id, dec] of balance) out.set(id, toNumber(dec));
  return out;
}

/**
 * Pairwise net between every member pair for one currency.
 * Returns `{ debtorId, creditorId, amount }` only where `|net| > 0.01`.
 */
export function computeChatPairwiseBalances(
  memberIds: number[],
  shares: ShareRow[],
  settlements: SettlementRow[]
): PairwiseDebt[] {
  const out: PairwiseDebt[] = [];

  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = memberIds[i]!;
      const b = memberIds[j]!;
      const net = pairwiseNet(a, b, shares, settlements);
      if (Math.abs(net) <= 0.01) continue;
      if (net > 0) {
        out.push({ debtorId: b, creditorId: a, amount: net });
      } else {
        out.push({ debtorId: a, creditorId: b, amount: Math.abs(net) });
      }
    }
  }

  return out;
}

/**
 * Signed net between two users for one currency.
 * Positive = `b` owes `a`; negative = `a` owes `b`.
 *
 * Ported from getBulkChatDebts.calculateNetShareBulk — keep behavior identical.
 */
function pairwiseNet(
  a: number,
  b: number,
  shares: ShareRow[],
  settlements: SettlementRow[]
): number {
  const toReceive = shares
    .filter(
      (s) =>
        Number(s.expense.payerId) === a &&
        Number(s.userId) === b &&
        s.amount !== null
    )
    .map((s) => s.amount!);

  const toPay = shares
    .filter(
      (s) =>
        Number(s.expense.payerId) === b &&
        Number(s.userId) === a &&
        s.amount !== null
    )
    .map((s) => s.amount!);

  const settleAToB = settlements
    .filter((s) => Number(s.senderId) === a && Number(s.receiverId) === b)
    .map((s) => s.amount);

  const settleBToA = settlements
    .filter((s) => Number(s.senderId) === b && Number(s.receiverId) === a)
    .map((s) => s.amount);

  const net = sumAmounts(toReceive)
    .minus(sumAmounts(toPay))
    .plus(sumAmounts(settleAToB))
    .minus(sumAmounts(settleBToA));

  return toNumber(net);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dko/trpc test src/utils/chatBalances.spec.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/utils/chatBalances.ts packages/trpc/src/utils/chatBalances.spec.ts
git commit -m "refactor(trpc): extract pairwise-net helper for chat balances"
```

---

## Task 2: Refactor `getBulkChatDebts` to use the helper (zero behavior change)

**Files:**
- Modify: `packages/trpc/src/routers/chat/getBulkChatDebts.ts`

- [ ] **Step 1: Inspect existing tests for `getBulkChatDebts`**

Run: `pnpm --filter @dko/trpc test -- --related packages/trpc/src/routers/chat/getBulkChatDebts.ts` (will be no-op if none exist; the refactor is still safe because the function is used by `get-debts` CLI which is type-checked).

- [ ] **Step 2: Replace body with helper call**

In `packages/trpc/src/routers/chat/getBulkChatDebts.ts`, replace lines 111–165 (`const debts: BulkDebtResult[] = []` through `return { debts };`) and delete the entire `calculateNetShareBulk` helper at the bottom. Final handler body:

```ts
import { computeChatPairwiseBalances } from "../../utils/chatBalances.js";

// ...existing input/output types unchanged...

export const getBulkChatDebtsHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<{ debts: BulkDebtResult[] }> => {
  const { chatId, currencies } = input;

  const members = await db.user.findMany({
    where: { chats: { some: { id: chatId } } },
    select: { id: true },
  });
  if (members.length === 0) return { debts: [] };
  const memberIds = members.map((m) => Number(m.id));

  const currencyFilter = currencies ? { in: currencies } : undefined;

  const expenseShares = await db.expenseShare.findMany({
    where: {
      expense: {
        chatId,
        ...(currencyFilter && { currency: currencyFilter }),
      },
    },
    select: {
      userId: true,
      amount: true,
      expense: { select: { payerId: true, currency: true } },
    },
  });

  const settlements = await db.settlement.findMany({
    where: { chatId, ...(currencyFilter && { currency: currencyFilter }) },
    select: {
      senderId: true,
      receiverId: true,
      amount: true,
      currency: true,
    },
  });

  const sharesByCurrency = new Map<string, typeof expenseShares>();
  for (const s of expenseShares) {
    const cur = s.expense.currency;
    if (!sharesByCurrency.has(cur)) sharesByCurrency.set(cur, []);
    sharesByCurrency.get(cur)!.push(s);
  }

  const settlementsByCurrency = new Map<string, typeof settlements>();
  for (const s of settlements) {
    if (!settlementsByCurrency.has(s.currency))
      settlementsByCurrency.set(s.currency, []);
    settlementsByCurrency.get(s.currency)!.push(s);
  }

  const debts: BulkDebtResult[] = [];
  const allCurrencies = new Set([
    ...sharesByCurrency.keys(),
    ...settlementsByCurrency.keys(),
  ]);

  for (const currency of allCurrencies) {
    const pairs = computeChatPairwiseBalances(
      memberIds,
      sharesByCurrency.get(currency) ?? [],
      settlementsByCurrency.get(currency) ?? []
    );
    for (const p of pairs) {
      debts.push({ ...p, currency });
    }
  }

  return { debts };
};
```

Remove the entire `calculateNetShareBulk` function (lines 167–240 in the original file). Remove the `Decimal` import from `decimal.js` if no longer used; keep the other imports.

- [ ] **Step 3: Typecheck + run full test suite**

Run: `pnpm --filter @dko/trpc check-types && pnpm --filter @dko/trpc test`
Expected: all typechecks pass, all tests pass. Our new `chatBalances.spec.ts` still green.

- [ ] **Step 4: Manual smoke — build + type-check entire repo**

Run: `pnpm -w run check-types`
Expected: `13 successful, 13 total` (same as baseline).

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/chat/getBulkChatDebts.ts
git commit -m "refactor(trpc): route getBulkChatDebts through chatBalances helper"
```

---

## Task 3: Month-range helper

**Files:**
- Create: `packages/trpc/src/utils/monthRange.ts`
- Create: `packages/trpc/src/utils/monthRange.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/trpc/src/utils/monthRange.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseMonthRange } from "./monthRange.js";

describe("parseMonthRange", () => {
  it("returns UTC start and exclusive end for a mid-year month", () => {
    const { start, endExclusive } = parseMonthRange("2026-04");
    expect(start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("rolls over December to next January", () => {
    const { endExclusive } = parseMonthRange("2026-12");
    expect(endExclusive.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("handles leap-year February", () => {
    const { start, endExclusive } = parseMonthRange("2028-02");
    expect(start.toISOString()).toBe("2028-02-01T00:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2028-03-01T00:00:00.000Z");
  });

  it("throws on malformed input", () => {
    expect(() => parseMonthRange("2026-13")).toThrow();
    expect(() => parseMonthRange("26-04")).toThrow();
    expect(() => parseMonthRange("2026/04")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dko/trpc test src/utils/monthRange.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `packages/trpc/src/utils/monthRange.ts`:

```ts
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface MonthRange {
  start: Date;
  endExclusive: Date;
}

/**
 * Parse a `YYYY-MM` string into a UTC half-open interval `[start, endExclusive)`.
 * Throws if the input is malformed.
 */
export function parseMonthRange(input: string): MonthRange {
  const match = MONTH_RE.exec(input);
  if (!match) {
    throw new Error(`Invalid month: ${input}. Expected YYYY-MM.`);
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1; // JS months are 0-indexed
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const endExclusive = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { start, endExclusive };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dko/trpc test src/utils/monthRange.spec.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/utils/monthRange.ts packages/trpc/src/utils/monthRange.spec.ts
git commit -m "feat(trpc): add monthRange UTC parser"
```

---

## Task 4: `getMyBalancesAcrossChats` handler — fixture + failing test

**Files:**
- Create: `packages/trpc/src/routers/expenseShare/getMyBalancesAcrossChats.spec.ts`

- [ ] **Step 1: Write failing test**

Create the spec file with the following content. Tests are written against an exported `getMyBalancesAcrossChatsHandler(callerId, db)` (we will implement this signature in Task 5).

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { Decimal } from "decimal.js";
import { getMyBalancesAcrossChatsHandler } from "./getMyBalancesAcrossChats.js";

const mockDb = {
  chat: { findMany: vi.fn() },
  expenseShare: { findMany: vi.fn() },
  settlement: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
} as unknown as PrismaClient;

const caller = 100;
const d = (n: number) => new Decimal(n);

function setupChats(
  chats: Array<{
    id: number;
    title: string;
    debtSimplificationEnabled: boolean;
    memberIds: number[];
  }>
) {
  (mockDb.chat.findMany as any).mockResolvedValue(
    chats.map((c) => ({
      id: BigInt(c.id),
      title: c.title,
      debtSimplificationEnabled: c.debtSimplificationEnabled,
      members: c.memberIds.map((id) => ({ id: BigInt(id) })),
    }))
  );
}

function setupShares(
  rows: Array<{
    chatId: number;
    payerId: number;
    userId: number;
    amount: number;
    currency: string;
  }>
) {
  (mockDb.expenseShare.findMany as any).mockResolvedValue(
    rows.map((r) => ({
      userId: BigInt(r.userId),
      amount: d(r.amount),
      expense: {
        chatId: BigInt(r.chatId),
        payerId: BigInt(r.payerId),
        currency: r.currency,
      },
    }))
  );
}

function setupSettlements(
  rows: Array<{
    chatId: number;
    senderId: number;
    receiverId: number;
    amount: number;
    currency: string;
  }> = []
) {
  (mockDb.settlement.findMany as any).mockResolvedValue(
    rows.map((r) => ({
      chatId: BigInt(r.chatId),
      senderId: BigInt(r.senderId),
      receiverId: BigInt(r.receiverId),
      amount: d(r.amount),
      currency: r.currency,
    }))
  );
}

function setupUsers(
  users: Array<{ id: number; firstName: string; lastName?: string | null }>
) {
  (mockDb.user.findMany as any).mockResolvedValue(
    users.map((u) => ({
      id: BigInt(u.id),
      firstName: u.firstName,
      lastName: u.lastName ?? null,
    }))
  );
}

describe("getMyBalancesAcrossChatsHandler", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns empty array when caller is square in every chat", async () => {
    setupChats([
      { id: 1, title: "Alpha", debtSimplificationEnabled: false, memberIds: [100, 200] },
    ]);
    setupShares([]);
    setupSettlements([]);
    setupUsers([]);

    const result = await getMyBalancesAcrossChatsHandler(caller, mockDb);
    expect(result.balances).toEqual([]);
  });

  it("excludes a chat where caller has zero net across all currencies", async () => {
    setupChats([
      { id: 1, title: "Alpha", debtSimplificationEnabled: false, memberIds: [100, 200] },
    ]);
    // Caller paid $20, caller's share is $10, other has $10. But then a settlement of $10 inverse.
    // Actually simpler: two expenses that cancel.
    setupShares([
      // Caller paid 20, split equally; caller's share 10, other's share 10
      { chatId: 1, payerId: 100, userId: 100, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 200, amount: 10, currency: "SGD" },
      // Other paid 20, split equally
      { chatId: 1, payerId: 200, userId: 100, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 200, userId: 200, amount: 10, currency: "SGD" },
    ]);
    setupSettlements([]);
    setupUsers([{ id: 200, firstName: "Bob" }]);

    const result = await getMyBalancesAcrossChatsHandler(caller, mockDb);
    expect(result.balances).toEqual([]);
  });

  it("includes only currencies where caller has non-zero net within a chat", async () => {
    setupChats([
      { id: 1, title: "Alpha", debtSimplificationEnabled: false, memberIds: [100, 200] },
    ]);
    setupShares([
      // SGD: caller paid 30, split equally → caller +10 SGD, other -10 SGD (wait: paid 30, own share 10, other share 20)
      // Let's use: caller paid 20, split equally → caller +10, other -10
      { chatId: 1, payerId: 100, userId: 100, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 200, amount: 10, currency: "SGD" },
      // USD: both paid 10 for themselves only; caller net 0 USD
      { chatId: 1, payerId: 100, userId: 100, amount: 10, currency: "USD" },
      { chatId: 1, payerId: 200, userId: 200, amount: 10, currency: "USD" },
    ]);
    setupSettlements([]);
    setupUsers([{ id: 200, firstName: "Bob" }]);

    const result = await getMyBalancesAcrossChatsHandler(caller, mockDb);
    expect(result.balances).toHaveLength(1);
    expect(result.balances[0]!.currencies).toEqual([
      { currency: "SGD", net: 10 },
    ]);
  });

  it("returns raw pairwise counterparties when simplification is disabled", async () => {
    setupChats([
      {
        id: 1,
        title: "Alpha",
        debtSimplificationEnabled: false,
        memberIds: [100, 200, 300],
      },
    ]);
    // Caller paid 30, split equally → caller +20, 200 -10, 300 -10
    setupShares([
      { chatId: 1, payerId: 100, userId: 100, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 200, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 300, amount: 10, currency: "SGD" },
    ]);
    setupSettlements([]);
    setupUsers([
      { id: 200, firstName: "Bob" },
      { id: 300, firstName: "Carol", lastName: "Lim" },
    ]);

    const result = await getMyBalancesAcrossChatsHandler(caller, mockDb);
    const chat = result.balances[0]!;
    expect(chat.debtSimplificationEnabled).toBe(false);
    expect(chat.counterparties).toEqual(
      expect.arrayContaining([
        { userId: 200, name: "Bob", currency: "SGD", net: 10 },
        { userId: 300, name: "Carol Lim", currency: "SGD", net: 10 },
      ])
    );
    expect(chat.counterparties).toHaveLength(2);
  });

  it("returns simplified counterparties when simplification is enabled", async () => {
    setupChats([
      {
        id: 1,
        title: "Alpha",
        debtSimplificationEnabled: true,
        memberIds: [100, 200, 300],
      },
    ]);
    // Caller paid 30 for Bob & Carol; Bob paid 20 for Carol.
    // Net balances: caller +20, Bob 0, Carol -20.
    // Simplified: Carol owes caller 20; Bob drops out.
    setupShares([
      { chatId: 1, payerId: 100, userId: 200, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 300, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 100, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 200, userId: 300, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 200, userId: 200, amount: 10, currency: "SGD" },
    ]);
    setupSettlements([]);
    setupUsers([
      { id: 200, firstName: "Bob" },
      { id: 300, firstName: "Carol" },
    ]);

    const result = await getMyBalancesAcrossChatsHandler(caller, mockDb);
    const chat = result.balances[0]!;
    expect(chat.debtSimplificationEnabled).toBe(true);
    expect(chat.currencies).toEqual([{ currency: "SGD", net: 20 }]);
    expect(chat.counterparties).toEqual([
      { userId: 300, name: "Carol", currency: "SGD", net: 20 },
    ]);
  });

  it("factors settlements into net and counterparty computation", async () => {
    setupChats([
      { id: 1, title: "Alpha", debtSimplificationEnabled: false, memberIds: [100, 200] },
    ]);
    // Caller paid 20, split equally → caller +10, other -10
    setupShares([
      { chatId: 1, payerId: 100, userId: 100, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 200, amount: 10, currency: "SGD" },
    ]);
    // Other pays caller 6 → caller net 4
    setupSettlements([
      { chatId: 1, senderId: 200, receiverId: 100, amount: 6, currency: "SGD" },
    ]);
    setupUsers([{ id: 200, firstName: "Bob" }]);

    const result = await getMyBalancesAcrossChatsHandler(caller, mockDb);
    expect(result.balances[0]!.currencies).toEqual([
      { currency: "SGD", net: 4 },
    ]);
    expect(result.balances[0]!.counterparties).toEqual([
      { userId: 200, name: "Bob", currency: "SGD", net: 4 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dko/trpc test src/routers/expenseShare/getMyBalancesAcrossChats.spec.ts`
Expected: FAIL (module not found).

---

## Task 5: Implement `getMyBalancesAcrossChats`

**Files:**
- Create: `packages/trpc/src/routers/expenseShare/getMyBalancesAcrossChats.ts`

- [ ] **Step 1: Implement handler + procedure**

Create the file:

```ts
import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { TRPCError } from "@trpc/server";
import {
  buildUserBalanceMap,
  computeChatPairwiseBalances,
} from "../../utils/chatBalances.js";
import { simplifyDebts } from "../../utils/debtSimplification.js";
import { FINANCIAL_THRESHOLDS } from "../../utils/financial.js";

const outputSchema = z.object({
  balances: z.array(
    z.object({
      chatId: z.number(),
      chatTitle: z.string(),
      debtSimplificationEnabled: z.boolean(),
      currencies: z.array(
        z.object({ currency: z.string(), net: z.number() })
      ),
      counterparties: z.array(
        z.object({
          userId: z.number(),
          name: z.string(),
          currency: z.string(),
          net: z.number(),
        })
      ),
    })
  ),
});

type Output = z.infer<typeof outputSchema>;

function displayName(firstName: string, lastName: string | null): string {
  return lastName ? `${firstName} ${lastName}` : firstName;
}

export async function getMyBalancesAcrossChatsHandler(
  callerId: number,
  db: Db
): Promise<Output> {
  const chats = await db.chat.findMany({
    where: { members: { some: { id: BigInt(callerId) } } },
    select: {
      id: true,
      title: true,
      debtSimplificationEnabled: true,
      members: { select: { id: true } },
    },
  });
  if (chats.length === 0) return { balances: [] };

  const chatIds = chats.map((c) => c.id);

  // Batch fetch expense shares + settlements across ALL caller's chats
  const allShares = await db.expenseShare.findMany({
    where: { expense: { chatId: { in: chatIds } } },
    select: {
      userId: true,
      amount: true,
      expense: {
        select: {
          chatId: true,
          payerId: true,
          currency: true,
        },
      },
    },
  });

  const allSettlements = await db.settlement.findMany({
    where: { chatId: { in: chatIds } },
    select: {
      chatId: true,
      senderId: true,
      receiverId: true,
      amount: true,
      currency: true,
    },
  });

  // Index by chatId as number
  const sharesByChat = new Map<number, typeof allShares>();
  for (const s of allShares) {
    const k = Number(s.expense.chatId);
    if (!sharesByChat.has(k)) sharesByChat.set(k, []);
    sharesByChat.get(k)!.push(s);
  }

  const settlementsByChat = new Map<number, typeof allSettlements>();
  for (const s of allSettlements) {
    const k = Number(s.chatId);
    if (!settlementsByChat.has(k)) settlementsByChat.set(k, []);
    settlementsByChat.get(k)!.push(s);
  }

  const balances: Output["balances"] = [];
  const counterpartyIds = new Set<number>();

  for (const chat of chats) {
    const chatIdNum = Number(chat.id);
    const memberIds = chat.members.map((m) => Number(m.id));
    if (!memberIds.includes(callerId)) continue;

    const chatShares = sharesByChat.get(chatIdNum) ?? [];
    const chatSettlements = settlementsByChat.get(chatIdNum) ?? [];

    // Group by currency
    const sharesByCurrency = new Map<string, typeof chatShares>();
    for (const s of chatShares) {
      const cur = s.expense.currency;
      if (!sharesByCurrency.has(cur)) sharesByCurrency.set(cur, []);
      sharesByCurrency.get(cur)!.push(s);
    }
    const settlementsByCurrency = new Map<string, typeof chatSettlements>();
    for (const s of chatSettlements) {
      if (!settlementsByCurrency.has(s.currency))
        settlementsByCurrency.set(s.currency, []);
      settlementsByCurrency.get(s.currency)!.push(s);
    }

    const allCurrencies = new Set([
      ...sharesByCurrency.keys(),
      ...settlementsByCurrency.keys(),
    ]);

    const currencyRows: Output["balances"][number]["currencies"] = [];
    const counterpartyRows: Output["balances"][number]["counterparties"] = [];

    for (const currency of allCurrencies) {
      const shares = sharesByCurrency.get(currency) ?? [];
      const settlements = settlementsByCurrency.get(currency) ?? [];

      const balanceMap = buildUserBalanceMap(memberIds, shares, settlements);
      const callerNet = balanceMap.get(callerId) ?? 0;
      if (Math.abs(callerNet) <= FINANCIAL_THRESHOLDS.DISPLAY) continue;

      currencyRows.push({ currency, net: callerNet });

      if (chat.debtSimplificationEnabled) {
        const simplified = simplifyDebts(balanceMap);
        for (const edge of simplified) {
          if (edge.fromUserId === callerId) {
            counterpartyRows.push({
              userId: edge.toUserId,
              name: "", // filled in after User.findMany
              currency,
              net: -edge.amount,
            });
            counterpartyIds.add(edge.toUserId);
          } else if (edge.toUserId === callerId) {
            counterpartyRows.push({
              userId: edge.fromUserId,
              name: "",
              currency,
              net: edge.amount,
            });
            counterpartyIds.add(edge.fromUserId);
          }
        }
      } else {
        const pairs = computeChatPairwiseBalances(memberIds, shares, settlements);
        for (const p of pairs) {
          if (p.creditorId === callerId) {
            counterpartyRows.push({
              userId: p.debtorId,
              name: "",
              currency,
              net: p.amount, // debtor owes caller → positive
            });
            counterpartyIds.add(p.debtorId);
          } else if (p.debtorId === callerId) {
            counterpartyRows.push({
              userId: p.creditorId,
              name: "",
              currency,
              net: -p.amount, // caller owes creditor → negative
            });
            counterpartyIds.add(p.creditorId);
          }
        }
      }
    }

    if (currencyRows.length === 0) continue;

    balances.push({
      chatId: chatIdNum,
      chatTitle: chat.title,
      debtSimplificationEnabled: chat.debtSimplificationEnabled,
      currencies: currencyRows,
      counterparties: counterpartyRows,
    });
  }

  // Resolve names in one query
  if (counterpartyIds.size > 0) {
    const users = await db.user.findMany({
      where: { id: { in: Array.from(counterpartyIds).map((n) => BigInt(n)) } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map<number, string>();
    for (const u of users) {
      nameById.set(Number(u.id), displayName(u.firstName, u.lastName));
    }
    for (const chat of balances) {
      for (const cp of chat.counterparties) {
        cp.name = nameById.get(cp.userId) ?? "Unknown";
      }
    }
  }

  return { balances };
}

export default protectedProcedure
  .output(outputSchema)
  .query(async ({ ctx }) => {
    assertNotChatScoped(ctx.session);
    if (!ctx.session.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not authenticated",
      });
    }
    return getMyBalancesAcrossChatsHandler(Number(ctx.session.user.id), ctx.db);
  });
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @dko/trpc test src/routers/expenseShare/getMyBalancesAcrossChats.spec.ts`
Expected: PASS — 6 tests green.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dko/trpc check-types`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/src/routers/expenseShare/getMyBalancesAcrossChats.ts \
        packages/trpc/src/routers/expenseShare/getMyBalancesAcrossChats.spec.ts
git commit -m "feat(trpc): add expenseShare.getMyBalancesAcrossChats"
```

---

## Task 6: `getMySpendByMonth` — tests + handler

**Files:**
- Create: `packages/trpc/src/routers/expenseShare/getMySpendByMonth.spec.ts`
- Create: `packages/trpc/src/routers/expenseShare/getMySpendByMonth.ts`

- [ ] **Step 1: Write failing test**

Create `packages/trpc/src/routers/expenseShare/getMySpendByMonth.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { Decimal } from "decimal.js";
import { getMySpendByMonthHandler } from "./getMySpendByMonth.js";

const mockDb = {
  chat: { findMany: vi.fn() },
  expenseShare: { findMany: vi.fn() },
} as unknown as PrismaClient;

const caller = 100;
const d = (n: number) => new Decimal(n);

describe("getMySpendByMonthHandler", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects malformed month", async () => {
    await expect(
      getMySpendByMonthHandler(caller, "2026-13", mockDb)
    ).rejects.toThrow();
  });

  it("returns empty chats and totals when caller has no shares that month", async () => {
    (mockDb.chat.findMany as any).mockResolvedValue([
      { id: 1n, title: "Alpha" },
    ]);
    (mockDb.expenseShare.findMany as any).mockResolvedValue([]);

    const result = await getMySpendByMonthHandler(caller, "2026-04", mockDb);
    expect(result).toEqual({
      month: "2026-04",
      chats: [],
      totals: [],
    });
  });

  it("sums caller's shares per chat and currency", async () => {
    (mockDb.chat.findMany as any).mockResolvedValue([
      { id: 1n, title: "Alpha" },
      { id: 2n, title: "Beta" },
    ]);
    (mockDb.expenseShare.findMany as any).mockResolvedValue([
      { amount: d(10), expense: { chatId: 1n, currency: "SGD" } },
      { amount: d(5), expense: { chatId: 1n, currency: "SGD" } },
      { amount: d(7), expense: { chatId: 1n, currency: "USD" } },
      { amount: d(3), expense: { chatId: 2n, currency: "SGD" } },
    ]);

    const result = await getMySpendByMonthHandler(caller, "2026-04", mockDb);

    expect(result.month).toBe("2026-04");
    expect(result.chats).toEqual([
      {
        chatId: 1,
        chatTitle: "Alpha",
        spend: [
          { currency: "SGD", amount: 15 },
          { currency: "USD", amount: 7 },
        ],
      },
      {
        chatId: 2,
        chatTitle: "Beta",
        spend: [{ currency: "SGD", amount: 3 }],
      },
    ]);
    expect(result.totals).toEqual([
      { currency: "SGD", amount: 18 },
      { currency: "USD", amount: 7 },
    ]);
  });

  it("queries the correct UTC month window", async () => {
    (mockDb.chat.findMany as any).mockResolvedValue([{ id: 1n, title: "A" }]);
    (mockDb.expenseShare.findMany as any).mockResolvedValue([]);

    await getMySpendByMonthHandler(caller, "2026-04", mockDb);

    const call = (mockDb.expenseShare.findMany as any).mock.calls[0][0];
    expect(call.where.expense.date.gte.toISOString()).toBe(
      "2026-04-01T00:00:00.000Z"
    );
    expect(call.where.expense.date.lt.toISOString()).toBe(
      "2026-05-01T00:00:00.000Z"
    );
    expect(call.where.userId).toBe(BigInt(caller));
  });

  it("omits chats with zero shares from output even when they exist", async () => {
    (mockDb.chat.findMany as any).mockResolvedValue([
      { id: 1n, title: "Alpha" },
      { id: 2n, title: "Beta" }, // no shares → should be omitted
    ]);
    (mockDb.expenseShare.findMany as any).mockResolvedValue([
      { amount: d(10), expense: { chatId: 1n, currency: "SGD" } },
    ]);

    const result = await getMySpendByMonthHandler(caller, "2026-04", mockDb);
    expect(result.chats.map((c) => c.chatId)).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dko/trpc test src/routers/expenseShare/getMySpendByMonth.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `packages/trpc/src/routers/expenseShare/getMySpendByMonth.ts`:

```ts
import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { TRPCError } from "@trpc/server";
import { parseMonthRange } from "../../utils/monthRange.js";
import { toNumber, sumAmounts } from "../../utils/financial.js";

const inputSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "month must be YYYY-MM",
  }),
});

const outputSchema = z.object({
  month: z.string(),
  chats: z.array(
    z.object({
      chatId: z.number(),
      chatTitle: z.string(),
      spend: z.array(
        z.object({ currency: z.string(), amount: z.number() })
      ),
    })
  ),
  totals: z.array(
    z.object({ currency: z.string(), amount: z.number() })
  ),
});

type Output = z.infer<typeof outputSchema>;

export async function getMySpendByMonthHandler(
  callerId: number,
  month: string,
  db: Db
): Promise<Output> {
  const { start, endExclusive } = parseMonthRange(month); // throws on malformed

  const chats = await db.chat.findMany({
    where: { members: { some: { id: BigInt(callerId) } } },
    select: { id: true, title: true },
  });
  if (chats.length === 0) return { month, chats: [], totals: [] };

  const chatIds = chats.map((c) => c.id);

  const shares = await db.expenseShare.findMany({
    where: {
      userId: BigInt(callerId),
      expense: {
        chatId: { in: chatIds },
        date: { gte: start, lt: endExclusive },
      },
    },
    select: {
      amount: true,
      expense: { select: { chatId: true, currency: true } },
    },
  });

  // Group by (chatId, currency)
  const byChatCurrency = new Map<number, Map<string, typeof shares>>();
  for (const s of shares) {
    const chatId = Number(s.expense.chatId);
    const cur = s.expense.currency;
    if (!byChatCurrency.has(chatId)) byChatCurrency.set(chatId, new Map());
    const inner = byChatCurrency.get(chatId)!;
    if (!inner.has(cur)) inner.set(cur, []);
    inner.get(cur)!.push(s);
  }

  const titleById = new Map<number, string>();
  for (const c of chats) titleById.set(Number(c.id), c.title);

  const chatRows: Output["chats"] = [];
  const totalsMap = new Map<string, number>();

  // Stable chat order: by title ascending
  const chatIdsWithData = Array.from(byChatCurrency.keys()).sort((a, b) => {
    const ta = titleById.get(a) ?? "";
    const tb = titleById.get(b) ?? "";
    return ta.localeCompare(tb);
  });

  for (const chatId of chatIdsWithData) {
    const spendMap = byChatCurrency.get(chatId)!;
    const spend: Output["chats"][number]["spend"] = [];
    for (const [currency, rows] of spendMap) {
      const amount = toNumber(sumAmounts(rows.map((r) => r.amount)));
      spend.push({ currency, amount });
      totalsMap.set(currency, (totalsMap.get(currency) ?? 0) + amount);
    }
    chatRows.push({
      chatId,
      chatTitle: titleById.get(chatId) ?? "Unknown",
      spend,
    });
  }

  const totals = Array.from(totalsMap.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return { month, chats: chatRows, totals };
}

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    if (!ctx.session.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not authenticated",
      });
    }
    return getMySpendByMonthHandler(Number(ctx.session.user.id), input.month, ctx.db);
  });
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dko/trpc test src/routers/expenseShare/getMySpendByMonth.spec.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/expenseShare/getMySpendByMonth.ts \
        packages/trpc/src/routers/expenseShare/getMySpendByMonth.spec.ts
git commit -m "feat(trpc): add expenseShare.getMySpendByMonth"
```

---

## Task 7: Register new procedures

**Files:**
- Modify: `packages/trpc/src/routers/expenseShare/index.ts`

- [ ] **Step 1: Update index**

Replace the file with:

```ts
import { createTRPCRouter } from "../../trpc.js";
import getMyBalancesAcrossChats from "./getMyBalancesAcrossChats.js";
import getMySpendByMonth from "./getMySpendByMonth.js";
import getNetShare from "./getNetShare.js";
import getTotalBorrowed from "./getTotalBorrowed.js";
import getTotalLent from "./getTotalLent.js";

export const expenseShareRouter = createTRPCRouter({
  getMyBalancesAcrossChats,
  getMySpendByMonth,
  getNetShare,
  getTotalBorrowed,
  getTotalLent,
});
```

- [ ] **Step 2: Typecheck the whole workspace**

Run: `pnpm -w run check-types`
Expected: `13 successful, 13 total`. This verifies the CLI's generated tRPC client types pick up the new procedures.

- [ ] **Step 3: Run the full trpc test suite**

Run: `pnpm --filter @dko/trpc test`
Expected: everything green, including both new spec files.

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/src/routers/expenseShare/index.ts
git commit -m "feat(trpc): register expenseShare cross-chat procedures"
```

---

## Task 8: CLI `me.ts` — failing tests

**Files:**
- Create: `apps/cli/src/commands/me.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { meCommands } from "./me.js";

vi.mock("../output.js", () => ({
  success: vi.fn((data) => data),
  error: vi.fn((code, message, command) => ({ code, message, command })),
  run: vi.fn(async (cmd, fn) => {
    try {
      return await fn();
    } catch (err: any) {
      return { code: "api_error", message: err.message };
    }
  }),
}));

describe("me commands", () => {
  it("list-my-balances calls trpc.expenseShare.getMyBalancesAcrossChats", async () => {
    const cmd = meCommands.find((c) => c.name === "list-my-balances");
    const queryMock = vi.fn().mockResolvedValue({ balances: [] });
    const trpcMock = {
      expenseShare: { getMyBalancesAcrossChats: { query: queryMock } },
    } as any;

    await cmd?.execute({}, trpcMock);

    expect(queryMock).toHaveBeenCalledWith();
  });

  it("list-my-spending requires --month", async () => {
    const cmd = meCommands.find((c) => c.name === "list-my-spending");
    const trpcMock = {} as any;

    const result = await cmd?.execute({}, trpcMock);

    expect(result).toMatchObject({
      code: "missing_option",
      message: "--month is required",
    });
  });

  it("list-my-spending rejects malformed --month", async () => {
    const cmd = meCommands.find((c) => c.name === "list-my-spending");
    const trpcMock = {} as any;

    const result = await cmd?.execute({ month: "2026-13" }, trpcMock);

    expect(result).toMatchObject({
      code: "invalid_option",
      message: "--month must be YYYY-MM (e.g. 2026-04)",
    });
  });

  it("list-my-spending calls trpc.expenseShare.getMySpendByMonth with parsed month", async () => {
    const cmd = meCommands.find((c) => c.name === "list-my-spending");
    const queryMock = vi
      .fn()
      .mockResolvedValue({ month: "2026-04", chats: [], totals: [] });
    const trpcMock = {
      expenseShare: { getMySpendByMonth: { query: queryMock } },
    } as any;

    await cmd?.execute({ month: "2026-04" }, trpcMock);

    expect(queryMock).toHaveBeenCalledWith({ month: "2026-04" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banananasplitz/cli test -- src/commands/me.test.ts`
Expected: FAIL (module not found).

---

## Task 9: Implement CLI `me.ts`

**Files:**
- Create: `apps/cli/src/commands/me.ts`

- [ ] **Step 1: Implement commands**

```ts
import type { Command } from "./types.js";
import { run, error } from "../output.js";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const meCommands: Command[] = [
  {
    name: "list-my-balances",
    description:
      "List outstanding balances for the authenticated user across all chats (user-level API key only)",
    agentGuidance:
      "Use this to answer 'which chats do I owe/am I owed in?' in one call. Each chat row includes counterparties filtered to pairs involving the caller. Does not work with chat-scoped API keys.",
    examples: ["banana list-my-balances"],
    options: {},
    execute: (_opts, trpc) =>
      run("list-my-balances", async () =>
        trpc.expenseShare.getMyBalancesAcrossChats.query()
      ),
  },

  {
    name: "list-my-spending",
    description:
      "Sum the authenticated user's expense shares per chat for one month (user-level API key only)",
    agentGuidance:
      "Use this to answer 'what did I spend this month in each group?'. Amount = caller's share of expenses dated in the given UTC month. Does not count settlements.",
    examples: ["banana list-my-spending --month 2026-04"],
    options: {
      month: {
        type: "string",
        description:
          "Month in YYYY-MM format (UTC boundaries). Example: 2026-04",
        required: true,
      },
    },
    execute: (opts, trpc) => {
      if (!opts.month) {
        return error("missing_option", "--month is required", "list-my-spending");
      }
      const month = String(opts.month);
      if (!MONTH_RE.test(month)) {
        return error(
          "invalid_option",
          "--month must be YYYY-MM (e.g. 2026-04)",
          "list-my-spending"
        );
      }
      return run("list-my-spending", async () =>
        trpc.expenseShare.getMySpendByMonth.query({ month })
      );
    },
  },
];
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @banananasplitz/cli test -- src/commands/me.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 3: Commit**

```bash
git add apps/cli/src/commands/me.ts apps/cli/src/commands/me.test.ts
git commit -m "feat(cli): add list-my-balances and list-my-spending commands"
```

---

## Task 10: Wire `meCommands` into the CLI

**Files:**
- Modify: `apps/cli/src/cli.ts`

- [ ] **Step 1: Register commands**

Edit `apps/cli/src/cli.ts`. Add the import near the other command imports (around line 9):

```ts
import { meCommands } from "./commands/me.js";
```

And add to `ALL_COMMANDS`:

```ts
const ALL_COMMANDS: Command[] = [
  ...chatCommands,
  ...expenseCommands,
  ...settlementCommands,
  ...snapshotCommands,
  ...currencyCommands,
  ...reminderCommands,
  ...meCommands,
];
```

- [ ] **Step 2: Verify full CLI test suite**

Run: `pnpm --filter @banananasplitz/cli test`
Expected: all tests pass.

- [ ] **Step 3: Verify `banana help` lists the new commands**

Run: `pnpm --filter @banananasplitz/cli run build && node apps/cli/dist/cli.js help`
Expected: JSON output whose `commands` array contains entries with `name: "list-my-balances"` and `name: "list-my-spending"`.

- [ ] **Step 4: Commit**

```bash
git add apps/cli/src/cli.ts
git commit -m "feat(cli): register me commands"
```

---

## Task 11: Update agent skill

**Files:**
- Modify: `apps/cli/skills/banana-cli/SKILL.md`

- [ ] **Step 1: Bump version and add table rows**

In `apps/cli/skills/banana-cli/SKILL.md`:

1. Change the `version:` front-matter from `"0.5.0"` to `"0.6.0"`.

2. In the command reference table, insert two rows after the `get-totals` row (directly after line 61):

```markdown
| `list-my-balances`     | —                                                                                                                                                                     | Outstanding balances across all chats — user-level API key only. Returns per-currency net and counterparties. |
| `list-my-spending`     | `--month` (required)                                                                                                                                                  | Monthly expense-share damage per chat — user-level API key only.                                              |
```

3. In "Common Mistakes", add a new item at the end:

```markdown
8. **Calling `list-my-*` commands with a chat-scoped API key** — they require a user-level API key. Set `BANANA_SPLIT_API_KEY` to a user-level key or run `banana login --api-key <user-level-key>`.
```

4. Add a new workflow block right after "Financial Summary" (end of file):

````markdown
### Personal Cross-Chat Summary

Answer "am I square with everyone?" and "what did I spend this month?" in two calls, not N.

```bash
# 1. Which chats do I have outstanding balances in?
banana list-my-balances
# Each entry: { chatId, chatTitle, debtSimplificationEnabled,
#               currencies: [{currency, net}],
#               counterparties: [{userId, name, currency, net}] }
# net > 0 = owed to me; net < 0 = I owe

# 2. What did I spend last month (my share of expenses)?
banana list-my-spending --month 2026-04
# { month, chats: [{chatId, chatTitle, spend: [{currency, amount}]}],
#   totals: [{currency, amount}] }
```

**Notes:**

- Both commands require a **user-level** API key. Chat-scoped keys will return an auth error.
- `list-my-spending` uses UTC month boundaries and sums only the caller's expense-share amounts — settlements are not counted.
- For per-chat details (full debt graph between every member, not just edges involving caller), drill in with `get-debts --chat-id <id>`.
````

- [ ] **Step 2: Commit**

```bash
git add apps/cli/skills/banana-cli/SKILL.md
git commit -m "docs(cli): document list-my-balances and list-my-spending in agent skill"
```

---

## Task 12: Update CLI README

**Files:**
- Modify: `apps/cli/README.md`

- [ ] **Step 1: Add usage examples**

In `apps/cli/README.md`, inside the "Usage" code block (after the existing `get-exchange-rate` example), add:

```bash
# Personal cross-chat summary (user-level API key only)
banana list-my-balances
banana list-my-spending --month 2026-04
```

- [ ] **Step 2: Add table rows**

In the "Commands" table, insert two rows before the `get-exchange-rate` row:

```markdown
| `list-my-balances`     | Outstanding balances across all chats (user key)    |
| `list-my-spending`     | Monthly expense-share damage per chat (user key)    |
```

- [ ] **Step 3: Commit**

```bash
git add apps/cli/README.md
git commit -m "docs(cli): README updates for list-my-* commands"
```

---

## Task 13: Final verification + PR

- [ ] **Step 1: Full workspace typecheck and lint**

Run: `pnpm -w run check-types && pnpm -w run lint`
Expected: all green (existing lint warnings unchanged; no new errors).

- [ ] **Step 2: Full workspace tests**

Run: `pnpm -w run test`
Expected: all green.

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin <current-branch>
gh pr create --title "feat(cli): cross-chat personal balances + monthly spending" --body "$(cat <<'EOF'
## Summary
- Adds `banana list-my-balances` and `banana list-my-spending --month YYYY-MM`, backed by two new tRPC procedures on `expenseShare`.
- Honors each chat's `debtSimplificationEnabled` flag for counterparty edges; aggregate net per currency is invariant.
- Refactors `getBulkChatDebts` to route through a shared `chatBalances` helper (no behavior change).
- Updates agent skill (version → 0.6.0) and README.

See: `docs/superpowers/specs/2026-04-20-cli-cross-chat-personal-summary-design.md`
Plan: `docs/superpowers/plans/2026-04-20-cli-cross-chat-personal-summary.md`

## Test plan
- [ ] Server unit tests (chatBalances, monthRange, getMyBalancesAcrossChats, getMySpendByMonth)
- [ ] CLI unit tests (me.test.ts)
- [ ] `banana help` JSON lists the two new commands
- [ ] Manual UAT: run both commands against a user-level API key with known balances (one simplified chat, one raw)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --squash --delete-branch
```

---

## Self-Review Checklist

✅ **Spec coverage:**
- Outstanding balance filter (`|net| > 0.01`) → Task 5 (currency row skip) + chatBalances threshold (Task 1).
- Monthly damage (sum of caller's shares, UTC month) → Task 6.
- Counterparty breakdown honors `debtSimplificationEnabled` → Task 5 branch on flag.
- Chat-scoped key rejection → `assertNotChatScoped` in Tasks 5 & 6.
- Skill + README updates → Tasks 11 & 12.
- Tests per spec testing section → Tasks 4/6/8.
- `Expense` hard delete (no `deletedAt`) → reflected in spec commit 3330dff and in Task 6 query shape.

✅ **No placeholders:** every step shows exact commands, exact code, and expected output.

✅ **Type consistency:**
- `getMyBalancesAcrossChatsHandler(callerId, db)` signature identical in test (Task 4) and impl (Task 5).
- `getMySpendByMonthHandler(callerId, month, db)` identical in test (Task 6 Step 1) and impl (Task 6 Step 3).
- `Output["balances"]` and `Output["chats"]` types referenced consistently.
- `MONTH_RE` regex identical in CLI (`me.ts`) and procedure (`getMySpendByMonth.ts`) and matches spec.
- `meCommands` export name consistent across Tasks 8, 9, 10.
