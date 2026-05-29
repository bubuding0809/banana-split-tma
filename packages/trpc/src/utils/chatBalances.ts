import { Decimal } from "decimal.js";
import { toNumber, sumAmounts } from "./financial.js";

export interface PairwiseDebt {
  debtorId: number;
  creditorId: number;
  amount: number;
}

interface ShareRow {
  userId: bigint;
  amount: Decimal | null;
  expense: {
    payerId: bigint;
    currency: string;
  };
}

interface SettlementRow {
  senderId: bigint;
  receiverId: bigint;
  amount: Decimal;
  currency: string;
}

export interface TransferRow {
  sourceChatId: bigint;
  targetChatId: bigint;
  debtorId: bigint;
  creditorId: bigint;
  amount: Decimal;
}

/**
 * Aggregates per-user signed net balance for one currency.
 * Positive = user is owed; negative = user owes.
 *
 * Formula per user U:
 *   net(U) = sum(shares paid by U for others) - sum(U's shares on others' expenses)
 *          + sum(settlements U sent) - sum(settlements U received)
 *          ± native debt transfers touching this chat
 *
 * Equivalent to getBulkChatDebts.calculateNetShareBulk unrolled for every member.
 *
 * Native transfers move a debt between chats: in the source chat the debt is
 * removed (settlement-like), in the target chat it is added (expense-like).
 * `chatId` selects which side applies; omit it (and `transfers`) for callers
 * that don't model cross-group transfers.
 */
export function buildUserBalanceMap(
  memberIds: number[],
  shares: ShareRow[],
  settlements: SettlementRow[],
  transfers: TransferRow[] = [],
  chatId?: number
): Map<number, number> {
  const balance = new Map<number, Decimal>();
  for (const id of memberIds) balance.set(id, new Decimal(0));

  for (const share of shares) {
    if (share.amount === null) continue;
    const shareUserId = Number(share.userId);
    const payerId = Number(share.expense.payerId);
    if (shareUserId === payerId) continue; // payer's own share is not a debt
    // shareUserId owes the payer `amount`
    balance.set(
      payerId,
      (balance.get(payerId) ?? new Decimal(0)).plus(share.amount)
    );
    balance.set(
      shareUserId,
      (balance.get(shareUserId) ?? new Decimal(0)).minus(share.amount)
    );
  }

  for (const s of settlements) {
    const sender = Number(s.senderId);
    const receiver = Number(s.receiverId);
    // Sender pays receiver: sender's debt drops (balance up), receiver's credit drops (balance down)
    balance.set(sender, (balance.get(sender) ?? new Decimal(0)).plus(s.amount));
    balance.set(
      receiver,
      (balance.get(receiver) ?? new Decimal(0)).minus(s.amount)
    );
  }

  for (const t of transfers) {
    const debtor = Number(t.debtorId);
    const creditor = Number(t.creditorId);
    const isSource = Number(t.sourceChatId) === chatId;
    const isTarget = Number(t.targetChatId) === chatId;

    if (isSource) {
      // Source: debt is cleared (settlement-like)
      balance.set(
        debtor,
        (balance.get(debtor) ?? new Decimal(0)).plus(t.amount)
      );
      balance.set(
        creditor,
        (balance.get(creditor) ?? new Decimal(0)).minus(t.amount)
      );
    } else if (isTarget) {
      // Target: debt is added (expense-like)
      balance.set(
        debtor,
        (balance.get(debtor) ?? new Decimal(0)).minus(t.amount)
      );
      balance.set(
        creditor,
        (balance.get(creditor) ?? new Decimal(0)).plus(t.amount)
      );
    }
  }

  const out = new Map<number, number>();
  for (const [id, dec] of balance) out.set(id, toNumber(dec));
  return out;
}

/**
 * Pairwise net between every member pair for one currency.
 * Returns `{ debtorId, creditorId, amount }` only where `|net| > 0.01`.
 */
export function computeChatPairwiseBalances(
  memberIds: number[],
  shares: ShareRow[],
  settlements: SettlementRow[]
): PairwiseDebt[] {
  const out: PairwiseDebt[] = [];

  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = memberIds[i]!;
      const b = memberIds[j]!;
      const net = pairwiseNet(a, b, shares, settlements);
      if (Math.abs(net) <= 0.01) continue;
      if (net > 0) {
        out.push({ debtorId: b, creditorId: a, amount: net });
      } else {
        out.push({ debtorId: a, creditorId: b, amount: Math.abs(net) });
      }
    }
  }

  return out;
}

/**
 * Signed net between two users for one currency.
 * Positive = `b` owes `a`; negative = `a` owes `b`.
 *
 * Ported from getBulkChatDebts.calculateNetShareBulk — keep behavior identical.
 */
function pairwiseNet(
  a: number,
  b: number,
  shares: ShareRow[],
  settlements: SettlementRow[]
): number {
  const toReceive = shares
    .filter(
      (s) =>
        Number(s.expense.payerId) === a &&
        Number(s.userId) === b &&
        s.amount !== null
    )
    .map((s) => s.amount!);

  const toPay = shares
    .filter(
      (s) =>
        Number(s.expense.payerId) === b &&
        Number(s.userId) === a &&
        s.amount !== null
    )
    .map((s) => s.amount!);

  const settleAToB = settlements
    .filter((s) => Number(s.senderId) === a && Number(s.receiverId) === b)
    .map((s) => s.amount);

  const settleBToA = settlements
    .filter((s) => Number(s.senderId) === b && Number(s.receiverId) === a)
    .map((s) => s.amount);

  const net = sumAmounts(toReceive)
    .minus(sumAmounts(toPay))
    .plus(sumAmounts(settleAToB))
    .minus(sumAmounts(settleBToA));

  return toNumber(net);
}
