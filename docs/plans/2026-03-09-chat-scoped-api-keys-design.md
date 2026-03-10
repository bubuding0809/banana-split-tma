# Chat-Scoped API Keys — Design Document

## Problem

The MCP server currently uses a single shared API key that grants unrestricted access to all chats, expenses, settlements, and snapshots. When deploying the MCP as an agent accessible by all members within a Telegram group, users in one group must not be able to read or write data belonging to another group.

## Solution

Implement chat-scoped API keys: each Telegram group gets its own API key that restricts all API access to that group's data only. Keys are generated via Telegram bot commands (handled in the external bot repo), stored as SHA-256 hashes in the database, and enforced at the tRPC middleware level.

## Design Decisions

| Decision          | Choice                      | Rationale                                                                                                                      |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Key storage       | Self-managed in DB (hashed) | Industry standard (Stripe, GitHub, OpenAI pattern). No external dependencies. Full control over scoping.                       |
| Scope enforcement | Backend middleware          | Only truly secure option — MCP-side filtering can be bypassed by calling API directly.                                         |
| Legacy API key    | Keep as "superadmin"        | Web app, admin CLI, and scheduled Lambda jobs continue using the existing `API_KEY` env var with unrestricted access.          |
| Keys per chat     | One active key              | Simplifies management. Generating a new key revokes the old one.                                                               |
| Key generation    | Telegram bot command        | Group admins send `/generate_api_key`, bot DMs them the key. Handled in external bot repo; this repo provides tRPC procedures. |
| Key revocation    | Telegram bot command        | Group admins send `/revoke_api_key`. Sets `revokedAt` timestamp.                                                               |
| Permission check  | Telegram group admins only  | Verified via Telegram `getChatMember` API in the bot repo.                                                                     |
| Read/write access | Full read/write             | Chat-scoped keys grant full access within their scoped chat.                                                                   |

## Data Model

New Prisma model:

```prisma
model ChatApiKey {
  id          String    @id @default(uuid())
  keyHash     String    @unique          // SHA-256 hash of the raw API key
  keyPrefix   String                     // First 8 chars for identification (e.g., "bsk_a1b2")
  chatId      BigInt
  chat        Chat      @relation(fields: [chatId], references: [id], onDelete: Cascade)
  createdById BigInt                     // Telegram user ID of the admin who generated it
  createdBy   User      @relation(fields: [createdById], references: [id])
  revokedAt   DateTime?                  // null = active, non-null = revoked
  createdAt   DateTime  @default(now())

  @@index([chatId])
}
```

Key format: `bsk_` prefix + 48 cryptographically random bytes encoded as base64url (~68 chars total).

- `keyHash`: SHA-256 of the full raw key. Raw key is never stored.
- `keyPrefix`: First 8 chars of the key for display/identification in logs and bot responses.
- Cascade delete with Chat: if a chat is removed, its keys are deleted too.
- One active key per chat enforced at generation time (revoke existing before creating new).

## Auth Middleware Changes

### Authentication Flow

The `protectedProcedure` middleware in `packages/trpc/src/trpc.ts` gains a third auth path:

```
Request arrives with x-api-key header
  ├─ Key matches process.env.API_KEY?
  │   → authType: "superadmin", chatId: null (unrestricted, existing behavior)
  │
  └─ Otherwise → SHA-256 hash the key, look up in ChatApiKey table
       ├─ Found AND revokedAt is null
       │   → authType: "chat-api-key", chatId: <from DB row>
       │
       └─ Not found OR revoked
            → 401 Unauthorized

If no x-api-key header:
  └─ Check Authorization: tma <initData> (existing Telegram auth, unchanged)
```

### Updated Session Type

```typescript
type Session = {
  user: TelegramUser | null;
  authType: "superadmin" | "chat-api-key" | "telegram";
  chatId: bigint | null; // non-null only for "chat-api-key" auth
};
```

### Chat-Scope Enforcement

A reusable middleware or helper function that procedures opt into:

- For procedures that accept `chatId` as input: if `ctx.session.authType === "chat-api-key"`, assert `input.chatId === ctx.session.chatId`. Throw `FORBIDDEN` if mismatch.
- For procedures without `chatId` input that access cross-chat data (e.g., `getAllChats`): block entirely for chat-scoped keys.
- For global procedures with no chat association (e.g., `currency.getCurrentRate`): allow regardless of scope.

## tRPC Procedures (API Key Management)

