import type { BananaTrpcClient } from "../trpc";

export type ExpenseSplitMode = "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";

export type ExpenseUpdatePatch = {
  expenseId: string;
  payerId?: number;
  creatorId?: number;
  description?: string;
  amount?: number;
  currency?: string;
  splitMode?: ExpenseSplitMode;
  participantIds?: number[];
  customSplits?: { userId: number; amount: number }[];
  date?: Date;
  categoryId?: string | null;
};

/** Shared partial expense update (ported from apps/cli/src/commands/expense.ts). */
export async function applyExpensePartialUpdate(
  patch: ExpenseUpdatePatch,
  trpc: BananaTrpcClient,
  chatId: number,
  opts: { sendNotification?: boolean } = {},
): Promise<unknown> {
  const existing = await trpc.expense.getExpenseDetails.query({
    expenseId: patch.expenseId,
  });

  if (existing == null || existing.splitMode == null) {
    throw new Error(`expense ${patch.expenseId} not found`);
  }

  const splitMode = (patch.splitMode ?? existing.splitMode) as ExpenseSplitMode;
  const participantIds = patch.participantIds ?? existing.participants.map((p: { id: number }) => p.id);

  let customSplits: { userId: number; amount: number }[] | undefined;
  if (patch.customSplits) {
    customSplits = patch.customSplits;
  } else if (splitMode !== "EQUAL") {
    customSplits = existing.shares.map((s: { userId: number; amount: number }) => ({
      userId: s.userId,
      amount: s.amount,
    }));
  }

  const categoryId = patch.categoryId !== undefined ? patch.categoryId : existing.categoryId;

  return trpc.expense.updateExpense.mutate({
    expenseId: patch.expenseId,
    chatId,
    creatorId: patch.creatorId ?? Number(existing.creatorId),
    payerId: patch.payerId ?? Number(existing.payerId),
    description: patch.description ?? String(existing.description),
    amount: patch.amount ?? Number(existing.amount),
    date: patch.date ?? existing.date,
    currency: patch.currency ?? existing.currency,
    splitMode,
    participantIds,
    customSplits,
    categoryId,
    sendNotification: opts.sendNotification ?? true,
  });
}
