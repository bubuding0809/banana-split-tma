import { z } from "zod";

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
      preset: z.enum([
        "DAILY",
        "WEEKLY",
        "BIWEEKLY",
        "MONTHLY",
        "EVERY_3_MONTHS",
        "EVERY_6_MONTHS",
        "YEARLY",
        "CUSTOM",
      ]),
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
      val.preset === "BIWEEKLY" ||
      (val.preset === "CUSTOM" && val.customFrequency === "WEEKLY");
    if (isWeekly && val.weekdays.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "Pick at least one day",
      });
    }
  });

export const expenseFormSchema = z.object({
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

export type SplitModeType = z.infer<typeof SplitMode>;
