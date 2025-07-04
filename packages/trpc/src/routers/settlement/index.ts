import { createTRPCRouter } from "../../trpc.js";
import createSettlement from "./createSettlement.js";
import getSettlementByChat from "./getSettlementByChat.js";

export const settlementRouter = createTRPCRouter({
  createSettlement,
  getSettlementByChat,
});
