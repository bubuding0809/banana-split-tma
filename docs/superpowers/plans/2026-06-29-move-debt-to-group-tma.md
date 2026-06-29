# Move debt to another group (TMA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing create-transfer flow to the Telegram Mini App — a contextual modal that moves an outstanding debt from one group to another, launched from a debt row the user is already viewing.

**Architecture:** A new `expenseShare.getEligibleTransferTargets` query pre-filters target groups to those both parties belong to. A pure `deriveMoveParams` helper turns a tapped balance row into transfer params (debtor/creditor/amount/currency). A new `MoveDebtSheet` modal lists eligible groups as tappable cells and fires `debtTransfer.createTransfer` after a `popup` confirm. `CounterpartyBalanceSheet` breakdown rows become tappable to open it.

**Tech Stack:** tRPC + Zod + Prisma (`@dko/trpc`), React + `@telegram-apps/telegram-ui` + `@telegram-apps/sdk-react` (`apps/web`), Vitest (`vitest run`), happy-dom + Testing Library for component tests.

## Global Constraints

- Backend handlers follow the existing two-export pattern: a pure `…Handler(input, db)` function plus a `default protectedProcedure…` wrapper. Copy the shape from `getAllByChat.ts`.
- BigInt at the DB boundary; `Number(...)` in returned payloads. User/chat IDs cross the wire as `number`.
- Cross-group actions authorize BOTH chats via `assertChatAccess` — but eligibility filtering is membership-only; the solvency check stays server-side in the existing `createTransfer` (do not duplicate it).
- UI: only `@telegram-apps/telegram-ui` components + existing project helpers. No raw `<div style>` for interactive surfaces, no native `<select>`, no `window.confirm`/`alert`. Confirm via `popup.open.ifAvailable`. Haptics via `hapticFeedback`.
- Money display via `formatCurrencyWithCode`; balance colors via `getBalanceColorClass`. Avatars via `ChatMemberAvatar`.
- Run backend tests with `pnpm --filter @dko/trpc test`; web tests with `pnpm --filter web test` (alias `web` = `bananasplitz`). Commit after every green step.

---

### Task 1: Backend query `getEligibleTransferTargets`

**Files:**
- Create: `packages/trpc/src/routers/expenseShare/getEligibleTransferTargets.ts`
- Create: `packages/trpc/src/routers/expenseShare/getEligibleTransferTargets.spec.ts`
- Modify: `packages/trpc/src/routers/expenseShare/index.ts:1-20`

**Interfaces:**
- Produces: `getEligibleTransferTargetsHandler(input: { callerId: number; counterpartyUserId: number; sourceChatId: number }, db: Db): Promise<Array<{ chatId: number; chatTitle: string }>>`
- Produces (router): `expenseShare.getEligibleTransferTargets` query, input `{ counterpartyUserId: number; sourceChatId: number }`, output `Array<{ chatId: number; chatTitle: string }>`.

- [ ] **Step 1: Write the failing test**

Create `packages/trpc/src/routers/expenseShare/getEligibleTransferTargets.spec.ts`:

```ts
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
    const arg = findMany.mock.calls[0]![0] as {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dko/trpc test getEligibleTransferTargets`
Expected: FAIL — `Cannot find module './getEligibleTransferTargets.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/trpc/src/routers/expenseShare/getEligibleTransferTargets.ts`:

```ts
import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { TRPCError } from "@trpc/server";

const inputSchema = z.object({
  counterpartyUserId: z.number(),
  sourceChatId: z.number(),
});

const outputSchema = z.array(
  z.object({ chatId: z.number(), chatTitle: z.string() })
);

export async function getEligibleTransferTargetsHandler(
  input: { callerId: number; counterpartyUserId: number; sourceChatId: number },
  db: Db
): Promise<z.infer<typeof outputSchema>> {
  // Groups where BOTH the caller and the counterparty are members, excluding
  // the source chat. Membership-only — the solvency check stays in
  // debtTransfer.createTransfer, which remains the source of truth.
  const chats = await db.chat.findMany({
    where: {
      AND: [
        { members: { some: { id: BigInt(input.callerId) } } },
        { members: { some: { id: BigInt(input.counterpartyUserId) } } },
      ],
      id: { not: BigInt(input.sourceChatId) },
    },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  return chats.map((c) => ({ chatId: Number(c.id), chatTitle: c.title }));
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
    return getEligibleTransferTargetsHandler(
      {
        callerId: Number(ctx.session.user.id),
        counterpartyUserId: input.counterpartyUserId,
        sourceChatId: input.sourceChatId,
      },
      ctx.db
    );
  });
```

