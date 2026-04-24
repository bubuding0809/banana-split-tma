# Recurring Expenses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users mark any expense as recurring (Apple Reminders-style frequency picker) at creation time. Each recurrence is persisted as a `RecurringExpenseTemplate`, scheduled with AWS EventBridge Scheduler, and each fire creates a regular `Expense` row via the existing `createExpenseHandler`.

**Architecture:** EventBridge Scheduler → universal HTTPS target → POST `/api/internal/recurring-expense-tick` on `apps/lambda` → HMAC verify → load template → call existing `createExpenseHandler`. Same code path materialises the occurrence, sends the standard Telegram notification.

**Tech Stack:** Prisma + PostgreSQL, tRPC v11 (zod inputs), `@aws-sdk/client-scheduler`, Express on Vercel for `apps/lambda`, TanStack Form + telegram-ui Modal for the TMA picker, lucide icons, date-fns. Tests: Vitest at `packages/trpc/`, manual UAT for TMA UI per the repo convention.

**Spec:** [docs/superpowers/specs/2026-04-24-recurring-expenses-design.md](../specs/2026-04-24-recurring-expenses-design.md)

---

## File Structure

### New backend files

| Path | Responsibility |
|---|---|
| `packages/database/prisma/migrations/<ts>_add_recurring_expenses/migration.sql` | Schema migration |
| `packages/trpc/src/routers/aws/utils/recurringExpenseScheduler.ts` | Schedule name builder, HMAC builder, HTTP target builder |
| `packages/trpc/src/routers/aws/utils/recurringExpenseScheduler.test.ts` | Unit tests for the helpers above |
| `packages/trpc/src/routers/aws/utils/buildExpenseCron.ts` | Structured `(frequency, interval, weekdays, hour, minute)` → AWS cron string |
| `packages/trpc/src/routers/aws/utils/buildExpenseCron.test.ts` | Unit tests |
| `packages/trpc/src/routers/aws/utils/recurrenceSummary.ts` | Human-readable summary like `"Every 2 weeks on Mon, Fri"` |
| `packages/trpc/src/routers/aws/utils/recurrenceSummary.test.ts` | Unit tests |
| `packages/trpc/src/routers/expense/createExpenseWithRecurrence.ts` | Transactional create: Expense + RecurringExpenseTemplate + AWS schedule |
| `packages/trpc/src/routers/expense/recurring/list.ts` | List ACTIVE templates for a chat |
| `packages/trpc/src/routers/expense/recurring/get.ts` | Single template details |
| `packages/trpc/src/routers/expense/recurring/update.ts` | Update template + AWS UpdateScheduleCommand |
| `packages/trpc/src/routers/expense/recurring/cancel.ts` | Soft-cancel + AWS DeleteScheduleCommand |
| `apps/lambda/api/recurring-expense-tick.ts` | Express route, HMAC verify, fire `createExpenseHandler` |
| `apps/lambda/api/recurring-expense-tick.test.ts` | Vitest unit test for HMAC + freshness logic |

### New frontend files

| Path | Responsibility |
|---|---|
| `apps/web/src/components/features/Expense/RecurrencePickerSheet.tsx` | The picker `Modal` (top-level + Custom + End Date sub-screens) |
| `apps/web/src/components/features/Expense/RecurrencePickerSheet.types.ts` | Preset enum, weekday enum, types shared with `presetToTemplate` |
| `apps/web/src/components/features/Expense/recurrencePresets.ts` | `presetToTemplate(preset, custom)` + label/cron helpers (UI side) |
| `apps/web/src/components/features/Expense/recurrencePresets.test.ts` | Unit tests for the preset → template normaliser |
| `apps/web/src/components/features/Expense/RecurringTemplatesList.tsx` | Manage page UI |
| `apps/web/src/components/features/Expense/RecurringExpenseBadge.tsx` | 🔁 chip + bottom sheet on tap |
| `apps/web/src/routes/_tma/chat.$chatId_.recurring-expenses.tsx` | TanStack Router route for the manage page |

### Edited files

| Path | Change |
|---|---|
| `packages/database/prisma/schema.prisma` | Add `RecurringExpenseTemplate`, enums, FK on `Expense`, `timezone` on `Chat` |
| `packages/trpc/src/routers/expense/index.ts` | Wire `createExpenseWithRecurrence` + nested `recurring` sub-router |
| `apps/web/src/components/features/Expense/AddExpenseForm.type.ts` | Add `recurrence` field with discriminated union |
| `apps/web/src/components/features/Expense/AddExpenseForm.tsx` | Add `recurrence` default value |
| `apps/web/src/components/features/Expense/AmountFormStep.tsx` | Add Repeat Cell after Date Cell in Details Section |
| `apps/web/src/components/features/Expense/AddExpensePage.tsx` | Branch on `recurrence.preset` in `onSubmit` |
| `apps/web/src/components/features/Settings/ChatSettingsPage.tsx` | Add "Recurring expenses" entry below `RecurringRemindersSection` |
| `apps/web/src/components/features/Chat/ChatExpenseCell.tsx` | Render `<RecurringExpenseBadge>` when `expense.recurringTemplateId` is set |
| `apps/lambda/api/index.ts` | Mount the new tick route |
| `apps/lambda/env/.env.production.example` | Add `RECURRING_EXPENSE_WEBHOOK_*` env vars |
| `apps/lambda/api/env.ts` | Add zod validation for the two new env vars |

---

## Phase 1 — Database schema

### Task 1: Prisma schema + migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_add_recurring_expenses/migration.sql` (auto-generated)

- [ ] **Step 1: Edit `packages/database/prisma/schema.prisma`** — add the new model, enums, and field changes. Append the following at the end of the file (Prisma reorders models on format):

```prisma
model RecurringExpenseTemplate {
  id              String          @id @default(uuid())
  chat            Chat            @relation(fields: [chatId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  chatId          BigInt
  creatorId       BigInt
  payerId         BigInt

  description     String
  amount          Decimal         @db.Decimal(12, 2)
  currency        String
  splitMode       SplitMode
  participantIds  BigInt[]
  customSplits    Json?
  categoryId      String?

  frequency       RecurrenceFrequency
  interval        Int             @default(1)
  weekdays        Weekday[]
  startDate       DateTime
  endDate         DateTime?
  timezone        String

  awsScheduleName String          @unique
  status          RecurringStatus @default(ACTIVE)

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  expenses        Expense[]

  @@index([chatId, status])
}

enum RecurrenceFrequency {
  DAILY
  WEEKLY
  MONTHLY
  YEARLY
}

enum Weekday {
  SUN
  MON
  TUE
  WED
  THU
  FRI
  SAT
}

enum RecurringStatus {
  ACTIVE
  CANCELED
  ENDED
}
```

Then modify the `Expense` model — add these two lines inside its block (right after `categoryId String?`):

```prisma
  recurringTemplateId String?
  recurringTemplate   RecurringExpenseTemplate? @relation(fields: [recurringTemplateId], references: [id], onDelete: SetNull)
```

And replace the existing `@@index([chatId, categoryId])` line with:

```prisma
  @@index([chatId, categoryId])
  @@unique([recurringTemplateId, date])
```

Then modify the `Chat` model — add these two lines inside its block (right before `members User[]`):

```prisma
  timezone           String?
  recurringExpenses  RecurringExpenseTemplate[]
```

- [ ] **Step 2: Generate migration**

Run: `cd packages/database && pnpm prisma migrate dev --name add_recurring_expenses --create-only`
Expected: a new migration directory `packages/database/prisma/migrations/<timestamp>_add_recurring_expenses/migration.sql` containing CREATE TABLE / ALTER TABLE statements.

- [ ] **Step 3: Inspect the generated SQL**

Run: `cat packages/database/prisma/migrations/*_add_recurring_expenses/migration.sql`
Expected: at minimum these statements:
- `CREATE TYPE "RecurrenceFrequency"`, `CREATE TYPE "Weekday"`, `CREATE TYPE "RecurringStatus"`
- `CREATE TABLE "RecurringExpenseTemplate" (...)` with all columns
- `ALTER TABLE "Expense" ADD COLUMN "recurringTemplateId" TEXT`
- `ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringTemplateId_fkey"`
- `CREATE UNIQUE INDEX "Expense_recurringTemplateId_date_key" ON "Expense"`
- `ALTER TABLE "Chat" ADD COLUMN "timezone" TEXT`

If anything is missing or extra, fix the schema and re-generate (`rm -rf` the migration dir first).

- [ ] **Step 4: Apply the migration locally**

Run: `cd packages/database && pnpm prisma migrate dev`
Expected: "Database is now in sync with your schema" + Prisma client regenerated.

- [ ] **Step 5: Commit**

```bash
cd packages/database && git add prisma/schema.prisma prisma/migrations/
git commit -m "✨ feat(database): add RecurringExpenseTemplate model"
```

---

## Phase 2 — Backend AWS plumbing

### Task 2: `buildExpenseCron` (structured → AWS cron string)

