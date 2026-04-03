import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV2, LanguageModelV3 } from "@ai-sdk/provider";

export function getAgentModel(): LanguageModelV2 | LanguageModelV3 {
  const provider = process.env.AGENT_PROVIDER || "google";
  const modelName = process.env.AGENT_MODEL;

  if (provider === "google") {
    return google(modelName || "gemini-3.1-flash-lite-preview");
  }

  if (provider === "minimax") {
    if (!process.env.MINIMAX_API_KEY) {
      throw new Error(
        "MINIMAX_API_KEY is required when using minimax provider"
      );
    }
    const minimax = createOpenAI({
      name: "minimax",
      apiKey: process.env.MINIMAX_API_KEY,
      baseURL: process.env.MINIMAX_BASE_URL || "https://api.minimax.chat/v1",
    });
    return minimax.chat(modelName || "abab6.5-chat");
  }

  throw new Error(`Unsupported AGENT_PROVIDER: ${provider}`);
}
