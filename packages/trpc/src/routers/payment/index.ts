import { createTRPCRouter } from "../../trpc.js";
import generatePayNowQR from "./generatePayNowQR.js";

export const paymentRouter = createTRPCRouter({
  generatePayNowQR,
});
