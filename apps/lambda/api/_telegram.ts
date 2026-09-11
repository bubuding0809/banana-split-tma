import type { Api } from "grammy";
// Narrow subpath, not the package root: the root pulls in every router.
import { createTelegramApi } from "@dko/trpc/telegramClient";
import { env } from "./env.js";

/**
 * Single place the lambda constructs its Telegram client. Goes through the
 * shared factory so network errors have the bot token scrubbed before they
 * can reach a logger. Honours TELEGRAM_API_ROOT so the local UAT recording
 * proxy can sit in front of api.telegram.org.
 */
export function createTelegramClient(): Api {
  return createTelegramApi(
    env.TELEGRAM_BOT_TOKEN,
    env.TELEGRAM_API_ROOT || undefined
  );
}
