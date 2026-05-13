# Cross-Group Balances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the personal-chat "Groups" tab stub with a person-first cross-group balance view that shows one signed total per counterparty in the user's base currency, with one-tap full settle (native amounts), nudge, and bot DM notifications.

**Architecture:** New tRPC procedures wrap the existing `getMyBalancesAcrossChats` handler and re-group its output by counterparty, converting each (chat, currency) bucket using the existing `currencyApi` (fxratesapi.com). Settle writes one normal `Settlement` row per non-zero bucket in native currency inside a single transaction. Nudge uses an in-process rate-limit util (`takeToken`) keyed `nudge:<a>:<b>` with 24h TTL. Bot DMs go through the existing `createBroadcast` service. One schema change: `User.baseCurrency String @default("SGD")`.

**Tech Stack:** TypeScript, tRPC, Prisma (PostgreSQL), Vitest, `@telegram-apps/telegram-ui`, `@telegram-apps/sdk-react`, `decimal.js`, `fxratesapi.com`.

**Spec:** [docs/superpowers/specs/2026-05-13-cross-group-balances-design.md](../specs/2026-05-13-cross-group-balances-design.md)

---

## File map

**Created:**
- `packages/trpc/src/utils/currencyConversion.ts` — pure helper to convert (currency → baseCurrency) using a rates record.
- `packages/trpc/src/utils/currencyConversion.spec.ts`
- `packages/trpc/src/utils/hasUserStartedBot.ts` — derives bot-DM eligibility from `Chat` table.
- `packages/trpc/src/utils/hasUserStartedBot.spec.ts`
- `packages/trpc/src/routers/expenseShare/getMyCounterpartyBalances.ts`
- `packages/trpc/src/routers/expenseShare/getMyCounterpartyBalances.spec.ts`
- `packages/trpc/src/routers/expenseShare/settleAllWithUser.ts`
- `packages/trpc/src/routers/expenseShare/settleAllWithUser.spec.ts`
- `packages/trpc/src/routers/expenseShare/nudgeCounterparty.ts`
- `packages/trpc/src/routers/expenseShare/nudgeCounterparty.spec.ts`
- `packages/trpc/src/services/crossGroupDmTemplates.ts` — pure functions returning the markdown caption for settle / nudge DMs.
- `apps/web/src/components/features/Settings/BaseCurrencyField.tsx`
- `apps/web/src/components/features/Chat/BaseCurrencyPicker.tsx`
- `apps/web/src/components/features/Chat/CounterpartyBalanceSheet.tsx`

**Modified:**
- `packages/database/prisma/schema.prisma` — add `User.baseCurrency`.
- `packages/database/prisma/migrations/<timestamp>_user_base_currency/migration.sql` — generated.
- `packages/trpc/src/routers/user/updateUser.ts` — accept optional `baseCurrency`.
- `packages/trpc/src/routers/expenseShare/index.ts` — register three new procedures.
- `apps/web/src/components/features/Chat/UserBalancesTab.tsx` — replace placeholder with list view.
- `apps/web/src/components/features/Settings/SettingsPage.tsx` (or equivalent settings parent) — render `BaseCurrencyField`.
- `apps/cli/src/commands/me.ts` — add `list-counterparty-balances` and `settle-all-with`.
- `apps/cli/package.json` — bump version (CLI change discipline).
- `apps/cli/CHANGELOG.md` — entry.
- `apps/cli/SKILL.md` — document new commands.

---

## Task 1: Schema — add `User.baseCurrency`

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<auto>_user_base_currency/migration.sql`

- [ ] **Step 1: Edit schema**

`packages/database/prisma/schema.prisma` — add inside `model User { … }`:

```prisma
  baseCurrency          String            @default("SGD")
```

(Place alphabetically after `chats` or wherever fits the existing field order.)

- [ ] **Step 2: Generate migration**

Run: `pnpm -F @dko/database prisma migrate dev --name user_base_currency`

Expected: migration created, applied to local DB; `pnpm prisma generate` runs.

- [ ] **Step 3: Smoke check**

Run:
```bash
pnpm -F @dko/database prisma studio &
# Manually verify: User table now has baseCurrency column with default 'SGD'
```

Or via `psql`:
```sql
\d "User"
SELECT id, "baseCurrency" FROM "User" LIMIT 3;
```

Expected: `baseCurrency` column present, all existing rows show `'SGD'`.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add User.baseCurrency (default SGD)"
```

---

## Task 2: Extend `updateUser` mutation to accept `baseCurrency`

**Files:**
- Modify: `packages/trpc/src/routers/user/updateUser.ts`
- Modify (or create alongside): `packages/trpc/src/routers/user/updateUser.spec.ts`

- [ ] **Step 1: Write failing test**

`packages/trpc/src/routers/user/updateUser.spec.ts` (extend existing or create):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { updateUserHandler } from "./updateUser.js";

const mockDb = {
  user: { update: vi.fn() },
} as unknown as PrismaClient;

