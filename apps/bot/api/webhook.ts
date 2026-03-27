import { bot } from "../src/bot.js";
import { waitUntil } from "@vercel/functions";

// Vercel Serverless Functions will timeout and return 504 if they exceed this limit.
// We set it to 60s (maximum for Hobby plan) to allow the LLM time to generate.
export const maxDuration = 60;

export default async function (req: any, res: any) {
  // Prevent crash when webhook URL is visited in browser (GET request)
  if (req.method === "GET" || req.method === "HEAD") {
    return res
      .status(200)
      .json({ status: "ok", message: "Bot webhook is active" });
  }

  if (req.method === "POST" && req.body) {
    // 1. Process the Telegram update in the background
    // `waitUntil` prevents Vercel from freezing the instance until the promise resolves,
    // even after we send the 200 OK HTTP response below.
    waitUntil(
      (async () => {
        if (!bot.isInited()) {
          await bot.init();
        }
        await bot.handleUpdate(req.body);
      })().catch((err) => {
        console.error("Error handling update in background:", err);
      })
    );

    // 2. Acknowledge Telegram webhook IMMEDIATELY
    // This prevents Telegram from hitting a 10s timeout and infinitely retrying the webhook
    return res.status(200).json({ status: "ok" });
  }

  return res.status(400).json({ error: "Invalid request" });
}
