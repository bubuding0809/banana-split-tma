import { z } from "zod";

const SplitMode = z.enum(["EQUAL", "PERCENTAGE", "EXACT", "SHARES"]);

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
  categoryName: z.string().nullable().optional(),
  categoryIcon: z.string().nullable().optional(),
});

export type SplitModeType = z.infer<typeof SplitMode>;
