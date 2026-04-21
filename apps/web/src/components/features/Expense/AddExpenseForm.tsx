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
    // UI-only flags — persist across step navigation so CategoryFormStep can
    // restore its badge state on remount. Never sent to the API; submit handlers
    // cherry-pick fields by name.
    autoPicked: false,
    userTouchedCategory: false,
    customSplits: [] as { userId: string; amount: string }[],
  },
  validators: {
    onChange: expenseFormSchema,
  },
});
