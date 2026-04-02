import { Agent } from "@mastra/core/agent";
import { getAgentModel } from "./provider.js";
import { memory } from "./memory.js";
import {
  getChatDetailsTool,
  getDebtsTool,
  getSimplifiedDebtsTool,
  updateChatSettingsTool,
  listCurrenciesTool,
  getExchangeRateTool,
  listSnapshotsTool,
  getSnapshotTool,
  createSnapshotTool,
  updateSnapshotTool,
  deleteSnapshotTool,
  listExpensesTool,
  getExpenseDetailsTool,
  createExpenseTool,
  updateExpenseTool,
  bulkImportExpensesTool,
  deleteExpenseTool,
  getNetShareTool,
  getTotalsTool,
  listSettlementsTool,
  createSettlementTool,
  deleteSettlementTool,
  settleAllDebtsTool,
  sendGroupReminderTool,
  sendDebtReminderTool,
} from "./tools/index.js";

export const bananaAgent = new Agent({
  id: "bananaAgent",
  name: "BananaAgent",
  instructions:
    "You are a helpful Telegram expense tracker bot. You help users manage their shared expenses, settle debts, and keep track of balances.",
  memory,
  model: getAgentModel() as any,
  tools: {
    getChatDetailsTool,
    getDebtsTool,
    getSimplifiedDebtsTool,
    updateChatSettingsTool,

    listCurrenciesTool,
    getExchangeRateTool,

    listSnapshotsTool,
    getSnapshotTool,
    createSnapshotTool,
    updateSnapshotTool,
    deleteSnapshotTool,

    listExpensesTool,
    getExpenseDetailsTool,
    createExpenseTool,
    updateExpenseTool,
    bulkImportExpensesTool,
    deleteExpenseTool,

    getNetShareTool,
    getTotalsTool,
    listSettlementsTool,
    createSettlementTool,
    deleteSettlementTool,
    settleAllDebtsTool,

    sendGroupReminderTool,
    sendDebtReminderTool,
  },
});
