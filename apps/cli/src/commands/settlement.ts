import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run, error } from "../output.js";

export const settlementCommands: Command[] = [
  {
    name: "list-settlements",
    description: "List all debt settlements in a chat",
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
      },
      currency: {
        type: "string",
        description: "Filter by 3-letter currency code",
      },
    },
    execute: (opts, trpc) =>
      run("list-settlements", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        return trpc.settlement.getSettlementByChat.query({
          chatId,
          currency: opts.currency ? String(opts.currency) : undefined,
        });
      }),
  },

  {
    name: "create-settlement",
    description: "Record a debt settlement/payment between two users",
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
      },
      "sender-id": {
        type: "string",
        description: "The user ID who is paying the debt",
      },
      "receiver-id": {
        type: "string",
        description: "The user ID who is receiving the payment",
      },
      amount: {
        type: "string",
        description: "The amount being paid",
      },
      currency: {
        type: "string",
        description: "3-letter currency code (defaults to chat base currency)",
      },
      description: {
        type: "string",
        description: "Optional note about the settlement",
      },
    },
    execute: (opts, trpc) => {
      if (!opts["sender-id"]) {
        return error(
          "missing_option",
          "--sender-id is required",
          "create-settlement"
        );
      }
      if (!opts["receiver-id"]) {
        return error(
          "missing_option",
          "--receiver-id is required",
          "create-settlement"
        );
      }
      if (!opts.amount) {
        return error(
          "missing_option",
          "--amount is required",
          "create-settlement"
        );
      }

      return run("create-settlement", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        const senderId = Number(opts["sender-id"]);
        const receiverId = Number(opts["receiver-id"]);

        // Fetch chat members to get names for the notification
        const chat = await trpc.chat.getChat.query({ chatId });
        const members = chat.members ?? [];
        const creditor = members.find(
          (m: { id: number }) => m.id === receiverId
        );
        const debtor = members.find((m: { id: number }) => m.id === senderId);

        return trpc.settlement.createSettlement.mutate({
          chatId,
          senderId,
          receiverId,
          amount: Number(opts.amount),
          currency: opts.currency ? String(opts.currency) : undefined,
          description: opts.description ? String(opts.description) : undefined,
          sendNotification: true,
          creditorName: creditor?.firstName ?? `User ${receiverId}`,
          creditorUsername: creditor?.username ?? undefined,
          debtorName: debtor?.firstName ?? `User ${senderId}`,
          threadId: chat.threadId ?? undefined,
        });
      });
    },
  },

  {
    name: "delete-settlement",
    description: "Delete a settlement by ID",
    options: {
      "settlement-id": {
        type: "string",
        description: "The settlement UUID",
      },
    },
    execute: (opts, trpc) => {
      if (!opts["settlement-id"]) {
        return error(
          "missing_option",
          "--settlement-id is required",
          "delete-settlement"
        );
      }
      return run("delete-settlement", async () => {
        return trpc.settlement.deleteSettlement.mutate({
          settlementId: String(opts["settlement-id"]),
        });
      });
    },
  },

  {
    name: "settle-all-debts",
    description:
      "Settle all debts between two users across multiple currencies",
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
      },
      "sender-id": {
        type: "string",
        description: "The user ID paying the debt",
      },
      "receiver-id": {
        type: "string",
        description: "The user ID receiving the payment",
      },
      balances: {
        type: "string",
        description:
          'JSON array of balances: \'[{"currency":"USD","amount":15}]\'',
      },
      "creditor-name": {
        type: "string",
        description: "Optional creditor name for notifications",
      },
      "debtor-name": {
        type: "string",
        description: "Optional debtor name for notifications",
      },
    },
    execute: (opts, trpc) => {
      if (!opts["sender-id"]) {
        return error(
          "missing_option",
          "--sender-id is required",
          "settle-all-debts"
        );
      }
      if (!opts["receiver-id"]) {
        return error(
          "missing_option",
          "--receiver-id is required",
          "settle-all-debts"
        );
      }
      if (!opts.balances) {
        return error(
          "missing_option",
          "--balances is required",
          "settle-all-debts"
        );
      }

      let parsedBalances: { currency: string; amount: number }[];
      try {
        parsedBalances = JSON.parse(String(opts.balances));
        if (!Array.isArray(parsedBalances)) {
          throw new Error("not array");
        }
      } catch {
        return error(
          "invalid_option",
          "--balances must be valid JSON array",
          "settle-all-debts"
        );
      }

      return run("settle-all-debts", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        const senderId = Number(opts["sender-id"]);
        const receiverId = Number(opts["receiver-id"]);

        // Fetch chat members to get names for the notification
        const chat = await trpc.chat.getChat.query({ chatId });
        const members = chat.members ?? [];
        const creditor = members.find(
          (m: { id: number }) => m.id === receiverId
        );
        const debtor = members.find((m: { id: number }) => m.id === senderId);

        return trpc.settlement.settleAllDebts.mutate({
          chatId,
          senderId,
          receiverId,
          balances: parsedBalances,
          creditorName:
            (opts["creditor-name"] as string | undefined) ??
            creditor?.firstName ??
            `User ${receiverId}`,
          creditorUsername: creditor?.username ?? undefined,
          debtorName:
            (opts["debtor-name"] as string | undefined) ??
            debtor?.firstName ??
            `User ${senderId}`,
          threadId: chat.threadId ?? undefined,
        });
      });
    },
  },
];
