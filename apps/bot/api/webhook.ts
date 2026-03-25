import { webhookCallback } from "grammy";
import { bot } from "../src/bot.js";

// Export standard handler for Vercel
export default webhookCallback(bot, "next-js");
