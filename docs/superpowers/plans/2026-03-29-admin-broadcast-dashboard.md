# Admin Broadcast Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a local admin dashboard using Vite and Shadcn/ui to broadcast messages to Telegram Mini App users via a new secure tRPC `adminRouter`.

**Architecture:** The system consists of a Vite React frontend in `apps/admin` that securely communicates with a new `adminRouter` in `packages/trpc`. The backend validates an admin API key, fetches user data from the database, and safely loops through Telegram API calls with a 100ms delay to respect rate limits.

**Tech Stack:** React, Vite, Tailwind CSS, Shadcn/ui, tRPC, Zod, Prisma (database), Telegram Bot API.

---

### Task 1: Backend Setup - Admin Router & Auth Middleware

**Files:**

- Modify: `packages/trpc/src/trpc.ts` (add admin procedure)
- Create: `packages/trpc/src/routers/admin/index.ts`
- Create: `packages/trpc/src/routers/admin/getUsers.ts`
- Create: `packages/trpc/src/routers/admin/testBroadcast.ts`
- Create: `packages/trpc/src/routers/admin/broadcastMessage.ts`
- Modify: `packages/trpc/src/routers/index.ts` (mount adminRouter)
- Modify: `packages/trpc/src/env.ts` (add ADMIN_API_KEY)

- [ ] **Step 1: Update Environment Schema**
      Update `packages/trpc/src/env.ts` to include `ADMIN_API_KEY` validation (z.string().min(1)).

- [ ] **Step 2: Create Admin Procedure Middleware**
      In `packages/trpc/src/trpc.ts`, add an `isAdmin` middleware. It should read `ctx.req.headers.get('x-admin-api-key')` (or standard `req.headers` depending on your tRPC context adapter). If it doesn't match `env.ADMIN_API_KEY`, throw `new TRPCError({ code: 'UNAUTHORIZED' })`. Create `adminProcedure = publicProcedure.use(isAdmin)`.

- [ ] **Step 3: Implement `getUsers`**
      Create `packages/trpc/src/routers/admin/getUsers.ts`.
      Use `adminProcedure.query`. Fetch `id, firstName, lastName, username` from `ctx.db.user`. Return the list.

- [ ] **Step 4: Implement `testBroadcast`**
      Create `packages/trpc/src/routers/admin/testBroadcast.ts`.
      Use `adminProcedure.input(z.object({ message: z.string(), testUserId: z.number() }))`. Send message via `teleBot.sendMessage`. Handle errors gracefully, returning `{ success: boolean, error?: string }`.

- [ ] **Step 5: Implement `broadcastMessage`**
      Create `packages/trpc/src/routers/admin/broadcastMessage.ts`.
      Use `adminProcedure.input(z.object({ message: z.string(), targetUserIds: z.array(z.number()).optional() }))`.

1. Fetch target users or all users.
2. Loop over users. Call `teleBot.sendMessage` for each.
3. `await new Promise(resolve => setTimeout(resolve, 100))` inside the loop.
4. Catch errors per user. Return `{ successCount, failCount, failures: [...] }`.

- [ ] **Step 6: Mount Router**
      Create `packages/trpc/src/routers/admin/index.ts` to combine these routes into `adminRouter`. Mount it in `packages/trpc/src/routers/index.ts` under `admin: adminRouter`.

- [ ] **Step 7: Commit**

```bash
git add packages/trpc/src/
git commit -m "feat(trpc): add adminRouter with auth and broadcast procedures"
```

### Task 2: Frontend Setup - Vite App & tRPC Client Configuration

**Files:**

