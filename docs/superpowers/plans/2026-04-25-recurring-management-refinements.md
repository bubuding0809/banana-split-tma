# Recurring Expense Management Refinements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle five small UX fixes for the recurring-expense feature: (1) move the management entry to the Transactions tab, (2) relocate Convert currencies to the Balances tab, (3) make Schedule rendering status-aware, (4) add a Manage shortcut from the expense modal, (5) kill the silent no-op recurrence cell in the edit-expense form.

**Architecture:** Frontend refactor + relocation + gating. One backend Prisma `include` extends `getExpenseByChat` to return the linked template's `status`, which feeds badge gating and modal status branching. One component (`ConvertCurrenciesCell`) is extracted from `ChatTransactionTab` so it can mount on `ChatBalanceTab` without copy-paste. No new routes, no new mutations, no schema changes.

**Tech Stack:** Next.js / React / TanStack Router / TanStack Query / tRPC / Prisma / Telegram Mini Apps SDK / Telegram-UI / Tailwind / lucide-react.

**Branch + PR flow** (per repo convention): work on a feature branch — `feat/recurring-management-refinements` — and ship via squashed PR. Do not commit to main directly. Do **not** arm auto-merge until UAT signoff (the user runs the full-environment lifecycle).

**Spec:** [docs/superpowers/specs/2026-04-25-recurring-management-refinements-design.md](../specs/2026-04-25-recurring-management-refinements-design.md)
**Deck:** [docs/superpowers/specs/2026-04-25-recurring-management-refinements-deck.html](../specs/2026-04-25-recurring-management-refinements-deck.html)

---

## File map

**Created:**
- `apps/web/src/components/features/Chat/ConvertCurrenciesCell.tsx` — extracted self-contained Convert currencies component

**Modified (backend):**
- `packages/trpc/src/routers/expense/getExpenseByChat.ts` — extend Prisma `include`

**Modified (frontend):**
- `apps/web/src/components/features/Chat/ChatTransactionTab.tsx` — remove Convert block, add Recurring entry cell
- `apps/web/src/components/features/Chat/ChatBalanceTab.tsx` — mount `ConvertCurrenciesCell`
- `apps/web/src/components/features/Settings/ChatSettingsPage.tsx` — remove duplicate "Recurring Expenses" Section
- `apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx` — status branching in `RecurringScheduleSection` + Manage cell + ENDED caption
- `apps/web/src/components/features/Chat/ChatExpenseCell.tsx` — gate `RecurringExpenseBadge` on `recurringTemplate?.status === "ACTIVE"`
- `apps/web/src/components/features/Expense/RecurringExpenseBadge.tsx` — tooltip text update
- `apps/web/src/components/features/Expense/AmountFormStep.tsx` — declare `isEditMode` prop, gate Repeat section on `!isEditMode`
- `apps/web/src/components/features/Expense/EditExpensePage.tsx` — drop unused recurrence default

---

## Task 0: Set up the branch

**Files:** none (git only)

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/recurring-management-refinements
```

- [ ] **Step 2: Verify the branch is clean and based on latest main**

```bash
git status
git log --oneline -1
```

Expected: branch `feat/recurring-management-refinements`, working tree clean, HEAD = same SHA as `main`.

---

## Task 1: Extend `getExpenseByChat` with linked template status

**Files:**
- Modify: `packages/trpc/src/routers/expense/getExpenseByChat.ts`

This is a Prisma `include` change with no logic. TS types and downstream consumers must keep compiling. UAT confirms the field reaches the client.

- [ ] **Step 1: Read the current handler**

```bash
sed -n '1,60p' packages/trpc/src/routers/expense/getExpenseByChat.ts
```

- [ ] **Step 2: Add `recurringTemplate: { select: { status: true } }` to the `include` block**

In `getExpenseByChatHandler`, change:

```ts
include: {
  shares: true,
},
```

to:

```ts
include: {
  shares: true,
  recurringTemplate: { select: { status: true } },
},
```

The mapped output already spreads `...rest`, so the new `recurringTemplate` field flows through automatically. No other code change in this file.

- [ ] **Step 3: Run typecheck across the monorepo**

```bash
pnpm -w typecheck
```

Expected: PASS. No callsites should break — the change is additive (new optional field on the response).

- [ ] **Step 4: Run any tests touching expense routers**

```bash
pnpm -F @repo/trpc test --run
```

Expected: PASS, or "no tests found in scope" — neither is a blocker. The change has no behavioral logic to test.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/expense/getExpenseByChat.ts
git commit -m "feat(trpc): include recurringTemplate.status on getExpenseByChat"
```

