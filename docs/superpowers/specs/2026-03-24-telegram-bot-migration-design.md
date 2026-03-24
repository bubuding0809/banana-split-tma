# Telegram Bot Migration Design

## 1. Goal

Migrate the existing Python (`python-telegram-bot`) Telegram bot ("Banana Split") into the existing `banana-split-tma` monorepo. The new bot will be built with the `grammy` TypeScript framework and deployed as a Vercel Serverless Function to benefit from zero-downtime, serverless deployments, and direct access to the monorepo's shared `tRPC` and database logic.

## 2. Architecture & Location

- **Location**: A new application directory `apps/bot` inside the `banana-split-tma` pnpm workspace.
- **Dependencies**: It will depend on `grammy`, `@grammyjs/vercel`, and the internal `@dko/trpc` package.
- **Configuration**: It will extend the shared `@repo/typescript-config` and `@repo/eslint-config`.

## 3. Execution Strategy

The bot will operate in two distinct modes to optimize for both production performance and local development experience:

- **Production (Vercel)**: Vercel will route incoming HTTP POST requests to `apps/bot/api/webhook.ts`. This endpoint will utilize Grammy's `webhookCallback(bot, 'http')` adapter to process updates statelessly in a serverless environment.
- **Local Development**: A dedicated script `scripts/dev.ts` will run the bot via long-polling (`bot.start()`). This avoids the complexity of exposing local webhooks via tunnels (like ngrok) during local development.

## 4. Data Access (tRPC Integration)

Instead of communicating via HTTP as the Python bot did, the new TS bot will bypass the network entirely.

- A Grammy middleware will be created to inject a server-side caller for the tRPC router directly into the Grammy Context.
- Example usage: `await ctx.trpc.user.create({ ... })`.
- This approach guarantees strict type safety, removes network latency, and relies entirely on the business logic already established in `@dko/trpc`.

## 5. Code Structure

The codebase will use a feature-based Composer structure to keep the bot organized and scalable:

- `src/bot.ts`: The main entry point that configures the bot instance, registers middleware (including the tRPC caller context), and combines Composers.
- `src/features/expenses.ts`: Handles commands related to expenses, such as `/list`, `/chase`, and `/balance`.
- `src/features/group.ts`: Handles group management commands like `/pin`, `/summary`, and `/set_topic`.
- `src/features/user.ts`: Handles general user commands like `/start`, `/help`, and `/cancel`.

## 6. Deployment

The bot will be deployed using Vercel.

- A `vercel.json` file will be configured in `apps/bot` to ensure proper routing of the webhook endpoint to `api/webhook.ts`.
- Environment variables (like `TELEGRAM_BOT_TOKEN`) will be synced with Vercel and loaded via `dotenv` in the local development script.
