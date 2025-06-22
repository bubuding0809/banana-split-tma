import { type ReactFormExtendedApi } from "@tanstack/react-form";
import { type z } from "zod";

import { type expenseFormSchema } from "./AddExpenseForm.type";

interface SplitModeFormStepProps {
  form: ReactFormExtendedApi<z.infer<typeof expenseFormSchema>>;
}

const SplitModeFormStep = ({ form }: SplitModeFormStepProps) => {
  return <div>SplitModeFormStep</div>;
};

export default SplitModeFormStep;
