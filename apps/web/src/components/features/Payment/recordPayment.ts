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

type BalanceRow = {
  id: number;
  balances: { currency: string; amount: number }[];
};

export type BalanceWith = {
  kind: "you_owe" | "owes_you" | "settled";
  amount: number;
};

/** Mirrors the backend minimum (FINANCIAL_THRESHOLDS.DISPLAY = 0.01). */
export const isValidAmount = (amount: string): boolean => {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) return false;
  return Number(amount) >= 0.01;
};

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

const amountIn = (
  rows: BalanceRow[] | undefined,
  memberId: number,
  currency: string
) =>
  rows
    ?.find((r) => r.id === memberId)
    ?.balances.find((b) => b.currency === currency)?.amount;

export const balanceWith = (
  memberId: number,
  currency: string,
  debtors: BalanceRow[] | undefined,
  creditors: BalanceRow[] | undefined
): BalanceWith => {
  const owesMe = amountIn(debtors, memberId, currency);
  if (owesMe !== undefined && owesMe !== 0) {
    return { kind: "owes_you", amount: Math.abs(owesMe) };
  }
  const iOwe = amountIn(creditors, memberId, currency);
  if (iOwe !== undefined && iOwe !== 0) {
    return { kind: "you_owe", amount: Math.abs(iOwe) };
  }
  return { kind: "settled", amount: 0 };
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
