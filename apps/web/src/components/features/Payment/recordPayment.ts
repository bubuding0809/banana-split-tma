export type PaymentDirection = "paid" | "received";

export type RecordPaymentValues = {
  amount: string;
  currency: string;
  description: string;
  date: string;
  direction: PaymentDirection;
  counterpartyId: string;
};

export type RecordPaymentPrefill = {
  direction?: PaymentDirection;
  counterpartyId?: number;
  amount?: number;
  currency?: string;
};

/** Mirrors the backend minimum (FINANCIAL_THRESHOLDS.DISPLAY = 0.01). */
export const isValidAmount = (amount: string): boolean => {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) return false;
  return Number(amount) >= 0.01;
};

/** Recorded payments need a note so they're recognisable later. */
export const isValidDescription = (description: string): boolean =>
  description.trim().length > 0;

export const toParties = (
  direction: PaymentDirection,
  userId: number,
  counterpartyId: number
) =>
  direction === "paid"
    ? { senderId: userId, receiverId: counterpartyId }
    : { senderId: counterpartyId, receiverId: userId };

export const toNotificationNames = (
  direction: PaymentDirection,
  me: { firstName: string },
  counterparty: { firstName: string; username?: string | null }
) =>
  direction === "paid"
    ? {
        creditorName: counterparty.firstName,
        creditorUsername: counterparty.username ?? undefined,
        debtorName: me.firstName,
      }
    : {
        creditorName: me.firstName,
        creditorUsername: undefined,
        debtorName: counterparty.firstName,
      };

export const resolveInitialValues = ({
  prefill,
  draft,
  baseCurrency,
  today,
}: {
  prefill: RecordPaymentPrefill;
  draft: RecordPaymentValues | null;
  baseCurrency: string;
  today: string;
}): RecordPaymentValues => {
  const hasPrefill =
    prefill.counterpartyId !== undefined || prefill.amount !== undefined;
  if (hasPrefill) {
    return {
      amount: prefill.amount !== undefined ? prefill.amount.toFixed(2) : "",
      currency: prefill.currency ?? baseCurrency,
      description: "",
      date: today,
      direction: prefill.direction ?? "paid",
      counterpartyId:
        prefill.counterpartyId !== undefined
          ? String(prefill.counterpartyId)
          : "",
    };
  }
  if (draft) return draft;
  return {
    amount: "",
    currency: baseCurrency,
    description: "",
    date: today,
    direction: "paid",
    counterpartyId: "",
  };
};

/**
 * In a two-person group the counterparty is unambiguous, so it can be
 * pre-selected. With more members the user must pick, to avoid recording
 * money against the wrong person.
 */
export const soleCounterpartyId = (
  members: { id: number | bigint }[] | undefined,
  userId: number
): string | null => {
  const others = (members ?? []).filter((m) => Number(m.id) !== userId);
  return others.length === 1 ? String(others[0]!.id) : null;
};
