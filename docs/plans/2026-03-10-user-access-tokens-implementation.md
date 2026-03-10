# User Access Tokens Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow regular users to securely generate and manage chat-scoped API keys (Access Tokens) for AI agents directly from the Banana Split Web App.

**Architecture:** Add new TRPC endpoints `generateToken`, `listTokens`, and `revokeToken` inside `packages/trpc/src/routers/apiKey`. These endpoints will verify that the requesting Telegram user is an active member of the `chatId` before performing operations on `db.chatApiKey`. On the frontend, a new "Access Tokens" modal/page will be added within the Group Settings, featuring a "Generate Token" button and a list of active tokens with "Revoke" functionality.

**Tech Stack:** tRPC, Prisma, React, Tailwind CSS, lucide-react (icons).

---

### Task 1: Backend - Define `apiKey` router schema updates

**Files:**

- Create: `packages/trpc/src/routers/apiKey/generateToken.ts`
- Create: `packages/trpc/src/routers/apiKey/listTokens.ts`
- Create: `packages/trpc/src/routers/apiKey/revokeToken.ts`
- Modify: `packages/trpc/src/routers/apiKey/index.ts`

**Step 1: Write the failing test**
There are no existing tests for TRPC routers locally. We will implement the handlers directly.

**Step 2: Write minimal implementation for `generateToken.ts`**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
});

export const generateTokenHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  userId?: bigint
) => {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User must be authenticated via Telegram",
    });
  }

  // Verify chat membership
  const member = await db.chatMember.findUnique({
    where: { chatId_userId: { chatId: input.chatId, userId } },
  });

  if (!member) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this chat",
    });
  }

  const rawKey = `bsk_${crypto.randomBytes(48).toString("base64url")}`;
  const hashedKey = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.substring(0, 8);

  await db.chatApiKey.create({
    data: {
      chatId: input.chatId,
      hashedKey,
      keyPrefix,
      createdById: userId,
    },
  });

  return { rawKey, keyPrefix };
};
```

**Step 3: Write minimal implementation for `listTokens.ts`**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
});

export const listTokensHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  userId?: bigint
) => {
  if (!userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const member = await db.chatMember.findUnique({
    where: { chatId_userId: { chatId: input.chatId, userId } },
  });

  if (!member) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  const tokens = await db.chatApiKey.findMany({
    where: { chatId: input.chatId },
    select: {
      id: true,
      keyPrefix: true,
      createdAt: true,
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
          username: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return tokens.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
  }));
};
```

**Step 4: Write minimal implementation for `revokeToken.ts`**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  tokenId: z.string().uuid(),
});

export const revokeTokenHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  userId?: bigint
) => {
  if (!userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const member = await db.chatMember.findUnique({
    where: { chatId_userId: { chatId: input.chatId, userId } },
  });

  if (!member) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  await db.chatApiKey.delete({
    where: {
      id: input.tokenId,
      chatId: input.chatId, // Ensure it belongs to the chat
    },
  });

  return { success: true };
};
```

**Step 5: Modify `index.ts` to expose the new procedures**
Register the three new procedures using `protectedProcedure` in `packages/trpc/src/routers/apiKey/index.ts`.

**Step 6: Commit**

```bash
git add packages/trpc/src/routers/apiKey
git commit -m "feat(api): add user-facing token generation, listing, and revocation endpoints"
```

---

### Task 2: Frontend - Build Access Tokens UI Component

**Files:**

- Create: `apps/web/src/components/AccessTokens.tsx`
- Modify: `apps/web/src/pages/GroupSettings.tsx` (or equivalent location where Settings are rendered)

**Step 1: Write `AccessTokens.tsx` component**

```tsx
import React, { useState } from "react";
import { trpc } from "../utils/trpc"; // adjust path to TRPC hook
import { Key, Trash2, Copy, Check } from "lucide-react";

export function AccessTokens({ chatId }: { chatId: number }) {
  const [copied, setCopied] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: tokens, isLoading } = trpc.apiKey.listTokens.useQuery({
    chatId,
  });
  const generateMutation = trpc.apiKey.generateToken.useMutation({
    onSuccess: (data) => {
      setNewRawKey(data.rawKey);
      utils.apiKey.listTokens.invalidate({ chatId });
    },
  });
  const revokeMutation = trpc.apiKey.revokeToken.useMutation({
    onSuccess: () => utils.apiKey.listTokens.invalidate({ chatId }),
  });

  const handleCopy = () => {
    if (newRawKey) {
      navigator.clipboard.writeText(newRawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Access Tokens</h3>
        <button
          onClick={() => generateMutation.mutate({ chatId })}
          disabled={generateMutation.isPending}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          {generateMutation.isPending ? "Generating..." : "Generate New Token"}
        </button>
      </div>

      {newRawKey && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
          <p className="mb-2 text-sm font-medium text-yellow-800">
            Keep this token safe! It grants full access to this group's expenses
            and will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded border bg-white px-2 py-1 text-sm">
              {newRawKey}
            </code>
            <button
              onClick={handleCopy}
              className="rounded border bg-white p-2 hover:bg-gray-50"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading tokens...</p>
      ) : tokens?.length === 0 ? (
        <p className="text-sm italic text-gray-500">
          No access tokens generated yet.
        </p>
      ) : (
        <div className="space-y-2">
          {tokens?.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between rounded-md border bg-gray-50 p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-gray-500" />
                  <span className="font-mono text-sm">
                    {token.keyPrefix}••••••••
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Created by {token.createdBy.firstName} on{" "}
                  {new Date(token.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => {
                  if (
                    confirm(
                      "Are you sure you want to revoke this token? Any agent using it will immediately lose access."
                    )
                  ) {
                    revokeMutation.mutate({ chatId, tokenId: token.id });
                  }
                }}
                disabled={revokeMutation.isPending}
                className="rounded p-2 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Integrate `AccessTokens` into Group Settings**
Modify `apps/web/src/pages/GroupSettings.tsx` (or `ChatDetails.tsx` if that's what it is called) to render `<AccessTokens chatId={Number(chatId)} />`. Note: you'll need to explore `apps/web/src/` to find the correct parent component where settings are rendered.

**Step 3: Run the web app to verify**
Ensure the UI builds and the React component renders correctly within the settings page.

**Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add Access Tokens management UI to group settings"
```
