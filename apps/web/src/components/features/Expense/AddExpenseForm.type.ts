import { z } from "zod";

export const expenseFormSchema = z.object({
  amount: z.string().min(1, "An amount is required"),
  description: z
    .string()
    .min(1, "A Description is required")
    .max(60, "Description is too long"),
});
