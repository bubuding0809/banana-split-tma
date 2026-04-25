# Recurring Expense Management — UX Refinements

**Date:** 2026-04-25
**Status:** Brainstorm complete — awaiting user spec review
**Author:** Ruoqian Ding (with Claude Opus 4.7)

## Goal

Close five UX gaps in the recurring-expense feature shipped via PR
#236 + polish PRs through #249. Each gap is small on its own; bundled
they form a coherent "make recurring management actually findable
and consistent" pass.

The five threads:

1. **Surface the entry point.** Move "Recurring expenses · Manage"
   from Settings to the Transactions tab where users already think
   about recurring transactions.
2. **Relocate Convert currencies.** Free up the Transactions-tab top
   slot by moving the existing Convert currencies Cell to its more
   natural home: the top of the Balances tab.
3. **Status-aware schedule rendering.** A canceled or ended
   template's schedule details still render on past expenses (modal
   Schedule section + `↻` cell badge), implying the schedule is
   live. Gate both surfaces on `template.status === "ACTIVE"`.
4. **Manage shortcut from expense modal.** When the linked template
   is active, let users tap into `ExpenseDetailsModal`'s Schedule
   section to land directly on the manage edit page. Closes a 4-tap
   navigation gap.
5. **Kill the silent no-op in edit-expense.** Recurrence cells in
   the edit-expense form look editable but their values are never
   sent to the backend. Hide them in edit mode — recurrence becomes
   a create-only concern; schedule edits live exclusively on the
   manage page.

## Constraints

- **Single canonical entry per concept.** After this change, there
  is exactly one place to manage recurring schedules (the Transactions
  tab cell → list page → edit page) and exactly one place to convert
  currencies (Balances tab).
- **Backend changes are limited to one read-side include.** The
  expense list query needs to join the linked template's `status` so
  the cell badge can gate on it. No new mutations, no schema changes.
- **No new routes.** All five threads reuse existing routes and
  modals.

## Non-goals

- Pause/resume of templates (no backend support; future spec).
- Per-occurrence schedule overrides ("just this one"). Out of scope
  v1.1 just as it was v1.
- Surfacing recurring schedules in the chat-list summary row.
- Promoting a one-off expense to a recurring one from the edit
  flow. Discoverability for that path stays via the add-expense
  form's Repeat cell.

## Surfaces

### 1. Transactions tab — entry point swap

`apps/web/src/components/features/Chat/ChatTransactionTab.tsx`

