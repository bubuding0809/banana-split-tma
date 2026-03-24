import { bot } from "../src/bot.js";
import { env } from "../src/env.js";

async function setWebhook() {
  if (!env.VERCEL_URL) {
    throw new Error("VERCEL_URL is not set");
  }

  const url = `https://${env.VERCEL_URL}/api/webhook`;
  console.log(`Setting webhook to: ${url}`);

  await bot.api.setWebhook(url);
  console.log("Webhook set successfully!");
}

setWebhook().catch(console.error);
