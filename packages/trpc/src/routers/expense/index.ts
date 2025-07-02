import getExpenseByChat from "./getExpenseByChat.js";
import getExpenseDetails from "./getExpenseDetails.js";
import createExpense from "./createExpense.js";
import deleteExpense from "./deleteExpense.js";
import { createTRPCRouter } from "../../trpc.js";

export const expenseRouter = createTRPCRouter({
  getExpenseByChat,
  getExpenseDetails,
  createExpense,
  deleteExpense,
});
