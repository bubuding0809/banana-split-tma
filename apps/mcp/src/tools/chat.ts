import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../client.js";
import { toolHandler } from "./utils.js";

export function registerChatTools(server: McpServer) {
  server.registerTool(
    "banana_list_chats",
    {
      title: "List Chats",
      description:
        "List all expense-tracking chats/groups in Banana Split. " +
        "Returns chat ID, title, type, base currency, and timestamps. " +
        "Use this to discover available chats before querying expenses or debts.",
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
      const chats = await trpc.chat.getAllChats.query({
        excludeTypes: exclude_types,
      });
      const text =
        chats.length === 0
          ? "No chats found."
          : chats
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
        "and whether debt simplification is enabled.",
      inputSchema: {
        chat_id: z
          .number()
          .describe(
            "The numeric chat ID. Use banana_list_chats to find chat IDs."
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
      const chat = await trpc.chat.getChat.query({ chatId: chat_id });
      const members = chat.members
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
        "optionally filtered by currencies. Returns debtor ID, creditor ID, amount, and currency.",
      inputSchema: {
        chat_id: z.number().describe("The numeric chat ID."),
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
      const result = await trpc.chat.getBulkChatDebts.query({
        chatId: chat_id,
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
      const text = result.debts
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
        "Returns simplified debts, transaction reduction stats, and member info.",
      inputSchema: {
        chat_id: z.number().describe("The numeric chat ID."),
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
        const result = await trpc.chat.getSimplifiedDebts.query({
          chatId: chat_id,
          currency,
        });
        const memberMap = new Map(
          result.chatMembers.map((m) => [
            m.id,
            m.username || m.firstName || `User ${m.id}`,
          ])
        );
        const debts = result.simplifiedDebts
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
}
