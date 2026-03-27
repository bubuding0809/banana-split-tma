import { Bot } from "grammy";
const bot = new Bot("1234:dummy", { botInfo: { id: 1234, is_bot: true, first_name: "test", username: "test_bot" } });
bot.on("message", (ctx) => ctx.reply("hi"));

const nextJs = (request, response) => ({
    get update() { return request.body; },
    header: "test",
    end: () => console.log("ended"),
    respond: (json) => console.log("responded", json),
    unauthorized: () => console.log("unauthorized"),
});

bot.handleUpdate(nextJs({ body: "{}" }, {}).update).catch(console.error);
