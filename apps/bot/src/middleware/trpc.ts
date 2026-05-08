import { Middleware } from "grammy";
import type { Logger } from "@repo/logger";
import { AppCaller, BotContext } from "../types.js";
import { appRouter, withCreateTRPCContext } from "@dko/trpc";
import { env } from "../env.js";

const createContext = withCreateTRPCContext({
  TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
  AWS_GROUP_REMINDER_LAMBDA_ARN: env.AWS_GROUP_REMINDER_LAMBDA_ARN || "",
  AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN:
    env.AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN || "",
});

type ExpressContextOptions = Parameters<typeof createContext>[0];

const trpcCtx = createContext({
  req: {
    headers: {
      "x-api-key": env.API_KEY,
    },
  } as unknown as ExpressContextOptions["req"],
  res: {} as unknown as ExpressContextOptions["res"],
  info: {} as unknown as ExpressContextOptions["info"],
});

const caller = appRouter.createCaller(trpcCtx);

// Wrap a tRPC caller so every leaf procedure call emits trpc.call.start /
// trpc.call.end with the dotted procedure path and duration. Nested
// namespaces (e.g. expense.recurring.list) are handled by recursing on
// non-function objects. Symbol props pass through untouched so Proxy
// internals (Symbol.toPrimitive, etc.) keep working.
export function wrapCallerWithLogging<T extends object>(
  target: T,
  log: Logger,
  path: readonly string[] = []
): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const value = Reflect.get(t, prop, receiver);
      if (typeof prop === "symbol") return value;

      const newPath = [...path, prop];

      if (typeof value === "function") {
        const procedure = newPath.join(".");
        return async (...args: unknown[]) => {
          const start = Date.now();
          log.info({ procedure }, "trpc.call.start");
          try {
            const result = await (value as (...a: unknown[]) => unknown).apply(
              t,
              args
            );
            log.info(
              {
                procedure,
                duration_ms: Date.now() - start,
                outcome: "ok",
              },
              "trpc.call.end"
            );
            return result;
          } catch (err) {
            log.error(
              {
                procedure,
                duration_ms: Date.now() - start,
                outcome: "error",
                err,
              },
              "trpc.call.end"
            );
            throw err;
          }
        };
      }

      if (value && typeof value === "object") {
        return wrapCallerWithLogging(value as object, log, newPath);
      }

      return value;
    },
  }) as T;
}

export const trpcMiddleware: Middleware<BotContext> = async (ctx, next) => {
  // Per-request wrap so each call inherits the request_id / chat_id /
  // user_id baked into ctx.log by loggerMiddleware. The Proxy is lazy —
  // creating it costs effectively nothing.
  ctx.trpc = wrapCallerWithLogging(caller, ctx.log) as AppCaller;
  await next();
};
