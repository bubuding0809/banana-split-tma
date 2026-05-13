import { createTRPCRouter } from "../../trpc.js";
import getMyBalancesAcrossChats from "./getMyBalancesAcrossChats.js";
import getMyCounterpartyBalances from "./getMyCounterpartyBalances.js";
import getMySpendByMonth from "./getMySpendByMonth.js";
import getNetShare from "./getNetShare.js";
import getTotalBorrowed from "./getTotalBorrowed.js";
import getTotalLent from "./getTotalLent.js";
import settleAllWithUser from "./settleAllWithUser.js";

export const expenseShareRouter = createTRPCRouter({
  getMyBalancesAcrossChats,
  getMyCounterpartyBalances,
  getMySpendByMonth,
  getNetShare,
  getTotalBorrowed,
  getTotalLent,
  settleAllWithUser,
});
