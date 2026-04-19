# Broadcast History & Stateful Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted broadcast history + retract / edit / resend actions (whole-broadcast or per-recipient) to the admin tool.

**Architecture:** Two new Prisma models (`Broadcast`, `BroadcastDelivery`) in the existing Postgres DB. The send path persists a `Broadcast` + N `BroadcastDelivery` rows in a transaction, then updates each delivery (with `telegramMessageId`) as it sends. Three new tRPC mutations (`retract`, `edit`, `resend`) read/mutate those rows, using Telegram's `deleteMessage` / `editMessageText` / `editMessageCaption` / `editMessageMedia` / `sendMessage|Photo|Video`. The admin SPA gains a sidebar shell via `react-router-dom` with two routes inside the `Broadcast` section: `/broadcast/compose` (existing composer) and `/broadcast/history` with a `/:broadcastId` detail sheet.

**Tech Stack:** Prisma 6 (Postgres), tRPC v11, telegraf, Vite + React 19, shadcn/radix primitives, vitest.

**Spec:** See `docs/superpowers/specs/2026-04-19-broadcast-history-design.md`.

---

## File Map

**Create:**
- `packages/database/prisma/migrations/<ts>_add_broadcast_history/migration.sql` (Prisma generates)
- `packages/trpc/src/services/broadcastPersistence.ts` — `createBroadcastRows`, `resolveDeliveryTargets`, `markDelivery*` helpers.
- `packages/trpc/src/services/withRateLimit.ts` — shared `withRateLimit(delayMs)` helper.
- `packages/trpc/src/services/broadcastEditMethod.ts` — `selectEditMethod({ currentKind, nextText, nextMedia })` pure function.
- `packages/trpc/src/services/broadcastActions.ts` — `retractDelivery`, `editDelivery`, `resumeSend` helpers.
- `packages/trpc/src/routers/admin/broadcastList.ts`
- `packages/trpc/src/routers/admin/broadcastGet.ts`
- `packages/trpc/src/routers/admin/broadcastRetract.ts`
- `packages/trpc/src/routers/admin/broadcastEdit.ts`
- `packages/trpc/src/routers/admin/broadcastResend.ts`
- `packages/trpc/src/routers/admin/broadcastResumeSend.ts`
- `packages/trpc/src/services/broadcastEditMethod.spec.ts`
- `packages/trpc/src/services/broadcastPersistence.spec.ts`
- `apps/admin/src/components/shell/AdminShell.tsx`
- `apps/admin/src/components/shell/Sidebar.tsx`
- `apps/admin/src/routes.tsx` — route definitions.
- `apps/admin/src/components/broadcast/BroadcastHistoryPage.tsx`
- `apps/admin/src/components/broadcast/BroadcastDetailSheet.tsx`
- `apps/admin/src/components/broadcast/DeliveryRow.tsx`
- `apps/admin/src/components/broadcast/actions/RetractConfirmDialog.tsx`
- `apps/admin/src/components/broadcast/actions/EditBroadcastDialog.tsx`
- `apps/admin/src/components/broadcast/actions/ResendBroadcastDialog.tsx`

**Modify:**
- `packages/database/prisma/schema.prisma` — add `Broadcast`, `BroadcastDelivery`, enums.
- `packages/trpc/src/services/broadcast.ts` — rewrite around persistence + message_id capture; rename exported fn to `createBroadcast`.
- `packages/trpc/src/routers/admin/broadcastMessage.ts` — input stays compatible; return adds `broadcastId`; calls `createBroadcast`.
- `packages/trpc/src/routers/admin/index.ts` — register new procedures.
- `packages/trpc/src/index.ts` — export new types (`BroadcastListItem`, `BroadcastDetail`, `DeliveryStatus`, etc.).
- `apps/admin/src/App.tsx` — wrap with router; render `AdminShell`.
- `apps/admin/src/components/broadcast/BroadcastPage.tsx` — becomes the composer view under `/broadcast/compose`; header row moves to shell.
- `apps/admin/package.json` — add `react-router-dom`.

---

## Task 0: Prep — branch is ready

**Files:** (no changes)

- [ ] **Step 1: Verify you're on the feature branch and worktree**

Run: `git branch --show-current`
Expected: `feat/broadcast-history`

- [ ] **Step 2: Confirm spec exists**

Run: `ls docs/superpowers/specs/2026-04-19-broadcast-history-design.md`
Expected: path prints with no error.

- [ ] **Step 3: Install baseline**

Run: `pnpm install`
Expected: up-to-date without error.

---

## Task 1: Prisma models + migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_add_broadcast_history/migration.sql` (Prisma generates)

- [ ] **Step 1: Append models + enums to schema**

Append to `packages/database/prisma/schema.prisma`:

```prisma
enum BroadcastMediaKind {
  PHOTO
  VIDEO
}

enum BroadcastStatus {
  SENDING
  SENT
  FAILED
}

enum DeliveryStatus {
  PENDING
  SENT
  FAILED
  RETRACTED
  EDITED
}

model Broadcast {
  id                  String               @id @default(cuid())
  createdByTelegramId BigInt?
  createdAt           DateTime             @default(now())

  text                String
  mediaKind           BroadcastMediaKind?
  mediaFileId         String?
  mediaFileName       String?

  status              BroadcastStatus      @default(SENDING)

  parentBroadcastId   String?
  parent              Broadcast?           @relation("Resend", fields: [parentBroadcastId], references: [id])
  children            Broadcast[]          @relation("Resend")

  deliveries          BroadcastDelivery[]

  @@index([createdAt])
  @@index([createdByTelegramId, createdAt])
}

model BroadcastDelivery {
  id                String         @id @default(cuid())
  broadcastId       String
  broadcast         Broadcast      @relation(fields: [broadcastId], references: [id], onDelete: Cascade)

  userId            BigInt
  username          String?
  firstName         String

  telegramChatId    BigInt
  telegramMessageId BigInt?

  status            DeliveryStatus @default(PENDING)
  error             String?

  sentAt            DateTime?
  lastEditedAt      DateTime?
  retractedAt       DateTime?

  editedText        String?
  editedMediaFileId String?

  @@unique([broadcastId, userId])
  @@index([userId, sentAt])
  @@index([status])
}
```

- [ ] **Step 2: Generate migration**

Run: `cd packages/database && pnpm prisma migrate dev --name add_broadcast_history`
Expected: new folder created under `prisma/migrations/`, client regenerated. Prisma confirms `Your database is now in sync with your schema.`

- [ ] **Step 3: Verify generated client has new types**

Run: `pnpm --filter @dko/database check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations
git commit -m "feat(db): add Broadcast + BroadcastDelivery models"
```

---

## Task 2: Shared `withRateLimit` helper

**Files:**
- Create: `packages/trpc/src/services/withRateLimit.ts`
- Create: `packages/trpc/src/services/withRateLimit.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/trpc/src/services/withRateLimit.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { withRateLimit } from "./withRateLimit.js";

describe("withRateLimit", () => {
  it("runs each item serially and sleeps between them", async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const run = withRateLimit(100)(async (n: number) => {
      order.push(`start-${n}`);
      await Promise.resolve();
      order.push(`end-${n}`);
      return n * 2;
    });

    const promise = Promise.all([run(1), run(2)]);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual([2, 4]);
    expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dko/trpc test`
Expected: FAIL with `Cannot find module './withRateLimit.js'`.

- [ ] **Step 3: Implement**

Create `packages/trpc/src/services/withRateLimit.ts`:

```ts
export function withRateLimit(delayMs: number) {
  let chain: Promise<unknown> = Promise.resolve();
  return <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => {
    return (...args: A): Promise<R> => {
      const next = chain.then(async () => {
        const result = await fn(...args);
        await new Promise((r) => setTimeout(r, delayMs));
        return result;
      });
      chain = next.catch(() => undefined);
      return next as Promise<R>;
    };
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dko/trpc test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/services/withRateLimit.ts packages/trpc/src/services/withRateLimit.spec.ts
git commit -m "feat(trpc): extract withRateLimit helper"
```

---

## Task 3: Broadcast persistence helpers

**Files:**
- Create: `packages/trpc/src/services/broadcastPersistence.ts`
- Create: `packages/trpc/src/services/broadcastPersistence.spec.ts`

- [ ] **Step 1: Write failing test (resolveDeliveryTargets dedup)**

Create `packages/trpc/src/services/broadcastPersistence.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { dedupeTargetIds } from "./broadcastPersistence.js";

describe("dedupeTargetIds", () => {
  it("dedupes repeated ids preserving first-seen order", () => {
    expect(dedupeTargetIds([3, 1, 3, 2, 1])).toEqual([3, 1, 2]);
  });
  it("returns empty for empty input", () => {
    expect(dedupeTargetIds([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dko/trpc test`
