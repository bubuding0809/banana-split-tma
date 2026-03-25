import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { memory } from "./memory.js";

export const bananaAgent = new Agent({
  id: "bananaAgent",
  name: "BananaAgent",
  instructions: "You are a helpful Telegram expense tracker bot...",
  memory,
  model: openai("gpt-4o"),
});
