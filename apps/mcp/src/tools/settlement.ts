import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../client.js";
import { toolHandler } from "./utils.js";
import { resolveChatId } from "../scope.js";

export function registerSettlementTools(server: McpServer) {
  server.registerTool(
    "banana_list_settlements",
    {
      title: "List Settlements",
      description:
        "List all debt settlements in a chat, optionally filtered by currency. " +
        "Shows who paid whom, amount, currency, and date. " +
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
          .optional()
          .describe("Optional: filter by 3-letter currency code."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_list_settlements", async ({ chat_id, currency }) => {
      const resolvedChatId = await resolveChatId(chat_id);
      const settlements = await trpc.settlement.getSettlementByChat.query({
        chatId: resolvedChatId,
        currency,
      });
      if (settlements.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No settlements found." }],
        };
      }
      const text = settlements
        .map((s) => {
          const date = s.date
            ? new Date(s.date).toLocaleDateString()
            : "Unknown date";
          return `- User ${s.senderId} paid User ${s.receiverId}: ${s.amount} ${s.currency} (${date}) [ID: ${s.id}]`;
        })
        .join("\n");
      return {
        content: [
          {
            type: "text" as const,
            text: `**Settlements (${settlements.length}):**\n${text}`,
          },
        ],
      };
    })
  );
}
