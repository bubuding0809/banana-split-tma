# Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace today's monolithic chat settings page with an iOS / Telegram-iOS hub-and-spoke layout — clean menu hub plus one focused sub-page per concern. Add a Members roster and require user-supplied names on API tokens.

**Architecture:** Eight new TanStack Router routes under `/_tma/chat/$chatId_/settings/*`. New `SettingsHubPage` replaces the current monolithic component. New tRPC procedures: `chat.listMembers`, `apiKey.renameToken`, `apiKey.renameUserToken`. Modified procedures: `apiKey.generateToken`, `apiKey.generateUserToken` (require `name`), `apiKey.listTokens`, `apiKey.listUserTokens` (return `name`). Single Prisma migration adds `name` (NOT NULL) to `ChatApiKey` and `UserApiKey` with in-migration back-fill.

**Tech Stack:** TanStack Router (file-based), Telegram-UI components (`Section`, `Cell`, `ButtonCell`, `Switch`, `Modal`), `lucide-react` icons, Prisma + Postgres, tRPC, vitest for backend unit tests, Telegram Mini App SDK (haptics, back button, init-data signals).

**Spec:** [docs/superpowers/specs/2026-04-25-settings-redesign-design.md](../specs/2026-04-25-settings-redesign-design.md)

---

## Phase 1 — Backend (Prisma + tRPC)

### Task 1: Schema migration — add `name` to API key tables

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<TS>_add_token_name/migration.sql`

- [ ] **Step 1: Edit `schema.prisma`**

Add `name String` to both API key models. Find `model ChatApiKey` and `model UserApiKey` blocks (around lines 165–189) and add a `name` line:

```prisma
model ChatApiKey {
  id          String    @id @default(uuid())
  keyHash     String    @unique
  keyPrefix   String
  name        String    // NEW
  chatId      BigInt
  // ... rest unchanged
}

model UserApiKey {
  id        String    @id @default(uuid())
  keyHash   String    @unique
  keyPrefix String
  name      String    // NEW
  userId    BigInt
  // ... rest unchanged
}
```

- [ ] **Step 2: Create empty migration**

Run: `pnpm --filter @dko/database exec prisma migrate dev --create-only --name add_token_name`

Expected: a new directory `packages/database/prisma/migrations/<timestamp>_add_token_name/` is created with a `migration.sql` containing default SQL (Prisma will likely emit `ALTER TABLE ... ADD COLUMN "name" TEXT NOT NULL`, which would fail on existing rows).

- [ ] **Step 3: Replace migration SQL with the safe back-fill version**

Overwrite the generated `migration.sql` with:

```sql
-- Add name column nullable so existing rows survive
ALTER TABLE "ChatApiKey" ADD COLUMN "name" TEXT;
ALTER TABLE "UserApiKey" ADD COLUMN "name" TEXT;

-- Back-fill from createdAt: "Token · Mar 14"
UPDATE "ChatApiKey"
SET "name" = 'Token · ' || TO_CHAR("createdAt", 'Mon DD');
UPDATE "UserApiKey"
SET "name" = 'Token · ' || TO_CHAR("createdAt", 'Mon DD');

-- Tighten to NOT NULL now that every row is populated
ALTER TABLE "ChatApiKey" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "UserApiKey" ALTER COLUMN "name" SET NOT NULL;
```

- [ ] **Step 4: Apply migration locally**

Run: `pnpm --filter @dko/database db:migrate`

Expected: migration applies cleanly. If you have local rows, verify with:
`pnpm --filter @dko/database exec prisma studio` — open `ChatApiKey` and `UserApiKey`, confirm `name` is populated.

- [ ] **Step 5: Regenerate Prisma client**

Run: `pnpm --filter @dko/database db:generate`

Expected: TypeScript types for `ChatApiKey` and `UserApiKey` now include `name: string`.

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): require name on ChatApiKey and UserApiKey"
```

---

### Task 2: Update `apiKey.generateToken` (chat) — require `name`

**Files:**
- Modify: `packages/trpc/src/routers/apiKey/generateToken.ts`
- Create: `packages/trpc/src/routers/apiKey/generateToken.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/trpc/src/routers/apiKey/generateToken.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { generateTokenHandler } from "./generateToken.js";

// Minimal in-memory db stub — only the methods this handler calls.
function makeDb(opts: { isMember: boolean }) {
  let lastCreate: any;
  return {
    chat: {
      findFirst: async () => (opts.isMember ? { id: 1n } : null),
    },
    chatApiKey: {
      create: async ({ data }: any) => {
        lastCreate = data;
        return { id: "uuid", ...data };
      },
    },
    _lastCreate: () => lastCreate,
  } as any;
}

describe("generateTokenHandler", () => {
  it("rejects empty name after trim", async () => {
    const db = makeDb({ isMember: true });
    await expect(
      generateTokenHandler({ chatId: 1n, name: "   " }, db, 42)
    ).rejects.toThrow(TRPCError);
  });

  it("trims and persists name on the row", async () => {
    const db = makeDb({ isMember: true });
    await generateTokenHandler({ chatId: 1n, name: "  CLI Mac  " }, db, 42);
    expect(db._lastCreate().name).toBe("CLI Mac");
  });

  it("rejects non-members with FORBIDDEN", async () => {
    const db = makeDb({ isMember: false });
    await expect(
      generateTokenHandler({ chatId: 1n, name: "CLI" }, db, 42)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm --filter @dko/trpc test -- generateToken.test`

Expected: FAIL — `generateTokenHandler` does not accept a `name` field, TypeScript also fails the call.

- [ ] **Step 3: Update the handler**

Replace `packages/trpc/src/routers/apiKey/generateToken.ts` body:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  name: z.string().trim().min(1, "Name is required").max(40, "Name too long"),
});

const outputSchema = z.object({
  rawKey: z.string(),
  keyPrefix: z.string(),
});

export const generateTokenHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  userId?: number
) => {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User must be authenticated via Telegram",
    });
  }

  // Schema validates min(1) after trim, but the handler can also be called
  // directly from tests/internal code that bypasses zod — guard explicitly.
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Name is required" });
  }

  const bigUserId = BigInt(userId);

  const chat = await db.chat.findFirst({
    where: {
      id: input.chatId,
      members: { some: { id: bigUserId } },
    },
  });

  if (!chat) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this chat",
    });
  }

  const randomBytes = crypto.randomBytes(48);
  const rawKey = `bsk_${randomBytes.toString("base64url")}`;
  const keyPrefix = rawKey.slice(0, 8);
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  await db.chatApiKey.create({
    data: {
      keyHash,
      keyPrefix,
      name: trimmedName,
      chatId: input.chatId,
      createdById: bigUserId,
    },
  });

  return { rawKey, keyPrefix };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return generateTokenHandler(input, ctx.db, ctx.session.user?.id);
  });
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm --filter @dko/trpc test -- generateToken.test`

Expected: PASS, all three cases.

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @dko/trpc check-types`

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/trpc/src/routers/apiKey/generateToken.ts packages/trpc/src/routers/apiKey/generateToken.test.ts
git commit -m "feat(trpc): require name on apiKey.generateToken"
```

---

### Task 3: Update `apiKey.generateUserToken` (user) — require `name`

**Files:**
- Modify: `packages/trpc/src/routers/apiKey/generateUserToken.ts`
- Create: `packages/trpc/src/routers/apiKey/generateUserToken.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { generateUserTokenHandler } from "./generateUserToken.js";

function makeDb() {
  let lastCreate: any;
  return {
    userApiKey: {
      create: async ({ data }: any) => {
        lastCreate = data;
        return { id: "uuid", ...data };
      },
    },
    _lastCreate: () => lastCreate,
  } as any;
}