Expected: FAIL with `Cannot find module './broadcastPersistence.js'`.

- [ ] **Step 3: Implement helpers**

Create `packages/trpc/src/services/broadcastPersistence.ts`:

```ts
import type { Prisma } from "@dko/database";
import type { Db } from "../trpc.js";

export type PersistedRecipient = {
  userId: bigint;
  username: string | null;
  firstName: string;
  telegramChatId: bigint;
};

export function dedupeTargetIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export async function resolveRecipients(
  db: Db,
  targetUserIds?: number[]
): Promise<PersistedRecipient[]> {
  const select = { id: true, username: true, firstName: true } as const;
  const rows = targetUserIds === undefined
    ? await db.user.findMany({ select })
    : targetUserIds.length === 0
      ? []
      : await db.user.findMany({
          where: {
            id: { in: dedupeTargetIds(targetUserIds).map((n) => BigInt(n)) },
          },
          select,
        });
  return rows.map((u) => ({
    userId: u.id,
    username: u.username,
    firstName: u.firstName,
    telegramChatId: u.id, // DMs: chatId == userId
  }));
}

export async function createBroadcastRows(
  db: Db,
  args: {
    createdByTelegramId: bigint | null;
    text: string;
    mediaKind: "PHOTO" | "VIDEO" | null;
    mediaFileId: string | null;
    mediaFileName: string | null;
    parentBroadcastId: string | null;
    recipients: PersistedRecipient[];
  }
): Promise<{ broadcastId: string; deliveryIdByUserId: Map<bigint, string> }> {
  return db.$transaction(async (tx) => {
    const broadcast = await tx.broadcast.create({
      data: {
        createdByTelegramId: args.createdByTelegramId,
        text: args.text,
        mediaKind: args.mediaKind ?? undefined,
        mediaFileId: args.mediaFileId,
        mediaFileName: args.mediaFileName,
        parentBroadcastId: args.parentBroadcastId,
      },
      select: { id: true },
    });

    const createMany: Prisma.BroadcastDeliveryCreateManyInput[] =
      args.recipients.map((r) => ({
        broadcastId: broadcast.id,
        userId: r.userId,
        username: r.username,
        firstName: r.firstName,
        telegramChatId: r.telegramChatId,
      }));

    await tx.broadcastDelivery.createMany({ data: createMany });

    const rows = await tx.broadcastDelivery.findMany({
      where: { broadcastId: broadcast.id },
      select: { id: true, userId: true },
    });
    const deliveryIdByUserId = new Map<bigint, string>();
    for (const r of rows) deliveryIdByUserId.set(r.userId, r.id);

    return { broadcastId: broadcast.id, deliveryIdByUserId };
  });
}

export async function markDeliverySent(
  db: Db,
  deliveryId: string,
  telegramMessageId: bigint
): Promise<void> {
  await db.broadcastDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "SENT",
      telegramMessageId,
      sentAt: new Date(),
      error: null,
    },
  });
}

export async function markDeliveryFailed(
  db: Db,
  deliveryId: string,
  error: string
): Promise<void> {
  await db.broadcastDelivery.update({
    where: { id: deliveryId },
    data: { status: "FAILED", error },
  });
}

export async function finalizeBroadcast(
  db: Db,
  broadcastId: string,
  outcome: { successCount: number; failCount: number }
): Promise<void> {
  const status =
    outcome.successCount === 0 && outcome.failCount > 0 ? "FAILED" : "SENT";
  await db.broadcast.update({
    where: { id: broadcastId },
    data: { status },
  });
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dko/trpc test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/services/broadcastPersistence.ts packages/trpc/src/services/broadcastPersistence.spec.ts
git commit -m "feat(trpc): add broadcast persistence helpers"
```

---

## Task 4: Rewrite `broadcast()` service around persistence + message_id capture

**Files:**
- Modify: `packages/trpc/src/services/broadcast.ts` (full replacement)

- [ ] **Step 1: Replace the file**

Replace `packages/trpc/src/services/broadcast.ts` with:

```ts
import telegramifyMarkdown from "telegramify-markdown";
import type { Telegram } from "telegraf";
import type { Db } from "../trpc.js";
import { withRateLimit } from "./withRateLimit.js";
import {
  createBroadcastRows,
  finalizeBroadcast,
  markDeliveryFailed,
  markDeliverySent,
  resolveRecipients,
} from "./broadcastPersistence.js";

const RATE_LIMIT_DELAY_MS = 100;

export type BroadcastMedia = {
  kind: "photo" | "video";
  buffer: Buffer;
  filename: string;
};

export type BroadcastRecipient = {
  userId: number;
  username: string | null;
  firstName: string;
};

export type BroadcastSuccess = BroadcastRecipient;
export type BroadcastFailure = BroadcastRecipient & { error: string };

export type BroadcastResult = {
  broadcastId: string;
  successCount: number;
  failCount: number;
  successes: BroadcastSuccess[];
  failures: BroadcastFailure[];
};

export type CreateBroadcastOptions = {
  message: string;
  targetUserIds?: number[];
  media?: BroadcastMedia;
  createdByTelegramId: bigint | null;
  parentBroadcastId?: string;
};

export type BroadcastContext = {
  db: Db;
  teleBot: Telegram;
};

export async function createBroadcast(
  ctx: BroadcastContext,
  opts: CreateBroadcastOptions
): Promise<BroadcastResult> {
  const recipients = await resolveRecipients(ctx.db, opts.targetUserIds);
  const caption = opts.message.trim()
    ? telegramifyMarkdown(opts.message, "escape")
    : undefined;

  const { broadcastId, deliveryIdByUserId } = await createBroadcastRows(
    ctx.db,
    {
      createdByTelegramId: opts.createdByTelegramId,
      text: opts.message,
      mediaKind: opts.media?.kind === "photo" ? "PHOTO" : opts.media?.kind === "video" ? "VIDEO" : null,
      mediaFileId: null,
      mediaFileName: opts.media?.filename ?? null,
      parentBroadcastId: opts.parentBroadcastId ?? null,
      recipients,
    }
  );

  let cachedFileId: string | undefined;
  const successes: BroadcastSuccess[] = [];
  const failures: BroadcastFailure[] = [];

  const serial = withRateLimit(RATE_LIMIT_DELAY_MS);
  const sendOne = serial(async (r: (typeof recipients)[number]) => {
    const userId = Number(r.userId);
    const recipient: BroadcastRecipient = {
      userId,
      username: r.username,
      firstName: r.firstName,
    };
    const deliveryId = deliveryIdByUserId.get(r.userId);
    if (!deliveryId) return;

    try {
      let sentMessageId: number;

      if (opts.media) {
        const source = cachedFileId ?? {
          source: opts.media.buffer,
          filename: opts.media.filename,
        };
        const extra = caption
          ? { caption, parse_mode: "MarkdownV2" as const }
          : undefined;

        if (opts.media.kind === "photo") {
          const sent = await ctx.teleBot.sendPhoto(userId, source, extra);
          sentMessageId = sent.message_id;
          if (!cachedFileId) {
            const largest = sent.photo[sent.photo.length - 1];
            cachedFileId = largest?.file_id;
            if (cachedFileId) {
              await ctx.db.broadcast.update({
                where: { id: broadcastId },
                data: { mediaFileId: cachedFileId },
              });
            }
          }
        } else {
          const sent = await ctx.teleBot.sendVideo(userId, source, extra);
          sentMessageId = sent.message_id;
          if (!cachedFileId) {
            cachedFileId = sent.video.file_id;
            if (cachedFileId) {
              await ctx.db.broadcast.update({
                where: { id: broadcastId },
                data: { mediaFileId: cachedFileId },
              });
            }
          }
        }
      } else if (caption) {
        const sent = await ctx.teleBot.sendMessage(userId, caption, {
          parse_mode: "MarkdownV2",
        });
        sentMessageId = sent.message_id;
      } else {
        throw new Error("Broadcast must have a message or media attached.");
      }

      await markDeliverySent(ctx.db, deliveryId, BigInt(sentMessageId));
      successes.push(recipient);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`Broadcast to ${userId} failed:`, error);
      await markDeliveryFailed(ctx.db, deliveryId, msg);
      failures.push({ ...recipient, error: msg });
    }
  });

  await Promise.all(recipients.map(sendOne));

  await finalizeBroadcast(ctx.db, broadcastId, {
    successCount: successes.length,
    failCount: failures.length,
  });

  return {
    broadcastId,
    successCount: successes.length,
    failCount: failures.length,
    successes,
    failures,
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @dko/trpc check-types`
Expected: PASS.

