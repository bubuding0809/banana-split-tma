import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Explicitly load the .env file for development
dotenv.config({
  path: path.resolve(process.cwd(), "env/.env.development"),
});

export const env = createEnv({
  server: {
    TELEGRAM_BOT_TOKEN: z
      .string()
      .min(1, "TELEGRAM_BOT_TOKEN is required, grab this from BotFather"),
    API_KEY: z
      .string()
      .min(1, "API_KEY is required for API key authentication"),
    INTERNAL_AGENT_KEY: z
      .string()
      .min(
        1,
        "INTERNAL_AGENT_KEY is required for internal agent communication"
      ),
    // Optional — powers category.suggest. Missing key degrades gracefully to
    // categoryId: null (classifyCategory swallows the auth error). We warn at
    // boot so the miss is visible instead of silent.
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
    AGENT_MODEL: z.string().min(1).default("gemini-3.1-flash-lite-preview"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
  console.warn(
    "⚠️  GOOGLE_GENERATIVE_AI_API_KEY is not set — category.suggest will return null for every call. Add it to apps/lambda/env/.env.development to enable auto-assign."
  );
}