Note: the test asserts `orderBy` is not present in its `where` assertions, so adding `orderBy: { title: "asc" }` is safe (the test only reads `calls[0][0].where`).

- [ ] **Step 4: Register the query**

Modify `packages/trpc/src/routers/expenseShare/index.ts` — add the import (alphabetical, after `getMyCounterpartyBalances`) and the router entry:

```ts
import getEligibleTransferTargets from "./getEligibleTransferTargets.js";
```

```ts
export const expenseShareRouter = createTRPCRouter({
  getEligibleTransferTargets,
  getMyBalancesAcrossChats,
  getMyCounterpartyBalances,
  getMySpendByMonth,
  getNetShare,
  getTotalBorrowed,
  getTotalLent,
  nudgeCounterparty,
  settleAllWithUser,
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @dko/trpc test getEligibleTransferTargets`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @dko/trpc build` (or the package's typecheck script)
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/trpc/src/routers/expenseShare/getEligibleTransferTargets.ts \
        packages/trpc/src/routers/expenseShare/getEligibleTransferTargets.spec.ts \
        packages/trpc/src/routers/expenseShare/index.ts
git commit -m "feat(trpc): getEligibleTransferTargets for cross-group transfer picker"
```

---

### Task 2: `deriveMoveParams` pure helper

A row from `getMyCounterpartyBalances.groups` plus the viewer and counterparty IDs determine transfer direction and amount. Extract this as a pure, unit-testable helper so the component stays declarative.

**Files:**
- Create: `apps/web/src/components/features/Chat/deriveMoveParams.ts`
- Create: `apps/web/src/components/features/Chat/deriveMoveParams.test.ts`

