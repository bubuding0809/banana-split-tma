import getExpenseByChat from "./getExpenseByChat.js";
import getAllExpensesByChat from "./getAllExpensesByChat.js";
import getExpenseDetails from "./getExpenseDetails.js";
import createExpense from "./createExpense.js";
import createExpenseWithRecurrence from "./createExpenseWithRecurrence.js";
import createExpensesBulk from "./createExpensesBulk.js";
import updateExpense from "./updateExpense.js";
import updateExpensesBulk from "./updateExpensesBulk.js";
import deleteExpense from "./deleteExpense.js";
import convertCurrencyBulk from "./convertCurrencyBulk.js";
import sendBatchExpenseSummary from "./sendBatchExpenseSummary.js";
import attachTelegramMessage from "./attachTelegramMessage.js";
import { createTRPCRouter } from "../../trpc.js";
import { recurringRouter } from "./recurring/index.js";

export const expenseRouter = createTRPCRouter({
  getExpenseByChat,
  getAllExpensesByChat,
  getExpenseDetails,
  createExpense,
  createExpenseWithRecurrence,
  createExpensesBulk,
  updateExpense,
  updateExpensesBulk,
  deleteExpense,
  convertCurrencyBulk,
  sendBatchExpenseSummary,
  attachTelegramMessage,
  recurring: recurringRouter,
});
