import { serializeToolResult } from "../serialize.js";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createTrpcCaller } from "../trpc.js";

export const getChatDetailsTool = createTool({
  id: "getChatDetailsTool",
  description:
    "Get details for the current chat, including members and their balances.",
  inputSchema: z.object({}),
  execute: async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);
    // Note: Use getChat as getChatDetails was requested but the router exposes getChat
    const result = await caller.chat.getChat({ chatId });
    return serializeToolResult(result);
  },
});

export const listChatsTool = createTool({
  id: "listChatsTool",
  description: "List all expense-tracking chats/groups the user is part of.",
  inputSchema: z.object({
    excludeTypes: z
      .array(z.enum(["private", "group", "supergroup", "channel", "sender"]))
      .optional()
      .describe("Chat types to exclude"),
  }),
  execute: async (data, context) => {
    const { caller } = createTrpcCaller(context);
    const result = await caller.chat.getAllChats({
      excludeTypes: data.excludeTypes,
    });
    return serializeToolResult(result);
  },
});

export const getDebtsTool = createTool({
  id: "getDebtsTool",
  description: "Get all outstanding debts in a chat.",
  inputSchema: z.object({
    currencies: z
      .array(z.string())
      .optional()
      .describe(
        "Array of 3-letter currency codes to filter by (e.g. ['USD', 'SGD'])"
      ),
  }),
  execute: async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);
    const result = await caller.chat.getBulkChatDebts({
      chatId,
      currencies: data.currencies,
    });
    return serializeToolResult(result);
  },
});

export const getSimplifiedDebtsTool = createTool({
  id: "getSimplifiedDebtsTool",
  description:
    "Get optimized/simplified debt graph for a chat in a specific currency.",
  inputSchema: z.object({
    currency: z
      .string()
      .describe("3-letter currency code (e.g. USD, SGD) — required"),
  }),
  execute: async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);
    const result = await caller.chat.getSimplifiedDebts({
      chatId,
      currency: data.currency,
    });
    return serializeToolResult(result);
  },
});

export const updateChatSettingsTool = createTool({
  id: "updateChatSettingsTool",
  description: "Update chat settings (debt simplification, base currency).",
  inputSchema: z.object({
    debtSimplificationEnabled: z
      .boolean()
      .optional()
      .describe("Enable/disable debt simplification"),
    baseCurrency: z
      .string()
      .optional()
      .describe("Update default 3-letter currency code (e.g. USD)"),
  }),
  execute: async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);
    const result = await caller.chat.updateChat({
      chatId,
      debtSimplificationEnabled: data.debtSimplificationEnabled,
      baseCurrency: data.baseCurrency,
    });
    return serializeToolResult(result);
  },
});
