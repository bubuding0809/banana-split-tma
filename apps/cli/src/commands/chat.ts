import type { Command } from "./types.js";
import { run } from "../output.js";
import {
  getChat,
  getDebts,
  getSimplifiedDebts,
  listChats,
  parseBooleanOption,
  parseCurrencies,
  parseExcludeTypes,
  updateChatSettings,
} from "@bananasplitz/api-ops";

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
      run("list-chats", async () =>
        listChats(trpc, {
          excludeTypes: parseExcludeTypes(
            opts["exclude-types"] as string | undefined
          ),
        })
      ),
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
      run("get-chat", async () =>
        getChat(trpc, { chatId: opts["chat-id"] as string | undefined })
      ),
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
      run("get-debts", async () =>
        getDebts(trpc, {
          chatId: opts["chat-id"] as string | undefined,
          currencies: parseCurrencies(opts.currencies as string | undefined),
        })
      ),
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
    execute: (opts, trpc) =>
      run("get-simplified-debts", async () =>
        getSimplifiedDebts(trpc, {
          chatId: opts["chat-id"] as string | undefined,
          currency: opts.currency as string | undefined,
        })
      ),
  },

  {
    name: "update-chat-settings",
    description:
      "Update chat settings (debt simplification, base currency, notification toggles)",
    agentGuidance:
      "Use this to change how debts are calculated, the default currency, or notification preferences.",
    examples: [
      "banana update-chat-settings --chat-id 123456789 --debt-simplification true --base-currency USD",
      "banana update-chat-settings --chat-id 123456789 --notify-on-expense-update false",
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
      "notify-on-expense": {
        type: "string",
        description: "Notify the chat when an expense is added (true/false)",
        required: false,
      },
      "notify-on-expense-update": {
        type: "string",
        description:
          "Notify the chat when an expense is edited. Also overrides bulk-update-expenses summary notifications (true/false).",
        required: false,
      },
      "notify-on-settlement": {
        type: "string",
        description:
          "Notify the chat when a settlement is recorded (true/false)",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("update-chat-settings", async () =>
        updateChatSettings(trpc, {
          chatId: opts["chat-id"] as string | undefined,
          debtSimplificationEnabled: parseBooleanOption(
            opts["debt-simplification"] as string | undefined
          ),
          baseCurrency: opts["base-currency"] as string | undefined,
          notifyOnExpense: parseBooleanOption(
            opts["notify-on-expense"] as string | undefined
          ),
          notifyOnExpenseUpdate: parseBooleanOption(
            opts["notify-on-expense-update"] as string | undefined
          ),
          notifyOnSettlement: parseBooleanOption(
            opts["notify-on-settlement"] as string | undefined
          ),
        })
      ),
  },
];
