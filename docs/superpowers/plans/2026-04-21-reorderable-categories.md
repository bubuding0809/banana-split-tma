# Reorderable Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let chat members customize the expense category picker by reordering tiles, hiding unused ones, and resetting to defaults via a dedicated "Organize categories" page.

**Architecture:** New `ChatCategoryOrdering` table with sparse semantics (zero rows = default order). `listByChat` returns one flat `items` array; picker filters hidden, Organize page shows both zones. Replace-all `setOrdering` mutation plus a `resetOrdering` DELETE. Frontend uses `@dnd-kit/sortable` with PointerSensor tuned for TMA touch.

**Tech Stack:** Prisma / Postgres / tRPC v11 / React 19 / @tanstack/react-router / @telegram-apps/telegram-ui / @telegram-apps/sdk-react / @dnd-kit/core + @dnd-kit/sortable / lucide-react / Tailwind / vitest (for pure helpers only)

**Spec reference:** `docs/superpowers/specs/2026-04-21-reorderable-categories-design.md`

---

## Project conventions (read before starting any task)

- **QA model is manual UAT.** The tRPC router has no unit tests today. The plan adds TDD only for pure helpers in `@repo/categories`, which already ships with vitest. Everything else is verified with `check-types`, the dev server, and a UAT script.
- **Commits:** Conventional commit style with scopes observed in git log (`feat(categories/web): …`, `fix(categories/trpc): …`). Hooks run lint + prettier on staged files; never bypass with `--no-verify`.
- **PRs:** `git checkout -b <branch>` → push → `gh pr create` → `gh pr merge --auto --squash --delete-branch`. CI runs on PRs only. Branch for this plan: `feat/categories-reorder` (branch at start of Task 1).
- **Running migrations:** `pnpm --filter @dko/database db:migrate -- --name add_chat_category_ordering` (note the `--` to pass the `--name` flag through to prisma).
- **Typecheck a package:** `pnpm --filter <name> check-types`. Turbo equivalent: `pnpm turbo run check-types --filter=<name>`.
- **Routes are file-based.** After adding/removing a route file under `apps/web/src/routes/`, regenerate the route tree with `pnpm --filter web exec tsr generate` (uses `@tanstack/router-cli`). Commit the regenerated `routeTree.gen.ts`.

---

## Branch setup

Before Task 1, create the feature branch from `main` (not from the current `fix/categories-uat-followups`):

```bash
git fetch origin main
git checkout -b feat/categories-reorder origin/main
```

If the current branch has uncommitted UAT-related work you need to preserve, stash first. Do **not** rebase this feature on top of `fix/categories-uat-followups` — the UAT branch is a separate PR track.

---

## Task 1: DB migration + Prisma model

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (add `ChatCategoryOrdering` model; back-relation on `Chat`)
- Create: `packages/database/prisma/migrations/<timestamp>_add_chat_category_ordering/migration.sql` (prisma generates)

- [ ] **Step 1: Add the Prisma model**

Open `packages/database/prisma/schema.prisma`. Append after the existing `ChatCategory` model (around line 265):

```prisma
model ChatCategoryOrdering {
  id          String   @id @default(uuid())
  chat        Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  chatId      BigInt
  categoryKey String
  sortOrder   Int
  hidden      Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([chatId, categoryKey])
  @@index([chatId])
}
```

- [ ] **Step 2: Add the back-relation on `Chat`**

In the same file, within `model Chat { ... }` (around line 37, next to `chatCategories`), add:

```prisma
  categoryOrderings          ChatCategoryOrdering[]
```

- [ ] **Step 3: Generate the migration**

```bash
pnpm --filter @dko/database db:migrate -- --name add_chat_category_ordering
```

Expected: Prisma prints the migration SQL, applies it to the dev DB, regenerates the client. A new folder appears under `packages/database/prisma/migrations/` with `migration.sql` containing the `CREATE TABLE`, unique index, chatId index, and FK to `Chat`.

- [ ] **Step 4: Verify types compile**

```bash
pnpm --filter @dko/database check-types
pnpm --filter @dko/trpc check-types
```

Expected: no type errors. The generated Prisma client now exposes `db.chatCategoryOrdering`.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(categories/db): add ChatCategoryOrdering table"
```

---

## Task 2: Category key helpers (TDD)

**Files:**
- Create: `packages/categories/src/keys.ts`
- Create: `packages/categories/src/keys.test.ts`
- Modify: `packages/categories/src/index.ts` (re-export)

- [ ] **Step 1: Write the failing test**

Create `packages/categories/src/keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BASE_CATEGORIES } from "./base.js";
import {
  isBaseKey,
  isCustomKey,
  parseCustomKey,
  assertKnownKey,
} from "./keys.js";

