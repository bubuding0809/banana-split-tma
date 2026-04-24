# Recurring Expenses — Design Spec

**Date:** 2026-04-24
**Branch (brainstorm):** `feat/recurring-expenses`
**Worktree:** `../banana-split-tma-recurring`

## Goal

Let users mark any expense as **recurring** at creation time — choosing a frequency (Daily/Weekly/Biweekly/Monthly/Every 3/6 Months/Yearly, or a Custom interval) and an optional end date. The recurrence is persisted as a template, scheduled with AWS EventBridge Scheduler, and each scheduled fire materialises a new `Expense` row via the existing `createExpenseHandler`.

The picker UX mirrors Apple Reminders' "Repeat" + "End Date" pattern.

## Motivation

Subscriptions (Netflix, Spotify, gym), bills (rent, phone, internet), and standing arrangements (weekly cleaner, monthly allowance) are all expressed as the *same* shared expense, every period. Today users re-enter them by hand, which is friction-heavy and easy to forget. The bot already has a programmatic `createExpenseHandler` reachable from both the TMA and the Telegram bot — we just need a scheduled trigger and a template-shaped record to drive it.

## Locked scope

| Decision | Choice |
|---|---|
| Scope of feature | General-purpose recurring expenses (subscriptions, bills, standing arrangements) |
| Per-occurrence mutability | Edit-the-template-only — template is the source of truth, edits affect future occurrences, past occurrences stay as-was |
| Compute target on schedule fire | EventBridge Scheduler → external **RecurringExpenseLambda** (in `bananasplit-tgbot` AWS repo, mirrors GroupReminderLambda pattern) → HMAC-signed POST to `/api/internal/recurring-expense-tick` on `apps/lambda` |
| Auth between AWS and Vercel | HMAC-SHA256 with shared secret `RECURRING_EXPENSE_WEBHOOK_SECRET` |
| End condition | Optional **End Date** only. Open-ended by default (user cancels manually) |
| Frequency scope | Apple Reminders presets + Custom interval. Specifically: Daily, Weekly, Biweekly, Monthly, Every 3 Months, Every 6 Months, Yearly, Custom (every N days/weeks/months) with weekday picker for Weekly. **Skip** Hourly and positional-weekday rules ("first Monday of every month") |
| Time of day each occurrence fires | Fixed at 9:00 AM in the chat's timezone. No time picker exposed |
| Timezone | Chat-level — `Chat.timezone` (IANA, e.g. `Asia/Singapore`). Seeded from creator's locale on first set |
| First occurrence behaviour | Form submission creates today's expense as normal **and** sets up the recurring template. EventBridge fires the next occurrence on the next scheduled date |
| Notifications | Each materialised occurrence sends the standard "new expense" Telegram notification, exactly like a manually created expense |
| Manage existing recurring expenses | Both — dedicated list page under Chat Settings + 🔁 badge on each materialised `Expense` in the activity list |
| Picker placement | Always-visible Cell inside the existing **Details** Section in the amount step, immediately after the **Transaction Date** Cell |
| Picker UX | Bottom-sheet `Modal` (telegram-ui), Apple Reminders style: top-level preset list + "Custom..." sub-screen + "End Date" sub-screen |

## Out of scope (v1)

- Pause vs. cancel — user must cancel + recreate to re-enable.
- "Skip next occurrence" button.
- "Apply this change to all past occurrences too."
- Hourly frequency.
- Positional weekday rules ("first Monday of every month").
- Per-occurrence time-of-day picker.
- Per-template timezone (always uses chat timezone).
- Email/push notifications outside Telegram.
- Backfill of missed occurrences if a `startDate` is in the past — EventBridge's `StartDate` honors only the next future occurrence.
- Editable past occurrences re-syncing back to the template.

## Architecture

## Why a separate Lambda?

