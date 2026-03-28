# Mastra Agent Authentication & Deterministic Authorization

## Overview

The Mastra Agent currently connects to the backend tRPC server using a `superadmin` API key bypass. This gives the agent unlimited access to all data across all Telegram chats, relying entirely on the LLM to respect the `chatId` and `telegramUserId` extracted from the Telegram execution context. This architecture is vulnerable to prompt injections, allowing malicious users to execute cross-tenant data leaks (e.g., listing all chats in the database) or unauthorized state modifications (e.g., forging debts against users not in their chat).

This spec outlines a secure, deterministic authorization model for the agent. It introduces a dedicated `agent` authentication type that forces the agent to inherit the exact permissions of the user interacting with it, ensuring the LLM cannot bypass standard database scope constraints.

## Goals

1.  **Eliminate the `superadmin` bypass** for the Mastra Agent, ensuring it cannot perform actions the invoking user is not authorized to perform.
2.  **Introduce a secure, internal `INTERNAL_AGENT_KEY`** to explicitly authenticate the agent service to the tRPC backend without overloading the existing `API_KEY` functionality.
3.  **Implement a composable authorization layer** to explicitly verify that participants (payers, debtors, creditors) involved in financial transactions belong to the specified chat.
4.  **Zero regressions** for existing authentication paths (`superadmin`, `chat-api-key`, `user-api-key`, and `telegram` initData).

## Design & Architecture

### 1. The `agent` Authentication Flow

The backend tRPC server must be able to recognize trusted requests from the Mastra Agent and bind them to the specific human user currently interacting with the bot.

- **Environment Variable:** A new `INTERNAL_AGENT_KEY` environment variable will be introduced. It will be required in `.env`, `.env.prod.bot`, `.env.prod.lambda`, and `.env.prod.web`.
- **Agent Client Updates (`packages/agent/src/trpc.ts`):**
  - The `createTrpcCaller` utility will stop injecting the `x-api-key` header.
  - It will instead inject three new headers:
    - `x-agent-key`: `process.env.INTERNAL_AGENT_KEY`
    - `x-agent-user-id`: The extracted `telegramUserId`.
    - `x-agent-chat-id`: The extracted `chatId`.
- **tRPC Auth Middleware (`packages/trpc/src/trpc.ts`):**
  - The `protectedProcedure` middleware will be updated to check for `x-agent-key`.
  - If `x-agent-key` is present and matches `INTERNAL_AGENT_KEY` (using `crypto.timingSafeEqual`), the session `authType` will be set to `"agent"`.
  - The session's `user` object will be populated with the `id` from `x-agent-user-id`, and `chatId` from `x-agent-chat-id`.
  - **Crucially:** This check will run _independently_ of the existing API Key and Telegram InitData paths, ensuring zero regressions for existing integrations.

### 2. Restricting Chat Scope Access

By changing the agent's `authType` from `"superadmin"` to `"agent"`, the agent becomes subject to standard chat scope validation.

- **`packages/trpc/src/middleware/chatScope.ts`:**
  - The `assertChatAccess` middleware currently allows `"superadmin"` to bypass all checks.
  - For the new `"agent"` authType, `assertChatAccess` will fall through to the standard database verification step: it will query the `Chat` table to verify that the `session.user` (the user interacting with the bot) is an active member of the `inputChatId`.
  - If the LLM hallucinates or attempts to inject a different `chatId` into a tool call, the database check will fail, and a `TRPCError(FORBIDDEN)` will be thrown.

### 3. Composable Participant Validation

While `assertChatAccess` ensures the _creator_ has access to the chat, it does not verify that the _participants_ (payer, debtors, creditors) specified by the LLM actually belong to the chat. We need a composable layer to enforce this.

- **New Utility (`packages/trpc/src/middleware/chatScope.ts`):**

  - Create an `assertUsersInChat(db: Db, chatId: bigint | number, userIds: (bigint | number)[])` function.
  - This function will query the database for the chat's members.
  - If any of the provided `userIds` are not present in the chat's member list, it will throw a `TRPCError(BAD_REQUEST)` with a clear message indicating which users are missing.

- **Integration Points:**
  - **`createExpense`**: Call `assertUsersInChat` with `payerId` and all `participantIds` before opening the Prisma transaction.
  - **`updateExpense`**: Call `assertUsersInChat` with `payerId` and all `participantIds` before opening the Prisma transaction.
  - **`createSettlement`**: Call `assertUsersInChat` with `senderId` and `receiverId`.
  - **`settleAllDebts`**: Call `assertUsersInChat` with `senderId` and `receiverId`.
  - **`createExpensesBulk`**: Extract a distinct list of all `payerId`s and `participantIds` from the `expenses` array, and run `assertUsersInChat` once before kicking off the parallel creations.

## Rollout Strategy & Deployment

1.  **Environment Variables**: Ensure `INTERNAL_AGENT_KEY` is added to all `.env.prod.*` files and the Vercel/AWS environments before deployment. Provide a secure random default in `.env.example`.
2.  **Implementation**: Update `packages/trpc`, `packages/agent`, and the backend endpoints. Ensure TypeScript type checks and linting pass (`pnpm turbo check-types lint`).
3.  **Testing**: Verify existing API integrations (superadmin, Telegram Mini App) function normally to ensure zero regressions. Verify the agent cannot create an expense using a `participantId` that is not in the test chat.