**Files:**
- Create: `packages/trpc/src/routers/aws/utils/buildExpenseCron.ts`
- Test: `packages/trpc/src/routers/aws/utils/buildExpenseCron.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/trpc/src/routers/aws/utils/buildExpenseCron.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildExpenseCron } from "./buildExpenseCron.js";

describe("buildExpenseCron", () => {
  const HOUR = 9;
  const MIN = 0;

  it("DAILY interval=1 → fires every day at 9am", () => {
    expect(buildExpenseCron({ frequency: "DAILY", interval: 1, weekdays: [], hour: HOUR, minute: MIN }))
      .toBe("cron(0 9 * * ? *)");
  });

  it("DAILY interval=3 → fires every 3rd day", () => {
    expect(buildExpenseCron({ frequency: "DAILY", interval: 3, weekdays: [], hour: HOUR, minute: MIN }))
      .toBe("cron(0 9 1/3 * ? *)");
  });

  it("WEEKLY interval=1 with one weekday → fires that day at 9am", () => {
    expect(buildExpenseCron({ frequency: "WEEKLY", interval: 1, weekdays: ["MON"], hour: HOUR, minute: MIN }))
      .toBe("cron(0 9 ? * MON *)");
  });

  it("WEEKLY interval=1 with multiple weekdays → comma-separated", () => {
    expect(buildExpenseCron({ frequency: "WEEKLY", interval: 1, weekdays: ["MON","FRI"], hour: HOUR, minute: MIN }))
      .toBe("cron(0 9 ? * MON,FRI *)");
  });

  it("WEEKLY interval=2 (biweekly) → uses startDate-anchored cron", () => {
    // Biweekly is implemented with an explicit startDate, not native cron support.
    // For now we accept that the cron will fire weekly and the endpoint is responsible
    // for skipping odd-week occurrences. Test asserts the weekly cron form is produced.
    expect(buildExpenseCron({ frequency: "WEEKLY", interval: 2, weekdays: ["MON"], hour: HOUR, minute: MIN }))
      .toBe("cron(0 9 ? * MON *)");
  });

  it("MONTHLY interval=1 → fires on the 1st at 9am", () => {
    expect(buildExpenseCron({ frequency: "MONTHLY", interval: 1, weekdays: [], hour: HOUR, minute: MIN, dayOfMonth: 15 }))
      .toBe("cron(0 9 15 * ? *)");
  });

  it("MONTHLY interval=3 → fires every 3rd month on day-of-month", () => {
    expect(buildExpenseCron({ frequency: "MONTHLY", interval: 3, weekdays: [], hour: HOUR, minute: MIN, dayOfMonth: 15 }))
      .toBe("cron(0 9 15 1/3 ? *)");
  });

  it("YEARLY interval=1 → fires on a specific month/day", () => {
    expect(buildExpenseCron({ frequency: "YEARLY", interval: 1, weekdays: [], hour: HOUR, minute: MIN, dayOfMonth: 15, month: 3 }))
      .toBe("cron(0 9 15 3 ? *)");
  });

  it("WEEKLY without weekdays throws", () => {
    expect(() => buildExpenseCron({ frequency: "WEEKLY", interval: 1, weekdays: [], hour: HOUR, minute: MIN }))
      .toThrow(/at least one weekday/i);
  });

  it("MONTHLY without dayOfMonth throws", () => {
    expect(() => buildExpenseCron({ frequency: "MONTHLY", interval: 1, weekdays: [], hour: HOUR, minute: MIN }))
      .toThrow(/dayOfMonth required/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/trpc && pnpm vitest run src/routers/aws/utils/buildExpenseCron.test.ts`
Expected: FAIL — "Cannot find module './buildExpenseCron.js'".

- [ ] **Step 3: Implement `buildExpenseCron`**

Create `packages/trpc/src/routers/aws/utils/buildExpenseCron.ts`:

```ts
export type CronFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type CronWeekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export interface BuildExpenseCronInput {
  frequency: CronFrequency;
  interval: number;          // >= 1
  weekdays: CronWeekday[];   // required for WEEKLY
  hour: number;              // 0-23
  minute: number;            // 0-59
  dayOfMonth?: number;       // 1-31, required for MONTHLY/YEARLY
  month?: number;            // 1-12, required for YEARLY
}

/**
 * Build an AWS EventBridge cron expression from structured inputs.
 *
 * AWS cron format: cron(minute hour day-of-month month day-of-week year)
 * Note: day-of-month and day-of-week are mutually exclusive — exactly one
 * must be `?`.
 *
 * Biweekly (WEEKLY interval=2) is emitted as a weekly cron — the tick
 * endpoint is responsible for skipping every other occurrence based on
 * the template's startDate.
 */
export function buildExpenseCron(input: BuildExpenseCronInput): string {
  const { frequency, interval, weekdays, hour, minute, dayOfMonth, month } = input;

  if (frequency === "WEEKLY" && weekdays.length === 0) {
    throw new Error("WEEKLY frequency requires at least one weekday");
  }
  if ((frequency === "MONTHLY" || frequency === "YEARLY") && !dayOfMonth) {
    throw new Error(`${frequency} frequency requires dayOfMonth`);
  }
  if (frequency === "YEARLY" && !month) {
    throw new Error("YEARLY frequency requires month");
  }

  const m = String(minute);
  const h = String(hour);

  switch (frequency) {
    case "DAILY": {
      const dom = interval === 1 ? "*" : `1/${interval}`;
      return `cron(${m} ${h} ${dom} * ? *)`;
    }
    case "WEEKLY": {
      const dow = weekdays.join(",");
      return `cron(${m} ${h} ? * ${dow} *)`;
    }
    case "MONTHLY": {
      const mon = interval === 1 ? "*" : `1/${interval}`;
      return `cron(${m} ${h} ${dayOfMonth} ${mon} ? *)`;
    }
    case "YEARLY": {
      return `cron(${m} ${h} ${dayOfMonth} ${month} ? *)`;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/trpc && pnpm vitest run src/routers/aws/utils/buildExpenseCron.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
cd packages/trpc
git add src/routers/aws/utils/buildExpenseCron.ts src/routers/aws/utils/buildExpenseCron.test.ts
git commit -m "✨ feat(trpc): add buildExpenseCron helper"
```

---

### Task 3: `recurrenceSummary` (template → human-readable string)

**Files:**
- Create: `packages/trpc/src/routers/aws/utils/recurrenceSummary.ts`
- Test: `packages/trpc/src/routers/aws/utils/recurrenceSummary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/trpc/src/routers/aws/utils/recurrenceSummary.test.ts
import { describe, it, expect } from "vitest";
import { formatRecurrenceSummary } from "./recurrenceSummary.js";

describe("formatRecurrenceSummary", () => {
  it("daily, no end", () => {
    expect(formatRecurrenceSummary({ frequency: "DAILY", interval: 1, weekdays: [], endDate: null }))
      .toBe("Every day");
  });
  it("every 3 days", () => {
    expect(formatRecurrenceSummary({ frequency: "DAILY", interval: 3, weekdays: [], endDate: null }))
      .toBe("Every 3 days");
  });
  it("weekly on Mon, Fri", () => {
    expect(formatRecurrenceSummary({ frequency: "WEEKLY", interval: 1, weekdays: ["MON","FRI"], endDate: null }))
      .toBe("Weekly on Mon, Fri");
  });
  it("biweekly on Mon", () => {
    expect(formatRecurrenceSummary({ frequency: "WEEKLY", interval: 2, weekdays: ["MON"], endDate: null }))
      .toBe("Every 2 weeks on Mon");
  });
  it("monthly", () => {
    expect(formatRecurrenceSummary({ frequency: "MONTHLY", interval: 1, weekdays: [], endDate: null }))
      .toBe("Monthly");
  });
  it("every 3 months", () => {
    expect(formatRecurrenceSummary({ frequency: "MONTHLY", interval: 3, weekdays: [], endDate: null }))
      .toBe("Every 3 months");
  });
  it("yearly until a date", () => {
    expect(formatRecurrenceSummary({ frequency: "YEARLY", interval: 1, weekdays: [], endDate: new Date("2027-12-31") }))
      .toBe("Yearly until 31 Dec 2027");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/trpc && pnpm vitest run src/routers/aws/utils/recurrenceSummary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/trpc/src/routers/aws/utils/recurrenceSummary.ts`:

```ts
import { format } from "date-fns";

type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type Weekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export interface RecurrenceSummaryInput {
  frequency: Frequency;
  interval: number;
  weekdays: Weekday[];
  endDate: Date | null;
}

const WEEKDAY_LABEL: Record<Weekday, string> = {
  SUN: "Sun", MON: "Mon", TUE: "Tue", WED: "Wed",
  THU: "Thu", FRI: "Fri", SAT: "Sat",
};

const UNIT_SINGULAR: Record<Frequency, string> = {
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
  YEARLY: "year",
};

export function formatRecurrenceSummary(input: RecurrenceSummaryInput): string {
  const { frequency, interval, weekdays, endDate } = input;
  let base: string;

  if (interval === 1) {
    base = {
      DAILY: "Every day",
      WEEKLY: weekdays.length
        ? `Weekly on ${weekdays.map((w) => WEEKDAY_LABEL[w]).join(", ")}`
        : "Weekly",
      MONTHLY: "Monthly",
      YEARLY: "Yearly",
    }[frequency];
  } else {
    const unit = `${UNIT_SINGULAR[frequency]}s`;
    base = `Every ${interval} ${unit}`;
    if (frequency === "WEEKLY" && weekdays.length) {
      base += ` on ${weekdays.map((w) => WEEKDAY_LABEL[w]).join(", ")}`;
    }
  }

  if (endDate) {
    return `${base} until ${format(endDate, "d MMM yyyy")}`;
  }
  return base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/trpc && pnpm vitest run src/routers/aws/utils/recurrenceSummary.test.ts`
Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
cd packages/trpc
git add src/routers/aws/utils/recurrenceSummary.ts src/routers/aws/utils/recurrenceSummary.test.ts
git commit -m "✨ feat(trpc): add formatRecurrenceSummary helper"
```

---

### Task 4: `recurringExpenseScheduler` (name builder + HMAC helpers)

> ⚠️ **Architecture pivot (2026-04-24):** EventBridge Scheduler doesn't support direct HTTPS targets. The HTTP target builder previously planned here is **gone**. The scheduler util now exposes only: name builder, HMAC sign/verify, and the schedule-group constant. The actual Lambda target is constructed by delegating to the existing `createRecurringScheduleHandler` in Task 5.

**Files:**
- Create: `packages/trpc/src/routers/aws/utils/recurringExpenseScheduler.ts`
- Test: `packages/trpc/src/routers/aws/utils/recurringExpenseScheduler.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/trpc/src/routers/aws/utils/recurringExpenseScheduler.test.ts
import { describe, it, expect } from "vitest";
import {
  buildRecurringExpenseScheduleName,
  signRecurringExpensePayload,
  verifyRecurringExpenseSignature,
} from "./recurringExpenseScheduler.js";

describe("buildRecurringExpenseScheduleName", () => {
  it("uses fixed prefix + uuid", () => {
    expect(buildRecurringExpenseScheduleName("abc-123"))
      .toBe("recurring-expense-abc-123");
  });
});

