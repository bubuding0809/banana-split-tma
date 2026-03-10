# Design: User-Generated Access Tokens for AI Agents

**Date:** 2026-03-10

## Goal

Allow regular users in a Telegram group to securely generate and manage chat-scoped API keys (Access Tokens) for their AI agents directly from the Banana Split Web App, without needing superadmin intervention.

## Approach

We will add an "Access Tokens" section within the Group Settings page of the Mini App. Any authenticated member of the group can mint a new token or revoke an existing one. Multiple tokens can exist simultaneously to avoid accidentally breaking other members' integrations.

## Architecture

### 1. Backend (tRPC API)

We will add new endpoints to the `apiKey` router that are accessible to standard Telegram users (`protectedProcedure`), rather than just superadmins.

- **`apiKey.generateToken`**:

  - **Input**: `chatId` (number)
  - **Logic**:
    1. Verify `ctx.session.user` exists.
    2. Query `db.chatMember` to ensure the user is an active member of `chatId`.
    3. Generate a new key (`bsk_...`), hash it using the existing utility, and save it to `db.chatApiKey` with `createdById` set to the user.
  - **Returns**: The raw API key string (only shown once).

- **`apiKey.listTokens`**:

  - **Input**: `chatId` (number)
  - **Logic**:
    1. Verify user is a member of the chat.
    2. Query `db.chatApiKey` for the chat, returning non-sensitive metadata (`id`, `keyPrefix`, `createdAt`, `createdById`).
  - **Returns**: A list of tokens with their creator's basic info.

- **`apiKey.revokeToken`**:
  - **Input**: `chatId` (number), `tokenId` (string/uuid)
  - **Logic**:
    1. Verify user is a member of the chat.
    2. Delete or mark the token as inactive in the database.
  - **Returns**: Success status.

### 2. Frontend (React Web App)

- **Navigation**: Inside the Group Settings page, we will add an "Access Tokens" or "Integrations" section.
- **Token List View**:
  - Fetches and displays existing tokens (`bsk_...[redacted]`).
  - Shows who created the token and when.
  - Next to each token, a "Revoke" button to instantly kill access if a key is leaked.
- **Generation Flow**:
  - A primary button "Generate New Token".
  - Clicking it hits `generateToken`.
  - A modal/dialog appears displaying the raw `bsk_...` string with a "Copy to Clipboard" button.
  - A warning explicitly states: _"This token grants full read/write access to this group's expenses. It will only be shown once. Keep it safe!"_

## Security Considerations

- The raw API key is only returned once, during generation.
- The `chatMember` lookup guarantees that an attacker cannot generate or view tokens for a `chatId` they do not belong to.
- By allowing multiple tokens per chat, users do not accidentally override and break other users' existing agent workflows.
- Revocation is self-serve, allowing groups to govern themselves without admin help.