describe("updateUserHandler — baseCurrency", () => {
  beforeEach(() => vi.resetAllMocks());

  it("persists baseCurrency when provided", async () => {
    (mockDb.user.update as any).mockResolvedValue({
      id: BigInt(100),
      firstName: "Bubu",
      lastName: null,
      baseCurrency: "USD",
    });

    await updateUserHandler({ userId: BigInt(100), baseCurrency: "USD" }, mockDb);

    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: BigInt(100) },
      data: { baseCurrency: "USD" },
      select: expect.any(Object),
    });
  });

  it("rejects unknown currency code", async () => {
    await expect(
      updateUserHandler({ userId: BigInt(100), baseCurrency: "ZZZ" }, mockDb),
    ).rejects.toThrow(/baseCurrency/i);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `pnpm -F @dko/trpc test updateUser`

Expected: FAIL — `baseCurrency` not recognised by handler.

- [ ] **Step 3: Implement**

`packages/trpc/src/routers/user/updateUser.ts` — add to input schema and update handler:

```ts
import { CURRENCY_DATABASE } from "../../utils/currencyApi.js";

const inputSchema = z.object({
  userId: z.number().transform((val) => BigInt(val)),
  firstName: z.string().optional(),
  lastName: z.string().nullable().optional(),
  baseCurrency: z
    .string()
    .toUpperCase()
    .refine(
      (c) => c in CURRENCY_DATABASE,
      { message: "Unknown baseCurrency" },
    )
    .optional(),
});

// Inside updateUserHandler, add:
if (input.baseCurrency !== undefined) updateData.baseCurrency = input.baseCurrency;

// Inside the `select`, add:
baseCurrency: true,
```

- [ ] **Step 4: Run tests — pass**

Run: `pnpm -F @dko/trpc test updateUser`

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/user/updateUser.ts packages/trpc/src/routers/user/updateUser.spec.ts
git commit -m "feat(trpc): accept baseCurrency in updateUser mutation"
```

---

## Task 3: Currency conversion helper util

**Files:**
- Create: `packages/trpc/src/utils/currencyConversion.ts`
- Create: `packages/trpc/src/utils/currencyConversion.spec.ts`

- [ ] **Step 1: Write failing test**

`packages/trpc/src/utils/currencyConversion.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { convertNativeToBase } from "./currencyConversion.js";

const ratesUsdBase = { USD: 1, SGD: 1.355, AUD: 1.5, CNY: 7.2 };

describe("convertNativeToBase", () => {
  it("identity when currencies match", () => {
    expect(convertNativeToBase(100, "SGD", "SGD", ratesUsdBase)).toBeCloseTo(100, 6);
  });

  it("USD → SGD direct", () => {
    expect(convertNativeToBase(40, "USD", "SGD", ratesUsdBase)).toBeCloseTo(54.2, 6);
  });

  it("AUD → SGD via USD pivot", () => {
    // 30 AUD ÷ 1.5 = 20 USD; 20 USD × 1.355 = 27.10 SGD
    expect(convertNativeToBase(30, "AUD", "SGD", ratesUsdBase)).toBeCloseTo(27.1, 6);
  });

  it("returns null when rate missing", () => {
    expect(convertNativeToBase(50, "XYZ", "SGD", ratesUsdBase)).toBeNull();
  });

  it("preserves sign", () => {
    expect(convertNativeToBase(-40, "USD", "SGD", ratesUsdBase)).toBeCloseTo(-54.2, 6);
  });
});
```

- [ ] **Step 2: Run — verify fails**

Run: `pnpm -F @dko/trpc test currencyConversion`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/trpc/src/utils/currencyConversion.ts`:

```ts
import { getExchangeRate } from "./currencyApi.js";

/**
 * Convert a native amount to a base currency using a USD-pivot rates record.
 * `rates` should be a fxratesapi.com style record with `base = USD` (the
 * shape returned by `currency.getMultipleRates` when its baseCurrency = USD).
 *
 * Returns `null` if either currency is missing from `rates`.
 */
export function convertNativeToBase(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>,
): number | null {
  if (fromCurrency === toCurrency) return amount;
  const rate = getExchangeRate(rates, fromCurrency, toCurrency);
  if (rate === null) return null;
  return amount * rate;
}
```

- [ ] **Step 4: Run — pass**

Run: `pnpm -F @dko/trpc test currencyConversion`

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/utils/currencyConversion.ts packages/trpc/src/utils/currencyConversion.spec.ts
git commit -m "feat(trpc): add convertNativeToBase helper"
```

---

## Task 4: `hasUserStartedBot` helper

**Files:**
- Create: `packages/trpc/src/utils/hasUserStartedBot.ts`
- Create: `packages/trpc/src/utils/hasUserStartedBot.spec.ts`

- [ ] **Step 1: Write failing test**

`packages/trpc/src/utils/hasUserStartedBot.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { hasUserStartedBot } from "./hasUserStartedBot.js";

const mockDb = {
  chat: { findUnique: vi.fn() },
} as unknown as PrismaClient;

describe("hasUserStartedBot", () => {
  beforeEach(() => vi.resetAllMocks());

  it("true when private Chat row keyed to userId exists", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({ id: BigInt(100), type: "private" });
    expect(await hasUserStartedBot(100, mockDb)).toBe(true);
    expect(mockDb.chat.findUnique).toHaveBeenCalledWith({
      where: { id: BigInt(100) },
      select: { id: true, type: true },
    });
  });

  it("false when no row", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue(null);
    expect(await hasUserStartedBot(100, mockDb)).toBe(false);
  });

  it("false when row exists but type != private", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({ id: BigInt(100), type: "group" });
    expect(await hasUserStartedBot(100, mockDb)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fails**

Run: `pnpm -F @dko/trpc test hasUserStartedBot`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/trpc/src/utils/hasUserStartedBot.ts`:

```ts
import type { Db } from "../trpc.js";

/**
 * In Telegram, a user can only receive bot DMs after sending /start.
 * The bot's start handler upserts a Chat row with id = userId and type='private'.
 * We treat the existence of that row as proof the user can receive DMs.
 */
export async function hasUserStartedBot(userId: number, db: Db): Promise<boolean> {
  const row = await db.chat.findUnique({
    where: { id: BigInt(userId) },
    select: { id: true, type: true },
  });
  return !!row && row.type === "private";
}
```

- [ ] **Step 4: Run — pass**

Run: `pnpm -F @dko/trpc test hasUserStartedBot`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/utils/hasUserStartedBot.ts packages/trpc/src/utils/hasUserStartedBot.spec.ts
git commit -m "feat(trpc): add hasUserStartedBot helper"
```

---

## Task 5: `getMyCounterpartyBalances` procedure

**Files:**
- Create: `packages/trpc/src/routers/expenseShare/getMyCounterpartyBalances.ts`
- Create: `packages/trpc/src/routers/expenseShare/getMyCounterpartyBalances.spec.ts`
- Modify: `packages/trpc/src/routers/expenseShare/index.ts`

- [ ] **Step 1: Write failing test**

`packages/trpc/src/routers/expenseShare/getMyCounterpartyBalances.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { getMyCounterpartyBalancesHandler } from "./getMyCounterpartyBalances.js";

const caller = 100;

const fakeAcrossChats = {
  balances: [
    {
      chatId: 1,
      chatTitle: "Bali Trip",
      debtSimplificationEnabled: false,
      currencies: [{ currency: "USD", net: 40 }],
      counterparties: [{ userId: 200, name: "Sean", currency: "USD", net: 40 }],
    },
    {
      chatId: 2,
      chatTitle: "Dinner Club",
      debtSimplificationEnabled: false,
      currencies: [{ currency: "AUD", net: 30 }],
      counterparties: [{ userId: 200, name: "Sean", currency: "AUD", net: 30 }],
    },
    {
      chatId: 3,
      chatTitle: "Roommates",
      debtSimplificationEnabled: false,
      currencies: [{ currency: "SGD", net: 50 }],
      counterparties: [{ userId: 300, name: "Bob", currency: "SGD", net: 50 }],
    },
  ],
};

const ratesByBase = {
  USD: { USD: 1, SGD: 1.355, AUD: 1.5 },
  SGD: { USD: 0.738, SGD: 1, AUD: 1.107 },
};

const mockDb = {
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  chat: { findUnique: vi.fn() },
} as unknown as PrismaClient;

const deps = {
  getAcrossChats: vi.fn(),
  fetchRates: vi.fn(),
};

describe("getMyCounterpartyBalancesHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    deps.getAcrossChats.mockResolvedValue(fakeAcrossChats);
    deps.fetchRates.mockImplementation(async (base: string) => ratesByBase[base as "USD" | "SGD"]);
    (mockDb.user.findUnique as any).mockResolvedValue({ baseCurrency: "SGD" });
    (mockDb.user.findMany as any).mockResolvedValue([
      { id: BigInt(200), firstName: "Sean", lastName: null, photoUrl: null },
      { id: BigInt(300), firstName: "Bob", lastName: null, photoUrl: null },
    ]);
    (mockDb.chat.findUnique as any).mockImplementation(async ({ where: { id } }: any) => {
      const n = Number(id);
      if (n === 200 || n === 300) return { id, type: "private" };
      return null;
    });
  });

  it("groups by counterparty and sums in baseCurrency", async () => {
    const result = await getMyCounterpartyBalancesHandler(
      { callerId: caller, baseCurrency: "SGD" },
      mockDb,
      deps,
    );

    expect(result.baseCurrency).toBe("SGD");
    const sean = result.counterparties.find((c) => c.userId === 200)!;
    expect(sean.groups).toHaveLength(2);
    // 40 USD ≈ 54.2 SGD ; 30 AUD via USD ≈ 27.10 SGD ; sum ≈ 81.3
    expect(sean.totalBaseNet).toBeCloseTo(81.3, 1);
    expect(sean.hasStartedBot).toBe(true);

    const bob = result.counterparties.find((c) => c.userId === 300)!;
    expect(bob.totalBaseNet).toBeCloseTo(50, 6);
  });

  it("sorts counterparties by |totalBaseNet| desc", async () => {
    const result = await getMyCounterpartyBalancesHandler(
      { callerId: caller, baseCurrency: "SGD" },
      mockDb,
      deps,
    );
    expect(result.counterparties.map((c) => c.userId)).toEqual([200, 300]);
  });

  it("filters counterparties whose baseNet rounds to zero", async () => {
    deps.getAcrossChats.mockResolvedValue({
      balances: [
        {
          chatId: 1,
          chatTitle: "X",
          debtSimplificationEnabled: false,
          currencies: [{ currency: "SGD", net: 0.001 }],
          counterparties: [{ userId: 200, name: "Sean", currency: "SGD", net: 0.001 }],
        },
      ],
    });
    const result = await getMyCounterpartyBalancesHandler(
      { callerId: caller, baseCurrency: "SGD" },
      mockDb,
      deps,
    );
    expect(result.counterparties).toHaveLength(0);
  });

  it("uses caller's stored baseCurrency when input omits it", async () => {
    (mockDb.user.findUnique as any).mockResolvedValue({ baseCurrency: "USD" });
    const result = await getMyCounterpartyBalancesHandler(
      { callerId: caller },
      mockDb,
      deps,
    );
    expect(result.baseCurrency).toBe("USD");
    expect(deps.fetchRates).toHaveBeenCalledWith("USD");
  });
});
```

- [ ] **Step 2: Run — verify fails**

Run: `pnpm -F @dko/trpc test getMyCounterpartyBalances`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/trpc/src/routers/expenseShare/getMyCounterpartyBalances.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { getMyBalancesAcrossChatsHandler } from "./getMyBalancesAcrossChats.js";
import { CURRENCY_DATABASE, fetchExchangeRates } from "../../utils/currencyApi.js";
import { convertNativeToBase } from "../../utils/currencyConversion.js";
import { hasUserStartedBot } from "../../utils/hasUserStartedBot.js";
import { FINANCIAL_THRESHOLDS } from "../../utils/financial.js";

const inputSchema = z.object({
  baseCurrency: z
    .string()
    .toUpperCase()
    .refine((c) => c in CURRENCY_DATABASE, { message: "Unknown baseCurrency" })
    .optional(),
});

const outputSchema = z.object({
  baseCurrency: z.string(),
  ratesAsOf: z.date().nullable(),
  counterparties: z.array(
    z.object({
      userId: z.number(),
      firstName: z.string(),
      lastName: z.string().nullable(),
      photoUrl: z.string().nullable(),
      hasStartedBot: z.boolean(),
      totalBaseNet: z.number(),
      groups: z.array(
        z.object({
          chatId: z.number(),
          chatTitle: z.string(),
          currency: z.string(),
          nativeNet: z.number(),
          baseNet: z.number(),
        }),
      ),
    }),
  ),
});

type Output = z.infer<typeof outputSchema>;

// Dependency-injection seam keeps the handler unit-testable without
// touching the network. Production passes the real fetch + handler.
export interface Deps {
  getAcrossChats: typeof getMyBalancesAcrossChatsHandler;
  fetchRates: (base: string) => Promise<Record<string, number>>;
}

const defaultDeps: Deps = {
  getAcrossChats: getMyBalancesAcrossChatsHandler,
  fetchRates: async (base) => (await fetchExchangeRates(base)).rates,
};

export async function getMyCounterpartyBalancesHandler(
  args: { callerId: number; baseCurrency?: string },
  db: Db,
  deps: Deps = defaultDeps,
): Promise<Output> {
  // Resolve base currency: explicit > stored > "SGD"
  let baseCurrency = args.baseCurrency;
  if (!baseCurrency) {
    const u = await db.user.findUnique({
      where: { id: BigInt(args.callerId) },
      select: { baseCurrency: true },
    });
    baseCurrency = u?.baseCurrency ?? "SGD";
  }

  const acrossChats = await deps.getAcrossChats(args.callerId, db);
  if (acrossChats.balances.length === 0) {
    return { baseCurrency, ratesAsOf: null, counterparties: [] };
  }

  // Fetch rates with USD as the API base; we cross-pivot in memory.
  const rates = await deps.fetchRates("USD");
  const ratesAsOf = new Date();

  // Group by counterparty userId
  type Bucket = {
    chatId: number;
    chatTitle: string;
    currency: string;
    nativeNet: number;
    baseNet: number;
  };
  const byUser = new Map<number, { groups: Bucket[]; total: number }>();

  for (const chat of acrossChats.balances) {
    for (const cp of chat.counterparties) {
      const baseNet = convertNativeToBase(cp.net, cp.currency, baseCurrency, rates);
      if (baseNet === null) continue; // skip unknown currency rather than failing the whole view
      const entry = byUser.get(cp.userId) ?? { groups: [], total: 0 };
      entry.groups.push({
        chatId: chat.chatId,
        chatTitle: chat.chatTitle,
        currency: cp.currency,
        nativeNet: cp.net,
        baseNet,
      });
      entry.total += baseNet;
      byUser.set(cp.userId, entry);
    }
  }

  // Filter out near-zero totals
  for (const [uid, entry] of byUser) {
    if (Math.abs(entry.total) <= FINANCIAL_THRESHOLDS.DISPLAY) byUser.delete(uid);
  }

  if (byUser.size === 0) {
    return { baseCurrency, ratesAsOf, counterparties: [] };
  }

  const userIds = Array.from(byUser.keys());
  const users = await db.user.findMany({
    where: { id: { in: userIds.map((n) => BigInt(n)) } },
    select: { id: true, firstName: true, lastName: true, photoUrl: true },
  });
  const userMap = new Map(users.map((u) => [Number(u.id), u]));

  // Resolve hasStartedBot in parallel
  const hasBotPairs = await Promise.all(
    userIds.map(async (uid) => [uid, await hasUserStartedBot(uid, db)] as const),
  );
  const hasBotMap = new Map(hasBotPairs);

  const counterparties: Output["counterparties"] = userIds
    .map((uid) => {
      const u = userMap.get(uid);
      const entry = byUser.get(uid)!;
      return {
        userId: uid,
        firstName: u?.firstName ?? "Unknown",
        lastName: u?.lastName ?? null,
        photoUrl: u?.photoUrl ?? null,
        hasStartedBot: hasBotMap.get(uid) ?? false,
        totalBaseNet: entry.total,
        groups: entry.groups,
      };
    })
    .sort((a, b) => Math.abs(b.totalBaseNet) - Math.abs(a.totalBaseNet));

  return { baseCurrency, ratesAsOf, counterparties };
}

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ ctx, input }) => {
    assertNotChatScoped(ctx.session);
    if (!ctx.session.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
    }
    return getMyCounterpartyBalancesHandler(
      { callerId: Number(ctx.session.user.id), baseCurrency: input.baseCurrency },
      ctx.db,
    );
  });
```

> **Note on `User.photoUrl`:** if the schema doesn't have this column, drop the field from the select + output and use `null`. Verify with `grep -E "photoUrl|photo_url" packages/database/prisma/schema.prisma`. If absent, remove `photoUrl` from `select` and from the `output schema` (set the corresponding response field to `null`).

- [ ] **Step 4: Wire into router**

`packages/trpc/src/routers/expenseShare/index.ts` — add import + entry:

```ts
import getMyCounterpartyBalances from "./getMyCounterpartyBalances.js";

export const expenseShareRouter = createTRPCRouter({
  getMyBalancesAcrossChats,
  getMyCounterpartyBalances,
  getMySpendByMonth,
  // …existing entries
});
```

- [ ] **Step 5: Run — pass**

Run: `pnpm -F @dko/trpc test getMyCounterpartyBalances`

Expected: 4 tests PASS.

Then `pnpm -F @dko/trpc build` — expected: no TS errors.

- [ ] **Step 6: Commit**

```bash
git add packages/trpc/src/routers/expenseShare/getMyCounterpartyBalances.ts \
        packages/trpc/src/routers/expenseShare/getMyCounterpartyBalances.spec.ts \
        packages/trpc/src/routers/expenseShare/index.ts
git commit -m "feat(trpc): getMyCounterpartyBalances — cross-group totals per person"
```

---

## Task 6: Cross-group bot DM templates

**Files:**
- Create: `packages/trpc/src/services/crossGroupDmTemplates.ts`
- Create: `packages/trpc/src/services/crossGroupDmTemplates.spec.ts`

- [ ] **Step 1: Write failing test**

`packages/trpc/src/services/crossGroupDmTemplates.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildSettleNotificationCaption,
  buildNudgeCaption,
} from "./crossGroupDmTemplates.js";

