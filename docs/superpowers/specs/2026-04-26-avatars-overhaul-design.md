# Avatars Overhaul — Real Photos, No Leaks

**Date:** 2026-04-26
**Status:** Brainstorm complete — awaiting user spec review
**Author:** Ruoqian Ding (with Claude Opus 4.7)

## Goal

Three avatar surfaces, one PR:

1. **Current user's own avatar in the TMA** → use
   `initData.user.photo_url` directly. Telegram CDN, instant first
   paint, zero backend hit, no token in sight.
2. **Other members' avatars** (member lists, splits, settlements,
   balances, etc.) → proxy via a new
   `/api/avatar/:userId` route on the lambda.
3. **Group/chat avatars** (chat header, switcher) → proxy via a new
   `/api/chat-photo/:chatId` route. **This closes a token leak that
   exists in production today** in
   `packages/trpc/src/routers/telegram/getChat.ts`.

Three different problems, three different solutions, sharing one
piece of infrastructure (the proxy pattern). They ship together
because they touch overlapping files (`ChatMemberAvatar`, the
lambda router, the `telegram` tRPC router).

The headline constraints:

- The previous user-avatar attempt was rolled back because it leaked
  the bot token via `https://api.telegram.org/file/bot<TOKEN>/...`
  URLs. Don't repeat.
- The **current group-avatar implementation has the same leak**
  shipped to production today — `getChat.ts` returns a
  `getFileLink()` result to the client. Anyone with DevTools open on
  a group page can read the bot token. Fix it in the same PR.
- For the user themselves, hitting the proxy is unnecessary work —
  Telegram already gave us a CDN URL via initData. Use it.

## Why one PR (not three)

Three separate PRs would mean three rounds of review, three deploys,
and a window where the group-photo leak coexists with the new user
proxy. The changes overlap on `ChatMemberAvatar.tsx` and the lambda
router — splitting them adds churn. Bundling means:

- One review surface for the whole "real avatars" story.
- The shipped group-photo leak closes in the same deploy that opens
  the user-photo proxy.
- Reviewers see the full Option D story (initData + proxy hybrid)
  in one place.

If review feedback wants it split, easy to break into 2–3 PRs at
that point.

## Approach summary

| Surface | Image source | Fallback chain |
|---|---|---|
| **Self avatar** in TMA | `initData.user.photo_url` (`t.me/i/userpic/...`) | proxy → emoji |
| **Other members** | `/api/avatar/:userId` proxy | emoji |
| **Group photo** | `/api/chat-photo/:chatId` proxy | placeholder card |

For self, the initData CDN URL skips the lambda entirely on first
paint — it's a Telegram-CDN URL, hotlink-friendly, no auth needed.
If `photo_url` is undefined (privacy-hidden) the component falls
through to the proxy (which 404s and lands on emoji). Defense in
depth.

## Why proxy (not Vercel Blob re-host)

Decided in brainstorm. At 100→1000 users on Vercel Hobby, the proxy
is the smaller ship: zero schema changes, zero new tRPC payload
fields, zero bot-side sync hooks. The trade-off is cold-region
first-paint latency (~300–600 ms) and CDN cache being keyed per
viewer. Both fine at our scale.

If we cross ~1500 users we migrate to Blob — proxy → Blob is
mechanical (add column, change `<img src>`). No reason to pay
schema cost up front.

## Constraints

- **Bot token must never leave the lambda function.** No URL of the
  form `api.telegram.org/file/bot<TOKEN>/*` may appear in any
  response body, redirect target, or error message returned to a
  client. Applies to both user and chat photos.
- **No DB schema changes.** No `User.photoUrl`, no migrations.
- **No new tRPC procedures.** Existing
  `telegram.getUserProfilePhotoUrl` stub gets deleted; existing
  `telegram.getChat` keeps working but stops returning the leaky
  `photoUrl` field.
