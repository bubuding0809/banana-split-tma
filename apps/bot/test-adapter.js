const { Bot } = require("grammy");
const bot = new Bot("dummy");
bot.on("message", (ctx) => ctx.reply("hi"));

const nextJs = (request, response) => ({
  get update() {
    return request.body;
  },
  header: "test",
  end: () => console.log("ended"),
  respond: (json) => console.log("responded", json),
  unauthorized: () => console.log("unauthorized"),
});

bot.handleUpdate(nextJs({ body: undefined }, {}).update).catch(console.error);
