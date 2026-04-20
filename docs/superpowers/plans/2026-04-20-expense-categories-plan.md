# Expense Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-expense categories (10 base + per-chat custom) with Gemini-backed auto-assign across web, bot, and CLI.

**Architecture:** New shared `@repo/categories` package owns base-category constants, id resolution, and the `generateObject`-based classifier. A new tRPC `category` router handles CRUD + suggestion; `expense` router accepts/returns `categoryId`. Web surfaces (picker sheet, manage pages, filter pills, onboarding) are built on `@telegram-apps/telegram-ui`. Bot imports the classifier directly for silent auto-assign; CLI displays categories and adds a `--category` filter flag.

**Tech Stack:** TypeScript / Turborepo / Prisma (Postgres) / tRPC v11 / React + Vite / `@telegram-apps/telegram-ui` / TanStack Router + Form / AI SDK v6 + `@ai-sdk/google` (`gemini-3.1-flash-lite-preview`) / Vitest / Playwright component tests.

**Spec:** [`docs/superpowers/specs/2026-04-20-expense-categories-design.md`](../specs/2026-04-20-expense-categories-design.md). Design references (handoff bundle, chat transcript, interactive prototype) live under `docs/superpowers/specs/2026-04-20-expense-categories-design/`.

**Branch:** `feat/categories` (already created; spec committed).

**Commit convention:** Conventional commits; scope `(categories)` or sub-scope like `(categories/web)` / `(categories/bot)`. Every task ends with a commit.

---

## Task summary

1. Scaffold `@repo/categories` package (deps, tsconfig, export stubs)
2. `BASE_CATEGORIES` constant + types
3. `resolveCategory` pure resolver
4. Classifier prompt + few-shot data
5. `classifyCategory` with AI SDK + Zod enum guard
6. Prisma migration + schema update
7. `category.listByChat` tRPC procedure
8. `category.create` tRPC procedure
9. `category.update` tRPC procedure
10. `category.delete` tRPC procedure (transactional null-out)
11. `category.suggest` tRPC procedure + in-process rate limiter
12. Thread `categoryId` through `expense.createExpense` / `updateExpense` / list queries
13. Wire `category` router into the root router
14. Web — `CategoryPill` + `CategoryTile` shared components
15. Web — `SparkleBadge` shared component
16. Web — `CategoryPickerSheet` component
17. Web — `CategoryFormStep` + AddExpensePage debounced suggest integration
18. Web — EditExpensePage category pre-populate + wiring
19. Web — `CategoriesSection` in ChatSettingsPage
20. Web — `ManageCategoriesPage` + route
21. Web — `EditChatCategoryPage` (create + edit + delete) + routes
22. Web — Extract `TransactionFiltersCell` + `TransactionFiltersModal` (pure refactor)
23. Web — Category pill in filter Cell (priority + 2-cap + `+N`)
24. Web — Category row inside filter Modal
25. Web — Render category emoji on expense rows + client-side category predicate
26. Web — Onboarding tooltip (per-chat localStorage)
27. Bot — silent auto-assign on expense create
28. CLI — display category + `--category` filter flag
29. CLI — CHANGELOG entry + version bump
30. Open PR

Each task is ordered so tests / type-checks pass after every commit.

---

## Task 1: Scaffold `@repo/categories` package

**Files:**
- Create: `packages/categories/package.json`
- Create: `packages/categories/tsconfig.json`
- Create: `packages/categories/src/index.ts`
- Modify: `pnpm-workspace.yaml` (no change expected — already globs `packages/*`; verify)
- Modify: root `package.json` (no change; turbo auto-discovers)

- [ ] **Step 1: Create `packages/categories/package.json`**

```json
{
  "name": "@repo/categories",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch --preserveWatchOutput",
    "check-types": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --max-warnings 0"
  },
  "dependencies": {
    "@repo/agent": "workspace:*",
    "ai": "^5.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/node": "^22.0.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.0"
  }
}
```

Note: confirm `ai` version from `packages/agent/package.json` (should already be installed). If the agent package uses a different major, align to that — the two packages must share one `ai` instance or `generateObject` types diverge.

- [ ] **Step 2: Create `packages/categories/tsconfig.json`**

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create empty barrel `packages/categories/src/index.ts`**

```ts
export {};
```

- [ ] **Step 4: Install + build**

Run: `pnpm install && pnpm --filter @repo/categories build`
Expected: no errors, `packages/categories/dist/index.js` exists.

- [ ] **Step 5: Commit**

```bash
git add packages/categories pnpm-lock.yaml
git commit -m "feat(categories): scaffold @repo/categories package"
```

---

## Task 2: `BASE_CATEGORIES` constant + types

**Files:**
- Create: `packages/categories/src/types.ts`
- Create: `packages/categories/src/base.ts`
- Create: `packages/categories/src/base.test.ts`
- Modify: `packages/categories/src/index.ts`

- [ ] **Step 1: Write types (`packages/categories/src/types.ts`)**

```ts
export type CategoryKind = "base" | "custom";

export interface BaseCategory {
  id: `base:${string}`;
  emoji: string;
  title: string;
  keywords: readonly string[];
}

export interface ChatCategoryRow {
  id: string;   // uuid as stored in ChatCategory.id (no prefix)
  emoji: string;
  title: string;
  chatId: bigint;
}

export interface ResolvedCategory {
  id: string;   // "base:<id>" or "chat:<uuid>"
  emoji: string;
  title: string;
  kind: CategoryKind;
}
```