describe("category keys", () => {
  const sampleBaseId = BASE_CATEGORIES[0]!.id; // e.g. "base:food"

  it("isBaseKey recognizes base:* ids", () => {
    expect(isBaseKey(sampleBaseId)).toBe(true);
    expect(isBaseKey("base:nonexistent")).toBe(false);
    expect(isBaseKey("chat:abc")).toBe(false);
    expect(isBaseKey("random")).toBe(false);
  });

  it("isCustomKey recognizes chat:<uuid> ids", () => {
    expect(isCustomKey("chat:11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isCustomKey("chat:not-a-uuid")).toBe(false);
    expect(isCustomKey(sampleBaseId)).toBe(false);
  });

  it("parseCustomKey returns the uuid or null", () => {
    expect(parseCustomKey("chat:11111111-1111-1111-1111-111111111111")).toBe(
      "11111111-1111-1111-1111-111111111111"
    );
    expect(parseCustomKey(sampleBaseId)).toBe(null);
    expect(parseCustomKey("chat:nope")).toBe(null);
  });

  it("assertKnownKey accepts a valid base key and known custom uuid", () => {
    const customIds = new Set(["11111111-1111-1111-1111-111111111111"]);
    expect(() => assertKnownKey(sampleBaseId, customIds)).not.toThrow();
    expect(() =>
      assertKnownKey("chat:11111111-1111-1111-1111-111111111111", customIds)
    ).not.toThrow();
  });

  it("assertKnownKey throws on unknown keys", () => {
    const customIds = new Set<string>();
    expect(() => assertKnownKey("base:nonexistent", customIds)).toThrow(
      /Unknown category key/
    );
    expect(() =>
      assertKnownKey("chat:22222222-2222-2222-2222-222222222222", customIds)
    ).toThrow(/Unknown category key/);
    expect(() => assertKnownKey("garbage", customIds)).toThrow(
      /Unknown category key/
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @repo/categories test
```

Expected: `FAIL` with `Cannot find module './keys.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/categories/src/keys.ts`:

```ts
import { BASE_CATEGORIES } from "./base.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BASE_KEY_SET: ReadonlySet<string> = new Set(BASE_CATEGORIES.map((c) => c.id));

export function isBaseKey(key: string): boolean {
  return BASE_KEY_SET.has(key);
}

export function isCustomKey(key: string): boolean {
  if (!key.startsWith("chat:")) return false;
  return UUID_RE.test(key.slice("chat:".length));
}

export function parseCustomKey(key: string): string | null {
  if (!isCustomKey(key)) return null;
  return key.slice("chat:".length);
}

export function assertKnownKey(
  key: string,
  knownCustomIds: ReadonlySet<string>
): void {
  if (isBaseKey(key)) return;
  const custom = parseCustomKey(key);
  if (custom !== null && knownCustomIds.has(custom)) return;
  throw new Error(`Unknown category key: ${key}`);
}
```

- [ ] **Step 4: Re-export from the package index**

Edit `packages/categories/src/index.ts` and append one line:

```ts
export {
  isBaseKey,
  isCustomKey,
  parseCustomKey,
  assertKnownKey,
} from "./keys.js";
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @repo/categories test
```

Expected: `PASS` — 5 tests passing.

- [ ] **Step 6: Typecheck downstream consumers**

```bash
pnpm --filter @dko/trpc check-types
pnpm --filter web check-types
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/categories/src/keys.ts packages/categories/src/keys.test.ts packages/categories/src/index.ts
git commit -m "feat(categories): add category key helpers with unit tests"
```

---

## Task 3: Refactor `listByChat` to return unified `items` + `hasCustomOrder`

**Files:**
- Modify: `packages/trpc/src/routers/category/listByChat.ts`

Response shape changes from `{ base, custom }` to `{ items, hasCustomOrder }`. Every consumer must migrate (Task 10).

- [ ] **Step 1: Rewrite the router file**

Replace the full contents of `packages/trpc/src/routers/category/listByChat.ts`:

```ts
import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { BASE_CATEGORIES } from "@repo/categories";

const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
});

const itemSchema = z.object({
  id: z.string(),
  emoji: z.string(),
  title: z.string(),
  kind: z.enum(["base", "custom"]),
  hidden: z.boolean(),
  sortOrder: z.number(),
});

const outputSchema = z.object({
  items: z.array(itemSchema),
  hasCustomOrder: z.boolean(),
});

type OutItem = z.infer<typeof itemSchema>;

export const listByChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<z.infer<typeof outputSchema>> => {
  const [customRows, orderingRows] = await Promise.all([
    db.chatCategory.findMany({
      where: { chatId: input.chatId },
      orderBy: { createdAt: "asc" },
    }),
    db.chatCategoryOrdering.findMany({
      where: { chatId: input.chatId },
    }),
  ]);

  const hasCustomOrder = orderingRows.length > 0;

  // Build the universe of tiles this chat can render.
  const baseTiles: OutItem[] = BASE_CATEGORIES.map((c, idx) => ({
    id: c.id, // already "base:<slug>"
    emoji: c.emoji,
    title: c.title,
    kind: "base" as const,
    hidden: false,
    sortOrder: idx, // placeholder — overridden by ordering rows below
  }));

  const customTiles: OutItem[] = customRows.map((r, idx) => ({
    id: `chat:${r.id}`,
    emoji: r.emoji,
    title: r.title,
    kind: "custom" as const,
    hidden: false,
    sortOrder: BASE_CATEGORIES.length + idx, // placeholder
  }));

  const allTiles = [...baseTiles, ...customTiles];

  if (!hasCustomOrder) {
    // Default order: base in hardcoded order, custom by createdAt.
    // sortOrder is already assigned in the placeholder above.
    return {
      items: allTiles.sort((a, b) => a.sortOrder - b.sortOrder),
      hasCustomOrder: false,
    };
  }

  // Apply ordering rows. Tiles without a matching row render at the end,
  // unhidden — defensive fallback for base slugs added after the chat saved.
  const orderByKey = new Map(
    orderingRows.map((r) => [r.categoryKey, r] as const)
  );
  const maxKnownSort = orderingRows.reduce(
    (m, r) => (r.sortOrder > m ? r.sortOrder : m),
    -Infinity
  );
  let fallbackCursor = Number.isFinite(maxKnownSort) ? maxKnownSort + 1 : 0;

  const applied: OutItem[] = allTiles.map((t) => {
    const row = orderByKey.get(t.id);
    if (row) {
      return { ...t, sortOrder: row.sortOrder, hidden: row.hidden };
    }
    return { ...t, sortOrder: fallbackCursor++, hidden: false };
  });

  applied.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    // Tie-break: base before custom, then title A→Z
    if (a.kind !== b.kind) return a.kind === "base" ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  return { items: applied, hasCustomOrder: true };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return listByChatHandler(input, ctx.db);
  });
```

- [ ] **Step 2: Typecheck trpc package**

```bash
pnpm --filter @dko/trpc check-types
```

Expected: **it will report errors in `@dko/trpc` consumers of `base`/`custom`.** The `@dko/trpc` package itself should pass; downstream errors land in Task 10. If you see an error inside `packages/trpc/src/routers/category/`, fix it in this task before committing.

- [ ] **Step 3: Commit (expect downstream breakage until Task 10)**

```bash
git add packages/trpc/src/routers/category/listByChat.ts
git commit -m "feat(categories/trpc): listByChat returns unified items + hasCustomOrder"
```

Do not run the full monorepo `check-types` yet — the web app will break until Task 10. That's expected; we land the backend first, then consumers.

---

## Task 4: `setOrdering` mutation

**Files:**
- Create: `packages/trpc/src/routers/category/setOrdering.ts`

- [ ] **Step 1: Create the file**

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertKnownKey } from "@repo/categories";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const itemSchema = z.object({
  categoryKey: z.string().min(1),
  sortOrder: z.number().int(),
  hidden: z.boolean(),
});

const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
  items: z.array(itemSchema).min(1, "items cannot be empty"),
});

const outputSchema = z.object({ ok: z.literal(true) });

export const setOrderingHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<z.infer<typeof outputSchema>> => {
  // Look up the chat's known custom-category ids so we can validate
  // `chat:<uuid>` keys against real rows (not just UUID shape).
  const customs = await db.chatCategory.findMany({
    where: { chatId: input.chatId },
    select: { id: true },
  });
  const knownCustomIds = new Set(customs.map((c) => c.id));

  // Reject any unknown key before we touch the DB.
  for (const it of input.items) {
    try {
      assertKnownKey(it.categoryKey, knownCustomIds);
    } catch (err) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          err instanceof Error
            ? err.message
            : `Unknown category key: ${it.categoryKey}`,
      });
    }
  }

  // Reject duplicate categoryKeys in a single payload.
  const seen = new Set<string>();
  for (const it of input.items) {
    if (seen.has(it.categoryKey)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Duplicate category key in items: ${it.categoryKey}`,
      });
    }
    seen.add(it.categoryKey);
  }

  await db.$transaction(async (tx) => {
    await tx.chatCategoryOrdering.deleteMany({
      where: { chatId: input.chatId },
    });
    if (input.items.length > 0) {
      await tx.chatCategoryOrdering.createMany({
        data: input.items.map((it) => ({
          chatId: input.chatId,
          categoryKey: it.categoryKey,
          sortOrder: it.sortOrder,
          hidden: it.hidden,
        })),
      });
    }
  });

  return { ok: true };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return setOrderingHandler(input, ctx.db);
  });
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @dko/trpc check-types
```

Expected: no errors (file isn't wired into the router yet, but the file itself must compile).

- [ ] **Step 3: Commit**

```bash
git add packages/trpc/src/routers/category/setOrdering.ts
git commit -m "feat(categories/trpc): add setOrdering replace-all mutation"
```

---

## Task 5: `resetOrdering` mutation

**Files:**
- Create: `packages/trpc/src/routers/category/resetOrdering.ts`

- [ ] **Step 1: Create the file**

```ts
import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
});
const outputSchema = z.object({ ok: z.literal(true) });

export const resetOrderingHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<z.infer<typeof outputSchema>> => {
  await db.chatCategoryOrdering.deleteMany({
    where: { chatId: input.chatId },
  });
  return { ok: true };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return resetOrderingHandler(input, ctx.db);
  });
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @dko/trpc check-types
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/trpc/src/routers/category/resetOrdering.ts
git commit -m "feat(categories/trpc): add resetOrdering mutation"
```

---

## Task 6: Wire the new endpoints + update create/delete handlers

**Files:**
- Modify: `packages/trpc/src/routers/category/index.ts`
- Modify: `packages/trpc/src/routers/category/createChatCategory.ts`
- Modify: `packages/trpc/src/routers/category/deleteChatCategory.ts`

### Part A — register the new procedures

- [ ] **Step 1: Update `category/index.ts`**

Replace the full contents of `packages/trpc/src/routers/category/index.ts`:

```ts
import listByChat from "./listByChat.js";
import createChatCategory from "./createChatCategory.js";
import updateChatCategory from "./updateChatCategory.js";
import deleteChatCategory from "./deleteChatCategory.js";
import suggestCategory from "./suggestCategory.js";
import setOrdering from "./setOrdering.js";
import resetOrdering from "./resetOrdering.js";
import { createTRPCRouter } from "../../trpc.js";

export const categoryRouter = createTRPCRouter({
  listByChat,
  create: createChatCategory,
  update: updateChatCategory,
  delete: deleteChatCategory,
  suggest: suggestCategory,
  setOrdering,
  resetOrdering,
});
```

### Part B — create: prepend-to-top when ordering exists

- [ ] **Step 2: Modify `createChatCategory.ts`**

In `packages/trpc/src/routers/category/createChatCategory.ts`, wrap the existing `db.chatCategory.create` call plus a new ordering insert in a single transaction. Find this block (around lines 57–78):

```ts
  let row;
  try {
    row = await db.chatCategory.create({
      data: {
        chatId: input.chatId,
        emoji: input.emoji,
        title: input.title,
        createdById,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A category with this title already exists in this chat",
      });
    }
    throw err;
  }
```

Replace it with:

```ts
  let row;
  try {
    row = await db.$transaction(async (tx) => {
      const created = await tx.chatCategory.create({
        data: {
          chatId: input.chatId,
          emoji: input.emoji,
          title: input.title,
          createdById,
        },
      });

      // If the chat has an existing custom order, prepend the new tile so it
      // appears at the top of the picker. Otherwise do nothing: default
      // ordering (base then custom-by-createdAt) already places the new tile
      // at the end — acceptable for chats that haven't customized.
      const orderingCount = await tx.chatCategoryOrdering.count({
        where: { chatId: input.chatId },
      });
      if (orderingCount > 0) {
        const agg = await tx.chatCategoryOrdering.aggregate({
          where: { chatId: input.chatId },
          _min: { sortOrder: true },
        });
        const nextSort = (agg._min.sortOrder ?? 0) - 1;
        await tx.chatCategoryOrdering.create({
          data: {
            chatId: input.chatId,
            categoryKey: `chat:${created.id}`,
            sortOrder: nextSort,
            hidden: false,
          },
        });
      }

      return created;
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A category with this title already exists in this chat",
      });
    }
    throw err;
  }
```

### Part C — delete: cascade ordering row in the same transaction

- [ ] **Step 3: Modify `deleteChatCategory.ts`**

In `packages/trpc/src/routers/category/deleteChatCategory.ts`, update the transaction block (around lines 21–28):

```ts
  const fullId = `chat:${row.id}`;
  await db.$transaction(async (tx) => {
    await tx.expense.updateMany({
      where: { chatId: row.chatId, categoryId: fullId },
      data: { categoryId: null },
    });
    await tx.chatCategoryOrdering.deleteMany({
      where: { chatId: row.chatId, categoryKey: fullId },
    });
    await tx.chatCategory.delete({ where: { id: row.id } });
  });
```

(One new line: the `tx.chatCategoryOrdering.deleteMany` before the `chatCategory.delete`.)

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @dko/trpc check-types
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/category/index.ts \
        packages/trpc/src/routers/category/createChatCategory.ts \
        packages/trpc/src/routers/category/deleteChatCategory.ts
git commit -m "feat(categories/trpc): wire setOrdering/resetOrdering; prepend + cascade"
```

---

## Task 7: Install dnd-kit in the web app

**Files:**
- Modify: `apps/web/package.json` (pnpm writes automatically)
- Modify: `pnpm-lock.yaml` (pnpm writes automatically)

- [ ] **Step 1: Install**

```bash
pnpm --filter web add @dnd-kit/core@^6 @dnd-kit/sortable@^8 @dnd-kit/utilities@^3
```

Expected: package.json gains the three deps; lockfile updates.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web check-types
```

Expected: web app still type-checks modulo the pre-existing `base`/`custom` breakage from Task 3. No new errors introduced by the install.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add @dnd-kit/core + sortable + utilities"
```

---

## Task 8: Extend `CategoryTile` with optional hide-toggle + custom dot

Adds optional props used by the new Organize page. Unaffected callers continue to work (all props are optional).

**Files:**
- Modify: `apps/web/src/components/features/Category/CategoryTile.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the full contents of `apps/web/src/components/features/Category/CategoryTile.tsx`:

```tsx
import clsx from "clsx";
import { Eye, EyeOff } from "lucide-react";

interface CategoryTileProps {
  emoji: string;
  title: string;
  selected?: boolean;
  onClick?: () => void;
  /** Small blue dot top-left signals a custom category. */
  showCustomDot?: boolean;
  /**
   * Eye/EyeOff toggle top-right. `undefined` = no toggle; `"visible"` = Eye
   * (tap to hide); `"hidden"` = EyeOff (tap to restore).
   */
  hideToggle?: "visible" | "hidden";
  onToggleHide?: () => void;
  /**
   * Dim + grayscale the tile (used when rendering a hidden tile on the
   * Organize page). Does not affect the picker.
   */
  dim?: boolean;
  /** dnd-kit `setNodeRef` + listeners/attributes when the tile is sortable. */
  sortableRef?: (node: HTMLElement | null) => void;
  sortableStyle?: React.CSSProperties;
  sortableListeners?: Record<string, unknown>;
  sortableAttributes?: Record<string, unknown>;
  /** Render state for dnd-kit. */
  isDragging?: boolean;
}

export default function CategoryTile({
  emoji,
  title,
  selected,
  onClick,
  showCustomDot,
  hideToggle,
  onToggleHide,
  dim,
  sortableRef,
  sortableStyle,
  sortableListeners,
  sortableAttributes,
  isDragging,
}: CategoryTileProps) {
  return (
    <div
      ref={sortableRef}
      style={{
        backgroundColor: "rgba(127, 127, 127, 0.28)",
        ...sortableStyle,
      }}
      className={clsx(
        "relative flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2",
        "text-[var(--tg-theme-text-color)]",
        selected && "ring-2 ring-[var(--tg-theme-button-color)]",
        dim && "opacity-50",
        isDragging && "z-10 scale-[1.08] shadow-[0_12px_28px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.3)]"
      )}
      {...(sortableAttributes ?? {})}
      {...(sortableListeners ?? {})}
    >
      {showCustomDot && (
        <span
          aria-hidden
          className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--tg-theme-button-color)]"
        />
      )}

      {hideToggle && (
        <button
          type="button"
          aria-label={hideToggle === "visible" ? "Hide category" : "Show category"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHide?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={clsx(
            "absolute -right-1.5 -top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-black/25 shadow-[0_1px_3px_rgba(0,0,0,0.5)]",
            hideToggle === "visible"
              ? "bg-[#3a3d42] text-[var(--tg-theme-text-color)]"
              : "bg-[var(--tg-theme-button-color)] text-white"
          )}
        >
          {hideToggle === "visible" ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
      )}

      <button
        type="button"
        onClick={onClick}
        className={clsx(
          "flex w-full flex-col items-center justify-center gap-1.5",
          // Reset button styles — the outer div owns the visual box.
          "bg-transparent p-0 text-inherit",
          !onClick && "pointer-events-none"
        )}
        style={{ outline: "none" }}
      >
        <span
          className={clsx(
            "flex h-10 items-center text-3xl leading-none",
            dim && "grayscale"
          )}
        >
          {emoji}
        </span>
        <span className="block w-full truncate px-1 text-center text-[13px] font-medium leading-tight">
          {title}
        </span>
      </button>
    </div>
  );
}
```

Note: the root element changes from `<button>` to `<div>` because sortable tiles need to host drag listeners on the container, and nesting a button inside a button is invalid HTML. The inner `<button>` handles the select click. The `pointer-events-none` when `!onClick` keeps the Organize page's tiles from showing button-hover states where no click handler is wired.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web check-types
```

Expected: the CategoryTile file itself passes. Downstream consumers (Picker, Organize page) still show pre-existing errors — those land in Tasks 10+.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Category/CategoryTile.tsx
git commit -m "feat(categories/web): CategoryTile supports eye toggle, custom dot, dnd-kit props"
```

---

## Task 9: Migrate `listByChat` consumers to the new `items` shape

Every client call to `trpc.category.listByChat` must read `data.items` instead of `data.base` / `data.custom`.

**Files:**
- Modify: `apps/web/src/components/features/Settings/ManageCategoriesPage.tsx:34-35`
- Modify: `apps/web/src/components/features/Settings/EditChatCategoryPage.tsx:38`
- Modify: `apps/web/src/components/features/Settings/CategoriesSection.tsx:14-21`
- Modify: `apps/web/src/components/features/Expense/CategoryFormStep.tsx:38-57`

- [ ] **Step 1: `ManageCategoriesPage.tsx`**

Replace lines 34–35:

```tsx
  const custom = data?.custom ?? [];
  const base = data?.base ?? [];
```

with:

```tsx
  const items = data?.items ?? [];
  const custom = items.filter((c) => c.kind === "custom");
  const base = items.filter((c) => c.kind === "base");
```

(The rest of the file already uses `custom` and `base`, so no further changes needed on this page.)

- [ ] **Step 2: `EditChatCategoryPage.tsx`**

Replace line 38:

```tsx
  const existing = data?.custom.find((c) => c.id === `chat:${categoryId}`);
```

with:

```tsx
  const existing = data?.items.find(
    (c) => c.kind === "custom" && c.id === `chat:${categoryId}`
  );
```

- [ ] **Step 3: `CategoriesSection.tsx`**

Replace lines 14–21:

```tsx
  const base = data?.base ?? [];
  const custom = data?.custom ?? [];
  const total = base.length + custom.length;

  // Emoji-only chips — render every category in a horizontal scroll strip
  // rather than slicing to 4 + "+N more". The chip is compact enough that
  // all categories fit in the single-line overflow-x area.
  const allCats = [...custom, ...base];
```

with:

```tsx
  const items = data?.items ?? [];
  const visible = items.filter((c) => !c.hidden);
  const base = visible.filter((c) => c.kind === "base");
  const custom = visible.filter((c) => c.kind === "custom");
  const total = base.length + custom.length;

  // Emoji-only chips — render every visible category in a horizontal scroll
  // strip in the saved picker order (customs aren't forced above bases any
  // more; if the user reorders, this row reflects their choice).
  const allCats = visible;
```

- [ ] **Step 4: `CategoryFormStep.tsx`**

Find the block at lines 38–57:

```tsx
    const chatRows: ChatCategoryRow[] = useMemo(
      () =>
        (cats?.custom ?? []).map((c) => ({
          id: c.id.replace(/^chat:/, ""),
          chatId: BigInt(chatId),
          emoji: c.emoji,
          title: c.title,
        })),
      [cats?.custom, chatId]
    );

    const resolved = useMemo(
      () => resolveCategory(categoryId, chatRows),
      [categoryId, chatRows]
    );

    const allCategories = useMemo(
      () => [...(cats?.base ?? []), ...(cats?.custom ?? [])],
      [cats]
    );
```

Replace with:

```tsx
    const items = cats?.items ?? [];

    const chatRows: ChatCategoryRow[] = useMemo(
      () =>
        items
          .filter((c) => c.kind === "custom")
          .map((c) => ({
            id: c.id.replace(/^chat:/, ""),
            chatId: BigInt(chatId),
            emoji: c.emoji,
            title: c.title,
          })),
      [items, chatId]
    );

    const resolved = useMemo(
      () => resolveCategory(categoryId, chatRows),
      [categoryId, chatRows]
    );

    const allCategories = useMemo(
      () => items.filter((c) => !c.hidden),
      [items]
    );
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter web check-types
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/features/Settings/ManageCategoriesPage.tsx \
        apps/web/src/components/features/Settings/EditChatCategoryPage.tsx \
        apps/web/src/components/features/Settings/CategoriesSection.tsx \
        apps/web/src/components/features/Expense/CategoryFormStep.tsx
git commit -m "refactor(categories/web): migrate listByChat consumers to items shape"
```

---

## Task 10: `CategoryPickerSheet` — unified flat grid + empty state

**Files:**
- Modify: `apps/web/src/components/features/Category/CategoryPickerSheet.tsx`

- [ ] **Step 1: Rewrite the picker**

Replace the full contents of `apps/web/src/components/features/Category/CategoryPickerSheet.tsx`:

```tsx
import { Modal } from "@telegram-apps/telegram-ui";
import { Plus } from "lucide-react";
import CategoryTile from "./CategoryTile";

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--tg-theme-subtitle-text-color)] opacity-80">
      {children}
    </div>
  );
}

interface PickerCategory {
  id: string;
  emoji: string;
  title: string;
  kind: "base" | "custom" | "none";
}

interface CategoryPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Unordered flat list (caller passes the already-filtered visible items in
   * the picker's chosen order). `kind` still used for styling (custom dot).
   */
  categories: PickerCategory[];
  selectedId?: string | null;
  onSelect: (c: PickerCategory) => void;
  onCreateCustom?: () => void;
  /** Render an "Uncategorized" tile at the top that emits id `"none"`. */
  includeNoneOption?: boolean;
  /** Called when the empty-state link is tapped. Optional; if absent, no link. */
  onOpenOrganize?: () => void;
}

export const UNCATEGORIZED_OPTION: PickerCategory = {
  id: "none",
  emoji: "📭",
  title: "Uncategorized",
  kind: "none",
};

export default function CategoryPickerSheet({
  open,
  onOpenChange,
  categories,
  selectedId,
  onSelect,
  onCreateCustom,
  includeNoneOption,
  onOpenOrganize,
}: CategoryPickerSheetProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={<Modal.Header>Pick a category</Modal.Header>}
    >
      <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4">
        {includeNoneOption && (
          <section>
            <SectionHeader>Uncategorized</SectionHeader>
            <div className="grid grid-cols-4 gap-2">
              <CategoryTile
                emoji={UNCATEGORIZED_OPTION.emoji}
                title={UNCATEGORIZED_OPTION.title}
                selected={selectedId === UNCATEGORIZED_OPTION.id}
                onClick={() => onSelect(UNCATEGORIZED_OPTION)}
              />
            </div>
          </section>
        )}

        {categories.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="text-[13px] text-[var(--tg-theme-subtitle-text-color)]">
              All categories are hidden.
            </div>
            {onOpenOrganize && (
              <button
                type="button"
                className="text-[13px] font-medium text-[var(--tg-theme-link-color)]"
                onClick={onOpenOrganize}
              >
                Open Organize categories
              </button>
            )}
          </div>
        ) : (
          <section>
            <div className="grid grid-cols-4 gap-2">
              {categories.map((c) => (
                <CategoryTile
                  key={c.id}
                  emoji={c.emoji}
                  title={c.title}
                  selected={selectedId === c.id}
                  showCustomDot={c.kind === "custom"}
                  onClick={() => onSelect(c)}
                />
              ))}
            </div>
          </section>
        )}

        {onCreateCustom && (
          <button
            type="button"
            onClick={onCreateCustom}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--tg-theme-section-bg-color)] py-3 text-sm font-medium"
          >
            <Plus size={16} /> Create custom category
          </button>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Update the picker's caller in `CategoryFormStep.tsx` to pass the new prop (if referenced)**

Open `apps/web/src/components/features/Expense/CategoryFormStep.tsx` and search for `<CategoryPickerSheet`. The props there currently pass `categories={allCategories}`. Verify `allCategories` is now the filtered `items` list from Task 9. No other changes required — the picker signature stays backwards compatible (`onOpenOrganize` is optional).

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web check-types
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Category/CategoryPickerSheet.tsx
git commit -m "feat(categories/web): unified flat grid picker with custom dot + empty state"
```

---

## Task 11: `OrganizeCategoriesPage` — scaffolding (layout, data load, local state)

**Files:**
- Create: `apps/web/src/components/features/Settings/OrganizeCategoriesPage.tsx`

This task stands up the page skeleton with no drag behavior yet. Task 12 adds dnd-kit. Task 13 adds the eye toggle. Task 14 adds TMA buttons.

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useMemo, useState } from "react";
import { backButton } from "@telegram-apps/sdk-react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/utils/trpc";
import CategoryTile from "@/components/features/Category/CategoryTile";

interface OrganizeItem {
  categoryKey: string;
  emoji: string;
  title: string;
  kind: "base" | "custom";
  sortOrder: number;
  hidden: boolean;
}

export default function OrganizeCategoriesPage({
  chatId,
}: {
  chatId: number;
}) {
  const navigate = useNavigate();
  const { data } = trpc.category.listByChat.useQuery({ chatId });

  const initial = useMemo<OrganizeItem[]>(() => {
    if (!data) return [];
    return data.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((it) => ({
        categoryKey: it.id,
        emoji: it.emoji,
        title: it.title,
        kind: it.kind,
        sortOrder: it.sortOrder,
        hidden: it.hidden,
      }));
  }, [data]);

  const [items, setItems] = useState<OrganizeItem[]>([]);
  useEffect(() => {
    setItems(initial);
  }, [initial]);

  const visible = items.filter((i) => !i.hidden);
  const hidden = items.filter((i) => i.hidden);

  useEffect(() => {
    backButton.mount();
    backButton.show();
    const off = backButton.onClick(() =>
      navigate({
        to: "/chat/$chatId/settings/categories",
        params: { chatId: String(chatId) },
      })
    );
    return () => {
      off();
      backButton.hide();
    };
  }, [chatId, navigate]);

  return (
    <main className="flex flex-col gap-4 px-3 pb-24">
      <p className="px-1 pt-2 text-[12px] leading-snug text-[var(--tg-theme-subtitle-text-color)]">
        Drag to reorder. Drag into the Hidden zone (or tap the eye icon) to
        hide. Shared with everyone in this group.
      </p>

      <section>
        <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tg-theme-subtitle-text-color)]">
          <span>Visible</span>
          <span>
            {visible.length} / {items.length}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 rounded-xl bg-[rgba(255,255,255,0.02)] p-1">
          {visible.map((it) => (
            <CategoryTile
              key={it.categoryKey}
              emoji={it.emoji}
              title={it.title}
              showCustomDot={it.kind === "custom"}
              hideToggle="visible"
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tg-theme-subtitle-text-color)]">
          <span>Hidden</span>
          <span>{hidden.length} hidden</span>
        </div>
        <div className="grid min-h-[92px] grid-cols-4 gap-2 rounded-xl border border-dashed border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.02)] p-1">
          {hidden.length === 0 ? (
            <div className="col-span-4 px-3 py-7 text-center text-[11px] italic text-[var(--tg-theme-subtitle-text-color)] opacity-70">
              Drag a tile here (or tap its eye) to hide it from the picker.
            </div>
          ) : (
            hidden.map((it) => (
              <CategoryTile
                key={it.categoryKey}
                emoji={it.emoji}
                title={it.title}
                showCustomDot={it.kind === "custom"}
                hideToggle="hidden"
                dim
              />
            ))
          )}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web check-types
```

Expected: no errors. (The component is not yet routed — that's Task 15.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Settings/OrganizeCategoriesPage.tsx
git commit -m "feat(categories/web): OrganizeCategoriesPage scaffolding (no DnD yet)"
```

---

## Task 12: `OrganizeCategoriesPage` — dnd-kit reorder + cross-zone moves

**Files:**
- Modify: `apps/web/src/components/features/Settings/OrganizeCategoriesPage.tsx`

- [ ] **Step 1: Wire DndContext + SortableContext + sortable tiles**

At the top of `OrganizeCategoriesPage.tsx`, add imports:

```tsx
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
```

Below the existing imports (outside the default export), add a tiny `SortableTile` wrapper so the drag plumbing stays colocated with the tile:

```tsx
function SortableTile({
  item,
  onToggleHide,
}: {
  item: OrganizeItem;
  onToggleHide: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.categoryKey });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <CategoryTile
      emoji={item.emoji}
      title={item.title}
      showCustomDot={item.kind === "custom"}
      hideToggle={item.hidden ? "hidden" : "visible"}
      dim={item.hidden}
      onToggleHide={onToggleHide}
      sortableRef={setNodeRef}
      sortableStyle={style}
      sortableListeners={listeners}
      sortableAttributes={attributes}
      isDragging={isDragging}
    />
  );
}
```

Inside the `OrganizeCategoriesPage` body, register sensors and the drag-end handler:

```tsx
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    if (active.id === over.id) return;

    setItems((prev) => {
      const activeIdx = prev.findIndex((p) => p.categoryKey === active.id);
      const overIdx = prev.findIndex((p) => p.categoryKey === over.id);
      if (activeIdx < 0 || overIdx < 0) return prev;

      const activeItem = prev[activeIdx]!;
      const overItem = prev[overIdx]!;

      // Cross-zone drag flips `hidden` to match the zone of the drop target.
      const shouldFlipHidden = activeItem.hidden !== overItem.hidden;

      let next = arrayMove(prev, activeIdx, overIdx);
      if (shouldFlipHidden) {
        next = next.map((it) =>
          it.categoryKey === active.id
            ? { ...it, hidden: overItem.hidden }
            : it
        );
      }
      // Re-number sortOrder so persisted values match visual order.
      return next.map((it, idx) => ({ ...it, sortOrder: idx }));
    });
  };
```

Replace the two grid `<div>` blocks so each zone renders inside its own `SortableContext`, wrapped by a single `DndContext`:

```tsx
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <section>
          <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tg-theme-subtitle-text-color)]">
            <span>Visible</span>
            <span>
              {visible.length} / {items.length}
            </span>
          </div>
          <SortableContext
            items={visible.map((v) => v.categoryKey)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-4 gap-2 rounded-xl bg-[rgba(255,255,255,0.02)] p-1">
              {visible.map((it) => (
                <SortableTile
                  key={it.categoryKey}
                  item={it}
                  onToggleHide={() => toggleHide(it.categoryKey)}
                />
              ))}
            </div>
          </SortableContext>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tg-theme-subtitle-text-color)]">
            <span>Hidden</span>
            <span>{hidden.length} hidden</span>
          </div>
          <SortableContext
            items={hidden.map((v) => v.categoryKey)}
            strategy={rectSortingStrategy}
          >
            <div className="grid min-h-[92px] grid-cols-4 gap-2 rounded-xl border border-dashed border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.02)] p-1">
              {hidden.length === 0 ? (
                <div className="col-span-4 px-3 py-7 text-center text-[11px] italic text-[var(--tg-theme-subtitle-text-color)] opacity-70">
                  Drag a tile here (or tap its eye) to hide it from the picker.
                </div>
              ) : (
                hidden.map((it) => (
                  <SortableTile
                    key={it.categoryKey}
                    item={it}
                    onToggleHide={() => toggleHide(it.categoryKey)}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </section>
      </DndContext>
```

Add the `toggleHide` stub (Task 13 fleshes it out; for now it just flips):

```tsx
  const toggleHide = (categoryKey: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.categoryKey === categoryKey ? { ...it, hidden: !it.hidden } : it
      )
    );
  };
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web check-types
```

Expected: no errors.

- [ ] **Step 3: Manual smoke**

```bash
pnpm dev
```

Open the app via the TMA dev harness (or the web tunnel), navigate to any chat → Settings → Manage categories → (no organize link yet — test via direct URL `/chat/<id>/settings/categories/organize` after Task 15, OR temporarily render the component from ManageCategoriesPage to smoke-test now). Verify that tiles drag-reorder within the Visible zone and can cross-drag into the Hidden zone. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Settings/OrganizeCategoriesPage.tsx
git commit -m "feat(categories/web): OrganizeCategoriesPage drag-reorder + cross-zone moves"
```

---

## Task 13: `OrganizeCategoriesPage` — eye toggle moves tiles between zones

The existing `toggleHide` in Task 12 just flips the `hidden` flag, which leaves the item at its current array index. This task makes the tile **animate to the end of the target zone** by re-numbering `sortOrder` and re-sorting the items array.

**Files:**
- Modify: `apps/web/src/components/features/Settings/OrganizeCategoriesPage.tsx`

- [ ] **Step 1: Improve `toggleHide`**

Replace the `toggleHide` stub with:

```tsx
  const toggleHide = (categoryKey: string) => {
    setItems((prev) => {
      const target = prev.find((p) => p.categoryKey === categoryKey);
      if (!target) return prev;
      const nextHidden = !target.hidden;

      // Remove the target; drop it at the end of its new zone so the user
      // sees it land somewhere predictable rather than staying in place
      // with only its badge changing.
      const rest = prev.filter((p) => p.categoryKey !== categoryKey);
      const sameZoneFirst: OrganizeItem[] = [];
      const sameZoneSecond: OrganizeItem[] = [];
      for (const it of rest) {
        if (it.hidden === nextHidden) sameZoneFirst.push(it);
        else sameZoneSecond.push(it);
      }

      const moved = { ...target, hidden: nextHidden };
      const zoneOrder = nextHidden
        ? [...sameZoneSecond, ...sameZoneFirst, moved] // visible then hidden (with moved at end of hidden)
        : [...sameZoneFirst, moved, ...sameZoneSecond]; // visible (with moved at end of visible) then hidden

      return zoneOrder.map((it, idx) => ({ ...it, sortOrder: idx }));
    });
  };
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web check-types
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Settings/OrganizeCategoriesPage.tsx
git commit -m "feat(categories/web): eye toggle moves tiles to end of target zone"
```

---

## Task 14: `OrganizeCategoriesPage` — TMA main (Save) + secondary (Reset) buttons

**Files:**
- Modify: `apps/web/src/components/features/Settings/OrganizeCategoriesPage.tsx`

- [ ] **Step 1: Add dirty detection + mutations**

Near the top of the component body (after `useState`), add:

```tsx
  const utils = trpc.useUtils();
  const setOrderingMut = trpc.category.setOrdering.useMutation({
    onSuccess: () => utils.category.listByChat.invalidate({ chatId }),
  });
  const resetOrderingMut = trpc.category.resetOrdering.useMutation({
    onSuccess: () => utils.category.listByChat.invalidate({ chatId }),
  });

  const isDirty = useMemo(() => {
    if (initial.length !== items.length) return true;
    for (let i = 0; i < initial.length; i++) {
      const a = initial[i]!;
      const b = items[i]!;
      if (
        a.categoryKey !== b.categoryKey ||
        a.sortOrder !== b.sortOrder ||
        a.hidden !== b.hidden
      ) {
        return true;
      }
    }
    return false;
  }, [initial, items]);

  const onSave = () => {
    setOrderingMut.mutate(
      {
        chatId,
        items: items.map((it) => ({
          categoryKey: it.categoryKey,
          sortOrder: it.sortOrder,
          hidden: it.hidden,
        })),
      },
      {
        onSuccess: () =>
          navigate({
            to: "/chat/$chatId/settings/categories",
            params: { chatId: String(chatId) },
          }),
      }
    );
  };

  const onReset = () => {
    if (
      !window.confirm(
        "Reset to defaults? Custom order and hidden tiles will be cleared."
      )
    )
      return;
    resetOrderingMut.mutate(
      { chatId },
      {
        onSuccess: () =>
          navigate({
            to: "/chat/$chatId/settings/categories",
            params: { chatId: String(chatId) },
          }),
      }
    );
  };
```

Add these imports at the top:

```tsx
import { mainButton, secondaryButton } from "@telegram-apps/sdk-react";
import { useRef } from "react";
```

- [ ] **Step 2: Register TMA buttons with the mount-once-ref pattern**

Inside the component body, add:

```tsx
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  // Main button: mount once, dispatch via ref
  useEffect(() => {
    mainButton.mount();
    mainButton.setParams({ text: "Save", isVisible: true });
    const off = mainButton.onClick(() => onSaveRef.current());
    return () => {
      off();
      mainButton.setParams({
        isVisible: false,
        isEnabled: true,
        isLoaderVisible: false,
      });
    };
  }, []);

  // Main button params: toggle enabled/loader based on state
  useEffect(() => {
    mainButton.setParams({
      isEnabled: isDirty && !setOrderingMut.isPending,
      isLoaderVisible: setOrderingMut.isPending,
    });
  }, [isDirty, setOrderingMut.isPending]);

  // Secondary button: register once, dispatch via ref
  useEffect(() => {
    secondaryButton.mount();
    secondaryButton.setParams({
      text: "Reset to defaults",
      isVisible: true,
      backgroundColor: "#E53935",
      textColor: "#FFFFFF",
    });
    const off = secondaryButton.onClick(() => onResetRef.current());
    return () => {
      off();
      secondaryButton.setParams({
        isVisible: false,
        isEnabled: true,
        isLoaderVisible: false,
        backgroundColor: undefined,
        textColor: undefined,
      });
    };
  }, []);

  // Secondary button params: enabled/loader for reset mutation
  useEffect(() => {
    secondaryButton.setParams({
      isEnabled:
        !resetOrderingMut.isPending &&
        !setOrderingMut.isPending &&
        data?.hasCustomOrder === true,
      isLoaderVisible: resetOrderingMut.isPending,
    });
  }, [
    resetOrderingMut.isPending,
    setOrderingMut.isPending,
    data?.hasCustomOrder,
  ]);
```

- [ ] **Step 3: Show the empty-visible warning line (above the grids)**

Just below the help text and above the Visible section, add:

```tsx
      {visible.length === 0 && (
        <p className="rounded-lg border border-[rgba(232,148,60,0.3)] bg-[rgba(232,148,60,0.08)] px-3 py-2 text-[12px] leading-snug text-[var(--tg-theme-text-color)]">
          All tiles are hidden — the picker will be empty.
        </p>
      )}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter web check-types
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Settings/OrganizeCategoriesPage.tsx
git commit -m "feat(categories/web): Save/Reset via TMA main + secondary buttons"
```

---

## Task 15: New route file + route tree regen + Manage Categories entry point

**Files:**
- Create: `apps/web/src/routes/_tma/chat.$chatId_.settings.categories.organize.tsx`
- Modify: `apps/web/src/routeTree.gen.ts` (regenerated — commit as-is)
- Modify: `apps/web/src/components/features/Settings/ManageCategoriesPage.tsx`

- [ ] **Step 1: Create the route file**

Model after `apps/web/src/routes/_tma/chat.$chatId_.settings.categories.new.tsx`. Create `apps/web/src/routes/_tma/chat.$chatId_.settings.categories.organize.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import OrganizeCategoriesPage from "@/components/features/Settings/OrganizeCategoriesPage";

export const Route = createFileRoute(
  "/_tma/chat/$chatId_/settings/categories/organize"
)({
  component: function RouteComponent() {
    const { chatId } = Route.useParams();
    return <OrganizeCategoriesPage chatId={Number(chatId)} />;
  },
});
```

- [ ] **Step 2: Regenerate the route tree**

```bash
pnpm --filter web exec tsr generate
```

Expected: `apps/web/src/routeTree.gen.ts` updates with the new organize route. Inspect the diff — it should only add route-tree entries, nothing else.

- [ ] **Step 3: Add the "Customize order" entry to ManageCategoriesPage**

Open `apps/web/src/components/features/Settings/ManageCategoriesPage.tsx`. Add `ArrowUpDown` to the lucide import:

```tsx
import { ChevronRight, Plus, ArrowUpDown } from "lucide-react";
```

Inside the `<Section header="CUSTOM">` block, **immediately before** the existing `<ButtonCell>` for "Create custom category", add:

```tsx
        <ButtonCell
          onClick={() => {
            navigate({
              to: "/chat/$chatId/settings/categories/organize",
              params: { chatId: String(chatId) },
            });
            hapticFeedback.notificationOccurred("success");
          }}
          before={<ArrowUpDown />}
          style={{ color: tButtonColor }}
        >
          Customize order
        </ButtonCell>
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter web check-types
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/_tma/chat.$chatId_.settings.categories.organize.tsx \
        apps/web/src/routeTree.gen.ts \
        apps/web/src/components/features/Settings/ManageCategoriesPage.tsx
git commit -m "feat(categories/web): add /categories/organize route + entry point"
```

---

## Task 16: Add UAT Flow 10 to the UAT doc

**Files:**
- Modify: `docs/superpowers/specs/2026-04-20-expense-categories-uat.md`

- [ ] **Step 1: Append Flow 10 to the UAT doc**

Open `docs/superpowers/specs/2026-04-20-expense-categories-uat.md`. Append the following section at the end of the file:

```markdown
## Flow 10 — Reorder + hide categories (v2)

Tests the Organize Categories page and its effects on the picker.

- [ ] **10.1** Navigate Chat → Settings → Manage categories → Customize order. Organize page renders with every base + custom tile in the Visible zone in default order. Hidden zone shows the empty-state helper text.
- [ ] **10.2** Drag "Food" (or any base tile) to the first position. Save. Open Add Expense → Pick a category. "Food" now appears first; custom/base distinction no longer renders as separate sections.
- [ ] **10.3** Re-enter Organize. Tap the eye icon on "Entertainment". Tile animates into the Hidden zone. Save. Open the picker — Entertainment is no longer present.
- [ ] **10.4** Re-enter Organize. Entertainment is in the Hidden zone with the eye-off icon. Tap its eye-off. It returns to the end of Visible. Save. Picker shows it again, at the end.
- [ ] **10.5** Reset to defaults via the TMA secondary button. Confirmation dialog. Accept. Picker order reverts to original base-then-custom default.
- [ ] **10.6** After 10.5, create a new custom category ("Bali Trip"). It appears at the end of the picker (chat has no ordering rows).
- [ ] **10.7** Reorder once so ordering rows exist. Create another custom category. It appears at the **top** of the picker (prepend-when-ordered).
- [ ] **10.8** Hide every tile. Save. Open the picker — it shows the empty-state message with a link back to Organize. Tap the link; Organize reopens. Restore one tile. Save. Picker renders that single tile.
- [ ] **10.9** On the Organize page, make changes and tap the TMA back button. Discard-changes prompt appears. Accept → returns to Manage categories with the list unchanged. Decline → stay on Organize with the draft intact.
- [ ] **10.10** (Regression) Open Add Expense, pick a custom category, save. Revisit Manage categories → tap the custom category. Edit form loads with the correct emoji/title — confirms that Task 9's `items`-shape migration didn't break edit navigation.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-20-expense-categories-uat.md
git commit -m "docs(categories): add Flow 10 UAT for reorder + hide"
```

---

## Task 17: Back-button dirty guard

**Files:**
- Modify: `apps/web/src/components/features/Settings/OrganizeCategoriesPage.tsx`

- [ ] **Step 1: Guard the back button**

Replace the existing `backButton` effect (which currently navigates unconditionally) with one that checks `isDirty` via a ref:

```tsx
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    backButton.mount();
    backButton.show();
    const off = backButton.onClick(() => {
      if (isDirtyRef.current && !window.confirm("Discard changes?")) return;
      navigate({
        to: "/chat/$chatId/settings/categories",
        params: { chatId: String(chatId) },
      });
    });
    return () => {
      off();
      backButton.hide();
    };
  }, [chatId, navigate]);
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web check-types
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Settings/OrganizeCategoriesPage.tsx
git commit -m "feat(categories/web): dirty-state guard on back button"
```

---

## Task 18: Final verification + PR

- [ ] **Step 1: Full monorepo typecheck**

```bash
pnpm turbo run check-types
```

Expected: all 14 packages pass.

- [ ] **Step 2: Full monorepo lint**

```bash
pnpm turbo run lint
```

Expected: 0 errors.

- [ ] **Step 3: Run category unit tests**

```bash
pnpm --filter @repo/categories test
```

Expected: all tests pass (5 from Task 2).

- [ ] **Step 4: Manual UAT (Flow 10)**

Start the dev stack:

```bash
pnpm dev
```

Walk through every step in Flow 10 of `docs/superpowers/specs/2026-04-20-expense-categories-uat.md`. Any failures produce a fixup commit before PR.

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/categories-reorder
gh pr create --title "Reorderable categories (v2 picker + Organize page)" --body "$(cat <<'EOF'
## Summary
- New `ChatCategoryOrdering` table with sparse semantics: zero rows = default order, preserving today's behavior for untouched chats.
- Picker becomes a unified flat grid (drops Standard/Custom section headers); Uncategorized section preserved for filter usage.
- New Organize page at `/chat/$chatId/settings/categories/organize` with dnd-kit reorder, Eye/EyeOff hide toggles, TMA main-button Save and TMA secondary-button Reset to defaults.
- New custom categories prepend to the top of the picker when a custom order exists; fall through to createdAt-append when there is no saved order.

## Test plan
- [ ] Flow 10 UAT in `docs/superpowers/specs/2026-04-20-expense-categories-uat.md`
- [ ] Regression: Flow 1/2/4 of the existing UAT doc (picker, edit expense, manage categories) still pass.
EOF
)"
```

- [ ] **Step 6: Enable auto-merge**

```bash
gh pr merge --auto --squash --delete-branch
```

---

## Self-Review Notes

Cross-checked plan against the spec at `docs/superpowers/specs/2026-04-21-reorderable-categories-design.md`:

- DB model → Task 1 ✓
- `listByChat` resolution (default path, ordered path, hidden filter, hasCustomOrder) → Task 3 ✓
- `setOrdering` replace-all transaction + key validation → Task 4 ✓
- `resetOrdering` DELETE → Task 5 ✓
- `createChatCategory` prepend-when-ordered → Task 6 Part B ✓
- `deleteChatCategory` cascade → Task 6 Part C ✓
- Wire new endpoints → Task 6 Part A ✓
- dnd-kit dependency → Task 7 ✓
- CategoryTile extensions (Eye/EyeOff, custom dot, dragging) → Task 8 ✓
- Migrate all listByChat consumers → Task 9 ✓
- CategoryPickerSheet unified flat grid + empty state → Task 10 ✓
- Organize page — scaffolding → Task 11 ✓
- Organize page — dnd-kit + cross-zone moves → Task 12 ✓
- Organize page — eye-toggle animation → Task 13 ✓
- Organize page — TMA buttons + mutations → Task 14 ✓
- Route + entry point → Task 15 ✓
- Back-button dirty guard → Task 17 ✓
- UAT doc → Task 16 ✓
- Final verification → Task 18 ✓

No spec requirements left unmapped. Type names (`OrganizeItem`, `PickerCategory`), helper names (`isBaseKey`, `isCustomKey`, `parseCustomKey`, `assertKnownKey`), and field names (`items`, `hasCustomOrder`, `categoryKey`, `sortOrder`, `hidden`) are consistent across tasks.
