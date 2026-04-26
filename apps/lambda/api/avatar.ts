import { Router, type Request, type Response } from "express";
import { Telegram } from "telegraf";
import { prisma } from "@dko/database";
import {
  validate as validateInitData,
  parse as parseInitData,
} from "@telegram-apps/init-data-node";
import { env } from "./env.js";

const router = Router();
const teleBot = new Telegram(env.TELEGRAM_BOT_TOKEN);

router.get("/:userId", async (req: Request, res: Response) => {
  // 1. Auth — TMA initData (header OR query string for <img>)
  const headerAuth = req.header("authorization");
  const initData =
    (headerAuth?.startsWith("tma ") ? headerAuth.slice(4) : null) ??
    (typeof req.query.auth === "string" ? req.query.auth : null);
  if (!initData) {
    return res.status(401).end();
  }
  let callerId: number;
  try {
    validateInitData(initData, env.TELEGRAM_BOT_TOKEN);
    const parsed = parseInitData(initData);
    if (!parsed.user?.id) {
      return res.status(401).end();
    }
    callerId = parsed.user.id;
  } catch {
    return res.status(401).end();
  }

  // 2. Authz — caller and target share a chat (self-lookup is always allowed)
  const targetId = BigInt(String(req.params.userId));
  if (BigInt(callerId) !== targetId) {
    const shared = await prisma.chat.findFirst({
      where: {
        members: { some: { id: BigInt(callerId) } },
        AND: { members: { some: { id: targetId } } },
      },
      select: { id: true },
    });
    if (!shared) {
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
    // Defense in depth — telegraf redacts internally, but the bare
    // fetch(fileLink) call doesn't, and a future Node/Undici version
    // could attach the URL to err.cause.message. Match telegraf's
    // /bot\d+:[A-Za-z0-9_-]+/g pattern.
    const safeErr =
      err instanceof Error
        ? err.message.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[REDACTED]")
        : String(err);
    console.warn("avatar fetch failed", {
      targetId: targetId.toString(),
      err: safeErr,
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