- [ ] **Step 2: Write failing test (`packages/categories/src/base.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { BASE_CATEGORIES } from "./base.js";

describe("BASE_CATEGORIES", () => {
  it("has exactly 10 entries", () => {
    expect(BASE_CATEGORIES).toHaveLength(10);
  });

  it("every id is prefixed with 'base:'", () => {
    for (const c of BASE_CATEGORIES) {
      expect(c.id.startsWith("base:")).toBe(true);
    }
  });

  it("ids are unique", () => {
    const ids = BASE_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the required ten categories", () => {
    const ids = new Set(BASE_CATEGORIES.map((c) => c.id));
    for (const expected of [
      "base:food",
      "base:transport",
      "base:home",
      "base:groceries",
      "base:entertainment",
      "base:travel",
      "base:health",
      "base:shopping",
      "base:utilities",
      "base:other",
    ]) {
      expect(ids.has(expected)).toBe(true);
    }
  });

  it("has non-empty emoji and title for every entry", () => {
    for (const c of BASE_CATEGORIES) {
      expect(c.emoji.length).toBeGreaterThan(0);
      expect(c.title.length).toBeGreaterThan(0);
    }
  });

  it("has non-empty keywords for every entry", () => {
    for (const c of BASE_CATEGORIES) {
      expect(c.keywords.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @repo/categories test`
Expected: FAIL — `base.js` not found.

- [ ] **Step 4: Implement `packages/categories/src/base.ts`**

```ts
import type { BaseCategory } from "./types.js";

export const BASE_CATEGORIES: readonly BaseCategory[] = [
  {
    id: "base:food",
    emoji: "🍜",
    title: "Food",
    keywords: [
      "lunch", "dinner", "breakfast", "brunch", "cafe", "coffee",
      "restaurant", "takeaway", "biryani", "pizza", "sushi", "ramen",
      "burger", "snack", "bar", "drinks",
    ],
  },
  {
    id: "base:transport",
    emoji: "🚕",
    title: "Transport",
    keywords: [
      "grab", "uber", "taxi", "cab", "bus", "mrt", "metro",
      "train", "subway", "parking", "toll", "petrol", "gas",
    ],
  },
  {
    id: "base:home",
    emoji: "🏠",
    title: "Home",
    keywords: [
      "rent", "mortgage", "furniture", "ikea", "repairs", "cleaning",
      "maid", "gardening",
    ],
  },
  {
    id: "base:groceries",
    emoji: "🛒",
    title: "Groceries",
    keywords: [
      "ntuc", "fairprice", "coldstorage", "cold storage", "market",
      "supermarket", "groceries", "produce", "fruit", "vegetables",
    ],
  },
  {
    id: "base:entertainment",
    emoji: "🎉",
    title: "Entertainment",
    keywords: [
      "movie", "cinema", "concert", "netflix", "spotify", "ktv",
      "club", "tickets", "show", "game",
    ],
  },
  {
    id: "base:travel",
    emoji: "✈️",
    title: "Travel",
    keywords: [
      "flight", "airbnb", "hotel", "hostel", "booking", "trip",
      "vacation", "bali", "japan", "thailand",
    ],
  },
  {
    id: "base:health",
    emoji: "💊",
    title: "Health",
    keywords: [
      "doctor", "clinic", "hospital", "pharmacy", "medicine", "gym",
      "massage", "dentist",
    ],
  },
  {
    id: "base:shopping",
    emoji: "🛍️",
    title: "Shopping",
    keywords: [
      "clothes", "shoes", "electronics", "lazada", "shopee", "amazon",
      "gift", "gifts",
    ],
  },
  {
    id: "base:utilities",
    emoji: "💡",
    title: "Utilities",
    keywords: [
      "electricity", "water", "internet", "wifi", "phone bill",
      "mobile", "starhub", "singtel", "m1",
    ],
  },
  {
    id: "base:other",
    emoji: "📦",
    title: "Other",
    keywords: ["misc", "other", "general"],
  },
] as const;
```

- [ ] **Step 5: Re-export from barrel**

Update `packages/categories/src/index.ts`:

```ts
export * from "./types.js";
export { BASE_CATEGORIES } from "./base.js";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @repo/categories test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/categories/src
git commit -m "feat(categories): add BASE_CATEGORIES constant and types"
```

---

## Task 3: `resolveCategory` pure resolver

**Files:**
- Create: `packages/categories/src/resolve.ts`
- Create: `packages/categories/src/resolve.test.ts`
- Modify: `packages/categories/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/categories/src/resolve.test.ts
import { describe, expect, it } from "vitest";
import { resolveCategory } from "./resolve.js";
import type { ChatCategoryRow } from "./types.js";

const rows: ChatCategoryRow[] = [
  { id: "11111111-1111-1111-1111-111111111111", chatId: 1n, emoji: "🏖️", title: "Bali trip" },
];

describe("resolveCategory", () => {
  it("returns null for null id", () => {
    expect(resolveCategory(null, rows)).toBeNull();
  });

  it("resolves a base id", () => {
    expect(resolveCategory("base:food", rows)).toMatchObject({
      id: "base:food",
      emoji: "🍜",
      title: "Food",
      kind: "base",
    });
  });

  it("resolves a custom id", () => {
    const r = resolveCategory("chat:11111111-1111-1111-1111-111111111111", rows);
    expect(r).toMatchObject({
      id: "chat:11111111-1111-1111-1111-111111111111",
      emoji: "🏖️",
      title: "Bali trip",
      kind: "custom",
    });
  });

  it("returns null for unknown base id", () => {
    expect(resolveCategory("base:nope", rows)).toBeNull();
  });

  it("returns null for unknown custom uuid", () => {
    expect(resolveCategory("chat:99999999-9999-9999-9999-999999999999", rows)).toBeNull();
  });

  it("returns null for malformed id", () => {
    expect(resolveCategory("", rows)).toBeNull();
    expect(resolveCategory("nope", rows)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo/categories test resolve`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/categories/src/resolve.ts`**

```ts
import { BASE_CATEGORIES } from "./base.js";
import type { ChatCategoryRow, ResolvedCategory } from "./types.js";

export function resolveCategory(
  id: string | null,
  chatCategories: ChatCategoryRow[],
): ResolvedCategory | null {
  if (!id) return null;

  if (id.startsWith("base:")) {
    const base = BASE_CATEGORIES.find((c) => c.id === id);
    if (!base) return null;
    return { id: base.id, emoji: base.emoji, title: base.title, kind: "base" };
  }

  if (id.startsWith("chat:")) {
    const uuid = id.slice("chat:".length);
    const row = chatCategories.find((c) => c.id === uuid);
    if (!row) return null;
    return { id, emoji: row.emoji, title: row.title, kind: "custom" };
  }

  return null;
}
```

- [ ] **Step 4: Re-export from barrel**

```ts
// packages/categories/src/index.ts
export * from "./types.js";
export { BASE_CATEGORIES } from "./base.js";
export { resolveCategory } from "./resolve.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @repo/categories test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/categories/src
git commit -m "feat(categories): add resolveCategory"
```

---

## Task 4: Classifier prompt + few-shot data

**Files:**
- Create: `packages/categories/src/prompt.ts`
- Create: `packages/categories/src/prompt.test.ts`
- Modify: `packages/categories/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/categories/src/prompt.test.ts
import { describe, expect, it } from "vitest";
import { buildClassifierPrompt, FEW_SHOTS } from "./prompt.js";
import { BASE_CATEGORIES } from "./base.js";

describe("buildClassifierPrompt", () => {
  it("lists every allowed category by id, emoji, and title", () => {
    const prompt = buildClassifierPrompt({
      description: "lunch with Dan",
      allowed: BASE_CATEGORIES.map((c) => ({
        id: c.id, emoji: c.emoji, title: c.title, keywords: c.keywords,
      })),
    });

    for (const c of BASE_CATEGORIES) {
      expect(prompt).toContain(c.id);
      expect(prompt).toContain(c.title);
    }
  });

  it("embeds the description verbatim", () => {
    const prompt = buildClassifierPrompt({
      description: "Airbnb Bali deposit",
      allowed: [],
    });
    expect(prompt).toContain("Airbnb Bali deposit");
  });

  it("instructs 'none' when no category fits", () => {
    const prompt = buildClassifierPrompt({ description: "x", allowed: [] });
    expect(prompt.toLowerCase()).toContain("none");
  });

  it("exposes at least 5 few-shot examples", () => {
    expect(FEW_SHOTS.length).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo/categories test prompt`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/categories/src/prompt.ts`**

```ts
export interface AllowedCategory {
  id: string;
  emoji: string;
  title: string;
  keywords?: readonly string[];
}

export interface FewShot {
  description: string;
  categoryId: string;
}

export const FEW_SHOTS: FewShot[] = [
  { description: "biryani lunch", categoryId: "base:food" },
  { description: "grab to airport", categoryId: "base:transport" },
  { description: "netflix subscription", categoryId: "base:entertainment" },
  { description: "airbnb bali deposit", categoryId: "base:travel" },
  { description: "electricity bill", categoryId: "base:utilities" },
  { description: "ntuc groceries", categoryId: "base:groceries" },
  { description: "random cash", categoryId: "none" },
];

export function buildClassifierPrompt(args: {
  description: string;
  allowed: AllowedCategory[];
}): string {
  const catalog = args.allowed
    .map((c) => {
      const kw = c.keywords?.length
        ? ` — keywords: ${c.keywords.slice(0, 10).join(", ")}`
        : "";
      return `- ${c.id} ${c.emoji} ${c.title}${kw}`;
    })
    .join("\n");

  const shots = FEW_SHOTS.map(
    (s) => `description: ${JSON.stringify(s.description)} → ${s.categoryId}`,
  ).join("\n");

  return [
    "You classify a short expense description into exactly one category id from the allowed list, or return \"none\" if no category fits.",
    "",
    "Allowed categories:",
    catalog,
    "",
    "Rules:",
    "- Return an id from the allowed list or \"none\".",
    "- Prefer custom categories (id starting with chat:) over base ones when the description matches a custom title or theme.",
    "- Return a confidence between 0 and 1. If confidence < 0.4, return \"none\".",
    "",
    "Examples:",
    shots,
    "",
    `Description: ${JSON.stringify(args.description)}`,
  ].join("\n");
}
```

- [ ] **Step 4: Re-export from barrel**

```ts
// append to packages/categories/src/index.ts
export { buildClassifierPrompt, FEW_SHOTS } from "./prompt.js";
export type { AllowedCategory, FewShot } from "./prompt.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @repo/categories test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/categories/src
git commit -m "feat(categories): add classifier prompt builder"
```

---

## Task 5: `classifyCategory` with AI SDK + Zod enum guard

**Files:**
- Create: `packages/categories/src/classify.ts`
- Create: `packages/categories/src/classify.test.ts`
- Modify: `packages/categories/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/categories/src/classify.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock @repo/agent before importing classify.
vi.mock("@repo/agent", () => ({
  getAgentModel: vi.fn(() => "mock-model"),
}));

// Mock the ai package so we don't hit a real model.
const generateObjectMock = vi.fn();
vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

import { classifyCategory } from "./classify.js";

describe("classifyCategory", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("returns the categoryId and confidence from the model", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { categoryId: "base:food", confidence: 0.9 },
    });

    const result = await classifyCategory({
      description: "biryani",
      chatCategories: [],
    });

    expect(result).toEqual({ categoryId: "base:food", confidence: 0.9 });
  });

  it("returns null when model returns 'none'", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { categoryId: "none", confidence: 0.1 },
    });

    const result = await classifyCategory({
      description: "whatever",
      chatCategories: [],
    });

    expect(result).toBeNull();
  });

  it("returns null when confidence is below 0.4", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { categoryId: "base:food", confidence: 0.2 },
    });

    const result = await classifyCategory({
      description: "biryani",
      chatCategories: [],
    });

    expect(result).toBeNull();
  });

  it("returns null when the LLM call throws", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("boom"));

    const result = await classifyCategory({
      description: "x",
      chatCategories: [],
    });

    expect(result).toBeNull();
  });

  it("returns null on abort", async () => {
    const controller = new AbortController();
    generateObjectMock.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(Object.assign(new Error("abort"), { name: "AbortError" })), 10);
        }),
    );

    controller.abort();
    const result = await classifyCategory({
      description: "x",
      chatCategories: [],
      signal: controller.signal,
    });

    expect(result).toBeNull();
  });

  it("includes custom categories as allowed ids in the call", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { categoryId: "chat:abc", confidence: 0.95 },
    });

    const result = await classifyCategory({
      description: "bali trip",
      chatCategories: [
        { id: "abc", chatId: 1n, emoji: "🏖️", title: "Bali trip" },
      ],
    });

    expect(result).toEqual({ categoryId: "chat:abc", confidence: 0.95 });
    const call = generateObjectMock.mock.calls[0][0];
    expect(JSON.stringify(call.schema)).toContain("chat:abc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo/categories test classify`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/categories/src/classify.ts`**

```ts
import { z } from "zod";
import { generateObject } from "ai";
import { getAgentModel } from "@repo/agent";
import { BASE_CATEGORIES } from "./base.js";
import { buildClassifierPrompt } from "./prompt.js";
import type { ChatCategoryRow } from "./types.js";

const CLASSIFY_TIMEOUT_MS = 3000;
const CONFIDENCE_THRESHOLD = 0.4;

export async function classifyCategory(args: {
  description: string;
  chatCategories: ChatCategoryRow[];
  signal?: AbortSignal;
}): Promise<{ categoryId: string; confidence: number } | null> {
  if (args.signal?.aborted) return null;
  if (!args.description.trim()) return null;

  const customIds = args.chatCategories.map((c) => `chat:${c.id}` as const);
  const allowedIds = [...BASE_CATEGORIES.map((c) => c.id), ...customIds];

  const schema = z.object({
    categoryId: z.enum([...allowedIds, "none"] as [string, ...string[]]),
    confidence: z.number().min(0).max(1),
  });

  const prompt = buildClassifierPrompt({
    description: args.description,
    allowed: [
      ...BASE_CATEGORIES.map((c) => ({
        id: c.id, emoji: c.emoji, title: c.title, keywords: c.keywords,
      })),
      ...args.chatCategories.map((c) => ({
        id: `chat:${c.id}`, emoji: c.emoji, title: c.title,
      })),
    ],
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    args.signal?.addEventListener("abort", onAbort);

    try {
      const { object } = await generateObject({
        model: getAgentModel(),
        schema,
        prompt,
        abortSignal: controller.signal,
      });

      if (object.categoryId === "none") return null;
      if (object.confidence < CONFIDENCE_THRESHOLD) return null;
      return { categoryId: object.categoryId, confidence: object.confidence };
    } finally {
      clearTimeout(timeout);
      args.signal?.removeEventListener("abort", onAbort);
    }
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Re-export from barrel**

```ts
// append
export { classifyCategory } from "./classify.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @repo/categories test`
Expected: PASS.

- [ ] **Step 6: Build + type-check the workspace**

Run: `pnpm turbo run build check-types --filter=@repo/categories...`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/categories/src
git commit -m "feat(categories): add classifyCategory with AI SDK generateObject"
```

---

## Task 6: Prisma migration + schema update

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<TIMESTAMP>_add_categories/migration.sql`

- [ ] **Step 1: Edit `schema.prisma`**

Inside `model Chat`, append to the list of relations:

```prisma
  chatCategories             ChatCategory[]
```

Inside `model Expense`, add before the `@@index` block:

```prisma
  categoryId         String?
```

Replace the existing index block with:

```prisma
  @@index([chatId])
  @@index([creatorId])
  @@index([payerId])
  @@index([chatId, categoryId])
```

Inside `model User`, append:

```prisma
  createdChatCategories  ChatCategory[]
```

Add a new model at the end of the file:

```prisma
model ChatCategory {
  id          String   @id @default(uuid())
  chat        Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  chatId      BigInt
  emoji       String
  title       String
  createdBy   User     @relation(fields: [createdById], references: [id])
  createdById BigInt
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([chatId, title])
  @@index([chatId])
}
```

- [ ] **Step 2: Create timestamped migration directory + file**

Run:

```bash
TS=$(date -u +%Y%m%d%H%M%S)
mkdir -p packages/database/prisma/migrations/${TS}_add_categories
```

Create `packages/database/prisma/migrations/${TS}_add_categories/migration.sql`:

```sql
-- AlterTable: add nullable categoryId to Expense
ALTER TABLE "Expense" ADD COLUMN "categoryId" TEXT;

-- CreateTable: per-chat custom categories
CREATE TABLE "ChatCategory" (
    "id" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "emoji" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdById" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatCategory_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "ChatCategory_chatId_title_key" ON "ChatCategory"("chatId", "title");
CREATE INDEX "ChatCategory_chatId_idx" ON "ChatCategory"("chatId");
CREATE INDEX "Expense_chatId_categoryId_idx" ON "Expense"("chatId", "categoryId");

-- Foreign keys
ALTER TABLE "ChatCategory" ADD CONSTRAINT "ChatCategory_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatCategory" ADD CONSTRAINT "ChatCategory_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 3: Run Prisma generate + migrate against local DB**

Run:

```bash
docker-compose up -d
pnpm turbo db:generate
pnpm --filter @dko/database exec prisma migrate deploy
```

Expected: migration applies cleanly; `prisma generate` emits updated client types.

- [ ] **Step 4: Type-check the repo**

Run: `pnpm turbo check-types`
Expected: PASS (no consumers reference the new fields yet, so only the Prisma client changes).

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/*_add_categories
git commit -m "feat(categories): prisma migration for categoryId + ChatCategory"
```

---

## Task 7: `category.listByChat` tRPC procedure

**Files:**
- Create: `packages/trpc/src/routers/category/listByChat.ts`
- Create: `packages/trpc/src/routers/category/index.ts`

- [ ] **Step 1: Create `listByChat.ts`**

```ts
import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { BASE_CATEGORIES, type ResolvedCategory } from "@repo/categories";

const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
});

const outputSchema = z.object({
  base: z.array(
    z.object({
      id: z.string(),
      emoji: z.string(),
      title: z.string(),
      kind: z.literal("base"),
    }),
  ),
  custom: z.array(
    z.object({
      id: z.string(),
      emoji: z.string(),
      title: z.string(),
      kind: z.literal("custom"),
    }),
  ),
});

export const listByChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
): Promise<z.infer<typeof outputSchema>> => {
  const rows = await db.chatCategory.findMany({
    where: { chatId: input.chatId },
    orderBy: { createdAt: "asc" },
  });

  const base: ResolvedCategory[] = BASE_CATEGORIES.map((c) => ({
    id: c.id,
    emoji: c.emoji,
    title: c.title,
    kind: "base",
  }));

  const custom: ResolvedCategory[] = rows.map((r) => ({
    id: `chat:${r.id}`,
    emoji: r.emoji,
    title: r.title,
    kind: "custom",
  }));

  return { base, custom };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return listByChatHandler(input, ctx.db);
  });
```

- [ ] **Step 2: Create `packages/trpc/src/routers/category/index.ts`**

```ts
import listByChat from "./listByChat.js";
import { createTRPCRouter } from "../../trpc.js";

export const categoryRouter = createTRPCRouter({
  listByChat,
});
```

- [ ] **Step 3: Add `@repo/categories` dependency to trpc package**

Edit `packages/trpc/package.json`, add under `dependencies`:

```json
"@repo/categories": "workspace:*",
```

Run: `pnpm install`
Expected: lockfile updates.

- [ ] **Step 4: Build + type-check**

Run: `pnpm turbo build check-types --filter=@dko/trpc...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc packages/trpc/package.json pnpm-lock.yaml
git commit -m "feat(categories): trpc category.listByChat"
```

---

## Task 8: `category.create` tRPC procedure

**Files:**
- Create: `packages/trpc/src/routers/category/createChatCategory.ts`
- Modify: `packages/trpc/src/routers/category/index.ts`

- [ ] **Step 1: Create `createChatCategory.ts`**

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
  emoji: z
    .string()
    .min(1, "Emoji required")
    .max(8, "Emoji must be a single grapheme"),
  title: z
    .string()
    .trim()
    .min(1, "Title required")
    .max(24, "Title too long"),
});

const outputSchema = z.object({
  id: z.string(),
  emoji: z.string(),
  title: z.string(),
  kind: z.literal("custom"),
});

export const createChatCategoryHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  createdById: bigint,
): Promise<z.infer<typeof outputSchema>> => {
  const existing = await db.chatCategory.findFirst({
    where: {
      chatId: input.chatId,
      title: { equals: input.title, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A category with this title already exists in this chat",
    });
  }

  const row = await db.chatCategory.create({
    data: {
      chatId: input.chatId,
      emoji: input.emoji,
      title: input.title,
      createdById,
    },
  });

  return {
    id: `chat:${row.id}`,
    emoji: row.emoji,
    title: row.title,
    kind: "custom",
  };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    const userId = ctx.session.user?.id;
    if (typeof userId === "undefined" || userId === null) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing user id" });
    }
    return createChatCategoryHandler(
      input,
      ctx.db,
      typeof userId === "bigint" ? userId : BigInt(userId),
    );
  });
```

- [ ] **Step 2: Register in router**

Update `packages/trpc/src/routers/category/index.ts`:

```ts
import listByChat from "./listByChat.js";
import createChatCategory from "./createChatCategory.js";
import { createTRPCRouter } from "../../trpc.js";

export const categoryRouter = createTRPCRouter({
  listByChat,
  create: createChatCategory,
});
```

- [ ] **Step 3: Build + type-check**

Run: `pnpm turbo build check-types --filter=@dko/trpc...`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/src/routers/category
git commit -m "feat(categories): trpc category.create"
```

---

## Task 9: `category.update` tRPC procedure

**Files:**
- Create: `packages/trpc/src/routers/category/updateChatCategory.ts`
- Modify: `packages/trpc/src/routers/category/index.ts`

- [ ] **Step 1: Create `updateChatCategory.ts`**

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  chatCategoryId: z.string().uuid(),
  emoji: z.string().min(1).max(8).optional(),
  title: z.string().trim().min(1).max(24).optional(),
});

const outputSchema = z.object({
  id: z.string(),
  emoji: z.string(),
  title: z.string(),
  kind: z.literal("custom"),
});

export const updateChatCategoryHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
): Promise<{ chatId: bigint } & z.infer<typeof outputSchema>> => {
  const row = await db.chatCategory.findUnique({
    where: { id: input.chatCategoryId },
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });

  if (input.title) {
    const clash = await db.chatCategory.findFirst({
      where: {
        chatId: row.chatId,
        id: { not: row.id },
        title: { equals: input.title, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (clash) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A category with this title already exists in this chat",
      });
    }
  }

  const updated = await db.chatCategory.update({
    where: { id: row.id },
    data: {
      emoji: input.emoji ?? undefined,
      title: input.title ?? undefined,
    },
  });

  return {
    chatId: updated.chatId,
    id: `chat:${updated.id}`,
    emoji: updated.emoji,
    title: updated.title,
    kind: "custom",
  };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    const { chatId, ...out } = await updateChatCategoryHandler(input, ctx.db);
    await assertChatAccess(ctx.session, ctx.db, chatId);
    return out;
  });
```

- [ ] **Step 2: Register in router**

Append to `packages/trpc/src/routers/category/index.ts`:

```ts
import updateChatCategory from "./updateChatCategory.js";

export const categoryRouter = createTRPCRouter({
  listByChat,
  create: createChatCategory,
  update: updateChatCategory,
});
```

- [ ] **Step 3: Build + type-check**

Run: `pnpm turbo build check-types --filter=@dko/trpc...`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/src/routers/category
git commit -m "feat(categories): trpc category.update"
```

---

## Task 10: `category.delete` tRPC procedure (transactional null-out)

**Files:**
- Create: `packages/trpc/src/routers/category/deleteChatCategory.ts`
- Modify: `packages/trpc/src/routers/category/index.ts`

- [ ] **Step 1: Create `deleteChatCategory.ts`**

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({ chatCategoryId: z.string().uuid() });
const outputSchema = z.object({ ok: z.literal(true) });

export const deleteChatCategoryHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
): Promise<{ chatId: bigint } & z.infer<typeof outputSchema>> => {
  const row = await db.chatCategory.findUnique({
    where: { id: input.chatCategoryId },
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });

  const fullId = `chat:${row.id}`;
  await db.$transaction(async (tx) => {
    await tx.expense.updateMany({
      where: { chatId: row.chatId, categoryId: fullId },
      data: { categoryId: null },
    });
    await tx.chatCategory.delete({ where: { id: row.id } });
  });

  return { chatId: row.chatId, ok: true };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    const { chatId, ...out } = await deleteChatCategoryHandler(input, ctx.db);
    await assertChatAccess(ctx.session, ctx.db, chatId);
    return out;
  });
