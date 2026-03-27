import { bananaAgent } from "./packages/agent/src/agent.js";
async function test() {
  await bananaAgent.stream("hello", {
    memory: { thread: "th", resource: "res" },
    requestContext: { telegramUserId: 123, chatId: 456 } as any,
  });
}
