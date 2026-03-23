import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run, error } from "../output.js";

export const chatCommands: Command[] = [
  {
    name: "list-chats",
    description: "List all expense-tracking chats/groups",
    agentGuidance:
      "Use this to find the chat ID when the user doesn't provide one.",
    examples: ["banana list-chats"],
    options: {
      "exclude-types": {
        type: "string",
        description:
          "Comma-separated chat types to exclude (private,group,supergroup,channel,sender)",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("list-chats", async () => {
        const excludeTypes = opts["exclude-types"]
          ? (String(opts["exclude-types"]).split(",") as (
              | "private"
              | "group"
              | "supergroup"
              | "channel"
              | "sender"
            )[])
          : undefined;
        return trpc.chat.getAllChats.query({ excludeTypes });
      }),
  },

  {
    name: "get-chat",
    description: "Get detailed information about a specific chat/group",
    agentGuidance:
      "Use this to verify a chat exists or to get its base currency.",
    examples: ["banana get-chat --chat-id 123456789"],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("get-chat", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        return trpc.chat.getChat.query({ chatId });
      }),
  },

  {
    name: "get-debts",
    description: "Get all outstanding debts in a chat",
    agentGuidance:
      "Use this to see all individual debts before simplification.",
    examples: ["banana get-debts --chat-id 123456789"],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
      currencies: {
        type: "string",
        description:
          "Comma-separated 3-letter currency codes to filter by (e.g. USD,SGD)",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("get-debts", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        const currencies = opts.currencies
          ? String(opts.currencies).split(",")
          : undefined;
        return trpc.chat.getBulkChatDebts.query({ chatId, currencies });
      }),
  },

  {
    name: "get-simplified-debts",
    description:
      "Get optimized/simplified debt graph for a chat in a specific currency",
    agentGuidance:
      "Use this to see the most efficient way to settle all debts in a chat.",
    examples: [
      "banana get-simplified-debts --chat-id 123456789 --currency USD",
    ],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
      currency: {
        type: "string",
        description: "3-letter currency code (e.g. USD, SGD) — required",
        required: true,
      },
    },
    execute: (opts, trpc) => {
      if (!opts.currency) {
        return error(
          "missing_option",
          "--currency is required",
          "get-simplified-debts"
        );
      }
      return run("get-simplified-debts", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        return trpc.chat.getSimplifiedDebts.query({
          chatId,
          currency: String(opts.currency),
        });
      });
    },
  },

  {
    name: "update-chat-settings",
    description: "Update chat settings (debt simplification, base currency)",
    agentGuidance:
      "Use this to change how debts are calculated or the default currency.",
    examples: [
      "banana update-chat-settings --chat-id 123456789 --debt-simplification true --base-currency USD",
    ],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
      "debt-simplification": {
        type: "string",
        description: "Enable/disable debt simplification (true/false)",
        required: false,
      },
      "base-currency": {
        type: "string",
        description: "Update default 3-letter currency code (e.g. USD)",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("update-chat-settings", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );

        const updateData: {
          chatId: number;
          debtSimplificationEnabled?: boolean;
          baseCurrency?: string;
        } = { chatId };

        if (opts["debt-simplification"] !== undefined) {
          updateData.debtSimplificationEnabled =
            String(opts["debt-simplification"]) === "true";
        }
        if (opts["base-currency"] !== undefined) {
          updateData.baseCurrency = String(opts["base-currency"]);
        }

        return trpc.chat.updateChat.mutate(updateData);
      }),
  },
];