describe("signRecurringExpensePayload / verifyRecurringExpenseSignature", () => {
  const SECRET = "a".repeat(64);

  it("round-trips", () => {
    const sig = signRecurringExpensePayload("template-123", SECRET);
    expect(verifyRecurringExpenseSignature("template-123", sig, SECRET)).toBe(true);
  });

  it("rejects tampered templateId", () => {
    const sig = signRecurringExpensePayload("template-123", SECRET);
    expect(verifyRecurringExpenseSignature("template-456", sig, SECRET)).toBe(false);
  });

  it("rejects tampered signature", () => {
    expect(verifyRecurringExpenseSignature("template-123", "deadbeef", SECRET))
      .toBe(false);
  });

  it("constant-time compare even with mismatched lengths", () => {
    expect(verifyRecurringExpenseSignature("template-123", "short", SECRET))
      .toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/trpc && pnpm vitest run src/routers/aws/utils/recurringExpenseScheduler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/trpc/src/routers/aws/utils/recurringExpenseScheduler.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function buildRecurringExpenseScheduleName(templateId: string): string {
  return `recurring-expense-${templateId}`;
}

/**
 * HMAC-SHA256 over just the templateId. Computed by the external
 * RecurringExpenseLambda for each fire and verified by the Vercel
 * webhook endpoint. Kept here so Task 10's webhook can verify what
 * the Lambda will sign.
 *
 * Replay protection lives elsewhere:
 *   - Unique index on (recurringTemplateId, date) blocks duplicate writes.
 *   - The endpoint checks |now - occurrenceDate| <= 15 min for freshness.
 *   - The endpoint checks occurrenceDate <= template.endDate.
 */
export function signRecurringExpensePayload(templateId: string, secret: string): string {
  return createHmac("sha256", secret).update(templateId).digest("hex");
}

export function verifyRecurringExpenseSignature(
  templateId: string,
  providedSignature: string,
  secret: string,
): boolean {
  const expected = signRecurringExpensePayload(templateId, secret);
  if (expected.length !== providedSignature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(providedSignature, "hex"));
  } catch {
    return false;
  }
}

export const RECURRING_EXPENSE_SCHEDULE_GROUP = "recurring-expenses";
```

> **Note:** The previous `buildRecurringExpenseHttpTarget` helper and `RecurringExpenseHttpTarget` type are **gone** post-pivot. The schedule's Lambda target is constructed by `createRecurringScheduleHandler` in Task 5.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/trpc && pnpm vitest run src/routers/aws/utils/recurringExpenseScheduler.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
cd packages/trpc
git add src/routers/aws/utils/recurringExpenseScheduler.ts src/routers/aws/utils/recurringExpenseScheduler.test.ts
git commit -m "✨ feat(trpc): add recurringExpenseScheduler helpers"
```

---

## Phase 3 — Backend tRPC API

### Task 5: `createExpenseWithRecurrence` mutation

**Files:**
- Create: `packages/trpc/src/routers/expense/createExpenseWithRecurrence.ts`
- Modify: `packages/trpc/src/routers/expense/index.ts`

> ⚠️ **Architecture pivot (2026-04-24):** Instead of building a Universal HTTP Target inline, this mutation now delegates to the existing `createRecurringScheduleHandler` (mirror of `createGroupReminderSchedule.ts`) with the new external `RecurringExpenseLambda` ARN. Env var guard is `AWS_RECURRING_EXPENSE_LAMBDA_ARN`.

- [ ] **Step 1: Implement the mutation**

Create `packages/trpc/src/routers/expense/createExpenseWithRecurrence.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import {
  inputSchema as createExpenseInputSchema,
  createExpenseHandler,
} from "./createExpense.js";
import { createRecurringScheduleHandler } from "../aws/createRecurringSchedule.js";
import {
  buildRecurringExpenseScheduleName,
  RECURRING_EXPENSE_SCHEDULE_GROUP,
} from "../aws/utils/recurringExpenseScheduler.js";
import { buildExpenseCron } from "../aws/utils/buildExpenseCron.js";

const FREQUENCY = z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
const WEEKDAY = z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]);

const recurrenceSchema = z.object({
  frequency: FREQUENCY,
  interval: z.number().int().positive(),
  weekdays: z.array(WEEKDAY),
  endDate: z.date().optional(),
  // The chat's timezone, denormalised onto the template at create time.
  timezone: z.string().min(1),
});

export const inputSchema = z.object({
  expense: createExpenseInputSchema,
  recurrence: recurrenceSchema,
});

const FIRE_HOUR = 9;
const FIRE_MIN = 0;

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.expense.chatId);

    if (!process.env.AWS_RECURRING_EXPENSE_LAMBDA_ARN) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AWS_RECURRING_EXPENSE_LAMBDA_ARN not configured",
      });
    }

    // For MONTHLY/YEARLY, derive dayOfMonth (and month) from the
    // expense's transaction date so the schedule fires on the same
    // calendar day as the user's first occurrence.
    const startDate = input.expense.date ?? new Date();
    const dayOfMonth = startDate.getUTCDate();
    const month = startDate.getUTCMonth() + 1;

    const cronExpression = buildExpenseCron({
      frequency: input.recurrence.frequency,
      interval: input.recurrence.interval,
      weekdays: input.recurrence.weekdays,
      hour: FIRE_HOUR,
      minute: FIRE_MIN,
      dayOfMonth:
        input.recurrence.frequency === "MONTHLY" ||
        input.recurrence.frequency === "YEARLY"
          ? dayOfMonth
          : undefined,
      month: input.recurrence.frequency === "YEARLY" ? month : undefined,
    });

    // 1. DB transaction: create immediate Expense + RecurringExpenseTemplate.
    //    A failed AWS create later in the function rolls this back.
    const { template, expense } = await ctx.db.$transaction(async (tx) => {
      const tmpl = await tx.recurringExpenseTemplate.create({
        data: {
          chatId: input.expense.chatId,
          creatorId: input.expense.creatorId,
          payerId: input.expense.payerId,
          description: input.expense.description,
          amount: input.expense.amount,
          currency: input.expense.currency ?? "SGD",
          splitMode: input.expense.splitMode,
          participantIds: input.expense.participantIds,
          customSplits: input.expense.customSplits ? JSON.parse(JSON.stringify(input.expense.customSplits)) : null,
          categoryId: input.expense.categoryId ?? null,
          frequency: input.recurrence.frequency,
          interval: input.recurrence.interval,
          weekdays: input.recurrence.weekdays,
          startDate,
          endDate: input.recurrence.endDate ?? null,
          timezone: input.recurrence.timezone,
          awsScheduleName: "", // placeholder — set below
        },
      });

      const scheduleName = buildRecurringExpenseScheduleName(tmpl.id);
      const updated = await tx.recurringExpenseTemplate.update({
        where: { id: tmpl.id },
        data: { awsScheduleName: scheduleName },
      });

      // Materialise today's expense linked to the template.
      const exp = await createExpenseHandler(
        { ...input.expense, sendNotification: input.expense.sendNotification },
        tx as unknown as typeof ctx.db,
        ctx.teleBot,
      );
      await tx.expense.update({
        where: { id: exp.id },
        data: { recurringTemplateId: updated.id },
      });

      return { template: updated, expense: exp };
    });

    // 2. Create the AWS schedule via the existing createRecurringScheduleHandler
    //    (same pattern as createGroupReminderSchedule.ts). On failure, roll back
    //    the template (keep the immediate Expense — user added it manually in spirit).
    //
    //    The schedule's Lambda target is the external RecurringExpenseLambda
    //    in the bananasplit-tgbot AWS repo; it forwards each fire to
    //    /api/internal/recurring-expense-tick with the HMAC signature.
    try {
      await createRecurringScheduleHandler({
        scheduleName: template.awsScheduleName,
        scheduleExpression: cronExpression,
        lambdaArn: process.env.AWS_RECURRING_EXPENSE_LAMBDA_ARN!,
        payload: {
          templateId: template.id,
          occurrenceDate: "<aws.scheduler.scheduled-time>",
        },
        description: `Recurring expense ${template.id} for chat ${template.chatId}`,
        timezone: input.recurrence.timezone,
        startDate,
        endDate: input.recurrence.endDate ?? undefined,
        enabled: true,
        scheduleGroup: RECURRING_EXPENSE_SCHEDULE_GROUP,
      });
    } catch (awsError) {
      await ctx.db.recurringExpenseTemplate.delete({ where: { id: template.id } }).catch(() => {});
      console.error("AWS schedule create failed; rolled back template", awsError);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to create recurring schedule: ${awsError instanceof Error ? awsError.message : "unknown"}`,
      });
    }

    return { templateId: template.id, expenseId: expense.id };
  });
```

Notes:
- `createRecurringScheduleHandler`'s `scheduleExpression` input goes through `parseScheduleExpression` which accepts our `cron(...)` string as-is.
- The `RECURRING_EXPENSE_WEBHOOK_*` env vars are still needed by Task 10 (the Vercel webhook endpoint verifies HMAC with `RECURRING_EXPENSE_WEBHOOK_SECRET`), but the URL no longer needs to be in this mutation — it lives only on the external Lambda.

- [ ] **Step 2: Wire into the expense router**

Edit `packages/trpc/src/routers/expense/index.ts` — add the import and add the procedure to the router map. Resulting file:

```ts
import getExpenseByChat from "./getExpenseByChat.js";
import getAllExpensesByChat from "./getAllExpensesByChat.js";
import getExpenseDetails from "./getExpenseDetails.js";
import createExpense from "./createExpense.js";
import createExpenseWithRecurrence from "./createExpenseWithRecurrence.js";
import createExpensesBulk from "./createExpensesBulk.js";
import updateExpense from "./updateExpense.js";
import updateExpensesBulk from "./updateExpensesBulk.js";
import deleteExpense from "./deleteExpense.js";
import convertCurrencyBulk from "./convertCurrencyBulk.js";
import sendBatchExpenseSummary from "./sendBatchExpenseSummary.js";
import { createTRPCRouter } from "../../trpc.js";
import { recurringRouter } from "./recurring/index.js";

export const expenseRouter = createTRPCRouter({
  getExpenseByChat,
  getAllExpensesByChat,
  getExpenseDetails,
  createExpense,
  createExpenseWithRecurrence,
  createExpensesBulk,
  updateExpense,
  updateExpensesBulk,
  deleteExpense,
  convertCurrencyBulk,
  sendBatchExpenseSummary,
  recurring: recurringRouter,
});
```

- [ ] **Step 3: Type-check**

Run: `cd packages/trpc && pnpm check-types`
Expected: PASS — but this WILL fail until the `recurring/index.ts` sub-router exists. Address by stubbing it now:

Create `packages/trpc/src/routers/expense/recurring/index.ts`:

```ts
import { createTRPCRouter } from "../../../trpc.js";