describe("generateUserTokenHandler", () => {
  it("rejects empty name after trim", async () => {
    const db = makeDb();
    await expect(
      generateUserTokenHandler({ name: "   " }, db, 42)
    ).rejects.toThrow(TRPCError);
  });

  it("trims and persists name", async () => {
    const db = makeDb();
    await generateUserTokenHandler({ name: "  CLI  " }, db, 42);
    expect(db._lastCreate().name).toBe("CLI");
  });

  it("requires authentication", async () => {
    const db = makeDb();
    await expect(
      generateUserTokenHandler({ name: "CLI" }, db, undefined)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

`pnpm --filter @dko/trpc test -- generateUserToken.test` → fails.

- [ ] **Step 3: Update handler**

Replace `generateUserToken.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40, "Name too long"),
});

const outputSchema = z.object({
  rawKey: z.string(),
  keyPrefix: z.string(),
});

export const generateUserTokenHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  userId?: number
) => {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User must be authenticated via Telegram",
    });
  }

  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Name is required" });
  }

  const bigUserId = BigInt(userId);

  const randomBytes = crypto.randomBytes(48);
  const rawKey = `usk_${randomBytes.toString("base64url")}`;
  const keyPrefix = rawKey.slice(0, 8);
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  await db.userApiKey.create({
    data: {
      keyHash,
      keyPrefix,
      name: trimmedName,
      userId: bigUserId,
    },
  });

  return { rawKey, keyPrefix };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return generateUserTokenHandler(input, ctx.db, ctx.session.user?.id);
  });
```

- [ ] **Step 4: Run test — verify PASS**

`pnpm --filter @dko/trpc test -- generateUserToken.test` → passes.

- [ ] **Step 5: Type-check**

`pnpm --filter @dko/trpc check-types` → clean.

- [ ] **Step 6: Commit**

```bash
git add packages/trpc/src/routers/apiKey/generateUserToken.ts packages/trpc/src/routers/apiKey/generateUserToken.test.ts
git commit -m "feat(trpc): require name on apiKey.generateUserToken"
```

---

### Task 4: Add `apiKey.renameToken` (chat)

**Files:**
- Create: `packages/trpc/src/routers/apiKey/renameToken.ts`
- Create: `packages/trpc/src/routers/apiKey/renameToken.test.ts`
- Modify: `packages/trpc/src/routers/apiKey/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/trpc/src/routers/apiKey/renameToken.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { renameTokenHandler } from "./renameToken.js";

function makeDb(opts: {
  isMember?: boolean;
  tokenExists?: boolean;
}) {
  const update = vi.fn(async ({ data }: any) => ({ id: "t1", name: data.name }));
  return {
    chat: {
      findFirst: async () => (opts.isMember ?? true ? { id: 1n } : null),
    },
    chatApiKey: {
      findFirst: async () => (opts.tokenExists ?? true ? { id: "t1" } : null),
      update,
    },
    _update: update,
  } as any;
}

describe("renameTokenHandler", () => {
  it("rejects empty name", async () => {
    const db = makeDb({});
    await expect(
      renameTokenHandler(
        { chatId: 1n, tokenId: "00000000-0000-0000-0000-000000000001", name: "  " },
        db,
        42
      )
    ).rejects.toThrow(TRPCError);
  });

  it("rejects non-members", async () => {
    const db = makeDb({ isMember: false });
    await expect(
      renameTokenHandler(
        { chatId: 1n, tokenId: "00000000-0000-0000-0000-000000000001", name: "Mac" },
        db,
        42
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("404s on missing token", async () => {
    const db = makeDb({ tokenExists: false });
    await expect(
      renameTokenHandler(
        { chatId: 1n, tokenId: "00000000-0000-0000-0000-000000000001", name: "Mac" },
        db,
        42
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("trims and saves on success", async () => {
    const db = makeDb({});
    await renameTokenHandler(
      { chatId: 1n, tokenId: "00000000-0000-0000-0000-000000000001", name: "  Mac CLI  " },
      db,
      42
    );
    expect(db._update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Mac CLI" } })
    );
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

`pnpm --filter @dko/trpc test -- renameToken.test` — fails (file doesn't exist).

- [ ] **Step 3: Create the handler**

`packages/trpc/src/routers/apiKey/renameToken.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  tokenId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(40, "Name too long"),
});

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const renameTokenHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  userId?: number
) => {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User must be authenticated via Telegram",
    });
  }

  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Name is required" });
  }

  const bigUserId = BigInt(userId);

  const chat = await db.chat.findFirst({
    where: {
      id: input.chatId,
      members: { some: { id: bigUserId } },
    },
  });
  if (!chat) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this chat",
    });
  }

  const token = await db.chatApiKey.findFirst({
    where: {
      id: input.tokenId,
      chatId: input.chatId,
      revokedAt: null,
    },
  });
  if (!token) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Token not found",
    });
  }

  const updated = await db.chatApiKey.update({
    where: { id: token.id },
    data: { name: trimmedName },
    select: { id: true, name: true },
  });

  return updated;
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return renameTokenHandler(input, ctx.db, ctx.session.user?.id);
  });
```

- [ ] **Step 4: Wire into router**

Edit `packages/trpc/src/routers/apiKey/index.ts`:

```ts
import { createTRPCRouter } from "../../trpc.js";
import generate from "./generate.js";
import revoke from "./revoke.js";
import getScope from "./getScope.js";
import generateToken from "./generateToken.js";
import listTokens from "./listTokens.js";
import revokeToken from "./revokeToken.js";
import renameToken from "./renameToken.js";  // NEW
import generateUserToken from "./generateUserToken.js";
import listUserTokens from "./listUserTokens.js";
import revokeUserToken from "./revokeUserToken.js";

export const apiKeyRouter = createTRPCRouter({
  generate,
  revoke,
  getScope,
  generateToken,
  listTokens,
  revokeToken,
  renameToken,  // NEW
  generateUserToken,
  listUserTokens,
  revokeUserToken,
});
```

- [ ] **Step 5: Run — verify PASS**

`pnpm --filter @dko/trpc test -- renameToken.test` → passes.

- [ ] **Step 6: Type-check + commit**

```bash
pnpm --filter @dko/trpc check-types
git add packages/trpc/src/routers/apiKey/renameToken.ts packages/trpc/src/routers/apiKey/renameToken.test.ts packages/trpc/src/routers/apiKey/index.ts
git commit -m "feat(trpc): add apiKey.renameToken"
```

---

### Task 5: Add `apiKey.renameUserToken` (user)

**Files:**
- Create: `packages/trpc/src/routers/apiKey/renameUserToken.ts`
- Create: `packages/trpc/src/routers/apiKey/renameUserToken.test.ts`
- Modify: `packages/trpc/src/routers/apiKey/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { renameUserTokenHandler } from "./renameUserToken.js";

function makeDb(opts: { tokenExists?: boolean }) {
  const update = vi.fn(async ({ data }: any) => ({ id: "t1", name: data.name }));
  return {
    userApiKey: {
      findFirst: async () => (opts.tokenExists ?? true ? { id: "t1" } : null),
      update,
    },
    _update: update,
  } as any;
}

describe("renameUserTokenHandler", () => {
  it("rejects empty name", async () => {
    const db = makeDb({});
    await expect(
      renameUserTokenHandler(
        { tokenId: "00000000-0000-0000-0000-000000000001", name: " " },
        db,
        42
      )
    ).rejects.toThrow(TRPCError);
  });

  it("404s on missing token", async () => {
    const db = makeDb({ tokenExists: false });
    await expect(
      renameUserTokenHandler(
        { tokenId: "00000000-0000-0000-0000-000000000001", name: "Mac" },
        db,
        42
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("trims and saves on success", async () => {
    const db = makeDb({});
    await renameUserTokenHandler(
      { tokenId: "00000000-0000-0000-0000-000000000001", name: "  My CLI  " },
      db,
      42
    );
    expect(db._update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "My CLI" } })
    );
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

`pnpm --filter @dko/trpc test -- renameUserToken.test` → fails.

- [ ] **Step 3: Create the handler**

`packages/trpc/src/routers/apiKey/renameUserToken.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  tokenId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(40, "Name too long"),
});

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const renameUserTokenHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  userId?: number
) => {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User must be authenticated via Telegram",
    });
  }

  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Name is required" });
  }

  const bigUserId = BigInt(userId);

  // Scope to this user — never let anyone rename a token they don't own.
  const token = await db.userApiKey.findFirst({
    where: {
      id: input.tokenId,
      userId: bigUserId,
      revokedAt: null,
    },
  });
  if (!token) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Token not found",
    });
  }

  const updated = await db.userApiKey.update({
    where: { id: token.id },
    data: { name: trimmedName },
    select: { id: true, name: true },
  });

  return updated;
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return renameUserTokenHandler(input, ctx.db, ctx.session.user?.id);
  });
```

- [ ] **Step 4: Wire into router**

Append `renameUserToken` to `apiKey/index.ts` import + router object (mirroring Task 4).

- [ ] **Step 5: Run + type-check**

```
pnpm --filter @dko/trpc test -- renameUserToken.test  # PASS
pnpm --filter @dko/trpc check-types                    # clean
```

- [ ] **Step 6: Commit**

```bash
git add packages/trpc/src/routers/apiKey/renameUserToken.ts packages/trpc/src/routers/apiKey/renameUserToken.test.ts packages/trpc/src/routers/apiKey/index.ts
git commit -m "feat(trpc): add apiKey.renameUserToken"
```

---

### Task 6: Add `chat.listMembers` (scrubbed roster)

**Why a new procedure instead of reusing `chat.getMembers`?** `chat.getMembers` returns full `User` rows including `phoneNumber`, exposing it to other chat members. We add a procedure with an explicit safe-field `select` so the new Members sub-page (and any future caller) never accidentally pulls the phone field.

**Files:**
- Create: `packages/trpc/src/routers/chat/listMembers.ts`
- Create: `packages/trpc/src/routers/chat/listMembers.test.ts`
- Modify: `packages/trpc/src/routers/chat/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { listMembersHandler } from "./listMembers.js";

function makeDb(members: any[]) {
  return {
    chat: {
      findUnique: async () => ({ members }),
    },
  } as any;
}

describe("listMembersHandler", () => {
  it("returns id / firstName / lastName / username only", async () => {
    const db = makeDb([
      {
        id: 100n,
        firstName: "Ruoqian",
        lastName: "Ding",
        username: "bubuding",
      },
    ]);
    const result = await listMembersHandler({ chatId: 1 }, db);
    expect(result).toEqual([
      {
        id: "100",
        firstName: "Ruoqian",
        lastName: "Ding",
        username: "bubuding",
      },
    ]);
  });

  it("returns [] when chat is missing", async () => {
    const db = {
      chat: { findUnique: async () => null },
    } as any;
    const result = await listMembersHandler({ chatId: 999 }, db);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

`pnpm --filter @dko/trpc test -- listMembers.test` → fails.

- [ ] **Step 3: Create handler**

`packages/trpc/src/routers/chat/listMembers.ts`:

```ts
import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({ chatId: z.number() });

const outputSchema = z.array(
  z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    username: z.string().nullable(),
  })
);

export const listMembersHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<z.infer<typeof outputSchema>> => {
  const chat = await db.chat.findUnique({
    where: { id: input.chatId },
    select: {
      members: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
        },
        orderBy: { firstName: "asc" },
      },
    },
  });

  if (!chat) return [];

  return chat.members.map((m) => ({
    id: m.id.toString(),
    firstName: m.firstName,
    lastName: m.lastName,
    username: m.username,
  }));
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return listMembersHandler(input, ctx.db);
  });