```

- [ ] **Step 2: Register in router**

Update `packages/trpc/src/routers/category/index.ts`:

```ts
import listByChat from "./listByChat.js";
import createChatCategory from "./createChatCategory.js";
import updateChatCategory from "./updateChatCategory.js";
import deleteChatCategory from "./deleteChatCategory.js";
import { createTRPCRouter } from "../../trpc.js";

export const categoryRouter = createTRPCRouter({
  listByChat,
  create: createChatCategory,
  update: updateChatCategory,
  delete: deleteChatCategory,
});
```

- [ ] **Step 3: Build + type-check**

Run: `pnpm turbo build check-types --filter=@dko/trpc...`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/src/routers/category
git commit -m "feat(categories): trpc category.delete with expense null-out"
```

---

## Task 11: `category.suggest` tRPC procedure + rate limiter

**Files:**
- Create: `packages/trpc/src/utils/rateLimit.ts`
- Create: `packages/trpc/src/routers/category/suggestCategory.ts`
- Modify: `packages/trpc/src/routers/category/index.ts`

- [ ] **Step 1: Create a small in-process rate limiter**

```ts
// packages/trpc/src/utils/rateLimit.ts
interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

export function takeToken(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}
```

- [ ] **Step 2: Create `suggestCategory.ts`**

