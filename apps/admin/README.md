# Admin

Broadcast console for the Banana Split TMA project. A Vite + React SPA gated by
Telegram login, backed by Vercel serverless functions in `api/` that proxy to
the lambda service with a server-held API key.

## Architecture

```
Browser ──▶ /api/auth/*             (session: sign-in, identity, sign-out)
        └─▶ /api/admin/trpc/[...]   (tRPC proxy to lambda, adds x-api-key)
        └─▶ /api/admin/broadcast    (multipart proxy to lambda)
```

Session is an HttpOnly JWT cookie. Only Telegram IDs in
`ADMIN_ALLOWED_TELEGRAM_IDS` can sign in.

## Local dev

1. Run the lambda in another terminal (`pnpm --filter lambda dev`) so the proxy
   has somewhere to forward to.
2. Set up env files:

   ```bash
   cp apps/admin/env/.env.development.example apps/admin/env/.env.development
   cp apps/admin/.env.example apps/admin/.env.local
   ```

3. For pure local iteration keep `ADMIN_DEV_BYPASS="1"` in
   `env/.env.development`. The Vite dev server mounts the same serverless
   handlers and short-circuits auth, so you land on the broadcast page
   immediately.

4. Start the admin dev server:

   ```bash
   pnpm --filter admin dev
   # http://localhost:6820
   ```

To exercise the real Telegram login flow locally, set
`ADMIN_DEV_BYPASS="0"`, fill in `VITE_TELEGRAM_BOT_USERNAME`, point your bot's
domain at the dev URL via BotFather (`/setdomain`), and add your Telegram ID to
`ADMIN_ALLOWED_TELEGRAM_IDS`.

## Deploy

The admin app is deployed as its own Vercel project (root: `apps/admin`). All
serverless functions live under `api/`; Vercel auto-detects the Vite build.

Required Vercel environment variables:

| Var                          | Purpose                                           |
| ---------------------------- | ------------------------------------------------- |
| `ADMIN_LAMBDA_URL`           | Base URL of the lambda API (e.g. `https://…/api`) |
| `ADMIN_LAMBDA_API_KEY`       | Server-held lambda API key                        |
| `ADMIN_SESSION_SECRET`       | 32+ char random string for signing JWT sessions   |
| `ADMIN_ALLOWED_TELEGRAM_IDS` | Comma-separated list of Telegram user IDs         |
| `TELEGRAM_BOT_TOKEN`         | Bot token used to verify Login Widget signatures  |
| `VITE_TELEGRAM_BOT_USERNAME` | Bot username for the Login Widget (no `@`)        |

`ADMIN_DEV_BYPASS` must **not** be set (or be `0`) in prod.
