import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run, error } from "../output.js";

export const transferCommands: Command[] = [
  {
    name: "list-transfers",
    description: "List native cross-group debt transfers touching a chat",
    agentGuidance:
      "Use this to see transfers in or out of a chat, and to find a transfer's id before deleting it. Each row has a `direction` ('out' when this chat is the source, 'in' when it is the target) and the counterpart group's title.",
    examples: ["banana list-transfers --chat-id 123456789"],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("list-transfers", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        return trpc.debtTransfer.getAllByChat.query({ chatId });
      }),
  },

  {
    name: "delete-transfer",
    description: "Delete a debt transfer by ID (reverses it in both groups)",
    agentGuidance:
      "Use this to undo a transfer. Removing the row reverses its effect: the source-chat debt comes back and the target-chat debt is removed. Use list-transfers first to find the id.",
    examples: [
      "banana delete-transfer --transfer-id 123e4567-e89b-12d3-a456-426614174000",
    ],
    options: {
      "transfer-id": {
        type: "string",
        description: "The transfer UUID",
        required: true,
      },
    },
    execute: (opts, trpc) => {
      if (!opts["transfer-id"]) {
        return error(
          "missing_option",
          "--transfer-id is required",
          "delete-transfer"
        );
      }
      return run("delete-transfer", async () =>
        trpc.debtTransfer.deleteTransfer.mutate({
          transferId: String(opts["transfer-id"]),
        })
      );
    },
  },

  {
    name: "create-transfer",
    description:
      "Move an outstanding debt from one chat to another without logging consumption spending in either group",
    agentGuidance:
      "Use this to relocate a balance across groups (e.g. shift what Sean owes Ruoqian from one trip ledger to another) without polluting either user's spending metrics. The debtor must already owe the creditor at least the amount in the source chat. Requires a user-level API key — both chats are membership-checked.",
    examples: [
      "banana create-transfer --from-chat 100 --to-chat 200 --debtor 2 --creditor 3 --amount 71.79 --currency SGD",
    ],
    options: {
      "from-chat": {
        type: "string",
        description: "Source chat ID — the chat where the debt is removed",
        required: true,
      },
      "to-chat": {
        type: "string",
        description: "Target chat ID — the chat where the debt is added",
        required: true,
      },
      debtor: {
        type: "string",
        description: "User ID of the person who owes the money",
        required: true,
      },
      creditor: {
        type: "string",
        description: "User ID of the person who is owed the money",
        required: true,
      },
      amount: {
        type: "string",
        description: "The amount of debt to transfer",
        required: true,
      },
      currency: {
        type: "string",
        description: "3-letter currency code (defaults to SGD)",
        required: false,
      },
      description: {
        type: "string",
        description: "Optional note about the transfer",
        required: false,
      },
    },
    execute: (opts, trpc) => {
      if (!opts["from-chat"]) {
        return error(
          "missing_option",
          "--from-chat is required",
          "create-transfer"
        );
      }
      if (!opts["to-chat"]) {
        return error(
          "missing_option",
          "--to-chat is required",
          "create-transfer"
        );
      }
      if (!opts.debtor) {
        return error(
          "missing_option",
          "--debtor is required",
          "create-transfer"
        );
      }
      if (!opts.creditor) {
        return error(
          "missing_option",
          "--creditor is required",
          "create-transfer"
        );
      }
      if (!opts.amount) {
        return error(
          "missing_option",
          "--amount is required",
          "create-transfer"
        );
      }

      return run("create-transfer", async () =>
        trpc.debtTransfer.createTransfer.mutate({
          sourceChatId: Number(opts["from-chat"]),
          targetChatId: Number(opts["to-chat"]),
          debtorId: Number(opts.debtor),
          creditorId: Number(opts.creditor),
          amount: Number(opts.amount),
          currency: opts.currency ? String(opts.currency) : undefined,
          description: opts.description ? String(opts.description) : undefined,
        })
      );
    },
  },
];
