import { resolveChatId, type TrpcClient } from "@bananasplitz/api-client";
import { BASE_CATEGORIES } from "@repo/categories";
import {
  applyExpensePartialUpdate,
  type ExpenseSplitMode,
  type ExpenseUpdatePatch,
} from "../helpers/expense-update.js";
import { invalidField, missingField } from "../errors.js";

export type { ExpenseSplitMode, ExpenseUpdatePatch };
export { applyExpensePartialUpdate };

type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type Weekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export type ExpenseRow = {
  payerId: number;
  creatorId?: number;
  description: string;
  amount: number;
  currency?: string;
  splitMode: ExpenseSplitMode;
  participantIds: number[];
  customSplits?: { userId: number; amount: number }[];
  date?: string;
  categoryId?: string | null;
};

export type BulkUpdateRow = {
  expenseId: string;
  payerId?: number;
  creatorId?: number;
  description?: string;
  amount?: number;
  currency?: string;
  splitMode?: ExpenseSplitMode;
  participantIds?: number[];
  customSplits?: { userId: number; amount: number }[];
  date?: string;
  category?: string | null;
};

export async function listExpenses(
  trpc: TrpcClient,
  input: { chatId?: string | number; currency?: string; category?: string }
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());

  const categoryMap = new Map<string, { emoji: string; title: string }>();
  for (const b of BASE_CATEGORIES) {
    categoryMap.set(b.id, { emoji: b.emoji, title: b.title });
  }
  try {
    const result = await trpc.category.listByChat.query({ chatId });
    for (const c of result.items.filter((item) => item.kind === "custom")) {
      categoryMap.set(c.id, { emoji: c.emoji, title: c.title });
    }
  } catch {
    // Non-fatal: category labels are best-effort
  }

  let expenses = await trpc.expense.getExpenseByChat.query({
    chatId,
    currency: input.currency,
  });

  if (input.category) {
    const target = String(input.category);
    expenses = expenses.filter(
      (e: { categoryId?: string | null }) => (e.categoryId ?? "none") === target
    );
  }

  return expenses.map(
    (e: { categoryId?: string | null; [key: string]: unknown }) => {
      const cat = e.categoryId ? categoryMap.get(e.categoryId) : null;
      const categoryLabel = cat ? `${cat.emoji} ${cat.title}` : null;
      return { ...e, categoryLabel };
    }
  );
}

export async function getExpense(
  trpc: TrpcClient,
  input: { expenseId: string }
) {
  return trpc.expense.getExpenseDetails.query({
    expenseId: input.expenseId,
  });
}

export function validateExpenseId(expenseId?: string): string {
  if (!expenseId) missingField("--expense-id is required");
  return expenseId;
}

export type CreateExpenseInput = {
  chatId?: string | number;
  payerId: string | number;
  creatorId?: string | number;
  description: string;
  amount: string | number;
  currency?: string;
  splitMode: string;
  participantIds: string;
  customSplits?: string | { userId: number; amount: number }[];
  date?: string | Date;
  category?: string;
  recurrenceFrequency?: string;
  recurrenceInterval?: string | number;
  recurrenceWeekdays?: string;
  recurrenceEndDate?: string;
  recurrenceTimezone?: string;
};

