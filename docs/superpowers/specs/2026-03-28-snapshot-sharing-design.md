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
`[version]_[chatType]_[chatIdBase62]_[entityType]_[entityIdBase62]`

*   **`version`:** `v1` (2 chars)
*   **`chatType`:** `g` (group) or `p` (private) (1 char)
*   **`chatIdBase62`:** The absolute value of the chat ID encoded in Base62 (e.g., `1001234567890` -> `1E2R4w`). This must be generated from and decoded back to a `BigInt` to prevent precision loss for large Telegram IDs. (approx 7 chars)
*   **`entityType`:** `s` (snapshot), `e` (expense), `p` (payment) (1 char)
*   **`entityIdBase62`:** The 36-char UUID encoded to a Base62 string. (22 chars). *Note: Base62 only uses `[a-zA-Z0-9]`, completely eliminating any delimiter collision issues with `_` or `-`, meaning we can safely split the string by `_` during parsing without needing a "must be final segment" constraint.*
*   **Base62 Implementation:** To avoid adding external dependencies and simplify logic, the monorepo should include a single custom Base62 encoding/decoding utility function in the shared `utils` package that operates on `BigInt`. 
    *   For the Chat ID, simply pass the absolute `BigInt` value.
    *   For the UUID string, it MUST be stripped of hyphens and parsed as a 128-bit hex string into a JavaScript `BigInt` (`BigInt('0x' + hexString)`) before performing the Base62 division. When decoding, the resulting hex string MUST be padded with leading zeros to exactly 32 characters before the standard UUID hyphens are re-inserted to prevent data loss.

*Example:* `v1_g_1E2R4w_s_7N42dgm5tFLK9N8MT7fXbc`
*Total Length:* ~37 characters. (Well within the 64-char limit).

### 2. Backend Implementation (tRPC)

**New Procedure:** `snapshotRouter.shareSnapshotMessage`
*   **Input:** `snapshotId: string (UUID)`
*   **Output:** `{ success: boolean }` *(Note: Since this is a fire-and-forget message, we do not return the `messageId` to the frontend).*
*   **Authorization:** The backend MUST verify that the requesting user is a member of the chat associated with the snapshot by querying the local database (e.g., `ChatMember` table). If the user does not have access, throw a `FORBIDDEN` TRPCError.
*   **Database Schema Changes:** Add a `lastSharedAt` column (type `DateTime?`) to the `ExpenseSnapshot` Prisma model to enforce serverless-friendly rate limiting.
*   **Rate Limiting:** To prevent group chat spam, the backend MUST query the `lastSharedAt` column and reject requests if the snapshot was shared within the last 60 seconds by throwing a `TOO_MANY_REQUESTS` TRPCError.
*   **Action:**
    1.  Fetches snapshot details including all expenses, shares, and members. The target chat ID is derived directly from this fetched snapshot record.
    2.  Aggregates the net balance (Total Paid - Total Share) per user. **CRITICAL:** This aggregation MUST use the `Decimal.js` utility functions from `@/utils/financial.ts` to prevent floating-point calculation errors.
    3.  Filters out users who do not owe money (Net Balance >= 0). For the remaining users, their "Damage" is the absolute value of their negative Net Balance (how much they need to pay to settle their portion of the snapshot).
    4.  Sorts users by highest damage to lowest.
    5.  Generates the deep link using the new `v1` protocol string for the `startapp` parameter. The inline button URL is constructed using our existing `createDeepLinkedUrl` helper. To avoid unnecessary network calls, the bot username AND the telegram app short name should be read from the environment configuration (e.g., `process.env.TELEGRAM_BOT_USERNAME` and `process.env.TELEGRAM_APP_NAME`) instead of calling `teleBot.getMe()`. These env variables MUST be strictly validated by the backend's environment schema (e.g., Zod).
    6.  Constructs the Telegram MarkdownV2 message. **CRITICAL:** Only dynamic variables (usernames) and literal text characters should be passed through the `escapeMarkdown` utility. Markdown formatting syntax (like `*` for bold text) MUST NOT be escaped. Also, currency amounts MUST be formatted using the shared `formatCurrencyWithCode` utility before escaping, reading the base currency from the chat record.
    7.  Sends the message to the derived `chatId` via `teleBot.sendMessage` with an inline keyboard button `[View Snapshot 📊]`.
    8.  Updates the `lastSharedAt` database timestamp for the snapshot to enforce rate limits.

**Message Format Example:**
```markdown
📊 *Mar 26 totals* shared by @ting
Total spent: *SGD 633.96* (47 expenses)

📉 *Group Damage:*
• @ting: SGD 400.00
• @ruoqian: SGD 233.96
```

**Edge Cases for Message Format:**
*   **Missing Usernames:** If a user does not have a `@username`, the message MUST use Telegram's MarkdownV2 inline mention syntax (e.g., `[First Name](tg://user?id=123456)`) by utilizing our existing `mentionMarkdown` utility.
*   **0 Expenses:** If the snapshot contains no expenses, the message will still display the total (0.00) and expense count (0), but the "Group Damage" section will be entirely omitted.
*   **0 Damage for All Users:** If *every individual user's* damage calculates to exactly 0 (e.g., fully settled expenses included in the snapshot), the "Group Damage" section will also be omitted.
*   **Large Groups:** To prevent excessively long messages that spam the chat, the "Group Damage" list MUST be truncated to the top 15 users. If there are more than 15 users with damage, append a final line stating `and [X] others...`.

