import { bananaAgent } from "./packages/agent/src/agent.js";

async function test() {
  const result = await bananaAgent.stream(["hello"], {
    memory: {
      thread: "threadId",
      resource: "telegram",
    },
    // what else is there? Let's check TypeScript autocomplete
  });
}
