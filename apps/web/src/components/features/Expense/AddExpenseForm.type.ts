import { z } from "zod";
import { FINANCIAL_THRESHOLDS } from "@dko/trpc";

const SplitMode = z.enum(["EQUAL", "PERCENTAGE", "EXACT", "SHARES"]);

export const expenseFormSchema = z.object({
  amount: z
    .string()
    .min(1, "An amount is required")
    .max(
      FINANCIAL_THRESHOLDS.MAX_EXPENSE,
      `Amount cannot exceed ${FINANCIAL_THRESHOLDS.MAX_EXPENSE.toLocaleString()}`
    ),
  currency: z.string().min(3).max(3, "Currency code must be 3 characters"),
  description: z
    .string()
    .min(1, "A Description is required")
    .max(60, "Description is too long"),
  payee: z.string().min(1, "A payee is required"),
  splitMode: SplitMode,
  participants: z.array(z.string()).min(1, "At least one participant required"),
  customSplits: z.array(
    z.object({
      userId: z.string(),
      amount: z
        .string()
        .min(1, "An amount is required")
        .max(
          FINANCIAL_THRESHOLDS.MAX_EXPENSE,
          `Amount cannot exceed ${FINANCIAL_THRESHOLDS.MAX_EXPENSE.toLocaleString()}`
        ),
    })
  ),
});

export type SplitModeType = z.infer<typeof SplitMode>;
