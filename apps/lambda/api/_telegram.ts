import { Telegram } from "telegraf";
import { env } from "./env.js";

/**
 * Single place the lambda constructs its Telegram client. Honours
 * TELEGRAM_API_ROOT so the local UAT recording proxy can sit in front of
 * api.telegram.org.
 */
export function createTelegramClient(): Telegram {
  return new Telegram(
    env.TELEGRAM_BOT_TOKEN,
    env.TELEGRAM_API_ROOT ? { apiRoot: env.TELEGRAM_API_ROOT } : undefined
  );
}
