# User-Level API Keys Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement User-Level API Keys allowing full account impersonation, complete with a UI management page and a security fix for cross-chat access validation.

**Architecture:** A new `UserApiKey` Prisma model stores hashed keys. The `protectedProcedure` middleware resolves `x-api-key` headers to `user-api-key` auth. A new `assertChatAccess` middleware queries the database to ensure both TMA users and user-api-key holders are actual members of the requested `chatId`. A frontend settings page manages these keys.

**Tech Stack:** Prisma, tRPC, React (TMA UI), Node.js

---

### Task 1: Add UserApiKey Prisma Model & Migration

**Files:**

- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add the UserApiKey model to schema**
Append the new model to `packages/database/prisma/schema.prisma` and add the reverse relation to the `User` model.

```prisma
model UserApiKey {
  id          String    @id @default(uuid())
  keyHash     String    @unique
  keyPrefix   String
  userId      BigInt
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())

  @@index([userId])
}
```

Add `userApiKeys UserApiKey[]` to the `User` model.

**Step 2: Generate the Prisma client**
Run: `pnpm --filter @dko/database db:generate`
Expected: Prisma client generated successfully.

**Step 3: Create the migration**
Run: `pnpm --filter @dko/database db:migrate --name add_user_api_key`
Expected: Migration created in `packages/database/prisma/migrations/`.

**Step 4: Commit**
Run: `git add packages/database/prisma && git commit -m "feat: add UserApiKey prisma model"`

---

### Task 2: Update Auth Middleware (protectedProcedure)

**Files:**

- Modify: `packages/trpc/src/trpc.ts`

**Step 1: Update Session types and add UserApiKey lookup**
Update `Session` type to include `"user-api-key"` in `authType`.
In `protectedProcedure`, after the `ChatApiKey` lookup fails, look up the key in `UserApiKey`.

```typescript
// Add inside protectedProcedure keyHash lookup chain
const userApiKey = await ctx.db.userApiKey.findUnique({
  where: { keyHash },
  include: { user: true },
});

if (userApiKey && !userApiKey.revokedAt) {
  authType = "user-api-key";
  user = userApiKey.user;
} else if (!chatApiKey || chatApiKey.revokedAt) {
  throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid API key" });
}
```

**Step 2: Type check to verify**
Run: `pnpm --filter @dko/trpc check-types`
Expected: Passes type checking.

**Step 3: Commit**
Run: `git add packages/trpc/src/trpc.ts && git commit -m "feat: add user-api-key auth resolution to protectedProcedure"`

---

### Task 3: Secure Chat Access Validation (assertChatAccess)

**Files:**

- Modify: `packages/trpc/src/middleware/chatScope.ts`
- Modify: All files calling `assertChatScope` in `packages/trpc/src/routers/`

**Step 1: Rewrite assertChatScope to assertChatAccess**
Rewrite to an async function that queries `db.chatMember`.

```typescript
export async function assertChatAccess(
  session: SessionWithScope,
  db: any,
  inputChatId: bigint | number
): Promise<void> {
  const inputAsBigInt =
    typeof inputChatId === "number" ? BigInt(inputChatId) : inputChatId;

  if (session.authType === "superadmin") return;

  if (session.authType === "chat-api-key") {
    if (session.chatId !== inputAsBigInt) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This API key does not have access to the requested chat",
      });
    }
    return;
  }

  // telegram or user-api-key auth MUST verify membership
  if (!session.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User not authenticated",
    });
  }

  const isMember = await db.chatMember.findUnique({
    where: {
      chatId_userId: {
        chatId: inputAsBigInt,
        userId: session.user.id,
      },
    },
  });

  if (!isMember) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this chat",
    });
  }
}
```

**Step 2: Update all callers of assertChatScope**
Use Glob/Grep to find all usages of `assertChatScope`.
Change to: `await assertChatAccess(ctx.session, ctx.db, input.chatId);`

**Step 3: Type check**
Run: `pnpm --filter @dko/trpc check-types`
Expected: Passes.

**Step 4: Commit**
Run: `git add packages/trpc/src && git commit -m "fix(security): enforce strict db-level chat membership checks"`

---

### Task 4: Add User API Key Management Procedures

**Files:**

- Modify: `packages/trpc/src/routers/apiKey/index.ts`
- Create: `packages/trpc/src/routers/apiKey/generateUserToken.ts`
- Create: `packages/trpc/src/routers/apiKey/listUserTokens.ts`
- Create: `packages/trpc/src/routers/apiKey/revokeUserToken.ts`

**Step 1: Implement listUserTokens**
Return all active tokens for `ctx.session.user.id` (where `revokedAt === null`). Block if not `telegram` auth.

**Step 2: Implement generateUserToken**
Generate 48 bytes, `usk_` + base64url, hash with sha256. Store in `UserApiKey`. Return raw key.

**Step 3: Implement revokeUserToken**
Accept `{ tokenId: string }`. Update `UserApiKey` setting `revokedAt: new Date()` where `id = input.tokenId` AND `userId = ctx.session.user.id`.

**Step 4: Wire to apiKeyRouter**
Export them in `apiKeyRouter` index file.

**Step 5: Type check**
Run: `pnpm --filter @dko/trpc check-types`
Expected: Passes.

**Step 6: Commit**
Run: `git add packages/trpc/src/routers/apiKey && git commit -m "feat: add user-api-key management endpoints"`

---

### Task 5: Frontend Settings Page UI

**Files:**

- Create: `apps/web/src/routes/_tma/settings/api-keys.tsx`
- Modify: `apps/web/src/routeTree.gen.ts` (Auto-generated by TanStack router, run `pnpm dev` briefly to generate)

**Step 1: Create the Route Component**
Build a simple list view mapping over `trpc.apiKey.listUserTokens.useQuery()`.
Add a "Generate New Key" button that calls `generateUserToken.useMutation()` and displays a modal with the raw key and a copy button.
Add "Revoke" buttons mapping to `revokeUserToken.useMutation()`.

**Step 2: Build and Type Check Web App**
Run: `pnpm --filter web check-types`
Run: `pnpm --filter web lint`

**Step 3: Commit**
Run: `git add apps/web && git commit -m "feat(ui): add user API keys management page"`
