import { Agent } from "@mastra/core/agent";
import { google } from "@ai-sdk/google";
import { memory } from "./memory.js";
import {
  getChatDetailsTool,
  listCurrenciesTool,
  getSnapshotTool,
  listExpensesTool,
  getExpenseDetailsTool,
  createExpenseTool,
  deleteExpenseTool,
  getNetShareTool,
  getTotalsTool,
  sendGroupReminderTool,
  sendDebtReminderTool,
} from "./tools/index.js";

export const bananaAgent = new Agent({
  id: "bananaAgent",
  name: "BananaAgent",
  instructions:
    "You are a helpful Telegram expense tracker bot. You help users manage their shared expenses, settle debts, and keep track of balances.",
  memory,
  model: google("gemini-3.1-flash-image-preview"),
  tools: {
    getChatDetailsTool,
    listCurrenciesTool,
    getSnapshotTool,
    listExpensesTool,
    getExpenseDetailsTool,
    createExpenseTool,
    deleteExpenseTool,
    getNetShareTool,
    getTotalsTool,
    sendGroupReminderTool,
    sendDebtReminderTool,
  },
});