---

## Task 2: Extract `ConvertCurrenciesCell` and relocate to Balances tab

**Files:**
- Create: `apps/web/src/components/features/Chat/ConvertCurrenciesCell.tsx`
- Modify: `apps/web/src/components/features/Chat/ChatTransactionTab.tsx`
- Modify: `apps/web/src/components/features/Chat/ChatBalanceTab.tsx`

This is a refactor + relocation. The Convert currencies block in `ChatTransactionTab.tsx` becomes a self-contained component that mounts at the top of `ChatBalanceTab.tsx`. Behavior must be identical to today's; the only user-visible change is the host tab.

The block to extract spans:
- State, queries, mutation, handlers, memo: roughly [ChatTransactionTab.tsx:182-341](apps/web/src/components/features/Chat/ChatTransactionTab.tsx#L182-L341) (the parts that are about Convert — `convertCurrencyMutation`, `convertFromCurrency`, `targetCurrencyModalOpen`, `currencieswithBalance`, `foreignCurrencies`, `handleSelectFromCurrency`, `handleTargetCurrencySelect`, `handleConvertCurrency`)
- Render: [ChatTransactionTab.tsx:356-475](apps/web/src/components/features/Chat/ChatTransactionTab.tsx#L356-L475) (the `Modal` with `trigger` Cell + the nested `CurrencySelectionModal`)

Read the existing source first to identify the exact lines that belong to Convert (the file has unrelated state for filters / sort / jump-to-date you must NOT move). Use `grep -n "convert\|Convert\|currencieswithBalance\|foreignCurrencies"` as a guide.

- [ ] **Step 1: Read both source files end to end**

```bash
sed -n '1,520p' apps/web/src/components/features/Chat/ChatTransactionTab.tsx
sed -n '1,222p' apps/web/src/components/features/Chat/ChatBalanceTab.tsx
```

- [ ] **Step 2: Create the new component file**

Create `apps/web/src/components/features/Chat/ConvertCurrenciesCell.tsx` with this skeleton:

```tsx
import {
  Avatar,
  AvatarStack,
  Blockquote,
  Cell,
  IconButton,
  Info,
  Modal,
  Section,
  Text,
  Title,
} from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  ArrowLeftRight,
  ChevronRight,
  ChevronsUpDown,
  LoaderCircle,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import CurrencySelectionModal from "@/components/ui/CurrencySelectionModal";
import { trpc } from "@/utils/trpc";

interface Props {
  chatId: number;
  userId: number;
}

export default function ConvertCurrenciesCell({ chatId, userId }: Props) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const trpcUtils = trpc.useUtils();

  // ⚠️ The body below must be lifted verbatim from ChatTransactionTab.tsx
  // (the Convert-currencies-only state, queries, mutation, memo, handlers,
  // and render block). Keep the existing onSuccess/onError + invalidations
  // intact. The mutation is `trpc.expense.convertCurrencyBulk.useMutation`,
  // not `chat.convertCurrency`.

  // ... lifted state, queries, memo, handlers ...

  if (foreignCurrencies.length === 0) return null;

  return (
    <>
      {/* lifted Modal trigger Cell */}
      {/* lifted CurrencySelectionModal */}
    </>
  );
}
```

Now lift the actual code from `ChatTransactionTab.tsx`:
- `convertCurrencyMutation` declaration (single mutation hook)
- `convertFromCurrency`, `targetCurrencyModalOpen` `useState`s
- `currencieswithBalance` query (for `currenciesWithBalanceStatus`) — `trpc.currency.getCurrenciesWithBalance.useQuery({ userId, chatId })`
- `dChatData` query — `trpc.chat.getChat.useQuery({ chatId })` (needed for `baseCurrency`)
- `foreignCurrencies` memo
- `handleSelectFromCurrency`, `handleTargetCurrencySelect`, `handleConvertCurrency` handlers
- The `<Modal>...</Modal>` block with the trigger `Cell`
- The `<CurrencySelectionModal />` block

Keep the existing `confirm(...)` dialog text verbatim ("⚠️ Convert all …"). Keep the invalidations on `convertCurrencyMutation.onSuccess` exactly as they are today (they invalidate `expense.getExpenseByChat`, `currency.getCurrenciesWithBalance`, etc.).

The component returns a fragment containing both modals — render order matches the source. The early-return `if (foreignCurrencies.length === 0) return null;` replaces the current `{foreignCurrencies.length > 0 && (...)}` wrap.

- [ ] **Step 3: Mount the new component on the Balances tab**

In `apps/web/src/components/features/Chat/ChatBalanceTab.tsx`, after the existing imports, add:

```tsx
import ConvertCurrenciesCell from "./ConvertCurrenciesCell";
```

Then, inside the `<section className="pb-8 pt-2">` block, just before `<div className="flex flex-col gap-2 px-4">`, insert the cell. The userId is already derived as `userId` (from `tUserData?.id ?? 0`):

```tsx
return (
  <section className="pb-8 pt-2">
    <div className="px-4 pb-2">
      <ConvertCurrenciesCell chatId={chatId} userId={userId} />
    </div>
    <div className="flex flex-col gap-2 px-4">
      {/* existing 🚨 Debts + 🤑 Collectables sections — unchanged */}
      ...
    </div>
  </section>
);
```

The `<div className="px-4 pb-2">` wrapper matches the horizontal padding of the existing balance sections so the cell aligns visually. `<ConvertCurrenciesCell>` returns null when there are no foreign currencies, so the wrapper collapses harmlessly.

- [ ] **Step 4: Remove the Convert block from `ChatTransactionTab.tsx`**

Delete in order, top to bottom:
- `convertFromCurrency`, `targetCurrencyModalOpen` state declarations
- The `convertCurrencyMutation` hook declaration
- The `currencieswithBalance` query (only if it's not used elsewhere in this file — verify with `grep`; today it isn't)
- The `foreignCurrencies` memo
- `handleSelectFromCurrency`, `handleTargetCurrencySelect`, `handleConvertCurrency` handlers
- The `{foreignCurrencies.length > 0 && (<Modal ...>...</Modal>)}` block
- The standalone `<CurrencySelectionModal ... />` that follows
- Remove now-unused imports: `ArrowLeftRight`, `ChevronsUpDown`, `LoaderCircle`, `Blockquote`, `CurrencySelectionModal`, and any others your editor flags as unused

The first `<Divider />` after `TransactionFiltersCell` should remain (it separates the toolbar from the list — its companion `<Divider />` after the Convert block goes away with the block).

Run `pnpm -F @repo/web exec tsc --noEmit` between deletions to catch any references you missed. The file should still typecheck.

- [ ] **Step 5: Verify the Balances tab still renders and Convert behavior is unchanged**

```bash
pnpm -F @repo/web typecheck
pnpm -F @repo/web build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/features/Chat/ConvertCurrenciesCell.tsx \
        apps/web/src/components/features/Chat/ChatTransactionTab.tsx \
        apps/web/src/components/features/Chat/ChatBalanceTab.tsx
git commit -m "refactor(web): extract ConvertCurrenciesCell, relocate to Balances tab"
```

---

## Task 3: Add Recurring expenses entry cell to Transactions tab

**Files:**
- Modify: `apps/web/src/components/features/Chat/ChatTransactionTab.tsx`

The slot vacated by Convert currencies now hosts the new entry cell. Visibility is gated on `recurring.list` returning at least one ACTIVE template.

- [ ] **Step 1: Add the imports**

In `ChatTransactionTab.tsx`:

```tsx
import { Cell, Navigation } from "@telegram-apps/telegram-ui"; // Navigation likely already imported elsewhere; merge
import { Repeat as RepeatIcon } from "lucide-react";
```

Verify `Cell` and `Navigation` are already imported from `@telegram-apps/telegram-ui` higher up; if so, just add `Repeat as RepeatIcon` to the lucide-react import. Add `globalNavigate` if not already present:

```tsx
import { useNavigate } from "@tanstack/react-router";
```

Inside the component body:

```tsx
const globalNavigate = useNavigate();
```

(Reuse if already declared.)

- [ ] **Step 2: Wire the recurring count query**

Inside the component body, alongside the other tRPC queries:

```tsx
const { data: recurringTemplates, status: recurringTemplatesStatus } =
  trpc.expense.recurring.list.useQuery({ chatId });

const recurringCount = recurringTemplates?.length ?? 0;
const showRecurringCell =
  recurringTemplatesStatus === "success" && recurringCount > 0;
```

- [ ] **Step 3: Render the entry cell where the Convert block used to be**

In the JSX, in the `<div className="shadow-xs">` block right after `<TransactionFiltersCell ... />` and `<Divider />`, before the `Divider` that closes the toolbar shell, render:

```tsx
{showRecurringCell && (
  <>
    <Cell
      before={
        <span className="rounded-lg bg-violet-400 p-1.5 dark:bg-violet-700">
          <RepeatIcon size={20} color="white" />
        </span>
      }
      after={<Navigation>{recurringCount}</Navigation>}
      onClick={() => {
        hapticFeedback.impactOccurred("light");
        globalNavigate({
          to: "/chat/$chatId/recurring-expenses",
          params: { chatId: String(chatId) },
        });
      }}
    >
      Recurring expenses
    </Cell>
    <Divider />
  </>
)}
```

The `<Divider />` inside the conditional means it disappears with the cell when `recurringCount === 0`, keeping the toolbar visually tight in the empty state.

- [ ] **Step 4: Typecheck + smoke build**

```bash
pnpm -F @repo/web typecheck
pnpm -F @repo/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Chat/ChatTransactionTab.tsx
git commit -m "feat(web): surface Recurring expenses entry on Transactions tab"
```

---

## Task 4: Remove duplicate entry from Settings page

**Files:**
- Modify: `apps/web/src/components/features/Settings/ChatSettingsPage.tsx`

- [ ] **Step 1: Locate the section to delete**

Open the file and scroll to the "Recurring Expenses" Section near line 417. The block to remove:

```tsx
<Section header="Recurring Expenses">
  <Cell
    before={<RepeatIcon size={20} />}
    after={<Navigation>Manage</Navigation>}
    onClick={() => {
      hapticFeedback.impactOccurred("light");
      globalNavigate({
        to: "/chat/$chatId/recurring-expenses",
        params: { chatId: String(chatId) },
      });
    }}
  >
    Recurring expenses
  </Cell>
</Section>
```

(Approximate; match by `header="Recurring Expenses"` to be safe.)

- [ ] **Step 2: Delete the Section**

Delete the entire `<Section header="Recurring Expenses">...</Section>` block.

- [ ] **Step 3: Remove the now-unused `RepeatIcon` import**

At the top of the file, find the `lucide-react` import that includes `Repeat as RepeatIcon`. If `RepeatIcon` is the only thing imported as `Repeat as RepeatIcon`, drop it from the import list. Check the rest of the file with `grep -n RepeatIcon` first — if it's used elsewhere, keep the import.

- [ ] **Step 4: Verify the Notifications Section (RecurringRemindersSection) is untouched**

```bash
grep -n "RecurringRemindersSection" apps/web/src/components/features/Settings/ChatSettingsPage.tsx
```

Expected: still present at line ~415. That feature is intentionally unchanged.

- [ ] **Step 5: Typecheck**

```bash
pnpm -F @repo/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/features/Settings/ChatSettingsPage.tsx
git commit -m "refactor(web): remove duplicate Recurring expenses entry from Settings"
```

---

## Task 5: Gate `↻` recurring badge on template status + tooltip update

**Files:**
- Modify: `apps/web/src/components/features/Chat/ChatExpenseCell.tsx`
- Modify: `apps/web/src/components/features/Expense/RecurringExpenseBadge.tsx`

The badge should signal "this expense's schedule is *currently* firing." Today it renders whenever `recurringTemplateId` is truthy. After this task it gates on the linked template's `status === "ACTIVE"` (now available thanks to Task 1).

- [ ] **Step 1: Update the badge tooltip**

Open `apps/web/src/components/features/Expense/RecurringExpenseBadge.tsx` and change:

```tsx
title="Recurring expense"
```

to:

```tsx
title="Active recurring schedule"
```

- [ ] **Step 2: Update the gate in `ChatExpenseCell.tsx`**

Find the badge render at approximately line 296:

```tsx
{expense.recurringTemplateId && <RecurringExpenseBadge />}
```

Replace with:

```tsx
{expense.recurringTemplate?.status === "ACTIVE" && <RecurringExpenseBadge />}
```

The `recurringTemplate` field comes from the `getExpenseByChat` response after Task 1.

- [ ] **Step 3: Typecheck**

```bash
pnpm -F @repo/web typecheck
```

Expected: PASS — the inferred response type from Task 1 already exposes `recurringTemplate: { status: ... } | null` on each expense.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Chat/ChatExpenseCell.tsx \
        apps/web/src/components/features/Expense/RecurringExpenseBadge.tsx
git commit -m "feat(web): gate recurring badge on active template status"
```

---

## Task 6: Status-branched Schedule section + Manage shortcut + ENDED caption

**Files:**
- Modify: `apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx`

The augmented `RecurringScheduleSection` becomes status-aware:
- `ACTIVE` → full Schedule section + bottom **Manage schedule** Cell that navigates to the edit page.
- `ENDED` → muted Caption row at the bottom of the modal: `↻ From a recurring schedule that ended on <date>`. No Section, no chevron.
- `CANCELED` → `return null`.

- [ ] **Step 1: Read the current `RecurringScheduleSection`**

```bash
sed -n '40,140p' apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx
```

Familiarize with the current structure (lines ~47-137).

- [ ] **Step 2: Extend the `Props` and `template` cast with `status`**

Update `RecurringScheduleSectionProps`:

```tsx
interface RecurringScheduleSectionProps {
  templateId: string;
  chatId: number;
  onClose: () => void;
  tSectionBgColor: string | undefined;
  tButtonColor: string | undefined;
  tSubtitleTextColor: string | undefined;
}
```

And in the inline cast inside the component, add `status` and `id`:

```tsx
const t = template as {
  id: string;
  frequency: CanonicalFrequency;
  interval: number;
  weekdays: Weekday[];
  endDate: Date | string | null;
  status: "ACTIVE" | "CANCELED" | "ENDED";
};
```

- [ ] **Step 3: Branch on status — return early for CANCELED, render Caption for ENDED**

Replace the existing `if (!template) return null;` + happy-path render with:

```tsx
if (!template) return null;
const t = template as { /* …as above… */ };

if (t.status === "CANCELED") return null;

const endDate = t.endDate
  ? t.endDate instanceof Date
    ? t.endDate
    : new Date(t.endDate)
  : null;

if (t.status === "ENDED") {
  return (
    <div className="px-3 pt-2">
      <Caption style={{ color: tSubtitleTextColor }}>
        <RepeatIcon
          size={12}
          strokeWidth={2.5}
          style={{ marginRight: 4, verticalAlign: "middle" }}
        />
        From a recurring schedule that ended on{" "}
        {endDate ? formatExpenseDate(endDate) : "an earlier date"}
      </Caption>
    </div>
  );
}

// status === "ACTIVE" — full section with Manage shortcut below
const repeatShortLabel =
  t.interval === 1 ? PRESET_LABEL[t.frequency] : "Custom";
const repeatSummary = splitRecurrenceSummary({
  frequency: t.frequency,
  interval: t.interval,
  weekdays: t.weekdays,
});
```

`Caption` is already imported from `@telegram-apps/telegram-ui` at the top of the file (search to confirm; if not, add it). `RepeatIcon` is imported as `Repeat as RepeatIcon` from lucide-react in this file already.

- [ ] **Step 4: Add the Manage shortcut Cell at the bottom of the ACTIVE Schedule section**

Inside the existing `<Section className="px-3" header="Schedule">…</Section>`, after the End Date Cell, append a new tappable Cell:

```tsx
<Cell
  before={null}
  after={<Navigation />}
  onClick={() => {
    hapticFeedback.impactOccurred("light");
    onClose();
    navigate({
      to: "/chat/$chatId/edit-recurring/$templateId",
      params: { chatId: String(chatId), templateId: t.id },
    });
  }}
  style={{ backgroundColor: tSectionBgColor }}
>
  <Text weight="2" style={{ color: tButtonColor }}>
    Manage schedule
  </Text>
</Cell>
```

You'll need:
- `import { useNavigate } from "@tanstack/react-router";` at the top
- `import { hapticFeedback } from "@telegram-apps/sdk-react";` — already present
- `const navigate = useNavigate();` inside the component
- `Navigation` from `@telegram-apps/telegram-ui` — confirm import (used elsewhere in this modal already; if not, add)

`tButtonColor` is the existing themed link color; if not yet read in this sub-component, plumb it down via a prop or read it inline:

```tsx
const tButtonColor = useSignal(themeParams.buttonColor);
```

- [ ] **Step 5: Wire `chatId` and `onClose` from the parent modal**

Find the `RecurringScheduleSection` mount inside `ExpenseDetailsModal` (around line 386-394 today):

```tsx
{expense.recurringTemplateId && (
  <RecurringScheduleSection
    templateId={expense.recurringTemplateId}
    tSectionBgColor={tSectionBgColor}
    tSubtitleTextColor={tSubtitleTextColor}
  />
)}
```

Update to pass the new props:

```tsx
{expense.recurringTemplateId && (
  <RecurringScheduleSection
    templateId={expense.recurringTemplateId}
    chatId={Number(expense.chatId)}
    onClose={() => onOpenChange(false)}
    tSectionBgColor={tSectionBgColor}
    tButtonColor={tButtonColor}
    tSubtitleTextColor={tSubtitleTextColor}
  />
)}
```

(`onOpenChange` is the modal prop; `tButtonColor` is the existing theme signal already read in the parent.)

- [ ] **Step 6: Typecheck**

```bash
pnpm -F @repo/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx
git commit -m "feat(web): status-aware Schedule section with Manage shortcut"
```

---

## Task 7: Hide Repeat / End Date in edit-expense form

**Files:**
- Modify: `apps/web/src/components/features/Expense/AmountFormStep.tsx`
- Modify: `apps/web/src/components/features/Expense/EditExpensePage.tsx`

`isEditMode` already reaches `AmountFormStep` from both `AddExpensePage` (`false`) and `EditExpensePage` (`true`), but `AmountFormStep` doesn't declare it in its `withForm` props block, and never gates anything on it.

- [ ] **Step 1: Declare `isEditMode` on `AmountFormStep`'s `withForm` props**

In `apps/web/src/components/features/Expense/AmountFormStep.tsx` at lines 45-54, extend the `props` block:

```tsx
const AmountFormStep = withForm({
  ...formOpts,
  props: {
    step: 0,
    isLastStep: false,
    isEditMode: false,
    navigate: (() => {}) as unknown as UseNavigateResult<
      "/chat/$chatId/add-expense" | "/chat/$chatId/edit-expense/$expenseId"
    >,
    chatId: 0,
  },
  render: function Render({ form, isLastStep, step, isEditMode, navigate, chatId }) {
    // ...existing body...
```

The `isEditMode` parameter is now destructurable.

- [ ] **Step 2: Gate `RepeatAndEndDateSection` on `!isEditMode`**

Find the section render around line 407-425:

```tsx
<form.AppField name="recurrence">
  {(recurrenceField) => (
    <RepeatAndEndDateSection
      value={recurrenceField.state.value as RecurrenceValue}
      onChange={(next) =>
        recurrenceField.handleChange(next as never)
      }
      defaultWeekdayFromDate={
        form.getFieldValue("date") || undefined
      }
      onTouched={() =>
        form.setFieldMeta("recurrence", (prev) => ({
          ...prev,
          isTouched: true,
        }))
      }
    />
  )}
</form.AppField>
```

Wrap with `!isEditMode &&`:

```tsx
{!isEditMode && (
  <form.AppField name="recurrence">
    {(recurrenceField) => (
      <RepeatAndEndDateSection
        value={recurrenceField.state.value as RecurrenceValue}
        onChange={(next) =>
          recurrenceField.handleChange(next as never)
        }
        defaultWeekdayFromDate={
          form.getFieldValue("date") || undefined
        }
        onTouched={() =>
          form.setFieldMeta("recurrence", (prev) => ({
            ...prev,
            isTouched: true,
          }))
        }
      />
    )}
  </form.AppField>
)}
```

Also wrap the recurrence error band at line ~435-441 so the empty error space doesn't render in edit mode:

```tsx
{!isEditMode && (
  <form.AppField name="recurrence">
    {() => (
      <div className="px-2">
        <FieldInfo />
      </div>
    )}
  </form.AppField>
)}
```

- [ ] **Step 3: Drop the unused recurrence default in `EditExpensePage.tsx`**

In `EditExpensePage.tsx` around lines 137-141, remove:

```tsx
// Recurrence is not editable from the existing edit flow (Task 11 only
// wires the schema + default). Mirror formOpts.defaultValues so the
// form's StandardSchema input shape stays aligned.
recurrence: formOpts.defaultValues.recurrence,
```

Verify the form's `defaultValues` object shape still satisfies the StandardSchema. If `recurrence` is required at the schema level, leave the line — the field exists in form state but isn't rendered. Run typecheck (Step 4) to find out.

- [ ] **Step 4: Typecheck**

```bash
pnpm -F @repo/web typecheck
```

Expected: PASS. If TypeScript complains that `recurrence` is required in `defaultValues`, restore the line from Step 3 — that's fine, it's harmless (the form state holds an empty default that's never read or sent).

- [ ] **Step 5: Build**

```bash
pnpm -F @repo/web build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/features/Expense/AmountFormStep.tsx \
        apps/web/src/components/features/Expense/EditExpensePage.tsx
git commit -m "fix(web): hide Repeat/End Date cells in edit-expense form"
```

---

## Task 8: Push branch + open PR (do NOT arm auto-merge)

**Files:** none (git only)

- [ ] **Step 1: Run the full typecheck + build one more time**

```bash
pnpm -w typecheck
pnpm -F @repo/web build
```

Expected: PASS.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/recurring-management-refinements
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create \
  --title "feat: recurring expense management UX refinements" \
  --body "$(cat <<'EOF'
## Summary
- Move "Recurring expenses" entry to the top of the Transactions tab (replaces Convert currencies)
- Relocate Convert currencies to the top of the Balances tab; extract `ConvertCurrenciesCell`
- Remove duplicate "Recurring expenses · Manage" entry from Settings
- Make `ExpenseDetailsModal` Schedule section status-aware: ACTIVE renders full section + new "Manage schedule" tap; ENDED renders a muted breadcrumb caption; CANCELED hides entirely
- Gate the `↻` recurring badge on `recurringTemplate?.status === "ACTIVE"` (badge means "live", not historical); update tooltip to "Active recurring schedule"
- Hide Repeat / End Date cells in the edit-expense form (kills the silent no-op)
- Backend: `getExpenseByChat` now includes `recurringTemplate.status` so the cell badge can gate

## Spec
[docs/superpowers/specs/2026-04-25-recurring-management-refinements-design.md](docs/superpowers/specs/2026-04-25-recurring-management-refinements-design.md)

## Test plan
- [ ] Active recurring templates → entry cell visible on Transactions tab with correct count → tap navigates to list page
- [ ] No active recurring templates → entry cell hidden
- [ ] Foreign-currency expenses → Convert currencies cell appears at top of Balances tab; modal triggers + conversion completes
- [ ] No foreign currencies → Convert currencies cell hidden on Balances tab
- [ ] Cancel a template → past materialized expenses no longer show `↻` badge; modal no longer renders Schedule section or breadcrumb
- [ ] ENDED template (let endDate pass or synthesize) → modal renders muted "↻ From a recurring schedule that ended on …" caption; no Schedule section; no Manage tap
- [ ] ACTIVE template → modal renders full Schedule section → tap "Manage schedule ›" lands on edit-recurring page with form populated
- [ ] Edit existing expense → Repeat / End Date cells hidden in form. Add new expense → cells visible, behave normally
- [ ] Settings page no longer shows "Recurring Expenses" Section. "Notifications · Recurring Reminders" remains.
- [ ] Private chats — same behavior
EOF
)"
```

- [ ] **Step 4: Capture the PR URL**

```bash
gh pr view --json url --jq .url
```

Expected: prints a `https://github.com/.../pull/N` URL. **Do not run `gh pr merge --auto` yet.** Manual UAT runs first.

---

## Task 9: Manual UAT loop (full-environment)

Per the user's `feedback_uat_full_environment.md` and `feedback_subagent_uat.md` preferences: backend / DB-affecting work gets a scripted subagent UAT for assertions + cleanup; user-facing surfaces get a manual `AskUserQuestion` walkthrough one step at a time.

This task is for the parent (orchestrator) — not a self-contained subagent task.

- [ ] **Step 1: Wait for the Vercel deploy attached to the PR's main-branch sync**

Vercel git deploys are off; `.github/workflows/deploy.yml` deploys to prod on push to main. Since this PR isn't merged yet, UAT happens against a Vercel **preview** for the PR. If the project doesn't have preview deploys wired (per the user's `project_vercel_disconnect_followup` memory, deploys are GHA-driven — confirm), fall back to local dev: `pnpm -F @repo/web dev` and load via the Telegram TMA pointed at localhost.

- [ ] **Step 2: Subagent-driven backend UAT**

Dispatch a `general-purpose` subagent with a prompt like:
> Connect to Supabase via the MCP. Pick a test chat. Verify: (a) `expense.getExpenseByChat` (called via tRPC over a fresh tunnel or by inspecting a recent response on the deployment) returns `recurringTemplate.status` for expenses with a linked template; (b) cancelling a template via `expense.recurring.cancel` flips `status = CANCELED` and the next `getExpenseByChat` includes it. Clean up by restoring any test rows.

- [ ] **Step 3: Manual UAT walkthrough via `AskUserQuestion`**

Step the user through the test plan from the PR description **one step at a time**, with empty/one-word option labels per `feedback_askuserquestion_style.md`. Capture screenshots at each step (the user typically pastes them into the conversation).

- [ ] **Step 4: On signoff, arm auto-merge**

Once the user types "ok merge":

```bash
gh pr merge --auto --squash --delete-branch
```

---

## Self-review (skill checklist)

**Spec coverage:**
- Thread 1 (entry on Transactions) → Tasks 3
- Thread 2 (Convert → Balances) → Task 2
- Thread 3 (status-aware schedule + badge) → Tasks 1, 5, 6
- Thread 4 (Manage shortcut) → Task 6
- Thread 5 (silent no-op fix) → Task 7
- Settings cleanup → Task 4
- Backend include → Task 1

**Placeholder scan:** No "TBD"/"TODO"/"implement later". Tasks 2 and 6 reference current source line numbers as the source of truth for verbatim lifts (the code being moved is too long to duplicate inline; line refs are explicit). Each step states an exact action.

**Type consistency:** `recurringTemplate?.status` is the property path everywhere it's referenced (Tasks 1, 5). `isEditMode` is consistent across Tasks 7's three subtasks. Mutation name verified as `trpc.expense.convertCurrencyBulk` (Task 2 Step 2 calls this out explicitly to prevent the wrong name from being guessed).
