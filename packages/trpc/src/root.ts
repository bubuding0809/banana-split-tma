import {
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
import { categoryRouter } from "./routers/category/index.js";
import { createTRPCRouter } from "./trpc.js";

export const appRouter = createTRPCRouter({
  admin: adminRouter,
  apiKey: apiKeyRouter,
  aws: awsRouter,
  category: categoryRouter,
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