**Interfaces:**
- Consumes: a group bucket `{ chatId: number; chatTitle: string; currency: string; nativeNet: number; baseNet: number }` (the element type of `CounterpartyBalanceSheet`'s `groups`).
- Produces:
  ```ts
  export interface MoveParams {
    debtorId: number;
    creditorId: number;
    amount: number;       // abs(nativeNet), always > 0
    currency: string;
    sourceChatId: number;
    sourceChatTitle: string;
    callerOwes: boolean;  // true when caller is the debtor
  }
  export function deriveMoveParams(
    group: { chatId: number; chatTitle: string; currency: string; nativeNet: number },
    callerId: number,
    counterpartyId: number
  ): MoveParams | null   // null when nativeNet rounds to 0 (not transferable)
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/features/Chat/deriveMoveParams.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveMoveParams } from "./deriveMoveParams";

const group = (nativeNet: number) => ({
  chatId: 100,
  chatTitle: "Japan Trip",
  currency: "SGD",
  nativeNet,
});

describe("deriveMoveParams", () => {
  it("caller owes counterparty when nativeNet < 0", () => {
    const p = deriveMoveParams(group(-71.79), 1, 2)!;
    expect(p.debtorId).toBe(1);
    expect(p.creditorId).toBe(2);
    expect(p.amount).toBeCloseTo(71.79);
    expect(p.callerOwes).toBe(true);
    expect(p.currency).toBe("SGD");
    expect(p.sourceChatId).toBe(100);
    expect(p.sourceChatTitle).toBe("Japan Trip");
  });

  it("counterparty owes caller when nativeNet > 0", () => {
    const p = deriveMoveParams(group(40), 1, 2)!;
    expect(p.debtorId).toBe(2);
    expect(p.creditorId).toBe(1);
    expect(p.amount).toBe(40);
    expect(p.callerOwes).toBe(false);
  });

  it("returns null for a near-zero balance", () => {
    expect(deriveMoveParams(group(0), 1, 2)).toBeNull();
    expect(deriveMoveParams(group(0.004), 1, 2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test deriveMoveParams`
Expected: FAIL — cannot find module `./deriveMoveParams`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/components/features/Chat/deriveMoveParams.ts`:

```ts
export interface MoveParams {
  debtorId: number;
  creditorId: number;
  amount: number;
  currency: string;
  sourceChatId: number;
  sourceChatTitle: string;
  callerOwes: boolean;
}

// Below this, a balance is treated as settled and not transferable. Mirrors
// the backend FINANCIAL_THRESHOLDS.DISPLAY (0.01) used by the balance views.
const DISPLAY_THRESHOLD = 0.01;

export function deriveMoveParams(
  group: {
    chatId: number;
    chatTitle: string;
    currency: string;
    nativeNet: number;
  },
  callerId: number,
  counterpartyId: number
): MoveParams | null {
  const net = group.nativeNet;
  if (Math.abs(net) <= DISPLAY_THRESHOLD) return null;

  // net < 0 → caller owes counterparty; net > 0 → counterparty owes caller.
  const callerOwes = net < 0;
  return {
    debtorId: callerOwes ? callerId : counterpartyId,
    creditorId: callerOwes ? counterpartyId : callerId,
    amount: Math.abs(net),
    currency: group.currency,
    sourceChatId: group.chatId,
    sourceChatTitle: group.chatTitle,
    callerOwes,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test deriveMoveParams`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Chat/deriveMoveParams.ts \
        apps/web/src/components/features/Chat/deriveMoveParams.test.ts
git commit -m "feat(web): deriveMoveParams helper for debt-move direction/amount"
```

---

### Task 3: `MoveDebtSheet` component

A modal that recaps the debt being moved and lists eligible target groups as tappable cells. Tapping a group confirms via `popup`, then fires `createTransfer`.

**Files:**
- Create: `apps/web/src/components/features/Chat/MoveDebtSheet.tsx`
- Create: `apps/web/src/components/features/Chat/MoveDebtSheet.test.tsx`

**Interfaces:**
- Consumes: `MoveParams` from Task 2; `expenseShare.getEligibleTransferTargets` from Task 1; `debtTransfer.createTransfer` (existing).
- Produces:
  ```ts
  interface MoveDebtSheetProps {
    open: boolean;
    move: MoveParams | null;        // null renders an empty Modal shell
    counterpartyUserId: number;
    counterpartyName: string;       // for copy ("…with {name}")
    onOpenChange: (open: boolean) => void;
    onAfterMutate: () => void;      // parent refetch hook
  }
  export function MoveDebtSheet(props: MoveDebtSheetProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/features/Chat/MoveDebtSheet.test.tsx`. Mirrors the mocking style of `RecurringExpenseDetailsModal.test.tsx` (mock `telegram-ui`, `sdk-react`, and `@utils/trpc`).

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MoveDebtSheet } from "./MoveDebtSheet";
import type { MoveParams } from "./deriveMoveParams";

afterEach(() => cleanup());

vi.mock("@telegram-apps/sdk-react", () => ({
  hapticFeedback: {
    impactOccurred: { ifAvailable: vi.fn() },
    notificationOccurred: { ifAvailable: vi.fn() },
  },
  popup: { open: { ifAvailable: vi.fn(async () => "cancel") } },
  themeParams: { sectionBackgroundColor: {}, subtitleTextColor: {} },
  useSignal: vi.fn(() => "#888888"),
}));

vi.mock("@telegram-apps/telegram-ui", () => ({
  Modal: Object.assign(
    ({ open, header, children }: any) =>
      open ? (
        <div data-testid="modal">
          {header}
          {children}
        </div>
      ) : null,
    { Header: ({ children }: any) => <div>{children}</div> }
  ),
  Section: ({ header, children }: any) => (
    <div>
      {typeof header === "string" ? <h3>{header}</h3> : header}
      {children}
    </div>
  ),
  Cell: ({ children, onClick, before, after }: any) => (
    <button onClick={onClick}>
      {before}
      {children}
      {after}
    </button>
  ),
  Caption: ({ children }: any) => <span>{children}</span>,
  Text: ({ children }: any) => <span>{children}</span>,
  Skeleton: ({ children }: any) => <>{children}</>,
  Info: ({ children }: any) => <div>{children}</div>,
  Snackbar: ({ children }: any) => <div>{children}</div>,
}));

const mutateAsync = vi.fn(async () => ({}));
vi.mock("@utils/trpc", () => ({
  trpc: {
    expenseShare: {
      getEligibleTransferTargets: {
        useQuery: vi.fn(() => ({
          data: [
            { chatId: 200, chatTitle: "LADS 2026" },
            { chatId: 300, chatTitle: "Ski 2026" },
          ],
          isLoading: false,
        })),
      },
    },
    debtTransfer: {
      createTransfer: {
        useMutation: vi.fn(() => ({ mutateAsync, isPending: false })),
      },
    },
    useUtils: vi.fn(() => ({
      debtTransfer: { getAllByChat: { invalidate: vi.fn() } },
      currency: { getCurrenciesWithBalance: { invalidate: vi.fn() } },
      chat: { getBulkChatDebts: { invalidate: vi.fn() } },
      expenseShare: {
        getMyBalancesAcrossChats: { invalidate: vi.fn() },
        getMyCounterpartyBalances: { invalidate: vi.fn() },
      },
    })),
  },
}));

vi.mock("@/components/ui/ChatMemberAvatar", () => ({
  default: () => <span data-testid="avatar" />,
}));

const move: MoveParams = {
  debtorId: 1,
  creditorId: 2,
  amount: 71.79,
  currency: "SGD",
  sourceChatId: 100,
  sourceChatTitle: "Japan Trip",
  callerOwes: true,
};

describe("MoveDebtSheet", () => {
  it("lists each eligible target group", () => {
    render(
      <MoveDebtSheet
        open
        move={move}
        counterpartyUserId={2}
        counterpartyName="Sean"
        onOpenChange={() => {}}
        onAfterMutate={() => {}}
      />
    );
    expect(screen.getByText("LADS 2026")).toBeTruthy();
    expect(screen.getByText("Ski 2026")).toBeTruthy();
  });

  it("shows an empty state when there are no shared groups", async () => {
    const { trpc } = await import("@utils/trpc");
    (trpc.expenseShare.getEligibleTransferTargets.useQuery as any).mockReturnValueOnce(
      { data: [], isLoading: false }
    );
    render(
      <MoveDebtSheet
        open
        move={move}
        counterpartyUserId={2}
        counterpartyName="Sean"
        onOpenChange={() => {}}
        onAfterMutate={() => {}}
      />
    );
    expect(screen.getByText(/No shared groups with Sean/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test MoveDebtSheet`
Expected: FAIL — cannot find module `./MoveDebtSheet`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/components/features/Chat/MoveDebtSheet.tsx`:

```tsx
import { useCallback, useState } from "react";
import {
  Caption,
  Cell,
  Info,
  Modal,
  Section,
  Skeleton,
  Snackbar,
  Text,
} from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  popup,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { ArrowRight } from "lucide-react";
import { trpc } from "@utils/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { formatCurrencyWithCode } from "@/utils/financial";
import type { MoveParams } from "./deriveMoveParams";

interface MoveDebtSheetProps {
  open: boolean;
  move: MoveParams | null;
  counterpartyUserId: number;
  counterpartyName: string;
  onOpenChange: (open: boolean) => void;
  onAfterMutate: () => void;
}

export function MoveDebtSheet({
  open,
  move,
  counterpartyUserId,
  counterpartyName,
  onOpenChange,
  onAfterMutate,
}: MoveDebtSheetProps) {
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [pendingTargetId, setPendingTargetId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const targetsQuery = trpc.expenseShare.getEligibleTransferTargets.useQuery(
    {
      counterpartyUserId,
      sourceChatId: move?.sourceChatId ?? 0,
    },
    { enabled: open && move !== null }
  );

  const createTransfer = trpc.debtTransfer.createTransfer.useMutation({
    onSuccess: () => {
      // Mirrors the cache fan-out TransferDetailsModal's delete uses, plus the
      // sheet's own source query so the breakdown refreshes immediately.
      utils.debtTransfer.getAllByChat.invalidate();
      utils.currency.getCurrenciesWithBalance.invalidate();
      utils.chat.getBulkChatDebts.invalidate();
      utils.expenseShare.getMyBalancesAcrossChats.invalidate();
      utils.expenseShare.getMyCounterpartyBalances.invalidate();
      hapticFeedback.notificationOccurred.ifAvailable("success");
      onAfterMutate();
      onOpenChange(false);
    },
    onError: (e) => {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      setSnackbar(e.message || "Failed to move debt");
    },
  });

  const amountText = move
    ? formatCurrencyWithCode(move.amount, move.currency)
    : "";

  const handlePick = useCallback(
    async (target: { chatId: number; chatTitle: string }) => {
      if (!move) return;
      hapticFeedback.impactOccurred.ifAvailable("medium");
      const choice = await popup.open.ifAvailable({
        title: "Move this debt?",
        message: `Moves ${amountText} from "${move.sourceChatTitle}" to "${target.chatTitle}". Removes it here, adds it there.`,
        buttons: [
          { id: "move", type: "default", text: "Move" },
          { type: "cancel" },
        ],
      });
      if (choice !== "move") return;
      setPendingTargetId(target.chatId);
      try {
        await createTransfer.mutateAsync({
          sourceChatId: move.sourceChatId,
          targetChatId: target.chatId,
          debtorId: move.debtorId,
          creditorId: move.creditorId,
          amount: move.amount,
          currency: move.currency,
        });
      } catch {
        // surfaced by the mutation's onError snackbar
      } finally {
        setPendingTargetId(null);
      }
    },
    [move, amountText, createTransfer]
  );

  if (!move) {
    return (
      <Modal open={open} onOpenChange={onOpenChange}>
        <div />
      </Modal>
    );
  }

  const debtorLabel = move.callerOwes ? "You" : counterpartyName;
  const creditorLabel = move.callerOwes ? counterpartyName : "you";
  const targets = targetsQuery.data ?? [];

  return (
    <Modal
      header={<Modal.Header>Move debt</Modal.Header>}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex flex-col gap-y-2 pb-8">
        <Section header="Moving" className="px-3">
          <Cell
            before={<ChatMemberAvatar userId={move.debtorId} size={40} />}
            after={
              <Info subtitle="Amount" type="text">
                <Text weight="2">{amountText}</Text>
              </Info>
            }
            style={{ backgroundColor: tSectionBgColor }}
          >
            <Text weight="2">{debtorLabel}</Text>
            <div className="flex items-center gap-1 text-zinc-500">
              <ArrowRight size={14} />
              <Caption>{creditorLabel}</Caption>
            </div>
          </Cell>
          <Cell style={{ backgroundColor: tSectionBgColor }}>
            <Caption className="text-zinc-500">From</Caption>
            <Text weight="2">{move.sourceChatTitle}</Text>
          </Cell>
        </Section>

        <Section header="Move to" className="px-3">
          {targetsQuery.isLoading ? (
            <Cell>
              <Skeleton visible>
                <Text>Loading…</Text>
              </Skeleton>
            </Cell>
          ) : targets.length === 0 ? (
            <div className="flex h-16 items-center justify-center px-4">
              <Caption className="text-center text-gray-500" weight="1">
                No shared groups with {counterpartyName} to move this to.
              </Caption>
            </div>
          ) : (
            targets.map((t) => (
              <Cell
                key={t.chatId}
                onClick={() => handlePick(t)}
                after={
                  pendingTargetId === t.chatId ? (
                    <Skeleton visible>
                      <Text>…</Text>
                    </Skeleton>
                  ) : (
                    <ArrowRight size={16} className="text-zinc-400" />
                  )
                }
                style={{ backgroundColor: tSectionBgColor }}
              >
                <Text weight="2">{t.chatTitle}</Text>
              </Cell>
            ))
          )}
        </Section>

        {snackbar && (
          <Snackbar duration={3000} onClose={() => setSnackbar(null)}>
            {snackbar}
          </Snackbar>
        )}
      </div>
    </Modal>
  );
}

export default MoveDebtSheet;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test MoveDebtSheet`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no type errors. (If `createTransfer` input rejects an omitted `description`, pass `description: undefined` explicitly — it is optional in `inputSchema`.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/features/Chat/MoveDebtSheet.tsx \
        apps/web/src/components/features/Chat/MoveDebtSheet.test.tsx
git commit -m "feat(web): MoveDebtSheet modal for cross-group debt transfer"
```

---

### Task 4: Wire tappable breakdown rows into `CounterpartyBalanceSheet`

Make each per-chat+currency breakdown row open `MoveDebtSheet` with the derived params.

**Files:**
- Modify: `apps/web/src/components/features/Chat/CounterpartyBalanceSheet.tsx`

**Interfaces:**
- Consumes: `deriveMoveParams` (Task 2), `MoveDebtSheet` (Task 3). The sheet's existing `Counterparty.userId` is the counterparty; the caller id is the viewer.

The breakdown currently renders one `Cell` per chat with a stacked list of currency lines inside its `after`. To make each currency line individually tappable while preserving layout, render one `Cell` **per currency line** (keyed by `chatId+currency`), tappable when `deriveMoveParams` returns non-null.

- [ ] **Step 1: Get the caller's user id**

`CounterpartyBalanceSheet` does not currently know the viewer's id. Use the app's established convention — `useSignal(initData.user)` from `@telegram-apps/sdk-react` (the same pattern in `ChatMemberAvatar.tsx:19`, `AccountSubPage.tsx:31`, etc.).

Add `initData` to the existing `@telegram-apps/sdk-react` import, then in the component body:

```tsx
const tUser = useSignal(initData.user);
const callerId = Number(tUser?.id ?? 0);
```

`CounterpartyBalanceSheet` already imports `useSignal` and several `themeParams` signals, so only `initData` is the new named import.

- [ ] **Step 2: Add sheet state + import**

Near the other imports:

```tsx
import { MoveDebtSheet } from "./MoveDebtSheet";
import { deriveMoveParams, type MoveParams } from "./deriveMoveParams";
```

In the component body, alongside the other `useState`s:

```tsx
const [moveTarget, setMoveTarget] = useState<MoveParams | null>(null);
```

- [ ] **Step 3: Make breakdown currency lines tappable**

In the `byChat.map(...)` breakdown render, replace the per-chat `Cell` (the one whose `after` stacks `chat.currencies`) so each currency becomes its own tappable `Cell`. Replace the existing `byChat.map` block with:

```tsx
{byChat.flatMap((chat) =>
  chat.currencies.map((c) => {
    const params = deriveMoveParams(
      {
        chatId: c.chatId,
        chatTitle: c.chatTitle,
        currency: c.currency,
        nativeNet: c.nativeNet,
      },
      // counterparty.userId is the OTHER party; callerId is the viewer.
      counterparty.userId === callerId ? counterparty.userId : callerId,
      counterparty.userId
    );
    const canMove = params !== null;
    return (
      <Cell
        key={`${chat.chatId}-${c.currency}`}
        subhead={chat.chatTitle}
        onClick={
          canMove
            ? () => {
                hapticFeedback.impactOccurred.ifAvailable("light");
                setMoveTarget(params);
              }
            : undefined
        }
        after={
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-x-1">
              <span className="text-base">
                {currencyMap.get(c.currency)?.flagEmoji ?? "🌍"}
              </span>
              <Text className={cn(getBalanceColorClass(c.nativeNet))}>
                {c.nativeNet >= 0 ? "+ " : "− "}
                {formatCurrencyWithCode(Math.abs(c.nativeNet), c.currency)}
              </Text>
            </div>
            {c.currency !== baseCurrency && (
              <Caption style={{ color: tSubtitleColor }}>
                or {formatCurrencyWithCode(Math.abs(c.baseNet), baseCurrency)}
              </Caption>
            )}
          </div>
        }
      >
        {canMove ? "Move to another group" : " "}
      </Cell>
    );
  })
)}
```

Note: `callerId` derivation here just needs `params.debtorId/creditorId` to be the viewer vs counterparty — `deriveMoveParams` keys off the sign, so pass `callerId` as the first id arg and `counterparty.userId` as the second. Simplify the two-arg call to:

```tsx
const params = deriveMoveParams(
  { chatId: c.chatId, chatTitle: c.chatTitle, currency: c.currency, nativeNet: c.nativeNet },
  callerId,
  counterparty.userId
);
```

(Use this simpler form; the ternary above was defensive and is unnecessary.)

- [ ] **Step 4: Render the sheet**

Just before the closing `</Modal>` of `CounterpartyBalanceSheet` (or immediately after it, as a sibling), add:

```tsx
<MoveDebtSheet
  open={moveTarget !== null}
  move={moveTarget}
  counterpartyUserId={counterparty.userId}
  counterpartyName={counterparty.firstName}
  onOpenChange={(o) => !o && setMoveTarget(null)}
  onAfterMutate={onAfterMutate}
/>
```

- [ ] **Step 5: Typecheck + existing tests**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no type errors.

Run: `pnpm --filter web test Chat`
Expected: existing Chat tests still PASS; new `MoveDebtSheet` + `deriveMoveParams` PASS.

- [ ] **Step 6: Manual smoke (dev server)**

Run the TMA dev server, open a counterparty with a debt in at least two shared groups, tap a breakdown line → `MoveDebtSheet` opens → pick a target → confirm popup → success haptic + sheet closes + balance updates. (Detailed UAT handled separately per the team's manual-UAT flow.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/features/Chat/CounterpartyBalanceSheet.tsx
git commit -m "feat(web): tappable breakdown rows open MoveDebtSheet"
```

---

## Self-Review

**Spec coverage:**
- Entry point (tappable breakdown rows in `CounterpartyBalanceSheet`) → Task 4. ✅
- `MoveDebtSheet` modal (recap + tappable list + popup confirm, no inputs) → Task 3. ✅
- Full-amount-only, direction from sign → Task 2 (`deriveMoveParams`). ✅
- Pre-filtered eligible-target query → Task 1. ✅
- Cache invalidation matching delete fan-out + own source query → Task 3 `onSuccess`. ✅
- No note field, no amount input → Tasks 2/3 (no such fields). ✅
- Reuse existing create-notifications/delete/list → no task needed (backend untouched). ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code. Step 1 of Task 4 includes a verification grep because the viewer-id accessor must be matched to the app's actual pattern rather than assumed — the grep + "match its shape" instruction makes that concrete.

**Type consistency:** `MoveParams` defined in Task 2, consumed unchanged in Tasks 3 & 4. `getEligibleTransferTargets` output `{ chatId, chatTitle }` (Task 1) matches the `useQuery` mock and `targets.map` in Task 3. `createTransfer` payload matches `debtTransfer` `inputSchema` (`sourceChatId`, `targetChatId`, `debtorId`, `creditorId`, `amount`, `currency`, optional `description`).

**Open risk resolved:** Task 4 Step 1 viewer-id retrieval uses the app's established `useSignal(initData.user)` convention (verified against `ChatMemberAvatar.tsx:19` and Settings pages).
