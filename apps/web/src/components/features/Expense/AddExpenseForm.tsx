import { formOptions } from "@tanstack/react-form";
import { formatDateKey } from "@utils/date";
import { expenseFormSchema } from "./AddExpenseForm.type";

import type { SplitModeType } from "./AddExpenseForm.type";

export const formOpts = formOptions({
  defaultValues: {
    amount: "",
    description: "",
    date: formatDateKey(new Date()),
    payee: "",
    currency: "SGD",
    splitMode: "EQUAL" as SplitModeType,
    participants: [] as string[],
    categoryId: null as string | null,
    customSplits: [] as { userId: string; amount: string }[],
  },
  validators: {
    onChange: expenseFormSchema,
  },
});
