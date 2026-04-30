import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run, error } from "../output.js";

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
      run("list-recurring-expenses", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        return trpc.expense.recurring.list.query({ chatId: Number(chatId) });
      }),
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
    execute: (opts, trpc) => {
      if (!opts["template-id"]) {
        return error(
          "missing_option",
          "--template-id is required",
          "get-recurring-expense"
        );
      }
      return run("get-recurring-expense", async () => {
        return trpc.expense.recurring.get.query({
          templateId: String(opts["template-id"]),
        });
      });
    },
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
    execute: (opts, trpc) => {
      if (!opts["template-id"]) {
        return error(
          "missing_option",
          "--template-id is required",
          "update-recurring-expense"
        );
      }

      return run("update-recurring-expense", async () => {
        const payload: Parameters<
          typeof trpc.expense.recurring.update.mutate
        >[0] = {
          templateId: String(opts["template-id"]),
        };

        if (opts.amount) {
          const amt = Number(opts.amount);
          if (Number.isNaN(amt) || amt <= 0)
            throw new Error("--amount must be a positive number");
          payload.amount = amt;
        }

        if (opts.description) payload.description = String(opts.description);

        if (opts.frequency) {
          const freq = String(opts.frequency);
          if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
            throw new Error(
              "--frequency must be DAILY, WEEKLY, MONTHLY, or YEARLY"
            );
          }
          payload.frequency = freq as "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
        }

        if (opts.interval) {
          const ival = Number(opts.interval);
          if (Number.isNaN(ival) || ival <= 0)
            throw new Error("--interval must be a positive number");
          payload.interval = ival;
        }

        if (opts.weekdays) {
          const days = String(opts.weekdays)
            .split(",")
            .map((s) => s.trim().toUpperCase());
          const valid = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
          if (days.some((d) => !valid.includes(d))) {
            throw new Error(
              "--weekdays must contain valid short days (SUN,MON...)"
            );
          }
          payload.weekdays = days as (
            | "SUN"
            | "MON"
            | "TUE"
            | "WED"
            | "THU"
            | "FRI"
            | "SAT"
          )[];
        }

        if (opts["end-date"] !== undefined) {
          if (String(opts["end-date"]).toLowerCase() === "none") {
            payload.endDate = null;
          } else {
            const ed = new Date(String(opts["end-date"]));
            if (Number.isNaN(ed.getTime()))
              throw new Error("--end-date must be valid ISO date or 'none'");
            payload.endDate = ed;
          }
        }

        return trpc.expense.recurring.update.mutate(payload);
      });
    },
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
    execute: (opts, trpc) => {
      if (!opts["template-id"]) {
        return error(
          "missing_option",
          "--template-id is required",
          "cancel-recurring-expense"
        );
      }
      return run("cancel-recurring-expense", async () => {
        return trpc.expense.recurring.cancel.mutate({
          templateId: String(opts["template-id"]),
        });
      });
    },
  },
];