const sample = {
  senderName: "Bubu",
  baseCurrency: "SGD",
  totalBaseAbs: 99.42,
  groups: [
    { chatTitle: "Bali Trip", currency: "USD", nativeAbs: 40 },
    { chatTitle: "Dinner Club", currency: "AUD", nativeAbs: 30 },
    { chatTitle: "Roommates", currency: "CNY", nativeAbs: 100 },
  ],
};

describe("buildSettleNotificationCaption", () => {
  it("includes sender, total, and per-group native breakdown", () => {
    const text = buildSettleNotificationCaption(sample);
    expect(text).toContain("Bubu");
    expect(text).toContain("S$99.42");
    expect(text).toContain("Bali Trip");
    expect(text).toContain("$40.00");
    expect(text).toContain("A$30.00");
  });
});

describe("buildNudgeCaption", () => {
  it("addresses the debtor and lists the breakdown", () => {
    const text = buildNudgeCaption(sample);
    expect(text).toContain("Bubu is awaiting settlement");
    expect(text).toContain("S$99.42");
    expect(text).toContain("Bali Trip");
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm -F @dko/trpc test crossGroupDmTemplates`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/trpc/src/services/crossGroupDmTemplates.ts`:

```ts
import { getCurrencySymbol, getCurrencyDecimalDigits } from "../utils/currencyApi.js";

export interface CrossGroupSummary {
  senderName: string;
  baseCurrency: string;
  totalBaseAbs: number;
  groups: Array<{ chatTitle: string; currency: string; nativeAbs: number }>;
}

function fmt(amount: number, currency: string): string {
  const digits = getCurrencyDecimalDigits(currency);
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${amount.toFixed(digits)}`;
}

function groupsLine(groups: CrossGroupSummary["groups"]): string {
  return groups
    .map((g) => `${g.chatTitle}: ${fmt(g.nativeAbs, g.currency)}`)
    .join(" · ");
}

export function buildSettleNotificationCaption(s: CrossGroupSummary): string {
  const total = fmt(s.totalBaseAbs, s.baseCurrency);
  return [
    `${s.senderName} just settled with you across ${s.groups.length} group${s.groups.length === 1 ? "" : "s"}.`,
    `Approx ${total}.`,
    groupsLine(s.groups),
  ].join("\n");
}

export function buildNudgeCaption(s: CrossGroupSummary): string {
  const total = fmt(s.totalBaseAbs, s.baseCurrency);
  return [
    `${s.senderName} is awaiting settlement.`,
    `You owe ≈ ${total} across ${s.groups.length} group${s.groups.length === 1 ? "" : "s"}.`,
    groupsLine(s.groups),
    `Open the Balances tab in your personal chat to view.`,
  ].join("\n");
}
```

- [ ] **Step 4: Run — pass**

Run: `pnpm -F @dko/trpc test crossGroupDmTemplates`

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/services/crossGroupDmTemplates.ts packages/trpc/src/services/crossGroupDmTemplates.spec.ts
git commit -m "feat(trpc): cross-group settle + nudge DM caption templates"
```

---

## Task 7: `settleAllWithUser` procedure

**Files:**
- Create: `packages/trpc/src/routers/expenseShare/settleAllWithUser.ts`
- Create: `packages/trpc/src/routers/expenseShare/settleAllWithUser.spec.ts`
- Modify: `packages/trpc/src/routers/expenseShare/index.ts`

- [ ] **Step 1: Write failing test**

`packages/trpc/src/routers/expenseShare/settleAllWithUser.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { settleAllWithUserHandler } from "./settleAllWithUser.js";

const caller = 100;

const mockDb = {
  $transaction: vi.fn(),
  settlement: { create: vi.fn() },
  user: { findUnique: vi.fn() },
} as unknown as PrismaClient;

const deps = {
  getCounterpartyBalances: vi.fn(),
  sendDm: vi.fn(),
};

beforeEach(() => {
  vi.resetAllMocks();
  (mockDb.$transaction as any).mockImplementation(async (fn: any) => fn(mockDb));
  (mockDb.user.findUnique as any).mockResolvedValue({
    firstName: "Bubu", lastName: null,
  });
});

describe("settleAllWithUserHandler", () => {
  it("writes one Settlement per non-zero bucket in correct direction", async () => {
    deps.getCounterpartyBalances.mockResolvedValue({
      baseCurrency: "SGD",
      ratesAsOf: new Date(),
      counterparties: [
        {
          userId: 200,
          firstName: "Sean",
          lastName: null,
          photoUrl: null,
          hasStartedBot: true,
          totalBaseNet: 50,
          groups: [
            { chatId: 1, chatTitle: "Bali", currency: "USD", nativeNet: 40, baseNet: 54.2 },
            { chatId: 2, chatTitle: "Dinner", currency: "AUD", nativeNet: -10, baseNet: -7.4 },
          ],
        },
      ],
    });

    await settleAllWithUserHandler(
      { callerId: caller, counterpartyUserId: 200 },
      mockDb,
      deps,
    );

    expect(mockDb.settlement.create).toHaveBeenCalledTimes(2);
    // bucket 1: Sean owes caller 40 USD → sender=Sean, receiver=caller
    expect(mockDb.settlement.create).toHaveBeenCalledWith({
      data: {
        chatId: BigInt(1),
        senderId: BigInt(200),
        receiverId: BigInt(caller),
        amount: 40,
        currency: "USD",
      },
    });
    // bucket 2: caller owes Sean 10 AUD → sender=caller, receiver=Sean
    expect(mockDb.settlement.create).toHaveBeenCalledWith({
      data: {
        chatId: BigInt(2),
        senderId: BigInt(caller),
        receiverId: BigInt(200),
        amount: 10,
        currency: "AUD",
      },
    });
  });

  it("skips DM when counterparty has not started bot", async () => {
    deps.getCounterpartyBalances.mockResolvedValue({
      baseCurrency: "SGD",
      ratesAsOf: new Date(),
      counterparties: [{
        userId: 200, firstName: "Sean", lastName: null, photoUrl: null,
        hasStartedBot: false, totalBaseNet: 50,
        groups: [{ chatId: 1, chatTitle: "Bali", currency: "USD", nativeNet: 40, baseNet: 54.2 }],
      }],
    });
    await settleAllWithUserHandler({ callerId: caller, counterpartyUserId: 200 }, mockDb, deps);
    expect(deps.sendDm).not.toHaveBeenCalled();
  });

  it("sends DM when counterparty has started bot", async () => {
    deps.getCounterpartyBalances.mockResolvedValue({
      baseCurrency: "SGD",
      ratesAsOf: new Date(),
      counterparties: [{
        userId: 200, firstName: "Sean", lastName: null, photoUrl: null,
        hasStartedBot: true, totalBaseNet: 54.2,
        groups: [{ chatId: 1, chatTitle: "Bali", currency: "USD", nativeNet: 40, baseNet: 54.2 }],
      }],
    });
    await settleAllWithUserHandler({ callerId: caller, counterpartyUserId: 200 }, mockDb, deps);
    expect(deps.sendDm).toHaveBeenCalledWith(200, expect.stringContaining("Bubu"));
  });

  it("throws when counterparty has zero balance", async () => {
    deps.getCounterpartyBalances.mockResolvedValue({
      baseCurrency: "SGD", ratesAsOf: new Date(), counterparties: [],
    });
    await expect(
      settleAllWithUserHandler({ callerId: caller, counterpartyUserId: 200 }, mockDb, deps),
    ).rejects.toThrow(/no.*balance/i);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm -F @dko/trpc test settleAllWithUser`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/trpc/src/routers/expenseShare/settleAllWithUser.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { getMyCounterpartyBalancesHandler } from "./getMyCounterpartyBalances.js";
import { buildSettleNotificationCaption } from "../../services/crossGroupDmTemplates.js";
import { createBroadcast } from "../../services/broadcast.js";

const inputSchema = z.object({
  counterpartyUserId: z.number(),
});

const outputSchema = z.object({
  settled: z.number(), // count of Settlement rows written
  baseCurrency: z.string(),
  totalBaseAbs: z.number(),
});

export interface Deps {
  getCounterpartyBalances: typeof getMyCounterpartyBalancesHandler;
  // sendDm is best-effort; production wires this to ctx.teleBot via createBroadcast
  sendDm: (userId: number, caption: string) => Promise<void>;
}

export async function settleAllWithUserHandler(
  args: { callerId: number; counterpartyUserId: number },
  db: Db,
  deps: Deps,
): Promise<z.infer<typeof outputSchema>> {
  // Recompute fresh balance — never trust client-supplied amounts
  const fresh = await deps.getCounterpartyBalances({ callerId: args.callerId }, db);
  const cp = fresh.counterparties.find((c) => c.userId === args.counterpartyUserId);
  if (!cp || cp.groups.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No outstanding balance with this user",
    });
  }

  let settledCount = 0;
  await db.$transaction(async (tx) => {
    for (const g of cp.groups) {
      if (Math.abs(g.nativeNet) === 0) continue;
      const debtorIsCaller = g.nativeNet < 0;
      const senderId = debtorIsCaller ? args.callerId : args.counterpartyUserId;
      const receiverId = debtorIsCaller ? args.counterpartyUserId : args.callerId;
      await tx.settlement.create({
        data: {
          chatId: BigInt(g.chatId),
          senderId: BigInt(senderId),
          receiverId: BigInt(receiverId),
          amount: Math.abs(g.nativeNet),
          currency: g.currency,
        },
      });
      settledCount += 1;
    }
  });

  // Best-effort DM (after commit). Always swallow errors.
  if (cp.hasStartedBot) {
    const caller = await db.user.findUnique({
      where: { id: BigInt(args.callerId) },
      select: { firstName: true, lastName: true },
    });
    const senderName = [caller?.firstName, caller?.lastName].filter(Boolean).join(" ");
    const caption = buildSettleNotificationCaption({
      senderName: senderName || "Someone",
      baseCurrency: fresh.baseCurrency,
      totalBaseAbs: Math.abs(cp.totalBaseNet),
      groups: cp.groups.map((g) => ({
        chatTitle: g.chatTitle,
        currency: g.currency,
        nativeAbs: Math.abs(g.nativeNet),
      })),
    });
    try {
      await deps.sendDm(args.counterpartyUserId, caption);
    } catch (e) {
      // Telegram 403 (user blocked / never started) — log + swallow
      // eslint-disable-next-line no-console
      console.warn("[settleAllWithUser] DM failed:", e);
    }
  }

  return {
    settled: settledCount,
    baseCurrency: fresh.baseCurrency,
    totalBaseAbs: Math.abs(cp.totalBaseNet),
  };
}

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ ctx, input }) => {
    assertNotChatScoped(ctx.session);
    if (!ctx.session.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
    }
    const sendDm = async (userId: number, caption: string) => {
      await createBroadcast(
        { db: ctx.db, teleBot: ctx.teleBot, log: ctx.log },
        { message: caption, targetUserIds: [BigInt(userId)] },
      );
    };
    return settleAllWithUserHandler(
      {
        callerId: Number(ctx.session.user.id),
        counterpartyUserId: input.counterpartyUserId,
      },
      ctx.db,
      { getCounterpartyBalances: getMyCounterpartyBalancesHandler, sendDm },
    );
  });
