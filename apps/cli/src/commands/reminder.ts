import type { Command } from "./types.js";
import { run } from "../output.js";
import {
  sendDebtReminder,
  sendGroupReminder,
  validateSendDebtReminderInput,
} from "@bananasplitz/api-ops";

export const reminderCommands: Command[] = [
  {
    name: "send-group-reminder",
    description:
      "Send a reminder message to a Telegram group about outstanding debts",
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
      },
    },
    execute: (opts, trpc) =>
      run("send-group-reminder", async () =>
        sendGroupReminder(trpc, {
          chatId: opts["chat-id"] as string | undefined,
        })
      ),
  },
  {
    name: "send-debt-reminder",
    description: "Send an individual debt reminder message in a Telegram group",
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
      },
      "debtor-user-id": {
        type: "string",
        description: "The numeric user ID of the debtor",
      },
      "debtor-name": {
        type: "string",
        description: "The name of the debtor",
      },
      "debtor-username": {
        type: "string",
        description: "The username of the debtor (optional)",
      },
      "creditor-name": {
        type: "string",
        description: "The name of the creditor",
      },
      amount: {
        type: "string",
        description: "The amount owed",
      },
      currency: {
        type: "string",
        description: "The 3-letter currency code",
      },
      "thread-id": {
        type: "string",
        description: "The message thread ID (optional)",
      },
    },
    execute: (opts, trpc) =>
      run("send-debt-reminder", async () => {
        const validated = validateSendDebtReminderInput({
          debtorUserId: opts["debtor-user-id"] as string | undefined,
          debtorName: opts["debtor-name"] as string | undefined,
          creditorName: opts["creditor-name"] as string | undefined,
          amount: opts.amount as string | undefined,
        });
        return sendDebtReminder(trpc, {
          chatId: opts["chat-id"] as string | undefined,
          ...validated,
          debtorUsername: opts["debtor-username"] as string | undefined,
          currency: opts.currency as string | undefined,
          threadId: opts["thread-id"] ? Number(opts["thread-id"]) : undefined,
        });
      }),
  },
];
