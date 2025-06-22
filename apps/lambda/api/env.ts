import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import dotenv from "dotenv";
import path from "path";
dotenv.config({
  path: path.resolve(process.cwd(), "env/.env.development"),
});

export const env = createEnv({
  server: {
    TELEGRAM_BOT_TOKEN: z
      .string()
      .min(1, "TELEGRAM_BOT_TOKEN is required, grab this from BotFather"),
  },
  runtimeEnv: process.env,
});
