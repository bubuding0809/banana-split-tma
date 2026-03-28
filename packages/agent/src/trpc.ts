import { appRouter, withCreateTRPCContext } from "@dko/trpc";

/**
 * Creates a server-side caller for the tRPC routers, using Mastra execution context.
 * Ensures the telegramUserId and chatId are securely extracted and cannot be spoofed.
 */
export function createTrpcCaller(context: unknown): {
  caller: ReturnType<typeof appRouter.createCaller>;
  telegramUserId: number;
  chatId: number;
} {
  if (!context || typeof context !== "object") {
    throw new Error("Missing or invalid Mastra execution context");
  }

  const ctx = context as Record<string, any>;

  // Extract values using RequestContext API if available, fallback to raw object
  const telegramUserId = (
    ctx.requestContext && typeof ctx.requestContext.get === "function"
      ? ctx.requestContext.get("telegramUserId")
      : ctx.telegramUserId
  ) as number | undefined;

  const chatId = (
    ctx.requestContext && typeof ctx.requestContext.get === "function"
      ? ctx.requestContext.get("chatId")
      : ctx.chatId
  ) as number | undefined;

  if (typeof telegramUserId !== "number" || typeof chatId !== "number") {
    throw new Error("Context must include numeric telegramUserId and chatId");
  }

  const createContext = withCreateTRPCContext({
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
    AWS_GROUP_REMINDER_LAMBDA_ARN:
      process.env.AWS_GROUP_REMINDER_LAMBDA_ARN || "",
    AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN:
      process.env.AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN || "",
  });

  type ExpressContextOptions = Parameters<typeof createContext>[0];

  const trpcCtx = createContext({
    req: {
      headers: {
        "x-agent-key": process.env.INTERNAL_AGENT_KEY || "",
        "x-agent-user-id": telegramUserId.toString(),
        "x-agent-chat-id": chatId.toString(),
      },
    } as unknown as ExpressContextOptions["req"],
    res: {} as unknown as ExpressContextOptions["res"],
    info: {} as unknown as ExpressContextOptions["info"],
  });

  const caller = appRouter.createCaller(trpcCtx);

  return { caller, telegramUserId, chatId };
}
