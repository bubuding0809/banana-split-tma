import { initTRPC } from "@trpc/server";
import { prisma } from "@dko/database";
import superjson from "superjson";
import TelegramBot from "node-telegram-bot-api";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
const createTRPCContext = ({ botToken }: { botToken: string }) => ({
  db: prisma as typeof prisma,
  teleBot: new TelegramBot(botToken),
});
export const withCreateTRPCContext = (
  env: Readonly<{
    [key: string]: string;
  }>
) => {
  return () => createTRPCContext({ botToken: env.TELEGRAM_BOT_TOKEN || "" });
};

export type Db = ReturnType<typeof createTRPCContext>["db"];

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