AWS EventBridge Scheduler does not support direct HTTPS endpoints (universal targets only invoke AWS APIs — Lambda, SQS, SNS, etc.). The cleanest path is the existing GroupReminderLambda pattern — a tiny external Lambda that forwards to our Vercel webhook with the HMAC signature. The Lambda lives in the same `bananasplit-tgbot` AWS repo that already houses `GroupReminderLambda`, mirrors its structure, and adds no new infra concepts to the team.

### Data model — Prisma additions

```prisma
model RecurringExpenseTemplate {
  id                  String          @id @default(uuid())
  chat                Chat            @relation(fields: [chatId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  chatId              BigInt
  creatorId           BigInt
  payerId             BigInt

  // Locked occurrence shape (snapshot of the form values at template-create time)
  description         String
  amount              Decimal         @db.Decimal(12, 2)
  currency            String
  splitMode           SplitMode
  participantIds      BigInt[]
  customSplits        Json?           // { userId: amount } shape, mirrors createExpense input
  categoryId          String?

  // Schedule definition (the user's structured choice)
  frequency           RecurrenceFrequency
  interval            Int             @default(1)            // "every N <freq>"
  weekdays            Weekday[]                              // only meaningful for WEEKLY
  startDate           DateTime                               // = the form's transaction date at create time
  endDate             DateTime?
  timezone            String                                 // IANA, denormalised from chat at create time

  // External refs
  awsScheduleName     String          @unique                // "recurring-expense-{id}"
  status              RecurringStatus @default(ACTIVE)

  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  expenses            Expense[]                              // materialised occurrences (back-relation)

  @@index([chatId, status])
}

enum RecurrenceFrequency {
  DAILY
  WEEKLY
  MONTHLY
  YEARLY
}

enum Weekday { SUN MON TUE WED THU FRI SAT }

enum RecurringStatus { ACTIVE CANCELED ENDED }
```

Edits to existing models:

```prisma
model Expense {
  // ... existing fields
  recurringTemplateId String?
  recurringTemplate   RecurringExpenseTemplate? @relation(fields: [recurringTemplateId], references: [id], onDelete: SetNull)

  @@unique([recurringTemplateId, date])  // dedupe key — AWS retries cannot double-create
}

model Chat {
  // ... existing fields
  timezone            String?                                // IANA, e.g. "Asia/Singapore"
  recurringExpenses   RecurringExpenseTemplate[]
}
```

`Chat.timezone` is nullable because existing chats have none today; on first recurring-expense create we seed it from the creator's `tg_initData.user` locale (or `Asia/Singapore` as fallback). A small migration backfill is not required — non-recurring expenses do not read it.

### tRPC API additions

All under the existing `expense` router (`packages/trpc/src/routers/expense/`):

| Procedure | Input | Behaviour |
|---|---|---|
| `expense.createWithRecurrence` | `createExpense` input + `recurrence: { frequency, interval, weekdays, endDate }` | DB transaction creates today's `Expense` + `RecurringExpenseTemplate`. Then `CreateScheduleCommand`. If AWS fails, rollback the DB transaction and surface error. Existing `createExpense` mutation is untouched and serves all non-recurring submissions |
| `expense.recurring.list` | `{ chatId }` | List `ACTIVE` templates with computed next-fire date |
| `expense.recurring.get` | `{ templateId }` | Single template + recent materialised occurrences |
| `expense.recurring.update` | template fields (partial) | DB update + AWS `UpdateScheduleCommand` if any schedule field (frequency / interval / weekdays / endDate / timezone) changed. Failure path: revert DB, surface error |
| `expense.recurring.cancel` | `{ templateId }` | DB soft-set `status=CANCELED` + AWS `DeleteScheduleCommand` |

### AWS layer additions

New utility + router files mirroring the existing `groupReminderUtils.ts` / `createGroupReminderSchedule.ts` shape:

- `packages/trpc/src/routers/aws/utils/recurringExpenseScheduler.ts` — name normaliser (`recurring-expense-{templateId}`), HMAC sign/verify helpers (used by Task 10's webhook verifier; the Lambda computes the same HMAC at fire time), schedule-group constant.
- `packages/trpc/src/routers/aws/utils/scheduleParser.ts` — extend with `buildExpenseCron({ frequency, interval, weekdays, hour: 9, minute: 0 })` returning the AWS cron expression. Skip the human-DSL path for this code; we go directly from structured fields to cron.
- `expense.createWithRecurrence` / `update` / `cancel` delegate to the existing `createRecurringScheduleHandler` / equivalent helpers, mirroring how `createGroupReminderSchedule.ts` does it. The schedule's `Target.Arn` is the new `RecurringExpenseLambda` ARN (`AWS_RECURRING_EXPENSE_LAMBDA_ARN`); `Target.Input` is the JSON `{ templateId, occurrenceDate: "<aws.scheduler.scheduled-time>" }`.

Changes vs. existing reminder pattern:

- **Use `UpdateScheduleCommand` instead of delete-then-recreate.** The current `updateGroupReminderSchedule` deletes then recreates, which leaves a window where the schedule does not exist. Recurring expenses should not have that window.
- **EventBridge schedule group** = `recurring-expenses` (vs. the reminders' `default`). Aids IAM scoping and listing.
- **Lambda target** (the new external `RecurringExpenseLambda`) — same target type as `GroupReminderLambda`. The Lambda forwards each fire to our Vercel webhook with an HMAC signature, since EventBridge Scheduler cannot post directly to arbitrary HTTPS endpoints.

### EventBridge → Vercel data flow

```
EventBridge Scheduler (cron)
   ↓
EventBridge Scheduler → RecurringExpenseLambda (external, ~30 lines) → POST to lambda-vercel-url with HMAC
   Headers: Content-Type: application/json
            X-Recurring-Signature: <hex>
   Body: {
     "templateId": "<uuid>",
     "occurrenceDate": "<ISO 8601>"   // = AWS scheduled-time substitution
   }
   ↓
apps/lambda endpoint:
   1. Read X-Recurring-Signature.
   2. Recompute HMAC_SHA256(secret, "{templateId}|{occurrenceDate}").
   3. constant-time-compare. Reject 401 on mismatch.
   4. Load template; reject 410 if status != ACTIVE.
   5. Reject 410 if endDate < occurrenceDate.
   6. Validate participants still exist in chat — if any missing, log + post a "skipped occurrence" message to the chat, return 200 (so AWS doesn't retry).
   7. Reject 401 if |now - occurrenceDate| > 15 minutes (freshness).
   8. Call createExpenseHandler with snapshot fields, passing
      Expense.date = occurrenceDate truncated to UTC midnight (so the
      (recurringTemplateId, date) unique constraint matches the dedupe semantics).
   9. Standard Telegram notification fires from createExpenseHandler.
```

The HMAC signature is computed once at schedule-create time and embedded as a static string in EventBridge's `Target.Input`. AWS substitutes `<aws.scheduler.scheduled-time>` into the body but the signature is over `templateId|occurrenceDate`, where `occurrenceDate` is also substituted. So the HMAC must be computed for each fire — meaning we either:

- **(Chosen)** Sign over `templateId` only (not date), and trust AWS's authenticated-target plumbing for the date. The signature proves the template ID came from us; the date is what AWS gives us. This means a signature is per-template, fixed at create time. Replay protection is provided by:
  1. `(recurringTemplateId, date)` unique index on `Expense` — same date can never produce two rows.
  2. **Freshness check** on the endpoint — reject if `|now - occurrenceDate| > 15 minutes`. Blocks an attacker (who somehow captured a valid signature) from materialising arbitrary back/forward-dated occurrences.
  3. The endpoint also rejects if `occurrenceDate > template.endDate`.

- (Rejected) Send the template ID alone and sign each request with a per-fire HMAC — would require AWS to recompute the signature per fire, which it cannot do natively. (We *do* run a Lambda in front of EventBridge per the architecture pivot, but it signs over `templateId` only — no per-fire body — so the HMAC stays static and verifiable.)

### New env vars

| Var | Where | Purpose |
|---|---|---|
| `AWS_RECURRING_EXPENSE_LAMBDA_ARN` | tRPC env (writes schedules) | ARN of the external `RecurringExpenseLambda`; passed as the schedule's `Target.Arn` by `createWithRecurrence` / `update` |
| `RECURRING_EXPENSE_WEBHOOK_SECRET` | apps/lambda env (verifies tick) + RecurringExpenseLambda env (signs tick) | Shared 32-byte hex secret for HMAC. Set in BOTH the Lambda's config and Vercel — must match |
| `RECURRING_EXPENSE_WEBHOOK_URL` | RecurringExpenseLambda env only | Fully-qualified Vercel URL of the tick endpoint. Lives on the Lambda side, NOT in this monorepo |
| (existing) `AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN` | reused | EventBridge service role; needs `scheduler:*` plus `lambda:InvokeFunction` on the new RecurringExpenseLambda ARN |

The EventBridge IAM role used by group reminders does not need any change — universal HTTP targets do not require additional IAM.

### Failure modes & idempotency

| Failure | Recovery |
|---|---|
| DB write succeeds, AWS create fails | DB transaction rolls back. User sees error, can retry |
| DB update succeeds, AWS update fails | Revert DB update inside the same handler. User sees error |
| DB cancel succeeds, AWS delete fails | Treat as recoverable — record the failure in logs and a `pendingDelete` flag (out of scope v1: just retry on next manual visit). For v1 we surface the error and ask user to retry; AWS will keep firing until cleaned up, but the endpoint will reject because `status != ACTIVE` |
| EventBridge fires but template was deleted in flight | Endpoint returns 200 after detecting missing/inactive template (logs and no-ops) — AWS does not retry |
| EventBridge fires twice for the same occurrence (rare AWS behaviour) | Unique index `(recurringTemplateId, date)` makes the second insert a no-op |
| Participant left chat between schedule and fire | Endpoint posts a "skipped" message to the chat, returns 200, no expense created |
| Vercel cold start exceeds AWS retry window | EventBridge retry policy: 3 retries, 24h max event age (existing default) |

## UI

### Amount step — placement

In `apps/web/src/components/features/Expense/AmountFormStep.tsx`, the existing **Details Section** (Description Textarea + Date Cell) gets a third Cell appended immediately after Date:

```
┌─ "Details" label · 7/60 chars ──────┐
│ ┌─ Section ─────────────────────┐   │
│ │ Spotify                       │   │  ← Textarea (existing)
│ │ ─────────────────────────────── │   │
│ │ 📅 Transaction Date  24 Apr › │   │  ← Date Cell (existing)
│ │ ─────────────────────────────── │   │
│ │ 🔁 Repeat            Never  › │   │  ← NEW
│ └───────────────────────────────┘   │
└─────────────────────────────────────┘
```

Cell uses lucide `Repeat` icon (matches the existing `Calendar` icon styling for Date), label "Repeat", `after` shows a human-readable summary ("Never", "Weekly", "Every 2 weeks on Mon, Fri", "Monthly until 31 Dec"), `onClick` opens the `RecurrencePickerSheet`.

### Recurrence picker sheet

New file `apps/web/src/components/features/Expense/RecurrencePickerSheet.tsx`. Built on telegram-ui `Modal` (matches `CategoryPickerSheet.tsx` and `EditReminderScheduleModal.tsx` patterns).

Three internal states (sub-screens within the same Modal, no route change):

1. **Top-level**:

   ```
   ┌─ Repeat ──────────────────────── × ─┐
   │ ┌────────────────────────────────┐  │
   │ │ Never                          │  │
   │ │ Daily                          │  │
   │ │ Weekly                       ✓ │  │
   │ │ Biweekly                       │  │
   │ │ Monthly                        │  │
   │ │ Every 3 Months                 │  │
   │ │ Every 6 Months                 │  │
   │ │ Yearly                         │  │
   │ │ Custom...                    › │  │
   │ └────────────────────────────────┘  │
   │ ┌────────────────────────────────┐  │
   │ │ End Date              Never  › │  │
   │ └────────────────────────────────┘  │
   │ Section.footer:                     │
   │ "Fires at 9:00 AM Singapore time.   │
   │  Today's expense will be created    │
   │  now; next fire is Mon 4 May."      │
   └─────────────────────────────────────┘
   ```

2. **Custom sub-screen** (when "Custom..." tapped):

   ```
   ┌─ ‹ Back     Custom        Done ─────┐
   │ ┌────────────────────────────────┐  │
   │ │ Frequency           Weekly   › │  │  ← native <select> over Cell
   │ │ Every             2 weeks    › │  │  ← native <select> over Cell
   │ └────────────────────────────────┘  │
   │ ┌────────────────────────────────┐  │
   │ │ ON THESE DAYS                  │  │  ← Section header (only when Weekly)
   │ │  ⚪  ●  ⚪  ⚪  ⚪  ●  ⚪         │  │
   │ │  S   M   T   W   T   F   S     │  │
   │ └────────────────────────────────┘  │
   │ Section.footer summary              │
   └─────────────────────────────────────┘
   ```

3. **End Date sub-screen** (when "End Date" tapped):

   ```
   ┌─ ‹ Back   End Date         Done ────┐
   │ ┌────────────────────────────────┐  │
   │ │ No end date                  ✓ │  │
   │ └────────────────────────────────┘  │
   │ ┌────────────────────────────────┐  │
   │ │ Pick a date          (calendar)│  │  ← native <input type="date">
   │ └────────────────────────────────┘  │
   └─────────────────────────────────────┘
   ```

Form integration:

- Add a nested field `recurrence` to `expenseFormSchema` in `AddExpenseForm.type.ts`. The form holds the user-facing **preset** (Daily / Weekly / Biweekly / Monthly / Every 3 Months / Every 6 Months / Yearly / Custom), plus structured custom params. A small `presetToTemplate(preset, custom)` helper normalises this into the persisted `(frequency, interval, weekdays)` triple before calling the mutation. So Biweekly → `{frequency: WEEKLY, interval: 2}`, Every 3 Months → `{frequency: MONTHLY, interval: 3}`, etc.
  ```ts
  // form-level shape (UI only)
  recurrence: z.discriminatedUnion("preset", [
    z.object({ preset: z.literal("NONE") }),
    z.object({
      preset: z.enum([
        "DAILY","WEEKLY","BIWEEKLY","MONTHLY",
        "EVERY_3_MONTHS","EVERY_6_MONTHS","YEARLY","CUSTOM"
      ]),
      // The next three are only inspected when preset === "CUSTOM"
      customFrequency: z.enum(["DAILY","WEEKLY","MONTHLY","YEARLY"]).default("WEEKLY"),
      customInterval: z.number().int().positive().default(1),
      // weekdays apply to WEEKLY (preset or custom)
      weekdays: z.array(z.enum(["SUN","MON","TUE","WED","THU","FRI","SAT"])).default([]),
      endDate: z.string().optional(),  // ISO YYYY-MM-DD
    }),
  ]).default({ preset: "NONE" })
  ```
- Cross-field zod refine on `expenseFormSchema`: if `recurrence.endDate` is set, it must be `>= date` (the transaction date).
- `AmountFormStep` MainButton handler ([line 78–134](apps/web/src/components/features/Expense/AmountFormStep.tsx#L78)) does not need new touched-bookkeeping — `recurrence.preset` defaults to `"NONE"` so it cannot be invalid; if Weekly (preset or custom) is picked with empty weekdays, the Done button in the sheet enforces validity before closing.
- `AddExpensePage.tsx` `onSubmit` ([line 139–154](apps/web/src/components/features/Expense/AddExpensePage.tsx#L139)) branches: `recurrence.preset === "NONE"` → `expense.createExpense.mutateAsync(...)` (existing path); otherwise → `presetToTemplate(...)` then `expense.createWithRecurrence.mutateAsync(...)`.

### Manage page — `/chat/$chatId/recurring-expenses`

New TanStack Router route + page component. Lists `ACTIVE` templates as Cells:

```
┌─ Recurring expenses ────────────────┐
│ ┌────────────────────────────────┐  │
│ │ 🔁 Spotify          $50.00 USD │  │
│ │    Monthly · Next: 24 May    › │  │
│ ├────────────────────────────────┤  │
│ │ 🔁 Cleaner          $80.00 SGD │  │
│ │    Every 2 wks Mon · Next: 5/5│  │
│ ├────────────────────────────────┤  │
│ │ 🔁 Rent          $1,800.00 SGD │  │
│ │    Monthly · Until 31 Dec    › │  │
│ └────────────────────────────────┘  │
│       [ + New recurring expense ]   │
└─────────────────────────────────────┘
```

Tap a template → opens `RecurrencePickerSheet` prefilled (same component, `mode="edit"`) plus an "Edit underlying expense fields" button that routes to a thin "edit template" form (description / amount / currency / payer / splits — same shape as the amount step). Cancel button at the bottom (destructive style, confirmation dialog).

Entry point: a new "Recurring expenses" Cell added to `ChatSettingsPage.tsx`, sitting next to the existing "Recurring Reminders" section.

### Occurrence badge in activity list

Each `Expense` rendered in the activity list (existing list in `apps/web/src/components/features/Chat/`) checks `recurringTemplateId`. If set, render a small lucide `Repeat` chip in the trailing area of the row. Tap chip → bottom sheet with:

- Template summary ("Spotify $50 USD · Monthly · Until cancelled")
- "View template details" — routes to manage page detail
- "Edit template" — opens picker sheet
- "Cancel template" — confirmation + cancel mutation
- "Edit just this occurrence" — routes to the existing edit-expense flow (template untouched)

## File map

### New files

| Path | Purpose |
|---|---|
| `packages/database/prisma/migrations/<timestamp>_recurring_expenses/migration.sql` | Schema migration |
| `packages/trpc/src/routers/expense/createExpenseWithRecurrence.ts` | New mutation, transactional create |
| `packages/trpc/src/routers/expense/recurring/list.ts` | List active templates |
| `packages/trpc/src/routers/expense/recurring/get.ts` | Get single template |
| `packages/trpc/src/routers/expense/recurring/update.ts` | Update + AWS UpdateSchedule |
| `packages/trpc/src/routers/expense/recurring/cancel.ts` | Soft-cancel + AWS DeleteSchedule |
| `packages/trpc/src/routers/aws/utils/recurringExpenseScheduler.ts` | Name builder, HMAC builder, target builder |
| `apps/web/src/components/features/Expense/RecurrencePickerSheet.tsx` | The picker Modal |
| `apps/web/src/components/features/Expense/recurrenceUtils.ts` | Cron builder + summary string formatter (shared between web + tRPC) — actually lives in a shared package, see Note below |
| `apps/web/src/routes/chat/$chatId/recurring-expenses.tsx` | Manage list route |
| `apps/web/src/components/features/Expense/RecurringTemplatesList.tsx` | List page UI |
| `apps/web/src/components/features/Expense/RecurringExpenseBadge.tsx` | 🔁 chip in activity row |
| `apps/lambda/api/recurring-expense-tick.ts` | HMAC-verifying webhook handler |

**Note on shared cron logic**: the cron string builder needs to live somewhere both the tRPC layer and the web layer can use (web layer needs it to render the human-readable summary). Place in `packages/trpc/src/routers/aws/utils/scheduleParser.ts` (extend existing) and re-export from a small `@repo/recurrence` helper or directly import the builder. Pick during implementation; existing patterns in the repo lean toward keeping it in `packages/trpc` and having `apps/web` call a tRPC query for the summary. **Implementation choice deferred to plan stage.**

### Edited files

| Path | Change |
|---|---|
| `packages/database/prisma/schema.prisma` | Add `RecurringExpenseTemplate` model, enums, FK on `Expense`, `timezone` on `Chat` |
| `packages/trpc/src/routers/expense/index.ts` | Wire new procedures + nested `recurring` sub-router |
| `packages/trpc/src/routers/aws/utils/scheduleParser.ts` | Add `buildExpenseCron` |
| `apps/web/src/components/features/Expense/AddExpenseForm.type.ts` | Add `recurrence` to schema |
| `apps/web/src/components/features/Expense/AmountFormStep.tsx` | Add Repeat Cell after Date Cell in Details Section |
| `apps/web/src/components/features/Expense/AddExpensePage.tsx` | Branch on `recurrence.frequency` in onSubmit |
| `apps/web/src/components/features/Settings/ChatSettingsPage.tsx` | Add "Recurring expenses" entry |
| `apps/lambda/env/.env.production.example` | Add `RECURRING_EXPENSE_WEBHOOK_*` vars |
| `apps/web/src/components/features/Chat/<activity row>.tsx` | Render 🔁 badge if `recurringTemplateId` set |

### Infra

- AWS EventBridge Scheduler — create new schedule group `recurring-expenses` (one-time, prod). The existing scheduler IAM role needs `lambda:InvokeFunction` added for the new RecurringExpenseLambda ARN.
- External `bananasplit-tgbot` AWS repo — deploy the new `RecurringExpenseLambda` (see [`2026-04-24-recurring-expenses-lambda.md`](./2026-04-24-recurring-expenses-lambda.md)). Its env vars (`RECURRING_EXPENSE_WEBHOOK_URL`, `RECURRING_EXPENSE_WEBHOOK_SECRET`) live there, NOT in this monorepo.
- Vercel env (apps/lambda): `RECURRING_EXPENSE_WEBHOOK_SECRET` (32-byte hex, same value as in the Lambda).
- Vercel env (tRPC layer): `AWS_RECURRING_EXPENSE_LAMBDA_ARN` from the Lambda deployment output.

## Verification plan (UAT)

- Manual TMA walkthrough (one step at a time via AskUserQuestion): create a daily recurring expense for today + set end date for tomorrow → confirm today's expense exists immediately + tomorrow's fires at 9 AM chat-tz + day after does not fire.
- Manual TMA walkthrough: edit the template's amount → confirm next fire creates expense at new amount; past occurrence unchanged.
- Manual TMA walkthrough: cancel the template → confirm AWS schedule gone (`aws scheduler get-schedule --name recurring-expense-<id>` returns 404) + DB row marked `CANCELED`.
- Subagent script: HMAC verification — POST tick endpoint with bad signature → 401. With good signature but inactive template → 410. With duplicate `(templateId, date)` → 200 + no second row.
- Subagent script: schedule parser — `buildExpenseCron` for each preset returns a known-good cron string, verified against `aws scheduler create-schedule --schedule-expression`.

## Open questions deferred to implementation plan

1. Exact location of the shared cron-builder + summary helper (`packages/trpc` vs. a new `packages/recurrence`).
2. Should the manage page allow editing the locked occurrence shape (description, amount, payer, splits) in v1, or only the schedule fields? If yes, the same "Edit underlying expense fields" form is needed; if no, ship schedule-only edits in v1.
3. Telegram notification copy when an occurrence is auto-skipped due to a missing participant — exact wording.
