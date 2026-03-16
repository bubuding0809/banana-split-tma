# User-Level API Keys — Design Document

## Problem

The system currently supports Chat-Scoped API Keys (for an AI agent deployed inside a single group) and Superadmin API Keys (for internal services). Users have requested the ability to generate **User-Level API Keys**. These personal keys will allow a user to programmatically access all of their own chats, expenses, and data without being restricted to a single group, effectively acting as full impersonation of their user account.

Additionally, a security gap was identified where the TMA (Telegram) authorization was considered "unrestricted" regarding cross-chat access. While the TMA UI prevents accessing other chats, a malicious actor could theoretically forge requests to access other chats they are not a member of. This needs to be addressed concurrently.

## Design Decisions

| Decision             | Choice                           | Rationale                                                                                                                                                                  |
| -------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Key Access Level** | Full User Impersonation          | The key acts exactly like the user, granting read/write access to all of their chats, expenses, and personal data.                                                         |
| **Key Storage**      | Dedicated `UserApiKey` Model     | Isolated from `ChatApiKey`. Maintains a clean schema where keys are uniquely tied to a user. Raw keys are never stored, only SHA-256 hashes.                               |
| **Management UI**    | TMA Settings Page                | Users will generate, view, and revoke their personal keys through a new "API Keys" section in the frontend settings area.                                                  |
| **Auth Security**    | Enforce DB-level chat membership | The `assertChatScope` middleware will be refactored to actually query the database and verify the user (both TMA and API key users) is a member of the requested `chatId`. |
| **Key Format**       | `usk_` prefix + Base64url        | Distinguishes them from chat-scoped keys (`bsk_`). Includes 48 cryptographically random bytes.                                                                             |

## Data Model

New Prisma model added to `packages/database/prisma/schema.prisma`:

```prisma
model UserApiKey {
  id          String    @id @default(uuid())
  keyHash     String    @unique          // SHA-256 hash of the raw API key
  keyPrefix   String                     // First 8 chars for identification (e.g., "usk_a1b2")
  userId      BigInt
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  revokedAt   DateTime?                  // null = active, non-null = revoked
  createdAt   DateTime  @default(now())

  @@index([userId])
}
```

## Auth Middleware Updates

The `protectedProcedure` middleware in `packages/trpc/src/trpc.ts` will support a new auth path:

```
Request arrives with x-api-key header
  ├─ Key matches process.env.API_KEY?
  │   → authType: "superadmin"
  │
  └─ Otherwise → SHA-256 hash the key
       ├─ Look up in ChatApiKey table
       │   ├─ Found & active → authType: "chat-api-key"
       │
       └─ Look up in UserApiKey table
           ├─ Found & active → authType: "user-api-key", sets ctx.session.user
           │
           └─ Not found OR revoked → 401 Unauthorized
```

### Updated Session Type

```typescript
type Session = {
  user: TelegramUser | null;
  authType: "superadmin" | "chat-api-key" | "user-api-key" | "telegram";
  chatId: bigint | null; // non-null only for "chat-api-key" auth
};
```

## Authorization & Security Fix

The existing `assertChatScope` function in `packages/trpc/src/middleware/chatScope.ts` will be rewritten to an async `assertChatAccess(session, db, chatId)` function that requires database access:

- **Superadmin**: Allowed immediately.
- **Chat-Scoped Key**: `session.chatId === inputChatId`.
- **Telegram Auth & User-Level Key**: Queries `db.chatMember` to ensure `session.user.id` is actively associated with `inputChatId`. Throws `FORBIDDEN` if not found.

_Note: All procedures accepting `chatId` as input must be updated to use the new async `assertChatAccess` function._

## tRPC Procedures

New endpoints added to the `apiKey` router:

### `apiKey.generateUserToken`

- **Auth**: `telegram` only (must be an active TMA session).
- **Behavior**:
  1. Generates 48 cryptographically random bytes.
  2. Formats as `usk_` + base64url.
  3. Stores `SHA-256(rawKey)`, `keyPrefix`, and `userId` in `UserApiKey`.
  4. Returns `{ rawKey, keyPrefix }` (raw key shown once).

### `apiKey.listUserTokens`

- **Auth**: `telegram` only.
- **Behavior**: Returns a list of active `UserApiKey` records for the calling user (excluding `keyHash`).

### `apiKey.revokeUserToken`

- **Auth**: `telegram` only.
- **Input**: `{ tokenId: string }`
- **Behavior**: Sets `revokedAt = now()` for the specific token if it belongs to the user.

## Frontend Integration

A new route will be created in the React application: `/_tma/settings/api-keys`.

- Displays a list of active personal API keys (`listUserTokens`).
- Provides a button to generate a new key (`generateUserToken`), displaying the raw key in a modal with a "Copy" button.
- Provides a "Revoke" button next to existing keys (`revokeUserToken`).

## Backwards Compatibility

- Existing Chat-Scoped API keys remain fully functional.
- Superadmin workflow remains untouched.
- External Telegram bots using the MCP server will need no configuration changes unless they explicitly switch to a user-level key.
