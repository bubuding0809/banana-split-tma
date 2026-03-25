import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { createTrpcCaller } from "../trpc.js";
import { SplitMode } from "@dko/database";

export const listExpensesTool = createTool({
  id: "list-expenses",
  description: "Lists all expenses for the current chat.",
  inputSchema: z.object({}),
  execute: async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);
    return caller.expense.getAllExpensesByChat({ chatId });
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
    return caller.expense.getExpenseDetails({ expenseId: data.expenseId });
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
  }),
  execute: async (data, context) => {
    const { caller, chatId, telegramUserId } = createTrpcCaller(context);

    return caller.expense.createExpense({
      ...data,
      chatId,
      creatorId: telegramUserId,
    });
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
    return caller.expense.deleteExpense({ expenseId: data.expenseId });
  },
});
