import { google } from "@ai-sdk/google";
import { createMinimax } from "vercel-minimax-ai-provider";
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
    const config: { apiKey: string; baseURL?: string } = {
      apiKey: process.env.MINIMAX_API_KEY,
    };
    if (process.env.MINIMAX_BASE_URL) {
      config.baseURL = process.env.MINIMAX_BASE_URL;
    }
    const minimax = createMinimax(config);
    return minimax(modelName || "MiniMax-M2.5");
  }

  throw new Error(`Unsupported AGENT_PROVIDER: ${provider}`);
}