export const recurringRouter = createTRPCRouter({});
```

Re-run `pnpm check-types` until it passes.

- [ ] **Step 4: Commit**

```bash
cd packages/trpc
git add src/routers/expense/createExpenseWithRecurrence.ts src/routers/expense/index.ts src/routers/expense/recurring/index.ts
git commit -m "✨ feat(trpc): add createExpenseWithRecurrence mutation"
```

---

### Task 6: `expense.recurring.list` query

**Files:**
- Create: `packages/trpc/src/routers/expense/recurring/list.ts`
- Modify: `packages/trpc/src/routers/expense/recurring/index.ts`

- [ ] **Step 1: Implement**

Create `packages/trpc/src/routers/expense/recurring/list.ts`:

```ts
import { z } from "zod";
import { protectedProcedure } from "../../../trpc.js";
import { assertChatAccess } from "../../../middleware/chatScope.js";

export const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
});

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return ctx.db.recurringExpenseTemplate.findMany({
      where: { chatId: input.chatId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
  });
```

- [ ] **Step 2: Wire it**

Edit `packages/trpc/src/routers/expense/recurring/index.ts`:

```ts
import { createTRPCRouter } from "../../../trpc.js";
import list from "./list.js";

export const recurringRouter = createTRPCRouter({
  list,
});
```

- [ ] **Step 3: Type-check**

Run: `cd packages/trpc && pnpm check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd packages/trpc
git add src/routers/expense/recurring/
git commit -m "✨ feat(trpc): add expense.recurring.list"
```

---

### Task 7: `expense.recurring.get` query

**Files:**
- Create: `packages/trpc/src/routers/expense/recurring/get.ts`
- Modify: `packages/trpc/src/routers/expense/recurring/index.ts`

- [ ] **Step 1: Implement**

Create `packages/trpc/src/routers/expense/recurring/get.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../../trpc.js";
import { assertChatAccess } from "../../../middleware/chatScope.js";

export const inputSchema = z.object({
  templateId: z.string().uuid(),
});

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    const tmpl = await ctx.db.recurringExpenseTemplate.findUnique({
      where: { id: input.templateId },
      include: {
        expenses: { orderBy: { date: "desc" }, take: 10 },
      },
    });
    if (!tmpl) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
    }
    await assertChatAccess(ctx.session, ctx.db, tmpl.chatId);
    return tmpl;
  });
```

- [ ] **Step 2: Wire it**

Edit `packages/trpc/src/routers/expense/recurring/index.ts` — add `get`:

```ts
import { createTRPCRouter } from "../../../trpc.js";
import list from "./list.js";
import get from "./get.js";

export const recurringRouter = createTRPCRouter({
  list,
  get,
});
```

- [ ] **Step 3: Type-check**

Run: `cd packages/trpc && pnpm check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd packages/trpc
git add src/routers/expense/recurring/
git commit -m "✨ feat(trpc): add expense.recurring.get"
```

---

### Task 8: `expense.recurring.update` mutation

**Files:**
- Create: `packages/trpc/src/routers/expense/recurring/update.ts`
- Modify: `packages/trpc/src/routers/expense/recurring/index.ts`

- [ ] **Step 1: Implement**

Create `packages/trpc/src/routers/expense/recurring/update.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { UpdateScheduleCommand } from "@aws-sdk/client-scheduler";
import { SplitMode } from "@dko/database";
import { protectedProcedure } from "../../../trpc.js";
import { assertChatAccess } from "../../../middleware/chatScope.js";
import { getSchedulerClient } from "../../aws/utils/schedulerClient.js";
import {
  buildRecurringExpenseHttpTarget,
  RECURRING_EXPENSE_SCHEDULE_GROUP,
} from "../../aws/utils/recurringExpenseScheduler.js";
import { buildExpenseCron } from "../../aws/utils/buildExpenseCron.js";

const FREQUENCY = z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
const WEEKDAY = z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]);

export const inputSchema = z.object({
  templateId: z.string().uuid(),
  // Schedule fields
  frequency: FREQUENCY.optional(),
  interval: z.number().int().positive().optional(),
  weekdays: z.array(WEEKDAY).optional(),
  endDate: z.date().nullable().optional(),
  // Locked-occurrence fields (deferred for v1; only schedule edits allowed first)
  description: z.string().min(1).max(60).optional(),
  amount: z.number().positive().optional(),
});

