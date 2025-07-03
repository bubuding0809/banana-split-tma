import { initTRPC, TRPCError } from "@trpc/server";
import { prisma } from "@dko/database";
import superjson from "superjson";
import type { OpenApiMeta } from "trpc-to-openapi";
import { Telegram } from "telegraf";
import {
  validate as validateInitData,
  parse as parseInitData,
  User as TelegramUser,
} from "@telegram-apps/init-data-node";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

import "telegraf/types"; // Required to ensure types are portable

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
const createTRPCContext = ({
  botToken,
  ...rest
}: Record<string, unknown> & {
  botToken: string;
}) => {
  return {
    db: prisma as typeof prisma,
    teleBot: new Telegram(botToken),
    request: rest.req,
    response: rest.res,
    info: rest.info,
  };
};

export const withCreateTRPCContext = (
  env: Readonly<{
    [key: string]: string;
  }>
) => {
  return (expressContext: CreateExpressContextOptions) =>
    createTRPCContext({
      ...expressContext,
      botToken: env.TELEGRAM_BOT_TOKEN || "",
    });
};

export type Db = ReturnType<typeof createTRPCContext>["db"];

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC
  .context<typeof createTRPCContext>()
  .meta<OpenApiMeta>()
  .create({
    transformer: superjson,
    isServer: true,
  });

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const req = ctx.request as CreateExpressContextOptions["req"];
  const { headers } = req;
  const apiKey = headers["x-api-key"];
  const authorization = headers["authorization"];

  let user: TelegramUser | null = null;
  let authType: "api-key" | "telegram" = "api-key";

  // Check for API key authentication
  if (apiKey) {
    const validApiKey = process.env.API_KEY;
    if (!validApiKey || apiKey !== validApiKey) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid API key",
      });
    }
  }
  // Check for Telegram authentication
  else if (authorization) {
    const parts = authorization.split(" ");
    if (parts.length !== 2 || parts[0] !== "tma") {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid authorization format. Expected: 'tma <initData>'",
      });
    }

    const initData = parts[1];
    if (!initData) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Missing initData in authorization header",
      });
    }
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Bot token not configured",
      });
    }

    try {
      // Validate the Telegram initData
      if (!botToken) {
        throw new Error("Bot token is required but not available");
      }
      validateInitData(initData, botToken);

      user = parseInitData(initData).user ?? null;
      authType = "telegram";
    } catch (error) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid Telegram authentication",
      });
    }
  }
  // No authentication provided
  else {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "Authentication required. Provide either X-Api-Key header or Authorization header with Telegram initData",
    });
  }

  console.info(`Authenticated via ${authType}`);
  if (authType === "telegram") {
    console.info(
      `Authenticated user: ${user?.id} (${user?.username || "no username"})`
    );
  }

  return next({
    ctx: {
      session: {
        user,
        authType,
      },
    },
  });
});