```ts
import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { classifyCategory } from "@repo/categories";
import { takeToken } from "../../utils/rateLimit.js";

const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
  description: z.string().trim().min(1).max(120),
});

const outputSchema = z.object({
  categoryId: z.string().nullable(),
  confidence: z.number().optional(),
});

export const suggestCategoryHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
): Promise<z.infer<typeof outputSchema>> => {
  const rows = await db.chatCategory.findMany({
    where: { chatId: input.chatId },
    select: { id: true, chatId: true, emoji: true, title: true },
  });
  const result = await classifyCategory({
    description: input.description,
    chatCategories: rows,
  });
  return result ? { categoryId: result.categoryId, confidence: result.confidence }
                : { categoryId: null };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    const userId = ctx.session.user?.id;
    const key = `suggest:${String(userId ?? "anon")}`;
    if (!takeToken(key, 20, 60_000)) {
      console.warn("category.suggest rate limit hit", { userId });
      return { categoryId: null };
    }
    return suggestCategoryHandler(input, ctx.db);
  });
```

- [ ] **Step 3: Register + build**

Update `packages/trpc/src/routers/category/index.ts`:

```ts
import suggestCategory from "./suggestCategory.js";

export const categoryRouter = createTRPCRouter({
  listByChat,
  create: createChatCategory,
  update: updateChatCategory,
  delete: deleteChatCategory,
  suggest: suggestCategory,
});
```

Run: `pnpm turbo build check-types --filter=@dko/trpc...`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/src
git commit -m "feat(categories): trpc category.suggest with rate limit"
```

---

## Task 12: Thread `categoryId` through expense router

**Files:**
- Modify: `packages/trpc/src/routers/expense/createExpense.ts`
- Modify: `packages/trpc/src/routers/expense/updateExpense.ts`
- Modify: `packages/trpc/src/routers/expense/getExpenseByChat.ts`
- Modify: `packages/trpc/src/routers/expense/getAllExpensesByChat.ts`
- Modify: `packages/trpc/src/routers/expense/getExpenseDetails.ts`

- [ ] **Step 1: Add `categoryId` to createExpense input + validation + persistence**

Edit `packages/trpc/src/routers/expense/createExpense.ts`:

In `inputSchema`, add before `sendNotification`:

```ts
  categoryId: z
    .string()
    .trim()
    .refine(
      (v) => v.startsWith("base:") || v.startsWith("chat:"),
      "categoryId must start with 'base:' or 'chat:'",
    )
    .nullable()
    .optional(),
```

In `outputSchema`, append:

```ts
  categoryId: z.string().nullable(),
```

In `createExpenseHandler`, before the `db.$transaction` call add a validation block:

```ts
    if (input.categoryId) {
      if (input.categoryId.startsWith("base:")) {
        const { BASE_CATEGORIES } = await import("@repo/categories");
        if (!BASE_CATEGORIES.find((c) => c.id === input.categoryId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unknown base category",
          });
        }
      } else {
        const uuid = input.categoryId.slice("chat:".length);
        const exists = await db.chatCategory.findFirst({
          where: { id: uuid, chatId: input.chatId },
          select: { id: true },
        });
        if (!exists) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unknown chat category",
          });
        }
      }
    }
```

In the `tx.expense.create({ data: { ... } })` block, add:

```ts
          categoryId: input.categoryId ?? null,
```

In the final `return { ...expense, ... }` block, append:

```ts
      categoryId: expense.categoryId ?? null,
```

Replace the static `@repo/categories` import-by-require above with a module-level import at the top of the file:

```ts
import { BASE_CATEGORIES } from "@repo/categories";
```

— then remove the inline `await import(...)` and use `BASE_CATEGORIES` directly.

- [ ] **Step 2: Mirror the same changes in `updateExpense.ts`**

- Add `categoryId` to the input schema (nullable optional).
- Perform the same base-id / chat-uuid validation before the update call.
- Pass `categoryId: input.categoryId ?? undefined` into the Prisma `update.data` block (so an explicit `null` clears it, `undefined` leaves unchanged).
- Add `categoryId` to the output.

- [ ] **Step 3: Return `categoryId` from list / details queries**

In `getExpenseByChat.ts`, `getAllExpensesByChat.ts`, `getExpenseDetails.ts`:

- Add `categoryId: expense.categoryId ?? null` to each mapped row.
- Add `categoryId: z.string().nullable()` to the output schema shape for an expense row.

- [ ] **Step 4: Build + type-check + run any existing trpc tests**

Run: `pnpm turbo build check-types --filter=@dko/trpc...`
Run: `pnpm --filter @dko/trpc test` (if tests exist)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/expense
git commit -m "feat(categories): thread categoryId through expense router"
```

---

## Task 13: Register `categoryRouter` in the root router

**Files:**
- Modify: `packages/trpc/src/root.ts`

- [ ] **Step 1: Import and register**

Edit `packages/trpc/src/root.ts`:

```ts
import { categoryRouter } from "./routers/category/index.js";

export const appRouter = createTRPCRouter({
  // ...existing routers...
  category: categoryRouter,
});
```

(Place next to the other router registrations; match the existing style.)

- [ ] **Step 2: Build + type-check**

Run: `pnpm turbo build check-types`
Expected: PASS across web, admin, lambda, bot.

- [ ] **Step 3: Commit**

```bash
git add packages/trpc/src/root.ts
git commit -m "feat(categories): register categoryRouter in root"
```

---

## Task 14: Web — `CategoryPill` + `CategoryTile` shared components

**Files:**
- Create: `apps/web/src/components/features/Category/CategoryPill.tsx`
- Create: `apps/web/src/components/features/Category/CategoryTile.tsx`
- Create: `apps/web/src/components/features/Category/index.ts`

- [ ] **Step 1: Create `CategoryPill.tsx`**

```tsx
import clsx from "clsx";
import { X as XIcon } from "lucide-react";

interface CategoryPillProps {
  emoji?: string;
  label: string;
  active?: boolean;
  dashed?: boolean;
  onClick?: () => void;
  onClear?: () => void;
}

export default function CategoryPill({
  emoji,
  label,
  active,
  dashed,
  onClick,
  onClear,
}: CategoryPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-xs font-medium select-none",
        active
          ? "bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)]"
          : dashed
            ? "border border-dashed border-[var(--tg-theme-hint-color)] text-[var(--tg-theme-hint-color)]"
            : "bg-[var(--tg-theme-section-bg-color)] text-[var(--tg-theme-text-color)]",
      )}
    >
      {emoji ? <span className="leading-none">{emoji}</span> : null}
      <span className="truncate max-w-[8rem]">{label}</span>
      {onClear ? (
        <span
          role="button"
          aria-label="Clear"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="ml-1 flex items-center justify-center rounded-full p-0.5 hover:bg-black/10"
        >
          <XIcon size={12} />
        </span>
      ) : null}
    </button>
  );
}
```

