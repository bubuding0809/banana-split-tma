import { google } from "@ai-sdk/google";
import { createMinimax } from "vercel-minimax-ai-provider";
import { wrapLanguageModel } from "ai";
import type { LanguageModelV2, LanguageModelV3 } from "@ai-sdk/provider";
import { truncateMiddleware } from "./truncate-middleware.js";

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
    const model = minimax(modelName || "MiniMax-M2.5");

    // Wrap model to limit context history for Minimax to avoid overflow
    // @ts-ignore
    return wrapLanguageModel({
      model: model as any,
      middleware: truncateMiddleware(15) as any, // keep last 15 messages (including system)
    });
  }

  throw new Error(`Unsupported AGENT_PROVIDER: ${provider}`);
}
