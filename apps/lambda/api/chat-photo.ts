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

router.get("/:chatId", async (req: Request, res: Response) => {
  const chatIdRaw = String(req.params.chatId);
  // 1. Auth — TMA initData (header OR query string)
  const headerAuth = req.header("authorization");
  const initData =
    (headerAuth?.startsWith("tma ") ? headerAuth.slice(4) : null) ??
    (typeof req.query.auth === "string" ? req.query.auth : null);
  if (!initData) {
    log.warn(
      {
        request_id: getRequestId(),
        reason: "missing_init_data",
        endpoint: "chat-photo",
        chat_id: chatIdRaw,
      },
      "auth.initData.failed"
    );
    return res.status(401).end();
  }
  let callerId: number;
  try {
    validateInitData(initData, env.TELEGRAM_BOT_TOKEN);
    const parsed = parseInitData(initData);
    if (!parsed.user?.id) {
      log.warn(
        {
          request_id: getRequestId(),
          reason: "init_data_no_user",
          endpoint: "chat-photo",
          chat_id: chatIdRaw,
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
        endpoint: "chat-photo",
        chat_id: chatIdRaw,
      },
      "auth.initData.failed"
    );
    return res.status(401).end();
  }

  // 2. Authz — caller is a member of the chat (no self-bypass)
  const chatId = BigInt(chatIdRaw);
  const member = await prisma.chat.findFirst({
    where: {
      id: chatId,
      members: { some: { id: BigInt(callerId) } },
    },
    select: { id: true },
  });
  if (!member) {
    log.warn(
      {
        request_id: getRequestId(),
        reason: "not_chat_member",
        endpoint: "chat-photo",
        caller_id: callerId.toString(),
        chat_id: chatId.toString(),
      },
      "authz.forbidden"
    );
    return res.status(403).end();
  }

  // 3. Telegram fetch — token URL stays inside this function
  let bytes: Buffer;
  try {
    // Telegram chat IDs fit safely in Number for the foreseeable future.
    // Telegraf's signature requires number, not bigint.
    const chat = await teleBot.getChat(Number(chatId));
    const bigFileId = (chat as { photo?: { big_file_id?: string } }).photo
      ?.big_file_id;
    if (!bigFileId) {
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
      return res.status(404).end();
    }
    const fileLink = await teleBot.getFileLink(bigFileId);
    const upstream = await fetch(fileLink.toString());
    if (!upstream.ok) {
      return res.status(502).end();
    }
    bytes = Buffer.from(await upstream.arrayBuffer());
  } catch (err) {
    // Redact the bot token from any error message before logging.
    // See _redact.ts for rationale.
    console.warn("chat-photo fetch failed", {
      chatId: chatId.toString(),
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
