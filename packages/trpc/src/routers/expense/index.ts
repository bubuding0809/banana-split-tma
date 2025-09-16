import getExpenseByChat from "./getExpenseByChat.js";
import getAllExpensesByChat from "./getAllExpensesByChat.js";
import getExpenseDetails from "./getExpenseDetails.js";
import createExpense from "./createExpense.js";
import updateExpense from "./updateExpense.js";
import deleteExpense from "./deleteExpense.js";
import convertCurrencyBulk from "./convertCurrencyBulk.js";
import { createTRPCRouter } from "../../trpc.js";

export const expenseRouter = createTRPCRouter({
  getExpenseByChat,
  getAllExpensesByChat,
  getExpenseDetails,
  createExpense,
  updateExpense,
  deleteExpense,
  convertCurrencyBulk,
});
