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
    suggestPending: false,
    customSplits: [] as { userId: string; amount: string }[],
    recurrence: { preset: "NONE" } as
      | { preset: "NONE" }
      | {
          preset:
            | "DAILY"
            | "WEEKLY"
            | "BIWEEKLY"
            | "MONTHLY"
            | "EVERY_3_MONTHS"
            | "EVERY_6_MONTHS"
            | "YEARLY"
            | "CUSTOM";
          customFrequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
          customInterval: number;
          weekdays: ("SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT")[];
          endDate?: string;
        },
  },
  validators: {
    onChange: expenseFormSchema,
  },
});
