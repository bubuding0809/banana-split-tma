import { Context } from "grammy";
import { appRouter } from "@dko/trpc";

export type AppCaller = ReturnType<typeof appRouter.createCaller>;

export interface BotContext extends Context {
  trpc: AppCaller;
}
