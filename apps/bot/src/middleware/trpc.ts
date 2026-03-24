import { Middleware } from "grammy";
import { BotContext } from "../types.js";
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

export const trpcMiddleware: Middleware<BotContext> = async (ctx, next) => {
  ctx.trpc = caller;
  await next();
};
