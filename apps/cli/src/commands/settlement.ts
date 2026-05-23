import type { Command } from "./types.js";
import { run } from "../output.js";
import {
  createSettlement,
  deleteSettlement,
  listSettlements,
  settleAllDebts,
  validateCreateSettlementInput,
  validateSettleAllDebtsInput,
  validateSettlementId,
} from "@bananasplitz/api-ops";

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
      run("list-settlements", async () =>
        listSettlements(trpc, {
          chatId: opts["chat-id"] as string | undefined,
          currency: opts.currency ? String(opts.currency) : undefined,
        })
      ),
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
    execute: (opts, trpc) =>
      run("create-settlement", async () => {
        const validated = validateCreateSettlementInput({
          senderId: opts["sender-id"] as string | undefined,
          receiverId: opts["receiver-id"] as string | undefined,
          amount: opts.amount as string | undefined,
        });
        return createSettlement(trpc, {
          chatId: opts["chat-id"] as string | undefined,
          ...validated,
          currency: opts.currency ? String(opts.currency) : undefined,
          description: opts.description ? String(opts.description) : undefined,
        });
      }),
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
    execute: (opts, trpc) =>
      run("delete-settlement", async () =>
        deleteSettlement(trpc, {
          settlementId: validateSettlementId(
            opts["settlement-id"] as string | undefined
          ),
        })
      ),
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
    execute: (opts, trpc) =>
      run("settle-all-debts", async () => {
        const validated = validateSettleAllDebtsInput({
          senderId: opts["sender-id"] as string | undefined,
          receiverId: opts["receiver-id"] as string | undefined,
          balances: opts.balances as string | undefined,
        });
        return settleAllDebts(trpc, {
          chatId: opts["chat-id"] as string | undefined,
          ...validated,
          creditorName: opts["creditor-name"] as string | undefined,
          debtorName: opts["debtor-name"] as string | undefined,
        });
      }),
  },
];
