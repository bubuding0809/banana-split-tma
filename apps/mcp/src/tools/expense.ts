import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TrpcClient } from "../client.js";
import { toolHandler } from "./utils.js";
import { resolveChatId } from "../scope.js";

export function registerExpenseTools(server: McpServer, trpc: TrpcClient) {
  server.registerTool(
    "banana_list_expenses",
    {
      title: "List Expenses",
      description:
        "List all expenses in a chat, optionally filtered by currency. " +
        "Returns expense description, amount, currency, payer, date, and split details. " +
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
      const resolvedChatId = await resolveChatId(trpc, chat_id);
      const expenses = await trpc.expense.getExpenseByChat.query({
        chatId: resolvedChatId,
        currency,
      });
      if (expenses.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No expenses found." }],
        };
      }
      const text = expenses
        .map((e) => {
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
      if (!expense || !(expense as any).id) {
        return {
          content: [{ type: "text" as const, text: "Expense not found." }],
        };
      }
      // Using `as any` because the backend inconsistently types BigInt conversions
      // (some fields are `number`, others remain `BigInt`). Since MCP output is
      // text-formatted, the toString coercion is acceptable here.
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
        "Positive means mainUser is owed money by targetUser, negative means mainUser owes. " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        main_user_id: z
          .number()
          .describe("The user whose perspective to calculate from."),
        target_user_id: z
          .number()
          .describe("The other user in the balance calculation."),
        chat_id: z
          .number()
          .optional()
          .describe("The chat ID. Optional if using a chat-scoped API key."),
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
        const resolvedChatId = await resolveChatId(trpc, chat_id);
        const netShare = await trpc.expenseShare.getNetShare.query({
          mainUserId: main_user_id,
          targetUserId: target_user_id,
          chatId: resolvedChatId,
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
        "Get the total amount a user has borrowed and lent in a specific chat. " +
        "Returns aggregate totals as numbers (not broken down by currency). " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        user_id: z.number().describe("The user ID to check totals for."),
        chat_id: z
          .number()
          .optional()
          .describe("The chat ID. Optional if using a chat-scoped API key."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_get_totals", async ({ user_id, chat_id }) => {
      const resolvedChatId = await resolveChatId(trpc, chat_id);
      const [totalBorrowed, totalLent] = await Promise.all([
        trpc.expenseShare.getTotalBorrowed.query({
          userId: user_id,
          chatId: resolvedChatId,
        }),
        trpc.expenseShare.getTotalLent.query({
          userId: user_id,
          chatId: resolvedChatId,
        }),
      ]);
      return {
        content: [
          {
            type: "text" as const,
            text:
              `**User ${user_id} Totals in Chat ${resolvedChatId}:**\n` +
              `Total Borrowed: ${totalBorrowed}\n` +
              `Total Lent: ${totalLent}`,
          },
        ],
      };
    })
  );

  server.registerTool(
    "banana_create_expense",
    {
      title: "Create Expense",
      description:
        "Creates a new expense with automatic split calculation based on split mode. " +
        "chat_id is optional if using a chat-scoped API key. " +
        "If exact/percentage/shares split mode is used, custom_splits array MUST be provided.",
      inputSchema: {
        chat_id: z
          .number()
          .optional()
          .describe(
            "The numeric chat ID. Optional if using a chat-scoped API key."
          ),
        creator_id: z.number().describe("The user ID creating the expense"),
        payer_id: z.number().describe("The user ID who paid the expense"),
        description: z
          .string()
          .min(1)
          .max(60)
          .describe("Short description of the expense"),
        amount: z
          .number()
          .positive()
          .describe("The total amount of the expense"),
        currency: z
          .string()
          .length(3)
          .optional()
          .describe(
            "Optional 3-letter currency code. Defaults to chat base currency."
          ),
        split_mode: z
          .enum(["EQUAL", "EXACT", "PERCENTAGE", "SHARES"])
          .describe("How to split the expense"),
        participant_ids: z
          .array(z.number())
          .min(1)
          .describe("List of user IDs participating in the split"),
        custom_splits: z
          .array(
            z.object({
              userId: z.number(),
              amount: z.number().positive(),
            })
          )
          .optional()
          .describe(
            "Required if split_mode is not EQUAL. For EXACT, amount is exact currency value. For PERCENTAGE, amount is percentage (e.g. 50). For SHARES, amount is number of shares."
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
      "banana_create_expense",
      async ({
        chat_id,
        creator_id,
        payer_id,
        description,
        amount,
        currency,
        split_mode,
        participant_ids,
        custom_splits,
      }) => {
        const resolvedChatId = await resolveChatId(trpc, chat_id);
        const expense = await trpc.expense.createExpense.mutate({
          chatId: resolvedChatId,
          creatorId: creator_id,
          payerId: payer_id,
          description,
          amount,
          currency,
          splitMode: split_mode as "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES",
          participantIds: participant_ids,
          customSplits: custom_splits,
          sendNotification: true,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Successfully created expense '${expense.description}' for ${expense.amount} ${expense.currency}!\nExpense ID: ${expense.id}`,
            },
          ],
        };
      }
    )
  );

  server.registerTool(
    "banana_delete_expense",
    {
      title: "Delete Expense",
      description: "Delete a specific expense by ID.",
      inputSchema: {
        expense_id: z.string().describe("The expense UUID to delete."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    toolHandler("banana_delete_expense", async ({ expense_id }) => {
      const result = await trpc.expense.deleteExpense.mutate({
        expenseId: expense_id,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `✅ ${result.message}`,
          },
        ],
      };
    })
  );
}
