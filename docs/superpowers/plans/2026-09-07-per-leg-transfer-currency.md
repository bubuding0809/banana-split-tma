# Per-Leg Transfer Currency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each side of a `DebtTransfer` its own amount and currency so converting one group's currency never re-denominates the other group.

**Architecture:** Four columns replace `amount`/`currency` on `DebtTransfer`: `sourceAmount`/`sourceCurrency` and `targetAmount`/`targetCurrency`. Every balance entry point already receives a `chatId` to decide the sign of a transfer (source = settlement-like, target = expense-like); a single `legFor(transfer, chatId)` helper reuses that same branch to pick the leg. Conversion updates only the leg whose chat is converting.

**Tech Stack:** TypeScript, Prisma (PostgreSQL), tRPC, Vitest, React + `@telegram-apps/telegram-ui`, Turborepo.

**Spec:** `docs/superpowers/specs/2026-09-07-per-leg-transfer-currency-design.md`

## Global Constraints

- Legs are equal at creation. Divergence happens only through `convertCurrencyBulk`.
- A group reads and writes only its own leg. No counterpart amount or currency crosses a group boundary in any response or message.
- Conversion is destructive. No rate, no original amount, no conversion log is stored.
- `amount` and `currency` are dropped from `DebtTransfer` in the same migration. Any straggling reader must fail typecheck rather than silently pick a leg.
- One PR, one migration. Downtime while `migrate` runs ahead of the deploy is accepted.
- Money arithmetic uses `Decimal` from `decimal.js` via the helpers in `packages/trpc/src/utils/financial.ts`. Never use JS floats for amounts.
- Run tests from `packages/trpc` with `npx vitest run`. Typecheck with `npx tsc --noEmit -p tsconfig.json`.
- Commit after every task. Branch: `feat/per-leg-transfer-currency` (already created, spec already committed there).

---

### Task 1: Schema and migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma:170-200`
- Create: `packages/database/prisma/migrations/20260907000000_per_leg_transfer_currency/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `DebtTransfer` model with `sourceAmount: Decimal`, `sourceCurrency: String`, `targetAmount: Decimal`, `targetCurrency: String`; no `amount`, no `currency`. Every later task depends on this shape.

- [ ] **Step 1: Edit the Prisma model**

In `packages/database/prisma/schema.prisma`, replace these two lines inside `model DebtTransfer`:

```prisma
  amount      Decimal @db.Decimal(12, 2)
  currency    String  @default("SGD")
```

with:

```prisma
  sourceAmount   Decimal @db.Decimal(12, 2)
  sourceCurrency String  @default("SGD")
  targetAmount   Decimal @db.Decimal(12, 2)
  targetCurrency String  @default("SGD")
```

Leave `description`, the chat relations, and all four `@@index` lines untouched.

- [ ] **Step 2: Write the migration by hand**

Create `packages/database/prisma/migrations/20260907000000_per_leg_transfer_currency/migration.sql`:

```sql
-- Add both legs, nullable so the backfill can run
ALTER TABLE "DebtTransfer"
  ADD COLUMN "sourceAmount" DECIMAL(12,2),
  ADD COLUMN "sourceCurrency" TEXT,
  ADD COLUMN "targetAmount" DECIMAL(12,2),
  ADD COLUMN "targetCurrency" TEXT;

-- Backfill: both legs start identical to the single-currency row
UPDATE "DebtTransfer" SET
  "sourceAmount" = "amount",
  "targetAmount" = "amount",
  "sourceCurrency" = "currency",
  "targetCurrency" = "currency";

-- Lock them down
ALTER TABLE "DebtTransfer"
  ALTER COLUMN "sourceAmount" SET NOT NULL,
  ALTER COLUMN "sourceCurrency" SET NOT NULL,
  ALTER COLUMN "sourceCurrency" SET DEFAULT 'SGD',
  ALTER COLUMN "targetAmount" SET NOT NULL,
  ALTER COLUMN "targetCurrency" SET NOT NULL,
  ALTER COLUMN "targetCurrency" SET DEFAULT 'SGD';

-- Drop the shared columns
ALTER TABLE "DebtTransfer"
  DROP COLUMN "amount",
  DROP COLUMN "currency";
```

Write the SQL by hand rather than running `prisma migrate dev` — that command targets a dev database and would generate a drop-then-add pair that loses the backfill.

- [ ] **Step 3: Regenerate the Prisma client**

Run: `cd packages/database && npx prisma generate`
Expected: "Generated Prisma Client" with no error.

- [ ] **Step 4: Verify schema and migrations agree**

Run: `cd packages/database && npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code`
Expected: exit code 0, "No difference detected". This is the same check CI runs as "Prisma schema ↔ migrations sync".

If `SHADOW_DATABASE_URL` is not set, note it and let CI run the check instead — do not skip the step silently.

- [ ] **Step 5: Confirm the codebase now fails to compile**

Run: `cd packages/trpc && npx tsc --noEmit -p tsconfig.json 2>&1 | head -40`
Expected: errors about `amount` and `currency` not existing on the `DebtTransfer` delegate. This is the intended tripwire — it lists exactly the files Tasks 2-8 must fix. Save the list.

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations
git commit -m "feat(db): per-leg amount and currency on DebtTransfer"
```

