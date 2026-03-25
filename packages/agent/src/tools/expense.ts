import { serializeToolResult } from "../serialize.js";
import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { createTrpcCaller } from "../trpc.js";
import { SplitMode } from "@dko/database";

export const listExpensesTool = createTool({
  id: "list-expenses",
  description: "Lists all expenses for the current chat.",
  inputSchema: z.object({
    currency: z
      .string()
      .optional()
      .describe("Filter by 3-letter currency code (e.g. USD)"),
  }),
  execute: async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);
    return serializeToolResult(
      await caller.expense.getExpenseByChat({ chatId, currency: data.currency })
    );
  },
});

export const getExpenseDetailsTool = createTool({
  id: "get-expense-details",
  description: "Get detailed information about a specific expense by ID.",
  inputSchema: z.object({
    expenseId: z.string().describe("The ID of the expense to retrieve"),
  }),
  execute: async (data, context) => {
    const { caller } = createTrpcCaller(context);
    return serializeToolResult(
      await caller.expense.getExpenseDetails({ expenseId: data.expenseId })
    );
  },
});

export const createExpenseTool = createTool({
  id: "create-expense",
  description: "Creates a new expense in the current chat.",
  inputSchema: z.object({
    description: z
      .string()
      .describe("Short description of what the expense was for"),
    amount: z.number().positive().describe("The total amount of the expense"),
    currency: z
      .string()
      .optional()
      .describe(
        "Currency code (e.g., USD, EUR). Defaults to chat base currency if not provided"
      ),
    splitMode: z
      .nativeEnum(SplitMode)
      .describe(
        "How the expense should be split: EQUAL, EXACT, PERCENTAGE, or SHARES"
      ),
    participantIds: z
      .array(z.number())
      .min(1)
      .describe(
        "List of Telegram User IDs for the participants involved in the expense"
      ),
    customSplits: z
      .array(
        z.object({
          userId: z.number().describe("Telegram User ID of the participant"),
          amount: z
            .number()
            .describe(
              "The split amount, percentage, or shares (depending on splitMode)"
            ),
        })
      )
      .optional()
      .describe(
        "Required if splitMode is EXACT, PERCENTAGE, or SHARES. Array of objects specifying each participant's portion."
      ),
    payerId: z
      .number()
      .describe("Telegram User ID of the person who paid the expense"),
    date: z.coerce
      .date()
      .optional()
      .describe("Date of the expense (defaults to now)"),
  }),
  execute: async (data, context) => {
    const { caller, chatId, telegramUserId } = createTrpcCaller(context);

    return serializeToolResult(
      await caller.expense.createExpense({
        ...data,
        chatId,
        creatorId: telegramUserId,
        sendNotification: true,
      })
    );
  },
});

export const updateExpenseTool = createTool({
  id: "update-expense",
  description: "Updates an existing expense.",
  inputSchema: z.object({
    expenseId: z.string().describe("The ID of the expense to update"),
    description: z
      .string()
      .describe("Short description of what the expense was for"),
    amount: z.number().positive().describe("The total amount of the expense"),
    currency: z.string().optional().describe("Currency code"),
    splitMode: z
      .nativeEnum(SplitMode)
      .describe("How the expense should be split"),
    participantIds: z
      .array(z.number())
      .min(1)
      .describe("List of Telegram User IDs for the participants"),
    customSplits: z
      .array(
        z.object({
          userId: z.number().describe("Telegram User ID of the participant"),
          amount: z
            .number()
            .describe("The split amount, percentage, or shares"),
        })
      )
      .optional()
      .describe("Required if splitMode is EXACT, PERCENTAGE, or SHARES"),
    payerId: z
      .number()
      .describe("Telegram User ID of the person who paid the expense"),
    date: z.coerce.date().optional().describe("Date of the expense"),
  }),
  execute: async (data, context) => {
    const { caller, chatId, telegramUserId } = createTrpcCaller(context);

    return serializeToolResult(
      await caller.expense.updateExpense({
        ...data,
        chatId,
        creatorId: telegramUserId,
        sendNotification: true,
      })
    );
  },
});

export const bulkImportExpensesTool = createTool({
  id: "bulk-import-expenses",
  description:
    "Import multiple expenses. Each entry mirrors create-expense options.",
  inputSchema: z.object({
    expenses: z
      .array(
        z.object({
          payerId: z.number().describe("Telegram User ID who paid"),
          creatorId: z
            .number()
            .optional()
            .describe("Telegram User ID who created the expense"),
          description: z.string().describe("Description of the expense"),
          amount: z.number().positive().describe("Total amount"),
          currency: z.string().optional().describe("Currency code"),
          splitMode: z.nativeEnum(SplitMode).describe("Split mode"),
          participantIds: z
            .array(z.number())
            .min(1)
            .describe("List of Telegram User IDs for the participants"),
          customSplits: z
            .array(
              z.object({
                userId: z.number(),
                amount: z.number(),
              })
            )
            .optional()
            .describe("Custom splits"),
          date: z.coerce.date().optional().describe("Date of the expense"),
        })
      )
      .min(1)
      .describe("Array of expenses to import"),
  }),
  execute: async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);
    return serializeToolResult(
      await caller.expense.createExpensesBulk({
        chatId,
        expenses: data.expenses,
      })
    );
  },
});

export const deleteExpenseTool = createTool({
  id: "delete-expense",
  description: "Deletes an expense from the current chat.",
  inputSchema: z.object({
    expenseId: z.string().describe("The ID of the expense to delete"),
  }),
  execute: async (data, context) => {
    const { caller } = createTrpcCaller(context);
    return serializeToolResult(
      await caller.expense.deleteExpense({ expenseId: data.expenseId })
    );
  },
});
