import type { Command } from "./types.js";
import { run } from "../output.js";
import {
  buildRecurringUpdatePayload,
  cancelRecurringExpense,
  getRecurringExpense,
  listRecurringExpenses,
  updateRecurringExpense,
  validateTemplateId,
} from "@bananasplitz/api-ops";

export const recurringCommands: Command[] = [
  {
    name: "list-recurring-expenses",
    description: "List all active recurring expenses in a chat",
    agentGuidance:
      "Use this to find active template IDs for updating or canceling.",
    examples: ["banana list-recurring-expenses --chat-id 123456789"],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("list-recurring-expenses", async () =>
        listRecurringExpenses(trpc, {
          chatId: opts["chat-id"] as string | undefined,
        })
      ),
  },
  {
    name: "get-recurring-expense",
    description: "Get details for a specific recurring expense template",
    agentGuidance: "Use this to see schedule details before updating.",
    examples: [
      "banana get-recurring-expense --template-id 123e4567-e89b-12d3-a456-426614174000",
    ],
    options: {
      "template-id": {
        type: "string",
        description: "The template UUID",
        required: true,
      },
    },
    execute: (opts, trpc) =>
      run("get-recurring-expense", async () =>
        getRecurringExpense(trpc, {
          templateId: validateTemplateId(
            opts["template-id"] as string | undefined
          ),
        })
      ),
  },
  {
    name: "update-recurring-expense",
    description: "Update schedule or details of a recurring template",
    agentGuidance:
      "Use this to change the frequency, amount, or description. Omitting a flag keeps its current value.",
    examples: [
      "banana update-recurring-expense --template-id <uuid> --amount 60 --frequency MONTHLY",
    ],
    options: {
      "template-id": {
        type: "string",
        description: "The template UUID",
        required: true,
      },
      amount: {
        type: "string",
        description: "New total amount",
        required: false,
      },
      description: {
        type: "string",
        description: "New description",
        required: false,
      },
      frequency: {
        type: "string",
        description: "DAILY, WEEKLY, MONTHLY, or YEARLY",
        required: false,
      },
      interval: {
        type: "string",
        description: "Recurrence interval multiplier",
        required: false,
      },
      weekdays: {
        type: "string",
        description: "Comma-separated weekdays (e.g., MON,WED)",
        required: false,
      },
      "end-date": {
        type: "string",
        description: "ISO 8601 end date (use 'none' to clear)",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("update-recurring-expense", async () => {
        const payload = buildRecurringUpdatePayload({
          templateId: validateTemplateId(
            opts["template-id"] as string | undefined
          ),
          amount: opts.amount as string | undefined,
          description: opts.description as string | undefined,
          frequency: opts.frequency as string | undefined,
          interval: opts.interval as string | undefined,
          weekdays: opts.weekdays as string | undefined,
          endDate: opts["end-date"] as string | undefined,
        });
        return updateRecurringExpense(trpc, payload);
      }),
  },
  {
    name: "cancel-recurring-expense",
    description: "Cancel an active recurring expense template",
    agentGuidance:
      "Use this to stop future recurrences. Existing generated expenses are untouched.",
    examples: ["banana cancel-recurring-expense --template-id <uuid>"],
    options: {
      "template-id": {
        type: "string",
        description: "The template UUID",
        required: true,
      },
    },
    execute: (opts, trpc) =>
      run("cancel-recurring-expense", async () =>
        cancelRecurringExpense(trpc, {
          templateId: validateTemplateId(
            opts["template-id"] as string | undefined
          ),
        })
      ),
  },
];
