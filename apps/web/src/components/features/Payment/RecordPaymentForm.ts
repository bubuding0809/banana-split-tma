import { formOptions } from "@tanstack/react-form";
import { formatDateKey } from "@utils/date";
import type { RecordPaymentValues } from "./recordPayment";

export const paymentFormOpts = formOptions({
  defaultValues: {
    amount: "",
    currency: "SGD",
    description: "",
    date: formatDateKey(new Date()),
    direction: "paid",
    counterpartyId: "",
  } as RecordPaymentValues,
});

export const PAYMENT_DESCRIPTION_MAX = 60;
