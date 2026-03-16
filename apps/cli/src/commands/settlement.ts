import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run, error } from "../output.js";

export const settlementCommands: Command[] = [
  {
    name: "list-settlements",
    description: "List all debt settlements in a chat",
    agentGuidance: "Use this to see past payments between users.",
    examples: ["banana list-settlements --chat-id 123456789"],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
      currency: {
        type: "string",
        description: "Filter by 3-letter currency code",
        required: false,
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
    agentGuidance:
      "Use this when a user says 'I paid back $50 to Bob'. Always use get-net-share first to verify the debt.",
    examples: [
      "banana create-settlement --sender-id 123 --receiver-id 456 --amount 50 --currency USD",
    ],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
      "sender-id": {
        type: "string",
        description: "The user ID who is paying the debt",
        required: true,
      },
      "receiver-id": {
        type: "string",
        description: "The user ID who is receiving the payment",
        required: true,
      },
      amount: {
        type: "string",
        description: "The amount being paid",
        required: true,
      },
      currency: {
        type: "string",
        description: "3-letter currency code (defaults to chat base currency)",
        required: false,
      },
      description: {
        type: "string",
        description: "Optional note about the settlement",
        required: false,
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
    agentGuidance: "Use this to undo a settlement.",
    examples: [
      "banana delete-settlement --settlement-id 123e4567-e89b-12d3-a456-426614174000",
    ],
    options: {
      "settlement-id": {
        type: "string",
        description: "The settlement UUID",
        required: true,
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
    agentGuidance:
      "Use this when a user wants to clear all balances with someone else.",
    examples: [
      'banana settle-all-debts --sender-id 123 --receiver-id 456 --balances \'[{"currency":"USD","amount":15}]\'',
    ],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
      "sender-id": {
        type: "string",
        description: "The user ID paying the debt",
        required: true,
      },
      "receiver-id": {
        type: "string",
        description: "The user ID receiving the payment",
        required: true,
      },
      balances: {
        type: "string",
        description:
          'JSON array of balances: \'[{"currency":"USD","amount":15}]\'',
        required: true,
      },
      "creditor-name": {
        type: "string",
        description: "Optional creditor name for notifications",
        required: false,
      },
      "debtor-name": {
        type: "string",
        description: "Optional debtor name for notifications",
        required: false,
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
