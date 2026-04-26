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

router.get("/:chatId", async (req: Request, res: Response) => {
  // 1. Auth — TMA initData (header OR query string)
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

  // 2. Authz — caller is a member of the chat (no self-bypass)
  const chatId = BigInt(String(req.params.chatId));
  const member = await prisma.chat.findFirst({
    where: {
      id: chatId,
      members: { some: { id: BigInt(callerId) } },
    },
    select: { id: true },
  });
  if (!member) {
    return res.status(403).end();
  }

  // 3. Stub — Telegram fetch added next task.
  void teleBot;
  return res.status(404).end();
});

export default router;