```

- [ ] **Step 4: Wire into router**

Edit `packages/trpc/src/routers/chat/index.ts`. Add import and entry alphabetically:

```ts
import listMembers from "./listMembers.js";
// ...
export const chatRouter = createTRPCRouter({
  // ... existing entries
  listMembers,  // NEW
});
```

- [ ] **Step 5: Run + type-check**

```
pnpm --filter @dko/trpc test -- listMembers.test
pnpm --filter @dko/trpc check-types
```

Both clean.

- [ ] **Step 6: Commit**

```bash
git add packages/trpc/src/routers/chat/listMembers.ts packages/trpc/src/routers/chat/listMembers.test.ts packages/trpc/src/routers/chat/index.ts
git commit -m "feat(trpc): add chat.listMembers (scrubbed roster)"
```

---

### Task 7: Update `apiKey.listTokens` output to include `name`

**Files:**
- Modify: `packages/trpc/src/routers/apiKey/listTokens.ts`

- [ ] **Step 1: Update output schema and select**

Open `listTokens.ts`. Update the `outputSchema` and the `select` block:

```ts
const outputSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),       // NEW
    keyPrefix: z.string(),
    createdAt: z.string(),
    createdBy: z.object({
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      username: z.string().nullable(),
    }),
  })
);

// ... inside listTokensHandler:
const tokens = await db.chatApiKey.findMany({
  where: {
    chatId: input.chatId,
    revokedAt: null,
  },
  select: {
    id: true,
    name: true,  // NEW
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
```

- [ ] **Step 2: Type-check**

`pnpm --filter @dko/trpc check-types` → clean.

- [ ] **Step 3: Commit**

```bash
git add packages/trpc/src/routers/apiKey/listTokens.ts
git commit -m "feat(trpc): include name on apiKey.listTokens output"
```

---

### Task 8: Update `apiKey.listUserTokens` output to include `name`

**Files:**
- Modify: `packages/trpc/src/routers/apiKey/listUserTokens.ts`

- [ ] **Step 1: Update the output schema**

Open `listUserTokens.ts`. Locate the `outputSchema` block and add `name`:

```ts
const outputSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),       // NEW
    keyPrefix: z.string(),
    createdAt: z.string(),
  })
);
```

- [ ] **Step 2: Update the Prisma select**

Locate the `db.userApiKey.findMany({ select: { ... } })` block in the same file. Add `name: true`:

```ts
const tokens = await db.userApiKey.findMany({
  where: {
    userId: bigUserId,
    revokedAt: null,
  },
  select: {
    id: true,
    name: true,             // NEW
    keyPrefix: true,
    createdAt: true,
  },
  orderBy: { createdAt: "desc" },
});
```

- [ ] **Step 3: Type-check**

`pnpm --filter @dko/trpc check-types` → clean.

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/src/routers/apiKey/listUserTokens.ts
git commit -m "feat(trpc): include name on apiKey.listUserTokens output"
```

---

## Phase 2 — Shared UI primitives

### Task 9: `IconSquare` component + color tokens

**Why:** Hub and most sub-pages use solid-color rounded squares as the leading icon for each row. Define once, reuse everywhere — keeps the visual language consistent and the per-page JSX small.

**Files:**
- Create: `apps/web/src/components/features/Settings/IconSquare.tsx`

- [ ] **Step 1: Create the component**

`apps/web/src/components/features/Settings/IconSquare.tsx`:

```tsx
import type { ReactNode } from "react";

// iOS Settings-style colored icon backgrounds. Solid color, white glyph.
export const ICON_COLOR = {
  blue: "#007aff",
  green: "#34c759",
  purple: "#af52de",
  orange: "#ff9500",
  red: "#ff3b30",
  gray: "#8e8e93",
  indigo: "#5856d6",
  teal: "#5ac8fa",
  pink: "#ff2d55",
} as const;

export type IconColor = keyof typeof ICON_COLOR;

interface IconSquareProps {
  color: IconColor;
  children: ReactNode;
}

export default function IconSquare({ color, children }: IconSquareProps) {
  return (
    <span
      className="flex size-7 items-center justify-center rounded-md text-white"
      style={{ background: ICON_COLOR[color] }}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

`pnpm --filter web check-types` → clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Settings/IconSquare.tsx
git commit -m "feat(web): add Settings IconSquare primitive"
```

---

### Task 10: `ChatHeader` component (avatar + title + member-stack)

**Files:**
- Create: `apps/web/src/components/features/Settings/ChatHeader.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Avatar } from "@telegram-apps/telegram-ui";

interface MemberPreview {
  id: string;
  firstName: string;
  lastName: string | null;
}

interface ChatHeaderProps {
  avatarUrl?: string;
  title: string;
  subtitle: string;
  /** Preview avatars for the member-stack (group only). Pass [] to hide. */
  members?: MemberPreview[];
  /** Total member count, used for the "+N" overflow chip. */
  memberCount?: number;
  onMembersClick?: () => void;
}

const MAX_PREVIEW = 4;

function initials(m: MemberPreview): string {
  const first = m.firstName?.[0] ?? "";
  const last = m.lastName?.[0] ?? "";
  return (first + last).toUpperCase() || "?";
}

export default function ChatHeader({
  avatarUrl,
  title,
  subtitle,
  members = [],
  memberCount = 0,
  onMembersClick,
}: ChatHeaderProps) {
  const previewMembers = members.slice(0, MAX_PREVIEW - (memberCount > MAX_PREVIEW ? 1 : 0));
  const overflow = Math.max(0, memberCount - previewMembers.length);

  return (
    <div className="flex flex-col items-center px-4 pt-4 pb-3">
      <Avatar size={96} src={avatarUrl} acronym={title.slice(0, 2).toUpperCase()} />
      <div className="mt-2 text-base font-semibold">{title}</div>
      <div className="text-(--tg-theme-subtitle-text-color) text-sm">{subtitle}</div>

      {previewMembers.length > 0 && (
        <button
          type="button"
          onClick={onMembersClick}
          className="mt-3 flex"
          aria-label="View members"
        >
          {previewMembers.map((m, i) => (
            <span
              key={m.id}
              className="bg-(--tg-theme-secondary-bg-color) flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{
                marginLeft: i === 0 ? 0 : -8,
                background: stableMemberGradient(m.id),
                border: "2px solid var(--tg-theme-bg-color)",
              }}
            >
              {initials(m)}
            </span>
          ))}
          {overflow > 0 && (
            <span
              className="flex size-8 items-center justify-center rounded-full bg-gray-300 text-xs font-semibold text-gray-700"
              style={{ marginLeft: -8, border: "2px solid var(--tg-theme-bg-color)" }}
            >
              +{overflow}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

// Deterministic gradient per member id so colors don't reshuffle across renders.
function stableMemberGradient(id: string): string {
  const palette = [
    "linear-gradient(135deg, #4facfe, #00f2fe)",
    "linear-gradient(135deg, #43e97b, #38f9d7)",
    "linear-gradient(135deg, #fa709a, #fee140)",
    "linear-gradient(135deg, #a18cd1, #fbc2eb)",
    "linear-gradient(135deg, #ff9966, #ff5e62)",
    "linear-gradient(135deg, #5ee7df, #b490ca)",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}
```

- [ ] **Step 2: Type-check**

`pnpm --filter web check-types` → clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Settings/ChatHeader.tsx
git commit -m "feat(web): add Settings ChatHeader (avatar + title + member-stack)"
```

---

## Phase 3 — Hub

### Task 11: `SettingsHubPage` + wire it as the index route

**Files:**
- Create: `apps/web/src/components/features/Settings/SettingsHubPage.tsx`
- Modify: `apps/web/src/routes/_tma/chat.$chatId_.settings.index.tsx`

- [ ] **Step 1: Create `SettingsHubPage`**

This is the new top-level component. It mirrors the section structure from the spec: chat header, then `Group` / `Notifications` / `Personal` sections. For private chats it collapses to just `Personal`.

```tsx
import { useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  initData,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Cell, Section } from "@telegram-apps/telegram-ui";
import {
  Bell,
  ChevronRight,
  Clock,
  DollarSign,
  Key,
  Tag,
  User as UserIcon,
  Users,
} from "lucide-react";
import { trpc } from "@/utils/trpc";
import ChatHeader from "./ChatHeader";
import IconSquare, { type IconColor } from "./IconSquare";

