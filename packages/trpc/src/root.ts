import {
  aiRouter,
  apiKeyRouter,
  awsRouter,
  chatRouter,
  currencyRouter,
  expenseRouter,
  expenseShareRouter,
  paymentRouter,
  settlementRouter,
  snapshotRouter,
  telegramRouter,
  userRouter,
  adminRouter,
} from "./routers/index.js";
import { createTRPCRouter } from "./trpc.js";

export const appRouter = createTRPCRouter({
  admin: adminRouter,
  ai: aiRouter,
  apiKey: apiKeyRouter,
  aws: awsRouter,
  chat: chatRouter,
  user: userRouter,
  telegram: telegramRouter,
  expense: expenseRouter,
  expenseShare: expenseShareRouter,
  payment: paymentRouter,
  settlement: settlementRouter,
  currency: currencyRouter,
  snapshot: snapshotRouter,
});

export type AppRouter = typeof appRouter;