- [ ] **Step 2: Create `CategoryTile.tsx`**

```tsx
import clsx from "clsx";

interface CategoryTileProps {
  emoji: string;
  title: string;
  selected?: boolean;
  onClick?: () => void;
}

export default function CategoryTile({ emoji, title, selected, onClick }: CategoryTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex flex-col items-center justify-start gap-1 aspect-square w-full rounded-2xl p-2",
        "bg-[var(--tg-theme-section-bg-color)] text-[var(--tg-theme-text-color)]",
        selected && "ring-2 ring-[var(--tg-theme-button-color)]",
      )}
    >
      <span className="text-2xl leading-none h-8 flex items-center">{emoji}</span>
      <span className="text-xs line-clamp-2 leading-tight text-center">{title}</span>
    </button>
  );
}
```

- [ ] **Step 3: Create barrel `apps/web/src/components/features/Category/index.ts`**

```ts
export { default as CategoryPill } from "./CategoryPill";
export { default as CategoryTile } from "./CategoryTile";
```

- [ ] **Step 4: Build + type-check**

Run: `pnpm turbo check-types --filter=web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Category
git commit -m "feat(categories/web): CategoryPill + CategoryTile"
```

---

## Task 15: Web — `SparkleBadge` shared component

**Files:**
- Create: `apps/web/src/components/features/Category/SparkleBadge.tsx`
- Modify: `apps/web/src/components/features/Category/index.ts`

- [ ] **Step 1: Create `SparkleBadge.tsx`**

```tsx
import { Sparkles } from "lucide-react";

interface SparkleBadgeProps {
  label?: string;
}

export default function SparkleBadge({ label = "Auto" }: SparkleBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        background:
          "linear-gradient(90deg, rgba(167,139,250,0.18) 0%, rgba(236,72,153,0.18) 100%)",
        color: "rgb(139, 92, 246)",
      }}
    >
      <Sparkles size={12} />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Add to barrel**

Append to `apps/web/src/components/features/Category/index.ts`:

```ts
export { default as SparkleBadge } from "./SparkleBadge";
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Category
git commit -m "feat(categories/web): SparkleBadge"
```

---

## Task 16: Web — `CategoryPickerSheet`

**Files:**
- Create: `apps/web/src/components/features/Category/CategoryPickerSheet.tsx`
- Modify: `apps/web/src/components/features/Category/index.ts`

- [ ] **Step 1: Create the sheet**

```tsx
// apps/web/src/components/features/Category/CategoryPickerSheet.tsx
import { Modal, Caption } from "@telegram-apps/telegram-ui";
import { Plus } from "lucide-react";
import CategoryTile from "./CategoryTile";

interface PickerCategory {
  id: string;
  emoji: string;
  title: string;
  kind: "base" | "custom";
}

interface CategoryPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: PickerCategory[];
  selectedId?: string | null;
  onSelect: (c: PickerCategory) => void;
  onCreateCustom?: () => void;
}