```

> **Verify ctx fields:** confirm `ctx.teleBot` and `ctx.log` exist on the tRPC context (search `packages/trpc/src/trpc.ts` and `packages/trpc/src/context.ts`). If a different name is used (e.g. `ctx.bot`), substitute. Confirm `createBroadcast` signature matches; if its `CreateBroadcastOptions` differs, adjust the call but keep the per-userId, plain-text intent.

- [ ] **Step 4: Wire into router**

`packages/trpc/src/routers/expenseShare/index.ts` — add:

```ts
import settleAllWithUser from "./settleAllWithUser.js";

export const expenseShareRouter = createTRPCRouter({
  // …existing
  settleAllWithUser,
});
```

- [ ] **Step 5: Run — pass**

Run: `pnpm -F @dko/trpc test settleAllWithUser` → 4 PASS.
Run: `pnpm -F @dko/trpc build` → no TS errors.

- [ ] **Step 6: Commit**

```bash
git add packages/trpc/src/routers/expenseShare/settleAllWithUser.ts \
        packages/trpc/src/routers/expenseShare/settleAllWithUser.spec.ts \
        packages/trpc/src/routers/expenseShare/index.ts
git commit -m "feat(trpc): settleAllWithUser — clear all per-chat buckets in one call"
```

---

## Task 8: `nudgeCounterparty` procedure

**Files:**
- Create: `packages/trpc/src/routers/expenseShare/nudgeCounterparty.ts`
- Create: `packages/trpc/src/routers/expenseShare/nudgeCounterparty.spec.ts`
- Modify: `packages/trpc/src/routers/expenseShare/index.ts`

- [ ] **Step 1: Write failing test**

`packages/trpc/src/routers/expenseShare/nudgeCounterparty.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { nudgeCounterpartyHandler } from "./nudgeCounterparty.js";

