import { resolveChatId, type TrpcClient } from "@bananasplitz/api-client";
import { missingField } from "../errors.js";

export async function sendGroupReminder(
  trpc: TrpcClient,
  input: { chatId?: string | number } = {}
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  return trpc.telegram.sendGroupReminderMessage.mutate({
    chatId: chatId.toString(),
  });
}

export async function sendDebtReminder(
  trpc: TrpcClient,
  input: {
    chatId?: string | number;
    debtorUserId: number;
    debtorName: string;
    creditorName: string;
    amount: number;
    debtorUsername?: string;
    currency?: string;
    threadId?: number;
  }
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());

  const payload: {
    chatId: number;
    debtorUserId: number;
    debtorName: string;
    creditorName: string;
    amount: number;
    debtorUsername?: string;
    currency?: string;
    threadId?: number;
  } = {
    chatId,
    debtorUserId: input.debtorUserId,
    debtorName: input.debtorName,
    creditorName: input.creditorName,
    amount: input.amount,
  };

  if (input.debtorUsername) payload.debtorUsername = input.debtorUsername;
  if (input.currency) payload.currency = input.currency;
  if (input.threadId !== undefined) payload.threadId = input.threadId;

  return trpc.telegram.sendDebtReminderMessage.mutate(payload);
}

export function validateSendDebtReminderInput(input: {
  debtorUserId?: string | number;
  debtorName?: string;
  creditorName?: string;
  amount?: string | number;
}): {
  debtorUserId: number;
  debtorName: string;
  creditorName: string;
  amount: number;
} {
  if (!input.debtorUserId) {
    missingField("Missing required option: --debtor-user-id");
  }
  if (!input.debtorName) {
    missingField("Missing required option: --debtor-name");
  }
  if (!input.creditorName) {
    missingField("Missing required option: --creditor-name");
  }
  if (input.amount === undefined || input.amount === "") {
    missingField("Missing required option: --amount");
  }

  return {
    debtorUserId: Number(input.debtorUserId),
    debtorName: String(input.debtorName),
    creditorName: String(input.creditorName),
    amount: parseFloat(String(input.amount)),
  };
}