interface SettingsHubPageProps {
  chatId: number;
}

export default function SettingsHubPage({ chatId }: SettingsHubPageProps) {
  const navigate = useNavigate();
  const tUserData = useSignal(initData.user);
  const userId = tUserData?.id ?? 0;
  const isPrivateChat = userId === chatId;

  const { data: chat } = trpc.chat.getChat.useQuery({ chatId });
  const { data: members } = trpc.chat.listMembers.useQuery(
    { chatId },
    { enabled: !isPrivateChat }
  );
  const { data: schedule } = trpc.aws.getChatSchedule.useQuery(
    { chatId },
    { enabled: !isPrivateChat }
  );
  const { data: tokens } = isPrivateChat
    ? trpc.apiKey.listUserTokens.useQuery({})
    : trpc.apiKey.listTokens.useQuery({ chatId });
  const { data: userData } = trpc.user.getUser.useQuery(
    { userId },
    { enabled: userId !== 0 }
  );

  // Back button → chat.
  useEffect(() => {
    backButton.show();
    return () => {
      backButton.hide();
    };
  }, []);
  useEffect(() => {
    const off = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      if (isPrivateChat) {
        navigate({ to: "/chat", search: (prev) => ({ ...prev, title: "" }) });
      } else {
        navigate({ to: "..", search: (prev) => ({ ...prev, title: "" }) });
      }
    });
    return () => off();
  }, [navigate, isPrivateChat]);

  const goto = useCallback(
    (sub: string) => {
      hapticFeedback.impactOccurred("light");
      navigate({
        to: `/chat/$chatId/settings/${sub}` as any,
        params: { chatId: String(chatId) },
      });
    },
    [chatId, navigate]
  );

  const notificationsOnCount = [
    chat?.notifyOnExpense,
    chat?.notifyOnExpenseUpdate,
    chat?.notifyOnSettlement,
  ].filter(Boolean).length;

  const reminderPreview = schedule?.enabled
    ? `${schedule.dayOfWeek?.slice(0, 3) ?? ""} ${schedule.time ?? ""}`.trim()
    : "Off";

  const categoryPreview = "Manage tiles"; // No count query yet — keep static; categories sub-page shows full breakdown.

  return (
    <main className="px-3 pb-8">
      <ChatHeader
        avatarUrl={chat?.photo}
        title={chat?.title ?? "..."}
        subtitle={
          isPrivateChat
            ? "Personal chat"
            : `Group · ${members?.length ?? 0} members`
        }
        members={isPrivateChat ? [] : (members ?? [])}
        memberCount={members?.length ?? 0}
        onMembersClick={() => goto("members")}
      />

      {!isPrivateChat && (
        <Section header="Group">
          <RowLink
            color="teal"
            icon={<Users size={16} />}
            label="Members"
            value={String(members?.length ?? "")}
            onClick={() => goto("members")}
          />
          <RowLink
            color="blue"
            icon={<DollarSign size={16} />}
            label="Currency"
            value={chat?.baseCurrency}
            onClick={() => goto("currency")}
          />
          <RowLink
            color="green"
            icon={<Tag size={16} />}
            label="Categories"
            value={categoryPreview}
            onClick={() => goto("categories")}
          />
        </Section>
      )}

      {!isPrivateChat && (
        <Section header="Notifications">
          <RowLink
            color="orange"
            icon={<Bell size={16} />}
            label="Event alerts"
            value={`${notificationsOnCount} on`}
            onClick={() => goto("notifications")}
          />
          <RowLink
            color="purple"
            icon={<Clock size={16} />}
            label="Recurring reminder"
            value={reminderPreview}
            onClick={() => goto("reminders")}
          />
        </Section>
      )}

      <Section header="Personal">
        {isPrivateChat && (
          <>
            <RowLink
              color="blue"
              icon={<DollarSign size={16} />}
              label="Currency"
              value={chat?.baseCurrency}
              onClick={() => goto("currency")}
            />
            <RowLink
              color="green"
              icon={<Tag size={16} />}
              label="Categories"
              value={categoryPreview}
              onClick={() => goto("categories")}
            />
          </>
        )}
        <RowLink
          color="gray"
          icon={<UserIcon size={16} />}
          label="Account"
          value={userData?.phoneNumber ? "Phone added" : "No phone"}
          onClick={() => goto("account")}
        />
        <RowLink
          color="red"
          icon={<Key size={16} />}
          label="Developer"
          value={tokens?.length ? `${tokens.length} active` : undefined}
          onClick={() => goto("developer")}
        />
      </Section>
    </main>
  );
}

interface RowLinkProps {
  color: IconColor;
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
}

function RowLink({ color, icon, label, value, onClick }: RowLinkProps) {
  return (
    <Cell
      onClick={onClick}
      before={<IconSquare color={color}>{icon}</IconSquare>}
      after={
        <div className="flex items-center gap-1">
          {value && (
            <span className="text-(--tg-theme-subtitle-text-color) text-sm">
              {value}
            </span>
          )}
          <ChevronRight size={18} className="text-(--tg-theme-subtitle-text-color)" />
        </div>
      }
    >
      {label}
    </Cell>
  );
}
```

- [ ] **Step 2: Switch the index route to render `SettingsHubPage`**

`apps/web/src/routes/_tma/chat.$chatId_.settings.index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import SettingsHubPage from "@/components/features/Settings/SettingsHubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <SettingsHubPage chatId={Number(chatId)} />;
}
```

- [ ] **Step 3: Type-check**

`pnpm --filter web check-types`

Expected: clean. Note that some sub-routes the hub navigates to don't exist yet — that's OK because `to: "..." as any` bypasses route-tree typing for now. The tasks below add the routes, after which we can drop the `as any`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Settings/SettingsHubPage.tsx apps/web/src/routes/_tma/chat.$chatId_.settings.index.tsx
git commit -m "feat(web): replace settings index with hub page"
```

---

## Phase 4 — Sub-pages

For each sub-page below: create a route file under `apps/web/src/routes/_tma/`, create the component under `apps/web/src/components/features/Settings/`, run `pnpm --filter web check-types`, commit. Each route file is a thin TanStack Router shim — the component holds the logic.

### Task 12: Members sub-page

**Files:**
- Create: `apps/web/src/routes/_tma/chat.$chatId_.settings.members.tsx`
- Create: `apps/web/src/components/features/Settings/MembersSubPage.tsx`
- Create: `apps/web/src/components/features/Settings/MemberRow.tsx`
- Create: `apps/web/src/components/features/Settings/AddMemberSheet.tsx`

- [ ] **Step 1: Create the route**

```tsx
// apps/web/src/routes/_tma/chat.$chatId_.settings.members.tsx
import { createFileRoute } from "@tanstack/react-router";
import MembersSubPage from "@/components/features/Settings/MembersSubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/members")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <MembersSubPage chatId={Number(chatId)} />;
}
```

- [ ] **Step 2: Create `MemberRow`**

```tsx
// apps/web/src/components/features/Settings/MemberRow.tsx
import { Cell } from "@telegram-apps/telegram-ui";

interface MemberRowProps {
  member: {
    id: string;
    firstName: string;
    lastName: string | null;
    username: string | null;
  };
  isYou: boolean;
}

function fullName(m: MemberRowProps["member"]) {
  return [m.firstName, m.lastName].filter(Boolean).join(" ");
}
function initials(m: MemberRowProps["member"]) {
  const first = m.firstName?.[0] ?? "";
  const last = m.lastName?.[0] ?? "";
  return (first + last).toUpperCase() || "?";
}

export default function MemberRow({ member, isYou }: MemberRowProps) {
  return (
    <Cell
      before={
        <span className="flex size-10 items-center justify-center rounded-full bg-blue-200 text-sm font-semibold text-blue-700">
          {initials(member)}
        </span>
      }
      subtitle={member.username ? `@${member.username}` : "no username"}
      after={
        isYou ? (
          <span className="rounded bg-gray-400 px-2 py-0.5 text-xs font-medium text-white">
            You
          </span>
        ) : null
      }
    >
      {fullName(member)}
    </Cell>
  );
}
```

- [ ] **Step 3: Create `AddMemberSheet`**

```tsx
// apps/web/src/components/features/Settings/AddMemberSheet.tsx
import { Button, Modal, Section, Text, Title } from "@telegram-apps/telegram-ui";

interface AddMemberSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Placeholder for the upcoming Telegram contact-share flow. The actual flow
// will deeplink the user to the bot DM and trigger user_shared on a button
// press. Until that lands, we explain the eventual flow and dismiss.
export default function AddMemberSheet({ open, onOpenChange }: AddMemberSheetProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <div className="px-4 py-3">
        <Title level="2">Add a member</Title>
        <Text className="mt-2 block text-(--tg-theme-subtitle-text-color)">
          Soon you'll be able to share a contact with the bot in your private
          chat to add them here. We'll let you know once it's ready.
        </Text>
        <Button
          stretched
          mode="filled"
          className="mt-4"
          onClick={() => onOpenChange(false)}
        >
          Got it
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Create `MembersSubPage`**

```tsx
// apps/web/src/components/features/Settings/MembersSubPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { backButton, hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import { ButtonCell, Section, Skeleton } from "@telegram-apps/telegram-ui";
import { Plus } from "lucide-react";
import { trpc } from "@/utils/trpc";
import MemberRow from "./MemberRow";
import AddMemberSheet from "./AddMemberSheet";