export function parseCreateExpenseInput(input: CreateExpenseInput): {
  chatId?: string | number;
  creatorId: number;
  payerId: number;
  description: string;
  amount: number;
  currency?: string;
  date?: Date;
  splitMode: ExpenseSplitMode;
  participantIds: number[];
  customSplits?: { userId: number; amount: number }[];
  categoryId?: string;
  recurrenceParams?: {
    frequency: RecurrenceFrequency;
    interval: number;
    weekdays: Weekday[];
    endDate?: Date;
    timezone: string;
  };
} {
  if (!input.payerId) missingField("--payer-id is required");
  if (!input.description) missingField("--description is required");
  if (input.amount === undefined || input.amount === "") {
    missingField("--amount is required");
  }
  if (!input.splitMode) missingField("--split-mode is required");
  if (!input.participantIds) missingField("--participant-ids is required");

  const payerId = Number(input.payerId);
  if (Number.isNaN(payerId)) invalidField("--payer-id must be a valid number");

  const amount = Number(input.amount);
  if (Number.isNaN(amount) || amount <= 0) {
    invalidField("--amount must be a positive number");
  }

  const creatorId = input.creatorId ? Number(input.creatorId) : payerId;
  if (Number.isNaN(creatorId)) {
    invalidField("--creator-id must be a valid number");
  }

  const participantIds = String(input.participantIds).split(",").map(Number);
  if (participantIds.some(Number.isNaN)) {
    invalidField("--participant-ids must be comma-separated numbers");
  }

  let customSplits: { userId: number; amount: number }[] | undefined;
  if (input.customSplits) {
    if (typeof input.customSplits === "string") {
      try {
        customSplits = JSON.parse(input.customSplits) as {
          userId: number;
          amount: number;
        }[];
      } catch {
        invalidField("--custom-splits must be valid JSON array");
      }
    } else {
      customSplits = input.customSplits;
    }
  }

  let date: Date | undefined;
  if (input.date) {
    date =
      input.date instanceof Date ? input.date : new Date(String(input.date));
    if (Number.isNaN(date.getTime())) {
      invalidField("--date must be a valid ISO 8601 date string");
    }
  }

  const frequency = input.recurrenceFrequency
    ? String(input.recurrenceFrequency).toUpperCase()
    : undefined;
  let recurrenceParams:
    | {
        frequency: RecurrenceFrequency;
        interval: number;
        weekdays: Weekday[];
        endDate?: Date;
        timezone: string;
      }
    | undefined;

  if (
    !frequency &&
    (input.recurrenceInterval ||
      input.recurrenceWeekdays ||
      input.recurrenceEndDate ||
      input.recurrenceTimezone)
  ) {
    invalidField("Recurrence options require --recurrence-frequency");
  }

  if (frequency) {
    const timezone =
      input.recurrenceTimezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(frequency)) {
      invalidField(
        "--recurrence-frequency must be DAILY, WEEKLY, MONTHLY, or YEARLY"
      );
    }

    const interval = input.recurrenceInterval
      ? Number(input.recurrenceInterval)
      : 1;
    if (
      Number.isNaN(interval) ||
      interval <= 0 ||
      !Number.isInteger(interval)
    ) {
      invalidField("--recurrence-interval must be a positive integer");
    }

    let weekdays: string[] | undefined;
    if (input.recurrenceWeekdays) {
      weekdays = String(input.recurrenceWeekdays)
        .split(",")
        .map((s) => s.trim().toUpperCase());
      const validWeekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      if (weekdays.some((w) => !validWeekdays.includes(w))) {
        invalidField(
          "--recurrence-weekdays must contain valid short days (SUN,MON,TUE...)"
        );
      }
    } else if (frequency === "WEEKLY") {
      const baseDate = date || new Date();
      const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      weekdays = [DAY_NAMES[baseDate.getDay()]!];
    }

    let endDate: Date | undefined;
    if (input.recurrenceEndDate) {
      endDate = new Date(String(input.recurrenceEndDate));
      if (Number.isNaN(endDate.getTime())) {
        invalidField(
          "--recurrence-end-date must be a valid ISO 8601 date string"
        );
      }
      const baseDate = date || new Date();
      if (endDate < baseDate) {
        invalidField("--recurrence-end-date cannot be before the expense date");
      }
    }

    recurrenceParams = {
      frequency: frequency as RecurrenceFrequency,
      interval,
      weekdays: (weekdays ?? []) as Weekday[],
      endDate,
      timezone,
    };
  }

  return {
    chatId: input.chatId,
    creatorId,
    payerId,
    description: String(input.description),
    amount,
    currency: input.currency,
    date,
    splitMode: String(input.splitMode) as ExpenseSplitMode,
    participantIds,
    customSplits,
    categoryId: input.category,
    recurrenceParams,
  };
}

