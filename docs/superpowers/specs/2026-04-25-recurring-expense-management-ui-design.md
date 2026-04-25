# Recurring Expense Management UI — Design

**Date:** 2026-04-25
**Status:** Approved (brainstorm phase complete; ready for implementation plan)
**Author:** Ruoqian Ding (with Claude Opus 4.7)

## Goal

Close the management gap on the recurring expenses feature: today the
backend exposes `expense.recurring.list / get / update / cancel` but the
TMA only renders the bare list. Users have no way to view details, edit
the schedule, or cancel a recurring expense from the app.

## Constraints

- **Reuse over invent.** All four surfaces in this design must mirror the
  existing expense Section/Cell shapes so users don't see two different
  visual languages for the same domain object.
- **Schedule-only mutation in v1.** The backend
  `expense.recurring.update` only accepts `frequency`, `interval`,
  `weekdays`, `endDate`, `description`, `amount`. We further scope this UI
  to schedule fields (`frequency`, `interval`, `weekdays`, `endDate`).
  Description / amount / payer / splits / category are immutable from this
  flow — users cancel and recreate to change those.
- **No new backend.** Every interaction maps to an existing tRPC
  procedure. No schema changes, no new mutations.

## Non-goals

- Editing per-occurrence fields (description, amount, splits, payer,
  category, currency). Out of scope for v1; revisit when users ask.
- Apple-Calendar-style "edit this vs. all future occurrences" choice. v1
  is template-only; past materialized expenses keep their historical
  values.
- Pause/resume. Backend doesn't have it. Cancel is the only mutation
  path.

## Surfaces

### 1. Recurring list page — `/chat/$chatId/recurring-expenses`

Existing route, visual upgrade only.

- Replaces today's plain `Cell` with `RecurringExpenseCell` — a new
  component that mirrors `ChatExpenseCell`'s structure (44×44 emoji
  avatar, "<Name> spends" subhead, "🇸🇬 SGD X.XX" main, category emoji
  on the leading side).
- Trailing area:
  - Top: small `↻ <Frequency>` badge (link-color background)
  - Middle: "Next: <date>" — computed from
    `nextOccurrenceAfter(template.startDate, template)` (helper already
    exists in `apps/web/src/components/features/Expense/recurrencePresets.ts`)
  - **No share amount.** That data exists per-occurrence, not per-template, and would be misleading on a "schedule" view.
- Tapping a row opens `RecurringExpenseDetailsModal` (state
  `selectedTemplate` lives on the page, mirroring `selectedExpense` on
  `ChatExpenseCell`).

### 2. `RecurringExpenseDetailsModal` (NEW)

Bottom-sheet `Modal`, mirroring `ExpenseDetailsModal`'s structure.

**Sections (top to bottom):**
1. **What was this for?** — category emoji + description + category title
2. **Who paid for this?** — payer avatar + "<Name> spends" + "Started <transaction date>" + total amount per fire
3. **Split amounts** — `ShareParticipant` cells for each participant
   (lifted from `ExpenseDetailsModal` — already a self-contained sub-component)
4. **How is this expense split?** — split mode label
5. **Schedule** (NEW for this modal) — Repeat (Monthly / Weekly Tue+Wed
   / Custom every 2 weeks etc.) + End Date

**Header:**
- Title: "Recurring"
- Status badge: `↻ <Frequency> · Next <date>` in link color
- Pencil icon → navigates to `/chat/$chatId/edit-recurring/$templateId`
- Close (X)

**Telegram bottom bar:** `secondaryButton` is set up by the **list
page** in its `handleModalOpenChange(open)` — same pattern as
`ChatExpenseCell:200-247`. Modal stays a pure presentation component;
the list page owns the button lifecycle, the cancel mutation, and the
post-cancel invalidation/close. This keeps `RecurringExpenseDetailsModal`
trivially testable in isolation.

- On modal open: list page calls `secondaryButton.setParams({ text:
  "Delete", isVisible: true, textColor: destructive })` and registers
  `secondaryButton.onClick(onDeleteTemplate)`.
