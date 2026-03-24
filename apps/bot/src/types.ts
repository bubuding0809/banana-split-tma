import { Context, SessionFlavor } from "grammy";
import { appRouter } from "@dko/trpc";

export type AppCaller = ReturnType<typeof appRouter.createCaller>;

export interface SessionData {
  addMemberGroupId?: string;
}

export type BotContext = Context &
  SessionFlavor<SessionData> & {
    trpc: AppCaller;
  };
