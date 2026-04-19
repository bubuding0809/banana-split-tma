import { env } from "./env.js";

export function isAllowed(telegramId: number): boolean {
  const raw = env.ADMIN_ALLOWED_TELEGRAM_IDS;
  if (!raw) return false;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(String(telegramId));
}