- [ ] **Step 3: Verify existing tests still pass**

Run: `pnpm --filter @dko/trpc test`
Expected: PASS (no regressions in helper tests).

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/src/services/broadcast.ts
git commit -m "feat(trpc): persist broadcast + capture message_id on send"
```

---

## Task 5: Update `broadcast.create` (broadcastMessage) procedure

**Files:**
- Modify: `packages/trpc/src/routers/admin/broadcastMessage.ts`

**Note on attribution:** The lambda's tRPC context does not currently carry the admin's Telegram ID (auth is via API key from the admin Vercel proxy). For MVP the `createdByTelegramId` is persisted as `null`. Proper plumbing (forward `x-admin-telegram-id` from the admin proxy and read it in the lambda's `createContext`) is a follow-up PR — see Open Items.

- [ ] **Step 1: Replace broadcastMessage.ts**

Replace `packages/trpc/src/routers/admin/broadcastMessage.ts` with:

```ts
import { z } from "zod";
import { adminProcedure } from "../../trpc.js";
import { createBroadcast } from "../../services/broadcast.js";

export default adminProcedure
  .input(
    z.object({
      message: z.string().min(1).max(4096),
      targetUserIds: z.array(z.number()).max(500).optional(),
    })
  )
  .mutation(({ input, ctx }) =>
    createBroadcast(ctx, {
      message: input.message,
      targetUserIds: input.targetUserIds,
      createdByTelegramId: null,
    })
  );
```

- [ ] **Step 3: Re-export the updated result type**

Modify `packages/trpc/src/index.ts` to ensure `BroadcastResult` is re-exported (if not already). Grep first:

Run: `grep -n "BroadcastResult" packages/trpc/src/index.ts`
If absent, add:
```ts
export type {
  BroadcastResult,
  BroadcastSuccess,
  BroadcastFailure,
  BroadcastRecipient,
} from "./services/broadcast.js";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @dko/trpc check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/admin/broadcastMessage.ts packages/trpc/src/index.ts
git commit -m "feat(trpc): broadcast.create returns broadcastId + enforces limits"
```

---

## Task 6: Adapt existing UI to new response shape

**Files:**
- Modify: `apps/admin/src/components/broadcast/BroadcastPage.tsx`
- Modify: `apps/admin/src/lib/broadcastWithMedia.ts` (update return type to include `broadcastId`)

- [ ] **Step 1: Update the media-proxy helper**

Grep current signature:
Run: `grep -n "BroadcastResult" apps/admin/src/lib/broadcastWithMedia.ts`

Update `broadcastWithMedia` return type so its result now carries `broadcastId`. No logic change needed — server already returns it; just reflect in the TS type. The existing `BroadcastResult` import from `@dko/trpc` will pull in the updated type automatically. Verify with:

Run: `pnpm --filter admin check-types`
Expected: PASS.

- [ ] **Step 2: No visible UI change yet**

The composer continues to work as before — the added `broadcastId` field is carried in the result but ignored by existing dialogs. This task's only goal is type soundness.

- [ ] **Step 3: Commit**

```bash
git add apps/admin
git commit -m "chore(admin): track broadcastId in composer result type"
```

---

## Task 7: `broadcast.list` procedure

**Files:**
- Create: `packages/trpc/src/routers/admin/broadcastList.ts`
- Modify: `packages/trpc/src/routers/admin/index.ts`

- [ ] **Step 1: Implement procedure**

Create `packages/trpc/src/routers/admin/broadcastList.ts`:

```ts
import { z } from "zod";
import { adminProcedure } from "../../trpc.js";

export default adminProcedure
  .input(
    z.object({
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
    })
  )
  .query(async ({ input, ctx }) => {
    const rows = await ctx.db.broadcast.findMany({
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        createdByTelegramId: true,
        text: true,
        mediaKind: true,
        status: true,
        parentBroadcastId: true,
        _count: { select: { deliveries: true } },
        deliveries: {
          select: { status: true },
        },
      },
    });

    const hasMore = rows.length > input.limit;
    const items = (hasMore ? rows.slice(0, input.limit) : rows).map((b) => {
      const counts = { SENT: 0, FAILED: 0, RETRACTED: 0, EDITED: 0, PENDING: 0 };
      for (const d of b.deliveries) counts[d.status] += 1;
      return {
        id: b.id,
        createdAt: b.createdAt,
        createdByTelegramId: b.createdByTelegramId.toString(),
        text: b.text,
        mediaKind: b.mediaKind,
        status: b.status,
        parentBroadcastId: b.parentBroadcastId,
        totalRecipients: b._count.deliveries,
        successCount: counts.SENT + counts.EDITED,
        failCount: counts.FAILED,
        retractedCount: counts.RETRACTED,
        editedCount: counts.EDITED,
        pendingCount: counts.PENDING,
      };
    });

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : null,
    };
  });
```

- [ ] **Step 2: Register in admin router**

Edit `packages/trpc/src/routers/admin/index.ts`:

```ts
import { createTRPCRouter } from "../../trpc.js";
import getUsers from "./getUsers.js";
import broadcastMessage from "./broadcastMessage.js";
import broadcastList from "./broadcastList.js";

