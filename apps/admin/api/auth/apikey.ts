import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { env } from "../_lib/env.js";
import { setSessionCookie, signSession } from "../_lib/session.js";

function firstAllowedId(): string | null {
  const raw = env.ADMIN_ALLOWED_TELEGRAM_IDS;
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids[0] ?? null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const source =
    typeof req.body === "object" && req.body
      ? (req.body as Record<string, unknown>)
      : null;
  const apiKey = typeof source?.apiKey === "string" ? source.apiKey : "";

  const ok =
    apiKey.length > 0 && constantTimeEqual(apiKey, env.ADMIN_LAMBDA_API_KEY);

  if (!ok) {
    // Deter brute force without holding the event loop indefinitely.
    await new Promise((r) => setTimeout(r, 800));
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const sub = firstAllowedId();
  if (!sub) {
    res.status(500).json({ error: "No admin allowlist configured" });
    return;
  }

  const token = await signSession({
    sub,
    username: "api-key",
    firstName: "API Key",
  });
  setSessionCookie(res, token);

  res.status(200).json({
    telegramId: Number(sub),
    username: "api-key",
    firstName: "API Key",
  });
}
