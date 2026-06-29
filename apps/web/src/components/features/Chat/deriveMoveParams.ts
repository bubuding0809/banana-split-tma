export interface MoveParams {
  debtorId: number;
  creditorId: number;
  amount: number;
  currency: string;
  sourceChatId: number;
  sourceChatTitle: string;
  callerOwes: boolean;
}

// Below this, a balance is treated as settled and not transferable. Mirrors
// the backend FINANCIAL_THRESHOLDS.DISPLAY (0.01) used by the balance views.
const DISPLAY_THRESHOLD = 0.01;

export function deriveMoveParams(
  group: {
    chatId: number;
    chatTitle: string;
    currency: string;
    nativeNet: number;
  },
  callerId: number,
  counterpartyId: number
): MoveParams | null {
  const net = group.nativeNet;
  if (Math.abs(net) <= DISPLAY_THRESHOLD) return null;

  // net < 0 → caller owes counterparty; net > 0 → counterparty owes caller.
  const callerOwes = net < 0;
  return {
    debtorId: callerOwes ? callerId : counterpartyId,
    creditorId: callerOwes ? counterpartyId : callerId,
    amount: Math.abs(net),
    currency: group.currency,
    sourceChatId: group.chatId,
    sourceChatTitle: group.chatTitle,
    callerOwes,
  };
}
