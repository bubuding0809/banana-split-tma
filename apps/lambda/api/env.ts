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
    TELEGRAM_BOT_USERNAME: z
      .string()
      .min(1, "TELEGRAM_BOT_USERNAME is required"),
    TELEGRAM_APP_NAME: z.string().min(1, "TELEGRAM_APP_NAME is required"),
    API_KEY: z
      .string()
      .min(1, "API_KEY is required for API key authentication"),
    INTERNAL_AGENT_KEY: z
      .string()
      .min(
        1,
        "INTERNAL_AGENT_KEY is required for internal agent communication"
      ),
  },
  runtimeEnv: process.env,
});
