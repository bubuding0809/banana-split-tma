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

  // 2. Stub for now — return 404 to satisfy auth tests.
  // Authz + Telegram fetch added in subsequent tasks.
  void callerId;
  void teleBot;
  void prisma;
  return res.status(404).end();
});

export default router;
