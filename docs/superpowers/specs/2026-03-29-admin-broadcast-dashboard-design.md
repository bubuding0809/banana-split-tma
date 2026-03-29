# Admin Broadcast Dashboard Design

## Objective

Create a local web-based admin dashboard in `apps/admin` to facilitate broadcasting messages to Banana Split Telegram Mini App users. This allows administrators to announce new features, updates, or alerts seamlessly without writing manual scripts.

## Architecture

The system will use a client-server architecture built on the existing monorepo stack:

1.  **Frontend (`apps/admin`):** A Vite + React Single Page Application (SPA) using Shadcn/ui components.
2.  **Backend (`packages/trpc` & `apps/lambda`):** A new `adminRouter` exposed via the existing tRPC API to handle database queries and Telegram API communication.

### Security & Authentication

Since this dashboard is for local use but communicates with the production backend:

- **Backend Validation:** A new tRPC middleware (`adminProcedure`) will be created in `packages/trpc/src/routers/admin/index.ts`. It will intercept requests to the admin router and require a valid `x-admin-api-key` header. This header must match the `ADMIN_API_KEY` defined in the backend's environment variables (`apps/lambda/.env`).
- **Frontend Configuration:** The Vite frontend will be configured via its own `.env.local` to read `VITE_ADMIN_API_KEY`. The tRPC client setup in `apps/admin` will automatically inject this key into the headers of every request. No login screen is required.

## Backend Design (tRPC `adminRouter`)

The new router will expose the following procedures:

1.  **`getUsers` (Query)**

    - **Input:** Optional pagination/search parameters (e.g., `limit`, `cursor`, `searchQuery`).
    - **Action:** Queries the `User` table in Supabase.
    - **Output:** Returns a list of users (`id`, `firstName`, `lastName`, `username`) to populate the frontend selection list.

2.  **`testBroadcast` (Mutation)**

    - **Input:** `{ message: string, testUserId: number }`
    - **Action:** Immediately sends the provided markdown message to the specified `testUserId` via the Telegram Bot API (`bot.sendMessage`).
    - **Output:** `{ success: boolean, error?: string }`.

3.  **`broadcastMessage` (Mutation)**
    - **Input:** `{ message: string, targetUserIds?: number[] }`
    - **Action:**
      1.  If `targetUserIds` is provided, fetch those specific users. If undefined/empty, fetch _all_ users from the database.
      2.  Loop through the list of retrieved users.
      3.  Call the Telegram Bot API `sendMessage` endpoint for each user.
      4.  **Crucial Constraint:** Implement an artificial delay of ~100ms between each API call to respect Telegram's rate limits (~30 messages per second limit) and prevent the bot from being throttled or banned.
      5.  Track successes and failures (e.g., users who have blocked the bot).
    - **Output:** `{ successCount: number, failCount: number, failures: { userId: number, reason: string }[] }`.

## Frontend UI Components

The `apps/admin` Vite app will feature a single, clean dashboard page using Shadcn/ui components.

### 1. Message Composer

- Instead of a basic textarea, integrate a dedicated Markdown input library (e.g., `react-md-editor` or a similar robust library) to allow easy crafting of rich messages (bold, italic, lists).
- **Transformation:** Before sending the payload to the backend via tRPC, the standard markdown from the editor will be parsed/transformed into Telegram's specific MarkdownV2 format (or standard Markdown, depending on the bot's configuration) using the existing `telegramify-markdown` utilities already present in the workspace (`apps/bot/src/utils/telegramMarkdown.ts`).

### 2. Target Audience Selector

- A Radio Group with two options:
  - **"All Users"** (Default)
  - **"Specific Users"**
- If "Specific Users" is selected, a Multi-Select component or searchable Data Table will appear, populated by the `getUsers` tRPC query, allowing the admin to hand-pick specific recipients.

### 3. Action Controls

- **Test Send Group:** An input field for a single Telegram User ID and a secondary "Send Test" button. This triggers the `testBroadcast` mutation so the admin can verify formatting on their own device.
- **Broadcast Action:** A primary "Broadcast" button. Clicking this triggers a Shadcn `AlertDialog` confirming the action ("Are you sure you want to send this message to X users?").
- **Loading State:** While the `broadcastMessage` mutation is executing (which may take ~10 seconds for 100 users due to the 100ms delay), the entire form must be disabled, and a spinner/progress indicator shown to prevent duplicate submissions.

### 4. Results Summary

- Upon completion of the broadcast mutation, a Shadcn `Alert` component will display the final output: the number of successful sends, and the number of failures (e.g., users who blocked the bot), along with a button to reset the form.
