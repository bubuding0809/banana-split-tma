import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

export const env = createEnv({
  server: {
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    VERCEL_URL: z.string().optional(),
    API_KEY: z.string().min(1),
    INTERNAL_AGENT_KEY: z.string().min(1),
    MINI_APP_DEEPLINK: z.string().min(1),
    AWS_GROUP_REMINDER_LAMBDA_ARN: z.string().optional(),
    AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN: z.string().optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
    AGENT_MODEL: z.string().min(1).default("gemini-3.1-flash-lite-preview"),
    AGENT_PROVIDER: z.enum(["google", "minimax"]).default("google"),
    MINIMAX_API_KEY: z.string().optional(),
    MINIMAX_BASE_URL: z.string().default("https://api.minimax.io/v1"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

if (env.AGENT_PROVIDER === "google" && !env.GOOGLE_GENERATIVE_AI_API_KEY) {
  throw new Error(
    "❌ GOOGLE_GENERATIVE_AI_API_KEY is required when AGENT_PROVIDER is 'google'"
  );
}

if (env.AGENT_PROVIDER === "minimax" && !env.MINIMAX_API_KEY) {
  throw new Error(
    "❌ MINIMAX_API_KEY is required when AGENT_PROVIDER is 'minimax'"
  );
}

// Inject required AWS envs directly to process.env so the tRPC backend routers can read them safely
process.env.AWS_GROUP_REMINDER_LAMBDA_ARN =
  env.AWS_GROUP_REMINDER_LAMBDA_ARN ||
  "arn:aws:lambda:us-east-1:123456789012:function:GroupReminder";
process.env.AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN =
  env.AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN ||
  "arn:aws:iam::123456789012:role/EventBridgeSchedulerRole";
