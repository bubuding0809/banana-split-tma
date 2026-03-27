import { config } from "dotenv";
config({ path: "../../.env" });
import { bananaAgent } from "@repo/agent";

async function test() {
  const streamInfo = await bananaAgent.stream(
    "What is my balance? My user id is 259941064",
    {
      memory: { thread: "TEST_123", resource: "TEST" },
    }
  );

  for await (const chunk of streamInfo.fullStream) {
    if (chunk.type !== "text-delta" && chunk.type !== "reasoning-delta") {
      console.log(chunk.type, JSON.stringify(chunk.payload));
    }
  }
}
test();
