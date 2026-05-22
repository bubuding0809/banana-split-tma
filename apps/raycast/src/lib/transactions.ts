/** Shared transaction types — a unified view over expenses and settlements. */

/** A resolved expense category (base or custom). */
export type Category = { id: string; emoji: string; title: string };

export type ExpenseTxn = {
  kind: "expense";
  id: string;
  date: Date;
  description: string;
  amount: number;
  currency: string;
  payerId: number;
  creatorId: number;
  splitMode: string;
  recurring: boolean;
  shares: { userId: number; amount: number }[];
  category: Category | null;
  /** The authenticated user's own share, or null if unknown / not a participant. */
  myShare: number | null;
};

export type SettlementTxn = {
  kind: "settlement";
  id: string;
  date: Date;
  description: string | null;
  amount: number;
  currency: string;
  senderId: number;
  receiverId: number;
};

export type Txn = ExpenseTxn | SettlementTxn;

function monthLabel(date: Date): string {
  return date.toLocaleString(undefined, { month: "long", year: "numeric" });
}

/** Bucket date-desc-sorted transactions into contiguous month groups. */
export function groupByMonth(txns: Txn[]): { month: string; txns: Txn[] }[] {
  const buckets: { month: string; txns: Txn[] }[] = [];
  for (const txn of txns) {
    const month = monthLabel(txn.date);
    const current = buckets[buckets.length - 1];
    if (current && current.month === month) current.txns.push(txn);
    else buckets.push({ month, txns: [txn] });
  }
  return buckets;
}
