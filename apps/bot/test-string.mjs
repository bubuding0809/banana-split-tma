import { Bot } from "grammy";
const bot = new Bot("1234:dummy", { botInfo: { id: 1234, is_bot: true, first_name: "test", username: "test_bot" } });
bot.handleUpdate("{}").catch(console.error);
