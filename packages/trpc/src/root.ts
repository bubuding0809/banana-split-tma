import { helloRouter } from "./routers/hello.js";
import {
  chatRouter,
  expenseRouter,
  expenseShareRouter,
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
  hello: helloRouter,
});

export type AppRouter = typeof appRouter;