interface MembersSubPageProps {
  chatId: number;
}

export default function MembersSubPage({ chatId }: MembersSubPageProps) {
  const navigate = useNavigate();
  const tUserData = useSignal(initData.user);
  const youId = tUserData?.id?.toString();

  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: members, status } = trpc.chat.listMembers.useQuery({ chatId });

  useEffect(() => {
    backButton.show();
    return () => backButton.hide();
  }, []);
  useEffect(() => {
    const off = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      navigate({
        to: "/chat/$chatId/settings",
        params: { chatId: String(chatId) },
      });
    });
    return () => off();
  }, [chatId, navigate]);

  return (
    <main className="px-3 pb-8">
      <Section header={`${members?.length ?? ""} members`} footer="Tap “Add Member” to share a contact via the bot DM. Coming soon.">
        <ButtonCell
          before={<Plus size={20} />}
          onClick={() => setSheetOpen(true)}
        >
          Add Member
        </ButtonCell>

        {status === "pending" ? (
          <Skeleton visible>{/* show 3 skeleton rows */}<div className="h-14" /></Skeleton>
        ) : (
          (members ?? []).map((m) => (
            <MemberRow key={m.id} member={m} isYou={m.id === youId} />
          ))
        )}
      </Section>

      <AddMemberSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </main>
  );
}
```

- [ ] **Step 5: Type-check + commit**

```bash
pnpm --filter web check-types
git add apps/web/src/routes/_tma/chat.$chatId_.settings.members.tsx apps/web/src/components/features/Settings/MembersSubPage.tsx apps/web/src/components/features/Settings/MemberRow.tsx apps/web/src/components/features/Settings/AddMemberSheet.tsx
git commit -m "feat(web): add Members sub-page"
```

---

### Task 13: Currency sub-page

**Files:**
- Create: `apps/web/src/routes/_tma/chat.$chatId_.settings.currency.tsx`
- Create: `apps/web/src/components/features/Settings/CurrencySubPage.tsx`

- [ ] **Step 1: Inspect `CurrencySelectionModal`**

Read `apps/web/src/components/ui/CurrencySelectionModal.tsx` to understand its props (`selectedCurrency`, `onCurrencySelect`, etc.) and the row-rendering helpers (`getFlagUrl`). The sub-page reuses the same data via `trpc.currency.getSupportedCurrencies` and the same flag URL helper.

- [ ] **Step 2: Create the route**

```tsx
// apps/web/src/routes/_tma/chat.$chatId_.settings.currency.tsx
import { createFileRoute } from "@tanstack/react-router";
import CurrencySubPage from "@/components/features/Settings/CurrencySubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/currency")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <CurrencySubPage chatId={Number(chatId)} />;
}
```

- [ ] **Step 3: Create the sub-page**

```tsx
// apps/web/src/components/features/Settings/CurrencySubPage.tsx
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import { Avatar, Cell, Section, Skeleton, Text } from "@telegram-apps/telegram-ui";
import { Check } from "lucide-react";
import { trpc } from "@/utils/trpc";

interface CurrencySubPageProps {
  chatId: number;
}

const getFlagUrl = (countryCode: string): string =>
  `https://hatscripts.github.io/circle-flags/flags/${countryCode.toLowerCase()}.svg`;

export default function CurrencySubPage({ chatId }: CurrencySubPageProps) {
  const navigate = useNavigate();
  const trpcUtils = trpc.useUtils();

  const { data: chat } = trpc.chat.getChat.useQuery({ chatId });
  const { data: currencies, status } = trpc.currency.getSupportedCurrencies.useQuery({});

  const updateChat = trpc.chat.updateChat.useMutation({
    onMutate: ({ baseCurrency }) => {
      trpcUtils.chat.getChat.setData({ chatId }, (prev) =>
        prev ? { ...prev, baseCurrency: baseCurrency ?? prev.baseCurrency } : prev
      );
    },
    onSuccess: () => trpcUtils.chat.getChat.invalidate({ chatId }),
  });

  useEffect(() => {
    backButton.show();
    return () => backButton.hide();
  }, []);
  useEffect(() => {
    const off = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      navigate({
        to: "/chat/$chatId/settings",
        params: { chatId: String(chatId) },
      });
    });
    return () => off();
  }, [chatId, navigate]);

  const select = (code: string) => {
    if (chat?.baseCurrency === code) return;
    hapticFeedback.notificationOccurred("success");
    updateChat.mutate({ chatId, baseCurrency: code });
  };

  const all = currencies ?? [];
  const selected = all.find((c) => c.code === chat?.baseCurrency);
  const others = all.filter((c) => c.code !== chat?.baseCurrency);

  return (
    <main className="px-3 pb-8">
      <Section header="Selected">
        <Skeleton visible={status === "pending"}>
          {selected ? (
            <Cell
              before={<Avatar size={32} src={getFlagUrl(selected.countryCode)}>{selected.flagEmoji}</Avatar>}
              subtitle={`${selected.code} · ${selected.symbol ?? ""}`}
              after={<Check size={18} />}
            >
              {selected.name}
            </Cell>
          ) : (
            <Cell><Text>Loading…</Text></Cell>
          )}
        </Skeleton>
      </Section>

      <Section header="All currencies" footer="Used as the base currency for splits in this chat.">
        {others.map((c) => (
          <Cell
            key={c.code}
            before={<Avatar size={32} src={getFlagUrl(c.countryCode)}>{c.flagEmoji}</Avatar>}
            subtitle={`${c.code} · ${c.symbol ?? ""}`}
            onClick={() => select(c.code)}
          >
            {c.name}
          </Cell>
        ))}
      </Section>
    </main>
  );
}
```

- [ ] **Step 4: Type-check + commit**

```bash
pnpm --filter web check-types
git add apps/web/src/routes/_tma/chat.$chatId_.settings.currency.tsx apps/web/src/components/features/Settings/CurrencySubPage.tsx
git commit -m "feat(web): add Currency sub-page"
```

---

### Task 14: Event alerts sub-page

**Files:**
- Create: `apps/web/src/routes/_tma/chat.$chatId_.settings.notifications.tsx`
- Create: `apps/web/src/components/features/Settings/EventAlertsSubPage.tsx`

- [ ] **Step 1: Route**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import EventAlertsSubPage from "@/components/features/Settings/EventAlertsSubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/notifications")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <EventAlertsSubPage chatId={Number(chatId)} />;
}
```

- [ ] **Step 2: Sub-page (lifts the toggle handlers from `ChatSettingsPage`)**

```tsx
import { useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import { Cell, Section, Switch } from "@telegram-apps/telegram-ui";
import { Bell, BellOff, BellRing } from "lucide-react";
import { trpc } from "@/utils/trpc";
import IconSquare from "./IconSquare";

interface EventAlertsSubPageProps {
  chatId: number;
}

export default function EventAlertsSubPage({ chatId }: EventAlertsSubPageProps) {
  const navigate = useNavigate();
  const trpcUtils = trpc.useUtils();
  const { data: chat } = trpc.chat.getChat.useQuery({ chatId });

  const updateChat = trpc.chat.updateChat.useMutation({
    onMutate: (input) => {
      trpcUtils.chat.getChat.setData({ chatId }, (prev) =>
        prev ? { ...prev, ...input } : prev
      );
    },
    onSuccess: () => trpcUtils.chat.getChat.invalidate({ chatId }),
  });

  useEffect(() => {
    backButton.show();
    return () => backButton.hide();
  }, []);
  useEffect(() => {
    const off = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      navigate({ to: "/chat/$chatId/settings", params: { chatId: String(chatId) } });
    });
    return () => off();
  }, [chatId, navigate]);

  const toggle = useCallback(
    (key: "notifyOnExpense" | "notifyOnExpenseUpdate" | "notifyOnSettlement") => {
      const next = !(chat?.[key] ?? true);
      updateChat.mutate(
        { chatId, [key]: next } as any,
        {
          onSuccess: () => hapticFeedback.notificationOccurred("success"),
          onError: () => hapticFeedback.notificationOccurred("error"),
        }
      );
    },
    [chat, chatId, updateChat]
  );

  return (
    <main className="px-3 pb-8">
      <Section
        header="Notify the group when…"
        footer="Reminders you send manually are unaffected by these settings."
      >
        <Cell
          Component="label"
          before={<IconSquare color="orange"><BellRing size={14} /></IconSquare>}
          after={
            <Switch
              checked={chat?.notifyOnExpense ?? true}
              onChange={() => toggle("notifyOnExpense")}
            />
          }
          onClick={() => toggle("notifyOnExpense")}
        >
          Expense added
        </Cell>
        <Cell
          Component="label"
          before={<IconSquare color="orange"><Bell size={14} /></IconSquare>}
          after={
            <Switch
              checked={chat?.notifyOnExpenseUpdate ?? true}
              onChange={() => toggle("notifyOnExpenseUpdate")}
            />
          }
          onClick={() => toggle("notifyOnExpenseUpdate")}
        >
          Expense updated
        </Cell>
        <Cell
          Component="label"
          before={<IconSquare color="orange"><BellOff size={14} /></IconSquare>}
          after={
            <Switch
              checked={chat?.notifyOnSettlement ?? true}
              onChange={() => toggle("notifyOnSettlement")}
            />
          }
          onClick={() => toggle("notifyOnSettlement")}
        >
          Settlement recorded
        </Cell>
      </Section>
    </main>
  );
}
```

