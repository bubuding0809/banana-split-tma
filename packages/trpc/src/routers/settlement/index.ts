import { createTRPCRouter } from "../../trpc.js";
import createSettlement from "./createSettlement.js";

export const settlementRouter = createTRPCRouter({
  createSettlement,
});
