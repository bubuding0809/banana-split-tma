import { withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";

const PayeeFormStep = withForm({
  ...formOpts,
  props: {
    step: 1,
    isLastStep: false,
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
export default PayeeFormStep;
