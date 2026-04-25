# Recurring Expense Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four UI surfaces in [docs/superpowers/specs/2026-04-25-recurring-expense-management-ui-design.md](../specs/2026-04-25-recurring-expense-management-ui-design.md) so users can view, edit (schedule fields only), and cancel recurring expense templates from the TMA. Zero backend changes.

**Architecture:** One pure-refactor extraction (`RepeatAndEndDateSection` lifted out of `AmountFormStep`), one helper extraction (`ShareParticipant` lifted out of `ExpenseDetailsModal`), one new presentation modal (`RecurringExpenseDetailsModal`), one new edit page + route (`/edit-recurring/$templateId`), and two augmentations (the existing list page + the existing transaction modal). All four surfaces share the existing Section/Cell visual language so users see one design language for the same domain object.

**Tech Stack:** React + TypeScript + TanStack Router + tRPC v11 + telegram-apps SDK + telegram-ui + Tailwind. Tests via vitest + happy-dom + @testing-library/react.

---

## File Structure (locked before tasks start)

**New files:**
- `apps/web/src/components/features/Chat/ShareParticipant.tsx` — extracted from `ExpenseDetailsModal.tsx:36-91`
- `apps/web/src/components/features/Expense/RepeatAndEndDateSection.tsx` — extracted from `AmountFormStep.tsx:419-611`
- `apps/web/src/components/features/Expense/RepeatAndEndDateSection.test.tsx` — smoke test
- `apps/web/src/components/features/Expense/RecurringExpenseCell.tsx` — list cell mirroring `ChatExpenseCell` shape
- `apps/web/src/components/features/Expense/RecurringExpenseDetailsModal.tsx` — bottom-sheet detail
- `apps/web/src/components/features/Expense/RecurringExpenseDetailsModal.test.tsx` — smoke test
- `apps/web/src/components/features/Expense/EditRecurringSchedulePage.tsx` — focused edit page
- `apps/web/src/routes/_tma/chat.$chatId_.edit-recurring.$templateId.tsx` — new TanStack route

**Modified files:**
- `apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx` — import `ShareParticipant`; append `Schedule` section when `recurringTemplateId` is set
- `apps/web/src/components/features/Expense/AmountFormStep.tsx` — replace inline Repeat/EndDate JSX with `<RepeatAndEndDateSection>`
- `apps/web/src/components/features/Expense/RecurringTemplatesList.tsx` — use `RecurringExpenseCell`, add `selectedTemplate` state, mount `RecurringExpenseDetailsModal`, wire `secondaryButton` for Delete

---

## Working agreements

- **One commit per task.** Conventional-commit prefix (`refactor:`, `feat(web):`, `test:`).
- **TDD where it adds value:** smoke tests first for new presentation components; pure refactors verified by re-running the existing test suite (which must still pass).
- **Type-check after every task:** `pnpm exec tsc --noEmit` in `apps/web` from the project root via `_ZO_DOCTOR=0 pnpm --filter web exec tsc --noEmit`.
- **No backend edits.** If a task feels like it needs one, stop and escalate.

---

## Task 1: Extract `ShareParticipant` from `ExpenseDetailsModal`

Pure refactor. Moves the existing private `ShareParticipant` sub-component into its own file so the new `RecurringExpenseDetailsModal` (Task 5) can reuse it.

**Files:**
- Create: `apps/web/src/components/features/Chat/ShareParticipant.tsx`
- Modify: `apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx` (drop the inline `ShareParticipant` declaration at lines 36-91, import the new file)

- [ ] **Step 1: Create the extracted file**

```tsx
// apps/web/src/components/features/Chat/ShareParticipant.tsx
import { Cell, Info, Skeleton, Text } from "@telegram-apps/telegram-ui";
import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import { trpc } from "@utils/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { cn } from "@/utils/cn";
import { formatCurrencyWithCode } from "@/utils/financial";

export interface ShareParticipantProps {
  chatId: number;
  userId: number;
  amount: number;
  isCurrentUser: boolean;
  currency: string;
}

const ShareParticipant = ({
  chatId,
  userId,
  amount,
  isCurrentUser,
  currency,
}: ShareParticipantProps) => {
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  const { data: member, isLoading } = trpc.telegram.getChatMember.useQuery({
    chatId,
    userId,
  });

  const memberName = isCurrentUser
    ? "You"
    : member
      ? `${member.user.first_name}${member.user.last_name ? ` ${member.user.last_name}` : ""}`
      : `User ${userId}`;

  return (
    <Cell
      before={<ChatMemberAvatar userId={userId} size={28} />}
      after={
        <Info type="text">
          <Text weight="2" className={cn(isCurrentUser && "text-red-500")}>
            {formatCurrencyWithCode(amount, currency)}
          </Text>
        </Info>
      }
      style={{
        backgroundColor: tSectionBgColor,
      }}
    >
      <Skeleton visible={isLoading && !isCurrentUser}>
        <Text
          weight={isCurrentUser ? "1" : "3"}
          style={{
            color: isCurrentUser ? tButtonColor : "inherit",
          }}
        >
          {memberName}
        </Text>
      </Skeleton>
    </Cell>
  );
};

export default ShareParticipant;
```

- [ ] **Step 2: Update `ExpenseDetailsModal` to import the extracted component**

Replace lines 1-91 of `apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx` (drop the inline `ShareParticipant` declaration and the now-unused private `ShareParticipantProps` interface; keep all other imports). The file should:

- Remove the inline `ShareParticipant` sub-component declaration (lines 36-91 currently).
- Add a single import line at the top (right under the existing local `ChatMemberAvatar` import):
  ```tsx
  import ShareParticipant from "./ShareParticipant";
  ```
