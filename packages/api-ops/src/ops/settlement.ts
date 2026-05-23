import { resolveChatId, type TrpcClient } from "@bananasplitz/api-client";
import { invalidField, missingField } from "../errors.js";

export async function listSettlements(
  trpc: TrpcClient,
  input: { chatId?: string | number; currency?: string }
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  return trpc.settlement.getSettlementByChat.query({
    chatId,
    currency: input.currency,
  });
}

export async function createSettlement(
  trpc: TrpcClient,
  input: {
    chatId?: string | number;
    senderId: number;
    receiverId: number;
    amount: number;
    currency?: string;
    description?: string;
  }
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  const chat = await trpc.chat.getChat.query({ chatId });
  const members = chat.members ?? [];
  const creditor = members.find(
    (m: { id: number }) => m.id === input.receiverId
  );
  const debtor = members.find((m: { id: number }) => m.id === input.senderId);

  return trpc.settlement.createSettlement.mutate({
    chatId,
    senderId: input.senderId,
    receiverId: input.receiverId,
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    sendNotification: true,
    creditorName: creditor?.firstName ?? `User ${input.receiverId}`,
    creditorUsername: creditor?.username ?? undefined,
    debtorName: debtor?.firstName ?? `User ${input.senderId}`,
    threadId: chat.threadId ?? undefined,
  });
}

export async function deleteSettlement(
  trpc: TrpcClient,
  input: { settlementId: string }
) {
  return trpc.settlement.deleteSettlement.mutate({
    settlementId: input.settlementId,
  });
}

export async function settleAllDebts(
  trpc: TrpcClient,
  input: {
    chatId?: string | number;
    senderId: number;
    receiverId: number;
    balances: { currency: string; amount: number }[];
    creditorName?: string;
    debtorName?: string;
  }
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  const chat = await trpc.chat.getChat.query({ chatId });
  const members = chat.members ?? [];
  const creditor = members.find(
    (m: { id: number }) => m.id === input.receiverId
  );
  const debtor = members.find((m: { id: number }) => m.id === input.senderId);

  return trpc.settlement.settleAllDebts.mutate({
    chatId,
    senderId: input.senderId,
    receiverId: input.receiverId,
    balances: input.balances,
    creditorName:
      input.creditorName ?? creditor?.firstName ?? `User ${input.receiverId}`,
    creditorUsername: creditor?.username ?? undefined,
    debtorName:
      input.debtorName ?? debtor?.firstName ?? `User ${input.senderId}`,
    threadId: chat.threadId ?? undefined,
  });
}

export function validateCreateSettlementInput(input: {
  senderId?: string | number;
  receiverId?: string | number;
  amount?: string | number;
}): { senderId: number; receiverId: number; amount: number } {
  if (!input.senderId) missingField("--sender-id is required");
  if (!input.receiverId) missingField("--receiver-id is required");
  if (input.amount === undefined || input.amount === "") {
    missingField("--amount is required");
  }
  return {
    senderId: Number(input.senderId),
    receiverId: Number(input.receiverId),
    amount: Number(input.amount),
  };
}

export function validateSettleAllDebtsInput(input: {
  senderId?: string | number;
  receiverId?: string | number;
  balances?: string;
}): {
  senderId: number;
  receiverId: number;
  balances: { currency: string; amount: number }[];
} {
  if (!input.senderId) missingField("--sender-id is required");
  if (!input.receiverId) missingField("--receiver-id is required");
  if (!input.balances) missingField("--balances is required");

  let parsedBalances: { currency: string; amount: number }[];
  try {
    parsedBalances = JSON.parse(String(input.balances));
    if (!Array.isArray(parsedBalances)) throw new Error("not array");
  } catch {
    invalidField("--balances must be valid JSON array");
  }

  return {
    senderId: Number(input.senderId),
    receiverId: Number(input.receiverId),
    balances: parsedBalances,
  };
}

export function validateSettlementId(settlementId?: string): string {
  if (!settlementId) missingField("--settlement-id is required");
  return settlementId;
}
