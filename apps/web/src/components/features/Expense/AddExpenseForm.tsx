import { formOptions } from "@tanstack/react-form";
import { formatDateKey } from "@utils/date";
import { expenseFormSchema } from "./AddExpenseForm.type";

import type { SplitModeType } from "./AddExpenseForm.type";

import { z } from "zod";

export const formOpts = formOptions({
  defaultValues: {
    amount: "",
    description: "",
    date: formatDateKey(new Date()),
    payee: "",
    currency: "SGD",
    splitMode: "EQUAL" as SplitModeType,
    participants: [] as string[],
    customSplits: [] as { userId: string; amount: string }[],
    categoryName: null,
    categoryIcon: null,
  } as z.infer<typeof expenseFormSchema>,
  validators: {
    onChange: expenseFormSchema,
  },
});