### 3. Frontend Implementation

**Decoding (`useStartParams.ts`):**
*   Update `parseRawParams` to first check if the string starts with `v1_`.
*   If `v1_`: Split by `_`.
    *   Decode the Base62 chat ID string into a `BigInt`, and re-apply the negative sign by multiplying by `-1n` for group chats (indicated by the `g` chatType flag).
    *   Decode the Base62 entity ID back to a 32-character hex string (padding with leading zeros if necessary) and format it as a standard UUID.
    *   *Note on Omitted Segments:* The parser MUST safely handle `v1` strings where the entity segments (`entityType` and `entityId`) are omitted (e.g., `v1_g_1E2R4w`), returning `undefined` for those properties.
*   If not `v1_`: Fallback to the legacy Base64-encoded JSON parsing.
*   Return a normalized object matching a new `startParamSchema`. To ensure future-proof compatibility with 64-bit Telegram IDs, the schema should represent the decoded BigInt as a string, and the frontend hooks should pass it as such. However, if the rest of the app strictly requires a number, a `Number.isSafeInteger()` bounds check MUST be applied before casting.
    ```typescript
    {
      chat_id: string, // Cast to string to safely represent BigInts
      chat_type: string,
      entity_type?: 's' | 'e' | 'p',
      entity_id?: string
    }
    ```

**Routing (`chat.$chatId.tsx` and `SnapshotPage.tsx`):**
*   When a chat context is initialized in the main chat route (e.g., `_tma/chat.$chatId.tsx`), check if `entity_type` and `entity_id` exist in `startParams`.
*   If `entity_type === 's'`, use TanStack router to navigate to the snapshots sub-route (`/_tma/chat/$chatId_/snapshots`) and pass `?snapshotId=${entity_id}` in the search parameters.
*   *Critical State Cleanup:* After successfully navigating to the entity, the application state or URL params MUST be cleared so that if the user clicks "Back" to return to the chat view, they are not caught in an infinite redirect loop caused by the stale `startParams`.
*   The `SnapshotPage.tsx` component will read `snapshotId` from its search parameters.
*   **Edge Case:** If `snapshotId` exists but the backend query returns a 404 (e.g., the snapshot was deleted after the link was shared), the app should simply clear the search parameter and remain on the Snapshot list page, optionally showing a toast "Snapshot no longer exists." If it exists, it automatically opens the `SnapshotDetailsModal`.

**UI (`SnapshotDetailsModal.tsx`):**
*   Add a Share `IconButton` (lucide-react `Share` or `Send`) to the modal header.
*   Disable the button and show a spinner while the mutation is in progress to prevent accidental double-clicks from the user.
*   On click, prompt a Telegram SDK `popup` for confirmation ("Share this snapshot to the group chat?").
*   On confirm, trigger the `shareSnapshotMessage` mutation. Include `hapticFeedback.impactOccurred('light')` to conform to UI guidelines.
*   On success, close the modal immediately and display a success toast/popup indicating the message was shared.

## Error Handling
*   **Deep Link Parsing:** If the `v1` string is malformed or the resulting `chat_id` fails the safe bounds check, it should gracefully fallback to standard chat initialization without the entity redirect.
*   **Message Sending:** If `teleBot.sendMessage` fails (e.g., due to missing bot permissions, an invalid chat, etc.), the backend MUST throw an `INTERNAL_SERVER_ERROR` or `FORBIDDEN` TRPCError. If the rate limit is hit, throw a `TOO_MANY_REQUESTS` TRPCError. The frontend will catch these via the mutation's `onError` callback and display a contextual, user-friendly error toast or popup.

## Testability
This enhancement introduces critical core routing logic that must be robust. The following automated tests are required:
*   **Unit Tests for `v1` Protocol Encoder/Decoder:** Test the round-trip conversion of various Chat IDs (positive, negative, large `BigInt` numbers) and UUIDs (via Base62) to ensure no data loss or corruption. Include a test specifically verifying that a 128-bit hex string with leading zeros encodes and decodes properly (padding logic).
*   **Unit Tests for Legacy Fallback:** Test that valid Base64 JSON strings are still correctly parsed by `parseRawParams` to ensure backward compatibility.
*   **Unit Tests for Backend Message Logic:** Add unit/integration tests for the damage aggregation logic within `shareSnapshotMessage` to ensure sums calculate precisely using `Decimal.js` and users sort correctly in the output text. Specifically verify that all dynamic content and static characters are properly escaped for MarkdownV2 formatting, and that the specific edge cases (missing usernames, 0 damage omissions, and >15 user truncation) generate the exact expected Markdown strings.
*   **Integration Tests for Backend Rate Limiting:** Add a test verifying that calling `shareSnapshotMessage` twice within 60 seconds correctly rejects the second call to protect against chat spamming.
*   **Integration Tests for Backend Authorization:** Add a test verifying that `shareSnapshotMessage` correctly throws a `FORBIDDEN` error if the calling user is not a member of the snapshot's chat.
*   **Frontend Routing Tests:** Verify that initializing the application with a `v1` deep link correctly parses the parameters, performs the routing to the target chat, and triggers the `SnapshotDetailsModal` auto-open logic.

## Future Extensions
*   The `v1` protocol trivially supports deep linking to specific expenses (`entity_type=e`) or settlements (`entity_type=p`) in future PRs simply by updating the frontend router to handle those entity types.
