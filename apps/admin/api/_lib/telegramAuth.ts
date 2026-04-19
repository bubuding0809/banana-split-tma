import crypto from "node:crypto";
import { env } from "./env.js";

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

export type TelegramAuthPayload = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export type VerifiedIdentity = {
  telegramId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
};

export function verifyTelegramAuth(
  payload: TelegramAuthPayload
): VerifiedIdentity | null {
  const { hash, ...rest } = payload;

  const dataCheckString = Object.entries(rest)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secretKey = crypto
    .createHash("sha256")
    .update(env.TELEGRAM_BOT_TOKEN)
    .digest();

  const computed = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computed.length !== hash.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash))) {
    return null;
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - payload.auth_date;
  if (ageSeconds < 0 || ageSeconds > MAX_AUTH_AGE_SECONDS) return null;

  return {
    telegramId: payload.id,
    firstName: payload.first_name,
    lastName: payload.last_name,
    username: payload.username,
    photoUrl: payload.photo_url,
  };
}