- Drop now-unused `Info` import if no other call uses it (it's still used elsewhere in the file — verify; if so, keep).

- [ ] **Step 3: Type-check**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec tsc --noEmit`
Expected: EXIT 0

- [ ] **Step 4: Run existing tests to confirm no regression**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec vitest run`
Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Chat/ShareParticipant.tsx apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx
git commit -m "refactor(web): extract ShareParticipant from ExpenseDetailsModal

Pure code move so the upcoming RecurringExpenseDetailsModal can reuse
the same participant-row presentation. No behavior change."
```

---

## Task 2: Extract `RepeatAndEndDateSection` from `AmountFormStep`

Pure refactor. Moves the Repeat Cell + End Date Cell + RecurrencePickerSheet wiring (`AmountFormStep.tsx:419-611`) into a standalone component so it can be reused by the new edit page (Task 8).

The current code is wrapped in a `<form.AppField name="recurrence">` render-prop and reads/writes via `recurrenceField.handleChange`. To make it portable, the new component takes a plain `value` + `onChange` controlled-component interface.

**Files:**
- Create: `apps/web/src/components/features/Expense/RepeatAndEndDateSection.tsx`
- Create: `apps/web/src/components/features/Expense/RepeatAndEndDateSection.test.tsx`
- Modify: `apps/web/src/components/features/Expense/AmountFormStep.tsx` (replace lines 419-611 with `<RepeatAndEndDateSection>`)

- [ ] **Step 1: Write the failing smoke test**

```tsx
// apps/web/src/components/features/Expense/RepeatAndEndDateSection.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RepeatAndEndDateSection from "./RepeatAndEndDateSection";

vi.mock("@telegram-apps/sdk-react", () => ({
  hapticFeedback: { impactOccurred: vi.fn(), selectionChanged: vi.fn() },
  themeParams: {
    subtitleTextColor: { sub: vi.fn(() => () => {}) },
    buttonColor: { sub: vi.fn(() => () => {}) },
    buttonTextColor: { sub: vi.fn(() => () => {}) },
    linkColor: { sub: vi.fn(() => () => {}) },
  },
  useSignal: vi.fn(() => "#888888"),
}));

vi.mock("@telegram-apps/telegram-ui", () => ({
  Cell: ({ children, after }: { children?: React.ReactNode; after?: React.ReactNode }) => (
    <div data-testid="cell">
      {children}
      {after}
    </div>
  ),
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Modal: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Section: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Title: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  IconButton: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
  Navigation: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

describe("RepeatAndEndDateSection", () => {
  it("renders the Repeat row with the preset label", () => {
    render(
      <RepeatAndEndDateSection
        value={{
          preset: "MONTHLY",
          customFrequency: "WEEKLY",
          customInterval: 1,
          weekdays: [],
          endDate: undefined,
        }}
        onChange={() => {}}
      />
    );
    expect(screen.getAllByText("Repeat").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Monthly/).length).toBeGreaterThan(0);
  });

  it("renders the End Date row when preset is not NONE", () => {
    render(
      <RepeatAndEndDateSection
        value={{
          preset: "MONTHLY",
          customFrequency: "WEEKLY",
          customInterval: 1,
          weekdays: [],
          endDate: undefined,
        }}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("End Date")).toBeDefined();
  });

  it("hides the End Date row when preset is NONE", () => {
    render(
      <RepeatAndEndDateSection
        value={{
          preset: "NONE",
          customFrequency: "WEEKLY",
          customInterval: 1,
          weekdays: [],
          endDate: undefined,
        }}
        onChange={() => {}}
      />
    );
    expect(screen.queryByText("End Date")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec vitest run src/components/features/Expense/RepeatAndEndDateSection.test.tsx`
Expected: FAIL with "Cannot find module './RepeatAndEndDateSection'"

- [ ] **Step 3: Create the extracted component**

```tsx
// apps/web/src/components/features/Expense/RepeatAndEndDateSection.tsx
import { Cell, Text } from "@telegram-apps/telegram-ui";
import { hapticFeedback, themeParams, useSignal } from "@telegram-apps/sdk-react";
import { CalendarOff, Repeat as RepeatIcon, X } from "lucide-react";
import { useState } from "react";

import { formatExpenseDate } from "@utils/date";
import RecurrencePickerSheet, {
  type RecurrenceValue,
} from "./RecurrencePickerSheet";
import {
  formatRecurrenceSummary,
  presetToTemplate,
  PRESET_LABEL,
} from "./recurrencePresets";

export interface RepeatAndEndDateSectionProps {
  value: RecurrenceValue;
  onChange: (next: RecurrenceValue) => void;
  /**
   * The expense's transaction date (YYYY-MM-DD). Pre-fills the weekday
   * when the user taps Weekly / Custom in the picker, matches the
   * Apple-Reminders default behaviour. Also used as the `min` for the
   * native end-date input so users can't pick an end before the start.
   */
  defaultWeekdayFromDate?: string;
  /**
   * Called whenever the user touches Repeat or End Date — gives the
   * parent a chance to mark the field touched so cross-field validation
   * errors surface immediately. Optional: AddExpense uses it; the new
   * EditRecurring page does not (it manages its own dirty state).
   */
  onTouched?: () => void;
}

export default function RepeatAndEndDateSection({
  value,
  onChange,
  defaultWeekdayFromDate,
  onTouched,
}: RepeatAndEndDateSectionProps) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);

  const r = value;
  const shortLabel = r.preset === "NONE" ? "Never" : PRESET_LABEL[r.preset];

  // Only show the secondary summary row when it adds info beyond the
  // right-aligned label. WEEKLY shows the picked days, CUSTOM shows the
  // full phrase. DAILY/MONTHLY/YEARLY are self-evident from the label.
  // End date lives in its own dedicated cell, so summary passes
  // endDate: null to avoid duplicating it.
  const showSummary = r.preset === "WEEKLY" || r.preset === "CUSTOM";
  const summary = showSummary
    ? formatRecurrenceSummary({
        ...presetToTemplate({
          preset: r.preset as Exclude<RecurrenceValue["preset"], "NONE">,
          customFrequency: r.customFrequency,
          customInterval: r.customInterval,
          weekdays: r.weekdays,
        }),
        endDate: null,
      })
    : null;

  const openSheet = () => {
    hapticFeedback.impactOccurred("light");
    setRecurrenceOpen(true);
  };

  return (
    <div className="flex flex-col">
      <Cell
        before={
          <RepeatIcon size={24} style={{ color: tSubtitleTextColor }} />
        }
        after={
          <Text style={{ color: tSubtitleTextColor }}>{shortLabel} ›</Text>
        }
        onClick={openSheet}
      >
        Repeat
      </Cell>
      {summary && (
        <Cell onClick={openSheet} multiline>
          <Text style={{ color: tSubtitleTextColor }}>{summary}</Text>
        </Cell>
      )}
      {r.preset !== "NONE" && (
        <Cell
          before={
            <CalendarOff size={24} style={{ color: tSubtitleTextColor }} />
          }
          after={
            r.endDate ? (
              <div className="flex items-center gap-2">
                <Text style={{ color: tSubtitleTextColor }}>
                  {formatExpenseDate(new Date(r.endDate + "T00:00:00"))}
                </Text>
                <span
                  role="button"
                  aria-label="Clear end date"
                  onPointerDown={(e) => {
                    // PointerDown stops the native date picker before it
                    // has a chance to open — onClick on the input fires
                    // too late on iOS Telegram, so the calendar pops even
                    // when we stopPropagation.
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    try {
                      hapticFeedback.selectionChanged();
                    } catch {
                      /* non-TMA */
                    }
                    onChange({ ...r, endDate: undefined });
                    onTouched?.();
                  }}
                  // Sits above the absolute date input (z-10) so taps land
                  // on the pill instead of the hidden file picker.
                  className="text-(--tg-theme-subtitle-text-color) relative z-20 flex size-6 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: "rgba(127, 127, 127, 0.25)",
                  }}
                >
                  <X size={14} />
                </span>
              </div>
            ) : (
              <Text style={{ color: tSubtitleTextColor }}>Never</Text>
            )
          }
          className="relative"
        >
          <input
            type="date"
            value={r.endDate ?? ""}
            min={defaultWeekdayFromDate || undefined}
            onChange={(e) => {
              hapticFeedback.impactOccurred("light");
              onChange({ ...r, endDate: e.target.value || undefined });
              onTouched?.();
            }}
            className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
          />
          End Date
        </Cell>
      )}
      <RecurrencePickerSheet
        open={recurrenceOpen}
        onOpenChange={setRecurrenceOpen}
        defaultWeekdayFromDate={defaultWeekdayFromDate}
        value={
          r.preset === "NONE"
            ? {
                preset: "NONE",
                customFrequency: "WEEKLY",
                customInterval: 1,
                weekdays: [],
                endDate: undefined,
              }
            : r
        }
        onChange={(next) => {
          if (next.preset === "NONE") {
            // Reset weekdays/endDate when clearing recurrence
            onChange({
              preset: "NONE",
              customFrequency: "WEEKLY",
              customInterval: 1,
              weekdays: [],
              endDate: undefined,
            });
          } else {
            onChange(next);
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec vitest run src/components/features/Expense/RepeatAndEndDateSection.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Refactor `AmountFormStep` to use the new component**

Replace lines 419-611 of `apps/web/src/components/features/Expense/AmountFormStep.tsx` (the entire `{/* Repeat Cell ... */} <form.AppField name="recurrence"> ... </form.AppField>` block) with this slimmer version that delegates to the new component:

```tsx
                    {/* Repeat + End Date — extracted to RepeatAndEndDateSection
                        so the new EditRecurringSchedulePage can reuse the same
                        UI without duplicating the cell wiring. */}
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

Also drop the now-unused imports from `AmountFormStep.tsx`:
- `RecurrencePickerSheet` and `RecurrenceValue` (used inside the new component now)
- `presetToTemplate`, `formatRecurrenceSummary`, `PRESET_LABEL` (also moved)
- `CalendarOff`, `Repeat as RepeatIcon`, `X` from `lucide-react`

Add the new import near the existing `RecurrencePickerSheet` import line:
```tsx
import RepeatAndEndDateSection from "./RepeatAndEndDateSection";
import type { RecurrenceValue } from "./RecurrencePickerSheet";
```

- [ ] **Step 6: Type-check + run all web tests**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec tsc --noEmit && _ZO_DOCTOR=0 pnpm --filter web exec vitest run`
Expected: EXIT 0, all tests pass (including the 27 existing recurrence tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/features/Expense/RepeatAndEndDateSection.tsx apps/web/src/components/features/Expense/RepeatAndEndDateSection.test.tsx apps/web/src/components/features/Expense/AmountFormStep.tsx
git commit -m "refactor(web): extract RepeatAndEndDateSection from AmountFormStep

Lifts the Repeat Cell + End Date Cell + RecurrencePickerSheet wiring
into a standalone controlled component so the upcoming
EditRecurringSchedulePage can mount it without duplicating the cells.
Pure refactor — same render output, same haptics, same iOS
date-picker workaround. AmountFormStep now passes value/onChange
through a thin AppField wrapper."
```

---

## Task 3: Build `RecurringExpenseCell` component

New presentation component. Mirrors `ChatExpenseCell`'s layout (44px emoji avatar, "<Name> spends" subhead, "🇸🇬 SGD X.XX" main, description) but the trailing area shows the frequency badge + "Next: <date>" instead of the date + share amount.

The cell needs to fetch the payer's name (via `trpc.telegram.getChatMember`) and the supported currencies (for the flag) — same pattern as `ChatExpenseCell`. The category emoji is passed in as a prop by the parent (Task 4 wires that up).

**Files:**
- Create: `apps/web/src/components/features/Expense/RecurringExpenseCell.tsx`

- [ ] **Step 1: Create the cell component**

```tsx
// apps/web/src/components/features/Expense/RecurringExpenseCell.tsx
import {
  Caption,
  Cell,
  Info,
  Skeleton,
  Text,
} from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Repeat as RepeatIcon } from "lucide-react";
import { format } from "date-fns";

import { trpc } from "@utils/trpc";
import { formatCurrencyWithCode } from "@/utils/financial";
import {
  nextOccurrenceAfter,
  PRESET_LABEL,
  type CanonicalFrequency,
  type Weekday,
} from "./recurrencePresets";

export interface RecurringTemplateForCell {
  id: string;
  description: string;
  amount: string | number;
  currency: string;
  payerId: number;
  chatId: number;
  frequency: CanonicalFrequency;
  interval: number;
  weekdays: Weekday[];
  startDate: Date | string;
  endDate: Date | string | null;
  categoryId: string | null;
}

interface Props {
  template: RecurringTemplateForCell;
  categoryEmoji?: string;
  onClick?: () => void;
}

const FREQ_TO_PRESET: Record<CanonicalFrequency, "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"> = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
};

export default function RecurringExpenseCell({
  template,
  categoryEmoji,
  onClick,
}: Props) {
  const tUserData = useSignal(initData.user);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

  const userId = tUserData?.id ?? 0;

  const { data: member, isLoading: isMemberLoading } =
    trpc.telegram.getChatMember.useQuery({
      chatId: template.chatId,
      userId: template.payerId,
    });

  const { data: supportedCurrencies } =
    trpc.currency.getSupportedCurrencies.useQuery({});

  const isPayerYou = template.payerId === userId;
  const memberFullName = isPayerYou
    ? "You"
    : `${member?.user.first_name ?? ""}${
        member?.user.last_name ? ` ${member.user.last_name}` : ""
      }`;

  // Compute the next fire date using the same helper the form uses.
  // When interval > 1 and frequency=WEEKLY, this matches the Lambda's
  // skip filter — what users see on the cell is what AWS will fire.
  const startDate =
    template.startDate instanceof Date
      ? template.startDate
      : new Date(template.startDate);
  const nextFire = nextOccurrenceAfter(startDate, {
    frequency: template.frequency,
    interval: template.interval,
    weekdays: template.weekdays,
  });

  // Frequency badge text — "Daily", "Weekly", etc., except for non-1
  // intervals which read more naturally as "Every N <unit>".
  const freqLabel =
    template.interval === 1
      ? PRESET_LABEL[FREQ_TO_PRESET[template.frequency]]
      : `Every ${template.interval} ${template.frequency.toLowerCase()}s`;

  const flagEmoji =
    supportedCurrencies?.find((c) => c.code === template.currency)?.flagEmoji ??
    "💱";

  const handleClick = () => {
    hapticFeedback.selectionChanged();
    onClick?.();
  };

  return (
    <Cell
      onClick={handleClick}
      before={
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-xl leading-none">
          {categoryEmoji ?? "❓"}
        </div>
      }
      subhead={
        <Skeleton visible={isMemberLoading}>
          <Caption
            weight="1"
            level="1"
            style={{ color: isPayerYou ? tButtonColor : undefined }}
          >
            {isPayerYou ? "You" : memberFullName} spends
          </Caption>
        </Skeleton>
      }
      description={
        <Caption weight="1" level="1" style={{ color: tSubtitleTextColor }}>
          on{" "}
          <Caption weight="2" level="1">
            {template.description}
          </Caption>
        </Caption>
      }
      after={
        <Info
          avatarStack={
            <Info type="text">
              <div className="flex flex-col items-end gap-1.5">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: "rgba(74,158,255,0.18)",
                    color: tButtonColor,
                  }}
                >
                  ↻ {freqLabel}
                </span>
                <Caption className="w-max" weight="2">
                  Next {format(nextFire, "d MMM")}
                </Caption>
              </div>
            </Info>
          }
          type="avatarStack"
        />
      }
    >
      <span className="flex items-center gap-1">
        {flagEmoji}{" "}
        {formatCurrencyWithCode(Number(template.amount), template.currency)}
      </span>
    </Cell>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec tsc --noEmit`
Expected: EXIT 0

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Expense/RecurringExpenseCell.tsx
git commit -m "feat(web): add RecurringExpenseCell mirroring ChatExpenseCell shape

Presentation component for the recurring management list. Same 44px
emoji avatar / payer subhead / 🇸🇬 amount layout as transactions, but
the trailing area shows a frequency badge + computed next-fire date
instead of the per-occurrence date and share amount."
```

---

## Task 4: Refactor `RecurringTemplatesList` to use the new cell + add modal state

Replace the current plain-Cell rendering with `RecurringExpenseCell`. Add `selectedTemplate` local state to drive the modal (which is built in Task 5; for now mount a placeholder div so the click handler is wired and observable).

The list page also needs the category emoji per template — fetch via `trpc.category.list` and look up by `categoryId`.

**Files:**
- Modify: `apps/web/src/components/features/Expense/RecurringTemplatesList.tsx` (rewrite render block; keep BackButton wiring)

- [ ] **Step 1: Find the chat-categories query path**

Run: `grep -rn "trpc.category" apps/web/src --include="*.tsx" | head -5`
Expected: shows the canonical hook (likely `trpc.category.listForChat.useQuery({ chatId })` or similar). Note the exact name and the response shape (`{ id, emoji, title, ... }`).

- [ ] **Step 2: Rewrite `RecurringTemplatesList.tsx`**

```tsx
// apps/web/src/components/features/Expense/RecurringTemplatesList.tsx
import { Section, Skeleton, Text } from "@telegram-apps/telegram-ui";
import { Repeat as RepeatIcon } from "lucide-react";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { trpc } from "@/utils/trpc";
import RecurringExpenseCell, {
  type RecurringTemplateForCell,
} from "./RecurringExpenseCell";

interface Props {
  chatId: number;
}

type Weekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

interface RecurringTemplate {
  id: string;
  description: string;
  amount: string | number;
  currency: string;
  payerId: number;
  chatId: number;
  frequency: Frequency;
  interval: number;
  weekdays: Weekday[];
  startDate: Date | string;
  endDate: Date | string | null;
  categoryId: string | null;
  status: "ACTIVE" | "CANCELED" | "ENDED";
}

export default function RecurringTemplatesList({ chatId }: Props) {
  const globalNavigate = useNavigate();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const { data, status } = trpc.expense.recurring.list.useQuery({ chatId });
  // REPLACE THIS QUERY NAME with the actual one from Step 1 above.
  const { data: categories } = trpc.category.listForChat.useQuery({ chatId });

  // Show / hide Telegram BackButton for the page
  useEffect(() => {
    backButton.show.ifAvailable();
    return () => {
      backButton.hide();
    };
  }, []);

  // Wire BackButton click to navigate back to chat settings
  useEffect(() => {
    const offClick = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      globalNavigate({
        to: "/chat/$chatId/settings",
        params: { chatId: String(chatId) },
      });
    });
    return () => offClick();
  }, [chatId, globalNavigate]);

  if (status === "pending") {
    return (
      <main className="px-3 pb-8">
        <Section header="Recurring expenses">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="px-4 py-3">
              <Skeleton visible>
                <span>Loading template placeholder</span>
              </Skeleton>
            </div>
          ))}
        </Section>
      </main>
    );
  }

  if (status === "error" || !data) {
    return (
      <main className="px-3 pb-8">
        <div className="text-(--tg-theme-subtitle-text-color) p-6 text-center">
          Failed to load recurring expenses.
        </div>
      </main>
    );
  }

  const templates = data as RecurringTemplate[];

  if (templates.length === 0) {
    return (
      <main className="px-3 pb-8">
        <div className="text-(--tg-theme-subtitle-text-color) p-6 text-center">
          <Text>No recurring expenses yet.</Text>
        </div>
      </main>
    );
  }

  const categoryById = new Map(
    (categories ?? []).map((c: { id: string; emoji: string }) => [c.id, c])
  );
  const selectedTemplate =
    templates.find((t) => t.id === selectedTemplateId) ?? null;

  return (
    <main className="px-3 pb-8">
      <Section header="Recurring expenses">
        {templates.map((t) => {
          const cat = t.categoryId ? categoryById.get(t.categoryId) : null;
          const cellTemplate: RecurringTemplateForCell = {
            id: t.id,
            description: t.description,
            amount: t.amount,
            currency: t.currency,
            payerId: t.payerId,
            chatId: t.chatId,
            frequency: t.frequency,
            interval: t.interval,
            weekdays: t.weekdays,
            startDate: t.startDate,
            endDate: t.endDate,
            categoryId: t.categoryId,
          };
          return (
            <RecurringExpenseCell
              key={t.id}
              template={cellTemplate}
              categoryEmoji={cat?.emoji}
              onClick={() => setSelectedTemplateId(t.id)}
            />
          );
        })}
      </Section>

      {/* Placeholder — replaced by RecurringExpenseDetailsModal in Task 5 */}
      {selectedTemplate && (
        <div data-testid="modal-placeholder" hidden>
          {selectedTemplate.id}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Type-check + run dev server, click a row to verify the cell renders + onClick fires**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec tsc --noEmit`
Expected: EXIT 0. (If the category query name guessed in Step 2 is wrong, type-check will tell you.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Expense/RecurringTemplatesList.tsx
git commit -m "feat(web): use RecurringExpenseCell in RecurringTemplatesList

Replace the bare Cell rows with the new ChatExpenseCell-styled
RecurringExpenseCell. Add selectedTemplateId state + a placeholder for
the upcoming RecurringExpenseDetailsModal."
```

---

## Task 5: Build `RecurringExpenseDetailsModal`

Pure presentation modal. Takes the template + payer member + shares + an `onEdit` callback. Renders the same Section structure as `ExpenseDetailsModal` (What was this for / Who paid / Split amounts / How split) plus a new Schedule section (Repeat row + End Date row).

Header has the Recurring title + a status badge ("↻ <Frequency> · Next <date>") + pencil IconButton (calls `onEdit`) + Close.

Important: this component does NOT manage `secondaryButton` for Delete — the parent (list page, Task 6) owns that lifecycle so the modal stays trivially testable.

**Files:**
- Create: `apps/web/src/components/features/Expense/RecurringExpenseDetailsModal.tsx`
- Create: `apps/web/src/components/features/Expense/RecurringExpenseDetailsModal.test.tsx`

- [ ] **Step 1: Write the failing smoke test**

```tsx
// apps/web/src/components/features/Expense/RecurringExpenseDetailsModal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RecurringExpenseDetailsModal from "./RecurringExpenseDetailsModal";

vi.mock("@telegram-apps/sdk-react", () => ({
  hapticFeedback: { impactOccurred: vi.fn() },
  themeParams: {
    sectionBackgroundColor: { sub: vi.fn(() => () => {}) },
    buttonColor: { sub: vi.fn(() => () => {}) },
    subtitleTextColor: { sub: vi.fn(() => () => {}) },
  },
  useSignal: vi.fn(() => "#888888"),
}));

vi.mock("@telegram-apps/telegram-ui", () => ({
  Modal: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <div data-testid="modal">{children}</div> : null,
  Cell: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Section: ({ header, children }: { header?: string; children?: React.ReactNode }) => (
    <div>
      {header && <h3>{header}</h3>}
      {children}
    </div>
  ),
  Title: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Caption: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  IconButton: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Skeleton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Info: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/utils/trpc", () => ({
  trpc: {
    telegram: {
      getChatMember: { useQuery: vi.fn(() => ({ data: undefined, isLoading: true })) },
    },
  },
}));

vi.mock("@/components/ui/ChatMemberAvatar", () => ({
  default: () => <div data-testid="avatar" />,
}));

vi.mock("../Chat/ShareParticipant", () => ({
  default: ({ userId }: { userId: number }) => (
    <div data-testid={`share-${userId}`} />
  ),
}));

const baseTemplate = {
  id: "tmpl-1",
  chatId: 100,
  payerId: 200,
  description: "Cleaner bill",
  amount: "200",
  currency: "SGD",
  splitMode: "EQUAL" as const,
  participantIds: [200, 300],
  customSplits: null,
  categoryId: "cat-1",
  frequency: "MONTHLY" as const,
  interval: 1,
  weekdays: [],
  startDate: new Date("2026-04-25"),
  endDate: new Date("2026-10-31"),
  timezone: "Asia/Singapore",
  status: "ACTIVE" as const,
};

describe("RecurringExpenseDetailsModal", () => {
  it("renders all five sections when open with shares", () => {
    render(
      <RecurringExpenseDetailsModal
        open
        onOpenChange={() => {}}
        template={baseTemplate}
        shares={[
          { userId: 200, amount: 100 },
          { userId: 300, amount: 100 },
        ]}
        userId={200}
        categoryEmoji="🏠"
        categoryTitle="Home"
        onEdit={() => {}}
      />
    );
    expect(screen.getByText("What was this for?")).toBeDefined();
    expect(screen.getByText("Who paid for this?")).toBeDefined();
    expect(screen.getByText("Split amounts")).toBeDefined();
    expect(screen.getByText("How is this expense split?")).toBeDefined();
    expect(screen.getByText("Schedule")).toBeDefined();
    expect(screen.getByTestId("share-200")).toBeDefined();
    expect(screen.getByTestId("share-300")).toBeDefined();
  });

  it("omits the Split amounts section when there are no shares", () => {
    render(
      <RecurringExpenseDetailsModal
        open
        onOpenChange={() => {}}
        template={baseTemplate}
        shares={[]}
        userId={200}
        categoryEmoji="🏠"
        categoryTitle="Home"
        onEdit={() => {}}
      />
    );
    expect(screen.queryByText("Split amounts")).toBeNull();
  });

  it("renders 'Never' for end date when template has no endDate", () => {
    render(
      <RecurringExpenseDetailsModal
        open
        onOpenChange={() => {}}
        template={{ ...baseTemplate, endDate: null }}
        shares={[]}
        userId={200}
        categoryEmoji="🏠"
        categoryTitle="Home"
        onEdit={() => {}}
      />
    );
    expect(screen.getByText("Never")).toBeDefined();
  });

  it("calls onEdit when pencil clicked", () => {
    const onEdit = vi.fn();
    render(
      <RecurringExpenseDetailsModal
        open
        onOpenChange={() => {}}
        template={baseTemplate}
        shares={[]}
        userId={200}
        categoryEmoji="🏠"
        categoryTitle="Home"
        onEdit={onEdit}
      />
    );
    // Find the pencil button — it's the only IconButton with aria-label "Edit recurring template"
    screen.getByLabelText("Edit recurring template").click();
    expect(onEdit).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec vitest run src/components/features/Expense/RecurringExpenseDetailsModal.test.tsx`
Expected: FAIL with "Cannot find module './RecurringExpenseDetailsModal'"

- [ ] **Step 3: Build the modal**

```tsx
// apps/web/src/components/features/Expense/RecurringExpenseDetailsModal.tsx
import {
  Badge,
  Caption,
  Cell,
  IconButton,
  Info,
  Modal,
  Section,
  Skeleton,
  Text,
  Title,
} from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Calendar as CalendarIcon,
  Pencil,
  Repeat as RepeatIcon,
  X,
} from "lucide-react";
import { format } from "date-fns";

import { trpc } from "@utils/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import ShareParticipant from "../Chat/ShareParticipant";
import { formatCurrencyWithCode } from "@/utils/financial";
import { formatExpenseDate } from "@utils/date";
import {
  formatRecurrenceSummary,
  nextOccurrenceAfter,
  type CanonicalFrequency,
  type Weekday,
} from "./recurrencePresets";

const splitModeMap = {
  EQUAL: "Split equally",
  PERCENTAGE: "Split by percentage",
  EXACT: "Split exactly",
  SHARES: "Split by shares",
} as const;

type SplitMode = keyof typeof splitModeMap;

export interface RecurringTemplateForModal {
  id: string;
  chatId: number;
  payerId: number;
  description: string;
  amount: string | number;
  currency: string;
  splitMode: SplitMode;
  participantIds: number[];
  customSplits: unknown;
  categoryId: string | null;
  frequency: CanonicalFrequency;
  interval: number;
  weekdays: Weekday[];
  startDate: Date | string;
  endDate: Date | string | null;
  timezone: string;
  status: "ACTIVE" | "CANCELED" | "ENDED";
}

export interface ShareForModal {
  userId: number;
  amount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: RecurringTemplateForModal;
  shares: ShareForModal[];
  userId: number;
  categoryEmoji?: string;
  categoryTitle?: string;
  onEdit: () => void;
}

export default function RecurringExpenseDetailsModal({
  open,
  onOpenChange,
  template,
  shares,
  userId,
  categoryEmoji,
  categoryTitle,
  onEdit,
}: Props) {
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

  const { data: member, isLoading: isMemberLoading } =
    trpc.telegram.getChatMember.useQuery({
      chatId: template.chatId,
      userId: template.payerId,
    });

  const isPayerYou = template.payerId === userId;
  const memberFullName = isPayerYou
    ? "You"
    : `${member?.user.first_name ?? ""}${
        member?.user.last_name ? ` ${member.user.last_name}` : ""
      }`;

  const startDate =
    template.startDate instanceof Date
      ? template.startDate
      : new Date(template.startDate);
  const endDate = template.endDate
    ? template.endDate instanceof Date
      ? template.endDate
      : new Date(template.endDate)
    : null;

  const nextFire = nextOccurrenceAfter(startDate, {
    frequency: template.frequency,
    interval: template.interval,
    weekdays: template.weekdays,
  });

  const repeatSummary = formatRecurrenceSummary({
    frequency: template.frequency,
    interval: template.interval,
    weekdays: template.weekdays,
    endDate: null,
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={
        <Modal.Header
          before={
            <Title level="3" weight="1">
              Recurring
            </Title>
          }
          after={
            <div className="flex items-center gap-2">
              <IconButton
                size="s"
                mode="gray"
                onClick={onEdit}
                aria-label="Edit recurring template"
                className="p-1"
              >
                <Pencil
                  size={20}
                  strokeWidth={3}
                  style={{ color: tButtonColor }}
                />
              </IconButton>
              <Modal.Close>
                <IconButton
                  size="s"
                  mode="gray"
                  onClick={() => hapticFeedback.impactOccurred("light")}
                >
                  <X
                    size={20}
                    strokeWidth={3}
                    style={{ color: tSubtitleTextColor }}
                  />
                </IconButton>
              </Modal.Close>
            </div>
          }
        >
          <Badge type="number" mode="secondary" className="text-blue-400">
            <Caption weight="2" className="text-blue-400">
              ↻ {repeatSummary} · Next {format(nextFire, "d MMM")}
            </Caption>
          </Badge>
        </Modal.Header>
      }
    >
      <div className="flex max-h-[70vh] flex-col overflow-y-auto pb-5">
        {/* What was this for? */}
        <Section header="What was this for?" className="px-3">
          <Cell
            style={{ backgroundColor: tSectionBgColor }}
            before={
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-lg leading-none">
                {categoryEmoji ?? "❓"}
              </div>
            }
            subtitle={<Caption>{categoryTitle ?? "Uncategorized"}</Caption>}
          >
            <Text className="text-wrap">{template.description}</Text>
          </Cell>
        </Section>

        {/* Who paid for this? */}
        <Section header="Who paid for this?" className="px-3">
          <Cell
            before={<ChatMemberAvatar userId={template.payerId} size={48} />}
            subtitle={
              <Skeleton visible={isMemberLoading}>
                <Caption>Started {formatExpenseDate(startDate)}</Caption>
              </Skeleton>
            }
            after={
              <Info subtitle="Per fire" type="text">
                <Text weight="2">
                  {formatCurrencyWithCode(
                    Number(template.amount),
                    template.currency
                  )}
                </Text>
              </Info>
            }
            style={{ backgroundColor: tSectionBgColor }}
          >
            <Skeleton visible={isMemberLoading}>
              <Text
                weight="2"
                style={{ color: isPayerYou ? tButtonColor : "inherit" }}
              >
                {memberFullName} spends
              </Text>
            </Skeleton>
          </Cell>
        </Section>

        {/* Split amounts — omitted when shares list is empty */}
        {shares.length > 0 && (
          <Section header="Split amounts" className="px-3">
            {[...shares]
              .sort((a, b) => {
                if (a.userId === userId) return -1;
                if (b.userId === userId) return 1;
                return 0;
              })
              .map((share) => (
                <ShareParticipant
                  key={share.userId}
                  chatId={template.chatId}
                  userId={share.userId}
                  amount={share.amount}
                  currency={template.currency}
                  isCurrentUser={share.userId === userId}
                />
              ))}
          </Section>
        )}

        {/* How is this expense split? */}
        <Section className="px-3" header="How is this expense split?">
          <Cell
            after={
              <Text className="text-gray-400">
                {splitModeMap[template.splitMode]}
              </Text>
            }
            style={{ backgroundColor: tSectionBgColor }}
          >
            <Text weight="2">Split Method</Text>
          </Cell>
        </Section>

        {/* Schedule — same shape used in the augmented ExpenseDetailsModal */}
        <Section className="px-3" header="Schedule">
          <Cell
            before={
              <RepeatIcon size={20} style={{ color: tSubtitleTextColor }} />
            }
            after={
              <Text style={{ color: tSubtitleTextColor }}>{repeatSummary}</Text>
            }
            style={{ backgroundColor: tSectionBgColor }}
          >
            <Text weight="2">Repeat</Text>
          </Cell>
          <Cell
            before={
              <CalendarIcon size={20} style={{ color: tSubtitleTextColor }} />
            }
            after={
              <Text style={{ color: tSubtitleTextColor }}>
                {endDate ? formatExpenseDate(endDate) : "Never"}
              </Text>
            }
            style={{ backgroundColor: tSectionBgColor }}
          >
            <Text weight="2">End Date</Text>
          </Cell>
        </Section>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec vitest run src/components/features/Expense/RecurringExpenseDetailsModal.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check the whole app**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec tsc --noEmit`
Expected: EXIT 0

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/features/Expense/RecurringExpenseDetailsModal.tsx apps/web/src/components/features/Expense/RecurringExpenseDetailsModal.test.tsx
git commit -m "feat(web): add RecurringExpenseDetailsModal

Bottom-sheet detail mirroring ExpenseDetailsModal's section structure:
What was this for / Who paid / Split amounts (when present) / How was
it split / Schedule. Pure presentation — secondaryButton lifecycle
stays with the parent so the modal is trivially testable in isolation."
```

---

## Task 6: Wire `RecurringExpenseDetailsModal` into the list page + Delete via secondaryButton

Replace the placeholder div in `RecurringTemplatesList` with the real modal. Wire the Telegram `secondaryButton` to "Delete" while the modal is open, using the same lifecycle pattern as `ChatExpenseCell:200-247`.

The modal needs `shares` for the Split amounts section — derive client-side from `participantIds`, `splitMode`, `customSplits`, and `amount`. For v1, only handle `EQUAL` (the most common case) accurately; other split modes can show participants without precise amounts.

Actually — to keep the modal honest, only render the Split amounts section when we can compute shares. For non-EQUAL modes without `customSplits`, pass an empty array → section is omitted (modal already handles that case per Task 5 test #2).

**Files:**
- Modify: `apps/web/src/components/features/Expense/RecurringTemplatesList.tsx` (replace placeholder, add `secondaryButton` lifecycle)

- [ ] **Step 1: Replace the placeholder block + add secondaryButton wiring**

Add these imports near the top of `RecurringTemplatesList.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import {
  popup,
  secondaryButton,
  themeParams,
  useSignal,
  initData,
} from "@telegram-apps/sdk-react";
import RecurringExpenseDetailsModal, {
  type RecurringTemplateForModal,
} from "./RecurringExpenseDetailsModal";
```

Replace the `selectedTemplate` block + placeholder div with this full wiring:

```tsx
  const tDestructive = useSignal(themeParams.destructiveTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tUserData = useSignal(initData.user);
  const userId = tUserData?.id ?? 0;

  const trpcUtils = trpc.useUtils();
  const cancelMutation = trpc.expense.recurring.cancel.useMutation({
    onSuccess: () => {
      trpcUtils.expense.recurring.list.invalidate({ chatId });
    },
  });

  const offSecondaryClickRef = useRef<VoidFunction | undefined>(undefined);

  useEffect(() => {
    return () => {
      offSecondaryClickRef.current?.();
    };
  }, []);

  const handleModalOpenChange = (templateId: string | null) => {
    setSelectedTemplateId(templateId);

    if (templateId) {
      secondaryButton.setParams({
        text: "Delete",
        isVisible: true,
        isEnabled: true,
        textColor: tDestructive,
      });

      offSecondaryClickRef.current?.();
      offSecondaryClickRef.current = secondaryButton.onClick(async () => {
        const action = await popup.open.ifAvailable({
          title: "Delete recurring expense?",
          message: "Future occurrences won't fire. Past expenses are kept.",
          buttons: [
            { type: "destructive", text: "Delete", id: "delete-template" },
            { type: "cancel" },
          ],
        });
        if (action !== "delete-template") return;

        secondaryButton.setParams({
          isLoaderVisible: true,
          isEnabled: false,
        });
        try {
          await cancelMutation.mutateAsync({ templateId });
          handleModalOpenChange(null);
        } catch (error) {
          console.error("Failed to cancel recurring template:", error);
          alert("Couldn't delete this recurring expense. Try again later.");
        } finally {
          secondaryButton.setParams({
            isLoaderVisible: false,
            isEnabled: true,
          });
        }
      });
    } else {
      secondaryButton.setParams({
        isVisible: false,
        isEnabled: false,
        textColor: tButtonColor,
      });
      offSecondaryClickRef.current?.();
      offSecondaryClickRef.current = undefined;
    }
  };
```

Replace the `setSelectedTemplateId(t.id)` callback in the cell map with `handleModalOpenChange(t.id)`.

Replace the placeholder div with the real modal mount. The Split amounts shares are computed client-side for EQUAL mode only (other modes need backend's recurring.get to return computed shares — out of scope for v1):

```tsx
      {selectedTemplate && (
        <RecurringExpenseDetailsModal
          open
          onOpenChange={(open) => {
            if (!open) handleModalOpenChange(null);
          }}
          template={selectedTemplate as unknown as RecurringTemplateForModal}
          shares={
            selectedTemplate.splitMode === "EQUAL"
              ? selectedTemplate.participantIds.map((pid: number) => ({
                  userId: pid,
                  amount:
                    Number(selectedTemplate.amount) /
                    Math.max(selectedTemplate.participantIds.length, 1),
                }))
              : []
          }
          userId={userId}
          categoryEmoji={
            selectedTemplate.categoryId
              ? (categoryById.get(selectedTemplate.categoryId) as { emoji: string })?.emoji
              : undefined
          }
          categoryTitle={
            selectedTemplate.categoryId
              ? (categoryById.get(selectedTemplate.categoryId) as { title: string })?.title
              : undefined
          }
          onEdit={() => {
            handleModalOpenChange(null);
            globalNavigate({
              to: "/chat/$chatId/edit-recurring/$templateId",
              params: {
                chatId: String(chatId),
                templateId: selectedTemplate.id,
              },
            });
          }}
        />
      )}
```

Update the `RecurringTemplate` interface in this file to include `splitMode` and `participantIds`:

```tsx
interface RecurringTemplate {
  id: string;
  description: string;
  amount: string | number;
  currency: string;
  payerId: number;
  chatId: number;
  splitMode: "EQUAL" | "PERCENTAGE" | "EXACT" | "SHARES";
  participantIds: number[];
  customSplits: unknown;
  categoryId: string | null;
  timezone: string;
  frequency: Frequency;
  interval: number;
  weekdays: Weekday[];
  startDate: Date | string;
  endDate: Date | string | null;
  status: "ACTIVE" | "CANCELED" | "ENDED";
}
```

- [ ] **Step 2: Type-check**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec tsc --noEmit`
Expected: EXIT 0. (If the route `/chat/$chatId/edit-recurring/$templateId` is reported as missing, that's expected — Task 7 creates it. Either skip this verify or stub the navigate target.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Expense/RecurringTemplatesList.tsx
git commit -m "feat(web): wire RecurringExpenseDetailsModal + Delete on list page

Replace the placeholder with the real modal. Telegram secondaryButton
labeled Delete (red) shows while the modal is open, fires popup.open
confirm, then calls expense.recurring.cancel and invalidates the list.
Pencil onEdit navigates to /edit-recurring/\$templateId (route added in
the next task)."
```

---

## Task 7: Add the `/edit-recurring/$templateId` route + page skeleton

Create the new TanStack Router file and a minimal page skeleton (header + read-only summary cell + empty Schedule placeholder). The mutation wiring and Save button arrive in Task 8.

**Files:**
- Create: `apps/web/src/routes/_tma/chat.$chatId_.edit-recurring.$templateId.tsx`
- Create: `apps/web/src/components/features/Expense/EditRecurringSchedulePage.tsx`

- [ ] **Step 1: Create the route file**

```tsx
// apps/web/src/routes/_tma/chat.$chatId_.edit-recurring.$templateId.tsx
import { createFileRoute } from "@tanstack/react-router";
import EditRecurringSchedulePage from "@/components/features/Expense/EditRecurringSchedulePage";

export const Route = createFileRoute(
  "/_tma/chat/$chatId_/edit-recurring/$templateId"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId, templateId } = Route.useParams();
  return (
    <EditRecurringSchedulePage
      chatId={Number(chatId)}
      templateId={templateId}
    />
  );
}
```

- [ ] **Step 2: Create the page skeleton**

```tsx
// apps/web/src/components/features/Expense/EditRecurringSchedulePage.tsx
import {
  Caption,
  Cell,
  Section,
  Skeleton,
  Subheadline,
  Text,
} from "@telegram-apps/telegram-ui";
import {
  backButton,
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { trpc } from "@/utils/trpc";
import { formatCurrencyWithCode } from "@/utils/financial";

interface Props {
  chatId: number;
  templateId: string;
}

const splitModeMap = {
  EQUAL: "Equal split",
  PERCENTAGE: "Split by percentage",
  EXACT: "Split exactly",
  SHARES: "Split by shares",
} as const;

export default function EditRecurringSchedulePage({
  chatId,
  templateId,
}: Props) {
  const globalNavigate = useNavigate();
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tUserData = useSignal(initData.user);
  const userId = tUserData?.id ?? 0;

  const { data: template, status } = trpc.expense.recurring.get.useQuery({
    templateId,
  });
  const { data: categories } = trpc.category.listForChat.useQuery({ chatId });
  const { data: supportedCurrencies } =
    trpc.currency.getSupportedCurrencies.useQuery({});

  // BackButton wiring — same pattern as RecurringTemplatesList
  useEffect(() => {
    backButton.show.ifAvailable();
    return () => {
      backButton.hide();
    };
  }, []);

  useEffect(() => {
    const offClick = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      globalNavigate({
        to: "/chat/$chatId/recurring-expenses",
        params: { chatId: String(chatId) },
      });
    });
    return () => offClick();
  }, [chatId, globalNavigate]);

  if (status === "pending") {
    return (
      <main className="px-3 pt-3 pb-8">
        <Skeleton visible>
          <Cell>Loading…</Cell>
        </Skeleton>
      </main>
    );
  }

  if (status === "error" || !template) {
    return (
      <main className="px-3 pt-3 pb-8">
        <div className="text-(--tg-theme-subtitle-text-color) p-6 text-center">
          <Text>Couldn't load this recurring expense.</Text>
        </div>
      </main>
    );
  }

  const t = template as {
    id: string;
    chatId: number;
    payerId: number;
    description: string;
    amount: string | number;
    currency: string;
    splitMode: keyof typeof splitModeMap;
    categoryId: string | null;
  };

  const cat = t.categoryId
    ? (categories ?? []).find(
        (c: { id: string }) => c.id === t.categoryId
      )
    : null;
  const flagEmoji =
    supportedCurrencies?.find((c) => c.code === t.currency)?.flagEmoji ?? "💱";
  const isPayerYou = t.payerId === userId;

  return (
    <main className="flex flex-col gap-4 px-3 pt-3 pb-8">
      <div className="px-2">
        <Subheadline weight="2">Editing</Subheadline>
      </div>

      {/* Read-only summary Cell — same shape as the row the user just tapped */}
      <Section>
        <Cell
          before={
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-xl leading-none">
              {(cat as { emoji: string } | null)?.emoji ?? "❓"}
            </div>
          }
          subhead={
            <Caption
              weight="1"
              level="1"
              style={{ color: isPayerYou ? tButtonColor : undefined }}
            >
              {isPayerYou ? "You" : `User ${t.payerId}`} spends
            </Caption>
          }
          description={
            <>
              on{" "}
              <Caption weight="2" level="1">
                {t.description}
              </Caption>
            </>
          }
          after={<Text>{splitModeMap[t.splitMode]}</Text>}
        >
          <span className="flex items-center gap-1">
            {flagEmoji}{" "}
            {formatCurrencyWithCode(Number(t.amount), t.currency)}
          </span>
        </Cell>
      </Section>

      {/* Schedule section — wired in Task 8 */}
      <div className="px-2">
        <Subheadline weight="2">Schedule</Subheadline>
      </div>
      <Section>
        <Cell>
          <Text style={{ color: tButtonColor }}>(Schedule editor — Task 8)</Text>
        </Cell>
      </Section>
    </main>
  );
}
```

- [ ] **Step 3: Type-check + run dev server, navigate to the new route, verify the skeleton renders**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec tsc --noEmit`
Expected: EXIT 0

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_tma/chat.\$chatId_.edit-recurring.\$templateId.tsx apps/web/src/components/features/Expense/EditRecurringSchedulePage.tsx
git commit -m "feat(web): scaffold /chat/\$chatId/edit-recurring/\$templateId

Adds the route and a page skeleton with the read-only summary Cell
(category emoji + 'You spend' subhead + amount + split mode in
trailing). Schedule editor and Save/Delete wiring follow in Tasks 8-9."
```

---

## Task 8: Wire `RepeatAndEndDateSection` + Save (`mainButton`)

Mount the shared component on the edit page. Manage local state for the schedule fields, compute the diff against the template's server values on Save, and call `expense.recurring.update` with only the dirty fields.

**Files:**
- Modify: `apps/web/src/components/features/Expense/EditRecurringSchedulePage.tsx`

- [ ] **Step 1: Replace the placeholder Schedule section**

Add these imports:

```tsx
import { mainButton } from "@telegram-apps/sdk-react";
import RepeatAndEndDateSection from "./RepeatAndEndDateSection";
import type { RecurrenceValue } from "./RecurrencePickerSheet";
import { format } from "date-fns";
```

Replace the placeholder `<Section><Cell>...</Cell></Section>` for the Schedule with the controlled component + Save wiring. Add this after the read-only summary Cell:

```tsx
  // Local schedule state mirrors the form's RecurrenceValue shape so we
  // can reuse the same picker/validation logic from add-expense.
  const initialRecurrence: RecurrenceValue = {
    preset:
      template &&
      "frequency" in template &&
      template.interval === 1 &&
      (template.frequency === "DAILY" ||
        template.frequency === "WEEKLY" ||
        template.frequency === "MONTHLY" ||
        template.frequency === "YEARLY")
        ? template.frequency
        : "CUSTOM",
    customFrequency:
      (template?.frequency as
        | "DAILY"
        | "WEEKLY"
        | "MONTHLY"
        | "YEARLY") ?? "WEEKLY",
    customInterval: template?.interval ?? 1,
    weekdays: (template?.weekdays as RecurrenceValue["weekdays"]) ?? [],
    endDate: template?.endDate
      ? format(
          template.endDate instanceof Date
            ? template.endDate
            : new Date(template.endDate),
          "yyyy-MM-dd"
        )
      : undefined,
  };

  const [recurrence, setRecurrence] = useState<RecurrenceValue>(initialRecurrence);
  const trpcUtils = trpc.useUtils();
  const updateMutation = trpc.expense.recurring.update.useMutation({
    onSuccess: () => {
      trpcUtils.expense.recurring.list.invalidate({ chatId });
      trpcUtils.expense.recurring.get.invalidate({ templateId });
    },
  });

  // mainButton (Save) wiring
  useEffect(() => {
    if (!template) return;
    mainButton.setParams.ifAvailable({
      text: "Save",
      isVisible: true,
      isEnabled: true,
    });
    const offClick = mainButton.onClick.ifAvailable(async () => {
      // Only send fields that actually changed.
      const dirtyFields: {
        templateId: string;
        frequency?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
        interval?: number;
        weekdays?: RecurrenceValue["weekdays"];
        endDate?: Date | null;
      } = { templateId };

      const newFrequency =
        recurrence.preset === "CUSTOM"
          ? recurrence.customFrequency
          : recurrence.preset === "NONE"
            ? null
            : recurrence.preset;
      const newInterval =
        recurrence.preset === "CUSTOM" ? recurrence.customInterval : 1;
      const newWeekdays = recurrence.weekdays;
      const newEndDate = recurrence.endDate
        ? new Date(recurrence.endDate + "T00:00:00")
        : null;

      if (newFrequency && newFrequency !== template.frequency) {
        dirtyFields.frequency = newFrequency;
      }
      if (newInterval !== template.interval) {
        dirtyFields.interval = newInterval;
      }
      if (
        JSON.stringify(newWeekdays) !==
        JSON.stringify(template.weekdays ?? [])
      ) {
        dirtyFields.weekdays = newWeekdays;
      }
      const oldEndIso = template.endDate
        ? format(
            template.endDate instanceof Date
              ? template.endDate
              : new Date(template.endDate),
            "yyyy-MM-dd"
          )
        : null;
      const newEndIso = recurrence.endDate ?? null;
      if (oldEndIso !== newEndIso) {
        dirtyFields.endDate = newEndDate;
      }

      // Nothing changed — bail with a small haptic.
      if (Object.keys(dirtyFields).length === 1) {
        hapticFeedback.notificationOccurred("warning");
        return;
      }

      mainButton.setParams.ifAvailable({
        isLoaderVisible: true,
        isEnabled: false,
      });
      try {
        await updateMutation.mutateAsync(dirtyFields);
        hapticFeedback.notificationOccurred("success");
        globalNavigate({
          to: "/chat/$chatId/recurring-expenses",
          params: { chatId: String(chatId) },
        });
      } catch (error) {
        console.error("Failed to update recurring template:", error);
        hapticFeedback.notificationOccurred("error");
        alert(
          error instanceof Error
            ? error.message
            : "Couldn't save changes. Try again."
        );
      } finally {
        mainButton.setParams.ifAvailable({
          isLoaderVisible: false,
          isEnabled: true,
        });
      }
    });

    return () => {
      offClick?.();
      mainButton.setParams.ifAvailable({ isVisible: false });
    };
  }, [template, recurrence, templateId, updateMutation, chatId, globalNavigate]);
```

Replace the placeholder Schedule Section block with:

```tsx
      <div className="px-2">
        <Subheadline weight="2">Schedule</Subheadline>
      </div>
      <Section>
        <RepeatAndEndDateSection
          value={recurrence}
          onChange={setRecurrence}
          defaultWeekdayFromDate={
            template
              ? format(
                  template.startDate instanceof Date
                    ? template.startDate
                    : new Date(template.startDate),
                  "yyyy-MM-dd"
                )
              : undefined
          }
        />
      </Section>
```

- [ ] **Step 2: Type-check**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec tsc --noEmit`
Expected: EXIT 0

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Expense/EditRecurringSchedulePage.tsx
git commit -m "feat(web): wire schedule editor + Save on edit-recurring page

Mount the shared RepeatAndEndDateSection. Local recurrence state +
diff vs. server values on Save so we only send dirty fields to
expense.recurring.update. mainButton labeled Save; on success
invalidates list+get queries and navigates back to the list."
```

---

## Task 9: Wire Delete (`secondaryButton`) on the edit page

Same popup-confirm pattern as the list-page modal. On confirm, call `expense.recurring.cancel`, then navigate back.

**Files:**
- Modify: `apps/web/src/components/features/Expense/EditRecurringSchedulePage.tsx`

- [ ] **Step 1: Add secondaryButton wiring**

Add to imports:

```tsx
import { popup, secondaryButton } from "@telegram-apps/sdk-react";
import { useRef } from "react";
```

After the `updateMutation` declaration, add:

```tsx
  const cancelMutation = trpc.expense.recurring.cancel.useMutation({
    onSuccess: () => {
      trpcUtils.expense.recurring.list.invalidate({ chatId });
    },
  });
  const tDestructive = useSignal(themeParams.destructiveTextColor);
  const offSecondaryClickRef = useRef<VoidFunction | undefined>(undefined);

  // secondaryButton (Delete) wiring
  useEffect(() => {
    if (!template) return;
    secondaryButton.setParams.ifAvailable({
      text: "Delete",
      isVisible: true,
      isEnabled: true,
      textColor: tDestructive,
    });

    offSecondaryClickRef.current?.();
    offSecondaryClickRef.current = secondaryButton.onClick(async () => {
      const action = await popup.open.ifAvailable({
        title: "Delete recurring expense?",
        message: "Future occurrences won't fire. Past expenses are kept.",
        buttons: [
          { type: "destructive", text: "Delete", id: "delete-template" },
          { type: "cancel" },
        ],
      });
      if (action !== "delete-template") return;

      secondaryButton.setParams({
        isLoaderVisible: true,
        isEnabled: false,
      });
      try {
        await cancelMutation.mutateAsync({ templateId });
        hapticFeedback.notificationOccurred("success");
        globalNavigate({
          to: "/chat/$chatId/recurring-expenses",
          params: { chatId: String(chatId) },
        });
      } catch (error) {
        console.error("Failed to cancel recurring template:", error);
        alert(
          error instanceof Error
            ? error.message
            : "Couldn't delete this recurring expense. Try again."
        );
      } finally {
        secondaryButton.setParams({
          isLoaderVisible: false,
          isEnabled: true,
        });
      }
    });

    return () => {
      offSecondaryClickRef.current?.();
      offSecondaryClickRef.current = undefined;
      secondaryButton.setParams.ifAvailable({ isVisible: false });
    };
  }, [template, templateId, cancelMutation, chatId, globalNavigate, tDestructive]);
```

- [ ] **Step 2: Type-check**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec tsc --noEmit`
Expected: EXIT 0

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Expense/EditRecurringSchedulePage.tsx
git commit -m "feat(web): wire Delete (secondaryButton) on edit-recurring page

Same popup confirm + recurring.cancel mutation as the list-page modal.
On success: success haptic, invalidate list, navigate back to recurring
list page."
```

---

## Task 10: Augment `ExpenseDetailsModal` with the Schedule section

When the viewed expense has a non-null `recurringTemplateId`, append a Schedule section identical in shape to the one in `RecurringExpenseDetailsModal` (Task 5) — Repeat row + End Date row.

The lookup uses `trpc.expense.recurring.get.useQuery({ templateId }, { enabled: !!templateId })` so non-recurring expenses pay no extra cost.

**Files:**
- Modify: `apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx`

- [ ] **Step 1: Add the conditional Schedule section**

Add to imports:

```tsx
import {
  Calendar as CalendarIcon,
  Repeat as RepeatIcon,
  X,
  Pencil,
} from "lucide-react";
import {
  formatRecurrenceSummary,
  type CanonicalFrequency,
  type Weekday,
} from "@/components/features/Expense/recurrencePresets";
import { formatExpenseDate } from "@utils/date";
```

Add this block right before the closing `</div>` that wraps all the Sections (after the existing "How was this expense split?" Section):

```tsx
        {/* Schedule (only when this expense was created by a recurring
            template). Same shape as the Schedule section in
            RecurringExpenseDetailsModal so users see one design across
            both places. */}
        {expense.recurringTemplateId && (
          <RecurringScheduleSection
            templateId={expense.recurringTemplateId}
            tSectionBgColor={tSectionBgColor}
            tSubtitleTextColor={tSubtitleTextColor}
          />
        )}
```

Above the `ExpenseDetailsModal` declaration, add the sub-component:

```tsx
interface RecurringScheduleSectionProps {
  templateId: string;
  tSectionBgColor: string | undefined;
  tSubtitleTextColor: string | undefined;
}

const RecurringScheduleSection = ({
  templateId,
  tSectionBgColor,
  tSubtitleTextColor,
}: RecurringScheduleSectionProps) => {
  const { data: template } = trpc.expense.recurring.get.useQuery(
    { templateId },
    { enabled: Boolean(templateId) }
  );

  if (!template) return null;

  const t = template as {
    frequency: CanonicalFrequency;
    interval: number;
    weekdays: Weekday[];
    endDate: Date | string | null;
  };

  const repeatSummary = formatRecurrenceSummary({
    frequency: t.frequency,
    interval: t.interval,
    weekdays: t.weekdays,
    endDate: null,
  });
  const endDate = t.endDate
    ? t.endDate instanceof Date
      ? t.endDate
      : new Date(t.endDate)
    : null;

  return (
    <Section className="px-3" header="Schedule">
      <Cell
        before={
          <RepeatIcon size={20} style={{ color: tSubtitleTextColor }} />
        }
        after={
          <Text style={{ color: tSubtitleTextColor }}>{repeatSummary}</Text>
        }
        style={{ backgroundColor: tSectionBgColor }}
      >
        <Text weight="2">Repeat</Text>
      </Cell>
      <Cell
        before={
          <CalendarIcon size={20} style={{ color: tSubtitleTextColor }} />
        }
        after={
          <Text style={{ color: tSubtitleTextColor }}>
            {endDate ? formatExpenseDate(endDate) : "Never"}
          </Text>
        }
        style={{ backgroundColor: tSectionBgColor }}
      >
        <Text weight="2">End Date</Text>
      </Cell>
    </Section>
  );
};
```

- [ ] **Step 2: Type-check + run all web tests**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec tsc --noEmit && _ZO_DOCTOR=0 pnpm --filter web exec vitest run`
Expected: EXIT 0, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx
git commit -m "feat(web): show Schedule section in ExpenseDetailsModal for recurring

When the viewed expense has recurringTemplateId set, append the same
Repeat + End Date rows used in RecurringExpenseDetailsModal. Lazy
recurring.get query so non-recurring expenses pay no cost. Pencil
keeps its current per-occurrence-edit scope; no deeplink to template
mgmt — by design (see spec)."
```

---

## Final Verification

- [ ] **Step 1: Run the whole web test suite**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec vitest run`
Expected: all tests pass, including the 27 existing recurrence tests + the 3+4 new component smoke tests.

- [ ] **Step 2: Type-check the entire repo**

Run: `_ZO_DOCTOR=0 pnpm --filter web exec tsc --noEmit && _ZO_DOCTOR=0 pnpm --filter trpc exec tsc --noEmit`
Expected: EXIT 0 for both.

- [ ] **Step 3: Manual UAT (full-environment, per the saved memory rule)**

Per `feedback_uat_full_environment.md`:

1. Open the recurring management page in the TMA → confirm the rows render with category emoji, "You/Name spends", amount, frequency badge, and "Next: <date>".
2. Tap a row → modal opens with all 5 sections; Telegram secondaryButton labeled "Delete" appears in red.
3. Tap pencil → navigates to `/edit-recurring/<id>`. Read-only summary Cell + Schedule editor render. mainButton "Save" + secondaryButton "Delete" both appear.
4. Change frequency from Monthly → Weekly with a chosen weekday. Tap Save. Subagent verifies:
   - DB row updated via Supabase MCP (`SELECT frequency, interval, weekdays FROM "RecurringExpenseTemplate" WHERE id = '...'`)
   - AWS schedule's cron expression updated via `aws scheduler get-schedule --group-name recurring-expenses --name recurring-expense-<id>`
5. Open the edit page again → tap Delete → confirm popup → confirm. Subagent verifies:
   - DB row's `status = 'CANCELED'`
   - AWS schedule deleted (`aws scheduler get-schedule` returns ResourceNotFoundException)
   - List page no longer shows the row
6. Open the chat → tap a recurring expense in the transaction list → ExpenseDetailsModal opens with the new "Schedule" section showing Repeat + End Date.

---

## Self-review (filled in by plan author)

**Spec coverage:** All four surfaces in the spec map to tasks (Surface 1 → Tasks 3+4, Surface 2 → Task 5, modal wiring → Task 6, Surface 3 → Tasks 7+8+9, Surface 4 → Task 10). Routing changes implemented (Task 7 adds the new route; no search param needed per the dropped-deeplink decision). Error handling covered: Save fails → toast + keep dirty state (Task 8); cancel partial AWS failure → silent retry handled by backend already; not-found race → mutation `onError` toast (covered in Task 6 + 9 catch blocks). Testing strategy: Tasks 1-2 verified by re-running existing 27 unit tests; Tasks 2 + 5 add new smoke tests (3 + 4 cases); manual UAT covered in Final Verification step 3.

**Placeholder scan:** Reviewed all task code — `trpc.category.listForChat` is called out in Task 4 Step 1 as needing verification (the canonical hook name might differ — engineer must check first). Otherwise no `TBD`/`fill in later`/etc.

**Type consistency:** `RecurringTemplateForCell`, `RecurringTemplateForModal`, and the inline `RecurringTemplate` interface in the list page are all consistent with each other for the fields they share (`id`, `description`, `amount`, `currency`, `payerId`, `chatId`, `frequency`, `interval`, `weekdays`, `startDate`, `endDate`, `categoryId`). The `splitMode` and `participantIds` fields added to the list-page interface in Task 6 match what the modal expects in Task 5.
