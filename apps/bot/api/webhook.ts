import { webhookCallback } from "grammy";
import { bot } from "../src/bot.js";

// Vercel Serverless Functions will timeout and return 504 if they exceed this limit.
// We set it to 60s (maximum for Hobby plan) to allow the LLM time to generate.
export const maxDuration = 60;

// Tell grammy to wait for 60 seconds before timing out.
// By default, grammy throws an error on timeout, which causes Vercel to return 500, making Telegram retry infinitely!
// We use "return" so that if the LLM exceeds 60s, grammy gracefully returns 200 OK to Telegram and stops the retry loop.
const handler = webhookCallback(bot, "next-js", {
  timeoutMilliseconds: 60000,
  onTimeout: "return",
});

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
