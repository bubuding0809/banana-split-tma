import { bot } from "../src/bot.js";

console.log("Starting bot in local long-polling mode...");

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

bot.start({
  onStart: (botInfo) => {
    console.log(`Bot @${botInfo.username} started successfully!`);
  },
});