New `apiKey` router in `packages/trpc/src/routers/apiKey/`:

### `apiKey.generate`

- **Auth**: superadmin key only (called by external bot repo)
- **Input**: `{ chatId: BigInt, createdById: BigInt }`
- **Behavior**:
  1. Revoke any existing active key for this chat (set `revokedAt = now()`)
  2. Generate 48 cryptographically random bytes
  3. Format as `bsk_` + base64url encoding
  4. Store `SHA-256(rawKey)`, `keyPrefix`, `chatId`, `createdById` in `ChatApiKey`
  5. Return `{ rawKey, keyPrefix }` — raw key is returned once and never stored

### `apiKey.revoke`

- **Auth**: superadmin key only
- **Input**: `{ chatId: BigInt }`
- **Behavior**:
  1. Find active key for chat (where `revokedAt` is null)
  2. Set `revokedAt = now()`
  3. Return `{ keyPrefix, revoked: true }` or error if no active key

### `apiKey.getScope`

- **Auth**: any valid API key (including chat-scoped)
- **Input**: none
- **Behavior**: Return the `chatId` and basic chat info associated with the current API key. For superadmin keys, return `{ scoped: false }`. For chat-scoped keys, return `{ scoped: true, chatId, chatTitle }`.

## Procedure Access Control

| Router/Procedure                  | Chat-scoped key    | Superadmin key  | Telegram auth |
| --------------------------------- | ------------------ | --------------- | ------------- |
| `chat.getChat(chatId)`            | Scoped chatId only | Any             | Any           |
| `chat.getAllChats`                | **Blocked**        | Any             | Any           |
| `chat.getChatDebts(chatId)`       | Scoped chatId only | Any             | Any           |
| `chat.getSimplifiedDebts(chatId)` | Scoped chatId only | Any             | Any           |
| `expense.*` (chatId-based)        | Scoped chatId only | Any             | Any           |
| `settlement.*` (chatId-based)     | Scoped chatId only | Any             | Any           |
| `snapshot.*` (chatId-based)       | Scoped chatId only | Any             | Any           |
| `currency.getCurrentRate`         | Allowed (global)   | Any             | Any           |
| `telegram.*`                      | **Blocked**        | Any             | Any           |
| `apiKey.generate`                 | **Blocked**        | Superadmin only | Blocked       |
| `apiKey.revoke`                   | **Blocked**        | Superadmin only | Blocked       |
| `apiKey.getScope`                 | Allowed            | Allowed         | Blocked       |

## MCP Server Changes

### Auto-scoping

On startup (or first tool call), the MCP server calls `apiKey.getScope` to discover whether the key is chat-scoped. If scoped:

- Cache the `chatId` and `chatTitle`
- Inject `chatId` into all tool calls automatically
- Tools no longer require `chat_id` as a user-provided input

### Tool changes

- `banana_list_chats` → returns only the scoped chat info (or hidden entirely)
- `banana_get_chat` → no longer needs `chat_id` input, uses cached scope
- All other chat-based tools → `chat_id` becomes optional; defaults to the scoped chat
- `banana_get_exchange_rate` → unchanged (global, no chat scope)
- If the key is superadmin (unscoped), tools behave as they do today

### Configuration

No new env vars needed. Users set `BANANA_SPLIT_API_KEY` to their chat-scoped key. The MCP server auto-detects the scope.

## Bot Repo Integration (Out of Scope)

The external Telegram bot repo needs to:

1. Add `/generate_api_key` command handler:

   - Verify sender is group admin via `getChatMember`
   - Call `apiKey.generate` tRPC procedure with superadmin key
   - DM the raw key to the admin
   - Reply in group: "API key generated and sent to your DM"

2. Add `/revoke_api_key` command handler:
   - Verify sender is group admin
   - Call `apiKey.revoke` tRPC procedure
   - Reply in group: "API key revoked"

## Security Considerations

- **Raw keys are never stored**: Only SHA-256 hashes persist in the database.
- **Keys are shown once**: The raw key is returned only in the `generate` response. If lost, generate a new one.
- **Revocation is instant**: Setting `revokedAt` immediately invalidates the key on the next request.
- **Cascade delete**: If a chat is deleted, all associated keys are deleted.
- **Superadmin key unchanged**: The existing `API_KEY` env var continues to work for internal services.
- **No cross-chat leakage**: Middleware enforces scope before any procedure logic runs.
