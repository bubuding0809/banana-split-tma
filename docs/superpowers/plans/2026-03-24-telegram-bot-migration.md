# Telegram Bot Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Python Telegram bot to a Grammy TypeScript bot in `apps/bot`, deployed on Vercel and connected directly to `@dko/trpc`.

**Architecture:** A Vercel Serverless Function (`api/webhook.ts`) handles production webhooks statelessly using `@grammyjs/vercel`. Local development uses long-polling via `scripts/dev.ts`. The bot uses a feature-based Composer structure and bypasses HTTP by injecting a tRPC server-side caller directly into the Grammy context.

**Tech Stack:** TypeScript, Node.js, Grammy, `@grammyjs/vercel`, tRPC, Vercel

---

### Task 1: Initialize Package & Config

**Files:**

- Create: `apps/bot/package.json`
- Create: `apps/bot/tsconfig.json`
- Create: `apps/bot/eslint.config.js`
- Create: `apps/bot/vercel.json`

- [ ] **Step 1: Create `apps/bot/package.json`**

```json
{
  "name": "bot",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "tsx watch scripts/dev.ts",
    "build": "tsc",
    "lint": "eslint .",
    "check-types": "tsc --noEmit",
    "start": "vercel dev",
    "deploy": "vercel"
  },
  "dependencies": {
    "grammy": "^1.35.0",
    "@dko/trpc": "workspace:*",
    "@t3-oss/env-core": "^0.13.8",
    "zod": "^3.23.8",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/node": "^20.12.7",
    "eslint": "^9.1.1",
    "tsx": "^4.7.2",
    "typescript": "5.4.5",
    "vercel": "^34.2.0"
  }
}
```

