import type { Api } from "grammy";
import { env } from "./env.js";

/** grammy has no getFileLink; build the download URL the way telegraf did. */
export function telegramFileUrl(
  apiRoot: string | undefined,
  token: string,
  filePath: string
): string {
  const root = (apiRoot ?? "https://api.telegram.org").replace(/\/$/, "");
  return `${root}/file/bot${token}/${filePath}`;
}

/**
 * Resolve a file_id to bytes. Throws when Telegram returns no file_path,
 * matching telegraf's getFileLink behaviour so callers' existing catch
 * blocks keep producing a 502.
 */
export async function fetchTelegramFile(
  teleBot: Api,
  fileId: string
): Promise<Response> {
  const file = await teleBot.getFile(fileId);
  if (!file.file_path) {
    throw new Error(`Telegram returned no file_path for file ${fileId}`);
  }
  return fetch(
    telegramFileUrl(
      env.TELEGRAM_API_ROOT,
      env.TELEGRAM_BOT_TOKEN,
      file.file_path
    )
  );
}
