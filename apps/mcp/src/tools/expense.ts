import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../client.js";
import { toolHandler } from "./utils.js";

export function registerExpenseTools(server: McpServer) {
  server.registerTool(
    "banana_list_expenses",
    {
      title: "List Expenses",
      description:
        "List all expenses in a chat, optionally filtered by currency. " +
        "Returns expense description, amount, currency, payer, date, and split details. " +
        "Ordered by date descending.",
      inputSchema: {
        chat_id: z.number().describe("The numeric chat ID."),
        currency: z
          .string()
          .length(3)
          .optional()
          .describe("Optional: filter by 3-letter currency code (e.g. 'USD')."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_list_expenses", async ({ chat_id, currency }) => {
      const expenses = await trpc.expense.getExpenseByChat.query({
        chatId: chat_id,
        currency,
      });
      if (expenses.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No expenses found." }],
        };
      }
      const text = expenses
        .map((e: any) => {
          const date = e.date
            ? new Date(e.date).toLocaleDateString()
            : "Unknown date";
          return (
            `- **${e.description || "Untitled"}** - ${e.amount} ${e.currency} ` +
            `(paid by User ${e.payerId}, ${date}) [ID: ${e.id}]`
          );
        })
        .join("\n");
      return {
        content: [
          {
            type: "text" as const,
            text: `**Expenses (${expenses.length}):**\n${text}`,
          },
        ],
      };
    })
  );

  server.registerTool(
    "banana_get_expense",
    {
      title: "Get Expense Details",
      description:
        "Get full details of a specific expense including all split/share information, " +
        "participants, payer, creator, and the chat it belongs to.",
      inputSchema: {
        expense_id: z
          .string()
          .describe("The expense UUID. Use banana_list_expenses to find IDs."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_get_expense", async ({ expense_id }) => {
      const expense = await trpc.expense.getExpenseDetails.query({
        expenseId: expense_id,
      });
      const e = expense as any;
      const shares = (e.shares || [])
        .map(
          (s: any) =>
            `  - User ${s.userId}: ${s.amount} ${e.currency} (${s.splitMode || "equal"})`
        )
        .join("\n");
      const text =
        `**${e.description || "Untitled Expense"}**\n` +
        `Amount: ${e.amount} ${e.currency}\n` +
        `Date: ${e.date ? new Date(e.date).toLocaleDateString() : "Unknown"}\n` +
        `Paid by: User ${e.payerId}\n` +
        `Created by: User ${e.creatorId}\n` +
        `Chat: ${e.chat?.title || e.chatId}\n` +
        `Split Mode: ${e.splitMode || "equal"}\n` +
        `Category: ${e.category || "None"}\n` +
        `Shares:\n${shares || "  None"}`;
      return {
        content: [{ type: "text" as const, text }],
      };
    })
  );

  server.registerTool(
    "banana_get_net_share",
    {
      title: "Get Net Share Between Users",
      description:
        "Get the net balance between two users in a specific chat and currency. " +
        "Positive means mainUser is owed money by targetUser, negative means mainUser owes.",
      inputSchema: {
        main_user_id: z
          .number()
          .describe("The user whose perspective to calculate from."),
        target_user_id: z
          .number()
          .describe("The other user in the balance calculation."),
        chat_id: z.number().describe("The chat ID to calculate within."),
        currency: z
          .string()
          .length(3)
          .describe("3-letter currency code (e.g. 'USD')."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler(
      "banana_get_net_share",
      async ({ main_user_id, target_user_id, chat_id, currency }) => {
        const netShare = await trpc.expenseShare.getNetShare.query({
          mainUserId: main_user_id,
          targetUserId: target_user_id,
          chatId: chat_id,
          currency,
        });
        const direction =
          netShare > 0
            ? `User ${target_user_id} owes User ${main_user_id}`
            : netShare < 0
              ? `User ${main_user_id} owes User ${target_user_id}`
              : "Users are settled up";
        return {
          content: [
            {
              type: "text" as const,
              text: `**Net Share:** ${Math.abs(netShare)} ${currency}\n${direction}`,
            },
          ],
        };
      }
    )
  );

  server.registerTool(
    "banana_get_totals",
    {
      title: "Get Total Borrowed and Lent",
      description:
        "Get the total amount a user has borrowed and lent in a specific chat across all currencies.",
      inputSchema: {
        user_id: z.number().describe("The user ID to check totals for."),
        chat_id: z.number().describe("The chat ID."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_get_totals", async ({ user_id, chat_id }) => {
      const [totalBorrowed, totalLent] = await Promise.all([
        trpc.expenseShare.getTotalBorrowed.query({
          userId: user_id,
          chatId: chat_id,
        }),
        trpc.expenseShare.getTotalLent.query({
          userId: user_id,
          chatId: chat_id,
        }),
      ]);
      return {
        content: [
          {
            type: "text" as const,
            text:
              `**User ${user_id} Totals in Chat ${chat_id}:**\n` +
              `Total Borrowed: ${totalBorrowed}\n` +
              `Total Lent: ${totalLent}`,
          },
        ],
      };
    })
  );
}
