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
`[version]-[chatType]-[chatIdBase36]-[entityType]-[entityIdBase64Url]`

*   **`version`:** `v1` (2 chars)
*   **`chatType`:** `g` (group) or `p` (private) (1 char)
*   **`chatIdBase36`:** The absolute value of the chat ID encoded in Base36 (e.g., `1001234567890` -> `1d4x9g2i`). (approx 8 chars)
*   **`entityType`:** `s` (snapshot), `e` (expense), `p` (payment) (1 char)
*   **`entityIdBase64Url`:** The 36-char UUID stripped of hyphens, parsed into a 16-byte array, and encoded to an unpadded Base64URL string (22 chars).

*Note on Delimiters:* We use hyphens (`-`) as the delimiter instead of underscores (`_`) because Base64URL encoding can produce underscores. Using hyphens prevents delimiter collision when splitting the string during decoding.

*Example:* `v1-g-1d4x9g2i-s-Ej5FZibEtOkVkJmFBdAAA`
*Total Length:* ~38 characters. (Well within the 64-char limit).

### 2. Backend Implementation (tRPC)

**New Procedure:** `snapshotRouter.shareSnapshotMessage`
*   **Input:** `snapshotId: string (UUID)`
*   **Output:** `{ success: boolean, messageId: number }`
*   **Authorization:** The backend MUST verify that the requesting user is a member of the chat associated with the snapshot. If the user does not have access, throw a `FORBIDDEN` TRPCError.
*   **Action:**
    1.  Fetches snapshot details including all expenses, shares, and members. The target chat ID is derived directly from this fetched snapshot record.
    2.  Aggregates the total damage (net sum of shares) per user.
    3.  Sorts users by highest damage to lowest (ignoring 0 or positive balances).
    4.  Generates the deep link using the new `v1` protocol string for the `startapp` parameter. The inline button URL is constructed using our existing `createDeepLinkedUrl` helper (which reads the bot username via `teleBot.getMe()`) and passes the `v1` payload to the `app` type parameter.
    5.  Constructs the Telegram MarkdownV2 message.
    6.  Sends the message to the derived `chatId` via `teleBot.sendMessage` with an inline keyboard button `[View Snapshot 📊]`.

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
*   Update `parseRawParams` to first check if the string starts with `v1-`.
*   If `v1-`: Split by `-`.
    *   Decode the Base36 chat ID, and re-apply the negative sign by multiplying by `-1` for group chats (indicated by the `g` chatType flag).
    *   Since Base64URL can contain hyphens (which we used as our delimiter), we must safely extract the UUID portion. The safest method is to split by `-`, take the first 4 segments (`version`, `chatType`, `chatId`, `entityType`), and join all remaining segments back together with hyphens to reconstruct the full `entityIdBase64Url`.
    *   Decode the reconstructed unpadded Base64URL entity ID back to a standard UUID format string (16-byte array -> hex string with hyphens).
*   If not `v1-`: Fallback to the legacy Base64-encoded JSON parsing.
*   Return a normalized object matching a new `startParamSchema`:
    ```typescript
    {
      chat_id: number,
      chat_type: string,
      entity_type?: 's' | 'e' | 'p',
      entity_id?: string
    }
    ```

**Routing (`chat.$chatId.tsx` or `_tma.tsx`):**
*   When a chat context is initialized, check if `entity_type` and `entity_id` exist in `startParams`.
*   If `entity_type === 's'`, use TanStack router to navigate to `/_tma/chat/$chatId_/snapshots` and pass `?snapshotId=${entity_id}` in the search params to automatically open the `SnapshotDetailsModal`.

**UI (`SnapshotDetailsModal.tsx`):**
*   Add a Share `IconButton` (lucide-react `Share` or `Send`) to the modal header.
*   On click, prompt a Telegram SDK `popup` for confirmation ("Share this snapshot to the group chat?").
*   On confirm, trigger the `shareSnapshotMessage` mutation.
*   Show success haptic feedback and a small visual confirmation (or close the modal).

## Error Handling
*   **Deep Link Parsing:** If the `v1` string is malformed, it should gracefully fallback to standard chat initialization without the entity redirect.
*   **Message Sending:** If `teleBot.sendMessage` fails (e.g., due to missing bot permissions or an invalid chat), the backend MUST throw a `TRPCError` (e.g., `INTERNAL_SERVER_ERROR` or `FORBIDDEN`). The frontend will catch this via the mutation's `onError` callback and display a user-friendly error toast or popup.

## Testability
This enhancement introduces critical core routing logic that must be robust. The following automated tests are required:
*   **Unit Tests for `v1` Protocol Encoder/Decoder:** Test the round-trip conversion of various Chat IDs (positive, negative, large numbers) and UUIDs to ensure no data loss or corruption. Specifically include tests where the Base64URL UUID string naturally contains hyphens (`-`) or underscores (`_`).
*   **Unit Tests for Legacy Fallback:** Test that valid Base64 JSON strings are still correctly parsed by `parseRawParams` to ensure backward compatibility.
*   **Unit Tests for Backend Message Logic:** Add unit/integration tests for the damage aggregation logic within `shareSnapshotMessage` to ensure sums calculate precisely (using Decimal.js) and users sort correctly in the output text.

## Future Extensions
*   The `v1` protocol trivially supports deep linking to specific expenses (`entity_type=e`) or settlements (`entity_type=p`) in future PRs simply by updating the frontend router to handle those entity types.
