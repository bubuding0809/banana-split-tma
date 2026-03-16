import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run, error } from "../output.js";

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
      run("send-group-reminder", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        // The tRPC input schema expects a string chatId
        return trpc.telegram.sendGroupReminderMessage.mutate({
          chatId: chatId.toString(),
        });
      }),
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
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );

        if (!opts["debtor-user-id"]) {
          throw new Error("Missing required option: --debtor-user-id");
        }
        if (!opts["debtor-name"]) {
          throw new Error("Missing required option: --debtor-name");
        }
        if (!opts["creditor-name"]) {
          throw new Error("Missing required option: --creditor-name");
        }
        if (!opts["amount"]) {
          throw new Error("Missing required option: --amount");
        }

        const input: any = {
          chatId: Number(chatId),
          debtorUserId: Number(opts["debtor-user-id"]),
          debtorName: opts["debtor-name"] as string,
          creditorName: opts["creditor-name"] as string,
          amount: parseFloat(opts["amount"] as string),
        };

        if (opts["debtor-username"]) {
          input.debtorUsername = opts["debtor-username"] as string;
        }
        if (opts["currency"]) {
          input.currency = opts["currency"] as string;
        }
        if (opts["thread-id"]) {
          input.threadId = Number(opts["thread-id"]);
        }

        return trpc.telegram.sendDebtReminderMessage.mutate(input);
      }),
  },
];
