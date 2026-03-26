import { webhookCallback } from "grammy";
import { bot } from "../src/bot.js";

const handler = webhookCallback(bot, "next-js");

export default async function (req: any, res: any) {
  // Prevent crash when webhook URL is visited in browser (GET request)
  if (req.method === "GET" || req.method === "HEAD") {
    return res
      .status(200)
      .json({ status: "ok", message: "Bot webhook is active" });
  }

  // Telegram webhook payload is parsed by Vercel automatically into req.body
  // Wait for the handler to process the update
  await handler(req, res);
}
