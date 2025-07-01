import {
  chatRouter,
  expenseRouter,
  expenseShareRouter,
  settlementRouter,
  telegramRouter,
  userRouter,
} from "./routers/index.js";
import { createTRPCRouter } from "./trpc.js";

export const appRouter = createTRPCRouter({
  chat: chatRouter,
  user: userRouter,
  telegram: telegramRouter,
  expense: expenseRouter,
  expenseShare: expenseShareRouter,
  settlement: settlementRouter,
});

export type AppRouter = typeof appRouter;