- [ ] **Step 2: Create `apps/bot/tsconfig.json`**

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "baseUrl": ".",
    "types": ["node"]
  },
  "include": ["src", "api", "scripts", "eslint.config.js"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `apps/bot/eslint.config.js` and `apps/bot/vercel.json`**

```javascript
// eslint.config.js
import baseConfig from "@repo/eslint-config/base.js";

export default [
  ...baseConfig,
  {
    ignores: ["dist/**"],
  },
];
```

```json
// vercel.json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "npx turbo-ignore",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/webhook"
    }
  ]
}
```

- [ ] **Step 4: Run install and verify types pass**

Run: `pnpm install && pnpm --filter bot run check-types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/bot
git commit -m "chore(bot): initialize bot package with grammy and configs"
```

### Task 2: Implement Environment & Core Bot Instance

**Files:**

- Create: `apps/bot/src/env.ts`
- Create: `apps/bot/src/bot.ts`
- Create: `apps/bot/src/types.ts`

- [ ] **Step 1: Create environment validation (`src/env.ts`)**

```typescript
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

export const env = createEnv({
  server: {
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    VERCEL_URL: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
```

- [ ] **Step 2: Define Custom Context (`src/types.ts`)**

```typescript
import { Context } from "grammy";

export interface BotContext extends Context {
  // We will add trpc later
}
```

- [ ] **Step 3: Create Core Bot (`src/bot.ts`)**

```typescript
import { Bot } from "grammy";
import { env } from "./env.js";
import { BotContext } from "./types.js";

export const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

// Basic catch-all error handler
bot.catch((err) => {
  console.error(
    "Error while handling update",
    err.ctx.update.update_id,
    err.error
  );
});
```

- [ ] **Step 4: Verify Compilation**

Run: `pnpm --filter bot run check-types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src
git commit -m "feat(bot): setup core bot instance and env validation"
```

### Task 3: Setup Webhook and Polling Scripts

**Files:**

- Create: `apps/bot/api/webhook.ts`
- Create: `apps/bot/scripts/dev.ts`

- [ ] **Step 1: Create Vercel Webhook Endpoint (`api/webhook.ts`)**

```typescript
import { webhookCallback } from "grammy";
import { bot } from "../src/bot.js";

// Export standard handler for Vercel
export default webhookCallback(bot, "http");
```

- [ ] **Step 2: Create Local Dev Script (`scripts/dev.ts`)**

```typescript
import { bot } from "../src/bot.js";

console.log("Starting bot in local long-polling mode...");

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

bot.start({
  onStart: (botInfo) => {
    console.log(`Bot @${botInfo.username} started successfully!`);
  },
});
```

- [ ] **Step 3: Verify scripts compile**

Run: `pnpm --filter bot run check-types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/bot/api apps/bot/scripts
git commit -m "feat(bot): add vercel webhook and local polling dev scripts"
```

### Task 4: tRPC Context Middleware

**Files:**

- Modify: `apps/bot/src/types.ts`
- Create: `apps/bot/src/middleware/trpc.ts`
- Modify: `apps/bot/src/bot.ts`

- [ ] **Step 1: Update Types for tRPC (`src/types.ts`)**

Before proceeding, check `@dko/trpc/src/trpc.ts` or `index.ts` for the `createContext` function to understand what it expects.
Update `BotContext` to include the `AppCaller`.

```typescript
import { Context } from "grammy";
import { appRouter } from "@dko/trpc";

export type AppCaller = ReturnType<typeof appRouter.createCaller>;

export interface BotContext extends Context {
  trpc: AppCaller;
}
```

- [ ] **Step 2: Create Middleware (`src/middleware/trpc.ts`)**

Read the context creation logic from `@dko/trpc/src/trpc.ts` (specifically `createContext` or `createTRPCContext`) and construct the context object properly. Ensure the `createCaller` function signature is fully satisfied.

```typescript
import { Middleware } from "grammy";
import { BotContext } from "../types.js";
import { appRouter } from "@dko/trpc";
// Import exactly what's needed for the trpc context
import { env } from "../env.js";

export const trpcMiddleware: Middleware<BotContext> = async (ctx, next) => {
  // Construct the exact context interface that appRouter expects
  // Inspect @dko/trpc's createContext signature to fill this properly
  // For example:
  // const trpcCtx = await createContext({ req, res, ... });

  // NOTE FOR AGENT: You MUST inspect @dko/trpc to see the exact structure. Do not use 'any'.
  // ctx.trpc = appRouter.createCaller(trpcCtx);
  await next();
};
```

- [ ] **Step 3: Register in Bot (`src/bot.ts`)**

```typescript
import { trpcMiddleware } from "./middleware/trpc.js";

bot.use(trpcMiddleware);
```

- [ ] **Step 4: Verify type safety**

Run: `pnpm --filter bot run check-types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src
git commit -m "feat(bot): inject trpc server caller into grammy context"
```

### Task 5: Implement User Features (Porting)

**Files:**

- Create: `apps/bot/src/features/user.ts`
- Modify: `apps/bot/src/bot.ts`

- [ ] **Step 1: Read Python User Handlers**
      Read `../../../banana-split-tgbot/handlers/user_handlers.py` and `../../../banana-split-tgbot/handlers/__init__.py` to understand the exact business logic for `/start`, `/help`, and `/cancel`.

- [ ] **Step 2: Implement User Composer (`src/features/user.ts`)**
      Write the Grammy handlers that mirror the Python logic. Replace `aiohttp` API calls with direct `ctx.trpc` calls (e.g., calling `ctx.trpc.user.create(...)`). Format the reply messages identically to the Python bot.

- [ ] **Step 3: Register in bot.ts**

```typescript
import { userFeature } from "./features/user.js";
bot.use(userFeature);
```

- [ ] **Step 4: Run Types Check**
      Run: `pnpm --filter bot run check-types`
      Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/features/user.ts apps/bot/src/bot.ts
git commit -m "feat(bot): port user commands (start, help, cancel) from python"
```

### Task 6: Implement Group & Expenses Features (Porting)

**Files:**

- Create: `apps/bot/src/features/group.ts`
- Create: `apps/bot/src/features/expenses.ts`
- Modify: `apps/bot/src/bot.ts`

- [ ] **Step 1: Read Python Group/Member Handlers**
      Read `../../../banana-split-tgbot/handlers/group_handlers.py` and other relevant python handlers for the group and expenses logic.

- [ ] **Step 2: Implement Group Composer (`src/features/group.ts`)**
      Port the `/pin`, `/summary`, and `/set_topic` handlers. Replicate the Python message parsing and state logic using `ctx.trpc` for database interactions.

- [ ] **Step 3: Implement Expenses Composer (`src/features/expenses.ts`)**
      Port the `/list`, `/chase`, and `/balance` handlers. Use `ctx.trpc` to pull expenses from the database and format them exactly as the Python bot did.

- [ ] **Step 4: Register in bot.ts**

```typescript
import { groupFeature } from "./features/group.js";
import { expensesFeature } from "./features/expenses.js";
bot.use(groupFeature);
bot.use(expensesFeature);
```

- [ ] **Step 5: Run Types Check**
      Run: `pnpm --filter bot run check-types`
      Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/bot/src/features apps/bot/src/bot.ts
git commit -m "feat(bot): port group and expenses commands from python"
```

### Task 7: Setup Initialization Webhook Script

**Files:**

- Create: `apps/bot/scripts/set-webhook.ts`
- Modify: `apps/bot/package.json`

- [ ] **Step 1: Write Webhook Script (`scripts/set-webhook.ts`)**

```typescript
import { bot } from "../src/bot.js";
import { env } from "../src/env.js";

async function setWebhook() {
  if (!env.VERCEL_URL) {
    throw new Error("VERCEL_URL is not set");
  }

  const url = `https://${env.VERCEL_URL}/api/webhook`;
  console.log(`Setting webhook to: ${url}`);

  await bot.api.setWebhook(url);
  console.log("Webhook set successfully!");
}

setWebhook().catch(console.error);
```

- [ ] **Step 2: Add script to package.json**

```json
// Add to scripts block in package.json
"set-webhook": "tsx scripts/set-webhook.ts"
```

- [ ] **Step 3: Verify Compilation**

Run: `pnpm --filter bot run check-types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/bot/scripts/set-webhook.ts apps/bot/package.json
git commit -m "feat(bot): add set-webhook helper script"
```
