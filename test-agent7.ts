import { bananaAgent } from "./packages/agent/src/agent.js";

async function test() {
  const result = await bananaAgent.generate({
    messages: ["hello"],
    threadId: "threadId",
    context: { telegramUserId: 123, chatId: 456 },
  });
}