**Replace** the Convert currencies Cell+Modal block at
[ChatTransactionTab.tsx:356-475](apps/web/src/components/features/Chat/ChatTransactionTab.tsx#L356-L475)
with a new "Recurring expenses" entry Cell.

```
[↻ violet tile]  Recurring expenses                    N  ›
```

**Cell shape:**
- `before`: violet rounded tile, mirrors the existing teal pattern
  used by Convert. `<span className="rounded-lg bg-violet-400 p-1.5 dark:bg-violet-700"><Repeat size={20} color="white" /></span>`
- Body: `Recurring expenses`
- `after`: `<Navigation>{count}</Navigation>` — Telegram-UI
  `Navigation` renders the chevron + the count. Same affordance as
  the existing Settings cell that this replaces.
- `onClick`: light haptic + `globalNavigate({ to: "/chat/$chatId/recurring-expenses", params: { chatId: String(chatId) } })`

**Visibility rule:**
```ts
const { data: templates, status } =
  trpc.expense.recurring.list.useQuery({ chatId });
const showRecurringCell =
  status === "success" && (templates?.length ?? 0) > 0;
```
No skeleton. Cell either appears or doesn't — prevents layout shift
and avoids flashing a "0" then disappearing. New users with no
templates never see the row; their discovery path stays the
add-expense form's Repeat cell.

**Filter independence:** the cell sits in the toolbar shell above
the virtualized list, alongside `TransactionFiltersCell`. Filters
(Payments, Related, Date, Sort) affect only the list. Cell stays
visible regardless of filter state — same behavior as today's
Convert currencies cell.

### 2. Balances tab — Convert currencies relocation

`apps/web/src/components/features/Chat/ChatBalanceTab.tsx`

**Mount** `<ConvertCurrenciesCell chatId={chatId} userId={userId} />`
at the very top of the tab, above the `🚨 Debts` Section.

The trigger Cell, the Modal, and the conversion mutation are
unchanged. Visibility rule is unchanged: render only when there is
at least one foreign-currency balance
(`foreignCurrencies.length > 0`).

**Component extraction.** The Convert currencies block today is ~90
lines of inline state + modal + nested target-currency picker
wired into `ChatTransactionTab`. Lifting it as-is to a second host
spreads the tangled block. Extract into:

```
apps/web/src/components/features/Chat/ConvertCurrenciesCell.tsx
```

Owns:
- `currencieswithBalance` query + chat baseCurrency derivation
- `convertCurrency` mutation
- `convertFromCurrency`, `targetCurrencyModalOpen` state
- The `foreignCurrencies` memo

Props: `{ chatId: number; userId: number }`. Returns `null` when
`foreignCurrencies.length === 0`. Mounted by `ChatBalanceTab` only.
Removed entirely from `ChatTransactionTab`.

This is pure refactor + relocation — no behavior change. Currency
conversion behavior must stay identical.

### 3. Settings page — remove duplicate entry

`apps/web/src/components/features/Settings/ChatSettingsPage.tsx`

**Remove** the "Recurring Expenses" Section at
[ChatSettingsPage.tsx:417-431](apps/web/src/components/features/Settings/ChatSettingsPage.tsx#L417-L431)
and its now-unused `RepeatIcon` import.

The "Notifications" Section (`RecurringRemindersSection` — the
weekly settlement-nudge bot) is unchanged. It's a separate feature
with no overlap.

### 4. Status-aware Schedule + badge

#### 4a. `ExpenseDetailsModal` Schedule section — three states

`apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx`

In `RecurringScheduleSection` at [lines 53-70](apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx#L53-L70),
add `status` to the type cast and branch on it:

```tsx
const t = template as {
  frequency: CanonicalFrequency;
  interval: number;
  weekdays: Weekday[];
  endDate: Date | string | null;
  status: "ACTIVE" | "CANCELED" | "ENDED";
};
```

| Status | Render |
|---|---|
| `ACTIVE` | Full Schedule section (Repeat / End Date cells) **plus the Manage shortcut from Surface 5**. |
| `ENDED` | Single muted `Caption` row at the bottom of the modal: `↻ From a recurring schedule that ended on <formatDate(endDate)>`. No section header, no chevron, no nav. |
| `CANCELED` | `return null` — section + caption both hidden. The modal looks identical to a one-off expense. |

**Why the asymmetry between ENDED and CANCELED:** ENDED is a
natural lifecycle outcome (the schedule ran its course); a one-line
historical note is genuinely useful context for understanding past
spending patterns. CANCELED is a deliberate user action — they
removed the schedule, and persisting its details on every
materialized expense forever is noise. Both stop claiming the
schedule is live; only ENDED keeps a small breadcrumb.

The ENDED caption uses the Telegram-UI `Caption` component (or
equivalent muted text style). Date formatting via the existing
`formatExpenseDate` helper used elsewhere in this modal.

The `↻` glyph in the ENDED caption is the same `Repeat` icon used
in the badge — keeps the visual vocabulary tight without resurrecting
the live-state badge color (caption uses `tSubtitleTextColor`, not
link-blue).

#### 4b. `ChatExpenseCell` recurring badge

`apps/web/src/components/features/Chat/ChatExpenseCell.tsx`

Today the `↻` `RecurringExpenseBadge` at
[line 296](apps/web/src/components/features/Chat/ChatExpenseCell.tsx#L296)
renders whenever `expense.recurringTemplateId` is truthy — no
status check. Change the predicate to gate on the linked template's
status:

```tsx
{expense.recurringTemplate?.status === "ACTIVE" && <RecurringExpenseBadge />}
```

Tooltip on `RecurringExpenseBadge` updates from
`"Recurring expense"` to `"Active recurring schedule"` so the
meaning is unambiguous.

**Why "is recurring (live state)" not "was recurring (origin
marker)":** the badge is link-blue, which reads as live/actionable
in Telegram's design language. Its day-to-day value is signaling
"more like this one will keep arriving." Origin lineage as a
permanent marker isn't useful enough to justify the badge churn
that comes with mixing canceled and active visually.

**Backend dependency.** `getExpenseByChat` currently does not return
the linked template. Extend the Prisma `include`:

```ts
// packages/trpc/src/routers/expense/getExpenseByChat.ts
include: {
  shares: true,
  recurringTemplate: { select: { status: true } },
}
```

Pass `recurringTemplate` through in the mapped output. No new query,
no schema change — just one extra select on a relation.

### 5. Manage shortcut from expense modal

`apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx`

When `RecurringScheduleSection` renders (i.e., the linked template
is ACTIVE), make the section navigate to the manage edit page on
tap.

**Implementation:**
- The Schedule Section gains a trailing chevron affordance — render
  a `Section` with a `header` that includes a small "Manage ›" right
  side, OR add a final tappable Cell at the bottom of the section
  reading "Manage schedule ›".
- Tap → light haptic + close the expense modal + `globalNavigate({
  to: "/chat/$chatId/edit-recurring/$templateId", params: { chatId: String(chatId), templateId: template.id } })`.
- The cells inside the section (Repeat / End Date) stay
  non-interactive read-only displays. We're not adding inline
  editing here — tapping anywhere on the section just navigates to
  the dedicated edit page.

Pick whichever of the two options reads cleaner once it's in code;
both are equivalent for users. The "trailing affordance on header"
is the lighter touch; the "Manage cell at bottom" is more
discoverable. Lean: **bottom Manage cell**, since users are more
likely to scan the cells than the section header text.

`RecurringScheduleSection` needs a new `chatId` prop to build the
nav target. Plumb it through from `ExpenseDetailsModal`'s parent.

### 6. Edit-expense form — hide silent no-op recurrence

`apps/web/src/components/features/Expense/AmountFormStep.tsx`

The `RepeatAndEndDateSection` at
[AmountFormStep.tsx:407-425](apps/web/src/components/features/Expense/AmountFormStep.tsx#L407-L425)
renders unconditionally. The edit-expense form
([EditExpensePage.tsx:140](apps/web/src/components/features/Expense/EditExpensePage.tsx#L140))
hard-codes `recurrence: formOpts.defaultValues.recurrence` and
[never sends recurrence in the submit payload](apps/web/src/components/features/Expense/EditExpensePage.tsx#L161-L180).
The backend `updateExpense` doesn't accept it either. Net effect:
the section in edit mode is a silent no-op.

**Fix.** `AmountFormStep` takes a `mode: "add" | "edit"` prop (or
equivalent boolean — pick the cleanest fit with surrounding code).
The form gates `<RepeatAndEndDateSection>` on `mode === "add"`.

In `EditExpensePage.tsx`:
- Drop the `recurrence: formOpts.defaultValues.recurrence` line and
  its companion comment now that the field is unused.
- Pass `mode="edit"` to `AmountFormStep`.

In `AddExpenseForm.tsx` (or wherever add-expense mounts
`AmountFormStep`):
- Pass `mode="add"`.

No backend changes — recurrence already isn't part of `updateExpense`
and that stays true.

**Why hide rather than show a read-only indicator:** `ExpenseDetailsModal`'s
Schedule section + Manage shortcut (Surface 5) is already the one
canonical "is this expense recurring? where do I edit the schedule?"
surface. Showing a second indicator inside the edit form
duplicates that without adding capability.

## Data flow

| Call | Source | Used by |
|---|---|---|
| `expense.recurring.list({ chatId })` | existing | new entry cell (count) + existing list page |
| `expense.recurring.get({ templateId })` | existing | `RecurringScheduleSection` (status check + manage nav) |
| `expense.getExpenseByChat({ chatId })` | **+ `recurringTemplate.status` include** | `ChatExpenseCell` badge gate |
| `chat.getCurrenciesWithBalance` | existing | `ConvertCurrenciesCell` (relocated) |
| `chat.convertCurrency` mutation | existing | `ConvertCurrenciesCell` (relocated) |

TanStack Query caches by key. The list cell on the Transactions tab
and the list page share `expense.recurring.list` cache; navigating
into the list page after seeing the count cell is instant.

## Routing

No route changes. All navigation targets exist:
- `/chat/$chatId/recurring-expenses` — list page (PR #236)
- `/chat/$chatId/edit-recurring/$templateId` — manage edit page
  (PR #236)

## Visual specs

**New entry cell tile color:** `bg-violet-400 dark:bg-violet-700`
(mirrors `bg-teal-400 dark:bg-teal-700` from Convert). Distinct from
teal (Convert) and from link-blue (the `↻` badges inside cells and
modals).

**Icon:** `Repeat` from `lucide-react`. Same icon as the existing
Settings entry — visual consistency between old and new entry
points during the transition.

**Trailing count:** Telegram-UI `<Navigation>{N}</Navigation>` —
provides chevron + numeric formatting. Don't compose the chevron
manually.

**Schedule section header chevron / Manage cell:** styled to match
existing `Cell` + `Navigation` patterns. No new visual primitives.

## Error handling

- **`expense.recurring.list` query errors** on the entry cell:
  cell hides (treat as "we don't know if there's anything").
  Conservative — better than rendering a broken count. The list
  page itself surfaces query errors when users navigate.
- **`expense.recurring.get` query errors** in
  `RecurringScheduleSection`: section hides (current behavior since
  `if (!template) return null;`). Adding a status check doesn't
  change the error path.
- **No new race conditions.** A user on a stale expense modal whose
  template was canceled in another tab will see the section
  disappear on next refetch — desirable, not a bug.

## Testing

### Component
- New entry cell: renders nothing on pending status, renders nothing
  when list is empty, renders with correct count when list has
  items, navigates on click.
- `RecurringScheduleSection`: renders full section for ACTIVE
  template, renders only the muted "ended on …" Caption for
  ENDED, returns null for CANCELED. Manage tap (ACTIVE only)
  navigates to `/chat/$chatId/edit-recurring/$templateId`.
- `ChatExpenseCell`: badge renders only when
  `recurringTemplate?.status === "ACTIVE"`.
- `ConvertCurrenciesCell`: renders null when no foreign
  currencies; renders trigger cell + opens modal otherwise.
- `AmountFormStep`: respects `mode` — section appears in `"add"`,
  hidden in `"edit"`.

### Backend
- `getExpenseByChat` returns `recurringTemplate: { status }` for
  expenses with a linked template, `null` otherwise. Existing
  callsites continue to work (additive change).

### Manual UAT (per `feedback_uat_full_environment.md`)
A single full-environment cycle covering each of the five threads:

1. Group chat with active recurring templates → entry cell visible
   with correct count → tap navigates to list page.
2. Cancel a template via the manage UI → past materialized expenses
   for that template no longer show the `↻` badge on their cell;
   their `ExpenseDetailsModal` no longer renders the Schedule
   section *and* shows no caption (CANCELED → fully hidden).
   Settings page no longer shows the duplicate "Recurring Expenses"
   entry.
3. Open an expense whose template is ACTIVE → modal renders the
   full Schedule section → tap "Manage schedule ›" → lands on the
   edit page with form fields populated correctly.
3a. Wait for / synthesize a template whose `endDate` has passed
    (status = ENDED) → modal renders only the muted
    "↻ From a recurring schedule that ended on …" Caption. No
    Schedule section, no Manage tap.
4. Edit an existing expense → no Repeat / End Date cells in the
   form. Add a new expense → cells visible and behave as before.
5. Group chat with foreign-currency expenses → Convert currencies
   appears at the top of Balances tab (not Transactions); modal
   triggers + conversion completes; conversion result is reflected
   in both Balances and Transactions tabs.
6. Group chat with no foreign currencies → Convert currencies cell
   is hidden on Balances tab.
7. Private chats — same behavior across all six points where
   applicable (recurring is supported in private chats today).

## Out of scope for this design

- Inline rendering of recurring templates on the Transactions tab.
- Pause/resume of templates.
- Per-occurrence schedule overrides.
- Promoting a one-off expense to recurring from the edit-expense
  form (deliberate v1 limitation; revisit only if users ask).
- Surfacing recurring schedules in the chat-list summary row.