- **Hobby tier safe through 1000 users.** See cost section.
- **Emoji fallback for users unchanged** — when the proxy returns
  401/403/404/5xx the component falls through to
  `getAnimalAvatarEmoji`.
- **Default placeholder for groups** — when the chat-photo proxy
  returns 404 (chat has no photo) the avatar slot shows a neutral
  placeholder card, not the existing
  `https://xelene.me/telegram.gif` unicorn (that URL is a leftover
  default and isn't worth preserving).

## Non-goals

- Re-hosting photos to Vercel Blob (Option B).
- Active photo-change detection (relies on CDN TTL — see staleness
  section).
- Image transcoding / resize / WebP.
- Adding `User.photoUrl` to any tRPC member payload.
- Refreshing the chat title separately from the avatar (the existing
  `tChatData?.title` flow stays untouched).

## Surfaces

### 1. Lambda — `apps/lambda/api/avatar.ts` (new, ~80 LOC)

Express router mounted at `/api/avatar`:

- `GET /:userId` — TMA initData auth, shared-chat authz, fetches
  `getUserProfilePhotos(userId, 0, 1)` + `getFile(big_file_id)`,
  streams JPEG bytes.

```ts
// apps/lambda/api/avatar.ts
import { Router } from "express";
import { Telegram } from "telegraf";
import { prisma } from "@dko/database";
import {
  validate as validateInitData,
  parse as parseInitData,
} from "@telegram-apps/init-data-node";
import { env } from "./env.js";

const router = Router();
const teleBot = new Telegram(env.TELEGRAM_BOT_TOKEN);

router.get("/:userId", async (req, res) => {
  // 1. Auth — TMA initData (header OR query string for <img>)
  const initData =
    req.header("authorization")?.replace(/^tma /, "") ??
    (req.query.auth as string | undefined);
  if (!initData) return res.status(401).end();
  let callerId: number;
  try {
    validateInitData(initData, env.TELEGRAM_BOT_TOKEN);
    callerId = parseInitData(initData).user!.id;
  } catch {
    return res.status(401).end();
  }

  // 2. Authz — caller and target share a chat (self-lookup ok)
  const targetId = BigInt(req.params.userId);
  if (BigInt(callerId) !== targetId) {
    const shared = await prisma.chat.findFirst({
      where: {
        members: { some: { id: BigInt(callerId) } },
        AND: { members: { some: { id: targetId } } },
      },
      select: { id: true },
    });
    if (!shared) return res.status(403).end();
  }

  // 3. Telegram fetch — token URL stays inside this function
  let bytes: Buffer;
  try {
    const photos = await teleBot.getUserProfilePhotos(
      Number(targetId),
      0,
      1,
    );
    const biggest = photos.photos[0]?.at(-1);
    if (!biggest) {
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
      return res.status(404).end();
    }
    const fileLink = await teleBot.getFileLink(biggest.file_id);
    const upstream = await fetch(fileLink.toString());
    if (!upstream.ok) return res.status(502).end();
    bytes = Buffer.from(await upstream.arrayBuffer());
  } catch (err) {
    console.warn("avatar fetch failed", { targetId: targetId.toString(), err });
    return res.status(502).end();
  }

  // 4. Stream + cache
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader(
    "Cache-Control",
    "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
  );
  res.status(200).send(bytes);
});

export default router;
```

### 2. Lambda — `apps/lambda/api/chat-photo.ts` (new, ~70 LOC)

Same shape as `avatar.ts`, with two differences:

- **Authz:** caller must be a member of the chat (not "share a chat
  with target").
- **Fetch:** `getChat(chatId)` → `chat.photo.big_file_id` →
  `getFile`.

```ts
// apps/lambda/api/chat-photo.ts
import { Router } from "express";
import { Telegram } from "telegraf";
import { prisma } from "@dko/database";
import {
  validate as validateInitData,
  parse as parseInitData,
} from "@telegram-apps/init-data-node";
import { env } from "./env.js";

const router = Router();
const teleBot = new Telegram(env.TELEGRAM_BOT_TOKEN);

router.get("/:chatId", async (req, res) => {
  const initData =
    req.header("authorization")?.replace(/^tma /, "") ??
    (req.query.auth as string | undefined);
  if (!initData) return res.status(401).end();
  let callerId: number;
  try {
    validateInitData(initData, env.TELEGRAM_BOT_TOKEN);
    callerId = parseInitData(initData).user!.id;
  } catch {
    return res.status(401).end();
  }

  // Authz — caller is a member of the chat
  const chatId = BigInt(req.params.chatId);
  const member = await prisma.chat.findFirst({
    where: { id: chatId, members: { some: { id: BigInt(callerId) } } },
    select: { id: true },
  });
  if (!member) return res.status(403).end();

  // Telegram fetch
  let bytes: Buffer;
  try {
    const chat = await teleBot.getChat(Number(chatId));
    const bigFileId = (chat as { photo?: { big_file_id?: string } }).photo
      ?.big_file_id;
    if (!bigFileId) {
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
      return res.status(404).end();
    }
    const fileLink = await teleBot.getFileLink(bigFileId);
    const upstream = await fetch(fileLink.toString());
    if (!upstream.ok) return res.status(502).end();
    bytes = Buffer.from(await upstream.arrayBuffer());
  } catch (err) {
    console.warn("chat-photo fetch failed", { chatId: chatId.toString(), err });
    return res.status(502).end();
  }

  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader(
    "Cache-Control",
    "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
  );
  res.status(200).send(bytes);
});

export default router;
```

### 3. Lambda — mount both routes in `apps/lambda/api/index.ts`

Three new lines next to the existing `router.use(...)` block:

```ts
import avatarRouter from "./avatar.js";
import chatPhotoRouter from "./chat-photo.js";
// ...
router.use("/avatar", avatarRouter);
router.use("/chat-photo", chatPhotoRouter);
```

### 4. Web — `ChatMemberAvatar.tsx` rewrite

`apps/web/src/components/ui/ChatMemberAvatar.tsx`

Three layers, in order of preference:

1. If `userId === currentUserId` and `initData.user.photo_url`
   exists → use it directly.
2. Otherwise → use `/api/avatar/:userId?auth=<initDataRaw>` proxy.
3. On any image error → emoji fallback via existing
   `getAnimalAvatarEmoji`.

```tsx
import { Avatar, type AvatarProps } from "@telegram-apps/telegram-ui";
import { useLaunchParams } from "@telegram-apps/sdk-react";
import { useState, useMemo } from "react";
import { getAnimalAvatarEmoji } from "@/utils/emoji";

const TRPC_URL = import.meta.env.VITE_TRPC_URL;
// VITE_TRPC_URL points to the lambda's /api/trpc — derive sibling
// /api/avatar base.
const AVATAR_BASE = TRPC_URL.replace(/\/api\/trpc\/?$/, "/api/avatar");

interface Props {
  userId: number;
  size?: AvatarProps["size"];
}

export function ChatMemberAvatar({ userId, size = 24 }: Props) {
  const { initDataRaw, initData } = useLaunchParams();
  const [failed, setFailed] = useState(false);

  const src = useMemo(() => {
    if (failed) return undefined;
    // Self → use the Telegram CDN URL from initData (no backend hit).
    if (initData?.user?.id === userId && initData.user.photoUrl) {
      return initData.user.photoUrl;
    }
    // Others → proxy.
    if (!initDataRaw) return undefined;
    return `${AVATAR_BASE}/${userId}?auth=${encodeURIComponent(initDataRaw)}`;
  }, [failed, initData, initDataRaw, userId]);

  return (
    <Avatar
      size={size}
      src={src}
      onError={() => setFailed(true)}
      fallbackIcon={getAnimalAvatarEmoji(String(userId))}
    />
  );
}
```

**Note on `useLaunchParams`:** the `@telegram-apps/sdk-react` API
exposes `initData` as a parsed object with camelCase fields
(`photoUrl`, not `photo_url`). The exact shape depends on SDK
version — confirm during implementation that
`initData.user.photoUrl` is the right path. If the running SDK
version exposes it differently (e.g. via a separate `useSignal`),
adapt the destructuring.

### 5. Web — `GroupPage.tsx` chat-photo wiring

`apps/web/src/components/features/Chat/GroupPage.tsx`

Two `<Avatar>` instances reference the leaky `tChatData?.photoUrl`
today (lines ~345 and ~376). Swap both to the chat-photo proxy:

```tsx
const CHAT_PHOTO_BASE = TRPC_URL.replace(
  /\/api\/trpc\/?$/,
  "/api/chat-photo",
);
const auth = encodeURIComponent(initDataRaw ?? "");
const chatPhotoSrc = `${CHAT_PHOTO_BASE}/${chatId}?auth=${auth}`;

// then both <Avatar> calls:
<Avatar size={28} src={chatPhotoSrc} onError={...} />
```

The existing `chatData.photo` fallback (a stale Telegram file_path
string defaulting to `xelene.me/telegram.gif`) is removed — it has
been a broken URL since shipping; the proxy 404 now lands on the
default Avatar placeholder.

`tChatData?.title` and `tChatData?.type` continue to work — only the
`photoUrl` field is being removed. Other consumers of
`telegram.getChat` will need to be checked (a quick grep — should
only be `GroupPage.tsx`).

### 6. tRPC — `getChat.ts` cleanup

`packages/trpc/src/routers/telegram/getChat.ts`

Remove the `getFileLink` call and the `photoUrl` field from the
return shape. The handler stops touching files entirely:

```ts
export const getChatHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Telegram,
) => {
  const chat = await teleBot.getChat(input.chatId);
  // Note: chat.photo is intentionally not surfaced — clients use
  // /api/chat-photo/:chatId to render group photos. Returning the
  // file_id here would tempt callers to construct token-bearing
  // URLs.
  const { photo: _photo, ...rest } = chat;
  return rest;
};
```

Eliminating the field from the response is the right call — there's
no legitimate client use of it, and leaving it in tempts a future
contributor to wire it back into an `<img>`.

### 7. tRPC — delete the dead user stub

`packages/trpc/src/routers/telegram/getUserProfilePhotoUrl.ts`

Delete the file. Remove its export from
`packages/trpc/src/routers/telegram/index.ts` (the router barrel).
The procedure has been returning `null` to every caller; the new
component no longer references it.

After deletion, `tsc --noEmit` in `packages/trpc` and `apps/web`
should both pass — confirms no stale callers.

## Cache strategy

Same three-cache stack for both proxy routes:

```
Browser HTTP cache (max-age: 86400s = 24h)
  ↓ miss
Vercel CDN edge (s-maxage: 604800s = 7d)
  ↓ miss
Lambda function invocation
  ↓
Telegram API (file URLs ~1h validity, irrelevant — we don't cache them)
```

`stale-while-revalidate=604800` lets the edge serve stale bytes
while a background refresh runs.

**Cache key for both routes** = full URL including
`?auth=<initDataRaw>` query string. Per-viewer cache entries; see
trade-off in "auth in URL" decision.

**Self avatar (initData CDN URL):** cached by Telegram's CDN per
their own headers (immutable, far-future). Browser caches it on
first hit.

## Photo-change staleness

A user (or chat) updates their photo — when do we show the new one?

| Surface | Worst-case staleness |
|---|---|
| Self avatar (initData) | Until next TMA launch (initData is per-launch) |
| Other-member avatar | 7 days (CDN) / 24 hours (browser) |
| Group photo | 7 days (CDN) / 24 hours (browser) |

For an expense-splitting app this is fine. If we ever need shorter
turnaround on group photos specifically (e.g. a group renames + new
photo and members get confused), we add a manual refresh action —
not in v1.

## Edge cases

| Case | Behavior |
|---|---|
| Caller is current user, initData has `photo_url` | Render initData URL directly. Lambda not involved. |
| Caller is current user, initData has no `photo_url` (privacy hidden) | Falls through to proxy → 404 → emoji. |
| Caller views another member, no shared chat (shouldn't happen) | 403, emoji fallback. |
| Member's photo is privacy-hidden | Proxy returns 404 + 1h cache. Emoji. |
| Member has no profile photo | Same: 404 + 1h cache. Emoji. |
| Bot doesn't share a chat with the target | Telegram throws — caught as 502. Emoji. |
| Caller views a chat they're not in | 403 from chat-photo proxy. Default placeholder. |
| Chat has no group photo (default Telegram unicorn) | 404 + 1h cache. Default placeholder. |
| Telegram rate-limits the bot | 502, fallback. Natural backoff via 1h negative cache. |
| `initData.user.photo_url` is set but the URL 404s (rare — Telegram CDN purge) | `onError` → falls through to proxy → may also fail → emoji. |
| User changes their TMA-visible photo mid-session | Won't update until next launch (initData is set at TMA-open time). Acceptable. |
| Cold-region first paint | ~300–600ms one-time per user × per surface × per region. |
| Network failure lambda → Telegram | 502, fallback. |

## Cost (Hobby tier headroom)

Modeling 1000 MAU at our access patterns:

**User avatars** (member lists, splits, settlements):

- ~450 K avatar `<img>` requests/mo
- Self avatars bypass the proxy via initData → ~30% reduction =
  ~315 K hitting the proxy
- Cache stack collapses miss rate to ~5% → ~16 K function
  invocations/mo

**Group avatars** (chat header + switcher):

- ~75 K avatar `<img>` requests/mo (chat header viewed once per
  session × 15 sessions × 5 page views ≈ 75K)
- Cache stack collapses to ~4 K function invocations/mo

**Total at 1000 users:**

| Resource | Hobby quota | Avatar usage | Headroom |
|---|---|---|---|
| Function invocations | 1 M / mo | ~20 K | 50× |
| Fast Data Transfer | 100 GB / mo | ~6 GB | 16× |
| Edge requests | 1 M / mo | ~390 K | 2.5× |

Edge requests is the tightest constraint — same as before, just
slightly higher because group photos add to the count. Still
comfortably under Hobby ceiling at 1000 users; escalation threshold
(50% of quota) sits at ~1300 users.

## Decision: auth in URL (`?auth=`)

Same decision as the original spec: browsers don't send custom
headers on `<img>` requests, cookies cross-origin to the lambda app
add friction, query-string auth keeps native `<img>` semantics.

Trade-off: each viewer gets their own CDN cache entry of every
avatar and every chat photo. At 1000 users × ~1000 avatars × ~10 KB
≈ 10 GB CDN storage. Vercel's CDN doesn't bill per-project storage.
Acceptable.

Both proxy routes accept either `Authorization: tma <initData>`
header or `?auth=<initData>` query.

## File map

```
apps/lambda/api/avatar.ts                              new   ~80 LOC
apps/lambda/api/chat-photo.ts                          new   ~70 LOC
apps/lambda/api/index.ts                               edit  +4 lines
apps/web/src/components/ui/ChatMemberAvatar.tsx        rewrite  ~40 LOC
apps/web/src/components/features/Chat/GroupPage.tsx    edit  swap 2 <Avatar src>
packages/trpc/src/routers/telegram/getChat.ts          edit  remove photoUrl logic
packages/trpc/src/routers/telegram/getUserProfilePhotoUrl.ts  delete
packages/trpc/src/routers/telegram/index.ts            edit  -1 export
```

8 files. No DB migrations. No new env vars.

## Test plan

### Lambda unit tests

`apps/lambda/api/avatar.test.ts` and
`apps/lambda/api/chat-photo.test.ts`:

- 401 on missing/invalid auth (both routes).
- 403 on no-shared-chat / non-member (both routes).
- 200 happy path with stubbed telegraf + fetch (both routes).
- 404 + 1h cache header on empty `photos[]` / missing `chat.photo`.
- 502 on telegraf throw.
- Avatar route: self-lookup bypasses authz check.
- Chat-photo route: caller-is-member check is required (no
  self-bypass).

### Component smoke

- `ChatMemberAvatar`: renders initData URL when caller is self and
  `photoUrl` exists; renders proxy URL otherwise; falls back to
  emoji on `onError`.

### Subagent UAT (programmable)

Curl scripts against deployed lambda preview:

- Self proxy: `GET /api/avatar/<own-id>?auth=<live-initData>` → 200 + JPEG.
- Other proxy: same with another shared-chat member's id → 200.
- 403 case: random unrelated user id → 403.
- Auth missing → 401.
- Chat-photo: `GET /api/chat-photo/<own-chat-id>?auth=…` → 200.
- Chat-photo non-member: another chat's id → 403.
- Cache: hit twice, expect `x-vercel-cache: HIT` on second.

### Manual UAT (per project convention)

Walked through via `AskUserQuestion`:

1. *Self avatar:* open a chat, confirm own avatar in member list
   shows real Telegram photo (sourced from initData — DevTools
   network tab should show the request to `t.me/i/userpic/...`,
   not to the lambda).
2. *Self with privacy:* set own profile photo privacy to "show only
   to contacts," reopen the TMA. Confirm initData `photo_url` is
   undefined and the proxy URL is used instead. (Or, if proxy also
   400s for self under privacy → emoji shows.)
3. *Other members:* same chat, confirm other members' real photos
   render via `/api/avatar/...`. Confirm a member with no photo
   (or hidden) falls back to emoji.
4. *Group photo:* chat header shows real group photo via
   `/api/chat-photo/...`. DevTools confirms no `bot<TOKEN>` URL
   anywhere on the page.
5. *Cross-surface:* expense detail modal, settlement screen,
   balance modal — confirm avatars consistent across the 21 call
   sites of `ChatMemberAvatar` (spot-check 4–5).
6. *Cache behavior:* hard-reload the TMA, confirm avatars served
   from disk cache (DevTools "from disk cache").
7. *Group with no photo:* if a test chat has no photo, confirm the
   chat-photo proxy 404s and the avatar slot shows the default
   placeholder (not the unicorn URL).
8. *Token leak audit:* DevTools Network tab on every screen with an
   avatar — confirm zero requests to `api.telegram.org/file/bot...`.

## Rollout

Single PR, deployed via existing
`.github/workflows/deploy.yml` on push to main.

**Pre-merge:** verify Vercel preview of the lambda app serves both
`/api/avatar/:userId` and `/api/chat-photo/:chatId` correctly using
the user's dev tunnel initData.

**Post-merge:** check Vercel dashboard daily for the first week —
**Edge Requests** is the ceiling. If it crosses 50% of Hobby's
1 M monthly quota, escalate to Option B (Blob re-host).

**Reversible** by reverting the PR. No flag.

## Follow-ups (not in this PR)

1. **Migration to Blob re-host** (Option B). When usage approaches
   the Hobby edge-request ceiling (~1500 users), add
   `User.photoUrl` + sync hooks, swap `<img src>` from
   `/api/avatar/:id` to `user.photoUrl`. Mechanical migration.
2. **Image transcoding.** If bandwidth becomes a budget concern,
   add Sharp resize (~96px physical) and serve WebP. Saves ~70%.
3. **Manual avatar-refresh gesture.** If photo-change staleness
   ever causes confusion, add a long-press → version-token bump in
   localStorage to force a cache miss.
