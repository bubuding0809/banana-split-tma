import { Decimal } from "decimal.js";

export interface TransferLeg {
  amount: Decimal;
  currency: string;
}

/**
 * A transfer row carries two legs. Which one applies depends entirely on
 * which chat is asking: the source chat sees the debt leave, the target
 * chat sees it arrive, and the two can be denominated differently once
 * either group has converted its currency.
 */
export interface TransferLegSource {
  sourceChatId: bigint;
  targetChatId: bigint;
  sourceAmount: Decimal;
  sourceCurrency: string;
  targetAmount: Decimal;
  targetCurrency: string;
}

export function legFor(
  transfer: TransferLegSource,
  chatId: number
): TransferLeg | null {
  if (Number(transfer.sourceChatId) === chatId) {
    return { amount: transfer.sourceAmount, currency: transfer.sourceCurrency };
  }
  if (Number(transfer.targetChatId) === chatId) {
    return { amount: transfer.targetAmount, currency: transfer.targetCurrency };
  }
  return null;
}