---

### Task 2: `legFor` helper and the balance engine

**Files:**
- Create: `packages/trpc/src/utils/transferLegs.ts`
- Create: `packages/trpc/src/utils/transferLegs.spec.ts`
- Modify: `packages/trpc/src/utils/chatBalances.ts:26-32` (the `TransferRow` interface) and the transfer loop at `:87-113`
- Modify: `packages/trpc/src/utils/chatBalances.spec.ts`

**Interfaces:**
- Consumes: the Prisma model from Task 1.
- Produces:
  - `export interface TransferLeg { amount: Decimal; currency: string }`
  - `export function legFor(transfer: TransferLegSource, chatId: number): TransferLeg | null`
  - `TransferRow` in `chatBalances.ts` carrying `sourceAmount`, `sourceCurrency`, `targetAmount`, `targetCurrency` instead of `amount`.

  Every later task imports `legFor` from `../../utils/transferLegs.js`.

- [ ] **Step 1: Write the failing test**

Create `packages/trpc/src/utils/transferLegs.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { legFor } from "./transferLegs.js";

const transfer = {
  sourceChatId: BigInt(1),
  targetChatId: BigInt(2),
  sourceAmount: new Decimal(50),
  sourceCurrency: "AUD",
  targetAmount: new Decimal(44),
  targetCurrency: "SGD",
};

describe("legFor", () => {
  it("returns the source leg for the source chat", () => {
    expect(legFor(transfer, 1)).toEqual({
      amount: new Decimal(50),
      currency: "AUD",
    });
  });

  it("returns the target leg for the target chat", () => {
    expect(legFor(transfer, 2)).toEqual({
      amount: new Decimal(44),
      currency: "SGD",
    });
  });

  it("returns null for a chat that is neither side", () => {
    expect(legFor(transfer, 3)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/trpc && npx vitest run src/utils/transferLegs.spec.ts`
Expected: FAIL — cannot resolve `./transferLegs.js`.

- [ ] **Step 3: Write the helper**

Create `packages/trpc/src/utils/transferLegs.ts`:

```ts
import { Decimal } from "decimal.js";

export interface TransferLeg {
  amount: Decimal;
  currency: string;
}

/**
 * A transfer row carries two legs. Which one applies depends entirely on
 * which chat is asking: the source chat sees the debt leave, the target
 * chat sees it arrive, and the two can be denominated differently once
 * either group has converted its currency.
 */
export interface TransferLegSource {
  sourceChatId: bigint;
  targetChatId: bigint;
  sourceAmount: Decimal;
  sourceCurrency: string;
  targetAmount: Decimal;
  targetCurrency: string;
}

export function legFor(
  transfer: TransferLegSource,
  chatId: number
): TransferLeg | null {
  if (Number(transfer.sourceChatId) === chatId) {
    return { amount: transfer.sourceAmount, currency: transfer.sourceCurrency };
  }
  if (Number(transfer.targetChatId) === chatId) {
    return { amount: transfer.targetAmount, currency: transfer.targetCurrency };
  }
  return null;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd packages/trpc && npx vitest run src/utils/transferLegs.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: Write the failing engine test**

Append to `packages/trpc/src/utils/chatBalances.spec.ts` (match the file's existing import style; it already imports `buildUserBalanceMap` and `Decimal`):

```ts
describe("buildUserBalanceMap with diverged transfer legs", () => {
  const diverged = {
    sourceChatId: BigInt(1),
    targetChatId: BigInt(2),
    debtorId: BigInt(200),
    creditorId: BigInt(100),
    sourceAmount: new Decimal(50),
    sourceCurrency: "AUD",
    targetAmount: new Decimal(44),
    targetCurrency: "SGD",
  };

  it("uses the source leg amount in the source chat", () => {
    const map = buildUserBalanceMap([100, 200], [], [], [diverged], 1);
    // Source chat: the debt is cleared, so the debtor's balance rises by
    // the SOURCE amount and the creditor's falls by it.
    expect(map.get(200)).toBe(50);
    expect(map.get(100)).toBe(-50);
  });

  it("uses the target leg amount in the target chat", () => {
    const map = buildUserBalanceMap([100, 200], [], [], [diverged], 2);
    // Target chat: the debt is added, using the TARGET amount.
    expect(map.get(200)).toBe(-44);
    expect(map.get(100)).toBe(44);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd packages/trpc && npx vitest run src/utils/chatBalances.spec.ts`
Expected: FAIL — a type error on the missing `amount` property, or `NaN`/`0` balances.

- [ ] **Step 7: Update `TransferRow` and the transfer loop**

In `packages/trpc/src/utils/chatBalances.ts`, replace the `TransferRow` interface:

```ts
export interface TransferRow {
  sourceChatId: bigint;
  targetChatId: bigint;
  debtorId: bigint;
  creditorId: bigint;
  sourceAmount: Decimal;
  sourceCurrency: string;
  targetAmount: Decimal;
  targetCurrency: string;
}
```

Add the import at the top of the file:

```ts
import { legFor } from "./transferLegs.js";
```

Then replace the whole `for (const t of transfers)` loop in `buildUserBalanceMap` with:

```ts
  for (const t of transfers) {
    if (chatId === undefined) continue;
    const leg = legFor(t, chatId);
    if (!leg) continue;

    const debtor = Number(t.debtorId);
    const creditor = Number(t.creditorId);
    const isSource = Number(t.sourceChatId) === chatId;

    if (isSource) {
      // Source: debt is cleared (settlement-like)
      balance.set(
        debtor,
        (balance.get(debtor) ?? new Decimal(0)).plus(leg.amount)
      );
      balance.set(
        creditor,
        (balance.get(creditor) ?? new Decimal(0)).minus(leg.amount)
      );
    } else {
      // Target: debt is added (expense-like)
      balance.set(
        debtor,
        (balance.get(debtor) ?? new Decimal(0)).minus(leg.amount)
      );
      balance.set(
        creditor,
        (balance.get(creditor) ?? new Decimal(0)).plus(leg.amount)
      );
    }
  }
```

`legFor` returning `null` already covers the "neither side" case the old `isSource`/`isTarget` pair handled.

- [ ] **Step 8: Run the whole utils suite**

Run: `cd packages/trpc && npx vitest run src/utils/`
Expected: all pass, including the pre-existing `chatBalances.spec.ts` cases. If an older case fails, it is passing `amount` on a transfer fixture — update the fixture to set both legs to the same value, which is what those cases mean.

- [ ] **Step 9: Commit**

```bash
git add packages/trpc/src/utils/transferLegs.ts packages/trpc/src/utils/transferLegs.spec.ts packages/trpc/src/utils/chatBalances.ts packages/trpc/src/utils/chatBalances.spec.ts
git commit -m "feat(balances): resolve transfer legs by chat in the balance engine"
```

---

### Task 3: Leg-scoped pair queries

**Files:**
- Modify: `packages/trpc/src/routers/expenseShare/getNetShare.ts:78-115`
- Modify: `packages/trpc/src/routers/expenseShare/getNetShare.spec.ts`
- Modify: `packages/trpc/src/routers/debtTransfer/index.ts:96-121` (`computePairwiseOwed`)

**Interfaces:**
- Consumes: `legFor`, the new `TransferRow` from Task 2.
- Produces: no new exports. `getNetShareHandler` keeps its signature `(input: { mainUserId, targetUserId, chatId, currency }, db) => Promise<number>`.

- [ ] **Step 1: Write the failing test**

Add to `packages/trpc/src/routers/expenseShare/getNetShare.spec.ts`, following the mocking style already in that file:

```ts
it("counts a transfer under the leg currency of the chat being asked", async () => {
  // Legs diverged: AUD 50 left chat 1, SGD 44 arrived in chat 2.
  const rows = [
    {
      sourceChatId: BigInt(1),
      targetChatId: BigInt(2),
      debtorId: BigInt(200),
      creditorId: BigInt(100),
      sourceAmount: new Decimal(50),
      sourceCurrency: "AUD",
      targetAmount: new Decimal(44),
      targetCurrency: "SGD",
    },
  ];

  (mockDb.expenseShare.findMany as any).mockResolvedValue([]);
  (mockDb.settlement.findMany as any).mockResolvedValue([]);
  (mockDb.debtTransfer.findMany as any).mockImplementation(async (args: any) => {
    // Emulate the leg-scoped OR predicate.
    const or = args.where.OR as Array<Record<string, unknown>>;
    return rows.filter((r) =>
      or.some(
        (c) =>
          (c.sourceChatId !== undefined &&
            Number(r.sourceChatId) === c.sourceChatId &&
            r.sourceCurrency === c.sourceCurrency) ||
          (c.targetChatId !== undefined &&
            Number(r.targetChatId) === c.targetChatId &&
            r.targetCurrency === c.targetCurrency)
      )
    );
  });

  // Chat 2 asked in SGD sees the target leg: 200 owes 100 SGD 44.
  await expect(
    getNetShareHandler(
      { mainUserId: 100, targetUserId: 200, chatId: 2, currency: "SGD" },
      mockDb
    )
  ).resolves.toBe(44);

  // Chat 2 asked in AUD sees nothing — that currency belongs to the other leg.
  await expect(
    getNetShareHandler(
      { mainUserId: 100, targetUserId: 200, chatId: 2, currency: "AUD" },
      mockDb
    )
  ).resolves.toBe(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/trpc && npx vitest run src/routers/expenseShare/getNetShare.spec.ts`
Expected: FAIL — the handler still sends `where.currency` and reads `t.amount`.

- [ ] **Step 3: Rewrite the query and the accumulation**

In `getNetShare.ts`, replace the `db.debtTransfer.findMany` call with:

```ts
  const transfers = await db.debtTransfer.findMany({
    where: {
      debtorId: { in: [input.mainUserId, input.targetUserId] },
      creditorId: { in: [input.mainUserId, input.targetUserId] },
      OR: [
        { sourceChatId: input.chatId, sourceCurrency: input.currency },
        { targetChatId: input.chatId, targetCurrency: input.currency },
      ],
    },
    select: {
      sourceChatId: true,
      targetChatId: true,
      debtorId: true,
      creditorId: true,
      sourceAmount: true,
      sourceCurrency: true,
      targetAmount: true,
      targetCurrency: true,
    },
  });
```

Then replace the body of the `for (const t of transfers)` loop below it:

```ts
  let transferNet = new Decimal(0);
  for (const t of transfers) {
    const leg = legFor(t, input.chatId);
    if (!leg) continue;

    const debtor = Number(t.debtorId);
    const creditor = Number(t.creditorId);
    const isTarget = Number(t.targetChatId) === input.chatId;

    if (debtor === input.targetUserId && creditor === input.mainUserId) {
      transferNet = isTarget
        ? transferNet.plus(leg.amount)
        : transferNet.minus(leg.amount);
    } else if (debtor === input.mainUserId && creditor === input.targetUserId) {
      transferNet = isTarget
        ? transferNet.minus(leg.amount)
        : transferNet.plus(leg.amount);
    }
  }
```

Add `import { legFor } from "../../utils/transferLegs.js";` at the top.

- [ ] **Step 4: Apply the same predicate in `computePairwiseOwed`**

In `packages/trpc/src/routers/debtTransfer/index.ts`, replace the `db.debtTransfer.findMany` call inside `computePairwiseOwed` with:

```ts
  const transfers = await db.debtTransfer.findMany({
    where: {
      debtorId: { in: pair },
      creditorId: { in: pair },
      OR: [
        { sourceChatId: chatId, sourceCurrency: currency },
        { targetChatId: chatId, targetCurrency: currency },
      ],
    },
    select: {
      sourceChatId: true,
      targetChatId: true,
      debtorId: true,
      creditorId: true,
      sourceAmount: true,
      sourceCurrency: true,
      targetAmount: true,
      targetCurrency: true,
    },
  });
```

The `buildUserBalanceMap` call below it needs no change — Task 2 already taught the engine to pick the leg.

- [ ] **Step 5: Run both suites**

Run: `cd packages/trpc && npx vitest run src/routers/expenseShare/getNetShare.spec.ts src/routers/debtTransfer/`
Expected: all pass. Existing transfer fixtures that set a single `amount` need both legs set to the same value.

- [ ] **Step 6: Commit**

```bash
git add packages/trpc/src/routers/expenseShare/getNetShare.ts packages/trpc/src/routers/expenseShare/getNetShare.spec.ts packages/trpc/src/routers/debtTransfer/index.ts
git commit -m "feat(balances): leg-scoped transfer predicates in pair queries"
```

---

### Task 4: Leg-scoped currency discovery

**Files:**
- Modify: `packages/trpc/src/routers/chat/getDebtorsMultiCurrency.ts:40-72`
- Modify: `packages/trpc/src/routers/chat/getCreditorsMultiCurrency.ts:40-72`
- Modify: `packages/trpc/src/routers/chat/getSimplifiedDebtsMultiCurrency.ts:64-95`
- Modify: `packages/trpc/src/routers/currency/getCurrenciesWithBalance.ts:42-70`
- Modify: `packages/trpc/src/routers/chat/multiCurrencyTransferCurrency.spec.ts`

**Interfaces:**
- Consumes: the Prisma model from Task 1.
- Produces: no new exports. All four handlers keep their current signatures.

- [ ] **Step 1: Write the failing test**

In `packages/trpc/src/routers/chat/multiCurrencyTransferCurrency.spec.ts` (created by PR #338), replace the `setup` helper's transfer mock so it emulates leg-scoped discovery, and add a divergence case:

```ts
it("reports the chat's own leg currency, not the counterpart's", async () => {
  // Chat 1 is the TARGET of a transfer whose source leg is AUD and whose
  // target leg has already been converted to USD.
  setup([
    {
      sourceChatId: 2,
      targetChatId: CHAT_ID,
      debtorId: OTHER,
      creditorId: ME,
      sourceAmount: 50,
      sourceCurrency: "AUD",
      targetAmount: 33,
      targetCurrency: "USD",
    },
  ]);

  const debtors = await getDebtorsMultiCurrencyHandler(
    { userId: ME, chatId: CHAT_ID },
    mockDb
  );

  expect(debtors).toHaveLength(1);
  expect(debtors[0]!.balances).toEqual([{ currency: "USD", amount: 33 }]);
});
```

Update the file's `TransferRow` type and `setup` helper to carry the four leg fields, and make the `debtTransfer.findMany` mock branch on the shape of the `where` argument: a discovery call selects `sourceCurrency`/`targetCurrency` with `distinct`, while a `getNetShare` call passes the leg-scoped `OR`. Return only the matching legs' currencies for the former.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/trpc && npx vitest run src/routers/chat/multiCurrencyTransferCurrency.spec.ts`
Expected: FAIL — discovery still selects the dropped `currency` column.

- [ ] **Step 3: Replace discovery in all four handlers**

In each of the four files, replace the single `db.debtTransfer.findMany({ ... select: { currency: true } ... })` discovery query with two leg-scoped queries. For `getDebtorsMultiCurrency.ts` and `getCreditorsMultiCurrency.ts` the block becomes:

```ts
  const [
    expenseCurrencies,
    settlementCurrencies,
    sourceLegCurrencies,
    targetLegCurrencies,
  ] = await Promise.all([
    db.expense.findMany({
      where: { chatId: input.chatId },
      select: { currency: true },
      distinct: ["currency"],
    }),
    db.settlement.findMany({
      where: { chatId: input.chatId },
      select: { currency: true },
      distinct: ["currency"],
    }),
    db.debtTransfer.findMany({
      where: { sourceChatId: input.chatId },
      select: { sourceCurrency: true },
      distinct: ["sourceCurrency"],
    }),
    db.debtTransfer.findMany({
      where: { targetChatId: input.chatId },
      select: { targetCurrency: true },
      distinct: ["targetCurrency"],
    }),
  ]);

  const allUsedCurrencies = [
    ...new Set([
      ...expenseCurrencies.map((e) => e.currency),
      ...settlementCurrencies.map((s) => s.currency),
      ...sourceLegCurrencies.map((t) => t.sourceCurrency),
      ...targetLegCurrencies.map((t) => t.targetCurrency),
    ]),
  ];
```

Apply the same shape in `getSimplifiedDebtsMultiCurrency.ts` and `getCurrenciesWithBalance.ts`, keeping each file's existing variable names for the expense and settlement halves. In `getCurrenciesWithBalance.ts` also update the `db.debtTransfer.findFirst` call near line 135 — it looks up a `lastCreatedAt` per currency, so its `where` becomes:

```ts
          db.debtTransfer.findFirst({
            where: {
              OR: [
                { sourceChatId: input.chatId, sourceCurrency: currency },
                { targetChatId: input.chatId, targetCurrency: currency },
              ],
            },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          }),
```

- [ ] **Step 4: Run the chat and currency suites**

Run: `cd packages/trpc && npx vitest run src/routers/chat/ src/routers/currency/`
Expected: all pass, including the three cases PR #338 added.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/chat packages/trpc/src/routers/currency
git commit -m "feat(balances): discover currencies per transfer leg"
```

---

### Task 5: Leg-scoped per-currency bucketing

**Files:**
- Modify: `packages/trpc/src/routers/chat/getMemberBalanceSummary.ts:54-84`
- Modify: `packages/trpc/src/routers/chat/getBulkChatDebts.ts:68-101`
- Modify: `packages/trpc/src/routers/expenseShare/getMyBalancesAcrossChats.ts:82-125`
- Modify: `packages/trpc/src/routers/expenseShare/getMyBalancesAcrossChats.spec.ts`

**Interfaces:**
- Consumes: `legFor` from Task 2.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Add to `packages/trpc/src/routers/expenseShare/getMyBalancesAcrossChats.spec.ts`, reusing that file's `setupChats`/`setupShares`/`setupSettlements`/`setupUsers` helpers:

```ts
it("buckets each chat's transfer under its own leg currency", async () => {
  setupChats([
    { id: 1, title: "Trip", debtSimplificationEnabled: false, memberIds: [100, 200] },
    { id: 2, title: "Flat", debtSimplificationEnabled: false, memberIds: [100, 200] },
  ]);
  setupShares([]);
  setupSettlements([]);
  setupUsers([{ id: 200, firstName: "Other" }]);

  (mockDb.debtTransfer.findMany as any).mockResolvedValue([
    {
      sourceChatId: BigInt(1),
      targetChatId: BigInt(2),
      debtorId: BigInt(200),
      creditorId: BigInt(100),
      sourceAmount: d(50),
      sourceCurrency: "AUD",
      targetAmount: d(44),
      targetCurrency: "SGD",
    },
  ]);

  const out = await getMyBalancesAcrossChatsHandler({ userId: 100 }, mockDb);

  const trip = out.balances.find((b) => b.chatId === 1)!;
  const flat = out.balances.find((b) => b.chatId === 2)!;
  expect(trip.currencies).toEqual([{ currency: "AUD", net: -50 }]);
  expect(flat.currencies).toEqual([{ currency: "SGD", net: 44 }]);
});
```

If `getMyBalancesAcrossChatsHandler`'s input or output field names differ from the above, match the file's existing cases rather than this sketch — but keep the assertion that chat 1 reports AUD and chat 2 reports SGD.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/trpc && npx vitest run src/routers/expenseShare/getMyBalancesAcrossChats.spec.ts`
Expected: FAIL — bucketing still reads `t.currency`.

- [ ] **Step 3: Bucket by leg in all three handlers**

In each handler, the transfer `select` gains the four leg fields and drops `amount`/`currency`:

```ts
      select: {
        sourceChatId: true,
        targetChatId: true,
        debtorId: true,
        creditorId: true,
        sourceAmount: true,
        sourceCurrency: true,
        targetAmount: true,
        targetCurrency: true,
      },
```

and the bucketing loop keys on the leg for the chat being computed. In `getMemberBalanceSummary.ts` and `getBulkChatDebts.ts` the chat is fixed, so:

```ts
  const transfersByCurrency = new Map<string, typeof transfers>();
  for (const t of transfers) {
    const leg = legFor(t, input.chatId); // getBulkChatDebts: use its `chatId` variable
    if (!leg) continue;
    if (!transfersByCurrency.has(leg.currency))
      transfersByCurrency.set(leg.currency, []);
    transfersByCurrency.get(leg.currency)!.push(t);
  }
```

In `getMyBalancesAcrossChats.ts` the transfers are already bucketed per chat by `transfersByChat`, so the currency bucketing inside the per-chat loop becomes:

```ts
    const transfersByCurrency = new Map<string, typeof chatTransfers>();
    for (const t of chatTransfers) {
      const leg = legFor(t, chatIdNum);
      if (!leg) continue;
      if (!transfersByCurrency.has(leg.currency))
        transfersByCurrency.set(leg.currency, []);
      transfersByCurrency.get(leg.currency)!.push(t);
    }
```

Add `import { legFor } from "../../utils/transferLegs.js";` to each file.

Note for `getMyBalancesAcrossChats.ts`: a transfer is bucketed under *both* its chats by the existing `transfersByChat` loop, and each chat now resolves a different leg. That is the intended behavior — do not deduplicate.

- [ ] **Step 4: Run the affected suites**

Run: `cd packages/trpc && npx vitest run src/routers/expenseShare/ src/routers/chat/`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/chat/getMemberBalanceSummary.ts packages/trpc/src/routers/chat/getBulkChatDebts.ts packages/trpc/src/routers/expenseShare/getMyBalancesAcrossChats.ts packages/trpc/src/routers/expenseShare/getMyBalancesAcrossChats.spec.ts
git commit -m "feat(balances): bucket transfers by the chat's own leg currency"
```

---

### Task 6: Creation writes both legs

**Files:**
- Modify: `packages/trpc/src/routers/debtTransfer/index.ts:39-52` (output schema), `:228-247` (the `create` call and the handler's return), `:325-360` (notification arguments)
- Modify: `packages/trpc/src/routers/debtTransfer/index.spec.ts`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: `createTransferHandler` returns an object with `sourceAmount: number`, `sourceCurrency: string`, `targetAmount: number`, `targetCurrency: string` (and the existing id/user/chat/date fields). Task 7 and the CLI read this shape.

- [ ] **Step 1: Write the failing test**

Add to `packages/trpc/src/routers/debtTransfer/index.spec.ts`, following its existing mock setup:

The file's `makeDb` helper returns a stub whose `debtTransfer.create` spreads
`data` into the row it resolves, so assert on the handler's return value —
there is no vitest spy to inspect.

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/trpc && npx vitest run src/routers/debtTransfer/index.spec.ts`
Expected: FAIL — `create` is still called with `amount`/`currency`.

- [ ] **Step 3: Write both legs**

Replace the `tx.debtTransfer.create` data block:

```ts
      return tx.debtTransfer.create({
        data: {
          creatorId: input.creatorId,
          debtorId: input.debtorId,
          creditorId: input.creditorId,
          // Both legs start identical; they diverge only when a group
          // converts its own currency.
          sourceAmount: toNumber(amountDecimal),
          sourceCurrency: currency,
          targetAmount: toNumber(amountDecimal),
          targetCurrency: currency,
          description: input.description || null,
          sourceChatId: input.sourceChatId,
          targetChatId: input.targetChatId,
        },
      });
```

Replace the handler's return mapping:

```ts
    return {
      ...transfer,
      debtorId: Number(transfer.debtorId),
      creditorId: Number(transfer.creditorId),
      creatorId: Number(transfer.creatorId),
      sourceChatId: Number(transfer.sourceChatId),
      targetChatId: Number(transfer.targetChatId),
      sourceAmount: Number(transfer.sourceAmount),
      targetAmount: Number(transfer.targetAmount),
    };
```

Replace the two lines in `outputSchema`:

```ts
  amount: z.number(),
  currency: z.string(),
```

with:

```ts
  sourceAmount: z.number(),
  sourceCurrency: z.string(),
  targetAmount: z.number(),
  targetCurrency: z.string(),
```

- [ ] **Step 4: Feed the notifications the right leg**

In the `Promise.allSettled` block, the source-chat notification takes the source leg and the target-chat notification takes the target leg:

```ts
            amount: transfer.sourceAmount,
            currency: transfer.sourceCurrency,
```

for the `direction: "out"` call, and:

```ts
            amount: transfer.targetAmount,
            currency: transfer.targetCurrency,
```

for the `direction: "in"` call. At creation these are equal, so the rendered messages are unchanged — the point is that each group is fed its own leg on principle, not by accident.

- [ ] **Step 5: Run the transfer suites**

Run: `cd packages/trpc && npx vitest run src/routers/debtTransfer/ src/routers/telegram/sendTransferNotificationMessage.spec.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/trpc/src/routers/debtTransfer/index.ts packages/trpc/src/routers/debtTransfer/index.spec.ts
git commit -m "feat(transfers): write both legs on creation"
```

---

### Task 7: `getAllByChat` returns the viewing chat's leg

**Files:**
- Modify: `packages/trpc/src/routers/debtTransfer/getAllByChat.ts:13-63`
- Modify: `packages/trpc/src/routers/debtTransfer/getAllByChat.spec.ts`

**Interfaces:**
- Consumes: `legFor` from Task 2.
- Produces: each row keeps `amount: number` and `currency: string`, now meaning *this chat's leg*. `ChatTransferCell`, `TransferDetailsModal` and the CLI read these names unchanged.

- [ ] **Step 1: Write the failing test**

Add to `packages/trpc/src/routers/debtTransfer/getAllByChat.spec.ts`:

```ts
it("returns the viewing chat's leg amount and currency", async () => {
  (mockDb.debtTransfer.findMany as any).mockResolvedValue([
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/trpc && npx vitest run src/routers/debtTransfer/getAllByChat.spec.ts`
Expected: FAIL — the handler still selects and returns the dropped columns.

- [ ] **Step 3: Select both legs, return one**

In the `select` block, replace `amount: true, currency: true` with the four leg fields. Then, inside the `rows.map`, after the existing `isSource` line:

```ts
    const leg = legFor(t, input.chatId);
```

and replace the returned `amount`/`currency` lines with:

```ts
      amount: Number(leg?.amount ?? 0),
      currency: leg?.currency ?? "SGD",
```

The `where` clause guarantees every row touches this chat, so `leg` is never null in practice; the fallback exists to satisfy the type rather than to paper over a case that can happen.

Add `import { legFor } from "../../utils/transferLegs.js";` at the top.

- [ ] **Step 4: Run and commit**

Run: `cd packages/trpc && npx vitest run src/routers/debtTransfer/`
Expected: all pass.

```bash
git add packages/trpc/src/routers/debtTransfer/getAllByChat.ts packages/trpc/src/routers/debtTransfer/getAllByChat.spec.ts
git commit -m "feat(transfers): return the viewing chat's leg from getAllByChat"
```

---

### Task 8: Conversion converts only the converting chat's leg

**Files:**
- Modify: `packages/trpc/src/routers/expense/convertCurrencyBulk.ts:26-31` (output schema), `:96-166` (queries and transaction), `:168-209` (notification and return)
- Modify: `packages/trpc/src/routers/telegram/sendCurrencyConversionNotificationMessage.ts`
- Create: `packages/trpc/src/routers/expense/convertCurrencyBulk.spec.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `convertCurrencyBulkHandler` returns `{ convertedExpenses, convertedSettlements, convertedTransfers, totalExpensesAmount, totalSettlementsAmount }`. Task 9 renders `convertedTransfers`.

- [ ] **Step 1: Write the failing test**

Create `packages/trpc/src/routers/expense/convertCurrencyBulk.spec.ts`. Mock `getCurrentRateHandler` to return a fixed rate of `0.88`, mock `db.$transaction` to invoke its callback with a `tx` whose `debtTransfer.updateMany` is a spy, and assert:

```ts
it("converts only the converting chat's leg", async () => {
  await convertCurrencyBulkHandler(
    { chatId: 1, fromCurrency: "AUD", toCurrency: "SGD", userId: 100, sendNotification: false },
    mockDb,
    mockTeleBot
  );

  const calls = (mockTx.debtTransfer.updateMany as any).mock.calls.map(
    (c: any[]) => c[0]
  );

  // One update for legs where chat 1 is the source, one where it is the target.
  expect(calls).toHaveLength(2);
  expect(calls[0].where).toEqual({ sourceChatId: 1, sourceCurrency: "AUD" });
  expect(calls[1].where).toEqual({ targetChatId: 1, targetCurrency: "AUD" });

  // Neither predicate can reach the counterpart group's leg.
  for (const call of calls) {
    expect(JSON.stringify(call.where)).not.toContain("2");
  }
});

it("reports how many transfer legs it converted", async () => {
  (mockTx.debtTransfer.updateMany as any)
    .mockResolvedValueOnce({ count: 2 }) // source legs
    .mockResolvedValueOnce({ count: 1 }); // target legs

  const result = await convertCurrencyBulkHandler(
    { chatId: 1, fromCurrency: "AUD", toCurrency: "SGD", userId: 100, sendNotification: false },
    mockDb,
    mockTeleBot
  );
  expect(result.convertedTransfers).toBe(3);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/trpc && npx vitest run src/routers/expense/convertCurrencyBulk.spec.ts`
Expected: FAIL — the handler never touches `debtTransfer`.

- [ ] **Step 3: Convert the legs inside the existing transaction**

Add to `outputSchema`:

```ts
  convertedTransfers: z.number(),
```

Inside `db.$transaction`, after the settlement loop, add:

```ts
        // Only this chat's own legs. The counterpart group's leg is never in
        // either predicate, so converting here cannot re-denominate a debt
        // the other group is holding.
        const convertedSourceLegs = await tx.debtTransfer.updateMany({
          where: { sourceChatId: chatId, sourceCurrency: fromCurrency },
          data: {
            sourceAmount: { multiply: rate.toNumber() },
            sourceCurrency: toCurrency,
          },
        });

        const convertedTargetLegs = await tx.debtTransfer.updateMany({
          where: { targetChatId: chatId, targetCurrency: fromCurrency },
          data: {
            targetAmount: { multiply: rate.toNumber() },
            targetCurrency: toCurrency,
          },
        });

        convertedTransfers =
          convertedSourceLegs.count + convertedTargetLegs.count;
```

Declare `let convertedTransfers = 0;` beside `totalExpensesAmount`, and add `convertedTransfers` to the returned object.

If Prisma's atomic `multiply` on a `Decimal` column proves unavailable in this client version, fall back to reading the matching rows first and updating each with a `Decimal`-multiplied value inside the same transaction — never compute the product with JS floats.

- [ ] **Step 4: Include transfers in the notification gate and payload**

Change the `if` that guards the notification so a transfer-only conversion still announces:

```ts
    if (
      input.sendNotification &&
      input.actorName &&
      (expensesToConvert.length > 0 ||
        settlementsToConvert.length > 0 ||
        convertedTransfers > 0)
    ) {
```

Pass `convertedTransfers` through to `sendCurrencyConversionNotificationMessageHandler`, add it to that handler's input schema as `z.number().default(0)`, and render it in the message body alongside the expense and settlement counts, omitting the line when the count is zero. Match the message's existing formatting; do not restructure it.

- [ ] **Step 5: Run the suites**

Run: `cd packages/trpc && npx vitest run src/routers/expense/ src/routers/telegram/`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/trpc/src/routers/expense/convertCurrencyBulk.ts packages/trpc/src/routers/expense/convertCurrencyBulk.spec.ts packages/trpc/src/routers/telegram/sendCurrencyConversionNotificationMessage.ts
git commit -m "feat(currency): convert the converting chat's transfer legs"
```

---

### Task 9: Convert-currency UI

**Files:**
- Modify: `apps/web/src/components/features/Chat/ConvertCurrenciesCell.tsx:55-122`

**Interfaces:**
- Consumes: `convertedTransfers` from Task 8.
- Produces: nothing other tasks read.

- [ ] **Step 1: Replace `confirm()` with the TMA popup**

The rest of the TMA uses `popup.open` and `Snackbar` (see `MoveDebtSheet.tsx:84-97`); this file is the odd one out. Rewrite `handleConvertCurrency` to `await popup.open.ifAvailable({ ... })` with `Convert` and cancel buttons, and update the copy to name all three row types:

```
Converts every {fromCurrency} expense, settlement and transfer in this group to {toCurrency} at today's rate. Transfers in other groups are not affected. This cannot be undone.
```

The "other groups are not affected" sentence is the point of the whole feature — keep it.

- [ ] **Step 2: Replace `alert()` on error with a Snackbar**

Add a `snackbar` state as `MoveDebtSheet.tsx:46` does, set it in the mutation's `onError`, and render the `Snackbar` alongside the cell.

- [ ] **Step 3: Report what actually happened**

In `onSuccess`, use the returned counts rather than firing a bare success haptic:

```ts
    onSuccess: (result) => {
      // ...existing invalidations, unchanged...
      hapticFeedback.notificationOccurred("success");
      const parts = [
        result.convertedExpenses > 0 && `${result.convertedExpenses} expenses`,
        result.convertedSettlements > 0 &&
          `${result.convertedSettlements} settlements`,
        result.convertedTransfers > 0 &&
          `${result.convertedTransfers} transfers`,
      ].filter(Boolean);
      setSnackbar(parts.length > 0 ? `Converted ${parts.join(", ")}` : "Nothing to convert");
      setConvertFromCurrency(null);
    },
```

Keep every existing `trpcUtils.*.invalidate` call in place — the balance tab depends on them.

- [ ] **Step 4: Typecheck and build the web app**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Chat/ConvertCurrenciesCell.tsx
git commit -m "feat(web): report converted transfers and drop confirm/alert"
```

---

### Task 10: Full verification and PR

**Files:**
- No source changes expected. If this task finds one, fix it here and note it in the PR description.

**Interfaces:**
- Consumes: Tasks 1-9.
- Produces: a pushed branch and an open PR.

- [ ] **Step 1: Confirm nothing still reads the dropped columns**

Run: `grep -rn "\.currency\|\.amount" --include='*.ts' --include='*.tsx' packages/trpc/src apps/web/src apps/cli/src | grep -i transfer | grep -v spec`
Expected: every hit is a leg field or a `getAllByChat` row, which legitimately exposes `amount`/`currency` as the viewing chat's leg. Anything else is a straggler.

- [ ] **Step 2: Full typecheck across the monorepo**

Run: `npx turbo run typecheck` (or `npx tsc --noEmit -p tsconfig.json` per package if no such task exists)
Expected: clean. The CLI is expected to need no source change — `list-transfers` prints `getAllByChat` output, whose field names did not change. If the CLI does need an edit, it triggers the version bump, SKILL.md and CHANGELOG rule in the same commit.

- [ ] **Step 3: Full test suite**

Run: `cd packages/trpc && npx vitest run`
Expected: every test passes. Report the count.

- [ ] **Step 4: Lint and format**

Run: `npx turbo run lint`
Expected: clean.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/per-leg-transfer-currency
```

Open the PR with the `pr-description` skill. The description must state that rollback requires a down migration, because `amount` and `currency` are dropped — a plain revert will not restore them. Link the spec and note that UAT is pending.

- [ ] **Step 6: Tag for review**

Comment on the PR mentioning `@claude` with a merge-readiness verdict. Because this is a money-path schema change, the verdict pauses for user UAT regardless of what review finds.
