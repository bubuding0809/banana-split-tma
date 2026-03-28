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
`[version]_[chatId]_[entityType]_[entityId]`

*   **`version`:** `1` (Allows future format changes without breaking old links).
*   **`chatId`:** The Telegram chat ID. For supergroups, the `-100` prefix is removed to save 4 characters. The frontend/backend will automatically prepend `-100` if the chat ID is positive and the context implies a group, or we handle it via explicit type if needed. *Correction: To avoid ambiguity, we will include the full chat ID (e.g., `-1001234567890`) but remove the `-` sign and denote it with a type flag if necessary. Actually, the simplest approach is `[version]_[chatType]_[chatId]_[entityType]_[entityId]`. Let's refine this:*

**Final Protocol Format:**
`[version]_[chatType]_[chatIdBase36]_[entityType]_[entityIdBase64Url]`

*   `version`: `v1` (2 chars)
*   `chatType`: `g` (group) or `p` (private) (1 char)
*   `chatIdBase36`: The absolute value of the chat ID encoded in Base36 (e.g., `1001234567890` -> `1d4x9g2i`). (approx 8 chars)
*   `entityType`: `s` (snapshot), `e` (expense), `p` (payment) (1 char)
*   `entityIdBase64Url`: The 36-char UUID stripped of hyphens and encoded to Base64URL (22 chars).

*Example:* `v1_g_1d4x9g2i_s_Ej5FZibEtOkVkJmFBdAAA`
*Total Length:* ~38 characters. (Well within the 64-char limit).

### 2. Backend Implementation (tRPC)

**New Procedure:** `snapshotRouter.shareSnapshotMessage`
*   **Input:** `snapshotId: string (UUID)`
*   **Action:**
    1.  Fetches snapshot details including all expenses, shares, and members.
    2.  Aggregates the total damage (net sum of shares) per user.
    3.  Sorts users by highest damage to lowest (ignoring 0 or positive balances).
    4.  Generates the deep link using the new `v1` protocol string for the `startapp` parameter.
    5.  Constructs the Telegram MarkdownV2 message.
    6.  Sends the message to the `chatId` via `teleBot.sendMessage` with an inline keyboard button `[View Snapshot 📊]`.

**Message Format Example:**
```markdown
📊 **Mar 26 totals** shared by @ting
Total spent: **SGD 633.96** (47 expenses)

📉 **Your Damage:**
• @ting: SGD 400.00
• @ruoqian: SGD 233.96
```

### 3. Frontend Implementation

**Decoding (`useStartParams.ts`):**
*   Update `parseRawParams` to first check if the string starts with `v1_`.
*   If `v1_`: Split by `_`. Decode the Base36 chat ID (re-applying `-100` if it's a group `g`). Decode the Base64URL entity ID back to a standard UUID format.
*   If not `v1_`: Fallback to the legacy Base64-encoded JSON parsing.
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
*   **Message Sending:** Handle Telegram API errors (e.g., bot lacks permissions) and display a user-friendly error toast via the frontend mutation `onError`.

## Future Extensions
*   The `v1` protocol trivially supports deep linking to specific expenses (`entity_type=e`) or settlements (`entity_type=p`) in future PRs simply by updating the frontend router to handle those entity types.
