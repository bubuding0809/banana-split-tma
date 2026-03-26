import { serializeToolResult } from "../serialize.js";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createTrpcCaller } from "../trpc.js";
import { withToolErrorHandling } from "../utils.js";

export const getNetShareTool = createTool({
  id: "getNetShare",
  description:
    "Get the net share balance between the current user and a target user for a specific currency.",
  inputSchema: z.object({
    targetUserId: z
      .number()
      .describe("The user ID of the person to check the balance against."),
    currency: z
      .string()
      .min(3)
      .max(3)
      .describe("The 3-letter currency code (e.g., USD, SGD)."),
  }),
  execute: withToolErrorHandling(async (data, context) => {
    const { caller, telegramUserId, chatId } = createTrpcCaller(context);

    const balance = await caller.expenseShare.getNetShare({
      mainUserId: telegramUserId,
      targetUserId: data.targetUserId,
      chatId,
      currency: data.currency,
    });

    return serializeToolResult({ balance });
  }),
});

export const getTotalsTool = createTool({
  id: "getTotals",
  description:
    "Get the total amount borrowed and lent by the current user across all expenses in the chat.",
  inputSchema: z.object({}),
  execute: withToolErrorHandling(async (data, context) => {
    const { caller, telegramUserId, chatId } = createTrpcCaller(context);

    const [borrowed, lent] = await Promise.all([
      caller.expenseShare.getTotalBorrowed({ userId: telegramUserId, chatId }),
      caller.expenseShare.getTotalLent({ userId: telegramUserId, chatId }),
    ]);

    return serializeToolResult({ borrowed, lent });
  }),
});

export const listSettlementsTool = createTool({
  id: "listSettlementsTool",
  description: "List all debt settlements in a chat.",
  inputSchema: z.object({
    currency: z
      .string()
      .optional()
      .describe("Filter by 3-letter currency code"),
  }),
  execute: withToolErrorHandling(async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);
    const result = await caller.settlement.getSettlementByChat({
      chatId,
      currency: data.currency,
    });
    return serializeToolResult(result);
  }),
});

export const createSettlementTool = createTool({
  id: "createSettlementTool",
  description: "Record a debt settlement/payment between two users.",
  inputSchema: z.object({
    senderId: z.number().describe("The user ID who is paying the debt"),
    receiverId: z.number().describe("The user ID who is receiving the payment"),
    amount: z.number().positive().describe("The amount being paid"),
    currency: z
      .string()
      .optional()
      .describe("3-letter currency code (defaults to chat base currency)"),
    description: z
      .string()
      .optional()
      .describe("Optional note about the settlement"),
  }),
  execute: withToolErrorHandling(async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);

    const chat = await caller.chat.getChat({ chatId });
    const members = chat.members ?? [];
    const creditor = members.find(
      (m: { id: number }) => m.id === data.receiverId
    );
    const debtor = members.find((m: { id: number }) => m.id === data.senderId);

    const result = await caller.settlement.createSettlement({
      chatId,
      senderId: data.senderId,
      receiverId: data.receiverId,
      amount: data.amount,
      currency: data.currency,
      description: data.description,
      sendNotification: true,
      creditorName: creditor?.firstName ?? `User ${data.receiverId}`,
      creditorUsername: creditor?.username ?? undefined,
      debtorName: debtor?.firstName ?? `User ${data.senderId}`,
      threadId: chat.threadId ?? undefined,
    });
    return serializeToolResult(result);
  }),
});

export const deleteSettlementTool = createTool({
  id: "deleteSettlementTool",
  description: "Delete a settlement by ID.",
  inputSchema: z.object({
    settlementId: z.string().describe("The settlement UUID"),
  }),
  execute: withToolErrorHandling(async (data, context) => {
    const { caller } = createTrpcCaller(context);
    const result = await caller.settlement.deleteSettlement({
      settlementId: data.settlementId,
    });
    return serializeToolResult(result);
  }),
});

export const settleAllDebtsTool = createTool({
  id: "settleAllDebtsTool",
  description: "Settle all debts between two users across multiple currencies.",
  inputSchema: z.object({
    senderId: z.number().describe("The user ID paying the debt"),
    receiverId: z.number().describe("The user ID receiving the payment"),
    balances: z
      .array(
        z.object({
          currency: z.string().describe("3-letter currency code"),
          amount: z.number().describe("The amount being paid"),
        })
      )
      .describe("List of balances to settle"),
  }),
  execute: withToolErrorHandling(async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);

    const chat = await caller.chat.getChat({ chatId });
    const members = chat.members ?? [];
    const creditor = members.find(
      (m: { id: number }) => m.id === data.receiverId
    );
    const debtor = members.find((m: { id: number }) => m.id === data.senderId);

    const result = await caller.settlement.settleAllDebts({
      chatId,
      senderId: data.senderId,
      receiverId: data.receiverId,
      balances: data.balances,
      creditorName: creditor?.firstName ?? `User ${data.receiverId}`,
      creditorUsername: creditor?.username ?? undefined,
      debtorName: debtor?.firstName ?? `User ${data.senderId}`,
      threadId: chat.threadId ?? undefined,
    });
    return serializeToolResult(result);
  }),
});
