import { createTRPCRouter } from "../../trpc.js";
import getMyBalancesAcrossChats from "./getMyBalancesAcrossChats.js";
import getMySpendByMonth from "./getMySpendByMonth.js";
import getNetShare from "./getNetShare.js";
import getTotalBorrowed from "./getTotalBorrowed.js";
import getTotalLent from "./getTotalLent.js";

export const expenseShareRouter = createTRPCRouter({
  getMyBalancesAcrossChats,
  getMySpendByMonth,
  getNetShare,
  getTotalBorrowed,
  getTotalLent,
});
