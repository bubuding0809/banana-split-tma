import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run, error } from "../output.js";

export const chatCommands: Command[] = [
  {
    name: "list-chats",
    description: "List all expense-tracking chats/groups",
    options: {
      "exclude-types": {
        type: "string",
        description:
          "Comma-separated chat types to exclude (private,group,supergroup,channel,sender)",
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
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
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
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
      },
      currencies: {
        type: "string",
        description:
          "Comma-separated 3-letter currency codes to filter by (e.g. USD,SGD)",
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
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
      },
      currency: {
        type: "string",
        description: "3-letter currency code (e.g. USD, SGD) — required",
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
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
      },
      "debt-simplification": {
        type: "string",
        description: "Enable/disable debt simplification (true/false)",
      },
      "base-currency": {
        type: "string",
        description: "Update default 3-letter currency code (e.g. USD)",
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
