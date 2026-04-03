# Minimax Provider Support for Mastra Agent

## Context

The application currently uses a Mastra-based agent (`BananaAgent`) integrated with the Telegram bot to handle natural language requests. This agent relies on the Google Gemini model via `@ai-sdk/google`. We need to introduce support for the Minimax model provider to offer flexibility and an alternative backend for the agent. We will integrate Minimax using the `@ai-sdk/openai` package, which is compatible with Minimax's OpenAI-compatible API endpoints.

## Architecture

To support switching between multiple AI model providers cleanly, we will introduce a "Provider Factory" pattern.

### 1. Dependencies and Environment

- **Dependency**: Add `@ai-sdk/openai` to the `packages/agent` workspace.
- **Environment Variables**:
  - `AGENT_PROVIDER`: Determines which provider to use (`google` | `minimax`). Defaults to `google` for backward compatibility.
  - `AGENT_MODEL`: Overrides the specific model name to use.
  - `MINIMAX_API_KEY`: API key for authentication with Minimax.
  - `MINIMAX_BASE_URL`: Base URL for the Minimax API (defaults to `https://api.minimax.chat/v1` if not specified).

### 2. Provider Factory (`packages/agent/src/provider.ts`)

We will create a new factory module responsible for resolving the appropriate AI model instance:

- Export a `getAgentModel()` function.
- **Google Path**: If `AGENT_PROVIDER` is `google` (or undefined), it returns the initialized `google(...)` model just like the current implementation.
- **Minimax Path**: If `AGENT_PROVIDER` is `minimax`, it utilizes `createOpenAI` (from `@ai-sdk/openai`), passes the `baseURL` and `apiKey` from environment variables, and returns the instantiated model. It falls back to a sensible Minimax default model (e.g., `abab6.5-chat`) if `AGENT_MODEL` is not explicitly set.

### 3. Agent Integration (`packages/agent/src/agent.ts`)

The main agent file will be refactored to consume the new factory:

- Remove direct dependencies on `@ai-sdk/google` from `agent.ts`.
- Import the `getAgentModel` factory function from `./provider.js`.
- During the `Agent` instantiation, call `getAgentModel()` to set the `model` property.

## Data Flow

1. The Telegram bot starts up and initializes `BananaAgent`.
2. `agent.ts` invokes `getAgentModel()`.
3. `provider.ts` checks the `AGENT_PROVIDER` environment variable.
4. The factory returns the appropriately configured Vercel AI SDK language model instance.
5. `BananaAgent` operates seamlessly with the configured provider to execute natural language tasks.

## Testing & Verification

- Verify that setting `AGENT_PROVIDER=minimax` successfully routes requests to the Minimax API.
- Ensure the existing default behavior (falling back to Google/Gemini) remains unaffected.
- The unit tests or test workflows that build the agent should pass without issues.