- [ ] **Step 3: Type-check + commit**

```bash
pnpm --filter web check-types
git add apps/web/src/routes/_tma/chat.$chatId_.settings.notifications.tsx apps/web/src/components/features/Settings/EventAlertsSubPage.tsx
git commit -m "feat(web): add Event alerts sub-page"
```

---

### Task 15: Recurring reminder sub-page

**Files:**
- Create: `apps/web/src/routes/_tma/chat.$chatId_.settings.reminders.tsx`
- Create: `apps/web/src/components/features/Settings/RecurringReminderSubPage.tsx`

- [ ] **Step 1: Route**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import RecurringReminderSubPage from "@/components/features/Settings/RecurringReminderSubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/reminders")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <RecurringReminderSubPage chatId={Number(chatId)} />;
}
```

- [ ] **Step 2: Sub-page (lifts logic from `RecurringRemindersSection`)**

Read `apps/web/src/components/features/Settings/RecurringRemindersSection.tsx` for the existing toggle + edit-modal flow. Reproduce structurally:

```tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import { Cell, Navigation, Section, Skeleton, Switch } from "@telegram-apps/telegram-ui";
import { Calendar, Clock } from "lucide-react";
import { trpc } from "@/utils/trpc";
import EditReminderScheduleModal from "./EditReminderScheduleModal";
import IconSquare from "./IconSquare";

interface RecurringReminderSubPageProps {
  chatId: number;
}

export default function RecurringReminderSubPage({ chatId }: RecurringReminderSubPageProps) {
  const navigate = useNavigate();
  const trpcUtils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);

  const { data: schedule, status } = trpc.aws.getChatSchedule.useQuery({ chatId });
  const update = trpc.aws.updateGroupReminderSchedule.useMutation({
    onSuccess: () => trpcUtils.aws.getChatSchedule.invalidate({ chatId }),
    onError: () => hapticFeedback.notificationOccurred("error"),
  });

  useEffect(() => {
    backButton.show();
    return () => backButton.hide();
  }, []);
  useEffect(() => {
    const off = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      navigate({ to: "/chat/$chatId/settings", params: { chatId: String(chatId) } });
    });
    return () => off();
  }, [chatId, navigate]);

  const onToggle = useCallback(
    (enabled: boolean) => {
      hapticFeedback.notificationOccurred("success");
      update.mutate({ chatId, enabled });
    },
    [chatId, update]
  );

  const isLoading = status === "pending" || update.status === "pending";

  return (
    <main className="px-3 pb-8">
      <Section header="Status">
        <Cell
          Component="label"
          before={<IconSquare color="purple"><Clock size={14} /></IconSquare>}
          after={
            <Skeleton visible={status === "pending"}>
              <Switch
                checked={schedule?.enabled ?? false}
                onChange={(e) => onToggle(e.target.checked)}
                disabled={isLoading}
              />
            </Skeleton>
          }
        >
          Enabled
        </Cell>
      </Section>

      {schedule?.enabled && (
        <Section header="Schedule" footer="Sends a balance summary so the group settles up.">
          <Cell
            before={<IconSquare color="teal"><Calendar size={14} /></IconSquare>}
            subtitle={schedule.timezone}
            after={<Navigation>Edit</Navigation>}
            onClick={() => {
              hapticFeedback.impactOccurred("light");
              setEditOpen(true);
            }}
            disabled={isLoading}
          >
            Every <span className="capitalize">{schedule.dayOfWeek}</span>, at {schedule.time}
          </Cell>
        </Section>
      )}

      <EditReminderScheduleModal
        open={editOpen}
        onOpenChange={setEditOpen}
        chatId={chatId}
        initialValues={
          schedule
            ? {
                timezone: schedule.timezone,
                dayOfWeek: schedule.dayOfWeek || "sunday",
                time: schedule.time || "9pm",
              }
            : undefined
        }
      />
    </main>
  );
}
```

- [ ] **Step 3: Type-check + commit**

```bash
pnpm --filter web check-types
git add apps/web/src/routes/_tma/chat.$chatId_.settings.reminders.tsx apps/web/src/components/features/Settings/RecurringReminderSubPage.tsx
git commit -m "feat(web): add Recurring reminder sub-page"
```

---

### Task 16: Account sub-page

**Files:**
- Create: `apps/web/src/routes/_tma/chat.$chatId_.settings.account.tsx`
- Create: `apps/web/src/components/features/Settings/AccountSubPage.tsx`

- [ ] **Step 1: Route**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import AccountSubPage from "@/components/features/Settings/AccountSubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/account")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <AccountSubPage chatId={Number(chatId)} />;
}
```

- [ ] **Step 2: Sub-page (lifts personal-info handlers from `ChatSettingsPage`)**

```tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Avatar, ButtonCell, Cell, Navigation, Section, Text } from "@telegram-apps/telegram-ui";
import {
  backButton,
  hapticFeedback,
  initData,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Phone, X } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { useRequestContact } from "@/hooks";
import IconSquare from "./IconSquare";

interface AccountSubPageProps {
  chatId: number;
}

export default function AccountSubPage({ chatId }: AccountSubPageProps) {
  const navigate = useNavigate();
  const tUser = useSignal(initData.user);
  const userId = tUser?.id ?? 0;
  const { requestContactInfo, isSupported } = useRequestContact();
  const [busy, setBusy] = useState(false);

  const trpcUtils = trpc.useUtils();
  const { data: userData } = trpc.user.getUser.useQuery(
    { userId },
    { enabled: userId !== 0 }
  );
  const updateUser = trpc.user.updateUser.useMutation({
    onMutate: ({ phoneNumber }) => {
      trpcUtils.user.getUser.setData({ userId }, (prev) =>
        prev ? { ...prev, phoneNumber: phoneNumber ?? prev.phoneNumber } : prev
      );
    },
    onSuccess: () => trpcUtils.user.getUser.invalidate({ userId }),
  });

  useEffect(() => {
    backButton.show();
    return () => backButton.hide();
  }, []);
  useEffect(() => {
    const off = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      navigate({ to: "/chat/$chatId/settings", params: { chatId: String(chatId) } });
    });
    return () => off();
  }, [chatId, navigate]);

  const onAddPhone = useCallback(async () => {
    if (!isSupported) return;
    try {
      setBusy(true);
      const phone = await requestContactInfo();
      if (phone && userId) {
        await updateUser.mutateAsync({ userId, phoneNumber: phone });
        hapticFeedback.notificationOccurred("success");
      }
    } catch (err) {
      console.error("Failed to add phone:", err);
      hapticFeedback.notificationOccurred("error");
    } finally {
      setBusy(false);
    }
  }, [isSupported, requestContactInfo, userId, updateUser]);

  const onRemovePhone = useCallback(async () => {
    try {
      setBusy(true);
      await updateUser.mutateAsync({ userId, phoneNumber: null });
      hapticFeedback.notificationOccurred("success");
    } catch (err) {
      console.error("Failed to remove phone:", err);
      hapticFeedback.notificationOccurred("error");
    } finally {
      setBusy(false);
    }
  }, [userId, updateUser]);

  const fullName = [tUser?.firstName, tUser?.lastName].filter(Boolean).join(" ");

  return (
    <main className="px-3 pb-8">
      <div className="flex flex-col items-center px-4 pt-4 pb-3">
        <Avatar size={64} acronym={(tUser?.firstName?.[0] ?? "?").toUpperCase()} src={tUser?.photoUrl} />
        <div className="mt-2 text-base font-semibold">{fullName || "You"}</div>
        {tUser?.username && (
          <div className="text-(--tg-theme-subtitle-text-color) text-sm">@{tUser.username}</div>
        )}
      </div>

      <Section header="Contact" footer="Only used so the bot can recognize you across chats.">
        <Cell
          before={<IconSquare color="green"><Phone size={14} /></IconSquare>}
          after={
            userData?.phoneNumber ? (
              <Text>{userData.phoneNumber}</Text>
            ) : (
              <Navigation>
                <Text className="text-gray-500">Add</Text>
              </Navigation>
            )
          }
          onClick={() => !userData?.phoneNumber && onAddPhone()}
        >
          Phone
        </Cell>
      </Section>

      {userData?.phoneNumber && (
        <Section>
          <ButtonCell
            before={<X size={20} />}
            onClick={onRemovePhone}
            disabled={busy}
          >
            {busy ? "Removing…" : "Remove phone number"}
          </ButtonCell>
        </Section>
      )}

      {!isSupported && !userData?.phoneNumber && (
        <Section>
          <Cell>
            <Text className="text-sm text-gray-500">
              Phone number sharing is not supported in this version of Telegram.
            </Text>
          </Cell>
        </Section>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Type-check + commit**

```bash
pnpm --filter web check-types
git add apps/web/src/routes/_tma/chat.$chatId_.settings.account.tsx apps/web/src/components/features/Settings/AccountSubPage.tsx
git commit -m "feat(web): add Account sub-page"
```

---

### Task 17: `TokenNameSheet` shared component (create + edit modes)

**Files:**
- Create: `apps/web/src/components/features/Settings/TokenNameSheet.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from "react";
import {
  Button,
  Input,
  Modal,
  Text,
  Title,
} from "@telegram-apps/telegram-ui";

