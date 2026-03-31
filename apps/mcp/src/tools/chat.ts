import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TrpcClient } from "../client.js";
import { toolHandler } from "./utils.js";
import { getScope, resolveChatId } from "../scope.js";

export function registerChatTools(server: McpServer, trpc: TrpcClient) {
  server.registerTool(
    "banana_list_chats",
    {
      title: "List Chats",
      description:
        "List all expense-tracking chats/groups in Banana Split. " +
        "Returns chat ID, title, type, base currency, and timestamps. " +
        "Use this to discover available chats before querying expenses or debts. " +
        "If using a chat-scoped API key, returns only the scoped chat.",
      inputSchema: {
        exclude_types: z
          .array(
            z.enum(["private", "group", "supergroup", "channel", "sender"])
          )
          .optional()
          .describe(
            "Chat types to exclude from results. e.g. ['private'] to only see groups."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_list_chats", async ({ exclude_types }) => {
      const scope = await getScope(trpc);

      if (scope.scoped && scope.chatId !== null) {
        // For scoped keys, return the scoped chat info directly
        const chat = await trpc.chat.getChat.query({ chatId: scope.chatId });
        const text = `- **${chat.title}** (ID: ${chat.id}, type: ${chat.type}, currency: ${chat.baseCurrency})`;
        return {
          content: [
            {
              type: "text" as const,
              text: `This API key is scoped to a single chat:\n${text}`,
            },
          ],
        };
      }

      const chats = await trpc.chat.getAllChats.query({
        excludeTypes: exclude_types,
      });
      const text =
        chats.length === 0
          ? "No chats found."
          : (
              chats as Array<{
                title: string;
                id: string;
                type: string;
                baseCurrency: string;
              }>
            )
              .map(
                (c) =>
                  `- **${c.title}** (ID: ${c.id}, type: ${c.type}, currency: ${c.baseCurrency})`
              )
              .join("\n");
      return {
        content: [{ type: "text" as const, text }],
      };
    })
  );

  server.registerTool(
    "banana_get_chat",
    {
      title: "Get Chat Details",
      description:
        "Get detailed information about a specific chat/group, including its members. " +
        "Returns chat title, type, base currency, member list with names/usernames, " +
        "and whether debt simplification is enabled. " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        chat_id: z
          .number()
          .optional()
          .describe(
            "The numeric chat ID. Optional if using a chat-scoped API key."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_get_chat", async ({ chat_id }) => {
      const resolvedChatId = await resolveChatId(trpc, chat_id);
      const chat = await trpc.chat.getChat.query({ chatId: resolvedChatId });
      const members = (
        chat.members as Array<{
          firstName?: string;
          lastName?: string;
          username?: string;
          id: number;
        }>
      )
        .map(
          (m) =>
            `  - ${m.firstName || ""} ${m.lastName || ""}`.trim() +
            (m.username ? ` (@${m.username})` : "") +
            ` [ID: ${m.id}]`
        )
        .join("\n");
      const text =
        `**${chat.title}** (ID: ${chat.id})\n` +
        `Type: ${chat.type}\n` +
        `Base Currency: ${chat.baseCurrency}\n` +
        `Debt Simplification: ${chat.debtSimplificationEnabled ? "Enabled" : "Disabled"}\n` +
        `Members (${chat.members.length}):\n${members}`;
      return {
        content: [{ type: "text" as const, text }],
      };
    })
  );

  server.registerTool(
    "banana_get_chat_debts",
    {
      title: "Get Chat Debts",
      description:
        "Get all outstanding debts in a chat. Shows who owes whom and how much, " +
        "optionally filtered by currencies. Returns debtor ID, creditor ID, amount, and currency. " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        chat_id: z
          .number()
          .optional()
          .describe(
            "The numeric chat ID. Optional if using a chat-scoped API key."
          ),
        currencies: z
          .array(z.string().length(3))
          .optional()
          .describe(
            "Optional filter: only show debts in these currencies (3-letter codes, e.g. ['USD', 'SGD'])."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_get_chat_debts", async ({ chat_id, currencies }) => {
      const resolvedChatId = await resolveChatId(trpc, chat_id);
      const result = await trpc.chat.getBulkChatDebts.query({
        chatId: resolvedChatId,
        currencies,
      });
      if (result.debts.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No outstanding debts in this chat.",
            },
          ],
        };
      }
      const text = (
        result.debts as Array<{
          debtorId: number;
          creditorId: number;
          amount: string;
          currency: string;
        }>
      )
        .map(
          (d) =>
            `- User ${d.debtorId} owes User ${d.creditorId}: ${d.amount} ${d.currency}`
        )
        .join("\n");
      return {
        content: [
          { type: "text" as const, text: `**Outstanding Debts:**\n${text}` },
        ],
      };
    })
  );

  server.registerTool(
    "banana_get_simplified_debts",
    {
      title: "Get Simplified Debts",
      description:
        "Get optimized/simplified debt graph for a chat in a specific currency. " +
        "Reduces the number of transactions needed to settle all debts. " +
        "Returns simplified debts, transaction reduction stats, and member info. " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        chat_id: z
          .number()
          .optional()
          .describe(
            "The numeric chat ID. Optional if using a chat-scoped API key."
          ),
        currency: z
          .string()
          .length(3)
          .describe("3-letter currency code (e.g. 'USD', 'SGD')."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler(
      "banana_get_simplified_debts",
      async ({ chat_id, currency }) => {
        const resolvedChatId = await resolveChatId(trpc, chat_id);
        const result = await trpc.chat.getSimplifiedDebts.query({
          chatId: resolvedChatId,
          currency,
        });
        const memberMap = new Map(
          (
            result.chatMembers as Array<{
              id: number;
              username?: string;
              firstName?: string;
            }>
          ).map((m) => [m.id, m.username || m.firstName || `User ${m.id}`])
        );
        const debts = (
          result.simplifiedDebts as Array<{
            fromUserId: number;
            toUserId: number;
            amount: string;
          }>
        )
          .map(
            (d) =>
              `- ${memberMap.get(d.fromUserId) || d.fromUserId} -> ${memberMap.get(d.toUserId) || d.toUserId}: ${d.amount} ${currency}`
          )
          .join("\n");
        const stats = result.transactionReduction;
        const text =
          `**Simplified Debts (${currency}):**\n${debts || "No debts."}\n\n` +
          `**Transaction Reduction:** ${stats.original} -> ${stats.simplified} ` +
          `(${stats.reductionPercentage.toFixed(0)}% reduction)`;
        return {
          content: [{ type: "text" as const, text }],
        };
      }
    )
  );

  server.registerTool(
    "banana_update_chat_settings",
    {
      title: "Update Chat Settings",
      description:
        "Update configuration for a chat/group, such as enabling/disabling debt simplification or changing the base currency. " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        chat_id: z
          .number()
          .optional()
          .describe(
            "The numeric chat ID. Optional if using a chat-scoped API key."
          ),
        debt_simplification_enabled: z
          .boolean()
          .optional()
          .describe(
            "Turn on or off the debt simplification algorithm for the group"
          ),
        base_currency: z
          .string()
          .length(3)
          .optional()
          .describe(
            "Update the default 3-letter currency code for the group (e.g. 'USD')"
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    toolHandler(
      "banana_update_chat_settings",
      async ({ chat_id, debt_simplification_enabled, base_currency }) => {
        const resolvedChatId = await resolveChatId(trpc, chat_id);

        // Build update payload dynamically
        const updateData: {
          chatId: number;
          debtSimplificationEnabled?: boolean;
          baseCurrency?: string;
        } = { chatId: resolvedChatId };
        if (debt_simplification_enabled !== undefined) {
          updateData.debtSimplificationEnabled = debt_simplification_enabled;
        }
        if (base_currency !== undefined) {
          updateData.baseCurrency = base_currency;
        }

        const chat = await trpc.chat.updateChat.mutate(updateData);

        const settings = [];
        if (debt_simplification_enabled !== undefined) {
          settings.push(
            `Debt Simplification: ${chat.debtSimplificationEnabled ? "Enabled" : "Disabled"}`
          );
        }
        if (base_currency !== undefined) {
          settings.push(`Base Currency: ${chat.baseCurrency}`);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Successfully updated chat settings for '${chat.title}'!\n- ${settings.join("\n- ")}`,
            },
          ],
        };
      }
    )
  );
}