const caller = 100;
const mockDb = { user: { findUnique: vi.fn() } } as unknown as PrismaClient;

const deps = {
  getCounterpartyBalances: vi.fn(),
  sendDm: vi.fn(),
  takeToken: vi.fn(),
};

const owedFresh = {
  baseCurrency: "SGD",
  ratesAsOf: new Date(),
  counterparties: [{
    userId: 200, firstName: "Sean", lastName: null, photoUrl: null,
    hasStartedBot: true, totalBaseNet: 99.42,
    groups: [{ chatId: 1, chatTitle: "Bali", currency: "USD", nativeNet: 40, baseNet: 54.2 }],
  }],
};

beforeEach(() => {
  vi.resetAllMocks();
  (mockDb.user.findUnique as any).mockResolvedValue({ firstName: "Bubu", lastName: null });
});

describe("nudgeCounterpartyHandler", () => {
  it("rate-limits when token bucket refuses", async () => {
    deps.takeToken.mockReturnValue(false);
    await expect(
      nudgeCounterpartyHandler({ callerId: caller, counterpartyUserId: 200 }, mockDb, deps),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(deps.sendDm).not.toHaveBeenCalled();
  });

  it("rejects when caller is not net-owed by counterparty", async () => {
    deps.takeToken.mockReturnValue(true);
    deps.getCounterpartyBalances.mockResolvedValue({
      baseCurrency: "SGD", ratesAsOf: new Date(),
      counterparties: [{ ...owedFresh.counterparties[0], totalBaseNet: -10 }],
    });
    await expect(
      nudgeCounterpartyHandler({ callerId: caller, counterpartyUserId: 200 }, mockDb, deps),
    ).rejects.toThrow(/nothing.*nudge/i);
  });

  it("rejects when counterparty has not started the bot", async () => {
    deps.takeToken.mockReturnValue(true);
    deps.getCounterpartyBalances.mockResolvedValue({
      baseCurrency: "SGD", ratesAsOf: new Date(),
      counterparties: [{ ...owedFresh.counterparties[0], hasStartedBot: false }],
    });
    await expect(
      nudgeCounterpartyHandler({ callerId: caller, counterpartyUserId: 200 }, mockDb, deps),
    ).rejects.toThrow(/bot/i);
  });

  it("sends DM and consumes token on happy path", async () => {
    deps.takeToken.mockReturnValue(true);
    deps.getCounterpartyBalances.mockResolvedValue(owedFresh);
    await nudgeCounterpartyHandler({ callerId: caller, counterpartyUserId: 200 }, mockDb, deps);
    expect(deps.takeToken).toHaveBeenCalledWith("nudge:100:200", 1, 86400000);
    expect(deps.sendDm).toHaveBeenCalledWith(200, expect.stringContaining("Bubu"));
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm -F @dko/trpc test nudgeCounterparty`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/trpc/src/routers/expenseShare/nudgeCounterparty.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { getMyCounterpartyBalancesHandler } from "./getMyCounterpartyBalances.js";
import { buildNudgeCaption } from "../../services/crossGroupDmTemplates.js";
import { createBroadcast } from "../../services/broadcast.js";
import { takeToken } from "../../utils/rateLimit.js";

const NUDGE_WINDOW_MS = 86_400_000; // 24h

const inputSchema = z.object({ counterpartyUserId: z.number() });
const outputSchema = z.object({ ok: z.literal(true) });

export interface Deps {
  getCounterpartyBalances: typeof getMyCounterpartyBalancesHandler;
  sendDm: (userId: number, caption: string) => Promise<void>;
  takeToken: (key: string, limit: number, windowMs: number) => boolean;
}

export async function nudgeCounterpartyHandler(
  args: { callerId: number; counterpartyUserId: number },
  db: Db,
  deps: Deps,
): Promise<z.infer<typeof outputSchema>> {
  if (!deps.takeToken(`nudge:${args.callerId}:${args.counterpartyUserId}`, 1, NUDGE_WINDOW_MS)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "You have already nudged this user in the last 24 hours",
    });
  }

  const fresh = await deps.getCounterpartyBalances({ callerId: args.callerId }, db);
  const cp = fresh.counterparties.find((c) => c.userId === args.counterpartyUserId);
  if (!cp || cp.totalBaseNet <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to nudge — they don't owe you" });
  }
  if (!cp.hasStartedBot) {
    throw new TRPCError({
      code: "FAILED_PRECONDITION",
      message: "Counterparty has not started the bot",
    });
  }

  const caller = await db.user.findUnique({
    where: { id: BigInt(args.callerId) },
    select: { firstName: true, lastName: true },
  });
  const senderName = [caller?.firstName, caller?.lastName].filter(Boolean).join(" ") || "Someone";

  const caption = buildNudgeCaption({
    senderName,
    baseCurrency: fresh.baseCurrency,
    totalBaseAbs: cp.totalBaseNet,
    groups: cp.groups.map((g) => ({
      chatTitle: g.chatTitle,
      currency: g.currency,
      nativeAbs: Math.abs(g.nativeNet),
    })),
  });

  await deps.sendDm(args.counterpartyUserId, caption);
  return { ok: true as const };
}

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ ctx, input }) => {
    assertNotChatScoped(ctx.session);
    if (!ctx.session.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
    }
    const sendDm = async (userId: number, caption: string) => {
      await createBroadcast(
        { db: ctx.db, teleBot: ctx.teleBot, log: ctx.log },
        { message: caption, targetUserIds: [BigInt(userId)] },
      );
    };
    return nudgeCounterpartyHandler(
      {
        callerId: Number(ctx.session.user.id),
        counterpartyUserId: input.counterpartyUserId,
      },
      ctx.db,
      {
        getCounterpartyBalances: getMyCounterpartyBalancesHandler,
        sendDm,
        takeToken,
      },
    );
  });
```

- [ ] **Step 4: Wire into router**

`packages/trpc/src/routers/expenseShare/index.ts`:

```ts
import nudgeCounterparty from "./nudgeCounterparty.js";

export const expenseShareRouter = createTRPCRouter({
  // …existing
  nudgeCounterparty,
});
```

- [ ] **Step 5: Run — pass**

Run: `pnpm -F @dko/trpc test nudgeCounterparty` → 4 PASS.
Run: `pnpm -F @dko/trpc build`.

- [ ] **Step 6: Commit**

```bash
git add packages/trpc/src/routers/expenseShare/nudgeCounterparty.ts \
        packages/trpc/src/routers/expenseShare/nudgeCounterparty.spec.ts \
        packages/trpc/src/routers/expenseShare/index.ts
git commit -m "feat(trpc): nudgeCounterparty with 24h rate-limit and bot DM"
```

---

## Task 9: CLI — `me list-counterparty-balances`

**Files:**
- Modify: `apps/cli/src/commands/me.ts`

- [ ] **Step 1: Add command**

`apps/cli/src/commands/me.ts` — append to `meCommands`:

```ts
{
  name: "list-counterparty-balances",
  description: "List per-counterparty balance totals across all groups, in chosen base currency.",
  options: {
    base: { type: "string", description: "ISO 4217 base currency (defaults to your stored baseCurrency)" },
  },
  execute: (opts, trpc) =>
    run("list-counterparty-balances", async () =>
      trpc.expenseShare.getMyCounterpartyBalances.query(
        opts.base ? { baseCurrency: String(opts.base) } : {},
      ),
    ),
},
```

- [ ] **Step 2: Build CLI**

Run: `pnpm -F @banananasplitz/cli build`

Expected: no TS errors.

- [ ] **Step 3: Smoke test against local API**

Run (with backend running):
```bash
node apps/cli/dist/cli.js me list-counterparty-balances --base SGD
```

Expected: JSON with `baseCurrency`, `counterparties[]`, etc. (Empty array OK if no balances.)

- [ ] **Step 4: Commit**

```bash
git add apps/cli/src/commands/me.ts
git commit -m "feat(cli): me list-counterparty-balances"
```

---

## Task 10: CLI — `me settle-all-with` + version bump + skill + changelog

**Files:**
- Modify: `apps/cli/src/commands/me.ts`
- Modify: `apps/cli/package.json`
- Modify: `apps/cli/SKILL.md`
- Modify: `apps/cli/CHANGELOG.md`

- [ ] **Step 1: Add command**

`apps/cli/src/commands/me.ts` — append:

```ts
{
  name: "settle-all-with",
  description: "Zero out every per-group balance with one user (writes one Settlement per chat in native currency).",
  options: {
    user: { type: "string", description: "Counterparty user ID", required: true },
    yes: { type: "boolean", description: "Skip interactive confirmation" },
  },
  execute: async (opts, trpc) => {
    if (!opts.user) return error("missing_option", "--user required", "Pass --user <telegramUserId>");
    const counterpartyUserId = Number(opts.user);
    if (!Number.isFinite(counterpartyUserId)) {
      return error("bad_option", "--user must be a numeric Telegram user id");
    }
    if (!opts.yes) {
      // Preview first
      const preview = await trpc.expenseShare.getMyCounterpartyBalances.query({});
      const cp = preview.counterparties.find((c) => c.userId === counterpartyUserId);
      if (!cp) return error("nothing_to_settle", "No outstanding balance with that user");
      // Print the breakdown so the operator can sanity-check
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(cp, null, 2));
      // eslint-disable-next-line no-console
      console.log(`\nRe-run with --yes to confirm settling ${cp.groups.length} bucket(s).`);
      return;
    }
    return run("settle-all-with", async () =>
      trpc.expenseShare.settleAllWithUser.mutate({ counterpartyUserId }),
    );
  },
},
```

- [ ] **Step 2: Bump CLI version**

`apps/cli/package.json` — bump the `"version"` per semver MINOR (new feature).

- [ ] **Step 3: Update SKILL.md**

`apps/cli/SKILL.md` — add a section under "Commands":

```markdown
### `me list-counterparty-balances [--base <ISO>]`

Lists every counterparty across all your groups with a per-(group, currency) breakdown and a total in your base currency. Defaults `--base` to the value stored on your User row.

### `me settle-all-with --user <id> [--yes]`

Without `--yes`, prints the balance preview and exits. With `--yes`, writes one `Settlement` row per non-zero (chat, currency) bucket in native currency. Counterparty is DM'd a summary by the bot if they've started a private chat with it.
```

- [ ] **Step 4: Update CHANGELOG.md**

`apps/cli/CHANGELOG.md` — add a new entry at the top:

```markdown
## <new-version> — 2026-05-13

- feat: `me list-counterparty-balances` — cross-group totals per person
- feat: `me settle-all-with` — clear every shared balance with one user in one transaction
```

- [ ] **Step 5: Build + smoke test**

Run: `pnpm -F @banananasplitz/cli build`

Then:
```bash
node apps/cli/dist/cli.js me settle-all-with --user 999999 # nonexistent → expects nothing_to_settle
```

Expected: graceful error, no crash.

- [ ] **Step 6: Commit**

```bash
git add apps/cli/src/commands/me.ts apps/cli/package.json apps/cli/SKILL.md apps/cli/CHANGELOG.md
git commit -m "feat(cli): me settle-all-with + version bump + skill/CHANGELOG"
```

---

## Task 11: Web — `BaseCurrencyField` in Settings

**Files:**
- Create: `apps/web/src/components/features/Settings/BaseCurrencyField.tsx`
- Modify: settings parent (locate via: `mgrep search "settings page personal" --limit 5` — likely `apps/web/src/components/features/Settings/SettingsPage.tsx` or similar; render the new field there)

- [ ] **Step 1: Implement**

`apps/web/src/components/features/Settings/BaseCurrencyField.tsx`:

```tsx
import { Section, Cell } from "@telegram-apps/telegram-ui";
import { trpc } from "@/lib/trpc"; // adjust import to project's tRPC client
import { CURRENCY_DATABASE } from "@dko/trpc/utils/currencyApi"; // or barrel export
import { useState } from "react";

interface Props {
  currentValue: string;
  userId: number;
}

const ALL = Object.values(CURRENCY_DATABASE).sort((a, b) => a.code.localeCompare(b.code));

export function BaseCurrencyField({ currentValue, userId }: Props) {
  const [value, setValue] = useState(currentValue);
  const update = trpc.user.updateUser.useMutation();

  return (
    <Section header="Base currency" footer="Used to net cross-group balances on the Balances tab.">
      <Cell
        Component="label"
        after={
          <select
            value={value}
            onChange={async (e) => {
              const next = e.target.value;
              setValue(next);
              try {
                await update.mutateAsync({ userId, baseCurrency: next });
              } catch {
                setValue(currentValue); // revert on failure
              }
            }}
          >
            {ALL.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.code} — {c.name}
              </option>
            ))}
          </select>
        }
      >
        Currency
      </Cell>
    </Section>
  );
}
```

- [ ] **Step 2: Render in settings parent**

Locate the settings page and render `<BaseCurrencyField currentValue={user.baseCurrency} userId={Number(user.id)} />`. The user object should already be in scope from the page's existing user query.

- [ ] **Step 3: Manual smoke**

Open the TMA → Settings → see the field. Change the value → reopen the page → expect the value to persist.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Settings/BaseCurrencyField.tsx \
        apps/web/src/components/features/Settings/SettingsPage.tsx  # or actual parent
git commit -m "feat(web): BaseCurrencyField in Settings"
```

---

## Task 12: Web — replace `UserBalancesTab` + inline `BaseCurrencyPicker`

**Files:**
- Create: `apps/web/src/components/features/Chat/BaseCurrencyPicker.tsx`
- Modify: `apps/web/src/components/features/Chat/UserBalancesTab.tsx`

- [ ] **Step 1: Implement picker**

`apps/web/src/components/features/Chat/BaseCurrencyPicker.tsx`:

```tsx
import { CURRENCY_DATABASE } from "@dko/trpc/utils/currencyApi";

const ALL = Object.values(CURRENCY_DATABASE).sort((a, b) => a.code.localeCompare(b.code));

interface Props {
  value: string;
  onChange: (next: string) => void;
}

export function BaseCurrencyPicker({ value, onChange }: Props) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12, opacity: 0.7 }}>Base</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {ALL.map((c) => (
          <option key={c.code} value={c.code}>{c.code}</option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 2: Rewrite `UserBalancesTab`**

`apps/web/src/components/features/Chat/UserBalancesTab.tsx` — replace the placeholder:

```tsx
import { useState } from "react";
import { Cell, Section, Spinner } from "@telegram-apps/telegram-ui";
import { trpc } from "@/lib/trpc";
import { BaseCurrencyPicker } from "./BaseCurrencyPicker";
import { CounterpartyBalanceSheet } from "./CounterpartyBalanceSheet";
import { getCurrencySymbol, getCurrencyDecimalDigits } from "@dko/trpc/utils/currencyApi";

function fmt(n: number, ccy: string): string {
  const sign = n >= 0 ? "+" : "−";
  const abs = Math.abs(n).toFixed(getCurrencyDecimalDigits(ccy));
  return `${sign} ${getCurrencySymbol(ccy)}${abs}`;
}

export function UserBalancesTab({ initialBaseCurrency }: { initialBaseCurrency: string }) {
  const [base, setBase] = useState(initialBaseCurrency);
  const [openUserId, setOpenUserId] = useState<number | null>(null);

  const q = trpc.expenseShare.getMyCounterpartyBalances.useQuery({ baseCurrency: base });

  if (q.isLoading) return <Spinner size="m" />;
  if (q.isError) return <p>Failed to load balances. Try again.</p>;

  const data = q.data!;
  const totalOwed = data.counterparties
    .filter((c) => c.totalBaseNet > 0)
    .reduce((acc, c) => acc + c.totalBaseNet, 0);
  const totalOwes = data.counterparties
    .filter((c) => c.totalBaseNet < 0)
    .reduce((acc, c) => acc + Math.abs(c.totalBaseNet), 0);

  const open = openUserId !== null
    ? data.counterparties.find((c) => c.userId === openUserId) ?? null
    : null;

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Balances</strong>
        <BaseCurrencyPicker value={base} onChange={setBase} />
      </div>

      <Section header={`Net across all groups`}>
        <Cell after={fmt(totalOwed, base)}>Owed to you</Cell>
        <Cell after={fmt(-totalOwes, base)}>You owe</Cell>
      </Section>

      <Section header="People">
        {data.counterparties.length === 0 ? (
          <Cell>No outstanding balances across any group.</Cell>
        ) : (
          data.counterparties.map((c) => {
            const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
            const groupsText = c.groups.length === 1
              ? c.groups[0].chatTitle
              : `${c.groups.length} groups`;
            return (
              <Cell
                key={c.userId}
                subtitle={groupsText}
                after={fmt(c.totalBaseNet, base)}
                onClick={() => setOpenUserId(c.userId)}
              >
                {fullName}
              </Cell>
            );
          })
        )}
      </Section>

      <CounterpartyBalanceSheet
        open={open !== null}
        counterparty={open}
        baseCurrency={data.baseCurrency}
        ratesAsOf={data.ratesAsOf}
        onOpenChange={(o) => !o && setOpenUserId(null)}
        onAfterMutate={() => q.refetch()}
      />
    </div>
  );
}
```

> **`initialBaseCurrency` prop:** if the parent (`chat.index.tsx`) doesn't currently pass the user's stored baseCurrency, source it from the user's profile query already used elsewhere on that screen, or from a `useQuery(trpc.user.me)` if one exists. Default to `"SGD"` if unavailable.

- [ ] **Step 3: Manual smoke**

Open TMA in personal chat, switch to Groups tab → expect rendered list (or empty state).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Chat/UserBalancesTab.tsx \
        apps/web/src/components/features/Chat/BaseCurrencyPicker.tsx
git commit -m "feat(web): cross-group balances list view + base currency picker"
```

---

## Task 13: Web — `CounterpartyBalanceSheet`

**Files:**
- Create: `apps/web/src/components/features/Chat/CounterpartyBalanceSheet.tsx`

- [ ] **Step 1: Implement**

`apps/web/src/components/features/Chat/CounterpartyBalanceSheet.tsx`:

```tsx
import { Modal, Section, Cell, Button, Title } from "@telegram-apps/telegram-ui";
import { trpc } from "@/lib/trpc";
import { getCurrencySymbol, getCurrencyDecimalDigits } from "@dko/trpc/utils/currencyApi";

interface Group {
  chatId: number;
  chatTitle: string;
  currency: string;
  nativeNet: number;
  baseNet: number;
}
interface Counterparty {
  userId: number;
  firstName: string;
  lastName: string | null;
  hasStartedBot: boolean;
  totalBaseNet: number;
  groups: Group[];
}

interface Props {
  open: boolean;
  counterparty: Counterparty | null;
  baseCurrency: string;
  ratesAsOf: Date | null;
  onOpenChange: (open: boolean) => void;
  onAfterMutate: () => void;
}

function fmtNative(n: number, ccy: string): string {
  const sign = n >= 0 ? "+" : "−";
  const abs = Math.abs(n).toFixed(getCurrencyDecimalDigits(ccy));
  return `${sign}${getCurrencySymbol(ccy)}${abs}`;
}
function fmtBase(n: number, ccy: string): string {
  const sign = n >= 0 ? "+" : "−";
  const abs = Math.abs(n).toFixed(getCurrencyDecimalDigits(ccy));
  return `${sign} ${getCurrencySymbol(ccy)}${abs}`;
}

export function CounterpartyBalanceSheet({
  open, counterparty, baseCurrency, ratesAsOf, onOpenChange, onAfterMutate,
}: Props) {
  const settle = trpc.expenseShare.settleAllWithUser.useMutation();
  const nudge = trpc.expenseShare.nudgeCounterparty.useMutation();

  if (!counterparty) {
    return <Modal open={open} onOpenChange={onOpenChange}><div /></Modal>;
  }

  const fullName = [counterparty.firstName, counterparty.lastName].filter(Boolean).join(" ");
  const isOwedToUser = counterparty.totalBaseNet > 0;
  const headline = isOwedToUser
    ? `${fullName} owes you ≈ ${fmtBase(counterparty.totalBaseNet, baseCurrency)}`
    : `You owe ${fullName} ≈ ${fmtBase(counterparty.totalBaseNet, baseCurrency)}`;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <Title weight="2">{headline}</Title>

      <Section>
        {counterparty.groups.map((g) => (
          <Cell
            key={`${g.chatId}-${g.currency}`}
            subtitle={g.chatTitle}
            after={`${fmtNative(g.nativeNet, g.currency)}  ≈ ${fmtBase(g.baseNet, baseCurrency)}`}
          >
            {g.currency}
          </Cell>
        ))}
        {ratesAsOf && (
          <Cell subhead={`Rate as of ${ratesAsOf.toLocaleString()}`}> </Cell>
        )}
      </Section>

      <div style={{ display: "flex", gap: 8, padding: 12 }}>
        <Button
          stretched
          mode="bezeled"
          disabled={!counterparty.hasStartedBot || nudge.isPending || !isOwedToUser}
          onClick={async () => {
            try {
              await nudge.mutateAsync({ counterpartyUserId: counterparty.userId });
            } catch (e: any) {
              alert(e?.message ?? "Nudge failed");
            }
          }}
        >
          {nudge.isPending ? "Nudging…" : "Nudge"}
        </Button>
        <Button
          stretched
          mode="filled"
          disabled={settle.isPending}
          onClick={async () => {
            const ok = window.confirm(`Mark all settled with ${fullName}?`);
            if (!ok) return;
            try {
              await settle.mutateAsync({ counterpartyUserId: counterparty.userId });
              onAfterMutate();
              onOpenChange(false);
            } catch (e: any) {
              alert(e?.message ?? "Settle failed");
            }
          }}
        >
          {settle.isPending ? "Settling…" : "Mark all settled"}
        </Button>
      </div>
    </Modal>
  );
}
```

> **`window.confirm`** is a placeholder — replace with the project's existing confirm-dialog component if one is in use (search `mgrep search "confirm dialog modal" --limit 5`). Same for `alert` → use the project's toast / snackbar.

- [ ] **Step 2: Manual smoke**

Open TMA → Groups tab → click a counterparty → expect sheet with breakdown. Buttons render in correct enabled/disabled state.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Chat/CounterpartyBalanceSheet.tsx
git commit -m "feat(web): CounterpartyBalanceSheet with settle + nudge"
```

---

## Task 14: End-to-end UAT

**Files:** none (validation only).

This task uses two parallel tracks — **subagent-driven backend assertions** + **AskUserQuestion UI walkthrough** — per the project's UAT discipline (cli/backend → subagent; UX → manual).

- [ ] **Step 1: Deploy a preview build**

Run from main workspace:
```bash
git push origin <branch>
gh pr create --draft --title "feat: cross-group balances" --body-file - <<'EOF'
WIP — implementing docs/superpowers/specs/2026-05-13-cross-group-balances-design.md
EOF
```

Wait for the GitHub Actions deploy job to finish (`gh run watch`).

- [ ] **Step 2: Backend UAT via subagent**

Dispatch a `general-purpose` subagent with this task (paste verbatim):

> Task: Validate the cross-group balances feature end-to-end against the deployed preview.
> Steps:
> 1. Pick or create a Telegram test user with at least 3 groups, each in a different currency (USD, AUD, SGD). Use the local CLI (`node apps/cli/dist/cli.js`) with the user's API key.
> 2. Add expenses such that the user has open balances with two distinct counterparties across the 3 groups (mixed directions).
> 3. Run `me list-counterparty-balances --base SGD` — assert: each counterparty appears with a `totalBaseNet`, sorted by absolute magnitude, with per-group breakdowns matching the underlying expense rows.
> 4. Run `me settle-all-with --user <one counterparty> --yes` — assert: returns `settled` count equal to the number of non-zero (chat, currency) buckets with that user.
> 5. Re-run `me list-counterparty-balances --base SGD` — assert: that counterparty no longer appears.
> 6. Inspect the DB directly (`psql` or Prisma Studio) to confirm one `Settlement` row per affected (chatId, currency) was written in native currency with the correct sender/receiver direction.
> 7. Verify the per-group balance views (`getNetShare`, `getMyBalancesAcrossChats`) for each affected chat now show zero with that counterparty.
> 8. Trigger nudge via the deployed UI for the second counterparty; assert the bot DM was sent (check Telegram client) and a second nudge within 24h returns `TOO_MANY_REQUESTS`.
> 9. Clean up: delete the test expenses + settlements created in steps 2–4.
>
> Report back with pass/fail per step and any unexpected behavior.

- [ ] **Step 3: UI walkthrough via AskUserQuestion**

After the subagent reports green on backend, walk the user through the UI manually using `AskUserQuestion` one step at a time (per the project's manual-UAT discipline):
- Open personal chat → Groups tab → expect list rendered.
- Tap a counterparty row → expect sheet with breakdown + correct headline direction.
- Change base currency in the in-view picker → expect totals re-converted.
- Tap "Mark all settled" → confirm dialog → counterparty disappears + bot DM received.
- Tap "Nudge" on another counterparty → DM received + button disabled with cooldown.
- Open Settings → BaseCurrencyField → change → re-open Groups tab → expect new default base.

Empty option labels per project AskUserQuestion style; one question per step.

- [ ] **Step 4: Mark PR ready, tag @claude with verdict**

After both tracks pass, comment on the PR with `@claude` and the merge-readiness summary per the project review-flow discipline.

---

## Self-review notes

- **`User.photoUrl`** referenced in Task 5 — confirm before commit; if absent, drop from `select` and the `output` schema.
- **`ctx.teleBot` / `ctx.log`** referenced in Tasks 7 + 8 — confirm names in `packages/trpc/src/context.ts` before commit; substitute if different.
- **`createBroadcast` signature** in Tasks 7 + 8 — verified shape: `(ctx, opts)` with `targetUserIds: bigint[]`. If options field is named differently (e.g. `userIds`, `to`), adjust the call sites — do not invent a new abstraction.
- **`@dko/trpc/utils/currencyApi` import path** in Tasks 11–13 — confirm the package exports the util via barrel; if not, expose `CURRENCY_DATABASE`, `getCurrencySymbol`, `getCurrencyDecimalDigits` from the package's public index, or copy the small constants into a `packages/ui` shared module.
- **Settings parent file** in Task 11 — locate via `mgrep search "BaseCurrencyField parent settings page" --limit 5` once the field exists, or by `grep -r "Section.*Settings" apps/web/src/components/features/Settings | head`.
- **Alert / window.confirm** in Task 13 — replace with project's idiomatic dialog/toast components before commit if they exist.

These are not blockers — they are inline verifications a worker should do at the moment they touch each file.
