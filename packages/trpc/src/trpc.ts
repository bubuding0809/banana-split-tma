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
import crypto from "node:crypto";
import { createLogger, getRequestId, type Logger } from "@repo/logger";

import "telegraf/types"; // Required to ensure types are portable

export const trpcLogger = createLogger("lambda");

// These codes have explicit warn-level log lines emitted by the
// auth middleware before rethrow (auth.initData.failed,
// auth.apiKey.invalid, auth.apiKey.revoked) or are expected client
// errors (NOT_FOUND for new users, BAD_REQUEST for input validation).
// Re-emitting them at error level here would inflate the documented
// "procedure-error spike" monitor (level=50) with routine traffic.
const SELF_LOGGED_OR_EXPECTED_CODES = new Set<string>([
  "NOT_FOUND",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "BAD_REQUEST",
]);

type SessionCtx = {
  session?: {
    user?: { id?: number | bigint };
    chatId?: bigint | null;
  };
};

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
  const requestId = getRequestId();
  const log: Logger = trpcLogger.child({ request_id: requestId });
  return {
    db: prisma as typeof prisma,
    teleBot: new Telegram(botToken),
    request: rest.req,
    response: rest.res,
    info: rest.info,
    log,
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
    errorFormatter({ shape, error, ctx, path }) {
      const requestId = getRequestId();
      const sessionCtx = ctx as unknown as SessionCtx | undefined;
      // Skip codes that are either expected client errors (NOT_FOUND for
      // new users, BAD_REQUEST for input validation) or already self-logged
      // at warn level by the auth middleware (UNAUTHORIZED, FORBIDDEN).
      // Re-emitting them at error level here would inflate the documented
      // "procedure-error spike" monitor with routine traffic.
      if (!SELF_LOGGED_OR_EXPECTED_CODES.has(error.code)) {
        trpcLogger.error(
          {
            err: error.cause ?? error,
            code: error.code,
            procedure: path,
            request_id: requestId,
            user_id: sessionCtx?.session?.user?.id?.toString(),
            chat_id: sessionCtx?.session?.chatId?.toString(),
          },
          "trpc.procedure.error"
        );
      }
      return {
        ...shape,
        data: {
          ...shape.data,
          requestId,
        },
      };
    },
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
  const agentKey = headers["x-agent-key"];
  const agentUserId = headers["x-agent-user-id"];
  const agentChatId = headers["x-agent-chat-id"];

  let user: TelegramUser | null = null;
  let authType:
    | "superadmin"
    | "chat-api-key"
    | "user-api-key"
    | "telegram"
    | "agent" = "superadmin";
  let chatId: bigint | null = null;

  // Check for internal agent authentication
  if (agentKey && process.env.INTERNAL_AGENT_KEY) {
    const validAgentKey = process.env.INTERNAL_AGENT_KEY;
    // Hash both to prevent timing attacks and length mismatch crashes
    const expectedHash = crypto
      .createHash("sha256")
      .update(validAgentKey)
      .digest();
    const providedHash = crypto
      .createHash("sha256")
      .update(agentKey as string)
      .digest();

    if (crypto.timingSafeEqual(expectedHash, providedHash)) {
      if (!agentUserId || !agentChatId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Agent request missing user or chat context",
        });
      }

      let parsedChatId: bigint;
      let parsedUserId: number;

      try {
        parsedChatId = BigInt(agentChatId as string);
        parsedUserId = Number(agentUserId);
        if (isNaN(parsedUserId)) {
          throw new Error("Invalid user ID format");
        }
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid agent user or chat ID format",
        });
      }

      authType = "agent";
      chatId = parsedChatId;
      user = {
        id: parsedUserId,
        first_name: "Agent Impersonator",
      } as TelegramUser;
    } else {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid agent key",
      });
    }
  }
  // Check for API key authentication
  else if (apiKey) {
    const validApiKey = process.env.API_KEY;

    // Path 1: Superadmin key (existing env-based API key)
    if (
      validApiKey &&
      validApiKey.length === (apiKey as string).length &&
      crypto.timingSafeEqual(
        Buffer.from(validApiKey),
        Buffer.from(apiKey as string)
      )
    ) {
      authType = "superadmin";

      // Also parse Telegram user identity when Authorization header is present
      // alongside x-api-key (common in dev where both headers are sent).
      // This populates `user` so endpoints can identify the caller.
      if (authorization) {
        const parts = authorization.split(" ");
        if (parts.length === 2 && parts[0] === "tma" && parts[1]) {
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          if (botToken) {
            try {
              validateInitData(parts[1], botToken);
              user = parseInitData(parts[1]).user ?? null;
            } catch {
              // Ignore - API key is the primary auth method
            }
          }
        }
      }
    }
    // Path 2: Chat-scoped key (hashed lookup in DB)
    else {
      const keyHash = crypto
        .createHash("sha256")
        .update(apiKey as string)
        .digest("hex");

      const chatApiKey = await ctx.db.chatApiKey.findUnique({
        where: { keyHash },
      });

      if (chatApiKey) {
        if (chatApiKey.revokedAt !== null) {
          trpcLogger.warn(
            {
              request_id: getRequestId(),
              reason: "chat_api_key_revoked",
              chat_id: chatApiKey.chatId.toString(),
            },
            "auth.apiKey.revoked"
          );
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "API key has been revoked",
          });
        }
        authType = "chat-api-key";
        chatId = chatApiKey.chatId;
      } else {
        const userApiKey = await ctx.db.userApiKey.findUnique({
          where: { keyHash },
          include: { user: true },
        });

        if (userApiKey) {
          if (userApiKey.revokedAt !== null) {
            trpcLogger.warn(
              {
                request_id: getRequestId(),
                reason: "user_api_key_revoked",
                user_id: userApiKey.user.id.toString(),
              },
              "auth.apiKey.revoked"
            );
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "API key has been revoked",
            });
          }
          authType = "user-api-key";
          user = {
            id: Number(userApiKey.user.id),
            first_name: userApiKey.user.firstName,
            last_name: userApiKey.user.lastName || undefined,
            username: userApiKey.user.username || undefined,
          };
        } else {
          trpcLogger.warn(
            {
              request_id: getRequestId(),
              reason: "invalid_api_key",
            },
            "auth.apiKey.invalid"
          );
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid API key",
          });
        }
      }
    }
  }
  // Check for Telegram authentication
  else if (authorization) {
    const parts = authorization.split(" ");
    if (parts.length !== 2 || parts[0] !== "tma") {
      trpcLogger.warn(
        { request_id: getRequestId(), reason: "malformed_auth_format" },
        "auth.initData.failed"
      );
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid authorization format. Expected: 'tma <initData>'",
      });
    }

    const initData = parts[1];
    if (!initData) {
      trpcLogger.warn(
        { request_id: getRequestId(), reason: "missing_init_data" },
        "auth.initData.failed"
      );
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
      if (!botToken) {
        throw new Error("Bot token is required but not available");
      }
      validateInitData(initData, botToken);

      user = parseInitData(initData).user ?? null;
      authType = "telegram";
    } catch (error) {
      trpcLogger.warn(
        {
          err: error,
          request_id: getRequestId(),
        },
        "auth.initData.failed"
      );
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid Telegram authentication",
        cause: error,
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
        chatId,
      },
      log: ctx.log.child({
        auth_type: authType,
        user_id: user?.id?.toString(),
        chat_id: chatId?.toString(),
      }),
    },
  });
});

export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  const req = ctx.request as CreateExpressContextOptions["req"];
  const { headers } = req;
  const apiKey = headers["x-api-key"];

  if (!apiKey || typeof apiKey !== "string") {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or missing API Key",
    });
  }

  if (!process.env.API_KEY) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "API_KEY is not configured on the server",
    });
  }

  const providedKey = Buffer.from(apiKey);
  const expectedKey = Buffer.from(process.env.API_KEY);

  if (
    providedKey.length !== expectedKey.length ||
    !crypto.timingSafeEqual(providedKey, expectedKey)
  ) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or missing API Key",
    });
  }

  return next({
    ctx: {
      session: {
        authType: "admin" as const,
      },
    },
  });
});
