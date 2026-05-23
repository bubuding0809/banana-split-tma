import { resolveChatId, type TrpcClient } from "@bananasplitz/api-client";
import { invalidField, missingField } from "../errors.js";

type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type Weekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export async function listRecurringExpenses(
  trpc: TrpcClient,
  input: { chatId?: string | number } = {}
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  return trpc.expense.recurring.list.query({ chatId });
}

export async function getRecurringExpense(
  trpc: TrpcClient,
  input: { templateId: string }
) {
  return trpc.expense.recurring.get.query({ templateId: input.templateId });
}

export async function updateRecurringExpense(
  trpc: TrpcClient,
  input: Parameters<TrpcClient["expense"]["recurring"]["update"]["mutate"]>[0]
) {
  return trpc.expense.recurring.update.mutate(input);
}

export async function cancelRecurringExpense(
  trpc: TrpcClient,
  input: { templateId: string }
) {
  return trpc.expense.recurring.cancel.mutate({
    templateId: input.templateId,
  });
}

export function validateTemplateId(templateId?: string): string {
  if (!templateId) missingField("--template-id is required");
  return templateId;
}

export function buildRecurringUpdatePayload(input: {
  templateId: string;
  amount?: string | number;
  description?: string;
  frequency?: string;
  interval?: string | number;
  weekdays?: string;
  endDate?: string;
}): Parameters<TrpcClient["expense"]["recurring"]["update"]["mutate"]>[0] {
  const payload: Parameters<
    TrpcClient["expense"]["recurring"]["update"]["mutate"]
  >[0] = {
    templateId: input.templateId,
  };

  if (input.amount !== undefined) {
    const amt = Number(input.amount);
    if (Number.isNaN(amt) || amt <= 0) {
      invalidField("--amount must be a positive number");
    }
    payload.amount = amt;
  }

  if (input.description !== undefined) {
    const desc = String(input.description);
    if (desc.length < 1 || desc.length > 60) {
      invalidField("--description must be between 1 and 60 characters");
    }
    payload.description = desc;
  }

  if (input.frequency !== undefined) {
    const freq = String(input.frequency).toUpperCase();
    if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
      invalidField("--frequency must be DAILY, WEEKLY, MONTHLY, or YEARLY");
    }
    payload.frequency = freq as RecurrenceFrequency;
  }

  if (input.interval !== undefined) {
    const ival = Number(input.interval);
    if (Number.isNaN(ival) || ival <= 0 || !Number.isInteger(ival)) {
      invalidField("--interval must be a positive integer");
    }
    payload.interval = ival;
  }

  if (input.weekdays !== undefined) {
    const days = String(input.weekdays)
      .split(",")
      .map((s) => s.trim().toUpperCase());
    const valid: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    if (days.some((d) => !valid.includes(d as Weekday))) {
      invalidField("--weekdays must contain valid short days (SUN,MON...)");
    }
    payload.weekdays = days as Weekday[];
  }

  if (input.endDate !== undefined) {
    if (String(input.endDate).toLowerCase() === "none") {
      payload.endDate = null;
    } else {
      const ed = new Date(String(input.endDate));
      if (Number.isNaN(ed.getTime())) {
        invalidField("--end-date must be a valid ISO date or 'none'");
      }
      payload.endDate = ed;
    }
  }

  const hasUpdate =
    input.amount !== undefined ||
    input.description !== undefined ||
    input.frequency !== undefined ||
    input.interval !== undefined ||
    input.weekdays !== undefined ||
    input.endDate !== undefined;

  if (!hasUpdate) {
    invalidField("At least one field to update is required");
  }

  return payload;
}