export const adminRouter = createTRPCRouter({
  getUsers,
  broadcastMessage,
  broadcastList,
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dko/trpc check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/src/routers/admin
git commit -m "feat(trpc): add broadcast.list"
```

---

## Task 8: `broadcast.get` procedure

**Files:**
- Create: `packages/trpc/src/routers/admin/broadcastGet.ts`
- Modify: `packages/trpc/src/routers/admin/index.ts`

- [ ] **Step 1: Implement procedure**

Create `packages/trpc/src/routers/admin/broadcastGet.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure } from "../../trpc.js";

export default adminProcedure
  .input(z.object({ broadcastId: z.string() }))
  .query(async ({ input, ctx }) => {
    const b = await ctx.db.broadcast.findUnique({
      where: { id: input.broadcastId },
      include: {
        deliveries: { orderBy: { sentAt: "asc" } },
      },
    });
    if (!b) throw new TRPCError({ code: "NOT_FOUND" });

    return {
      id: b.id,
      createdAt: b.createdAt,
      createdByTelegramId: b.createdByTelegramId.toString(),
      text: b.text,
      mediaKind: b.mediaKind,
      mediaFileId: b.mediaFileId,
      mediaFileName: b.mediaFileName,
      status: b.status,
      parentBroadcastId: b.parentBroadcastId,
      deliveries: b.deliveries.map((d) => ({
        id: d.id,
        userId: d.userId.toString(),
        username: d.username,
        firstName: d.firstName,
        telegramChatId: d.telegramChatId.toString(),
        telegramMessageId: d.telegramMessageId?.toString() ?? null,
        status: d.status,
        error: d.error,
        sentAt: d.sentAt,
        lastEditedAt: d.lastEditedAt,
        retractedAt: d.retractedAt,
        editedText: d.editedText,
        editedMediaFileId: d.editedMediaFileId,
      })),
    };
  });
```

- [ ] **Step 2: Register**

Add `broadcastGet` to `packages/trpc/src/routers/admin/index.ts` imports and the router object.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @dko/trpc check-types` (expect PASS), then:

```bash
git add packages/trpc/src/routers/admin
git commit -m "feat(trpc): add broadcast.get"
```

---

## Task 9: Install `react-router-dom` in admin app

**Files:**
- Modify: `apps/admin/package.json`

- [ ] **Step 1: Install**

Run: `pnpm --filter admin add react-router-dom@^7`
Expected: lockfile updated; package added.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter admin check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/package.json pnpm-lock.yaml
git commit -m "chore(admin): add react-router-dom"
```

---

## Task 10: Sidebar + AdminShell

**Files:**
- Create: `apps/admin/src/components/shell/Sidebar.tsx`
- Create: `apps/admin/src/components/shell/AdminShell.tsx`

- [ ] **Step 1: Sidebar component**

Create `apps/admin/src/components/shell/Sidebar.tsx`:

```tsx
import { NavLink } from "react-router-dom";
import { LogOut, MessageSquare, Send, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Session } from "@/hooks/useSession";

type Props = {
  session: Session;
  onLogout: () => void;
};

export function Sidebar({ session, onLogout }: Props) {
  return (
    <aside className="bg-background flex w-60 shrink-0 flex-col border-r">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="text-xl">🍌</span>
        <span className="text-sm font-semibold tracking-tight">Admin</span>
      </div>

      <nav className="flex-1 px-2">
        <div className="text-muted-foreground px-2 py-1 text-xs font-medium uppercase">
          <span className="inline-flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5" /> Broadcast
          </span>
        </div>
        <ul className="flex flex-col gap-0.5">
          <li>
            <NavLink
              to="/broadcast/compose"
              className={({ isActive }) =>
                `hover:bg-muted flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${isActive ? "bg-muted font-medium" : ""}`
              }
            >
              <Send className="h-3.5 w-3.5" /> Compose
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/broadcast/history"
              className={({ isActive }) =>
                `hover:bg-muted flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${isActive ? "bg-muted font-medium" : ""}`
              }
            >
              <History className="h-3.5 w-3.5" /> History
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="flex flex-col gap-1 border-t px-3 py-3">
        <span className="text-muted-foreground text-xs">
          {session.username ? `@${session.username}` : session.firstName}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="h-7 justify-start gap-1.5 px-2 text-xs"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: AdminShell**

Create `apps/admin/src/components/shell/AdminShell.tsx`:

```tsx
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import type { Session } from "@/hooks/useSession";

type Props = {
  session: Session;
  onLogout: () => void;
};

export function AdminShell({ session, onLogout }: Props) {
  return (
    <div className="flex h-screen">
      <Sidebar session={session} onLogout={onLogout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter admin check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/shell
git commit -m "feat(admin): add sidebar shell"
```

---

## Task 11: Wire router + route composer under `/broadcast/compose`

**Files:**
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/components/broadcast/BroadcastPage.tsx` — remove the per-page header (session chip + logout move to the sidebar).
- Create: `apps/admin/src/routes.tsx`

- [ ] **Step 1: Remove header from BroadcastPage**

Edit `apps/admin/src/components/broadcast/BroadcastPage.tsx`:

1. Drop the `session`/`onLogout` props and the entire `<header>` block (lines 143–165 in the pre-change file).
2. Change the root `<div className="flex h-screen flex-col">` to `<div className="flex h-full flex-col">`.
3. Remove the now-unused `Badge`, `Button`, `LogOut` imports and the `Session` import + type.

The component's new signature:

```tsx
export function BroadcastPage() {
  // ...same state + effects as before, minus session props
}
```

- [ ] **Step 2: Create routes**

Create `apps/admin/src/routes.tsx`:

```tsx
import { Navigate, createBrowserRouter, Outlet } from "react-router-dom";
import { AdminShell } from "./components/shell/AdminShell";
import { BroadcastPage } from "./components/broadcast/BroadcastPage";
import { BroadcastHistoryPage } from "./components/broadcast/BroadcastHistoryPage";
import type { Session } from "./hooks/useSession";

export function buildRouter(session: Session, onLogout: () => void) {
  return createBrowserRouter([
    {
      element: <AdminShell session={session} onLogout={onLogout} />,
      children: [
        { path: "/", element: <Navigate to="/broadcast/compose" replace /> },
        { path: "/broadcast", element: <Navigate to="/broadcast/compose" replace /> },
        { path: "/broadcast/compose", element: <BroadcastPage /> },
        {
          path: "/broadcast/history",
          element: <Outlet />,
          children: [
            { index: true, element: <BroadcastHistoryPage /> },
            { path: ":broadcastId", element: <BroadcastHistoryPage /> },
          ],
        },
      ],
    },
  ]);
}
```

- [ ] **Step 3: Rewire App.tsx**

Replace `apps/admin/src/App.tsx` with:

```tsx
import { useMemo } from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { trpcClient, trpcReact, queryClient } from "./utils/trpc";
import { LoginPage } from "./components/auth/LoginPage";
import { Toaster } from "@/components/ui/sonner";
import { useSession } from "./hooks/useSession";
import { buildRouter } from "./routes";

export function App() {
  const { state, refresh, logout } = useSession();

  const router = useMemo(
    () => (state.status === "authenticated" ? buildRouter(state.session, logout) : null),
    [state, logout]
  );

  if (state.status === "loading") {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return (
      <>
        <LoginPage onAuthenticated={refresh} />
        <Toaster richColors closeButton position="bottom-right" />
      </>
    );
  }

  return (
    <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {router && <RouterProvider router={router} />}
        <Toaster richColors closeButton position="bottom-right" />
      </QueryClientProvider>
    </trpcReact.Provider>
  );
}
```

- [ ] **Step 4: Placeholder BroadcastHistoryPage so router compiles**

Create `apps/admin/src/components/broadcast/BroadcastHistoryPage.tsx` with a minimal stub (will be replaced in Task 12):

```tsx
export function BroadcastHistoryPage() {
  return (
    <div className="flex h-full flex-col p-6">
      <h1 className="text-xl font-semibold">History</h1>
    </div>
  );
}
```

- [ ] **Step 5: Dev smoke test**

Run: `pnpm --filter admin dev` in background, then open http://localhost:6820/broadcast/compose. Confirm sidebar renders, composer works, and `/broadcast/history` shows the stub page.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src
git commit -m "feat(admin): sidebar shell + routed compose/history"
```

---

## Task 12: `BroadcastHistoryPage` — table + filters

**Files:**
- Replace stub: `apps/admin/src/components/broadcast/BroadcastHistoryPage.tsx`

- [ ] **Step 1: Implement**

Replace `apps/admin/src/components/broadcast/BroadcastHistoryPage.tsx`:

```tsx
import { useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { trpcReact } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BroadcastDetailSheet } from "./BroadcastDetailSheet";
import { Image as ImageIcon, Paperclip } from "lucide-react";

function relativeTime(d: Date): string {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return day === 1 ? "yesterday" : `${day}d ago`;
}

export function BroadcastHistoryPage() {
  const { broadcastId } = useParams<{ broadcastId?: string }>();
  const [search, setSearch] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);

  const list = trpcReact.admin.broadcastList.useInfiniteQuery(
    { limit: 25 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined }
  );

  const rows = (list.data?.pages ?? []).flatMap((p) => p.items).filter((b) => {
    if (failedOnly && b.failCount === 0) return false;
    if (search && !b.text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Broadcast history</h1>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search preview…"
            className="h-8 w-60"
          />
          <Button
            size="sm"
            variant={failedOnly ? "default" : "outline"}
            onClick={() => setFailedOnly((v) => !v)}
          >
            Failed only
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        {list.isLoading ? (
          <p className="text-muted-foreground p-6 text-sm">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground p-6 text-sm">No broadcasts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 text-left">
              <tr>
                <th className="px-6 py-2 font-medium">Sent</th>
                <th className="px-2 py-2 font-medium">Preview</th>
                <th className="w-10 px-2 py-2 font-medium"></th>
                <th className="w-24 px-2 py-2 font-medium">Delivered</th>
                <th className="w-40 px-6 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const statusLabel =
                  b.status === "SENDING"
                    ? "Interrupted"
                    : b.retractedCount > 0
                      ? `${b.retractedCount} retracted`
                      : b.editedCount > 0
                        ? `${b.editedCount} edited`
                        : b.failCount > 0
                          ? "Partial failure"
                          : "Sent";
                return (
                  <tr key={b.id} className="hover:bg-muted/50 border-b">
                    <td className="px-6 py-2 whitespace-nowrap">
                      <NavLink to={`/broadcast/history/${b.id}`} className="block">
                        {relativeTime(b.createdAt)}
                      </NavLink>
                    </td>
                    <td className="max-w-sm truncate px-2 py-2">
                      {b.text.slice(0, 60)}
                      {b.text.length > 60 ? "…" : ""}
                    </td>
                    <td className="px-2 py-2">
                      {b.mediaKind === "PHOTO" ? (
                        <ImageIcon className="h-3.5 w-3.5" />
                      ) : b.mediaKind === "VIDEO" ? (
                        <Paperclip className="h-3.5 w-3.5" />
                      ) : null}
                    </td>
                    <td
                      className={`px-2 py-2 ${b.failCount > 0 ? "text-amber-600" : ""}`}
                    >
                      {b.successCount}/{b.totalRecipients}
                    </td>
                    <td className="px-6 py-2">{statusLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {list.hasNextPage && (
          <div className="flex justify-center p-4">
            <Button
              variant="outline"
              size="sm"
              disabled={list.isFetchingNextPage}
              onClick={() => list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </main>

      <BroadcastDetailSheet
        broadcastId={broadcastId ?? null}
        open={Boolean(broadcastId)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Ensure `Input` UI primitive exists**

Run: `ls apps/admin/src/components/ui/input.tsx`
If missing, bring it in via shadcn add (`pnpm dlx shadcn@latest add input`) inside `apps/admin`. Commit the scaffold separately if so.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter admin check-types`
Expected: PASS (BroadcastDetailSheet stub built next will satisfy the import — for now, create a placeholder so this task can compile).

Create placeholder `apps/admin/src/components/broadcast/BroadcastDetailSheet.tsx`:

```tsx
export function BroadcastDetailSheet({
  broadcastId,
  open,
}: {
  broadcastId: string | null;
  open: boolean;
}) {
  if (!open || !broadcastId) return null;
  return null;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/broadcast
git commit -m "feat(admin): broadcast history list page"
```

---

## Task 13: `BroadcastDetailSheet`

**Files:**
- Replace placeholder: `apps/admin/src/components/broadcast/BroadcastDetailSheet.tsx`
- Create: `apps/admin/src/components/broadcast/DeliveryRow.tsx`

- [ ] **Step 1: Ensure shadcn Sheet primitive exists**

Run: `ls apps/admin/src/components/ui/sheet.tsx`
If missing: `cd apps/admin && pnpm dlx shadcn@latest add sheet checkbox badge`.

- [ ] **Step 2: DeliveryRow**

Create `apps/admin/src/components/broadcast/DeliveryRow.tsx`:

```tsx
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

type Delivery = {
  id: string;
  username: string | null;
  firstName: string;
  status: "PENDING" | "SENT" | "FAILED" | "RETRACTED" | "EDITED";
  error: string | null;
};

type Props = {
  delivery: Delivery;
  selected: boolean;
  onToggle: () => void;
};

const BADGE: Record<Delivery["status"], { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-slate-100 text-slate-700" },
  SENT: { label: "Sent", className: "bg-emerald-100 text-emerald-800" },
  EDITED: { label: "Edited", className: "bg-indigo-100 text-indigo-800" },
  RETRACTED: { label: "Retracted", className: "bg-zinc-200 text-zinc-700" },
  FAILED: { label: "Failed", className: "bg-amber-100 text-amber-800" },
};

export function DeliveryRow({ delivery, selected, onToggle }: Props) {
  const badge = BADGE[delivery.status];
  return (
    <div className="hover:bg-muted/50 flex items-center gap-3 border-b px-4 py-2 text-sm">
      <Checkbox checked={selected} onCheckedChange={onToggle} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-muted-foreground">
          {delivery.username ? `@${delivery.username}` : "(no username)"}
        </span>
        <span className="truncate">{delivery.firstName}</span>
      </div>
      <Badge variant="secondary" className={`font-normal ${badge.className}`}>
        {badge.label}
      </Badge>
    </div>
  );
}
```

- [ ] **Step 3: BroadcastDetailSheet**

Replace `apps/admin/src/components/broadcast/BroadcastDetailSheet.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { trpcReact } from "@/utils/trpc";
import { DeliveryRow } from "./DeliveryRow";
import type { DeliveryStatus } from "@dko/trpc";

type Props = {
  broadcastId: string | null;
  open: boolean;
};

type StatusFilter = "ALL" | DeliveryStatus;

export function BroadcastDetailSheet({ broadcastId, open }: Props) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<StatusFilter>("ALL");

  const detail = trpcReact.admin.broadcastGet.useQuery(
    { broadcastId: broadcastId ?? "" },
    { enabled: Boolean(broadcastId) }
  );

  const deliveries = useMemo(() => {
    const all = detail.data?.deliveries ?? [];
    return filter === "ALL" ? all : all.filter((d) => d.status === filter);
  }, [detail.data, filter]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) navigate("/broadcast/history");
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Broadcast details</SheetTitle>
        </SheetHeader>

        {detail.isLoading ? (
          <p className="text-muted-foreground p-6 text-sm">Loading…</p>
        ) : !detail.data ? (
          <p className="text-muted-foreground p-6 text-sm">Not found.</p>
        ) : (
          <div className="flex h-full flex-col">
            <div className="space-y-2 border-b px-6 py-4">
              <p className="text-muted-foreground text-xs">
                {new Date(detail.data.createdAt).toLocaleString()}
              </p>
              <pre className="bg-muted whitespace-pre-wrap rounded-md p-3 text-sm">
                {detail.data.text}
              </pre>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" disabled>
                  Edit all
                </Button>
                <Button size="sm" variant="outline" disabled>
                  Retract all
                </Button>
                <Button size="sm" variant="outline" disabled>
                  Resend…
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 border-b px-6 py-2 text-xs">
              {(["ALL", "SENT", "FAILED", "RETRACTED", "EDITED"] as StatusFilter[]).map(
                (k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={filter === k ? "default" : "outline"}
                    onClick={() => setFilter(k)}
                  >
                    {k.toLowerCase()}
                  </Button>
                )
              )}
              <span className="text-muted-foreground ml-auto">
                {deliveries.length} shown
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {deliveries.map((d) => (
                <DeliveryRow
                  key={d.id}
                  delivery={d}
                  selected={selected.has(d.id)}
                  onToggle={() => toggle(d.id)}
                />
              ))}
            </div>

            {selected.size > 0 && (
              <div className="bg-background flex items-center justify-between border-t px-6 py-3 text-sm">
                <span>{selected.size} selected</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled>Retract</Button>
                  <Button size="sm" variant="outline" disabled>Edit</Button>
                  <Button size="sm" variant="outline" disabled>Resend</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Export `DeliveryStatus` type from @dko/trpc**

Edit `packages/trpc/src/index.ts`. Add:

```ts
export type DeliveryStatus =
  | "PENDING"
  | "SENT"
  | "FAILED"
  | "RETRACTED"
  | "EDITED";
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter admin check-types && pnpm --filter @dko/trpc check-types`
Expected: PASS.

```bash
git add apps/admin/src packages/trpc/src/index.ts
git commit -m "feat(admin): broadcast detail sheet"
```

---

## Task 14: `broadcast.retract` procedure

**Files:**
- Create: `packages/trpc/src/services/broadcastActions.ts` (initial: `retractDelivery` helper)
- Create: `packages/trpc/src/routers/admin/broadcastRetract.ts`
- Modify: `packages/trpc/src/routers/admin/index.ts`

- [ ] **Step 1: Helper**

Create `packages/trpc/src/services/broadcastActions.ts`:

```ts
import type { Telegram } from "telegraf";
import type { Db } from "../trpc.js";

export type DeliveryActionResult = {
  deliveryId: string;
  userId: string;
  username: string | null;
  firstName: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export async function retractDelivery(
  ctx: { db: Db; teleBot: Telegram },
  deliveryId: string
): Promise<DeliveryActionResult> {
  const d = await ctx.db.broadcastDelivery.findUnique({
    where: { id: deliveryId },
  });
  if (!d) {
    return {
      deliveryId,
      userId: "0",
      username: null,
      firstName: "",
      ok: false,
      error: "delivery_not_found",
    };
  }
  const base = {
    deliveryId,
    userId: d.userId.toString(),
    username: d.username,
    firstName: d.firstName,
  };
  if (d.status !== "SENT" && d.status !== "EDITED") {
    return { ...base, ok: false, skipped: true, error: "not_deliverable" };
  }
  if (!d.telegramMessageId) {
    return { ...base, ok: false, skipped: true, error: "no_message_id" };
  }
  try {
    await ctx.teleBot.deleteMessage(
      Number(d.telegramChatId),
      Number(d.telegramMessageId)
    );
    await ctx.db.broadcastDelivery.update({
      where: { id: deliveryId },
      data: { status: "RETRACTED", retractedAt: new Date() },
    });
    return { ...base, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await ctx.db.broadcastDelivery.update({
      where: { id: deliveryId },
      data: { error: msg },
    });
    return { ...base, ok: false, error: msg };
  }
}
```

- [ ] **Step 2: Procedure**

Create `packages/trpc/src/routers/admin/broadcastRetract.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure } from "../../trpc.js";
import { withRateLimit } from "../../services/withRateLimit.js";
import { retractDelivery } from "../../services/broadcastActions.js";

export default adminProcedure
  .input(
    z.object({
      broadcastId: z.string(),
      deliveryIds: z.array(z.string()).optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const deliveries = await ctx.db.broadcastDelivery.findMany({
      where: input.deliveryIds
        ? { broadcastId: input.broadcastId, id: { in: input.deliveryIds } }
        : { broadcastId: input.broadcastId },
      select: { id: true },
    });

    if (
      input.deliveryIds &&
      deliveries.length !== input.deliveryIds.length
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Some deliveryIds do not belong to this broadcast.",
      });
    }

    const serial = withRateLimit(100);
    const runOne = serial((id: string) => retractDelivery(ctx, id));
    const results = await Promise.all(deliveries.map((d) => runOne(d.id)));

    return { results };
  });
```

- [ ] **Step 3: Register + typecheck + commit**

Add import + entry to `packages/trpc/src/routers/admin/index.ts`. Then:

```bash
pnpm --filter @dko/trpc check-types
git add packages/trpc/src
git commit -m "feat(trpc): broadcast.retract"
```

---

## Task 15: Wire retract into UI

**Files:**
- Create: `apps/admin/src/components/broadcast/actions/RetractConfirmDialog.tsx`
- Modify: `apps/admin/src/components/broadcast/BroadcastDetailSheet.tsx` (enable Retract buttons)

- [ ] **Step 1: Confirm dialog**

Create `apps/admin/src/components/broadcast/actions/RetractConfirmDialog.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  count: number;
  isRetracting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function RetractConfirmDialog({
  open,
  count,
  isRetracting,
  onConfirm,
  onOpenChange,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retract broadcast?</DialogTitle>
          <DialogDescription>
            This will permanently delete the message from {count}{" "}
            {count === 1 ? "recipient" : "recipients"} in their Telegram chat.
            Cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRetracting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isRetracting}
          >
            {isRetracting ? "Retracting…" : "Retract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire in BroadcastDetailSheet**

Modify `apps/admin/src/components/broadcast/BroadcastDetailSheet.tsx`:

1. Import `RetractConfirmDialog` and the `toast` helper (`sonner`).
2. Add state: `const [retractOpen, setRetractOpen] = useState<"all" | "selected" | null>(null);`
3. Hook mutation: `const retract = trpcReact.admin.broadcastRetract.useMutation();`
4. Replace the two `disabled` "Retract" buttons (the header "Retract all" and the footer "Retract") with handlers that set `setRetractOpen("all" | "selected")`.
5. Render `<RetractConfirmDialog>` at the bottom with `open={retractOpen !== null}` and `onConfirm`:

```tsx
const onRetractConfirm = async () => {
  const deliveryIds =
    retractOpen === "selected" ? Array.from(selected) : undefined;
  try {
    const result = await retract.mutateAsync({
      broadcastId: broadcastId!,
      deliveryIds,
    });
    const ok = result.results.filter((r) => r.ok).length;
    const fail = result.results.length - ok;
    toast.success(`Retracted ${ok}${fail ? ` — ${fail} failed` : ""}.`);
    setRetractOpen(null);
    setSelected(new Set());
    detail.refetch();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Retract failed");
  }
};
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter admin check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/broadcast
git commit -m "feat(admin): wire broadcast retract"
```

---

## Task 16: Edit-method-selection helper (pure fn)

**Files:**
- Create: `packages/trpc/src/services/broadcastEditMethod.ts`
- Create: `packages/trpc/src/services/broadcastEditMethod.spec.ts`

- [ ] **Step 1: Write failing test**

Create `packages/trpc/src/services/broadcastEditMethod.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { selectEditMethod } from "./broadcastEditMethod.js";

describe("selectEditMethod", () => {
  it("text → text uses editMessageText", () => {
    expect(
      selectEditMethod({ currentKind: null, nextText: "hi", nextMedia: false })
    ).toEqual({ method: "editMessageText" });
  });
  it("photo + only new caption uses editMessageCaption", () => {
    expect(
      selectEditMethod({ currentKind: "PHOTO", nextText: "hi", nextMedia: false })
    ).toEqual({ method: "editMessageCaption" });
  });
  it("photo + new media uses editMessageMedia", () => {
    expect(
      selectEditMethod({ currentKind: "PHOTO", nextText: "cap", nextMedia: true })
    ).toEqual({ method: "editMessageMedia" });
  });
  it("text → media is rejected", () => {
    expect(
      selectEditMethod({ currentKind: null, nextText: "hi", nextMedia: true })
    ).toEqual({ method: null, error: "cannot_add_media_to_text" });
  });
  it("media → no-media is rejected", () => {
    expect(
      selectEditMethod({ currentKind: "PHOTO", nextText: "hi", nextMedia: false, removeMedia: true })
    ).toEqual({ method: null, error: "cannot_remove_media" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dko/trpc test`
Expected: FAIL with `Cannot find module './broadcastEditMethod.js'`.

- [ ] **Step 3: Implement**

Create `packages/trpc/src/services/broadcastEditMethod.ts`:

```ts
export type CurrentKind = "PHOTO" | "VIDEO" | null;

export type EditMethodInput = {
  currentKind: CurrentKind;
  nextText: string;
  nextMedia: boolean;
  removeMedia?: boolean;
};

export type EditMethodOutput =
  | { method: "editMessageText" }
  | { method: "editMessageCaption" }
  | { method: "editMessageMedia" }
  | { method: null; error: "cannot_add_media_to_text" | "cannot_remove_media" };

export function selectEditMethod(input: EditMethodInput): EditMethodOutput {
  const { currentKind, nextMedia, removeMedia } = input;

  if (currentKind === null) {
    if (nextMedia) return { method: null, error: "cannot_add_media_to_text" };
    return { method: "editMessageText" };
  }

  if (removeMedia) return { method: null, error: "cannot_remove_media" };
  if (nextMedia) return { method: "editMessageMedia" };
  return { method: "editMessageCaption" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dko/trpc test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/services/broadcastEditMethod.ts packages/trpc/src/services/broadcastEditMethod.spec.ts
git commit -m "feat(trpc): selectEditMethod helper"
```

---

## Task 17: `broadcast.edit` procedure

**Files:**
- Modify: `packages/trpc/src/services/broadcastActions.ts` (add `editDelivery`)
- Create: `packages/trpc/src/routers/admin/broadcastEdit.ts`
- Modify: `packages/trpc/src/routers/admin/index.ts`

- [ ] **Step 1: Add editDelivery helper**

Append to `packages/trpc/src/services/broadcastActions.ts`:

```ts
import telegramifyMarkdown from "telegramify-markdown";
import { selectEditMethod, type CurrentKind } from "./broadcastEditMethod.js";

export type EditInput = {
  text?: string;
  media?: { kind: "photo" | "video"; buffer: Buffer; filename: string };
  removeMedia?: boolean;
};

export async function editDelivery(
  ctx: { db: Db; teleBot: Telegram },
  deliveryId: string,
  broadcastCurrentKind: CurrentKind,
  input: EditInput
): Promise<DeliveryActionResult> {
  const d = await ctx.db.broadcastDelivery.findUnique({
    where: { id: deliveryId },
  });
  if (!d) {
    return {
      deliveryId,
      userId: "0",
      username: null,
      firstName: "",
      ok: false,
      error: "delivery_not_found",
    };
  }
  const base = {
    deliveryId,
    userId: d.userId.toString(),
    username: d.username,
    firstName: d.firstName,
  };
  if (d.status !== "SENT" && d.status !== "EDITED") {
    return { ...base, ok: false, skipped: true, error: "not_editable" };
  }
  if (!d.telegramMessageId) {
    return { ...base, ok: false, skipped: true, error: "no_message_id" };
  }

  const nextText = input.text ?? "";
  const caption = nextText.trim()
    ? telegramifyMarkdown(nextText, "escape")
    : undefined;

  const decision = selectEditMethod({
    currentKind: broadcastCurrentKind,
    nextText,
    nextMedia: Boolean(input.media),
    removeMedia: input.removeMedia,
  });

  if (decision.method === null) {
    return { ...base, ok: false, skipped: true, error: decision.error };
  }

  const chatId = Number(d.telegramChatId);
  const msgId = Number(d.telegramMessageId);

  try {
    let editedMediaFileId: string | null = null;
    if (decision.method === "editMessageText") {
      await ctx.teleBot.editMessageText(chatId, msgId, undefined, caption ?? "", {
        parse_mode: "MarkdownV2",
      });
    } else if (decision.method === "editMessageCaption") {
      await ctx.teleBot.editMessageCaption(chatId, msgId, undefined, {
        caption,
        parse_mode: "MarkdownV2",
      });
    } else {
      const m = input.media!;
      const sent = await ctx.teleBot.editMessageMedia(chatId, msgId, undefined, {
        type: m.kind,
        media: { source: m.buffer, filename: m.filename },
        caption,
        parse_mode: "MarkdownV2",
      });
      if (typeof sent !== "boolean") {
        if (m.kind === "photo" && "photo" in sent) {
          editedMediaFileId = sent.photo[sent.photo.length - 1]?.file_id ?? null;
        } else if (m.kind === "video" && "video" in sent) {
          editedMediaFileId = sent.video.file_id;
        }
      }
    }

    await ctx.db.broadcastDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "EDITED",
        lastEditedAt: new Date(),
        editedText: nextText,
        editedMediaFileId,
      },
    });
    return { ...base, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await ctx.db.broadcastDelivery.update({
      where: { id: deliveryId },
      data: { error: msg },
    });
    return { ...base, ok: false, error: msg };
  }
}
```

- [ ] **Step 2: Procedure**

Create `packages/trpc/src/routers/admin/broadcastEdit.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure } from "../../trpc.js";
import { withRateLimit } from "../../services/withRateLimit.js";
import { editDelivery } from "../../services/broadcastActions.js";

export default adminProcedure
  .input(
    z.object({
      broadcastId: z.string(),
      deliveryIds: z.array(z.string()).optional(),
      text: z.string().min(1).max(4096),
      mediaBase64: z.string().optional(),
      mediaKind: z.enum(["photo", "video"]).optional(),
      mediaFilename: z.string().optional(),
      removeMedia: z.boolean().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const broadcast = await ctx.db.broadcast.findUnique({
      where: { id: input.broadcastId },
      select: { mediaKind: true },
    });
    if (!broadcast) throw new TRPCError({ code: "NOT_FOUND" });

    const deliveries = await ctx.db.broadcastDelivery.findMany({
      where: input.deliveryIds
        ? { broadcastId: input.broadcastId, id: { in: input.deliveryIds } }
        : { broadcastId: input.broadcastId },
      select: { id: true },
    });

    if (input.deliveryIds && deliveries.length !== input.deliveryIds.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Some deliveryIds do not belong to this broadcast.",
      });
    }

    const media =
      input.mediaBase64 && input.mediaKind && input.mediaFilename
        ? {
            kind: input.mediaKind,
            buffer: Buffer.from(input.mediaBase64, "base64"),
            filename: input.mediaFilename,
          }
        : undefined;

    const serial = withRateLimit(100);
    const runOne = serial((id: string) =>
      editDelivery(ctx, id, broadcast.mediaKind, {
        text: input.text,
        media,
        removeMedia: input.removeMedia,
      })
    );
    const results = await Promise.all(deliveries.map((d) => runOne(d.id)));
    return { results };
  });
```

- [ ] **Step 3: Register + typecheck + commit**

Add `broadcastEdit` to `packages/trpc/src/routers/admin/index.ts`.

Run: `pnpm --filter @dko/trpc check-types && pnpm --filter @dko/trpc test`
Expected: PASS.

```bash
git add packages/trpc
git commit -m "feat(trpc): broadcast.edit"
```

---

## Task 18: Edit UI — dialog + wiring

**Files:**
- Create: `apps/admin/src/components/broadcast/actions/EditBroadcastDialog.tsx`
- Modify: `apps/admin/src/components/broadcast/BroadcastDetailSheet.tsx`

- [ ] **Step 1: Edit dialog**

Create `apps/admin/src/components/broadcast/actions/EditBroadcastDialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  count: number;
  currentKind: "PHOTO" | "VIDEO" | null;
  initialText: string;
  isSubmitting: boolean;
  onConfirm: (args: { text: string }) => void;
  onOpenChange: (open: boolean) => void;
};

export function EditBroadcastDialog({
  open,
  count,
  currentKind,
  initialText,
  isSubmitting,
  onConfirm,
  onOpenChange,
}: Props) {
  const [text, setText] = useState(initialText);
  useEffect(() => setText(initialText), [initialText, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Edit {currentKind ? "caption" : "message"} for {count}{" "}
            {count === 1 ? "recipient" : "recipients"}
          </DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={currentKind ? "Caption…" : "Message…"}
        />
        <p className="text-muted-foreground text-xs">
          {currentKind
            ? "Media cannot be removed via edit. Use Retract + Resend instead."
            : "Text-only messages cannot gain media via edit. Use Retract + Resend instead."}
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm({ text })}
            disabled={isSubmitting || text.trim().length === 0}
          >
            {isSubmitting ? "Saving…" : "Save edit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire in detail sheet**

Modify `apps/admin/src/components/broadcast/BroadcastDetailSheet.tsx`:

1. Import `EditBroadcastDialog`.
2. Add `const [editOpen, setEditOpen] = useState<"all" | "selected" | null>(null);`
3. Hook `const edit = trpcReact.admin.broadcastEdit.useMutation();`
4. Replace the `disabled` "Edit all" / "Edit" buttons with onClicks that set `setEditOpen`.
5. Render the dialog below the retract dialog:

```tsx
<EditBroadcastDialog
  open={editOpen !== null}
  count={editOpen === "selected" ? selected.size : detail.data?.deliveries.length ?? 0}
  currentKind={detail.data?.mediaKind ?? null}
  initialText={detail.data?.text ?? ""}
  isSubmitting={edit.isPending}
  onOpenChange={(o) => !o && setEditOpen(null)}
  onConfirm={async ({ text }) => {
    const deliveryIds = editOpen === "selected" ? Array.from(selected) : undefined;
    try {
      const res = await edit.mutateAsync({
        broadcastId: broadcastId!,
        deliveryIds,
        text,
      });
      const ok = res.results.filter((r) => r.ok).length;
      const skipped = res.results.filter((r) => r.skipped).length;
      toast.success(`Edited ${ok}${skipped ? ` — ${skipped} skipped` : ""}.`);
      setEditOpen(null);
      setSelected(new Set());
      detail.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Edit failed");
    }
  }}
/>
```

- [ ] **Step 3: Ensure Textarea primitive exists**

Run: `ls apps/admin/src/components/ui/textarea.tsx`
If missing: `cd apps/admin && pnpm dlx shadcn@latest add textarea`.

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter admin check-types
git add apps/admin/src
git commit -m "feat(admin): wire broadcast edit"
```

---

## Task 19: `broadcast.resend` procedure

**Files:**
- Create: `packages/trpc/src/routers/admin/broadcastResend.ts`
- Modify: `packages/trpc/src/routers/admin/index.ts`

- [ ] **Step 1: Procedure**

Create `packages/trpc/src/routers/admin/broadcastResend.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure } from "../../trpc.js";
import { createBroadcast } from "../../services/broadcast.js";

export default adminProcedure
  .input(
    z.object({
      broadcastId: z.string(),
      deliveryIds: z.array(z.string()).optional(),
      failuresOnly: z.boolean().optional(),
      text: z.string().max(4096).optional(),
      mediaBase64: z.string().optional(),
      mediaKind: z.enum(["photo", "video"]).optional(),
      mediaFilename: z.string().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const source = await ctx.db.broadcast.findUnique({
      where: { id: input.broadcastId },
      include: {
        deliveries: {
          select: { id: true, userId: true, status: true },
        },
      },
    });
    if (!source) throw new TRPCError({ code: "NOT_FOUND" });

    let selected = source.deliveries;
    if (input.deliveryIds) {
      const allowed = new Set(input.deliveryIds);
      selected = selected.filter((d) => allowed.has(d.id));
      if (selected.length !== input.deliveryIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
    } else if (input.failuresOnly) {
      selected = selected.filter((d) => d.status === "FAILED");
    }

    const targetUserIds = Array.from(
      new Set(selected.map((d) => Number(d.userId)))
    );
    if (targetUserIds.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No recipients to resend to.",
      });
    }

    const media =
      input.mediaBase64 && input.mediaKind && input.mediaFilename
        ? {
            kind: input.mediaKind,
            buffer: Buffer.from(input.mediaBase64, "base64"),
            filename: input.mediaFilename,
          }
        : undefined;

    return createBroadcast(ctx, {
      message: input.text ?? source.text,
      targetUserIds,
      media,
      createdByTelegramId: null,
      parentBroadcastId: source.id,
    });
  });
```

- [ ] **Step 2: Register + typecheck + commit**

Add `broadcastResend` to `packages/trpc/src/routers/admin/index.ts`.

```bash
pnpm --filter @dko/trpc check-types
git add packages/trpc
git commit -m "feat(trpc): broadcast.resend"
```

---

## Task 20: Wire resend in UI

**Files:**
- Create: `apps/admin/src/components/broadcast/actions/ResendBroadcastDialog.tsx`
- Modify: `apps/admin/src/components/broadcast/BroadcastDetailSheet.tsx`
- Modify: `apps/admin/src/components/broadcast/BroadcastHistoryPage.tsx` — add per-row "Resend to failures" action menu

- [ ] **Step 1: ResendBroadcastDialog**

Create `apps/admin/src/components/broadcast/actions/ResendBroadcastDialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  count: number;
  initialText: string;
  isSubmitting: boolean;
  onConfirm: (args: { text: string }) => void;
  onOpenChange: (open: boolean) => void;
};

export function ResendBroadcastDialog({
  open,
  count,
  initialText,
  isSubmitting,
  onConfirm,
  onOpenChange,
}: Props) {
  const [text, setText] = useState(initialText);
  useEffect(() => setText(initialText), [initialText, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Resend to {count} {count === 1 ? "recipient" : "recipients"}
          </DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
        />
        <p className="text-muted-foreground text-xs">
          This creates a new broadcast linked to the original.
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm({ text })}
            disabled={isSubmitting || text.trim().length === 0}
          >
            {isSubmitting ? "Sending…" : "Resend"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire in detail sheet**

Modify `BroadcastDetailSheet.tsx`:

1. Import `ResendBroadcastDialog`.
2. Add `const [resendOpen, setResendOpen] = useState<"all" | "selected" | null>(null);`
3. `const resend = trpcReact.admin.broadcastResend.useMutation();`
4. Replace the disabled "Resend…" / "Resend" buttons with click handlers.
5. Render dialog:

```tsx
<ResendBroadcastDialog
  open={resendOpen !== null}
  count={resendOpen === "selected" ? selected.size : detail.data?.deliveries.length ?? 0}
  initialText={detail.data?.text ?? ""}
  isSubmitting={resend.isPending}
  onOpenChange={(o) => !o && setResendOpen(null)}
  onConfirm={async ({ text }) => {
    const deliveryIds = resendOpen === "selected" ? Array.from(selected) : undefined;
    try {
      const result = await resend.mutateAsync({
        broadcastId: broadcastId!,
        deliveryIds,
        text,
      });
      toast.success(
        `Sent to ${result.successCount}${result.failCount ? ` — ${result.failCount} failed` : ""}.`
      );
      setResendOpen(null);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resend failed");
    }
  }}
/>
```

- [ ] **Step 3: History row "Resend to failures" action**

Modify `BroadcastHistoryPage.tsx`. Add a kebab menu (`DropdownMenu` from shadcn) in the status cell with items: "Open detail", "Resend to failures" (shown when `b.failCount > 0`).

Handler for "Resend to failures":

```tsx
const resend = trpcReact.admin.broadcastResend.useMutation();
const onResendFailures = async (id: string) => {
  try {
    const r = await resend.mutateAsync({ broadcastId: id, failuresOnly: true });
    toast.success(`Re-sent to ${r.successCount}${r.failCount ? ` — ${r.failCount} failed` : ""}.`);
    list.refetch();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Resend failed");
  }
};
```

- [ ] **Step 4: Ensure DropdownMenu primitive exists**

Run: `ls apps/admin/src/components/ui/dropdown-menu.tsx`
If missing: `cd apps/admin && pnpm dlx shadcn@latest add dropdown-menu`.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter admin check-types
git add apps/admin/src
git commit -m "feat(admin): wire broadcast resend"
```

---

## Task 21: Interrupted-send resume

**Files:**
- Modify: `packages/trpc/src/services/broadcastActions.ts` — add `resumeSend`.
- Create: `packages/trpc/src/routers/admin/broadcastResumeSend.ts`
- Modify: `packages/trpc/src/routers/admin/index.ts`
- Modify: `apps/admin/src/components/broadcast/BroadcastHistoryPage.tsx` — surface "Resume send" action on interrupted rows.

- [ ] **Step 1: resumeSend helper**

Append to `packages/trpc/src/services/broadcastActions.ts`:

```ts
import { createBroadcast } from "./broadcast.js";

export async function resumeSend(
  ctx: { db: Db; teleBot: Telegram },
  broadcastId: string
): Promise<{ successCount: number; failCount: number }> {
  const b = await ctx.db.broadcast.findUnique({
    where: { id: broadcastId },
    include: {
      deliveries: {
        where: { status: "PENDING" },
        select: { userId: true },
      },
    },
  });
  if (!b) return { successCount: 0, failCount: 0 };
  const targetUserIds = b.deliveries.map((d) => Number(d.userId));
  if (targetUserIds.length === 0) {
    await ctx.db.broadcast.update({
      where: { id: broadcastId },
      data: { status: "SENT" },
    });
    return { successCount: 0, failCount: 0 };
  }
  // Delegate to createBroadcast but pass the existing broadcast id by
  // fanning out through a secondary broadcast. Simpler: reuse broadcast.resend
  // here by creating a new Broadcast. Keeping it explicit so state is clear.
  const result = await createBroadcast(ctx, {
    message: b.text,
    targetUserIds,
    media: undefined, // media resends reuse file_id flow; out of scope for resume
    createdByTelegramId: b.createdByTelegramId,
    parentBroadcastId: b.id,
  });
  return { successCount: result.successCount, failCount: result.failCount };
}
```

- [ ] **Step 2: Procedure**

Create `packages/trpc/src/routers/admin/broadcastResumeSend.ts`:

```ts
import { z } from "zod";
import { adminProcedure } from "../../trpc.js";
import { resumeSend } from "../../services/broadcastActions.js";

export default adminProcedure
  .input(z.object({ broadcastId: z.string() }))
  .mutation(({ input, ctx }) => resumeSend(ctx, input.broadcastId));
```

- [ ] **Step 3: Register**

Add `broadcastResumeSend` to `packages/trpc/src/routers/admin/index.ts`.

- [ ] **Step 4: Surface in UI**

In `BroadcastHistoryPage.tsx`, in the row dropdown, when `b.status === "SENDING"` AND `Date.now() - new Date(b.createdAt).getTime() > 10 * 60_000`, show a "Resume send" item:

```tsx
const resume = trpcReact.admin.broadcastResumeSend.useMutation();
const onResume = async (id: string) => {
  try {
    const r = await resume.mutateAsync({ broadcastId: id });
    toast.success(`Resumed — delivered to ${r.successCount}.`);
    list.refetch();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Resume failed");
  }
};
```

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @dko/trpc check-types
pnpm --filter admin check-types
git add packages/trpc/src apps/admin/src
git commit -m "feat(broadcast): resume interrupted send"
```

---

## Task 22: Final integration check + UAT prep

**Files:** (no code; polishing)

- [ ] **Step 1: Run full typecheck + lint + build + test**

```bash
pnpm check-types
pnpm lint
pnpm build
pnpm --filter @dko/trpc test
```

Expected: all PASS (warnings OK).

- [ ] **Step 2: Smoke test the UI locally**

Run: `pnpm --filter admin dev`. In the browser:
1. `/broadcast/compose` → send a 3-user broadcast to yourself + 2 others → expect history row with 3/3.
2. Open detail sheet → retract one row → status flips to Retracted in the UI.
3. Retract all remaining → all rows flip; header status shows "N retracted".
4. Send a photo broadcast → edit caption → status flips to Edited.
5. Send a broadcast that will fail for one user → "Resend to failures" from row menu → new child broadcast row appears with "↳ Resent from" style indicator (a short text label; no dedicated UI required beyond the row showing `parentBroadcastId`).

- [ ] **Step 3: Open PR for review**

PR #144 already carries the spec. Push all new commits to the same branch so the PR surfaces the full implementation for review alongside the spec. Run:

Run: `git push`
Expected: push succeeds; PR shows all commits.

- [ ] **Step 4: Prepare UAT script (per memory: step-by-step via AskUserQuestion)**

Draft the UAT steps in the PR description for the human to verify:
1. Compose + send to yourself.
2. Open History; confirm row.
3. Retract; confirm message disappears in Telegram.
4. Compose + send with image; edit caption; confirm new caption lands in Telegram.
5. Resend from history; confirm new row with parent linkage.

---

## Open Items

- **Attribution plumbing (follow-up PR):** Forward the admin's Telegram ID from the admin Vercel proxy (`apps/admin/api/admin/trpc/[...slug].ts`) to the lambda via a header, then read it into the lambda's tRPC `createContext`. Then swap `createdByTelegramId: null` for the real value in `broadcast.create` and `broadcast.resend`.
- If post-UAT reveals per-delivery UI polish gaps (e.g., showing the `parentBroadcastId` link as a clickable chip in the detail header), follow up in a separate PR.
- Resuming an interrupted broadcast that had media is not supported in this cut (see Task 21 — text is resent without media). If this bites, a follow-up should pass `mediaFileId` through for Telegram file-id reuse.
