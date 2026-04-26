# Snapshot Personal-Share Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the snapshot detail page's two breakdown views (Category, Date) so they sum to the current user's share — matching the "You spent" hero anchor. Drop the "By Payer" tab in both the mini app and the bot's group message.

**Architecture:** Data-layer change is the load-bearing one — `computeSnapshotAggregations` gains a `userShareInBase` field on each `NormalizedExpense`, filters expenses where that's zero out of the per-group `items`, drops groups that end up empty, and removes the `byPayer` output entirely. With the data shaped that way, `CategoryView` / `DateView` need only label and prop-name changes. `SnapshotExpenseRow` rewrites its right column to mirror `ChatExpenseCell` (date / red share / "share" caption). The bot message gets payer surgically removed: drop `"payer"` from `SNAPSHOT_VIEWS`, the `VIEW_BUTTONS` array, the renderer switches, and delete `groupByPayer`. The bot's grammy callback regex keeps `"payer"` so legacy in-history messages degrade with the existing "Could not switch view" toast instead of hanging.

**Tech Stack:** TypeScript, React, Vitest, `@telegram-apps/telegram-ui`, TanStack Router, tRPC, grammy, MarkdownV2.

**Spec:** `docs/superpowers/specs/2026-04-27-snapshot-personal-share-views-design.md`

---

## Branch context

- Already on branch `spec/snapshot-personal-share-views` (created during brainstorming).
- Spec already committed at `02f2319` ("docs(spec): snapshot personal-share aggregation views").
- All implementation tasks below land on this same branch on top of that commit.
- The branch will be renamed to `feat/snapshot-personal-share-views` and the PR title updated before merging (Task 9).

---

## File map (locked-in)

| File | Action |
|---|---|
| `apps/web/src/components/features/Snapshot/aggregations/computeSnapshotAggregations.ts` | edit — add `userShareInBase` per item, filter zero-share items, drop empty groups, remove `byPayer` output |
| `apps/web/src/components/features/Snapshot/aggregations/computeSnapshotAggregations.test.ts` | edit — drop byPayer test, update existing tests for filtered behaviour, add new tests |
| `apps/web/src/components/features/Snapshot/views/SnapshotExpenseRow.tsx` | rewrite — right column matches `ChatExpenseCell` (date / red share / "share" caption), prop `amountInBase` → `shareInBase` |
| `apps/web/src/components/features/Snapshot/views/CategoryView.tsx` | edit — section label adds "· your share", pass `shareInBase` to row |
| `apps/web/src/components/features/Snapshot/views/DateView.tsx` | edit — section label adds "· your share", pass `shareInBase` to row |
| `apps/web/src/components/features/Snapshot/SnapshotViewTabs.tsx` | edit — drop `"payer"` from `SNAPSHOT_VIEWS` and `VIEWS` |
| `apps/web/src/components/features/Snapshot/SnapshotFullPage.tsx` | edit — drop `PayerView` import + branch, coerce stale `view=payer` query param to `cat`, drop `onYourShareClick` arg |
| `apps/web/src/components/features/Snapshot/SnapshotHero.tsx` | edit — drop `onYourShareClick` prop and `Cell.onClick` |
| `apps/web/src/components/features/Snapshot/views/PayerView.tsx` | delete |
| `packages/trpc/src/routers/snapshot/shareSnapshotMessage.ts` | edit — drop `"payer"` from `SNAPSHOT_VIEWS`, `VIEW_BUTTONS`, `renderItemLine`, `renderBreakdown`, `legendFor`. Delete `groupByPayer`. |

No schema changes, no new tRPC procedures, no new routes. The `apps/bot/src/features/snapshotView.ts` callback regex deliberately stays as-is.

---

### Task 1: Data layer — `computeSnapshotAggregations`

**Files:**
- Modify: `apps/web/src/components/features/Snapshot/aggregations/computeSnapshotAggregations.ts`
- Modify: `apps/web/src/components/features/Snapshot/aggregations/computeSnapshotAggregations.test.ts`

We do this TDD. Tests first.

- [ ] **Step 1: Update existing tests for the new semantics**

Open `computeSnapshotAggregations.test.ts`. Apply these edits:

**(1a) Empty-snapshot test — drop the `byPayer` assertion:**

Find:

```ts
    expect(out.byCategory).toEqual([]);
    expect(out.byDate).toEqual([]);
    expect(out.byPayer).toEqual([]);
```

Replace with:

```ts
    expect(out.byCategory).toEqual([]);
    expect(out.byDate).toEqual([]);
```

**(1b) "groups by category" test — update expected totals to reflect user share:**

This test creates expenses where the user's share is half the expense (default `mkExpense` shares 20 evenly between userId 100 and 200). With `currentUserId: 100`, the user's share total per category becomes half the previous expectation. Find:

```ts
    expect(out.byCategory.map((g) => g.totalInBase)).toEqual([150, 80, 10]);
```

Replace with:

```ts
    // totalInBase now sums the current user's share, not the full expense:
    // food = 100/2 + 50/2 = 75, transport = 80/2 = 40, none = 10/2 = 5.
    expect(out.byCategory.map((g) => g.totalInBase)).toEqual([75, 40, 5]);
```

