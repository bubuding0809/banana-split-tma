import { Middleware } from "grammy";
import { BotContext } from "../types.js";
import { appRouter, withCreateTRPCContext } from "@dko/trpc";
import { env } from "../env.js";

const createContext = withCreateTRPCContext({
  TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
});

type ExpressContextOptions = Parameters<typeof createContext>[0];

export const trpcMiddleware: Middleware<BotContext> = async (ctx, next) => {
  const trpcCtx = createContext({
    req: {
      headers: {
        "x-api-key": env.API_KEY || "",
      },
    } as unknown as ExpressContextOptions["req"],
    res: {} as unknown as ExpressContextOptions["res"],
    info: {} as unknown as ExpressContextOptions["info"],
  });

  ctx.trpc = appRouter.createCaller(trpcCtx);
  await next();
};
