import type { TrpcClient } from "@bananasplitz/api-client";
import { invalidField, missingField } from "../errors.js";
import { MONTH_RE } from "../parse.js";

export async function listMyBalances(trpc: TrpcClient) {
  return trpc.expenseShare.getMyBalancesAcrossChats.query();
}

export async function listMySpending(
  trpc: TrpcClient,
  input: { month?: string }
) {
  if (!input.month) {
    missingField("--month is required");
  }
  const month = String(input.month);
  if (!MONTH_RE.test(month)) {
    invalidField("--month must be YYYY-MM (e.g. 2026-04)");
  }
  return trpc.expenseShare.getMySpendByMonth.query({ month });
}

export async function listCounterpartyBalances(
  trpc: TrpcClient,
  input: { baseCurrency?: string } = {}
) {
  return trpc.expenseShare.getMyCounterpartyBalances.query(
    input.baseCurrency ? { baseCurrency: input.baseCurrency } : {}
  );
}

export async function settleAllWith(
  trpc: TrpcClient,
  input: { counterpartyUserId: number }
) {
  return trpc.expenseShare.settleAllWithUser.mutate({
    counterpartyUserId: input.counterpartyUserId,
  });
}

export function parseCounterpartyUserId(
  raw: string | number | undefined
): number {
  if (raw === undefined || raw === "") {
    missingField("--user required");
  }
  const counterpartyUserId = Number(raw);
  if (!Number.isFinite(counterpartyUserId)) {
    invalidField("--user must be a numeric Telegram user id");
  }
  return counterpartyUserId;
}
