import { withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";

const SplitModeFormStep = withForm({
  ...formOpts,
  props: {
    step: 2,
    isLastStep: true,
  },
  render: ({ form }) => {
    return (
      <div>
        <form.AppField
          name="amount"
          children={(field) => (
            <input onChange={(e) => field.handleChange(e.target.value)} />
          )}
        />
      </div>
    );
  },
});

export default SplitModeFormStep;
