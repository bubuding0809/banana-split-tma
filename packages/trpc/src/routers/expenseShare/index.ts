import { createTRPCRouter } from "../../trpc.js";
import getNetShare from "./getNetShare.js";
import getTotalBorrowed from "./getTotalBorrowed.js";
import getTotalLent from "./getTotalLent.js";

export const expenseShareRouter = createTRPCRouter({
  getNetShare,
  getTotalBorrowed,
  getTotalLent,
});
