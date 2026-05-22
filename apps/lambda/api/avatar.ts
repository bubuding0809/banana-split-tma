import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { Telegram } from "telegraf";
import { prisma } from "@dko/database";
import {
  validate as validateInitData,
  parse as parseInitData,
} from "@telegram-apps/init-data-node";
import { createLogger, getRequestId } from "@repo/logger";
import { env } from "./env.js";
import { redactBotToken } from "./_redact.js";

const router = Router();
const teleBot = new Telegram(env.TELEGRAM_BOT_TOKEN);
const log = createLogger("lambda");

router.get("/:userId", async (req: Request, res: Response) => {
  const targetIdRaw = String(req.params.userId);
  // 1. Auth — resolves the caller's Telegram user id from either a
  //    user-level API key (x-api-key, used by the Raycast extension) or
  //    TMA initData (header or ?auth= query string, used by the mini app).
  let callerId: number;
  const apiKey = req.header("x-api-key");
  if (apiKey) {
    const keyHash = createHash("sha256").update(apiKey).digest("hex");
    const userApiKey = await prisma.userApiKey.findUnique({
      where: { keyHash },
      select: { revokedAt: true, user: { select: { id: true } } },
    });
    if (!userApiKey || userApiKey.revokedAt !== null) {
      log.warn(
        {
          request_id: getRequestId(),
          reason: userApiKey ? "user_api_key_revoked" : "invalid_api_key",
          endpoint: "avatar",
          target_id: targetIdRaw,
        },
        "auth.apiKey.failed"
      );
      return res.status(401).end();
    }
    callerId = Number(userApiKey.user.id);
  } else {
    const headerAuth = req.header("authorization");
    const initData =
      (headerAuth?.startsWith("tma ") ? headerAuth.slice(4) : null) ??
      (typeof req.query.auth === "string" ? req.query.auth : null);
    if (!initData) {
      log.warn(
        {
          request_id: getRequestId(),
          reason: "missing_init_data",
          endpoint: "avatar",
          target_id: targetIdRaw,
        },
        "auth.initData.failed"
      );
      return res.status(401).end();
    }
    try {
      validateInitData(initData, env.TELEGRAM_BOT_TOKEN);
      const parsed = parseInitData(initData);
      if (!parsed.user?.id) {
        log.warn(
          {
            request_id: getRequestId(),
            reason: "init_data_no_user",
            endpoint: "avatar",
            target_id: targetIdRaw,
          },
          "auth.initData.failed"
        );
        return res.status(401).end();
      }
      callerId = parsed.user.id;
    } catch (err) {
      log.warn(
        {
          err,
          request_id: getRequestId(),
          reason: "init_data_invalid",
          endpoint: "avatar",
          target_id: targetIdRaw,
        },
        "auth.initData.failed"
      );
      return res.status(401).end();
    }
  }

  // 2. Authz — caller and target share a chat (self-lookup is always allowed)
  const targetId = BigInt(targetIdRaw);
  if (BigInt(callerId) !== targetId) {
    const shared = await prisma.chat.findFirst({
      where: {
        members: { some: { id: BigInt(callerId) } },
        AND: { members: { some: { id: targetId } } },
      },
      select: { id: true },
    });
    if (!shared) {
      log.warn(
        {
          request_id: getRequestId(),
          reason: "no_shared_chat",
          endpoint: "avatar",
          caller_id: callerId.toString(),
          target_id: targetId.toString(),
        },
        "authz.forbidden"
      );
      return res.status(403).end();
    }
  }

  // 3. Telegram fetch — token URL stays inside this function
  let bytes: Buffer;
  try {
    // Telegram user IDs fit safely in Number for the foreseeable future
    // (current max ~7e9 vs MAX_SAFE_INTEGER ~9e15). Telegraf's signature
    // requires number, not bigint.
    const photos = await teleBot.getUserProfilePhotos(Number(targetId), 0, 1);
    const biggest = photos.photos[0]?.at(-1);
    if (!biggest) {
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
      return res.status(404).end();
    }
    const fileLink = await teleBot.getFileLink(biggest.file_id);
    const upstream = await fetch(fileLink.toString());
    if (!upstream.ok) {
      return res.status(502).end();
    }
    bytes = Buffer.from(await upstream.arrayBuffer());
  } catch (err) {
    // Redact the bot token from any error message before logging.
    // See _redact.ts for rationale.
    console.warn("avatar fetch failed", {
      targetId: targetId.toString(),
      err: redactBotToken(err),
    });
    return res.status(502).end();
  }

  // 4. Stream + cache
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader(
    "Cache-Control",
    "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800"
  );
  return res.status(200).send(bytes);
});

export default router;
