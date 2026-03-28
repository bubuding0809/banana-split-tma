# Snapshot Sharing and Unified Deep Linking Protocol

## Objective
To allow users to share a snapshot's summary directly to a Telegram group chat with an inline button that deep links directly back into the snapshot details within the Mini App. This requires designing a scalable, character-efficient deep linking protocol that adheres to Telegram's strict 64-character limit for the `startapp` parameter.

## Motivation
Currently, users can view snapshots but cannot easily share them with the group to provide visibility on the "damage" (expense shares). We want a one-click sharing experience that sends a rich message to the chat, allowing members to quickly jump into the app to see their personal damage breakdown. Furthermore, we need a robust deep-linking system that can easily be extended to other entities (e.g., expenses, payments) in the future without exceeding Telegram's character limits.

## Architecture & System Design

The enhancement involves three main components:
1.  **Frontend UI (SnapshotDetailsModal):** A new sharing flow.
2.  **Backend Telegram Integration:** Formatting the summary message and deep link.
3.  **Unified Deep Linking Protocol:** A scalable system for encoding and decoding `startapp` parameters.

### 1. Unified Deep Linking Protocol (`v1` Protocol)

Telegram's `startapp` parameter has a strict 64-character limit and only accepts `[a-zA-Z0-9_-]`. Our current Base64-encoded JSON approach (`{"chat_id":-1001234567890,"chat_type":"g"}`) is already ~95 characters when adding a UUID, which fails.

We will introduce a new, compact, versioned string format:
`[version]_[chatType]_[chatIdBase36]_[entityType]_[entityIdBase64Url]`

*   **`version`:** `v1` (2 chars)
*   **`chatType`:** `g` (group) or `p` (private) (1 char)
*   **`chatIdBase36`:** The absolute value of the chat ID encoded in Base36 (e.g., `1001234567890` -> `1d4x9g2i`). This must be generated from and decoded back to a `BigInt` to prevent precision loss for large Telegram IDs. (approx 8 chars)
*   **`entityType`:** `s` (snapshot), `e` (expense), `p` (payment) (1 char)
*   **`entityIdBase64Url`:** The 36-char UUID stripped of hyphens, parsed into a 16-byte array, and encoded to an unpadded Base64URL string (22 chars).

*Note on Delimiters:* We use underscores (`_`) as the delimiter. Because Base64URL encoding uses both hyphens (`-`) and underscores (`_`) in its alphabet, delimiter collision is unavoidable given Telegram's allowed `startapp` character set (`[a-zA-Z0-9_-]`). We will handle this during decoding by splitting a limited number of segments and re-joining the rest.

*Example:* `v1_g_1d4x9g2i_s_Ej5FZibEtOkVkJmFBdAAA`
*Total Length:* ~38 characters. (Well within the 64-char limit).

### 2. Backend Implementation (tRPC)

**New Procedure:** `snapshotRouter.shareSnapshotMessage`
*   **Input:** `snapshotId: string (UUID)`
*   **Output:** `{ success: boolean, messageId: number }`
*   **Authorization:** The backend MUST verify that the requesting user is a member of the chat associated with the snapshot by querying the local database (e.g., `ChatMember` table). If the user does not have access, throw a `FORBIDDEN` TRPCError.
*   **Action:**
    1.  Fetches snapshot details including all expenses, shares, and members. The target chat ID is derived directly from this fetched snapshot record.
    2.  Aggregates the total damage (net sum of shares) per user.
    3.  Sorts users by highest damage to lowest (ignoring 0 or positive balances).
    4.  Generates the deep link using the new `v1` protocol string for the `startapp` parameter. The inline button URL is constructed using our existing `createDeepLinkedUrl` helper. To avoid unnecessary network calls, the bot username should be read from the environment configuration (e.g., `process.env.TELEGRAM_BOT_USERNAME`) instead of calling `teleBot.getMe()`. This env variable MUST be strictly validated by the backend's environment schema (e.g., Zod).
    5.  Constructs the Telegram MarkdownV2 message.
    6.  Sends the message to the derived `chatId` via `teleBot.sendMessage` with an inline keyboard button `[View Snapshot 📊]`.
    7.  *Note on Message Tracking:* This is a fire-and-forget message. Unlike individual expense notifications, snapshot summary messages do not need to be tracked or persisted in the database for future automated updates.

**Message Format Example:**
```markdown
📊 **Mar 26 totals** shared by @ting
Total spent: **SGD 633.96** (47 expenses)

📉 **Your Damage:**
• @ting: SGD 400.00
• @ruoqian: SGD 233.96
```