The `items` length expectation (2 in food) stays correct because the user has a share in every expense in this fixture.

**(1c) "groups by date" test — update expected totals:**

Find:

```ts
    expect(out.byDate[0]!.totalInBase).toBe(30);
    expect(out.byDate[1]!.date.getDate()).toBe(7);
    expect(out.byDate[1]!.totalInBase).toBe(50);
```

Replace with:

```ts
    // totalInBase now sums the user's share — half of each expense.
    expect(out.byDate[0]!.totalInBase).toBe(15);
    expect(out.byDate[1]!.date.getDate()).toBe(7);
    expect(out.byDate[1]!.totalInBase).toBe(25);
```

**(1d) Delete the entire "groups by payer" test:**

Find and delete the whole `it("groups by payer, sorted desc by total", () => { ... });` block (lines 173–209 in the current file). The `byPayer` field is removed from the output.

**(1e) Add three new tests at the end of the `describe` block (just before its closing `});`):**

```ts
  it("attaches userShareInBase to each normalized expense", () => {
    const out = computeSnapshotAggregations({
      details: asDetails({
        ...BASE_DETAILS,
        expenses: [
          mkExpense({
            id: "e1",
            amount: 30,
            shares: [
              {
                userId: 100,
                amount: 12,
                user: { id: 100, firstName: "Alice" },
              },
              { userId: 200, amount: 18, user: { id: 200, firstName: "Bob" } },
            ],
          }),
        ],
      }),
      rates: {},
      baseCurrency: "SGD",
      currentUserId: 100,
      chatCategories: [],
    });

    expect(out.byCategory).toHaveLength(1);
    expect(out.byCategory[0]!.items[0]!.userShareInBase).toBeCloseTo(12, 2);
  });

  it("filters expenses where the user has zero share out of group items", () => {
    const out = computeSnapshotAggregations({
      details: asDetails({
        ...BASE_DETAILS,
        expenses: [
          // User 100 is in this one
          mkExpense({
            id: "e1",
            categoryId: "base:food",
            amount: 20,
            shares: [
              {
                userId: 100,
                amount: 10,
                user: { id: 100, firstName: "Alice" },
              },
              { userId: 200, amount: 10, user: { id: 200, firstName: "Bob" } },
            ],
          }),
          // User 100 is NOT in this one
          mkExpense({
            id: "e2",
            categoryId: "base:food",
            amount: 50,
            shares: [
              { userId: 200, amount: 50, user: { id: 200, firstName: "Bob" } },
            ],
          }),
        ],
      }),
      rates: {},
      baseCurrency: "SGD",
      currentUserId: 100,
      chatCategories: [],
    });

    expect(out.byCategory).toHaveLength(1);
    expect(out.byCategory[0]!.items).toHaveLength(1);
    expect(out.byCategory[0]!.items[0]!.id).toBe("e1");
    expect(out.byCategory[0]!.totalInBase).toBeCloseTo(10, 2);
  });

  it("drops categories and dates where the user has no share at all", () => {
    const out = computeSnapshotAggregations({
      details: asDetails({
        ...BASE_DETAILS,
        expenses: [
          // User 100 is in this expense in food category
          mkExpense({
            id: "e1",
            categoryId: "base:food",
            date: new Date("2026-04-05"),
            amount: 20,
            shares: [
              {
                userId: 100,
                amount: 10,
                user: { id: 100, firstName: "Alice" },
              },
              { userId: 200, amount: 10, user: { id: 200, firstName: "Bob" } },
            ],
          }),
          // User 100 NOT in this transport expense, different day
          mkExpense({
            id: "e2",
            categoryId: "base:transport",
            date: new Date("2026-04-07"),
            amount: 50,
            shares: [
              { userId: 200, amount: 50, user: { id: 200, firstName: "Bob" } },
            ],
          }),
        ],
      }),
      rates: {},
      baseCurrency: "SGD",
      currentUserId: 100,
      chatCategories: [],
    });

    // Transport category has no user share → dropped
    expect(out.byCategory).toHaveLength(1);
    expect(out.byCategory[0]!.key).toBe("base:food");
    // 7 Apr has no user share → dropped
    expect(out.byDate).toHaveLength(1);
    expect(out.byDate[0]!.date.getDate()).toBe(5);
  });
```

- [ ] **Step 2: Run the tests — confirm they fail**

Run: `pnpm --filter web exec vitest run src/components/features/Snapshot/aggregations/computeSnapshotAggregations.test.ts`

