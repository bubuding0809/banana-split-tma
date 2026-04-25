import { z } from "zod";
import { format } from "date-fns";
import { nextOccurrenceAfter, presetToTemplate } from "./recurrencePresets";

const SplitMode = z.enum(["EQUAL", "PERCENTAGE", "EXACT", "SHARES"]);

const Weekday = z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]);

// Form-only — UI representation. Backend stores the canonical (frequency,interval,weekdays).
// `superRefine` wrapping the discriminated union (rather than the active option)
// because zod's `discriminatedUnion` only accepts plain ZodObject options, not
// ZodEffects produced by `.superRefine()` on a child.
const RecurrenceForm = z
  .discriminatedUnion("preset", [
    z.object({ preset: z.literal("NONE") }),
    z.object({
      preset: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"]),
      customFrequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
      customInterval: z.number().int().positive(),
      weekdays: z.array(Weekday),
      endDate: z.string().optional(), // ISO YYYY-MM-DD
    }),
  ])
  .superRefine((val, ctx) => {
    if (val.preset === "NONE") return;
    const isWeekly =
      val.preset === "WEEKLY" ||
      (val.preset === "CUSTOM" && val.customFrequency === "WEEKLY");
    if (isWeekly && val.weekdays.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "Pick at least one day",
      });
    }
  });

// Base ZodObject — kept separate from the .superRefine() wrapped version
// below so consumers that need .shape access (e.g. AmountFormStep reading
// description maxLength) can still reach it. ZodEffects has no .shape.
export const expenseFormBaseSchema = z.object({
  amount: z.string().min(1, "An amount is required"),
  currency: z.string().min(3).max(3, "Currency code must be 3 characters"),
  description: z
    .string()
    .min(1, "A Description is required")
    .max(60, "Description is too long"),
  date: z
    .string()
    .min(1, "A date is required")
    .refine(
      (dateStr) => {
        const selectedDate = new Date(dateStr + "T00:00:00");
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        return selectedDate <= today;
      },
      { message: "Date cannot be in the future" }
    ),
  payee: z.string().min(1, "A payee is required"),
  splitMode: SplitMode,
  participants: z.array(z.string()).min(1, "At least one participant required"),
  categoryId: z.string().nullable(),
  // UI-only flags persisted in form state (not submitted). Plain booleans
  // rather than `.default(false)` — defaults make the schema's input type
  // optional, which breaks tanstack-form's type alignment between the form
  // values and its StandardSchema validator.
  autoPicked: z.boolean(),
  userTouchedCategory: z.boolean(),
  suggestPending: z.boolean(),
  customSplits: z.array(
    z.object({
      userId: z.string(),
      amount: z
        .string()
        .refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
          message: "Amount must be a positive number",
        }),
    })
  ),
  recurrence: RecurrenceForm,
});

export const expenseFormSchema = expenseFormBaseSchema
  // Cross-field check: when a recurrence is configured AND the user picked
  // an end date, the end date must allow at least one future occurrence
  // beyond the transaction date. Otherwise the recurrence is meaningless
  // (or worse — the schedule has no valid fires). Path points at the
  // recurrence field so FieldInfo surfaces the error inline.
  .superRefine((val, ctx) => {
    if (val.recurrence.preset === "NONE") return;
    if (!val.recurrence.endDate) return;
    if (!val.date) return;
    const start = new Date(val.date + "T00:00:00");
    // T23:59:59 — the user's picked end-date includes that day's fire
    // (AWS Scheduler treats EndDate as an exclusive upper bound).
    const end = new Date(val.recurrence.endDate + "T23:59:59");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    const template = presetToTemplate({
      preset: val.recurrence.preset,
      customFrequency: val.recurrence.customFrequency,
      customInterval: val.recurrence.customInterval,
      weekdays: val.recurrence.weekdays,
    });
    const next = nextOccurrenceAfter(start, template);
    if (end < next) {
      // Path is ["recurrence"] (not the nested ["recurrence","endDate"]) so
      // the parent field's <FieldInfo> picks it up — there's no AppField
      // wrapper for the nested endDate slot.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recurrence"],
        message: `End date must be on or after ${format(next, "d MMM yyyy")} (the next occurrence)`,
      });
    }
  });

export type SplitModeType = z.infer<typeof SplitMode>;