**Edge Cases for Message Format:**
*   **Missing Usernames:** If a user does not have a `@username`, the message MUST use Telegram's MarkdownV2 inline mention syntax (e.g., `[First Name](tg://user?id=123456)`) by utilizing our existing `mentionMarkdown` utility.
*   **0 Expenses:** If the snapshot contains no expenses, the message will still display the total (0.00) and expense count (0), but the "Your Damage" section will be entirely omitted.
*   **0 Damage for All Users:** If the net damage for all users calculates to exactly 0 (e.g., fully settled expenses included in the snapshot), the "Your Damage" section will also be omitted.

### 3. Frontend Implementation

**Decoding (`useStartParams.ts`):**
*   Update `parseRawParams` to first check if the string starts with `v1_`.
*   If `v1_`: Split by `_`.
    *   Decode the Base36 chat ID string into a `BigInt`, and re-apply the negative sign by multiplying by `-1n` for group chats (indicated by the `g` chatType flag).
    *   Since Base64URL can contain underscores (which we used as our delimiter), we must safely extract the UUID portion. The safest method is to split by `_`, take the first 4 segments (`version`, `chatType`, `chatId`, `entityType`), and join all remaining segments back together with underscores to reconstruct the full `entityIdBase64Url`.
    *   Decode the reconstructed unpadded Base64URL entity ID back to a standard UUID format string (16-byte array -> hex string with hyphens).
*   If not `v1_`: Fallback to the legacy Base64-encoded JSON parsing.
*   Return a normalized object matching a new `startParamSchema`. To bridge the gap between BigInt precision and the frontend's current routing parameter expectations, the parsed BigInt MUST be cast to a Number, wrapped in a strict `Number.isSafeInteger()` validation bounds check.
    ```typescript
    {
      chat_id: number, // Must be validated as a safe integer
      chat_type: string,
      entity_type?: 's' | 'e' | 'p',
      entity_id?: string
    }
    ```

**Routing (`chat.$chatId.tsx` and `SnapshotPage.tsx`):**
*   When a chat context is initialized in the main chat route (e.g., `_tma/chat.$chatId.tsx`), check if `entity_type` and `entity_id` exist in `startParams`.
*   If `entity_type === 's'`, use TanStack router to navigate to the snapshots sub-route (`/_tma/chat/$chatId_/snapshots`) and pass `?snapshotId=${entity_id}` in the search parameters.
*   The `SnapshotPage.tsx` component will read `snapshotId` from its search parameters and automatically open the `SnapshotDetailsModal` for that snapshot.

**UI (`SnapshotDetailsModal.tsx`):**
*   Add a Share `IconButton` (lucide-react `Share` or `Send`) to the modal header.
*   On click, prompt a Telegram SDK `popup` for confirmation ("Share this snapshot to the group chat?").
*   On confirm, trigger the `shareSnapshotMessage` mutation.
*   On success, close the modal immediately and display a success toast/popup indicating the message was shared.

## Error Handling
*   **Deep Link Parsing:** If the `v1` string is malformed or the resulting `chat_id` fails the safe integer bounds check, it should gracefully fallback to standard chat initialization without the entity redirect.
*   **Message Sending:** If `teleBot.sendMessage` fails (e.g., due to missing bot permissions or an invalid chat), the backend MUST throw a `TRPCError` (e.g., `INTERNAL_SERVER_ERROR` or `FORBIDDEN`). The frontend will catch this via the mutation's `onError` callback and display a user-friendly error toast or popup.

## Testability
This enhancement introduces critical core routing logic that must be robust. The following automated tests are required:
*   **Unit Tests for `v1` Protocol Encoder/Decoder:** Test the round-trip conversion of various Chat IDs (positive, negative, large `BigInt` numbers) and UUIDs to ensure no data loss or corruption. Specifically include tests where the Base64URL UUID string naturally contains hyphens (`-`) or underscores (`_`), and ensure the `Number.isSafeInteger` check is applied.
*   **Unit Tests for Legacy Fallback:** Test that valid Base64 JSON strings are still correctly parsed by `parseRawParams` to ensure backward compatibility.
*   **Unit Tests for Backend Message Logic:** Add unit/integration tests for the damage aggregation logic within `shareSnapshotMessage` to ensure sums calculate precisely (using Decimal.js) and users sort correctly in the output text.
*   **Integration Tests for Backend Authorization:** Add a test verifying that `shareSnapshotMessage` correctly throws a `FORBIDDEN` error if the calling user is not a member of the snapshot's chat.
*   **Frontend Routing Tests:** Verify that initializing the application with a `v1` deep link correctly parses the parameters, performs the routing to the target chat, and triggers the `SnapshotDetailsModal` auto-open logic.

## Future Extensions
*   The `v1` protocol trivially supports deep linking to specific expenses (`entity_type=e`) or settlements (`entity_type=p`) in future PRs simply by updating the frontend router to handle those entity types.