const FIRE_HOUR = 9;
const FIRE_MIN = 0;

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    const tmpl = await ctx.db.recurringExpenseTemplate.findUnique({
      where: { id: input.templateId },
    });
    if (!tmpl) throw new TRPCError({ code: "NOT_FOUND" });
    await assertChatAccess(ctx.session, ctx.db, tmpl.chatId);

    const webhookUrl = process.env.RECURRING_EXPENSE_WEBHOOK_URL!;
    const webhookSecret = process.env.RECURRING_EXPENSE_WEBHOOK_SECRET!;

    // Snapshot original values for rollback.
    const original = { ...tmpl };

    // 1. DB update.
    const updated = await ctx.db.recurringExpenseTemplate.update({
      where: { id: tmpl.id },
      data: {
        frequency: input.frequency ?? tmpl.frequency,
        interval: input.interval ?? tmpl.interval,
        weekdays: input.weekdays ?? tmpl.weekdays,
        endDate: input.endDate === undefined ? tmpl.endDate : input.endDate,
        description: input.description ?? tmpl.description,
        amount: input.amount !== undefined ? input.amount.toString() : undefined,
      },
    });

    // 2. AWS update — only if schedule fields changed.
    const scheduleChanged =
      input.frequency !== undefined ||
      input.interval !== undefined ||
      input.weekdays !== undefined ||
      input.endDate !== undefined;

    if (scheduleChanged) {
      try {
        const cronExpression = buildExpenseCron({
          frequency: updated.frequency,
          interval: updated.interval,
          weekdays: updated.weekdays,
          hour: FIRE_HOUR,
          minute: FIRE_MIN,
          dayOfMonth: updated.startDate.getUTCDate(),
          month: updated.frequency === "YEARLY" ? updated.startDate.getUTCMonth() + 1 : undefined,
        });

        const httpTarget = buildRecurringExpenseHttpTarget({
          templateId: updated.id,
          webhookUrl,
          secret: webhookSecret,
        });
        const targetWithUrl = {
          ...httpTarget,
          HttpParameters: {
            ...(httpTarget.HttpParameters ?? {}),
            // @ts-expect-error - SDK type may name this differently per version
            Url: webhookUrl,
          },
        };

        await getSchedulerClient().send(
          new UpdateScheduleCommand({
            Name: updated.awsScheduleName,
            GroupName: RECURRING_EXPENSE_SCHEDULE_GROUP,
            ScheduleExpression: cronExpression,
            ScheduleExpressionTimezone: updated.timezone,
            State: "ENABLED",
            Target: targetWithUrl,
            FlexibleTimeWindow: { Mode: "OFF" },
            StartDate: updated.startDate,
            EndDate: updated.endDate ?? undefined,
          }),
        );
      } catch (awsError) {
        // Roll back DB.
        await ctx.db.recurringExpenseTemplate.update({
          where: { id: original.id },
          data: original,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update schedule: ${awsError instanceof Error ? awsError.message : "unknown"}`,
        });
      }
    }

    return updated;
  });
```

- [ ] **Step 2: Wire it**

Edit `packages/trpc/src/routers/expense/recurring/index.ts` — add `update`:

```ts
import { createTRPCRouter } from "../../../trpc.js";
import list from "./list.js";
import get from "./get.js";
import update from "./update.js";

export const recurringRouter = createTRPCRouter({
  list,
  get,
  update,
});
```

- [ ] **Step 3: Type-check**

Run: `cd packages/trpc && pnpm check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd packages/trpc
git add src/routers/expense/recurring/
git commit -m "✨ feat(trpc): add expense.recurring.update"
```

---

### Task 9: `expense.recurring.cancel` mutation

**Files:**
- Create: `packages/trpc/src/routers/expense/recurring/cancel.ts`
- Modify: `packages/trpc/src/routers/expense/recurring/index.ts`

- [ ] **Step 1: Implement**

Create `packages/trpc/src/routers/expense/recurring/cancel.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { DeleteScheduleCommand } from "@aws-sdk/client-scheduler";
import { protectedProcedure } from "../../../trpc.js";
import { assertChatAccess } from "../../../middleware/chatScope.js";
import { getSchedulerClient } from "../../aws/utils/schedulerClient.js";
import { RECURRING_EXPENSE_SCHEDULE_GROUP } from "../../aws/utils/recurringExpenseScheduler.js";

export const inputSchema = z.object({
  templateId: z.string().uuid(),
});

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    const tmpl = await ctx.db.recurringExpenseTemplate.findUnique({
      where: { id: input.templateId },
    });
    if (!tmpl) throw new TRPCError({ code: "NOT_FOUND" });
    await assertChatAccess(ctx.session, ctx.db, tmpl.chatId);

    // 1. DB soft-cancel first — even if AWS delete fails afterwards, the
    //    tick endpoint will reject because status != ACTIVE.
    await ctx.db.recurringExpenseTemplate.update({
      where: { id: tmpl.id },
      data: { status: "CANCELED" },
    });

    // 2. AWS delete. Any error is logged but does not roll back the DB
    //    cancel — the schedule may keep firing for ≤24h until cleaned up
    //    manually, but firing into a CANCELED template is a no-op.
    try {
      await getSchedulerClient().send(
        new DeleteScheduleCommand({
          Name: tmpl.awsScheduleName,
          GroupName: RECURRING_EXPENSE_SCHEDULE_GROUP,
        }),
      );
    } catch (awsError) {
      if (awsError instanceof Error && awsError.name === "ResourceNotFoundException") {
        // Already gone; fine.
      } else {
        console.error("AWS schedule delete failed (DB cancel succeeded)", awsError);
      }
    }

    return { ok: true };
  });
```

- [ ] **Step 2: Wire it**

Edit `packages/trpc/src/routers/expense/recurring/index.ts` — add `cancel`:

```ts
import { createTRPCRouter } from "../../../trpc.js";
import list from "./list.js";
import get from "./get.js";
import update from "./update.js";
import cancel from "./cancel.js";

export const recurringRouter = createTRPCRouter({
  list,
  get,
  update,
  cancel,
});
```

- [ ] **Step 3: Type-check**

Run: `cd packages/trpc && pnpm check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd packages/trpc
git add src/routers/expense/recurring/
git commit -m "✨ feat(trpc): add expense.recurring.cancel"
```

---

## Phase 4 — Webhook endpoint

### Task 10: `recurring-expense-tick` Express route + tests

**Files:**
- Create: `apps/lambda/api/recurring-expense-tick.ts`
- Create: `apps/lambda/api/recurring-expense-tick.test.ts`
- Modify: `apps/lambda/api/index.ts`
- Modify: `apps/lambda/api/env.ts`

- [ ] **Step 1: Add env validation**

Edit `apps/lambda/api/env.ts` — add the two new env vars to whatever zod schema is at the top of the file. Read the file first to see the existing pattern. Append (or merge into) the schema:

```ts
RECURRING_EXPENSE_WEBHOOK_SECRET: z.string().min(32),
RECURRING_EXPENSE_WEBHOOK_URL: z.string().url(),
```

- [ ] **Step 2: Write the failing test**

Create `apps/lambda/api/recurring-expense-tick.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { signRecurringExpensePayload } from "@dko/trpc/src/routers/aws/utils/recurringExpenseScheduler.js";

// Set env BEFORE importing the route so env.ts validation passes.
process.env.RECURRING_EXPENSE_WEBHOOK_SECRET = "x".repeat(64);
process.env.RECURRING_EXPENSE_WEBHOOK_URL = "https://example.com/api/internal/recurring-expense-tick";

const SECRET = process.env.RECURRING_EXPENSE_WEBHOOK_SECRET!;

// We'll mock createExpenseHandler + prisma in this test.
const createExpenseHandlerMock = vi.fn();
vi.mock("@dko/trpc", async (orig) => {
  const real = await orig<typeof import("@dko/trpc")>();
  return { ...real, createExpenseHandler: createExpenseHandlerMock };
});

const findUniqueMock = vi.fn();
vi.mock("@dko/database", () => ({
  prisma: {
    recurringExpenseTemplate: { findUnique: findUniqueMock },
    expense: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

import recurringExpenseTickRouter from "./recurring-expense-tick.js";

const app = express();
app.use(express.json());
app.use("/api/internal", recurringExpenseTickRouter);

beforeEach(() => {
  vi.clearAllMocks();
});

const TEMPLATE_ID = "11111111-1111-1111-1111-111111111111";
const FUTURE = new Date(Date.now() + 60_000).toISOString();
const NOW = new Date().toISOString();
const PAST_30M = new Date(Date.now() - 30 * 60_000).toISOString();

describe("POST /api/internal/recurring-expense-tick", () => {
  it("rejects with 401 on missing signature", async () => {
    const res = await request(app)
      .post("/api/internal/recurring-expense-tick")
      .send({ templateId: TEMPLATE_ID, occurrenceDate: NOW, scheduleName: `recurring-expense-${TEMPLATE_ID}` });
    expect(res.status).toBe(401);
  });

  it("rejects with 401 on bad signature", async () => {
    const res = await request(app)
      .post("/api/internal/recurring-expense-tick")
      .set("X-Recurring-Signature", "deadbeef".repeat(8))
      .send({ templateId: TEMPLATE_ID, occurrenceDate: NOW, scheduleName: `recurring-expense-${TEMPLATE_ID}` });
    expect(res.status).toBe(401);
  });

  it("rejects with 401 when occurrenceDate is too stale", async () => {
    const sig = signRecurringExpensePayload(TEMPLATE_ID, SECRET);
    const res = await request(app)
      .post("/api/internal/recurring-expense-tick")
      .set("X-Recurring-Signature", sig)
      .send({ templateId: TEMPLATE_ID, occurrenceDate: PAST_30M, scheduleName: `recurring-expense-${TEMPLATE_ID}` });
    expect(res.status).toBe(401);
  });

  it("returns 410 when template not found", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const sig = signRecurringExpensePayload(TEMPLATE_ID, SECRET);
    const res = await request(app)
      .post("/api/internal/recurring-expense-tick")
      .set("X-Recurring-Signature", sig)
      .send({ templateId: TEMPLATE_ID, occurrenceDate: NOW, scheduleName: `recurring-expense-${TEMPLATE_ID}` });
    expect(res.status).toBe(410);
  });

  it("returns 410 when template is canceled", async () => {
    findUniqueMock.mockResolvedValueOnce({ id: TEMPLATE_ID, status: "CANCELED" });
    const sig = signRecurringExpensePayload(TEMPLATE_ID, SECRET);
    const res = await request(app)
      .post("/api/internal/recurring-expense-tick")
      .set("X-Recurring-Signature", sig)
      .send({ templateId: TEMPLATE_ID, occurrenceDate: NOW, scheduleName: `recurring-expense-${TEMPLATE_ID}` });
    expect(res.status).toBe(410);
  });
});
```

> **Note:** The test imports `supertest`. If `supertest` isn't already a `devDependency` of `apps/lambda`, install it: `cd apps/lambda && pnpm add -D supertest @types/supertest`.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/lambda && pnpm vitest run api/recurring-expense-tick.test.ts`
Expected: FAIL — module not found OR supertest not installed (install if needed, then re-run).

- [ ] **Step 4: Implement the route**

Create `apps/lambda/api/recurring-expense-tick.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { Telegram } from "telegraf";
import { prisma } from "@dko/database";
import { createExpenseHandler } from "@dko/trpc";
import { verifyRecurringExpenseSignature } from "@dko/trpc/src/routers/aws/utils/recurringExpenseScheduler.js";
import { env } from "./env.js";

const FRESHNESS_WINDOW_MS = 15 * 60 * 1000;

const router = Router();

router.post("/recurring-expense-tick", async (req: Request, res: Response) => {
  const sig = req.header("x-recurring-signature");
  const { templateId, occurrenceDate } = (req.body ?? {}) as {
    templateId?: string;
    occurrenceDate?: string;
  };

  if (!sig || !templateId || !occurrenceDate) {
    return res.status(401).json({ error: "missing signature or fields" });
  }

  // 1. Verify signature.
  if (!verifyRecurringExpenseSignature(templateId, sig, env.RECURRING_EXPENSE_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: "bad signature" });
  }

  // 2. Freshness window — reject if occurrenceDate is more than 15min off "now".
  const occurrenceMs = Date.parse(occurrenceDate);
  if (Number.isNaN(occurrenceMs) || Math.abs(Date.now() - occurrenceMs) > FRESHNESS_WINDOW_MS) {
    return res.status(401).json({ error: "stale or invalid occurrenceDate" });
  }

  // 3. Load template.
  const tmpl = await prisma.recurringExpenseTemplate.findUnique({ where: { id: templateId } });
  if (!tmpl || tmpl.status !== "ACTIVE") {
    return res.status(410).json({ error: "template missing or not active" });
  }

  // 4. End-date guard.
  if (tmpl.endDate && new Date(occurrenceMs) > tmpl.endDate) {
    return res.status(410).json({ error: "past template endDate" });
  }

  // 5. Biweekly skip — for WEEKLY interval > 1, only fire if the week-of-year
  //    delta from startDate is divisible by interval.
  if (tmpl.frequency === "WEEKLY" && tmpl.interval > 1) {
    const weeks = Math.floor((occurrenceMs - tmpl.startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weeks % tmpl.interval !== 0) {
      return res.status(200).json({ skipped: "interval-skip" });
    }
  }

  // 6. Materialise the occurrence. The unique index on
  //    (recurringTemplateId, date) makes this idempotent against AWS retries.
  const occurrenceDateOnly = new Date(occurrenceMs);
  occurrenceDateOnly.setUTCHours(0, 0, 0, 0);

  try {
    const created = await createExpenseHandler(
      {
        chatId: tmpl.chatId,
        creatorId: tmpl.creatorId,
        payerId: tmpl.payerId,
        description: tmpl.description,
        amount: Number(tmpl.amount),
        date: occurrenceDateOnly,
        currency: tmpl.currency,
        splitMode: tmpl.splitMode,
        participantIds: tmpl.participantIds,
        customSplits: tmpl.customSplits as { userId: bigint; amount: number }[] | undefined,
        categoryId: tmpl.categoryId ?? null,
        sendNotification: true,
      },
      prisma,
      new Telegram(env.TELEGRAM_BOT_TOKEN),
    );
    await prisma.expense.update({
      where: { id: created.id },
      data: { recurringTemplateId: tmpl.id },
    });
    return res.status(200).json({ expenseId: created.id });
  } catch (err) {
    // Unique-index violation == AWS retried; treat as success.
    if (err instanceof Error && /unique/i.test(err.message)) {
      return res.status(200).json({ skipped: "duplicate" });
    }
    console.error("recurring-expense-tick failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "unknown" });
  }
});

export default router;
```

- [ ] **Step 5: Mount the route in `apps/lambda/api/index.ts`**

Add the import near the other imports:

```ts
import recurringExpenseTickRouter from "./recurring-expense-tick.js";
```

And add this line in the router setup section (next to the other `router.use(...)` calls):

```ts
router.use("/internal", recurringExpenseTickRouter);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/lambda && pnpm vitest run api/recurring-expense-tick.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 7: Type-check**

Run: `cd apps/lambda && pnpm check-types`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/lambda/api/recurring-expense-tick.ts apps/lambda/api/recurring-expense-tick.test.ts apps/lambda/api/index.ts apps/lambda/api/env.ts apps/lambda/package.json apps/lambda/pnpm-lock.yaml
git commit -m "✨ feat(lambda): add recurring-expense-tick HMAC webhook"
```

---

## Phase 5 — Frontend form schema + picker sheet

### Task 11: Form schema additions + presetToTemplate helper

**Files:**
- Modify: `apps/web/src/components/features/Expense/AddExpenseForm.type.ts`
- Modify: `apps/web/src/components/features/Expense/AddExpenseForm.tsx`
- Create: `apps/web/src/components/features/Expense/recurrencePresets.ts`
- Create: `apps/web/src/components/features/Expense/recurrencePresets.test.ts`

- [ ] **Step 1: Write the failing test for `presetToTemplate`**

Create `apps/web/src/components/features/Expense/recurrencePresets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { presetToTemplate } from "./recurrencePresets";

describe("presetToTemplate", () => {
  it("DAILY", () => {
    expect(presetToTemplate({ preset: "DAILY", customFrequency: "WEEKLY", customInterval: 1, weekdays: [], endDate: undefined })).toEqual({
      frequency: "DAILY", interval: 1, weekdays: [], endDate: undefined,
    });
  });
  it("WEEKLY uses provided weekdays", () => {
    expect(presetToTemplate({ preset: "WEEKLY", customFrequency: "WEEKLY", customInterval: 1, weekdays: ["MON","FRI"], endDate: undefined })).toEqual({
      frequency: "WEEKLY", interval: 1, weekdays: ["MON","FRI"], endDate: undefined,
    });
  });
  it("BIWEEKLY → WEEKLY interval=2", () => {
    expect(presetToTemplate({ preset: "BIWEEKLY", customFrequency: "WEEKLY", customInterval: 1, weekdays: ["MON"], endDate: undefined })).toEqual({
      frequency: "WEEKLY", interval: 2, weekdays: ["MON"], endDate: undefined,
    });
  });
  it("EVERY_3_MONTHS → MONTHLY interval=3", () => {
    expect(presetToTemplate({ preset: "EVERY_3_MONTHS", customFrequency: "WEEKLY", customInterval: 1, weekdays: [], endDate: undefined })).toEqual({
      frequency: "MONTHLY", interval: 3, weekdays: [], endDate: undefined,
    });
  });
  it("EVERY_6_MONTHS → MONTHLY interval=6", () => {
    expect(presetToTemplate({ preset: "EVERY_6_MONTHS", customFrequency: "WEEKLY", customInterval: 1, weekdays: [], endDate: undefined })).toEqual({
      frequency: "MONTHLY", interval: 6, weekdays: [], endDate: undefined,
    });
  });
  it("YEARLY", () => {
    expect(presetToTemplate({ preset: "YEARLY", customFrequency: "WEEKLY", customInterval: 1, weekdays: [], endDate: undefined })).toEqual({
      frequency: "YEARLY", interval: 1, weekdays: [], endDate: undefined,
    });
  });
  it("CUSTOM weekly every 3 weeks on Tue", () => {
    expect(presetToTemplate({ preset: "CUSTOM", customFrequency: "WEEKLY", customInterval: 3, weekdays: ["TUE"], endDate: undefined })).toEqual({
      frequency: "WEEKLY", interval: 3, weekdays: ["TUE"], endDate: undefined,
    });
  });
  it("end date forwarded", () => {
    const d = new Date("2027-01-01");
    expect(presetToTemplate({ preset: "MONTHLY", customFrequency: "WEEKLY", customInterval: 1, weekdays: [], endDate: d })).toMatchObject({ endDate: d });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/components/features/Expense/recurrencePresets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `recurrencePresets.ts`**

Create `apps/web/src/components/features/Expense/recurrencePresets.ts`:

```ts
export type RecurrencePreset =
  | "NONE"
  | "DAILY"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "EVERY_3_MONTHS"
  | "EVERY_6_MONTHS"
  | "YEARLY"
  | "CUSTOM";

export type CanonicalFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type Weekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export interface PresetInput {
  preset: Exclude<RecurrencePreset, "NONE">;
  customFrequency: CanonicalFrequency;
  customInterval: number;
  weekdays: Weekday[];
  endDate?: Date;
}

export interface CanonicalTemplate {
  frequency: CanonicalFrequency;
  interval: number;
  weekdays: Weekday[];
  endDate?: Date;
}

export function presetToTemplate(input: PresetInput): CanonicalTemplate {
  switch (input.preset) {
    case "DAILY":           return { frequency: "DAILY",   interval: 1, weekdays: [],            endDate: input.endDate };
    case "WEEKLY":          return { frequency: "WEEKLY",  interval: 1, weekdays: input.weekdays, endDate: input.endDate };
    case "BIWEEKLY":        return { frequency: "WEEKLY",  interval: 2, weekdays: input.weekdays, endDate: input.endDate };
    case "MONTHLY":         return { frequency: "MONTHLY", interval: 1, weekdays: [],            endDate: input.endDate };
    case "EVERY_3_MONTHS":  return { frequency: "MONTHLY", interval: 3, weekdays: [],            endDate: input.endDate };
    case "EVERY_6_MONTHS":  return { frequency: "MONTHLY", interval: 6, weekdays: [],            endDate: input.endDate };
    case "YEARLY":          return { frequency: "YEARLY",  interval: 1, weekdays: [],            endDate: input.endDate };
    case "CUSTOM":          return { frequency: input.customFrequency, interval: input.customInterval, weekdays: input.weekdays, endDate: input.endDate };
  }
}

export const PRESET_LABEL: Record<RecurrencePreset, string> = {
  NONE: "Never",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BIWEEKLY: "Biweekly",
  MONTHLY: "Monthly",
  EVERY_3_MONTHS: "Every 3 Months",
  EVERY_6_MONTHS: "Every 6 Months",
  YEARLY: "Yearly",
  CUSTOM: "Custom",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/components/features/Expense/recurrencePresets.test.ts`
Expected: PASS — 8 tests green.

- [ ] **Step 5: Extend `expenseFormSchema`**

Edit `apps/web/src/components/features/Expense/AddExpenseForm.type.ts`. Add at the top after the existing imports:

```ts
const Weekday = z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]);
const Preset = z.enum([
  "NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY",
  "EVERY_3_MONTHS", "EVERY_6_MONTHS", "YEARLY", "CUSTOM",
]);
```

Add a new property to the `expenseFormSchema` z.object (place it at the end before the closing `});`):

```ts
  recurrence: z.discriminatedUnion("preset", [
    z.object({ preset: z.literal("NONE") }),
    z.object({
      preset: z.enum(["DAILY","WEEKLY","BIWEEKLY","MONTHLY","EVERY_3_MONTHS","EVERY_6_MONTHS","YEARLY","CUSTOM"]),
      customFrequency: z.enum(["DAILY","WEEKLY","MONTHLY","YEARLY"]),
      customInterval: z.number().int().positive(),
      weekdays: z.array(Weekday),
      endDate: z.string().optional(),  // ISO YYYY-MM-DD
    }).superRefine((val, ctx) => {
      const isWeekly = val.preset === "WEEKLY" || val.preset === "BIWEEKLY"
        || (val.preset === "CUSTOM" && val.customFrequency === "WEEKLY");
      if (isWeekly && val.weekdays.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["weekdays"], message: "Pick at least one day" });
      }
    }),
  ]),
