import { resolveChatId, type TrpcClient } from "@bananasplitz/api-client";
import { invalidField, missingField } from "../errors.js";
import { CHAT_TYPES, type ChatType } from "../types.js";

export async function listChats(
  trpc: TrpcClient,
  input: { excludeTypes?: ChatType[] } = {}
) {
  return trpc.chat.getAllChats.query({ excludeTypes: input.excludeTypes });
}

export async function getChat(
  trpc: TrpcClient,
  input: { chatId?: string | number }
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  return trpc.chat.getChat.query({ chatId });
}

export async function getDebts(
  trpc: TrpcClient,
  input: { chatId?: string | number; currencies?: string[] }
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  return trpc.chat.getBulkChatDebts.query({
    chatId,
    currencies: input.currencies,
  });
}

export async function getSimplifiedDebts(
  trpc: TrpcClient,
  input: { chatId?: string | number; currency?: string }
) {
  if (!input.currency) {
    missingField("--currency is required");
  }
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  return trpc.chat.getSimplifiedDebts.query({
    chatId,
    currency: String(input.currency),
  });
}

export async function updateChatSettings(
  trpc: TrpcClient,
  input: {
    chatId?: string | number;
    debtSimplificationEnabled?: boolean;
    baseCurrency?: string;
    notifyOnExpense?: boolean;
    notifyOnExpenseUpdate?: boolean;
    notifyOnSettlement?: boolean;
  }
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());

  const updateData: {
    chatId: number;
    debtSimplificationEnabled?: boolean;
    baseCurrency?: string;
    notifyOnExpense?: boolean;
    notifyOnExpenseUpdate?: boolean;
    notifyOnSettlement?: boolean;
  } = { chatId };

  if (input.debtSimplificationEnabled !== undefined) {
    updateData.debtSimplificationEnabled = input.debtSimplificationEnabled;
  }
  if (input.baseCurrency !== undefined) {
    updateData.baseCurrency = input.baseCurrency;
  }
  if (input.notifyOnExpense !== undefined) {
    updateData.notifyOnExpense = input.notifyOnExpense;
  }
  if (input.notifyOnExpenseUpdate !== undefined) {
    updateData.notifyOnExpenseUpdate = input.notifyOnExpenseUpdate;
  }
  if (input.notifyOnSettlement !== undefined) {
    updateData.notifyOnSettlement = input.notifyOnSettlement;
  }

  return trpc.chat.updateChat.mutate(updateData);
}

export function parseExcludeTypes(
  raw: string | undefined
): ChatType[] | undefined {
  if (!raw) return undefined;
  const types = raw.split(",").map((s) => s.trim());
  for (const type of types) {
    if (!CHAT_TYPES.includes(type as ChatType)) {
      invalidField(`invalid chat type: ${type}`);
    }
  }
  return types as ChatType[];
}

export function parseCurrencies(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  return raw.split(",");
}

export function parseBooleanOption(
  raw: string | boolean | undefined
): boolean | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "boolean") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  invalidField(`expected true/false, got ${raw}`);
}
