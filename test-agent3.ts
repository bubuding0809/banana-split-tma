import { bananaAgent } from "./packages/agent/src/agent.js";

async function test() {
  const result = await bananaAgent.stream(["hello"], {
    memory: {
      thread: "threadId",
      resource: "telegram",
    },
    context: [
      {
        role: "system",
        content: JSON.stringify({ telegramUserId: 123, chatId: 456 }),
      },
    ],
  });
}