export default function CategoryPickerSheet({
  open,
  onOpenChange,
  categories,
  selectedId,
  onSelect,
  onCreateCustom,
}: CategoryPickerSheetProps) {
  const custom = categories.filter((c) => c.kind === "custom");
  const base = categories.filter((c) => c.kind === "base");

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={<Modal.Header>Pick a category</Modal.Header>}
    >
      <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        {custom.length > 0 && (
          <div>
            <Caption level="1" weight="2">Custom</Caption>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {custom.map((c) => (
                <CategoryTile
                  key={c.id}
                  emoji={c.emoji}
                  title={c.title}
                  selected={selectedId === c.id}
                  onClick={() => onSelect(c)}
                />
              ))}
            </div>
          </div>
        )}

        <div>
          <Caption level="1" weight="2">Base</Caption>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {base.map((c) => (
              <CategoryTile
                key={c.id}
                emoji={c.emoji}
                title={c.title}
                selected={selectedId === c.id}
                onClick={() => onSelect(c)}
              />
            ))}
          </div>
        </div>

        {onCreateCustom && (
          <button
            type="button"
            onClick={onCreateCustom}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium rounded-2xl bg-[var(--tg-theme-section-bg-color)]"
          >
            <Plus size={16} /> Create custom category
          </button>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Add to barrel**

```ts
export { default as CategoryPickerSheet } from "./CategoryPickerSheet";
```

- [ ] **Step 3: Write a Playwright component test `CategoryPickerSheet.spec.tsx`**

Follow the same pattern as `AddExpenseButton.spec.tsx`. Minimum assertions:

```tsx
import { test, expect } from "@playwright/experimental-ct-react";
import CategoryPickerSheet from "./CategoryPickerSheet";

const categories = [
  { id: "base:food", emoji: "🍜", title: "Food", kind: "base" as const },
  { id: "chat:abc", emoji: "🏖️", title: "Bali", kind: "custom" as const },
];

test("renders base and custom sections and selects on click", async ({ mount }) => {
  let selected: { id: string } | null = null;
  const component = await mount(
    <CategoryPickerSheet
      open
      onOpenChange={() => {}}
      categories={categories}
      onSelect={(c) => { selected = c; }}
    />,
  );
  await expect(component.getByText("Custom")).toBeVisible();
  await expect(component.getByText("Base")).toBeVisible();
  await component.getByText("Bali").click();
  expect(selected?.id).toBe("chat:abc");
});

test("shows create-custom button when handler is provided", async ({ mount }) => {
  let createCalled = false;
  const component = await mount(
    <CategoryPickerSheet
      open
      onOpenChange={() => {}}
      categories={categories}
      onSelect={() => {}}
      onCreateCustom={() => { createCalled = true; }}
    />,
  );
  await component.getByText("Create custom category").click();
  expect(createCalled).toBe(true);
});
```

- [ ] **Step 4: Run component test**

Run: `pnpm --filter web test:ct`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Category
git commit -m "feat(categories/web): CategoryPickerSheet"
```

---

## Task 17: Web — `CategoryFormStep` + AddExpensePage integration

**Files:**
- Create: `apps/web/src/components/features/Expense/CategoryFormStep.tsx`
- Modify: `apps/web/src/components/features/Expense/AddExpenseForm.ts`
- Modify: `apps/web/src/components/features/Expense/AddExpensePage.tsx`

- [ ] **Step 1: Extend the form defaults + schema**

Edit `apps/web/src/components/features/Expense/AddExpenseForm.type.ts` (or `.ts` — match the file that currently exports `expenseFormSchema`). Add:

```ts
  categoryId: z.string().nullable(),
```

Edit `AddExpenseForm.ts`, extend `defaultValues` with `categoryId: null as string | null`.

- [ ] **Step 2: Create `CategoryFormStep.tsx`**

```tsx
// apps/web/src/components/features/Expense/CategoryFormStep.tsx
import { Cell } from "@telegram-apps/telegram-ui";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "@/hooks";
import { trpc } from "@/utils/trpc";
import { resolveCategory, type ChatCategoryRow } from "@repo/categories";
import CategoryPickerSheet from "@/components/features/Category/CategoryPickerSheet";
import SparkleBadge from "@/components/features/Category/SparkleBadge";

interface CategoryFormStepProps {
  chatId: number;
  description: string;
  value: string | null;
  onChange: (id: string | null) => void;
  onCreateCustom?: () => void;
  disableAutoAssign?: boolean;
}

export default function CategoryFormStep({
  chatId,
  description,
  value,
  onChange,
  onCreateCustom,
  disableAutoAssign,
}: CategoryFormStepProps) {
  const [open, setOpen] = useState(false);
  const [autoPicked, setAutoPicked] = useState(false);
  const userTouchedRef = useRef(false);

  const { data: cats } = trpc.category.listByChat.useQuery({ chatId });
  const chatRows: ChatCategoryRow[] = useMemo(
    () =>
      (cats?.custom ?? []).map((c) => ({
        id: c.id.replace(/^chat:/, ""),
        chatId: BigInt(chatId),
        emoji: c.emoji,
        title: c.title,
      })),
    [cats?.custom, chatId],
  );

  const resolved = useMemo(
    () => resolveCategory(value, chatRows),
    [value, chatRows],
  );

  const allCategories = useMemo(
    () => [...(cats?.base ?? []), ...(cats?.custom ?? [])],
    [cats],
  );

  const suggestMutation = trpc.category.suggest.useMutation();

  const runSuggest = useDebouncedCallback((text: string) => {
    if (disableAutoAssign) return;
    if (userTouchedRef.current) return;
    if (!text || text.trim().length < 3) return;
    suggestMutation.mutate(
      { chatId, description: text },
      {
        onSuccess: (res) => {
          if (userTouchedRef.current) return;
          if (!res.categoryId) return;
          onChange(res.categoryId);
          setAutoPicked(true);
        },
      },
    );
  }, 400);

  useEffect(() => {
    runSuggest(description);
  }, [description, runSuggest]);

  return (
    <>
      <Cell
        Component="button"
        onClick={() => setOpen(true)}
        before={<span className="text-xl">{resolved?.emoji ?? "🗂️"}</span>}
        after={
          <div className="flex items-center gap-2">
            {autoPicked && value ? <SparkleBadge /> : null}
            <ChevronRight size={16} />
          </div>
        }
      >
        {resolved?.title ?? "Pick a category"}
      </Cell>

      <CategoryPickerSheet
        open={open}
        onOpenChange={setOpen}
        categories={allCategories}
        selectedId={value}
        onSelect={(c) => {
          userTouchedRef.current = true;
          setAutoPicked(false);
          onChange(c.id);
          setOpen(false);
        }}
        onCreateCustom={onCreateCustom}
      />
    </>
  );
}
```

Note: `useDebouncedCallback` should already exist under `apps/web/src/hooks`. If not, create a trivial wrapper around a `setTimeout` in that module — do not add a new dep.

- [ ] **Step 3: Wire into `AddExpensePage.tsx`**

Add `CategoryFormStep` to the step list, and thread the form's `description` value as its input prop. Pass `categoryId` into `trpc.expense.createExpense.mutate` when the user saves.

- [ ] **Step 4: Type-check + run component tests**

Run: `pnpm turbo check-types --filter=web && pnpm --filter web test:ct`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Expense apps/web/src/hooks
git commit -m "feat(categories/web): category step on add-expense form"
```

---

## Task 18: Web — EditExpensePage wiring

**Files:**
- Modify: `apps/web/src/components/features/Expense/EditExpensePage.tsx`

- [ ] **Step 1: Pass existing `categoryId` into the form**

When pre-populating the form state from the fetched expense, include `categoryId: expense.categoryId ?? null`.

- [ ] **Step 2: Render `<CategoryFormStep disableAutoAssign />`** in the same position as the add flow.

The `disableAutoAssign` prop prevents the debounced suggest from firing on edit (auto is transient per spec).

- [ ] **Step 3: Pass `categoryId` into `updateExpense` mutation input.**

- [ ] **Step 4: Type-check**

Run: `pnpm turbo check-types --filter=web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Expense/EditExpensePage.tsx
git commit -m "feat(categories/web): category on edit expense"
```

---

## Task 19: Web — `CategoriesSection` in ChatSettingsPage

**Files:**
- Create: `apps/web/src/components/features/Settings/CategoriesSection.tsx`
- Modify: `apps/web/src/components/features/Settings/ChatSettingsPage.tsx`

- [ ] **Step 1: Create `CategoriesSection.tsx`**

```tsx
import { Cell, Section } from "@telegram-apps/telegram-ui";
import { Tag, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { trpc } from "@/utils/trpc";
import CategoryPill from "@/components/features/Category/CategoryPill";

export default function CategoriesSection({
  chatId,
  isPersonal,
}: {
  chatId: number;
  isPersonal: boolean;
}) {
  const { data } = trpc.category.listByChat.useQuery({ chatId });
  const base = data?.base ?? [];
  const custom = data?.custom ?? [];
  const total = base.length + custom.length;

  const preview = [...custom, ...base].slice(0, 4);
  const extra = Math.max(0, total - preview.length);

  return (
    <Section
      header="CATEGORIES"
      footer={
        isPersonal
          ? "Categories are private to this chat."
          : "Categories are shared by everyone in this group and help auto-assign recurring expenses."
      }
    >
      <Link to="/chat/$chatId_/settings/categories" params={{ chatId: String(chatId) }}>
        <Cell
          before={
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-blue-500/15 text-blue-500">
              <Tag size={16} />
            </span>
          }
          after={<ChevronRight size={16} />}
          description={`${custom.length} custom · ${total} total`}
        >
          Manage categories
        </Cell>
      </Link>

      <div className="flex flex-wrap gap-2 px-4 pb-3">
        {preview.map((c) => (
          <CategoryPill key={c.id} emoji={c.emoji} label={c.title} />
        ))}
        {extra > 0 ? <CategoryPill label={`+${extra} more`} dashed /> : null}
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Insert into `ChatSettingsPage.tsx`**

Place between the Base Currency section and the Notifications section in `ChatSettingsPage.tsx`:

```tsx
<CategoriesSection chatId={chatId} isPersonal={isPrivateChat} />
```

- [ ] **Step 3: Type-check**

Run: `pnpm turbo check-types --filter=web`
Expected: PASS (note the route `/chat/$chatId_/settings/categories` is declared in Task 20; this step may emit a router-type warning until then. If `pnpm turbo check-types` fails because of the missing route, skip the check-types command on this task and run it after Task 20).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Settings
git commit -m "feat(categories/web): CategoriesSection in chat settings"
```

---

## Task 20: Web — `ManageCategoriesPage` + route

**Files:**
- Create: `apps/web/src/routes/_tma/chat.$chatId_.settings.categories.tsx`
- Create: `apps/web/src/components/features/Settings/ManageCategoriesPage.tsx`

- [ ] **Step 1: Create the route file**

```tsx
// apps/web/src/routes/_tma/chat.$chatId_.settings.categories.tsx
import { createFileRoute } from "@tanstack/react-router";
import ManageCategoriesPage from "@/components/features/Settings/ManageCategoriesPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/categories")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <ManageCategoriesPage chatId={Number(chatId)} />;
}
```

- [ ] **Step 2: Create the page**

```tsx
// apps/web/src/components/features/Settings/ManageCategoriesPage.tsx
import { useEffect } from "react";
import { Cell, Section, Navigation } from "@telegram-apps/telegram-ui";
import { useNavigate, getRouteApi } from "@tanstack/react-router";
import { backButton, mainButton, useSignal } from "@telegram-apps/sdk-react";
import { trpc } from "@/utils/trpc";
import { ChevronRight } from "lucide-react";

const routeApi = getRouteApi("/_tma/chat/$chatId_/settings/categories");

export default function ManageCategoriesPage({ chatId }: { chatId: number }) {
  const navigate = routeApi.useNavigate();
  const globalNavigate = useNavigate();
  const { data } = trpc.category.listByChat.useQuery({ chatId });

  useEffect(() => {
    backButton.mount();
    backButton.show();
    const off = backButton.onClick(() => {
      globalNavigate({
        to: "/chat/$chatId_/settings",
        params: { chatId: String(chatId) },
        search: { prevTab: "transaction" },
      });
    });
    return () => { off(); backButton.hide(); };
  }, [chatId, globalNavigate]);

  useEffect(() => {
    mainButton.mount();
    mainButton.setParams({ text: "Create custom category", isVisible: true, isEnabled: true });
    const off = mainButton.onClick(() => {
      navigate({ to: "/chat/$chatId_/settings/categories/new", params: { chatId: String(chatId) } });
    });
    return () => { off(); mainButton.setParams({ isVisible: false }); };
  }, [chatId, navigate]);

  const custom = data?.custom ?? [];
  const base = data?.base ?? [];

  return (
    <div className="pb-24">
      <Section header="CUSTOM">
        {custom.length === 0 ? (
          <Cell description="Tap Create custom category below to add your first one.">
            No custom categories yet
          </Cell>
        ) : (
          custom.map((c) => (
            <Cell
              key={c.id}
              Component="button"
              before={<span className="text-xl">{c.emoji}</span>}
              after={<ChevronRight size={16} />}
              onClick={() =>
                navigate({
                  to: "/chat/$chatId_/settings/categories/$categoryId",
                  params: { chatId: String(chatId), categoryId: c.id.replace(/^chat:/, "") },
                })
              }
            >
              {c.title}
            </Cell>
          ))
        )}
      </Section>

      <Section header="BASE">
        {base.map((c) => (
          <Cell key={c.id} before={<span className="text-xl">{c.emoji}</span>}>
            {c.title}
          </Cell>
        ))}
      </Section>
    </div>
  );
}
```

- [ ] **Step 3: Regenerate route tree + type-check**

Run: `pnpm --filter web dev` briefly (to regen `routeTree.gen.ts`) or run `pnpm --filter web build`.
Run: `pnpm turbo check-types --filter=web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_tma/chat.\$chatId_.settings.categories.tsx apps/web/src/components/features/Settings/ManageCategoriesPage.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat(categories/web): manage categories page + route"
```

---

## Task 21: Web — `EditChatCategoryPage` (create + edit + delete) + routes

**Files:**
- Create: `apps/web/src/routes/_tma/chat.$chatId_.settings.categories.new.tsx`
- Create: `apps/web/src/routes/_tma/chat.$chatId_.settings.categories.$categoryId.tsx`
- Create: `apps/web/src/components/features/Settings/EditChatCategoryPage.tsx`

- [ ] **Step 1: Create the shared page**

```tsx
// apps/web/src/components/features/Settings/EditChatCategoryPage.tsx
import { useState, useEffect } from "react";
import { Input, Section, Button, Snackbar } from "@telegram-apps/telegram-ui";
import { useNavigate, getRouteApi } from "@tanstack/react-router";
import { backButton } from "@telegram-apps/sdk-react";
import { trpc } from "@/utils/trpc";
import ConfirmationModal from "@/components/ui/ConfirmationModal";

interface Props {
  chatId: number;
  categoryId?: string; // bare uuid when editing
}

export default function EditChatCategoryPage({ chatId, categoryId }: Props) {
  const isEdit = !!categoryId;
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data } = trpc.category.listByChat.useQuery({ chatId });
  const existing = data?.custom.find((c) => c.id === `chat:${categoryId}`);

  const [emoji, setEmoji] = useState(existing?.emoji ?? "🏷️");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (existing) {
      setEmoji(existing.emoji);
      setTitle(existing.title);
    }
  }, [existing]);

  useEffect(() => {
    backButton.mount();
    backButton.show();
    const off = backButton.onClick(() => navigate({ to: ".." }));
    return () => { off(); backButton.hide(); };
  }, [navigate]);

  const createMut = trpc.category.create.useMutation({
    onSuccess: () => {
      utils.category.listByChat.invalidate({ chatId });
      navigate({ to: "/chat/$chatId_/settings/categories", params: { chatId: String(chatId) } });
    },
    onError: (e) => setError(e.message),
  });
  const updateMut = trpc.category.update.useMutation({
    onSuccess: () => {
      utils.category.listByChat.invalidate({ chatId });
      navigate({ to: "/chat/$chatId_/settings/categories", params: { chatId: String(chatId) } });
    },
    onError: (e) => setError(e.message),
  });
  const deleteMut = trpc.category.delete.useMutation({
    onSuccess: () => {
      utils.category.listByChat.invalidate({ chatId });
      navigate({ to: "/chat/$chatId_/settings/categories", params: { chatId: String(chatId) } });
    },
    onError: (e) => setError(e.message),
  });

  const onSave = () => {
    setError(null);
    if (isEdit && categoryId) {
      updateMut.mutate({ chatCategoryId: categoryId, emoji, title });
    } else {
      createMut.mutate({ chatId, emoji, title });
    }
  };

  return (
    <div>
      <Section header={isEdit ? "EDIT CATEGORY" : "NEW CATEGORY"}>
        <Input header="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
        <Input header="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Section>

      <div className="px-4 pt-4 flex flex-col gap-2">
        <Button
          size="l"
          onClick={onSave}
          disabled={title.trim().length === 0 || emoji.length === 0}
        >
          {isEdit ? "Save" : "Create"}
        </Button>
        {isEdit && (
          <Button size="l" mode="plain" onClick={() => setConfirmDelete(true)}>
            Delete category
          </Button>
        )}
      </div>

      {error ? (
        <Snackbar onClose={() => setError(null)} description={error}>Error</Snackbar>
      ) : null}

      <ConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete category?"
        description="Expenses using this category will become Uncategorized."
        confirmLabel="Delete"
        onConfirm={() => {
          if (categoryId) deleteMut.mutate({ chatCategoryId: categoryId });
        }}
      />
    </div>
  );
}
```

Note: if `ConfirmationModal` doesn't exist under `apps/web/src/components/ui`, adapt to whatever confirmation primitive the repo already uses (check `apps/web/src/components/ui` first; otherwise use `window.confirm` as a minimal stand-in — this is an internal tool and we are not adding a new UI dep for v1).

- [ ] **Step 2: Create the routes**

```tsx
// apps/web/src/routes/_tma/chat.$chatId_.settings.categories.new.tsx
import { createFileRoute } from "@tanstack/react-router";
import EditChatCategoryPage from "@/components/features/Settings/EditChatCategoryPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/categories/new")({
  component: RouteComponent,
});
function RouteComponent() {
  const { chatId } = Route.useParams();
  return <EditChatCategoryPage chatId={Number(chatId)} />;
}
```

```tsx
// apps/web/src/routes/_tma/chat.$chatId_.settings.categories.$categoryId.tsx
import { createFileRoute } from "@tanstack/react-router";
import EditChatCategoryPage from "@/components/features/Settings/EditChatCategoryPage";

export const Route = createFileRoute(
  "/_tma/chat/$chatId_/settings/categories/$categoryId",
)({
  component: RouteComponent,
});
function RouteComponent() {
  const { chatId, categoryId } = Route.useParams();
  return <EditChatCategoryPage chatId={Number(chatId)} categoryId={categoryId} />;
}
```

- [ ] **Step 3: Build + type-check**

Run: `pnpm --filter web build && pnpm turbo check-types --filter=web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_tma apps/web/src/components/features/Settings/EditChatCategoryPage.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat(categories/web): create/edit/delete custom category"
```

---

## Task 22: Web — Extract `TransactionFiltersCell` + `TransactionFiltersModal` (pure refactor)

**Files:**
- Create: `apps/web/src/components/features/Chat/TransactionFiltersCell.tsx`
- Create: `apps/web/src/components/features/Chat/TransactionFiltersModal.tsx`
- Modify: `apps/web/src/components/features/Chat/ChatTransactionTab.tsx`

- [ ] **Step 1: Lift the existing FilterSection component + its modal out of `ChatTransactionTab.tsx`**

Without changing behavior: move the JSX + handlers currently inside `ChatTransactionTab` that render the filter Cell + related modal(s) into `TransactionFiltersCell` and `TransactionFiltersModal`. Import them back into `ChatTransactionTab`. No new props beyond what the existing tab uses.

Target files sizes after split:
- `ChatTransactionTab.tsx` loses ~150 lines.
- `TransactionFiltersCell.tsx` ~80 lines.
- `TransactionFiltersModal.tsx` ~100 lines.

- [ ] **Step 2: Build + run existing tests**

Run: `pnpm --filter web build && pnpm --filter web test:ct`
Expected: no visual or behavioural change; all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/Chat
git commit -m "refactor(categories/web): extract TransactionFiltersCell + Modal"
```

---

## Task 23: Web — Category pill in filter Cell (priority + cap + `+N`)

**Files:**
- Modify: `apps/web/src/components/features/Chat/TransactionFiltersCell.tsx`
- Modify: `apps/web/src/components/features/Chat/ChatTransactionTab.tsx`

- [ ] **Step 1: Add `categoryFilter` state to `ChatTransactionTab`**

```ts
const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
const [pickerOpen, setPickerOpen] = useState(false);

const { data: categoriesData } = trpc.category.listByChat.useQuery({ chatId });
const allCategories = useMemo(
  () => [...(categoriesData?.base ?? []), ...(categoriesData?.custom ?? [])],
  [categoriesData],
);
const chatRows = useMemo<ChatCategoryRow[]>(
  () =>
    (categoriesData?.custom ?? []).map((c) => ({
      id: c.id.replace(/^chat:/, ""),
      chatId: BigInt(chatId),
      emoji: c.emoji,
      title: c.title,
    })),
  [categoriesData, chatId],
);
const resolvedCategory = useMemo(
  () => resolveCategory(categoryFilter, chatRows),
  [categoryFilter, chatRows],
);
```

Import `resolveCategory` and `ChatCategoryRow` from `@repo/categories`.

- [ ] **Step 2: Pass `categoryFilter`, `resolvedCategory`, handlers into `TransactionFiltersCell`**

Extend `TransactionFiltersCellProps` with:

```ts
  categoryFilter: string | null;
  resolvedCategory: ReturnType<typeof resolveCategory>;
  showPayments: boolean;
  relatedOnly: boolean;
  onOpenModal: () => void;
  onOpenPicker: () => void;
  onClearCategory: () => void;
```

- [ ] **Step 3: Render priority + cap logic inside `TransactionFiltersCell`**

```tsx
const activePills: Array<{ key: string; node: ReactNode }> = [];

if (resolvedCategory) {
  activePills.push({
    key: "category",
    node: (
      <CategoryPill
        emoji={resolvedCategory.emoji}
        label={resolvedCategory.title}
        active
        onClick={onOpenModal}
        onClear={onClearCategory}
      />
    ),
  });
} else {
  activePills.push({
    key: "category-cta",
    node: (
      <CategoryPill
        label="Category"
        dashed
        onClick={(e) => { e.stopPropagation(); onOpenPicker(); }}
      />
    ),
  });
}

if (showPayments) activePills.push({ key: "payments", node: <Pill>Payments</Pill> });
if (relatedOnly) activePills.push({ key: "related", node: <Pill>Related</Pill> });
// date / sort pills...

const MAX_INLINE = 2;
const inline = activePills.slice(0, MAX_INLINE);
const overflow = activePills.length - inline.length;
```

Render `inline` + a `CategoryPill label={'+' + overflow}` when `overflow > 0` that calls `onOpenModal`.

Clicking the outer Cell calls `onOpenModal`; inner pill buttons must `e.stopPropagation()`.

- [ ] **Step 4: Build + run existing component tests**

Run: `pnpm --filter web build && pnpm --filter web test:ct`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Chat
git commit -m "feat(categories/web): category pill in filter cell with +N overflow"
```

---

## Task 24: Web — Category row in filter Modal

**Files:**
- Modify: `apps/web/src/components/features/Chat/TransactionFiltersModal.tsx`

- [ ] **Step 1: Accept `resolvedCategory` + `onOpenPicker` + `onClearCategory` props**

- [ ] **Step 2: Insert a Category row at the top of the modal's content**

```tsx
<Cell
  before={<span className="text-xl">{resolvedCategory?.emoji ?? "🗂️"}</span>}
  after={
    resolvedCategory ? (
      <Button mode="plain" size="s" onClick={onClearCategory}>Clear</Button>
    ) : (
      <ChevronRight size={16} />
    )
  }
  onClick={onOpenPicker}
>
  {resolvedCategory ? resolvedCategory.title : "Category"}
</Cell>
```

- [ ] **Step 3: Render `CategoryPickerSheet` at the tab level**

In `ChatTransactionTab.tsx`, render the sheet and wire it so `onSelect` sets `categoryFilter` to the picked id.

- [ ] **Step 4: Build + test**

Run: `pnpm --filter web build && pnpm --filter web test:ct`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Chat
git commit -m "feat(categories/web): category row inside filter modal"
```

---

## Task 25: Web — Emoji on expense rows + category predicate filter

**Files:**
- Modify: `apps/web/src/components/features/Chat/ChatExpenseCell.tsx`
- Modify: `apps/web/src/components/features/Chat/VirtualizedCombinedTransactionSegment.tsx` (or wherever expense rows are filtered/rendered)

- [ ] **Step 1: Show category emoji on expense rows**

Resolve each expense's `categoryId` against `chatRows + BASE_CATEGORIES` (reuse the same memoized maps passed from the tab). Render the emoji as a small badge adjacent to the existing avatar/icon.

- [ ] **Step 2: Apply the category predicate to the filtered expense list**

In the list-building memo already present in `ChatTransactionTab.tsx`, add:

```ts
.filter((row) => {
  if (row.kind !== "expense") return true; // settlements always pass
  if (!categoryFilter) return true;
  return row.categoryId === categoryFilter;
})
```

- [ ] **Step 3: Build + run component tests**

Run: `pnpm --filter web build && pnpm --filter web test:ct`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Chat
git commit -m "feat(categories/web): show emoji on rows and filter by category"
```

---

## Task 26: Web — Onboarding tooltip

**Files:**
- Create: `apps/web/src/components/features/Chat/CategoriesOnboarding.tsx`
- Modify: `apps/web/src/components/features/Chat/ChatTransactionTab.tsx`

- [ ] **Step 1: Create the tooltip component**

```tsx
// apps/web/src/components/features/Chat/CategoriesOnboarding.tsx
import { useEffect, useState } from "react";
import { Caption } from "@telegram-apps/telegram-ui";
import { Sparkles, X } from "lucide-react";

const key = (userId: number, chatId: number) =>
  `bs-onboarding-categories:${userId}:${chatId}`;

export default function CategoriesOnboarding({
  userId,
  chatId,
}: {
  userId: number;
  chatId: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(key(userId, chatId))) setVisible(true);
    } catch {
      /* localStorage unavailable — skip */
    }
  }, [userId, chatId]);

  if (!visible) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(key(userId, chatId), "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  return (
    <div className="mx-4 mt-3 rounded-xl bg-[var(--tg-theme-section-bg-color)] p-3 flex items-start gap-2">
      <Sparkles size={16} className="mt-0.5 text-violet-500" />
      <div className="flex-1">
        <Caption level="1" weight="2">New: Categories</Caption>
        <div className="text-xs text-[var(--tg-theme-hint-color)]">
          Tap the filter to narrow by category. Manage custom categories in chat settings.
        </div>
      </div>
      <button type="button" onClick={dismiss} className="p-1">
        <X size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Render it above the filter cell**

In `ChatTransactionTab.tsx`, render `<CategoriesOnboarding userId={userId} chatId={chatId} />` just above `<TransactionFiltersCell />`.

- [ ] **Step 3: Build + check-types**

Run: `pnpm --filter web build && pnpm turbo check-types --filter=web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Chat
git commit -m "feat(categories/web): categories onboarding tooltip"
```

---

## Task 27: Bot — silent auto-assign on expense create

**Files:**
- Modify: `apps/bot/package.json`
- Modify: `apps/bot/src/features/expenses.ts`

- [ ] **Step 1: Add `@repo/categories` dependency**

Edit `apps/bot/package.json`, add under `dependencies`:

```json
"@repo/categories": "workspace:*",
```

Run: `pnpm install`

- [ ] **Step 2: Call `classifyCategory` before creating expense**

In `apps/bot/src/features/expenses.ts`, find the function that calls the tRPC `expense.createExpense` (or the Prisma `expense.create`) after the agent has collected description + amount. Before that call:

```ts
import { classifyCategory } from "@repo/categories";
import { db } from "@dko/database";

// ...inside the create-expense flow, after description is known:
const chatRows = await db.chatCategory.findMany({
  where: { chatId },
  select: { id: true, chatId: true, emoji: true, title: true },
});
const suggestion = await classifyCategory({
  description,
  chatCategories: chatRows,
});
const categoryId = suggestion?.categoryId ?? null;

// then pass categoryId into the existing create-expense call
```

If the bot already uses the tRPC client (`callTRPC` or similar) to call `expense.createExpense`, pass `categoryId` via that call's input. If it goes straight to Prisma, pass it into `db.expense.create({ data: { ..., categoryId } })`.

- [ ] **Step 3: Build + check-types**

Run: `pnpm turbo build check-types --filter=bot`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/bot/package.json apps/bot/src pnpm-lock.yaml
git commit -m "feat(categories/bot): silent auto-assign on expense create"
```

---

## Task 28: CLI — display category + `--category` flag

**Files:**
- Modify: `apps/cli/package.json` (add `@repo/categories` dep)
- Modify: `apps/cli/src/commands/expense.ts`
- Possibly modify: `apps/cli/src/output.ts`

- [ ] **Step 1: Add dep**

```json
"@repo/categories": "workspace:*",
```

Run: `pnpm install`

- [ ] **Step 2: Resolve + render category in expense listings**

Load `category.listByChat` once per command invocation, build a `Map<string, ResolvedCategory>` keyed by full id (`base:...` and `chat:...`), then when rendering each expense line prefix with `${emoji} ${title} ` when `categoryId` is non-null and resolvable; empty string otherwise.

- [ ] **Step 3: Add `--category <id>` flag**

For the expense list command, add:

```ts
.option("--category <id>", "Filter expenses by category id (base:... or chat:<uuid>)")
```

Apply as a local filter after fetching `getAllExpensesByChat`. Settlements always pass the filter.

- [ ] **Step 4: Update CLI tests**

Add a case in `apps/cli/src/commands/expense.test.ts` that seeds an expense row with a `categoryId` and asserts the output contains the resolved emoji + title prefix. Add a second case that runs `--category base:food` and asserts only matching expenses appear but all settlements remain.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @banananasplitz/cli test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/cli pnpm-lock.yaml
git commit -m "feat(categories/cli): display categories and add --category filter"
```

---

## Task 29: CLI — CHANGELOG entry + version bump

**Files:**
- Modify: `apps/cli/CHANGELOG.md`
- Modify: `apps/cli/package.json` (bump `version`)
- Optionally modify: `apps/cli/skills/*` version files if the CI invariant from `AGENTS.md` applies (skill version must match package version).

- [ ] **Step 1: Bump `apps/cli/package.json` to `0.8.0`**

Minor bump (new feature).

- [ ] **Step 2: Add CHANGELOG entry**

Edit `apps/cli/CHANGELOG.md` under `## [Unreleased]` → promote to new heading:

```markdown
## [0.8.0] - 2026-04-20

### Added

- Expense category display: each expense row now shows the category emoji + title when present.
- `--category <id>` filter on expense list commands. Accepts `base:<id>` for base categories and `chat:<uuid>` for custom per-chat categories. Settlements are never filtered out.
```

- [ ] **Step 3: Update any skills/version files flagged by `apps/cli/AGENTS.md` if required.**

Run: `cat apps/cli/AGENTS.md` to confirm the invariant. Bump whatever file it names to `0.8.0`.

- [ ] **Step 4: Build + sanity smoke**

Run: `pnpm --filter @banananasplitz/cli build && node apps/cli/dist/cli.js --help`
Expected: `--category` flag appears; no runtime errors.

- [ ] **Step 5: Commit**

```bash
git add apps/cli
git commit -m "chore(cli): bump to 0.8.0 for categories feature"
```

---

## Task 30: Open PR

- [ ] **Step 1: Push branch**

Run: `git push -u origin feat/categories`

- [ ] **Step 2: Open PR via `gh pr create` with `--auto --squash --delete-branch`**

```bash
gh pr create --title "feat: expense categories" --body "$(cat <<'EOF'
## Summary
- Adds 10 base + per-chat custom categories to expenses.
- Gemini-backed auto-assign on add-expense (debounced while typing) via new `@repo/categories` package.
- Categories surface in chat transactions filter (pill + modal row), on expense rows, in chat settings (Manage categories page), on bot expense creates (silent), and in CLI listings + filter.

## Test plan
- [ ] `pnpm turbo build check-types test`
- [ ] Web UAT: add expense, type description, see sparkle badge; override picks category; filter transactions by category; manage/create/edit/delete custom category.
- [ ] Bot UAT: create expense via Telegram; open Mini App; category is populated.
- [ ] CLI UAT: `node apps/cli/dist/cli.js expense list --chat <id>` shows emoji prefix; `--category base:food` filters.

Spec: docs/superpowers/specs/2026-04-20-expense-categories-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --squash --delete-branch
```

(Per user feedback: always `--auto --squash --delete-branch`; CI gates only run on PRs.)

---

## Self-review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| Base categories (10 IDs) | 2 |
| Data model (`ChatCategory` + `Expense.categoryId`) | 6 |
| Shared package `@repo/categories` | 1–5 |
| tRPC `category.*` | 7, 8, 9, 10, 11, 13 |
| Expense router `categoryId` pass-through | 12 |
| Web — chat transactions filter pill + modal row + onboarding | 22, 23, 24, 26 |
| Web — emoji on rows + client-side predicate | 25 |
| Web — add expense w/ debounced auto-assign | 17 |
| Web — edit expense | 18 |
| Web — category picker sheet + primitives | 14, 15, 16 |
| Web — chat settings entry + Manage page + create/edit custom | 19, 20, 21 |
| Bot silent auto-assign | 27 |
| CLI display + filter + CHANGELOG | 28, 29 |
| PR workflow | 30 |

No spec gaps detected.

**Placeholder scan:** No TBDs / TODOs / "similar to Task N". Every code-changing step includes the actual code. File paths are explicit. Commands are runnable.

**Type / name consistency check:**
- `categoryId` string format `base:<id>` / `chat:<uuid>` — consistent across tasks 6, 7, 8, 9, 10, 11, 12, 14, 16, 17, 18, 25, 27, 28.
- `ChatCategoryRow.id` stored as bare uuid (Task 2); wrapped to `chat:<uuid>` at every emission boundary (`listByChat` Task 7, `create`/`update`/`delete` Tasks 8–10, bot Task 27). Consistent.
- `resolveCategory(id, chatCategories)` signature matches in Tasks 3, 17, 23, 28.
- `classifyCategory({description, chatCategories, signal?})` signature matches in Tasks 5, 11, 27.
- tRPC procedure names (`listByChat`, `create`, `update`, `delete`, `suggest`) used consistently in web callers (Tasks 17, 19, 20, 21, 23).
- `CategoryPill` props (`emoji`, `label`, `active`, `dashed`, `onClick`, `onClear`) consistent between declaration (Task 14) and usage (Tasks 19, 23, 24).

No mismatches.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-04-20-expense-categories-plan.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