```

- [ ] **Step 6: Add the default to `AddExpenseForm.tsx`**

Edit `apps/web/src/components/features/Expense/AddExpenseForm.tsx`. Add to `defaultValues`:

```ts
    recurrence: { preset: "NONE" } as
      | { preset: "NONE" }
      | { preset: "DAILY"|"WEEKLY"|"BIWEEKLY"|"MONTHLY"|"EVERY_3_MONTHS"|"EVERY_6_MONTHS"|"YEARLY"|"CUSTOM";
          customFrequency: "DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY"; customInterval: number; weekdays: ("SUN"|"MON"|"TUE"|"WED"|"THU"|"FRI"|"SAT")[]; endDate?: string },
```

- [ ] **Step 7: Type-check**

Run: `cd apps/web && pnpm check-types`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd apps/web
git add src/components/features/Expense/recurrencePresets.ts src/components/features/Expense/recurrencePresets.test.ts src/components/features/Expense/AddExpenseForm.type.ts src/components/features/Expense/AddExpenseForm.tsx
git commit -m "✨ feat(web): add recurrence schema + presetToTemplate"
```

---

### Task 12: `RecurrencePickerSheet` component

**Files:**
- Create: `apps/web/src/components/features/Expense/RecurrencePickerSheet.tsx`

- [ ] **Step 1: Implement the picker sheet**

Create `apps/web/src/components/features/Expense/RecurrencePickerSheet.tsx`:

```tsx
import { Cell, Modal, Section, Title, IconButton } from "@telegram-apps/telegram-ui";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import { PRESET_LABEL, type RecurrencePreset, type Weekday, type CanonicalFrequency } from "./recurrencePresets";

const PRESETS: RecurrencePreset[] = [
  "NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY",
  "EVERY_3_MONTHS", "EVERY_6_MONTHS", "YEARLY", "CUSTOM",
];

const WEEKDAYS: { id: Weekday; label: string }[] = [
  { id: "SUN", label: "S" }, { id: "MON", label: "M" }, { id: "TUE", label: "T" },
  { id: "WED", label: "W" }, { id: "THU", label: "T" }, { id: "FRI", label: "F" },
  { id: "SAT", label: "S" },
];

const CUSTOM_FREQS: CanonicalFrequency[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];

export interface RecurrenceValue {
  preset: RecurrencePreset;
  customFrequency: CanonicalFrequency;
  customInterval: number;
  weekdays: Weekday[];
  endDate?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: RecurrenceValue;
  onChange: (next: RecurrenceValue) => void;
}

type Screen = "top" | "custom" | "endDate";

export default function RecurrencePickerSheet({ open, onOpenChange, value, onChange }: Props) {
  const [screen, setScreen] = useState<Screen>("top");

  // Reset to top whenever the modal reopens
  // (keeps subsequent opens predictable).
  useMemo(() => { if (open) setScreen("top"); }, [open]);

  const close = () => { onOpenChange(false); };

  const isWeekly = value.preset === "WEEKLY"
    || value.preset === "BIWEEKLY"
    || (value.preset === "CUSTOM" && value.customFrequency === "WEEKLY");

  const headerTitle = screen === "top" ? "Repeat" : screen === "custom" ? "Custom" : "End Date";

  const header = (
    <Modal.Header
      before={
        screen === "top" ? (
          <Title weight="2" level="3">{headerTitle}</Title>
        ) : (
          <button
            type="button"
            onClick={() => { hapticFeedback.impactOccurred("light"); setScreen("top"); }}
            className="text-(--tg-theme-link-color) flex items-center gap-1"
          >
            <ChevronLeft size={18} /> Back
          </button>
        )
      }
      after={
        <Modal.Close>
          <IconButton size="s" mode="gray"><X size={20} /></IconButton>
        </Modal.Close>
      }
    />
  );

  return (
    <Modal open={open} onOpenChange={onOpenChange} header={header}>
      <div className="max-h-[75vh] space-y-3 overflow-y-auto p-3 pb-6">
        {screen === "top" && (
          <>
            <Section>
              {PRESETS.filter((p) => p !== "CUSTOM").map((p) => (
                <Cell
                  key={p}
                  onClick={() => {
                    hapticFeedback.selectionChanged();
                    onChange({ ...value, preset: p, weekdays: p === "WEEKLY" || p === "BIWEEKLY" ? value.weekdays : [] });
                    if (p === "NONE") close();
                  }}
                  after={value.preset === p ? <span className="text-(--tg-theme-link-color)">✓</span> : null}
                >
                  {PRESET_LABEL[p]}
                </Cell>
              ))}
              <Cell
                onClick={() => { hapticFeedback.impactOccurred("light"); setScreen("custom"); }}
                after={<ChevronRight size={16} />}
              >
                <span className="text-(--tg-theme-link-color)">{PRESET_LABEL.CUSTOM}…</span>
              </Cell>
            </Section>
            {value.preset !== "NONE" && (
              <Section>
                <Cell
                  onClick={() => { hapticFeedback.impactOccurred("light"); setScreen("endDate"); }}
                  after={<span className="text-(--tg-theme-subtitle-text-color)">{value.endDate ? value.endDate : "Never"} ›</span>}
                >
                  End Date
                </Cell>
              </Section>
            )}
          </>
        )}

        {screen === "custom" && (
          <>
            <Section>
              <Cell
                Component="label"
                after={
                  <div className="relative">
                    <select
                      value={value.customFrequency}
                      onChange={(e) => onChange({ ...value, preset: "CUSTOM", customFrequency: e.target.value as CanonicalFrequency })}
                      className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                    >
                      {CUSTOM_FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <span className="text-(--tg-theme-subtitle-text-color)">{value.customFrequency} ›</span>
                  </div>
                }
              >
                Frequency
              </Cell>
              <Cell
                Component="label"
                after={
                  <div className="relative">
                    <select
                      value={value.customInterval}
                      onChange={(e) => onChange({ ...value, preset: "CUSTOM", customInterval: Number(e.target.value) })}
                      className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                    >
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span className="text-(--tg-theme-subtitle-text-color)">{value.customInterval} ›</span>
                  </div>
                }
              >
                Every
              </Cell>
            </Section>
            {isWeekly && (
              <Section header="On these days">
                <div className="flex justify-between gap-1.5 px-3 py-3">
                  {WEEKDAYS.map((d) => {
                    const selected = value.weekdays.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          hapticFeedback.selectionChanged();
                          const next = selected
                            ? value.weekdays.filter((w) => w !== d.id)
                            : [...value.weekdays, d.id];
                          onChange({ ...value, weekdays: next });
                        }}
                        className={`flex size-8 items-center justify-center rounded-full text-[13px] font-medium ${
                          selected ? "bg-(--tg-theme-link-color) text-white" : "bg-(--tg-theme-secondary-bg-color)"
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}
          </>
        )}

        {screen === "endDate" && (
          <Section>
            <Cell
              onClick={() => {
                hapticFeedback.selectionChanged();
                onChange({ ...value, endDate: undefined });
              }}
              after={value.endDate ? null : <span className="text-(--tg-theme-link-color)">✓</span>}
            >
              No end date
            </Cell>
            <Cell className="relative">
              <input
                type="date"
                value={value.endDate ?? ""}
                onChange={(e) => onChange({ ...value, endDate: e.target.value || undefined })}
                className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
              />
              Pick a date
              <span className="ml-auto text-(--tg-theme-subtitle-text-color)">
                {value.endDate ?? "—"}
              </span>
            </Cell>
          </Section>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd apps/web
git add src/components/features/Expense/RecurrencePickerSheet.tsx
git commit -m "✨ feat(web): add RecurrencePickerSheet"
```

---

## Phase 6 — Frontend amount-step integration

### Task 13: Mount Repeat Cell + wire submit branching

**Files:**
- Modify: `apps/web/src/components/features/Expense/AmountFormStep.tsx`
- Modify: `apps/web/src/components/features/Expense/AddExpensePage.tsx`

- [ ] **Step 1: Add Repeat Cell to the Details Section**

Edit `apps/web/src/components/features/Expense/AmountFormStep.tsx`. Add to the imports near the top:

```tsx
import { Repeat as RepeatIcon } from "lucide-react";
import RecurrencePickerSheet, { type RecurrenceValue } from "./RecurrencePickerSheet";
import { PRESET_LABEL } from "./recurrencePresets";
```

Inside the component body, before the `return`, add a useState for the picker open state:

```tsx
    const [recurrenceOpen, setRecurrenceOpen] = useState(false);
```

Inside the existing **Details** Section JSX, AFTER the Date `<Cell>` (at the matching indentation), add a `form.AppField` block for `recurrence`:

```tsx
                    {/* Repeat Cell */}
                    <form.AppField name="recurrence">
                      {(recurrenceField) => {
                        const r = recurrenceField.state.value as RecurrenceValue;
                        const summary = r.preset === "NONE"
                          ? "Never"
                          : PRESET_LABEL[r.preset];
                        return (
                          <>
                            <Cell
                              before={<RepeatIcon size={24} style={{ color: tSubtitleTextColor }} />}
                              after={
                                <Text style={{ color: tSubtitleTextColor }}>
                                  {summary} ›
                                </Text>
                              }
                              onClick={() => {
                                hapticFeedback.impactOccurred("light");
                                setRecurrenceOpen(true);
                              }}
                            >
                              Repeat
                            </Cell>
                            <RecurrencePickerSheet
                              open={recurrenceOpen}
                              onOpenChange={setRecurrenceOpen}
                              value={{
                                preset: r.preset,
                                customFrequency: "WEEKLY",
                                customInterval: 1,
                                weekdays: [],
                                endDate: undefined,
                                ...r,
                              } as RecurrenceValue}
                              onChange={(next) => recurrenceField.handleChange(next as never)}
                            />
                          </>
                        );
                      }}
                    </form.AppField>
```

- [ ] **Step 2: Branch the submit handler**

Edit `apps/web/src/components/features/Expense/AddExpensePage.tsx`. Add the import:

```tsx
import { presetToTemplate } from "./recurrencePresets";
```

Add a second mutation hook near the existing `createExpenseMutation`:

```tsx
  const createExpenseWithRecurrenceMutation =
    trpc.expense.createExpenseWithRecurrence.useMutation();
```

In `onSubmit`, replace the block that calls `createExpenseMutation.mutateAsync(...)` with the following branching logic. The original call shape stays the same in the NONE branch:

```tsx
        const recurrence = (value as typeof value & { recurrence: { preset: string; [k: string]: unknown } }).recurrence;
        const isRecurring = recurrence.preset !== "NONE";

        const baseInput = {
          chatId: chatId,
          creatorId: userId,
          payerId: Number(value.payee),
          description: value.description,
          amount: Number(value.amount),
          date: normalizeDateToMidnight(new Date(value.date + "T00:00:00")),
          splitMode: value.splitMode,
          participantIds: value.participants.map((id) => Number(id)),
          customSplits,
          currency: value.currency,
          categoryId: resolvedCategoryId,
          threadId: dChatData?.threadId ? Number(dChatData.threadId) : undefined,
        };

        if (isRecurring) {
          const tmpl = presetToTemplate({
            preset: recurrence.preset as Exclude<Parameters<typeof presetToTemplate>[0]["preset"], never>,
            customFrequency: (recurrence as { customFrequency?: "DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY" }).customFrequency ?? "WEEKLY",
            customInterval: (recurrence as { customInterval?: number }).customInterval ?? 1,
            weekdays: ((recurrence as { weekdays?: ("SUN"|"MON"|"TUE"|"WED"|"THU"|"FRI"|"SAT")[] }).weekdays ?? []),
            endDate: (recurrence as { endDate?: string }).endDate
              ? new Date((recurrence as { endDate: string }).endDate + "T00:00:00")
              : undefined,
          });
          await createExpenseWithRecurrenceMutation.mutateAsync({
            expense: baseInput,
            recurrence: {
              ...tmpl,
              timezone: dChatData?.timezone ?? "Asia/Singapore",
            },
          });
        } else {
          await createExpenseMutation.mutateAsync(baseInput);
        }
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && pnpm check-types`
Expected: PASS. Fix any types as needed (the `any/never` casts above are deliberate guards because the discriminated union widens awkwardly through tanstack-form).

- [ ] **Step 4: Manual smoke (no UAT yet)**

Run: `cd apps/web && pnpm dev` and load the TMA in browser dev mode. Open Add Expense → confirm the Repeat Cell appears in the Details Section after Date. Tap it → confirm sheet opens. Pick "Weekly" + a weekday → close sheet → confirm Cell shows "Weekly ›". (Don't submit — that hits real prod tRPC.)

- [ ] **Step 5: Commit**

```bash
cd apps/web
git add src/components/features/Expense/AmountFormStep.tsx src/components/features/Expense/AddExpensePage.tsx
git commit -m "✨ feat(web): wire Repeat picker into amount step"
```

---

## Phase 7 — Manage page + occurrence badge + settings entry

### Task 14: Manage page route + list

**Files:**
- Create: `apps/web/src/routes/_tma/chat.$chatId_.recurring-expenses.tsx`
- Create: `apps/web/src/components/features/Expense/RecurringTemplatesList.tsx`

- [ ] **Step 1: Create the route**

Create `apps/web/src/routes/_tma/chat.$chatId_.recurring-expenses.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import RecurringTemplatesList from "@/components/features/Expense/RecurringTemplatesList";

export const Route = createFileRoute("/_tma/chat/$chatId_/recurring-expenses")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <RecurringTemplatesList chatId={Number(chatId)} />;
}
```

- [ ] **Step 2: Create the list component**

Create `apps/web/src/components/features/Expense/RecurringTemplatesList.tsx`:

```tsx
import { Cell, Section, Text } from "@telegram-apps/telegram-ui";
import { Repeat as RepeatIcon } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { format } from "date-fns";

interface Props { chatId: number }

export default function RecurringTemplatesList({ chatId }: Props) {
  const { data, status } = trpc.expense.recurring.list.useQuery({ chatId });

  if (status === "pending") return <div className="p-4 text-center">Loading…</div>;
  if (status === "error" || !data) return <div className="p-4 text-center text-red-500">Failed to load</div>;
  if (data.length === 0) return <div className="p-6 text-center text-(--tg-theme-subtitle-text-color)">No recurring expenses yet.</div>;

  return (
    <main className="px-3 pb-8">
      <Section header="Recurring expenses">
        {data.map((t) => (
          <Cell
            key={t.id}
            before={<RepeatIcon size={20} />}
            subtitle={
              <Text className="text-xs">
                {t.frequency === "WEEKLY" && t.interval > 1 ? `Every ${t.interval} weeks` : t.frequency.toLowerCase()}
                {t.endDate ? ` · Until ${format(t.endDate, "d MMM yyyy")}` : ""}
              </Text>
            }
            after={<Text>{Number(t.amount).toFixed(2)} {t.currency}</Text>}
          >
            {t.description}
          </Cell>
        ))}
      </Section>
    </main>
  );
}
```

- [ ] **Step 3: Regenerate route tree**

Run: `cd apps/web && pnpm dev` for a moment to let TanStack Router regenerate `routeTree.gen.ts`. Stop after the file appears. (Or run `pnpm build` if available.)

- [ ] **Step 4: Type-check**

Run: `cd apps/web && pnpm check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd apps/web
git add src/routes/_tma/chat.\$chatId_.recurring-expenses.tsx src/components/features/Expense/RecurringTemplatesList.tsx src/routeTree.gen.ts
git commit -m "✨ feat(web): add recurring expenses manage page"
```

---

### Task 15: Settings entry link

**Files:**
- Modify: `apps/web/src/components/features/Settings/ChatSettingsPage.tsx`

- [ ] **Step 1: Add the entry**

Edit `ChatSettingsPage.tsx`. Find the line `{!isPrivateChat && <RecurringRemindersSection chatId={chatId} />}`. Insert immediately AFTER it:

```tsx
      <Section header="Recurring expenses">
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
          Manage recurring expenses
        </Cell>
      </Section>
```

Add the imports at the top of the file (alongside the existing icon imports):

```tsx
import { Repeat as RepeatIcon } from "lucide-react";
```

If `globalNavigate` isn't already in scope, locate where the file imports `useNavigate` from `@tanstack/react-router` and read it from there (existing pattern — same as `AddExpensePage`). If `hapticFeedback` isn't imported here, add it from `@telegram-apps/sdk-react`.

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd apps/web
git add src/components/features/Settings/ChatSettingsPage.tsx
git commit -m "✨ feat(web): add Recurring expenses entry to chat settings"
```

---

### Task 16: Occurrence badge in activity list

**Files:**
- Create: `apps/web/src/components/features/Expense/RecurringExpenseBadge.tsx`
- Modify: `apps/web/src/components/features/Chat/ChatExpenseCell.tsx`

- [ ] **Step 1: Create the badge**

Create `apps/web/src/components/features/Expense/RecurringExpenseBadge.tsx`:

```tsx
import { Repeat as RepeatIcon } from "lucide-react";

export default function RecurringExpenseBadge() {
  return (
    <span
      title="Recurring expense"
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-(--tg-theme-link-color)/15 text-(--tg-theme-link-color)"
    >
      <RepeatIcon size={12} strokeWidth={2.5} />
    </span>
  );
}
```

- [ ] **Step 2: Wire it into `ChatExpenseCell.tsx`**

Edit `apps/web/src/components/features/Chat/ChatExpenseCell.tsx`. Add the import at the top:

```tsx
import RecurringExpenseBadge from "@/components/features/Expense/RecurringExpenseBadge";
```

Find the `<Caption className="w-max" weight="2">` block that renders the date in the trailing area (around lines 294-298 per research). Wrap it in a flex container and insert the badge if `expense.recurringTemplateId` exists. Replace:

```tsx
                  <Caption className="w-max" weight="2">
                    {sortBy === "createdAt"
                      ? formatExpenseDateShortCreatedAt(expense.createdAt)
                      : formatExpenseDateShort(expense.date)}
                  </Caption>
```

with:

```tsx
                  <div className="flex items-center gap-1.5">
                    {expense.recurringTemplateId && <RecurringExpenseBadge />}
                    <Caption className="w-max" weight="2">
                      {sortBy === "createdAt"
                        ? formatExpenseDateShortCreatedAt(expense.createdAt)
                        : formatExpenseDateShort(expense.date)}
                    </Caption>
                  </div>
```

If `recurringTemplateId` isn't on the type returned by the existing query, check the tRPC procedure that returns expenses (`getExpenseByChat` or similar) — it'll need to be added to the Prisma `select`. Update that select to include the new field.

- [ ] **Step 3: Type-check**

Run: `cd apps/web && pnpm check-types`
Expected: PASS. If `recurringTemplateId` is missing on the Expense type, also include it in the relevant tRPC query's select clause (in `packages/trpc/src/routers/expense/getExpenseByChat.ts` or wherever `ChatExpenseCell` reads from).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Expense/RecurringExpenseBadge.tsx apps/web/src/components/features/Chat/ChatExpenseCell.tsx packages/trpc/src/routers/expense/
git commit -m "✨ feat(web): show recurring badge on activity list rows"
```

---

## Phase 8 — Infra & env

### Task 17: env + AWS schedule group + external Lambda deployment

> ⚠️ **Architecture pivot (2026-04-24):** Env vars split. `RECURRING_EXPENSE_WEBHOOK_URL` no longer lives in tRPC env — it's only on the external Lambda. `AWS_RECURRING_EXPENSE_LAMBDA_ARN` is new (tRPC env, used by `createWithRecurrence` / `update`). `RECURRING_EXPENSE_WEBHOOK_SECRET` stays in `apps/lambda` env (for HMAC verification by the tick endpoint) and also goes on the external Lambda (for HMAC signing).

**Files:**
- Modify: `apps/lambda/env/.env.production.example`

- [ ] **Step 1: Deploy the external `RecurringExpenseLambda`**

In the external `bananasplit-tgbot` AWS repo, add the new Lambda following [`docs/superpowers/specs/2026-04-24-recurring-expenses-lambda.md`](../specs/2026-04-24-recurring-expenses-lambda.md). Set its env:

- `RECURRING_EXPENSE_WEBHOOK_URL` = `https://<your-lambda-app>.vercel.app/api/internal/recurring-expense-tick`
- `RECURRING_EXPENSE_WEBHOOK_SECRET` = output of `openssl rand -hex 32` (save this — also needed in Vercel below)

Capture the Lambda's deployed ARN (e.g. `arn:aws:lambda:ap-southeast-1:<account>:function:RecurringExpenseLambda`).

Also: add `lambda:InvokeFunction` for this ARN to the existing `AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN` policy.

- [ ] **Step 2: Update env example in the monorepo**

Edit `apps/lambda/env/.env.production.example`. Append to the bottom:

```
# Recurring expenses webhook (HMAC verification of POSTs from RecurringExpenseLambda)
RECURRING_EXPENSE_WEBHOOK_SECRET=<32+ byte hex secret, must match the value set on RecurringExpenseLambda>
```

(Note: `RECURRING_EXPENSE_WEBHOOK_URL` is intentionally **not** in monorepo env — it lives on the external Lambda.)

- [ ] **Step 3: Manual AWS step — create the schedule group (do this once in prod)**

Run from a shell with AWS creds for the prod account:

```bash
aws scheduler create-schedule-group \
  --name recurring-expenses \
  --region ap-southeast-1
```

Expected: `{"ScheduleGroupArn":"arn:aws:scheduler:ap-southeast-1:<account>:schedule-group/recurring-expenses"}`. Idempotent — safe to re-run; if it already exists you'll get a `ConflictException` which is fine.

- [ ] **Step 4: Manual Vercel step — set the env vars**

For the tRPC layer (the project that runs `createExpenseWithRecurrence` / `update`):

```bash
vercel env add AWS_RECURRING_EXPENSE_LAMBDA_ARN production
# Paste the ARN captured in Step 1.
```

For `apps/lambda` (the project hosting the tick webhook):

```bash
cd apps/lambda
vercel env add RECURRING_EXPENSE_WEBHOOK_SECRET production
# Paste the SAME secret you set on the Lambda in Step 1.
```

- [ ] **Step 5: Commit**

```bash
git add apps/lambda/env/.env.production.example
git commit -m "📝 chore(lambda): document recurring-expense webhook env vars"
```

---

## Phase 9 — Verification

### Task 18: End-to-end smoke (subagent + manual UAT)

- [ ] **Step 1: Wait for the deploy-lambda + deploy-web jobs to land on prod** (the project's `.github/workflows/deploy.yml` auto-deploys on push to `main`). Check `gh run list -L 5` once the PR is merged.

- [ ] **Step 2: Subagent UAT — backend assertions**

Dispatch a `general-purpose` subagent with the prompt:

> Working dir: any. Use the `aws scheduler` CLI (creds already configured) and direct DB read via `psql` (DATABASE_URL in `.env.production`) to verify:
>
> 1. Pick a test chat I have access to. Create a daily recurring expense via `curl https://<lambda>.vercel.app/api/trpc/expense.createExpenseWithRecurrence` with a one-day end date. Confirm:
>    - HTTP 200 with `{ templateId, expenseId }`.
>    - DB has 1 RecurringExpenseTemplate + 1 Expense with matching `recurringTemplateId`.
>    - `aws scheduler get-schedule --name recurring-expense-<templateId> --group-name recurring-expenses` returns ENABLED with the expected cron and end date.
> 2. Cancel it via `curl ... expense.recurring.cancel`. Confirm DB row is `status=CANCELED` and `aws scheduler get-schedule` returns `ResourceNotFoundException`.
> 3. POST to `/api/internal/recurring-expense-tick` with a bad signature → expect 401. With a good signature but inactive template → expect 410.
>
> Report PASS/FAIL per assertion. Do not leave test data behind — delete the test Expense and Template at the end.

- [ ] **Step 3: Manual TMA UAT** (one step at a time via AskUserQuestion):
  1. Open Add Expense → confirm Repeat Cell appears below Date.
  2. Tap Repeat → confirm sheet opens with the preset list.
  3. Pick Weekly → tap Custom… → confirm Custom screen opens with Frequency / Every / weekday chips.
  4. Pick a weekday + Done → confirm Cell on amount step shows updated summary.
  5. Submit the expense. Confirm immediate Telegram notification arrives in chat as normal.
  6. In Chat Settings → tap "Manage recurring expenses" → confirm template appears in list.
  7. In activity list → confirm the just-created occurrence shows the 🔁 badge.

---

## Self-Review Notes

- **Spec coverage**: every section maps to at least one task. The two "open questions deferred to plan stage" from the spec resolve to: (1) cron-helper location stays in `packages/trpc` (Task 2), (2) edit/cancel UX is template-only fields in v1 (Task 8 input shape limits to schedule + description + amount).
- **Type consistency**: `RecurrenceFrequency` enum (Prisma + zod + buildExpenseCron + presetToTemplate) is `DAILY | WEEKLY | MONTHLY | YEARLY` everywhere. Weekday enum is `SUN..SAT` everywhere. Schedule name format is `recurring-expense-{templateId}` everywhere.
- **HMAC signing**: signed payload is just `templateId` everywhere — sign in Task 4, verify in Task 10. Freshness window 15min in Task 10.
- **Known unknowns**: AWS Universal HTTP target field name (`Url` vs. equivalent) — flagged inline in Task 4 + Task 5 + Task 8. Implementer must verify against the installed SDK version before committing those tasks.
