import type { Command } from "./types.js";
import { run, error } from "../output.js";

export const transferCommands: Command[] = [
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
