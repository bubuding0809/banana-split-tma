import { formOptions } from "@tanstack/react-form";
import { expenseFormSchema } from "./AddExpenseForm.type";

import type { SplitModeType } from "./AddExpenseForm.type";

export const formOpts = formOptions({
  defaultValues: {
    amount: "",
    description: "",
    payee: "",
    currency: "SGD",
    splitMode: "EQUAL" as SplitModeType,
    participants: [] as string[],
    customSplits: [] as { userId: string; amount: string }[],
    exactSplitStage: "selection" as "selection" | "inputs",
  },
  validators: {
    onChange: expenseFormSchema,
  },
});