- `onDeleteTemplate`: `popup.open` confirm "Delete this recurring
  expense?" → on confirm, `expense.recurring.cancel.mutateAsync({
  templateId })` → invalidate `expense.recurring.list` → close modal.
- On modal close: list page hides the secondary button and unregisters
  the click handler.

### 3. `/chat/$chatId/edit-recurring/$templateId` (NEW route)

Focused, single-section page. No multi-step navigation.

**Header:** "Edit recurring" + close button.

**Body:**
- **Read-only summary Cell at top** — same shape as the row the user just
  tapped on the recurring list page (a `ChatExpenseCell`-style Cell with
  category emoji avatar, "You spend" subhead, "🇸🇬 SGD X.XX" main, "on
  <description>" description, split-mode shown as caption beneath). Cell
  is non-interactive (no `onClick`). Lets the user verify they're editing
  the right thing without re-opening the modal — and reuses the exact
  visual language they're already familiar with from the list.
- One Section "Schedule" with two cells:
  - **Repeat** — opens `RecurrencePickerSheet` (existing component). Calls schedule update on commit.
  - **End Date** — same native-date-overlay pattern as the End Date Cell
    in `AmountFormStep` (Category-style clear pill, `onPointerDown` to
    beat iOS Telegram's date picker, `z-20` stacking).

**Telegram bottom bar:**
- `mainButton`: **Save** → `expense.recurring.update` with the dirty
  schedule fields → invalidate `recurring.list` and `recurring.get` →
  navigate back.
- `secondaryButton`: **Delete** (red) → same popup confirm + cancel flow
  as the modal.

### 4. `ExpenseDetailsModal` (existing, augmented)

When the viewed expense has a non-null `recurringTemplateId`, append a
new "↻ Recurring schedule" Section between "How was this expense split?"
and the bottom of the modal. **Read-only**, single row.

**Section content:**
- One row: `↻` icon + "Repeats" + subtitle "<Frequency> · Next <date>" +
  trailing "until <endDate>" (or "forever" when no endDate).

The pencil at the top of the modal continues to mean "edit this single
occurrence" — its scope is unchanged. Users who want to manage the
template (edit schedule, cancel) go through Settings → Recurring
expenses. We deliberately don't add a "View template" deeplink here:
the inline read-only info is enough to answer "is this recurring?", and
adding a navigation handoff would muddle the modal's scope (per-occurrence
edit vs. template management).

Triggers a `trpc.expense.recurring.get.useQuery({ templateId })` only
when the section needs to render, so non-recurring expenses pay no
extra cost.

## Data flow & shared components

### New shared component: `RepeatAndEndDateSection`

Lift the Repeat Cell + End Date Cell + RecurrencePickerSheet wiring
from `AmountFormStep.tsx:419-590` into a standalone component:

```
apps/web/src/components/features/Expense/RepeatAndEndDateSection.tsx
```

Props:
```ts
interface Props {
  value: RecurrenceValue;
  onChange: (next: RecurrenceValue) => void;
  defaultWeekdayFromDate?: string; // YYYY-MM-DD for Apple-Reminders behavior
  showSummaryRow?: boolean;        // true on add-expense, false on edit-recurring (avoids redundancy with the form summary line)
  error?: string;                  // surfaces cross-field zod error from parent
}
```

Mounted by:
- `AmountFormStep` (existing add-expense form — refactor to use the new
  component, no behavior change)
- `EditRecurringSchedulePage` (new edit page)

This is a **pure refactor + extraction** — no logic change. Tests in
`recurrencePresets.test.ts` continue to pass.

### tRPC contract — what we need from the backend

All exist; nothing new:
- `expense.recurring.list({ chatId })` — already filters to
  `status=ACTIVE`, returns templates ordered by createdAt DESC.
- `expense.recurring.get({ templateId })` — single template; used by
  modal + augmented `ExpenseDetailsModal` + edit page.
- `expense.recurring.update({ templateId, frequency?, interval?, weekdays?, endDate? })`
  — partial update; only schedule fields sent (form passes undefined
  for unchanged fields).
- `expense.recurring.cancel({ templateId })` — soft-delete →
  `status=CANCELED`, deletes AWS schedule.

### Computed fields on the client

Both the list cell trailing and the modal status badge need
"Next: <date>". Compute on the client using
`nextOccurrenceAfter(template.startDate, template)` — same helper that
powers the form's end-date validation. No backend change needed.

For "Repeats" subtitle text in the augmented `ExpenseDetailsModal`,
use the existing `formatRecurrenceSummary()` from
`recurrencePresets.ts` (e.g., "Monthly", "Weekly on Mon, Wed",
"Every 2 weeks on Tue").

## Routing changes

| Path | Component | Status |
|---|---|---|
| `/chat/$chatId/recurring-expenses` | `RecurringTemplatesList` | existing — visual upgrade |
| `/chat/$chatId/edit-recurring/$templateId` | `EditRecurringSchedulePage` | NEW route |

No new search param. The `RecurringExpenseDetailsModal` opens via local
state on the list page (`selectedTemplate`), set by row taps — no
deeplink entry point in v1.

## Error handling

- **Save fails** (network / AWS UpdateScheduleCommand error): toast +
  keep form dirty so user can retry. tRPC mutation already returns the
  AWS error message verbatim — display as-is.
- **Cancel fails on AWS but DB succeeds**: per `cancel.ts:47-58`, the
  template is marked CANCELED in DB even if the AWS DeleteScheduleCommand
  fails. The list query already filters to `ACTIVE` so the row disappears
  immediately. Schedule may keep firing for ≤24h until cleaned up
  manually, but firing into a CANCELED template is a no-op (tick endpoint
  rejects). No user-visible effect — silent retry on AWS side later.
- **Template not found** (race: user opens modal then taps Delete on
  another device): tRPC throws NOT_FOUND → catch in mutation
  `onError` → toast "This recurring expense was already deleted" →
  close modal.

## Testing

- **Unit**: `RepeatAndEndDateSection` extraction shouldn't change
  behavior; existing `recurrencePresets.test.ts` (27 tests) and
  `AddExpenseForm.type.test.ts` (12 tests) must continue to pass after
  the refactor.
- **Component**: smoke test for `RecurringExpenseDetailsModal` rendering
  the right Sections given a mock template (no shares vs. with shares,
  with endDate vs. without).
- **Manual UAT** (per the full-environment-UAT memory): one cycle each
  for view, edit-and-save, edit-and-discard, delete. Verify DB state +
  AWS Scheduler state via Supabase MCP and `aws scheduler get-schedule`.

## Out of scope for this design

- Pause/resume (backend doesn't support; would be a separate spec).
- Bulk operations (cancel multiple, edit-all-of-frequency-X).
- Per-occurrence editing (calendar-style "this vs. all future").
- Surfacing recurring schedules in the chat-list summary row.
- Editing payer / splits / category / currency on a template (backend
  would need extending; revisit if users ask).