export async function createExpense(
  trpc: TrpcClient,
  input: CreateExpenseInput
) {
  const parsed = parseCreateExpenseInput(input);
  const chatId = await resolveChatId(trpc, parsed.chatId?.toString());

  const payload = {
    chatId,
    creatorId: parsed.creatorId,
    payerId: parsed.payerId,
    description: parsed.description,
    amount: parsed.amount,
    currency: parsed.currency,
    date: parsed.date,
    splitMode: parsed.splitMode,
    participantIds: parsed.participantIds,
    customSplits: parsed.customSplits,
    categoryId: parsed.categoryId,
    sendNotification: true,
  };

  if (parsed.recurrenceParams) {
    return trpc.expense.createExpenseWithRecurrence.mutate({
      expense: payload,
      recurrence: parsed.recurrenceParams,
    });
  }

  return trpc.expense.createExpense.mutate(payload);
}

export async function updateExpense(
  trpc: TrpcClient,
  input: {
    patch: ExpenseUpdatePatch;
    chatId?: string | number;
    sendNotification?: boolean;
  }
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  return applyExpensePartialUpdate(input.patch, trpc, chatId, {
    sendNotification: input.sendNotification,
  });
}

export function parseUpdateExpensePatch(input: {
  expenseId?: string;
  payerId?: string | number;
  creatorId?: string | number;
  description?: string;
  amount?: string | number;
  currency?: string;
  splitMode?: string;
  participantIds?: string;
  customSplits?: string;
  date?: string;
  category?: string;
}): ExpenseUpdatePatch {
  if (!input.expenseId) missingField("--expense-id is required");

  const patch: ExpenseUpdatePatch = { expenseId: String(input.expenseId) };

  if (input.payerId) {
    const payerId = Number(input.payerId);
    if (Number.isNaN(payerId))
      throw new Error("--payer-id must be a valid number");
    patch.payerId = payerId;
  }

  if (input.amount) {
    const amount = Number(input.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error("--amount must be a positive number");
    }
    patch.amount = amount;
  }

  if (input.creatorId) {
    const creatorId = Number(input.creatorId);
    if (Number.isNaN(creatorId)) {
      throw new Error("--creator-id must be a valid number");
    }
    patch.creatorId = creatorId;
  }

  if (input.description) patch.description = String(input.description);
  if (input.currency) patch.currency = String(input.currency);

  if (input.splitMode) {
    patch.splitMode = String(input.splitMode) as ExpenseSplitMode;
  }

  if (input.participantIds) {
    const participantIds = String(input.participantIds).split(",").map(Number);
    if (participantIds.some(Number.isNaN)) {
      throw new Error("--participant-ids must be comma-separated numbers");
    }
    patch.participantIds = participantIds;
  }

  if (input.customSplits) {
    try {
      patch.customSplits = JSON.parse(String(input.customSplits)) as {
        userId: number;
        amount: number;
      }[];
    } catch {
      throw new Error("--custom-splits must be valid JSON array");
    }
  }

  if (input.date) {
    const date = new Date(String(input.date));
    if (Number.isNaN(date.getTime())) {
      throw new Error("--date must be a valid ISO 8601 date string");
    }
    patch.date = date;
  }

  if (input.category !== undefined) {
    const raw = String(input.category);
    patch.categoryId = raw === "none" ? null : raw;
  }

  return patch;
}

export async function getNetShare(
  trpc: TrpcClient,
  input: {
    mainUserId?: string | number;
    targetUserId?: string | number;
    chatId?: string | number;
    currency?: string;
  }
) {
  if (!input.mainUserId) missingField("--main-user-id is required");
  if (!input.targetUserId) missingField("--target-user-id is required");
  if (!input.currency) missingField("--currency is required");

  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  return trpc.expenseShare.getNetShare.query({
    mainUserId: Number(input.mainUserId),
    targetUserId: Number(input.targetUserId),
    chatId,
    currency: String(input.currency),
  });
}