export interface TokenNameSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialName?: string;
  onSubmit: (name: string) => Promise<void> | void;
  onRevoke?: () => void; // edit mode only
  busy?: boolean;
}

const MAX_LEN = 40;

export default function TokenNameSheet({
  open,
  onOpenChange,
  mode,
  initialName = "",
  onSubmit,
  onRevoke,
  busy,
}: TokenNameSheetProps) {
  const [name, setName] = useState(initialName);

  // Reset the field whenever the sheet (re)opens with a different prefill.
  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_LEN && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    await onSubmit(trimmed);
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <div className="px-4 py-3">
        <Title level="2">
          {mode === "create" ? "New API token" : "Edit token"}
        </Title>
        <Text className="mt-2 block text-(--tg-theme-subtitle-text-color)">
          Give it a name so you can tell it apart from your other tokens.
        </Text>
        <Input
          header="Name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, MAX_LEN))}
          placeholder="e.g., CLI on Macbook"
          className="mt-3"
        />
        <div className="mt-2 text-right text-xs text-(--tg-theme-subtitle-text-color)">
          {trimmed.length}/{MAX_LEN}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Button
            stretched
            mode="filled"
            disabled={!canSubmit}
            onClick={submit}
          >
            {mode === "create" ? "Create" : "Save"}
          </Button>
          {mode === "edit" && onRevoke && (
            <Button stretched mode="plain" onClick={onRevoke} disabled={busy}>
              <span className="text-red-500">Revoke token</span>
            </Button>
          )}
          <Button stretched mode="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
pnpm --filter web check-types
git add apps/web/src/components/features/Settings/TokenNameSheet.tsx
git commit -m "feat(web): add TokenNameSheet (create + edit modes)"
```

---

### Task 18: Developer sub-page (chat + user variants)

**Files:**
- Create: `apps/web/src/routes/_tma/chat.$chatId_.settings.developer.tsx`
- Create: `apps/web/src/components/features/Settings/DeveloperSubPage.tsx`

- [ ] **Step 1: Route**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import DeveloperSubPage from "@/components/features/Settings/DeveloperSubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/developer")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <DeveloperSubPage chatId={Number(chatId)} />;
}
```

- [ ] **Step 2: Sub-page**

The sub-page handles both group and private chats. For private (`userId === chatId`) it talks to `apiKey.{generateUserToken, listUserTokens, renameUserToken, revokeUserToken}`. For group it uses the chat-scoped variants.

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  initData,
  useSignal,
} from "@telegram-apps/sdk-react";
import { ButtonCell, Section, Text } from "@telegram-apps/telegram-ui";
import { Plus } from "lucide-react";
import { trpc } from "@/utils/trpc";
import TokenNameSheet from "./TokenNameSheet";

interface DeveloperSubPageProps {
  chatId: number;
}

interface ListedToken {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
}

export default function DeveloperSubPage({ chatId }: DeveloperSubPageProps) {
  const navigate = useNavigate();
  const tUser = useSignal(initData.user);
  const isPrivate = (tUser?.id ?? 0) === chatId;
  const trpcUtils = trpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ListedToken | null>(null);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Use the right query family for chat vs user.
  const chatTokensQ = trpc.apiKey.listTokens.useQuery({ chatId }, { enabled: !isPrivate });
  const userTokensQ = trpc.apiKey.listUserTokens.useQuery({}, { enabled: isPrivate });
  const tokens: ListedToken[] = useMemo(() => {
    const raw = (isPrivate ? userTokensQ.data : chatTokensQ.data) ?? [];
    return raw.map((t) => ({
      id: t.id,
      name: t.name,
      keyPrefix: t.keyPrefix,
      createdAt: t.createdAt,
    }));
  }, [isPrivate, userTokensQ.data, chatTokensQ.data]);

  const generateChat = trpc.apiKey.generateToken.useMutation();
  const generateUser = trpc.apiKey.generateUserToken.useMutation();
  const renameChat = trpc.apiKey.renameToken.useMutation();
  const renameUser = trpc.apiKey.renameUserToken.useMutation();
  const revokeChat = trpc.apiKey.revokeToken.useMutation();
  const revokeUser = trpc.apiKey.revokeUserToken.useMutation();

  const invalidate = () =>
    isPrivate
      ? trpcUtils.apiKey.listUserTokens.invalidate({})
      : trpcUtils.apiKey.listTokens.invalidate({ chatId });

  useEffect(() => {
    backButton.show();
    return () => backButton.hide();
  }, []);
  useEffect(() => {
    const off = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      navigate({ to: "/chat/$chatId/settings", params: { chatId: String(chatId) } });
    });
    return () => off();
  }, [chatId, navigate]);

  const handleCreate = useCallback(
    async (name: string) => {
      setBusy(true);
      try {
        const result = isPrivate
          ? await generateUser.mutateAsync({ name })
          : await generateChat.mutateAsync({ chatId, name });
        setNewRawKey(result.rawKey);
        await invalidate();
        hapticFeedback.notificationOccurred("success");
      } catch (err) {
        console.error("Failed to create token:", err);
        hapticFeedback.notificationOccurred("error");
      } finally {
        setBusy(false);
      }
    },
    [chatId, isPrivate, generateChat, generateUser, invalidate]
  );

  const handleRename = useCallback(
    async (name: string) => {
      if (!editing) return;
      setBusy(true);
      try {
        if (isPrivate) {
          await renameUser.mutateAsync({ tokenId: editing.id, name });
        } else {
          await renameChat.mutateAsync({ chatId, tokenId: editing.id, name });
        }
        await invalidate();
        hapticFeedback.notificationOccurred("success");
      } catch (err) {
        console.error("Failed to rename token:", err);
        hapticFeedback.notificationOccurred("error");
      } finally {
        setBusy(false);
      }
    },
    [editing, isPrivate, chatId, renameChat, renameUser, invalidate]
  );

  const handleRevoke = useCallback(async () => {
    if (!editing) return;
    if (!confirm("Revoke this token? Anything using it will lose access immediately.")) return;
    setBusy(true);
    try {
      if (isPrivate) {
        await revokeUser.mutateAsync({ tokenId: editing.id });
      } else {
        await revokeChat.mutateAsync({ chatId, tokenId: editing.id });
      }
      await invalidate();
      setEditing(null);
      hapticFeedback.notificationOccurred("success");
    } catch (err) {
      console.error("Failed to revoke token:", err);
      hapticFeedback.notificationOccurred("error");
    } finally {
      setBusy(false);
    }
  }, [editing, isPrivate, chatId, revokeChat, revokeUser, invalidate]);

  return (
    <main className="px-3 pb-8">
      <Section header="API access" footer="Tokens let the CLI and agents act on your behalf. Revoke anything you don't recognize.">
        <ButtonCell before={<Plus size={20} />} onClick={() => setCreateOpen(true)}>
          Generate new token
        </ButtonCell>

        {tokens.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setEditing(t)}
            className="block w-full px-3 py-2 text-left"
          >
            <div className="text-sm font-medium">{t.name}</div>
            <div className="text-xs text-(--tg-theme-subtitle-text-color)">
              Created {new Date(t.createdAt).toLocaleDateString()} · {t.keyPrefix}…
            </div>
          </button>
        ))}
      </Section>

      <TokenNameSheet
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        busy={busy}
      />
      <TokenNameSheet
        mode="edit"
        open={!!editing}
        initialName={editing?.name ?? ""}
        onOpenChange={(o) => !o && setEditing(null)}
        onSubmit={handleRename}
        onRevoke={handleRevoke}
        busy={busy}
      />

      {/* Show the raw key once after creation. */}
      {newRawKey && (
        <RawKeyModal rawKey={newRawKey} onClose={() => setNewRawKey(null)} />
      )}
    </main>
  );
}

// Lifted from the existing AccessTokensSection's raw-key reveal modal — show
// once, allow copy, then dismiss. The original component already has this UX;
// when we remove the old file in Task 20 we keep this small modal here.
function RawKeyModal({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="bg-(--tg-theme-bg-color) w-full rounded-t-2xl px-4 py-4">
        <div className="text-center text-base font-semibold">New token</div>
        <Text className="mt-2 block text-(--tg-theme-subtitle-text-color)">
          Copy this key now — you won't see it again.
        </Text>
        <pre className="mt-3 break-all rounded bg-gray-100 p-3 text-xs">{rawKey}</pre>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(rawKey);
            hapticFeedback.impactOccurred("light");
          }}
          className="mt-3 w-full rounded bg-blue-500 py-2 font-medium text-white"
        >
          Copy
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded border py-2 font-medium"
        >
          Done
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit**

