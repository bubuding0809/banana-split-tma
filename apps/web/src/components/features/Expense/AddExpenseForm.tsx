import { formOptions } from "@tanstack/react-form";
import { expenseFormSchema } from "./AddExpenseForm.type";

export const formOpts = formOptions({
  defaultValues: {
    amount: "",
    description: "",
  },
  validators: {
    onChange: expenseFormSchema,
  },
});
