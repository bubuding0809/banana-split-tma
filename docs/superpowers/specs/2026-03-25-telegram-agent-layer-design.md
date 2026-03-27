# Telegram Bot Agent Layer

## Overview

We are adding a natural language Agent layer to the Telegram bot, enabling users to interact with the underlying tRPC APIs (e.g., creating expenses, calculating balances, sending reminders, getting summaries) conversationally. The agent will use Mastra as its framework, leveraging the existing logic from the `cli` app (which has the most up-to-date tools/commands) to build out Mastra tools.

## Architecture

1. **`packages/agent`**:

   - A new shared workspace package.
   - Defines the Mastra Agent (`BananaAgent`).
   - Defines Mastra `tools` by wrapping our tRPC procedures (mapped from the `apps/cli` commands).
   - Initializes Mastra Memory with a PostgreSQL adapter to store conversational context persistently.
   - Exports the agent to be consumed by `apps/bot`.

2. **`apps/bot`**:
   - Imports the Mastra `BananaAgent` from `packages/agent`.
   - Modifies the triggering logic to decide when to invoke the agent vs fast explicit parsers.

## Trigger Mechanism & Interaction

### Direct Messages (DMs)

- When a text message is received, the existing fast `parseExpense` explicit parser runs first.
- **Fast Path:** If the message successfully parses as a straightforward expense creation (e.g., "Paid 10 for lunch"), the bot immediately creates the expense directly.
- **Agent Path:** If the parser fails or the user asks something else (e.g., "Who owes me money?", "Remind John to pay me back"), the message is routed to the Mastra Agent.

### Group Chats

- The agent is strictly opt-in to avoid spam and excessive LLM cost.
- Triggered only when:
  - The bot is explicitly mentioned (`@banana_split_bot`).
  - Or an explicit command like `/ask <query>` or `/do <query>` is used.

### Response Delivery

- Telegram does not natively support HTTP streaming.
- We will accumulate the agent's streamed output and batch update the Telegram message (using `bot.api.editMessageText`) periodically (e.g., every 1-2 seconds) to provide a typing/streaming-like experience without hitting Telegram API rate limits.

## Tools & Skills

The Mastra Agent will be equipped with tools based on the updated features currently residing in the `cli` app. Examples include:

- **Chat:** Getting chat ID, managing chat settings.
- **Currency:** Listing supported currencies, getting exchange rates.
- **Expense:** Listing, creating, editing, and deleting expenses.
- **Reminder:** `send-group-reminder`, `send-debt-reminder` to ping users about debts in the group.
- **Settlement:** Calculating debts, settling up between users.
- **Snapshot:** Viewing and managing balances across multiple chats.

These tools will receive the necessary context (e.g., `telegramUserId`, `chatId`) from the bot when the agent is invoked, passing it down to the underlying tRPC handlers securely.

## Data & Memory Flow

1. **User sends message** -> Bot processes it.
2. Bot retrieves the Mastra Agent session for that user/chat.
3. **Mastra Agent Context** -> Mastra automatically fetches history from the Postgres Memory Adapter.
4. Agent reasons about the prompt -> Invokes Mastra tools.
5. **Mastra Tools** -> Call the same tRPC logic used by the CLI to query/mutate the database.
6. Agent responds -> Streamed back to the Telegram client.