```bash
pnpm --filter web check-types
git add apps/web/src/routes/_tma/chat.$chatId_.settings.developer.tsx apps/web/src/components/features/Settings/DeveloperSubPage.tsx
git commit -m "feat(web): add Developer sub-page (chat + user tokens)"
```

---

### Task 19: Categories sub-page (route already exists — add hub trampoline page)

The existing `chat.$chatId_.settings.categories.tsx` is the parent route; `categories.index.tsx` renders `ManageCategoriesPage`. We're not changing those — what was previously the inline `CategoriesSection` becomes the trampoline that the hub links to.

Decision: rather than insert a new page in front of `categories.index.tsx`, point the hub directly at `/settings/categories` (existing index = `ManageCategoriesPage`). That removes one trampoline. The Categories preview tile section from the old `CategoriesSection` is dropped — `ManageCategoriesPage` already shows the full list which is the canonical source.

**No code change needed for this task** — the hub's `goto("categories")` already targets `/settings/categories`. Document the decision in the plan and move on.

- [ ] **Step 1: Verify hub navigates correctly**

In `SettingsHubPage.tsx`, the categories row's `onClick` calls `goto("categories")`, which resolves to `/chat/$chatId/settings/categories`. That route already renders `ManageCategoriesPage`. Confirm by reading `apps/web/src/routes/_tma/chat.$chatId_.settings.categories.index.tsx`.

- [ ] **Step 2: Update the spec note**

Edit `docs/superpowers/specs/2026-04-25-settings-redesign-design.md` "Open questions" section: replace the "Whether the Categories sub-page is worth keeping" bullet with: *"Resolved during implementation: hub links straight to existing `/settings/categories` (ManageCategoriesPage). No trampoline page added."*

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-04-25-settings-redesign-design.md
git commit -m "docs(specs): resolve Categories sub-page question"
```

---

## Phase 5 — Cleanup

### Task 20: Delete deprecated Settings components + section files

**Files:**
- Delete: `apps/web/src/components/features/Settings/ChatSettingsPage.tsx`
- Delete: `apps/web/src/components/features/Settings/CategoriesSection.tsx`
- Delete: `apps/web/src/components/features/Settings/RecurringRemindersSection.tsx`
- Delete: `apps/web/src/components/features/Settings/AccessTokensSection.tsx`
- Delete: `apps/web/src/components/features/Settings/UserAccessTokensSection.tsx`

- [ ] **Step 1: Verify no remaining importers**

For each file, run:

```bash
grep -rn "ChatSettingsPage\|CategoriesSection\|RecurringRemindersSection\|AccessTokensSection\|UserAccessTokensSection" \
  apps packages --include='*.tsx' --include='*.ts' \
  | grep -v node_modules | grep -v '\.cache' | grep -v '\.worktrees' | grep -v '/dist/'
```

Expected: only the files themselves match. If something else still imports them, **STOP** — investigate before deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm apps/web/src/components/features/Settings/ChatSettingsPage.tsx
git rm apps/web/src/components/features/Settings/CategoriesSection.tsx
git rm apps/web/src/components/features/Settings/RecurringRemindersSection.tsx
git rm apps/web/src/components/features/Settings/AccessTokensSection.tsx
git rm apps/web/src/components/features/Settings/UserAccessTokensSection.tsx
```

- [ ] **Step 3: Type-check**

`pnpm --filter web check-types` → clean.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(web): remove deprecated Settings components"
```

---

### Task 21: Final route-tree regeneration + lint + build

- [ ] **Step 1: Regenerate the TanStack Router route tree**

The `tanstackRouter` Vite plugin regenerates `routeTree.gen.ts` on dev/build. Force a regen:

```bash
pnpm --filter web build
```

If the generated route tree is committed (check `git status`), add it.

- [ ] **Step 2: Lint**

```bash
pnpm --filter web lint
```

Expected: no new errors.

- [ ] **Step 3: Final type-check across the workspace**

```bash
pnpm -r check-types
```

Expected: clean across `@dko/database`, `@dko/trpc`, `web`, etc.

- [ ] **Step 4: Run unit tests**

```bash
pnpm --filter @dko/trpc test
```

Expected: all tests pass.

- [ ] **Step 5: Drop the `as any` from `SettingsHubPage`**

Now that all sub-page routes exist in `routeTree.gen.ts`, the hub's `goto` helper can be typed. Replace the `goto` callback in `apps/web/src/components/features/Settings/SettingsHubPage.tsx`:

```tsx
type SubKey =
  | "members"
  | "currency"
  | "categories"
  | "notifications"
  | "reminders"
  | "account"
  | "developer";

const SUB_PATHS: Record<SubKey, string> = {
  members: "/chat/$chatId/settings/members",
  currency: "/chat/$chatId/settings/currency",
  categories: "/chat/$chatId/settings/categories",
  notifications: "/chat/$chatId/settings/notifications",
  reminders: "/chat/$chatId/settings/reminders",
  account: "/chat/$chatId/settings/account",
  developer: "/chat/$chatId/settings/developer",
};

const goto = useCallback(
  (sub: SubKey) => {
    hapticFeedback.impactOccurred("light");
    navigate({
      to: SUB_PATHS[sub] as any, // TanStack typed routes still vary by version; safe because keys map to real routes.
      params: { chatId: String(chatId) },
    });
  },
  [chatId, navigate]
);
```

Re-run `pnpm --filter web check-types` — clean.

If your TanStack Router version exports the literal route paths as a union type via the generated tree, you can drop the final `as any` entirely; otherwise leave it (the `SubKey` union and the `SUB_PATHS` lookup are the safety net at the call sites).

- [ ] **Step 6: Commit any generated artifacts and the cleanup**

```bash
git add apps/web/src/routeTree.gen.ts apps/web/src/components/features/Settings/SettingsHubPage.tsx
git status   # verify only expected files
git commit -m "chore(web): regenerate settings route tree, type hub navigation" --allow-empty
```

If nothing changed, skip the commit.

---

### Task 22: Decide fate of `apiKey.generate` (legacy superadmin procedure)

**Why this task exists:** Task 1's schema tightening forced a one-line placeholder name into `packages/trpc/src/routers/apiKey/generate.ts`. The procedure is still wired up (`apiKey/index.ts`) and exercised by `apps/mcp/tests/e2e-basic.ts` and `apps/mcp/tests/e2e-comprehensive.ts`. Tasks 2–3 of this plan only update `generateToken` / `generateUserToken`. Without a decision, the placeholder ossifies into permanent dead-name state.

**Files:**
- `packages/trpc/src/routers/apiKey/generate.ts` (decide: delete or accept optional `name`)
- `packages/trpc/src/routers/apiKey/index.ts` (drop import + router entry if deleting)
- `apps/mcp/tests/e2e-basic.ts` (update if deleting/renaming)
- `apps/mcp/tests/e2e-comprehensive.ts` (update if deleting/renaming)

- [ ] **Step 1: Audit usage**

Run:
```bash
grep -rn "apiKey\.generate\b\|apiKeyRouter\.generate\b\|generateApiKeyHandler" \
  apps packages \
  --include='*.ts' --include='*.tsx' \
  | grep -v node_modules | grep -v '/dist/' | grep -v '\.cache' | grep -v '\.worktrees'
```

Confirm whether anything outside the e2e tests still calls `apiKey.generate`. If only the e2e tests use it, the procedure is essentially a test-only superadmin convenience and can be removed.

- [ ] **Step 2: Pick a path**

**Path A — keep, accept optional name:**
- Add `name: z.string().trim().min(1).max(40).optional()` to `inputSchema`.
- Replace the placeholder line with: `name: input.name?.trim() || \`Token · ${new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit" })}\``.
- Update e2e tests to pass `name: "e2e <test name>"` for clarity in the DB.

**Path B — delete:**
- `git rm packages/trpc/src/routers/apiKey/generate.ts`
- Remove `import generate from "./generate.js";` and the `generate,` entry from `apiKey/index.ts`.
- Update e2e tests to use `apiKey.generateToken` (which is also superadmin-callable via `protectedProcedure`).

- [ ] **Step 3: Implement chosen path**

If Path A: edit handler + tests.
If Path B: remove file + router wiring + update tests.

- [ ] **Step 4: Verify**

Run:
```bash
pnpm --filter @dko/trpc check-types
pnpm --filter @dko/trpc test
pnpm --filter banana-split-mcp-server test  # or the e2e-test command for the MCP server
```

All clean.

- [ ] **Step 5: Commit**

Path A:
```bash
git commit -m "feat(trpc): apiKey.generate accepts optional name"
```

Path B:
```bash
git commit -m "chore(trpc): remove legacy apiKey.generate; e2e tests use generateToken"
```

---

## After all tasks pass

- Run the manual UAT checklist from the design spec ("Manual (per memory: AskUserQuestion walkthrough)" section).
- Push the branch and open a PR per the user's standard flow (`gh pr create ...`); do **not** arm auto-merge until the user has UAT'd and says "ok merge".
