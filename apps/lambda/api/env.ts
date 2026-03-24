import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Explicitly load the .env file for development
dotenv.config({
  path: path.resolve(process.cwd(), "env/.env.development"),
});

export const env = createEnv({
  clientPrefix: "PUBLIC_",
  client: {},
  server: {
    TELEGRAM_BOT_TOKEN: z
      .string()
      .min(1, "TELEGRAM_BOT_TOKEN is required, grab this from BotFather"),
    API_KEY: z
      .string()
      .min(1, "API_KEY is required for API key authentication"),
  },
  runtimeEnv: process.env,
});
