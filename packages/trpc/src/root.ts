import {
  aiRouter,
  awsRouter,
  chatRouter,
  currencyRouter,
  expenseRouter,
  expenseShareRouter,
  settlementRouter,
  snapshotRouter,
  telegramRouter,
  userRouter,
} from "./routers/index.js";
import { createTRPCRouter } from "./trpc.js";

export const appRouter = createTRPCRouter({
  ai: aiRouter,
  aws: awsRouter,
  chat: chatRouter,
  user: userRouter,
  telegram: telegramRouter,
  expense: expenseRouter,
  expenseShare: expenseShareRouter,
  settlement: settlementRouter,
  currency: currencyRouter,
  snapshot: snapshotRouter,
});

export type AppRouter = typeof appRouter;
