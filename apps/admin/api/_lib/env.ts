import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    ADMIN_LAMBDA_URL: z.string().url(),
    ADMIN_LAMBDA_API_KEY: z.string().min(1),
    ADMIN_SESSION_SECRET: z.string().min(32),
    ADMIN_ALLOWED_TELEGRAM_IDS: z.string().default(""),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    ADMIN_DEV_BYPASS: z.enum(["0", "1"]).default("0"),
    ADMIN_COOKIE_DOMAIN: z.string().optional(),
  },
  runtimeEnv: process.env,
});
