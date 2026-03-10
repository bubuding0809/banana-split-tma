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

  server.registerTool(
    "banana_create_settlement",
    {
      title: "Create Settlement",
      description:
        "Records a debt settlement/payment between two users. " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        chat_id: z
          .number()
          .optional()
          .describe(
            "The numeric chat ID. Optional if using a chat-scoped API key."
          ),
        sender_id: z.number().describe("The user ID who is paying the debt"),
        receiver_id: z
          .number()
          .describe("The user ID who is receiving the payment"),
        amount: z.number().positive().describe("The amount being paid"),
        currency: z
          .string()
          .length(3)
          .optional()
          .describe(
            "Optional 3-letter currency code. Defaults to chat base currency."
          ),
        description: z
          .string()
          .max(255)
          .optional()
          .describe("Optional note about the settlement"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    toolHandler(
      "banana_create_settlement",
      async ({
        chat_id,
        sender_id,
        receiver_id,
        amount,
        currency,
        description,
      }) => {
        const resolvedChatId = await resolveChatId(chat_id);

        // Fetch chat members to get names for the notification
        const chat = await trpc.chat.getChat.query({
          chatId: resolvedChatId,
        });
        const members = chat.members ?? [];
        const creditor = members.find(
          (m: { id: number }) => m.id === receiver_id
        );
        const debtor = members.find((m: { id: number }) => m.id === sender_id);

        const settlement = await trpc.settlement.createSettlement.mutate({
          chatId: resolvedChatId,
          senderId: sender_id,
          receiverId: receiver_id,
          amount,
          currency,
          description,
          sendNotification: true,
          creditorName: creditor?.firstName ?? `User ${receiver_id}`,
          creditorUsername: creditor?.username ?? undefined,
          debtorName: debtor?.firstName ?? `User ${sender_id}`,
          threadId: chat.threadId ?? undefined,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Successfully recorded settlement! User ${settlement.senderId} paid User ${settlement.receiverId} ${settlement.amount} ${settlement.currency}.\nSettlement ID: ${settlement.id}`,
            },
          ],
        };
      }
    )
  );
}