Expected: failures from the existing tests (totals mismatch — they used to be full expense totals, now expect user shares) and the three new tests (`userShareInBase` is undefined on `NormalizedExpense`, byCategory/byDate haven't been filtered).

- [ ] **Step 3: Update the production file**

Open `computeSnapshotAggregations.ts`. Apply these edits in order:

**(3a) Extend the `NormalizedExpense` type:**

Replace lines 8–19:

```ts
type NormalizedExpense = {
  id: string;
  description: string;
  date: Date;
  amountInBase: number;
  currency: string;
  payerId: number;
  payer: { id: number; firstName: string };
  categoryKey: string;
  categoryEmoji: string;
  categoryTitle: string;
};
```

with:

```ts
type NormalizedExpense = {
  id: string;
  description: string;
  date: Date;
  amountInBase: number;
  /**
   * The current user's share for this expense in base currency.
   * `0` when the user is not a participant — such items are filtered
   * out of the per-group `items` arrays before they reach the views.
   */
  userShareInBase: number;
  currency: string;
  payerId: number;
  payer: { id: number; firstName: string };
  categoryKey: string;
  categoryEmoji: string;
  categoryTitle: string;
};
```

**(3b) Delete the `PayerGroup` type:**

Delete lines 36–41:

```ts
export type PayerGroup = {
  payerId: number;
  payer: { id: number; firstName: string };
  totalInBase: number;
  items: NormalizedExpense[];
};
```

**(3c) Drop `byPayer` from the `SnapshotAggregations` type:**

Replace:

```ts
export type SnapshotAggregations = {
  details: SnapshotDetails;
  baseCurrency: string;
  totalInBase: number;
  dateRange: { earliest: Date; latest: Date } | null;
  userShareInBase: number;
  byCategory: CategoryGroup[];
  byDate: DateGroup[];
  byPayer: PayerGroup[];
};
```

with:

```ts
export type SnapshotAggregations = {
  details: SnapshotDetails;
  baseCurrency: string;
  totalInBase: number;
  dateRange: { earliest: Date; latest: Date } | null;
  userShareInBase: number;
  byCategory: CategoryGroup[];
  byDate: DateGroup[];
};
```

**(3d) Update the `CategoryGroup` and `DateGroup` JSDoc-style comments to reflect the new semantics. Replace lines 21–34:**

```ts
export type CategoryGroup = {
  key: string;
  emoji: string;
  title: string;
  totalInBase: number;
  items: NormalizedExpense[];
};

export type DateGroup = {
  key: string;
  date: Date;
  totalInBase: number;
  items: NormalizedExpense[];
};
```

with:

```ts
export type CategoryGroup = {
  key: string;
  emoji: string;
  title: string;
  /** Sum of the current user's share across `items`, in base currency. */
  totalInBase: number;
  /** Only expenses where `userShareInBase > 0`. */
  items: NormalizedExpense[];
};

export type DateGroup = {
  key: string;
  date: Date;
  /** Sum of the current user's share across `items`, in base currency. */
  totalInBase: number;
  /** Only expenses where `userShareInBase > 0`. */
  items: NormalizedExpense[];
};
```

**(3e) In the main loop, set `userShareInBase` on each normalized expense.** Replace the existing block (lines 82–108):

```ts
  for (const expense of details.expenses) {
    const rate =
      expense.currency === baseCurrency
        ? 1
        : (rates[expense.currency]?.rate ?? 1);
    const amountInBase = Number(expense.amount) / rate;
    totalInBase += amountInBase;

    const userShare = expense.shares.find((s) => s.userId === currentUserId);
    if (userShare?.amount != null) {
      userShareInBase += Number(userShare.amount) / rate;
    }

    const resolved = resolveCategory(expense.categoryId, chatCategories);
    normalized.push({
      id: expense.id,
      description: expense.description,
      date: new Date(expense.date),
      amountInBase,
      currency: expense.currency,
      payerId: expense.payerId,
      payer: expense.payer,
      categoryKey: resolved?.id ?? "__none__",
      categoryEmoji: resolved?.emoji ?? "❓",
      categoryTitle: resolved?.title ?? "Uncategorized",
    });
  }
```

with:

```ts
  for (const expense of details.expenses) {
    const rate =
      expense.currency === baseCurrency
        ? 1
        : (rates[expense.currency]?.rate ?? 1);
    const amountInBase = Number(expense.amount) / rate;
    totalInBase += amountInBase;

    const userShare = expense.shares.find((s) => s.userId === currentUserId);
    const expenseUserShareInBase =
      userShare?.amount != null ? Number(userShare.amount) / rate : 0;
    userShareInBase += expenseUserShareInBase;

    const resolved = resolveCategory(expense.categoryId, chatCategories);
    normalized.push({
      id: expense.id,
      description: expense.description,
      date: new Date(expense.date),
      amountInBase,
      userShareInBase: expenseUserShareInBase,
      currency: expense.currency,
      payerId: expense.payerId,
      payer: expense.payer,
      categoryKey: resolved?.id ?? "__none__",
      categoryEmoji: resolved?.emoji ?? "❓",
      categoryTitle: resolved?.title ?? "Uncategorized",
    });
  }
```

**(3f) Rewrite the category grouping block** to filter zero-share items and use user-share totals. Replace lines 119–141 (the `// Group by category` section):

```ts
  // Group by category — sorted desc by total; items sorted date desc
  const catMap = new Map<string, CategoryGroup>();
  for (const item of normalized) {
    const existing = catMap.get(item.categoryKey);
    if (existing) {
      existing.items.push(item);
      existing.totalInBase += item.amountInBase;
    } else {
      catMap.set(item.categoryKey, {
        key: item.categoryKey,
        emoji: item.categoryEmoji,
        title: item.categoryTitle,
        totalInBase: item.amountInBase,
        items: [item],
      });
    }
  }
  const byCategory = [...catMap.values()].sort(
    (a, b) => b.totalInBase - a.totalInBase
  );
  for (const g of byCategory) {
    g.items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
```

with:

```ts
  // Group by category — only includes expenses where the user has a
  // share. Group total = sum of user shares. Empty groups dropped.
  // Sorted desc by user-share total; items sorted date desc.
  const catMap = new Map<string, CategoryGroup>();
  for (const item of normalized) {
    if (item.userShareInBase <= 0) continue;
    const existing = catMap.get(item.categoryKey);
    if (existing) {
      existing.items.push(item);
      existing.totalInBase += item.userShareInBase;
    } else {
      catMap.set(item.categoryKey, {
        key: item.categoryKey,
        emoji: item.categoryEmoji,
        title: item.categoryTitle,
        totalInBase: item.userShareInBase,
        items: [item],
      });
    }
  }
  const byCategory = [...catMap.values()].sort(
    (a, b) => b.totalInBase - a.totalInBase
  );
  for (const g of byCategory) {
    g.items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
```

**(3g) Rewrite the date grouping block.** Replace lines 143–165 (the `// Group by calendar day` section):

```ts
  // Group by calendar day — sorted asc; items sorted amount desc
  const dateMap = new Map<string, DateGroup>();
  for (const item of normalized) {
    const key = dayKey(item.date);
    const existing = dateMap.get(key);
    if (existing) {
      existing.items.push(item);
      existing.totalInBase += item.amountInBase;
    } else {
      dateMap.set(key, {
        key,
        date: dayDate(item.date),
        totalInBase: item.amountInBase,
        items: [item],
      });
    }
  }
  const byDate = [...dateMap.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  for (const g of byDate) {
    g.items.sort((a, b) => b.amountInBase - a.amountInBase);
  }
```

with:

```ts
  // Group by calendar day — only includes expenses where the user has
  // a share. Group total = sum of user shares. Empty days dropped.
  // Sorted asc by date; items sorted by user-share desc within a day.
  const dateMap = new Map<string, DateGroup>();
  for (const item of normalized) {
    if (item.userShareInBase <= 0) continue;
    const key = dayKey(item.date);
    const existing = dateMap.get(key);
    if (existing) {
      existing.items.push(item);
      existing.totalInBase += item.userShareInBase;
    } else {
      dateMap.set(key, {
        key,
        date: dayDate(item.date),
        totalInBase: item.userShareInBase,
        items: [item],
      });
    }
  }
  const byDate = [...dateMap.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  for (const g of byDate) {
    g.items.sort((a, b) => b.userShareInBase - a.userShareInBase);
  }
```

**(3h) Delete the entire payer grouping block** — lines 167–188 (everything from `// Group by payer` through the `for (const g of byPayer)` loop).

**(3i) Drop `byPayer` from the return statement.** Replace:

```ts
  return {
    details,
    baseCurrency,
    totalInBase,
    dateRange,
    userShareInBase,
    byCategory,
    byDate,
    byPayer,
  };
```

with:

```ts
  return {
    details,
    baseCurrency,
    totalInBase,
    dateRange,
    userShareInBase,
    byCategory,
    byDate,
  };
```

- [ ] **Step 4: Re-run the unit tests — confirm they pass**

Run: `pnpm --filter web exec vitest run src/components/features/Snapshot/aggregations/computeSnapshotAggregations.test.ts`

Expected: all tests pass (10 specs).

- [ ] **Step 5: Run typecheck on the web app**

Run: `pnpm --filter web exec tsc --noEmit`

Expected: errors in `PayerView.tsx` (consumes `byPayer` which no longer exists) and `SnapshotFullPage.tsx` (passes `onYourShareClick`). These are addressed in later tasks. Note them and move on.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/features/Snapshot/aggregations/computeSnapshotAggregations.ts apps/web/src/components/features/Snapshot/aggregations/computeSnapshotAggregations.test.ts
git commit -m "$(cat <<'EOF'
feat(snapshot): aggregate by user share and drop byPayer output

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rewrite `SnapshotExpenseRow` to mirror `ChatExpenseCell`

**Files:**
- Modify: `apps/web/src/components/features/Snapshot/views/SnapshotExpenseRow.tsx`

The right column changes from a single full-amount line to: date / red share amount / "share" caption.

- [ ] **Step 1: Replace the file contents**

Open `apps/web/src/components/features/Snapshot/views/SnapshotExpenseRow.tsx` and replace the entire contents with:

```tsx
import { Caption, Cell, Text } from "@telegram-apps/telegram-ui";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatCurrencyWithCode } from "@/utils/financial";

type RowItem = {
  id: string;
  description: string;
  date: Date;
  shareInBase: number;
  payer: { firstName: string };
  categoryEmoji: string;
};

interface SnapshotExpenseRowProps {
  item: RowItem;
  baseCurrency: string;
  /**
   * Override the default category-emoji box in the `before` slot.
   */
  before?: React.ReactNode;
}

/**
 * Shared expense row for the grouped lists inside Category/Date views.
 * Right column mirrors ChatExpenseCell: date / red share amount /
 * "share" caption.
 */
export function SnapshotExpenseRow({
  item,
  baseCurrency,
  before,
}: SnapshotExpenseRowProps) {
  const defaultBefore = (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-xl leading-none">
      {item.categoryEmoji || "❓"}
    </div>
  );

  return (
    <Cell
      before={before ?? defaultBefore}
      subhead={
        <Caption weight="1" level="1">
          {item.payer.firstName} spent
        </Caption>
      }
      description={item.description}
      after={
        <div className="flex flex-col items-end gap-0.5">
          <Caption weight="2" className="w-max shrink-0">
            {format(item.date, "d MMM yyyy")}
          </Caption>
          <Text
            weight="3"
            className={cn(item.shareInBase > 0 && "text-red-600")}
          >
            {formatCurrencyWithCode(item.shareInBase, baseCurrency)}
          </Text>
          <Caption className="w-max">share</Caption>
        </div>
      }
    >
      {/* The Cell body slot is intentionally empty — all amount info
          now lives in the `after` column to mirror ChatExpenseCell. */}
      <span />
    </Cell>
  );
}
```

Note the `cn` import path — the rest of the codebase imports it from `@/lib/utils`. If your search reveals a different path on this branch, use that one.

- [ ] **Step 2: Verify the import path**

Run: `grep -r 'from "@/lib/utils"' apps/web/src/components/features/Chat/ChatExpenseCell.tsx`

Expected: at least one match (the file already imports `cn` this way). If no match appears, search for `cn` imports in `apps/web/src` and use whatever path the existing code uses.

- [ ] **Step 3: Don't run typecheck yet** — `CategoryView` and `DateView` still pass `amountInBase` to this component. They're updated in the next two tasks. Move on.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Snapshot/views/SnapshotExpenseRow.tsx
git commit -m "$(cat <<'EOF'
feat(snapshot): mirror ChatExpenseCell layout in row right column

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Update `CategoryView`

**Files:**
- Modify: `apps/web/src/components/features/Snapshot/views/CategoryView.tsx`

- [ ] **Step 1: Update the file**

Two changes: pass `shareInBase` (sourced from the new `userShareInBase` field) into the row, and update the section header copy.

Find:

```tsx
      <Section header="By category">
```

Replace with:

```tsx
      <Section header="By category · your share">
```

Find the rendered row block:

```tsx
          {group.items.map((item) => (
            <SnapshotExpenseRow
              key={item.id}
              item={item}
              baseCurrency={baseCurrency}
            />
          ))}
```

Replace with:

```tsx
          {group.items.map((item) => (
            <SnapshotExpenseRow
              key={item.id}
              item={{
                id: item.id,
                description: item.description,
                date: item.date,
                shareInBase: item.userShareInBase,
                payer: item.payer,
                categoryEmoji: item.categoryEmoji,
              }}
              baseCurrency={baseCurrency}
            />
          ))}
```

The bar chart and group-header math don't need changes — `group.totalInBase` already means user-share total after Task 1.

- [ ] **Step 2: Run typecheck on the web app**

Run: `pnpm --filter web exec tsc --noEmit`

Expected: still errors in `DateView`, `PayerView`, and `SnapshotFullPage`. `CategoryView` itself should be clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Snapshot/views/CategoryView.tsx
git commit -m "$(cat <<'EOF'
feat(snapshot): use user share in CategoryView rows + section label

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Update `DateView`

**Files:**
- Modify: `apps/web/src/components/features/Snapshot/views/DateView.tsx`

- [ ] **Step 1: Update the file**

Find:

```tsx
      <Section header="By date">
```

Replace with:

```tsx
      <Section header="By date · your share">
```

Find:

```tsx
          {group.items.map((item) => (
            <SnapshotExpenseRow
              key={item.id}
              item={item}
              baseCurrency={baseCurrency}
            />
          ))}
```

Replace with:

```tsx
          {group.items.map((item) => (
            <SnapshotExpenseRow
              key={item.id}
              item={{
                id: item.id,
                description: item.description,
                date: item.date,
                shareInBase: item.userShareInBase,
                payer: item.payer,
                categoryEmoji: item.categoryEmoji,
              }}
              baseCurrency={baseCurrency}
            />
          ))}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter web exec tsc --noEmit`

Expected: errors only in `PayerView.tsx` and `SnapshotFullPage.tsx`. `DateView` itself should be clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Snapshot/views/DateView.tsx
git commit -m "$(cat <<'EOF'
feat(snapshot): use user share in DateView rows + section label

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Drop "payer" from `SnapshotViewTabs`

**Files:**
- Modify: `apps/web/src/components/features/Snapshot/SnapshotViewTabs.tsx`

- [ ] **Step 1: Update the file**

Find lines 4–5:

```ts
export const SNAPSHOT_VIEWS = ["cat", "date", "payer"] as const;
export type SnapshotView = (typeof SNAPSHOT_VIEWS)[number];
```

Replace with:

```ts
export const SNAPSHOT_VIEWS = ["cat", "date"] as const;
export type SnapshotView = (typeof SNAPSHOT_VIEWS)[number];
```

Find lines 12–16:

```ts
const VIEWS: Array<{ id: SnapshotView; label: string }> = [
  { id: "cat", label: "📋 Category" },
  { id: "date", label: "📅 Date" },
  { id: "payer", label: "👤 Payer" },
];
```

Replace with:

```ts
const VIEWS: Array<{ id: SnapshotView; label: string }> = [
  { id: "cat", label: "📋 Category" },
  { id: "date", label: "📅 Date" },
];
```

- [ ] **Step 2: Don't run typecheck yet** — `PayerView` and `SnapshotFullPage` still reference the dropped view. Cleared in Tasks 6 and 7.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Snapshot/SnapshotViewTabs.tsx
git commit -m "$(cat <<'EOF'
feat(snapshot): drop Payer tab from SnapshotViewTabs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `SnapshotFullPage` and `SnapshotHero` — drop the payer wiring

**Files:**
- Modify: `apps/web/src/components/features/Snapshot/SnapshotFullPage.tsx`
- Modify: `apps/web/src/components/features/Snapshot/SnapshotHero.tsx`

- [ ] **Step 1: Update `SnapshotFullPage.tsx`**

Apply three edits:

**(1a) Drop the `PayerView` import.** Find:

```tsx
import { CategoryView } from "./views/CategoryView";
import { DateView } from "./views/DateView";
import { PayerView } from "./views/PayerView";
```

Replace with:

```tsx
import { CategoryView } from "./views/CategoryView";
import { DateView } from "./views/DateView";
```

**(1b) Coerce stale `view=payer` to `cat`.** Find:

```tsx
  const view = (search.view ?? "cat") as SnapshotView;
```

Replace with:

```tsx
  // Defensively coerce stale `view=payer` query params (from deep-links
  // that predate this change) so they don't fall through to the
  // default branch as a string that doesn't match either view.
  const rawView = search.view ?? "cat";
  const view: SnapshotView = rawView === "date" ? "date" : "cat";
```

**(1c) Drop the `onYourShareClick` argument and the `PayerView` render branch.** Find:

```tsx
      <SnapshotHero
        aggregations={aggregations}
        onYourShareClick={() => handleTabChange("payer")}
      />
      <SnapshotViewTabs value={view} onChange={handleTabChange} />
      {view === "cat" && <CategoryView aggregations={aggregations} />}
      {view === "date" && <DateView aggregations={aggregations} />}
      {view === "payer" && <PayerView aggregations={aggregations} />}
```

Replace with:

```tsx
      <SnapshotHero aggregations={aggregations} />
      <SnapshotViewTabs value={view} onChange={handleTabChange} />
      {view === "cat" && <CategoryView aggregations={aggregations} />}
      {view === "date" && <DateView aggregations={aggregations} />}
```

- [ ] **Step 2: Update `SnapshotHero.tsx`**

Drop the optional `onYourShareClick` prop and the `Cell.onClick` it powered.

Find lines 8–11:

```tsx
interface SnapshotHeroProps {
  aggregations: SnapshotAggregations;
  onYourShareClick?: () => void;
}
```

Replace with:

```tsx
interface SnapshotHeroProps {
  aggregations: SnapshotAggregations;
}
```

Find lines 21–27:

```tsx
export function SnapshotHero({
  aggregations,
  onYourShareClick,
}: SnapshotHeroProps) {
  const { details, baseCurrency, totalInBase, dateRange, userShareInBase } =
    aggregations;
```

Replace with:

```tsx
export function SnapshotHero({ aggregations }: SnapshotHeroProps) {
  const { details, baseCurrency, totalInBase, dateRange, userShareInBase } =
    aggregations;
```

Find:

```tsx
          <Cell
            onClick={onYourShareClick}
            before={
```

Replace with:

```tsx
          <Cell
            before={
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter web exec tsc --noEmit`

Expected: only errors remaining are inside `PayerView.tsx` (still references `byPayer`). That file is deleted next.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Snapshot/SnapshotFullPage.tsx apps/web/src/components/features/Snapshot/SnapshotHero.tsx
git commit -m "$(cat <<'EOF'
feat(snapshot): drop Payer view wiring from SnapshotFullPage and Hero

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Delete `PayerView.tsx`

**Files:**
- Delete: `apps/web/src/components/features/Snapshot/views/PayerView.tsx`

- [ ] **Step 1: Delete the file**

```bash
git rm apps/web/src/components/features/Snapshot/views/PayerView.tsx
```

- [ ] **Step 2: Search for any lingering references**

Run: `grep -rn "PayerView\|byPayer" apps/web/src packages/trpc/src 2>/dev/null`

Expected: no matches. If anything turns up, address it before committing.

- [ ] **Step 3: Run web typecheck**

Run: `pnpm --filter web exec tsc --noEmit`

Expected: clean (no errors).

- [ ] **Step 4: Run web lint**

Run: `pnpm --filter web exec eslint . --max-warnings 0`

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(snapshot): delete PayerView component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Bot — drop "payer" from the snapshot share message

**Files:**
- Modify: `packages/trpc/src/routers/snapshot/shareSnapshotMessage.ts`

The bot message stays group-targeted (totals, not personal share). Only "payer" goes away — keyboard button, render branch, and helper.

- [ ] **Step 1: Update `SNAPSHOT_VIEWS`**

Find line 26:

```ts
export const SNAPSHOT_VIEWS = ["cat", "date", "payer"] as const;
```

Replace with:

```ts
export const SNAPSHOT_VIEWS = ["cat", "date"] as const;
```

- [ ] **Step 2: Drop `groupByPayer`**

Delete the entire `groupByPayer` function — currently lines 465–497 (everything from `function groupByPayer(ctx: SnapshotContext): GroupedBreakdown[] {` through its closing `}`).

- [ ] **Step 3: Update `renderItemLine`**

Find the switch in `renderItemLine` — currently lines 513–525:

```ts
  switch (view) {
    case "cat":
      // Category + date views drop the payer per-row: payer info is
      // already in the Shares block above, and including it here
      // pushes lines past mobile wrap width on long descriptions.
      return `>${prefix} ${desc} · ${amt} · ${dateStr}`;
    case "date":
      return `>${prefix} ${desc} · ${amt} · ${catEmoji}`;
    case "payer":
      // Payer *is* the group header here, so payer doesn't appear in
      // the row anyway — we keep category_emoji for context.
      return `>${prefix} ${desc} · ${amt} · ${dateStr} · ${catEmoji}`;
  }
```

Replace with:

```ts
  switch (view) {
    case "cat":
      // Category + date views drop the payer per-row: payer info is
      // already in the Shares block above, and including it here
      // pushes lines past mobile wrap width on long descriptions.
      return `>${prefix} ${desc} · ${amt} · ${dateStr}`;
    case "date":
      return `>${prefix} ${desc} · ${amt} · ${catEmoji}`;
  }
```

The `payerLabel` local variable is now unused — verify the previous `case "payer"` branch was the only consumer of `mentionFor(item.payerId, payer)`. If so, delete the `const payer = ctx.memberMap.get(item.payerId);` and `const payerLabel = mentionFor(item.payerId, payer);` lines (lines 508–509). Run `tsc --noEmit` after to confirm nothing else breaks.

- [ ] **Step 4: Update `renderBreakdown`**

Find lines 528–534:

```ts
function renderBreakdown(ctx: SnapshotContext, view: SnapshotView): string[] {
  const groups =
    view === "cat"
      ? groupByCategory(ctx)
      : view === "date"
        ? groupByDate(ctx)
        : groupByPayer(ctx);
```

Replace with:

```ts
function renderBreakdown(ctx: SnapshotContext, view: SnapshotView): string[] {
  const groups = view === "cat" ? groupByCategory(ctx) : groupByDate(ctx);
```

- [ ] **Step 5: Update `legendFor`**

Find lines 579–588:

```ts
function legendFor(view: SnapshotView): string {
  switch (view) {
    case "cat":
      return `📋 *Expenses by category*`;
    case "date":
      return `📋 *Expenses by date*`;
    case "payer":
      return `📋 *Expenses by payer*`;
  }
}
```

Replace with:

```ts
function legendFor(view: SnapshotView): string {
  switch (view) {
    case "cat":
      return `📋 *Expenses by category*`;
    case "date":
      return `📋 *Expenses by date*`;
  }
}
```

- [ ] **Step 6: Update `VIEW_BUTTONS`**

Find lines 592–596:

```ts
const VIEW_BUTTONS: Array<{ view: SnapshotView; label: string }> = [
  { view: "cat", label: "📋 Category" },
  { view: "date", label: "📅 Date" },
  { view: "payer", label: "👤 Payer" },
];
```

Replace with:

```ts
const VIEW_BUTTONS: Array<{ view: SnapshotView; label: string }> = [
  { view: "cat", label: "📋 Category" },
  { view: "date", label: "📅 Date" },
];
```

- [ ] **Step 7: Confirm no more "payer" references in this file**

Run: `grep -n "payer" packages/trpc/src/routers/snapshot/shareSnapshotMessage.ts`

Expected: only matches in the surviving `payerId` field type and in code that loops over `expense.payerId` to populate `memberMap` (those are about the underlying expense record, not about the dropped Payer view). No matches against `"payer"` as a string literal, `groupByPayer`, or `Payer` as a SnapshotView option.

- [ ] **Step 8: Run typecheck on the trpc package**

Run: `pnpm --filter @dko/trpc exec tsc --noEmit`

Expected: clean.

- [ ] **Step 9: Run typecheck on bot + lambda (downstream consumers)**

Run: `pnpm --filter bot exec tsc --noEmit && pnpm --filter lambda exec tsc --noEmit`

Expected: clean. The bot's grammy callback regex still hardcodes `(cat|date|payer)` — that's deliberate (legacy callbacks degrade gracefully via the existing try/catch in `apps/bot/src/features/snapshotView.ts`).

- [ ] **Step 10: Run the preview script as a sanity check**

The preview script iterates `SNAPSHOT_VIEWS`, so it should now print only Category and Date sections, with a 2-button keyboard (plus the View Snapshot deep-link).

Run: `pnpm --filter lambda exec tsx ../../scripts/preview-snapshot-share.ts`

Expected: two `========== VIEW: cat ==========` and `========== VIEW: date ==========` blocks, each with an inline keyboard row showing only `[✓ 📋 Category] [📅 Date]` (or the inverse, depending on which is active). No "Payer" button.

If the script fails because of missing env (`.env`), skip this step and rely on UAT later.

- [ ] **Step 11: Commit**

```bash
git add packages/trpc/src/routers/snapshot/shareSnapshotMessage.ts
git commit -m "$(cat <<'EOF'
feat(bot): drop Payer view from snapshot share message

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Final verification, branch rename, push, PR retitle

**Files:**
- None (git/CLI work only)

- [ ] **Step 1: Repo-wide final typecheck**

Run: `pnpm -w exec turbo run typecheck`

Expected: clean across all packages. (If `typecheck` isn't a turbo task in this repo, fall back to per-package: `pnpm --filter web exec tsc --noEmit`, `pnpm --filter @dko/trpc exec tsc --noEmit`, `pnpm --filter bot exec tsc --noEmit`.)

- [ ] **Step 2: Repo-wide test run**

Run: `pnpm -w exec turbo run test`

Expected: clean. Pay attention to the `computeSnapshotAggregations` specs.

- [ ] **Step 3: Repo-wide lint**

Run: `pnpm -w exec turbo run lint`

Expected: clean.

- [ ] **Step 4: Final grep for stale references**

Run: `grep -rn "PayerView\|byPayer\|groupByPayer" apps packages 2>/dev/null`

Expected: no matches. (The bot's `apps/bot/src/features/snapshotView.ts` regex still mentions `payer` as a literal — that's intentional and preserved on purpose.)

- [ ] **Step 5: Rename the branch**

```bash
git branch -m spec/snapshot-personal-share-views feat/snapshot-personal-share-views
git push origin :spec/snapshot-personal-share-views feat/snapshot-personal-share-views
git push -u origin feat/snapshot-personal-share-views
```

- [ ] **Step 6: Retitle and update the PR**

```bash
gh pr edit 274 --title "feat(snapshot): personal-share views + drop By Payer"
```

Then update the PR body to add an "Implementation" section. Replace the existing test-plan checklist with one that reflects what's been done. Use:

```bash
gh pr edit 274 --body "$(cat <<'EOF'
## Summary

- Snapshot detail page (TMA): By Category and By Date breakdowns now sum to the user's share — matching the "You spent" hero anchor. Per-row layout mirrors `ChatExpenseCell` (date / red share / "share" caption). Zero-share rows and empty groups are filtered out.
- Bot snapshot share message: Payer toggle button removed; group-level totals stay (correct for a group-targeted message). The "🧾 Shares" section is unchanged.

Spec: [`docs/superpowers/specs/2026-04-27-snapshot-personal-share-views-design.md`](docs/superpowers/specs/2026-04-27-snapshot-personal-share-views-design.md)
Plan: [`docs/superpowers/plans/2026-04-27-snapshot-personal-share-views.md`](docs/superpowers/plans/2026-04-27-snapshot-personal-share-views.md)

## Manual UAT (mini app)

- [ ] Open a snapshot where you have share in some but not all expenses. Bars in Category and Date both sum to "You spent".
- [ ] Per-row right column: date / red share amount / "share" caption.
- [ ] Categories you weren't in (zero share) don't appear at all.
- [ ] Group counts say e.g. "5", not "20", when 5 of 20 are yours.
- [ ] Tabs show only Category / Date — no Payer chip.
- [ ] Stale URL `?view=payer` lands on Category, no error.

## Manual UAT (bot)

- [ ] Create a snapshot from the mini app — bot posts to group with a 2-button keyboard (Category, Date) + View Snapshot deep-link.
- [ ] Toggle between Category and Date — both render. "🧾 Shares" section appears in both.
- [ ] Old pre-change snapshot message in chat history: pressing legacy Payer button doesn't crash bot; pressing Category or Date works.

@claude please review against the spec in `docs/superpowers/specs/2026-04-27-snapshot-personal-share-views-design.md`. Verdict: READY / NEEDS CHANGES / UNCERTAIN.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Mark final task done**

Once all checkboxes above are ticked, this plan is complete. The PR is ready for the user's UAT pass.

---

## Notes for the implementer

- The `apps/bot/src/features/snapshotView.ts` callback regex deliberately retains `(cat|date|payer)`. Don't "fix" it — see the spec's "Bot listener" section for the rationale (legacy in-history messages).
- If anywhere along the way the `cn` import path differs from `@/lib/utils`, prefer the project's existing convention. Don't introduce a new one.
- `mentionFor` and `mentionMarkdown` may now be unused in `shareSnapshotMessage.ts` after `groupByPayer` and the per-row payer label are removed. Check with `grep -n "mentionFor\|mentionMarkdown" packages/trpc/src/routers/snapshot/shareSnapshotMessage.ts` — they're still used by `renderShares` and the creator-mention block, so they stay. Don't remove them.
- The data layer change is the only one that's not safely reversible with a quick revert: it changes the *meaning* of `CategoryGroup.totalInBase` and `DateGroup.totalInBase` from "full expense total" to "user-share total". If anything outside the snapshot folder consumes those fields with the old meaning, this plan misses it. The grep in Task 7 Step 2 catches direct `byPayer` references but not `g.totalInBase` consumers in other modules. If the typecheck in Task 9 Step 1 reveals a surprise consumer, treat it as a found bug and pause before committing.
