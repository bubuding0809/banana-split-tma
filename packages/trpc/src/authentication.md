# Protected Procedure Usage Examples

## Overview

The tRPC setup now includes a `protectedProcedure` that supports dual authentication:

1. **X-Api-Key header authentication**
2. **Telegram Mini App authentication using initData**

## Authentication Methods

### 1. API Key Authentication

```bash
curl -X GET \
  http://localhost:3000/api/trpc/user.getMyProfile \
  -H "X-Api-Key: your-api-key-here"
```

### 2. Telegram Mini App Authentication

```bash
curl -X GET \
  http://localhost:3000/api/trpc/user.getMyProfile \
  -H "Authorization: tma query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A279058397%2C%22first_name%22%3A%22Vladislav%22%2C%22last_name%22%3A%22Kibenko%22%2C%22username%22%3A%22vdkfrost%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%7D&auth_date=1662771648&hash=c501b71e775f74ce10e377dea85a7ea24ecd640b223ea86dfe453e0eaed2e2b2"
```

## Environment Variables Required

```bash
# Required for Telegram authentication
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather

# Required for API key authentication
API_KEY=your-secret-api-key
```

## How to Create More Protected Procedures

1. Import `protectedProcedure` instead of `publicProcedure`:

```typescript
import { protectedProcedure } from "../../trpc.js";
```

2. Access authenticated user data in your handler:

```typescript
.query(async ({ input, ctx }) => {
  // ctx.user contains Telegram user data (or null for API key auth)
  // ctx.authType is either "api-key" or "telegram"

  return yourHandler(input, ctx.db, ctx.user, ctx.authType);
});
```

3. The context includes:

- `ctx.user: TelegramUser | null` - Telegram user info when using Telegram auth
- `ctx.authType: "api-key" | "telegram"` - Which authentication method was used
- `ctx.db` - Database access
- `ctx.headers` - Request headers
- `ctx.req` / `ctx.res` - Express request/response objects

## Error Handling

The middleware handles these error cases:

- Missing authentication headers
- Invalid API key
- Invalid Telegram initData signature
- Expired Telegram initData
- Missing bot token configuration

All errors return appropriate HTTP status codes and descriptive messages.
