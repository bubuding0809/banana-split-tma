# Telegram Agent Layer - Gemini Integration

## Overview

We are updating the Telegram Bot's Mastra-based agent layer to use Google Gemini instead of OpenAI. This transition takes advantage of the Vercel AI SDK's provider abstraction to seamlessly swap models without rewriting our existing execution tools, memory adapters, or bot streaming logic.

## Architecture & Integration Changes

1. **Provider Transition (`packages/agent`)**:

   - The `@ai-sdk/openai` package will be completely removed.
   - The `@ai-sdk/google` package will be introduced.
   - The existing `BananaAgent` configuration will be updated to import `google` from `@ai-sdk/google`.

2. **Model Selection**:

   - The agent will be configured to use the `gemini-3.1-flash-image-preview` model.
   - This model will seamlessly receive the existing Zod schemas for our TRPC tools (Expense, Snapshot, Currency, Chat, Reminders) via Mastra.

3. **Environment & Configuration**:

   - The `OPENAI_API_KEY` environment variable is no longer required.
   - A new environment variable `GOOGLE_GENERATIVE_AI_API_KEY` must be added to `.env` and `.env.example`.
   - Vercel AI SDK automatically detects `GOOGLE_GENERATIVE_AI_API_KEY` to authenticate with Google's API.

4. **Preserved Logic (No Action Needed)**:
   - **Mastra Postgres Memory**: The `PgMemory` implementation in `memory.ts` remains unchanged. Gemini will automatically receive the persisted message threads.
   - **Mastra Tools**: The TRPC tool schemas (`tools/*`) and the `createTrpcCaller` context extraction logic remain completely unchanged as Gemini natively supports structured tool calling.
   - **Telegram Streaming**: The GramMy streaming and batching mechanism in `apps/bot/src/features/agent.ts` continues to function exactly as before since the Mastra `.stream()` abstraction handles provider streams identically.