- Modify: `apps/admin/package.json`
- Create: `apps/admin/vite.config.ts`
- Create: `apps/admin/index.html`
- Create: `apps/admin/src/main.tsx`
- Create: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/utils/trpc.ts` (or create if missing)
- Create: `apps/admin/.env.local` (template)

- [ ] **Step 1: Install Dependencies**
      Run `pnpm add -F admin react react-dom @tanstack/react-query @trpc/react-query @trpc/client @trpc/server zod` and `pnpm add -D -F admin @vitejs/plugin-react vite tailwindcss @tailwindcss/vite typescript @types/react @types/react-dom`.

- [ ] **Step 2: Configure Vite and Tailwind**
      Create `vite.config.ts` using `@vitejs/plugin-react` and `@tailwindcss/vite`. Create a basic `index.html` and `src/main.tsx`.

- [ ] **Step 3: Configure tRPC Client**
      In `apps/admin/src/utils/trpc.ts`, set up the tRPC React Query client pointing to your local `apps/lambda` API URL (e.g., `http://localhost:3000/api/trpc`).
      In the `httpBatchLink` configuration, add a `headers` function that returns `{ 'x-admin-api-key': import.meta.env.VITE_ADMIN_API_KEY || '' }`.

- [ ] **Step 4: Create Basic App Wrapper**
      In `apps/admin/src/App.tsx`, set up the `QueryClientProvider` and `trpc.Provider`. Add a basic heading "Admin Dashboard" to verify it renders.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/
git commit -m "chore(admin): setup vite react app with trpc client"
```

### Task 3: Frontend UI - Components & Markdown Editor

**Files:**

- Modify: `apps/admin/package.json`
- Create: `apps/admin/src/components/BroadcastDashboard.tsx`
- Create: `apps/admin/src/components/TargetAudienceSelector.tsx`

- [ ] **Step 1: Install UI Libraries**
      Run `pnpm add -F admin @uiw/react-md-editor lucide-react clsx tailwind-merge`. (Assuming you'll copy necessary raw Shadcn components into `apps/admin/src/components/ui/` or use a shared `@repo/ui` package if available. If using `@repo/ui`, ensure it's linked).

- [ ] **Step 2: Build Message Composer**
      In `BroadcastDashboard.tsx`, implement `<MDEditor value={message} onChange={setMessage} />`.

- [ ] **Step 3: Build Target Audience Selector**
      Create `TargetAudienceSelector.tsx`. Use simple native radio buttons (or Shadcn `RadioGroup` if available) for "All Users" vs "Specific Users". If "Specific Users", use `trpc.admin.getUsers.useQuery()` to fetch the list and render a multi-select dropdown or list of checkboxes.

- [ ] **Step 4: Build Action Buttons**
      Add an input for `testUserId` and a "Send Test" button that calls `trpc.admin.testBroadcast.useMutation()`.
      Add a "Broadcast" button that calls `trpc.admin.broadcastMessage.useMutation()`.

- [ ] **Step 5: Integrate Telegramify-Markdown (Optional/Nice-to-have)**
      If `telegramify-markdown` is accessible from the frontend (or if we can just rely on standard markdown), map the markdown text to the telegram compatible format before sending it to the mutation.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/
git commit -m "feat(admin): build broadcast dashboard UI components"
```

### Task 4: Frontend UI - Polish & Feedback States

**Files:**

- Modify: `apps/admin/src/components/BroadcastDashboard.tsx`

- [ ] **Step 1: Loading State**
      Update the "Broadcast" button to disable the entire form when `broadcastMutation.isPending` is true. Show a spinning loader icon inside the button.

- [ ] **Step 2: Confirmation Dialog**
      Wrap the Broadcast button in a Shadcn `AlertDialog` (or a native `window.confirm` if Shadcn is tricky to set up locally). Show a warning: `Are you sure you want to send this to ${targetCount} users?`.

- [ ] **Step 3: Results Summary Alert**
      When `broadcastMutation.isSuccess` is true, render an Alert box at the top or bottom of the form showing: `✅ Sent to ${data.successCount} users. ❌ Failed: ${data.failCount}`. Map over the `failures` array to show reasons if any. Add a "Reset Form" button to clear the state.

- [ ] **Step 4: Error Handling**
      If the mutations throw errors (e.g. 401 Unauthorized), catch them and display a red Error Alert ("Invalid Admin API Key" or similar).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/
git commit -m "feat(admin): add loading states, confirmation, and result summary"
```