export async function getTotals(
  trpc: TrpcClient,
  input: { userId?: string | number; chatId?: string | number }
) {
  if (!input.userId) missingField("--user-id is required");

  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  const userId = Number(input.userId);
  const [borrowed, lent] = await Promise.all([
    trpc.expenseShare.getTotalBorrowed.query({ userId, chatId }),
    trpc.expenseShare.getTotalLent.query({ userId, chatId }),
  ]);
  return { borrowed, lent };
}

export async function deleteExpense(
  trpc: TrpcClient,
  input: { expenseId: string }
) {
  return trpc.expense.deleteExpense.mutate({ expenseId: input.expenseId });
}

export async function bulkImportExpenses(
  trpc: TrpcClient,
  input: {
    chatId?: string | number;
    rows: ExpenseRow[];
    notify?: boolean;
  }
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  const notify = Boolean(input.notify);

  const bulkResult = await trpc.expense.createExpensesBulk.mutate({
    chatId,
    expenses: input.rows.map((row) => ({
      payerId: row.payerId,
      creatorId: row.creatorId,
      description: row.description,
      amount: row.amount,
      currency: row.currency,
      splitMode: row.splitMode,
      participantIds: row.participantIds,
      customSplits: row.customSplits,
      date: row.date ? new Date(row.date) : undefined,
      categoryId: row.categoryId,
    })),
  });

  let summary: { sent: boolean; messageId: number | null } | undefined;
  if (notify && bulkResult.succeeded > 0) {
    const items = bulkResult.results
      .filter(
        (
          r
        ): r is Extract<
          (typeof bulkResult.results)[number],
          { status: "success" }
        > => r.status === "success" && "expense" in r
      )
      .map((r) => {
        const inputRow = input.rows[r.index];
        return {
          description: String(r.expense.description ?? r.description ?? ""),
          amount: Number(r.expense.amount),
          currency: String(r.expense.currency),
          categoryId: r.expense.categoryId ?? null,
          payerId: inputRow?.payerId,
          splitMode: inputRow?.splitMode,
          participantCount: inputRow?.participantIds?.length,
        };
      });
    try {
      summary = await trpc.expense.sendBatchExpenseSummary.mutate({
        chatId,
        kind: "created",
        items,
      });
    } catch {
      summary = { sent: false, messageId: null };
    }
  }

  return summary ? { ...bulkResult, summary } : bulkResult;
}

export async function bulkUpdateExpenses(
  trpc: TrpcClient,
  input: {
    chatId?: string | number;
    rows: BulkUpdateRow[];
    notify?: boolean;
  }
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  const notify = Boolean(input.notify);

  type BulkUpdateInput = Parameters<
    TrpcClient["expense"]["updateExpensesBulk"]["mutate"]
  >[0];
  type BulkUpdateRowServer = BulkUpdateInput["expenses"][number];

  const expenses: BulkUpdateRowServer[] = input.rows.map((row, i) => {
    if (!row || typeof row.expenseId !== "string" || !row.expenseId) {
      throw new Error(`row ${i}: missing expenseId`);
    }
    const out: BulkUpdateRowServer = { expenseId: row.expenseId };
    if (row.payerId !== undefined) out.payerId = row.payerId;
    if (row.creatorId !== undefined) out.creatorId = row.creatorId;
    if (row.description !== undefined) out.description = row.description;
    if (row.amount !== undefined) out.amount = row.amount;
    if (row.currency !== undefined) out.currency = row.currency;
    if (row.splitMode !== undefined) out.splitMode = row.splitMode;
    if (row.participantIds !== undefined)
      out.participantIds = row.participantIds;
    if (row.customSplits !== undefined) out.customSplits = row.customSplits;
    if (row.date !== undefined) {
      const d = new Date(row.date);
      if (Number.isNaN(d.getTime())) {
        throw new Error(`row ${i}: date must be a valid ISO 8601 string`);
      }
      out.date = d;
    }
    if (row.category !== undefined) {
      out.categoryId =
        row.category === null || row.category === "none" ? null : row.category;
    }
    return out;
  });

  return trpc.expense.updateExpensesBulk.mutate({
    chatId,
    expenses,
    sendNotification: notify,
  });
}
