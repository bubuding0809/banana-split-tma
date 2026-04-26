# Avatars Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render real Telegram profile photos for users (self via initData, others via proxy) and group photos (via proxy) without leaking the bot token. Closes the existing token leak in `getChat.ts`.

**Architecture:** Two new Express routes on the lambda app (`/api/avatar/:userId` and `/api/chat-photo/:chatId`) that authenticate via TMA initData, authorize against shared-chat / chat-membership, fetch from Telegram server-side, and stream JPEG bytes with aggressive cache headers. The current user's own avatar comes directly from `initData.user.photoUrl` (Telegram CDN, no backend hit). `ChatMemberAvatar` becomes a three-layer component (initData → proxy → emoji). `getChat` tRPC stops returning the leaky `photoUrl` field.

**Tech Stack:** Express + supertest + vitest (lambda), telegraf (Telegram API), Prisma (`@dko/database`), `@telegram-apps/init-data-node` (server-side initData validation), `@telegram-apps/sdk-react` + `@telegram-apps/telegram-ui` (web).

**Spec:** `docs/superpowers/specs/2026-04-26-avatars-overhaul-design.md`

---

## Conventions used in this plan

- All test files mock `@telegram-apps/init-data-node` so we don't need to generate real signed initData. Real auth is exercised in manual UAT.
- All commits use conventional-commit prefixes (`feat:`, `fix:`, `chore:`, `test:`).
- Each task ends with a commit. Push at the end (Task 15).
- File paths in this plan are absolute under the repo root.

---

### Task 1: Branch off main

**Files:**
- (no file changes — branch only)

- [ ] **Step 1: Verify clean working tree**

```bash
cd /Users/bubuding/code/banana-split-tma
git status
```

Expected: `nothing to commit, working tree clean` (or only the existing `.claude/settings.local.json` modification — leave it).

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feat/avatars-overhaul
```

Expected: `Switched to a new branch 'feat/avatars-overhaul'`.

- [ ] **Step 3: Push the branch immediately so CI is set up early**

```bash
git push -u origin feat/avatars-overhaul
```

Expected: branch tracking origin.

---

### Task 2: Avatar route — auth layer (TDD)

**Files:**
- Create: `apps/lambda/api/avatar.test.ts`
- Create: `apps/lambda/api/avatar.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/lambda/api/avatar.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { validateMock, parseMock } = vi.hoisted(() => {
  process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
  process.env.API_KEY = "test-api-key";
  process.env.INTERNAL_AGENT_KEY = "test-internal-agent-key";
  return {
    validateMock: vi.fn(),
    parseMock: vi.fn(),
  };
});

vi.mock("@telegram-apps/init-data-node", () => ({
  validate: validateMock,
  parse: parseMock,
}));

vi.mock("@dko/database", () => ({
  prisma: {
    chat: { findFirst: vi.fn() },
  },
}));

vi.mock("telegraf", () => ({
  Telegram: vi.fn().mockImplementation(() => ({
    getUserProfilePhotos: vi.fn(),
    getFileLink: vi.fn(),
  })),
}));

import avatarRouter from "./avatar.js";

const app = express();
app.use("/api/avatar", avatarRouter);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/avatar/:userId — auth", () => {
  it("returns 401 when no auth header or query param", async () => {
    const res = await request(app).get("/api/avatar/123");
    expect(res.status).toBe(401);
  });

  it("returns 401 when initData signature is invalid", async () => {
    validateMock.mockImplementationOnce(() => {
      throw new Error("invalid signature");
    });
    const res = await request(app).get("/api/avatar/123?auth=bogus");
    expect(res.status).toBe(401);
  });

  it("accepts auth via query string", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    // Self-lookup, no Telegram setup → expect 404 (no photo) but NOT 401
    const res = await request(app).get("/api/avatar/123?auth=ok");
    expect(res.status).not.toBe(401);
  });

  it("accepts auth via Authorization header", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    const res = await request(app)
      .get("/api/avatar/123")
      .set("Authorization", "tma ok");
    expect(res.status).not.toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/lambda && npx vitest run api/avatar.test.ts
```

Expected: FAIL — `Cannot find module './avatar.js'`.

- [ ] **Step 3: Create minimal avatar.ts with auth layer**

Create `apps/lambda/api/avatar.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { Telegram } from "telegraf";
import { prisma } from "@dko/database";
import {
  validate as validateInitData,
  parse as parseInitData,
} from "@telegram-apps/init-data-node";
import { env } from "./env.js";

const router = Router();
const teleBot = new Telegram(env.TELEGRAM_BOT_TOKEN);

router.get("/:userId", async (req: Request, res: Response) => {
  // 1. Auth — TMA initData (header OR query string for <img>)
  const headerAuth = req.header("authorization");
  const initData =
    (headerAuth?.startsWith("tma ") ? headerAuth.slice(4) : null) ??
    (typeof req.query.auth === "string" ? req.query.auth : null);
  if (!initData) {
    return res.status(401).end();
  }
  let callerId: number;
  try {
    validateInitData(initData, env.TELEGRAM_BOT_TOKEN);
    const parsed = parseInitData(initData);
    if (!parsed.user?.id) {
      return res.status(401).end();
    }
    callerId = parsed.user.id;
  } catch {
    return res.status(401).end();
  }

  // 2. Stub for now — return 404 to satisfy auth tests.
  // Authz + Telegram fetch added in subsequent tasks.
  void callerId;
  return res.status(404).end();
});

export default router;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/lambda && npx vitest run api/avatar.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/lambda/api/avatar.ts apps/lambda/api/avatar.test.ts
git commit -m "feat(lambda): add avatar route auth layer

Stubs the new /api/avatar/:userId proxy with TMA initData auth
(header OR query-string). Authz + Telegram fetch follow.

Refs: docs/superpowers/specs/2026-04-26-avatars-overhaul-design.md"
```

---

### Task 3: Avatar route — authz layer (TDD)

**Files:**
- Modify: `apps/lambda/api/avatar.test.ts`
- Modify: `apps/lambda/api/avatar.ts`

- [ ] **Step 1: Add failing tests**

Append to the bottom of `apps/lambda/api/avatar.test.ts` (inside the file, after the existing `describe`):

```ts
import { prisma } from "@dko/database";

describe("GET /api/avatar/:userId — authz", () => {
  it("returns 403 when caller and target do not share a chat", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 100 } });
    (prisma.chat.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      null,
    );
    const res = await request(app).get("/api/avatar/200?auth=ok");
    expect(res.status).toBe(403);
  });

  it("allows self-lookup without checking shared chat", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    const findFirstMock = prisma.chat.findFirst as ReturnType<typeof vi.fn>;
    const res = await request(app).get("/api/avatar/123?auth=ok");
    expect(res.status).not.toBe(403);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("proceeds when caller and target share a chat", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 100 } });
    (prisma.chat.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 999n,
    });
    const res = await request(app).get("/api/avatar/200?auth=ok");
    // Authz passes; falls through to 404 stub for now.
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

```bash
cd apps/lambda && npx vitest run api/avatar.test.ts
```

Expected: FAIL — first authz test gets 404 instead of 403, etc.

- [ ] **Step 3: Add authz layer to avatar.ts**

Replace the stub block (`// 2. Stub for now ... return res.status(404).end();`) in `apps/lambda/api/avatar.ts` with:

```ts
  // 2. Authz — caller and target share a chat (self-lookup is always allowed)
  const targetId = BigInt(req.params.userId);
  if (BigInt(callerId) !== targetId) {
    const shared = await prisma.chat.findFirst({
      where: {
        members: { some: { id: BigInt(callerId) } },
        AND: { members: { some: { id: targetId } } },
      },
      select: { id: true },
    });
    if (!shared) {
      return res.status(403).end();
    }
  }

  // 3. Stub — Telegram fetch added next task.
  return res.status(404).end();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/lambda && npx vitest run api/avatar.test.ts
```

Expected: PASS — all auth + authz tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/lambda/api/avatar.ts apps/lambda/api/avatar.test.ts
git commit -m "feat(lambda): add avatar route authz layer

Caller and target must share a chat. Self-lookup bypasses the check."
```

---

### Task 4: Avatar route — Telegram fetch + cache headers (TDD)

**Files:**
- Modify: `apps/lambda/api/avatar.test.ts`
- Modify: `apps/lambda/api/avatar.ts`

- [ ] **Step 1: Add failing tests**

Append to `apps/lambda/api/avatar.test.ts`:

```ts
import { Telegram } from "telegraf";

describe("GET /api/avatar/:userId — Telegram fetch", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  function setupTelegramMock(opts: {
    photos?: { file_id: string; file_unique_id: string }[][];
    getFileLink?: () => Promise<{ toString: () => string } | URL>;
  }) {
    const TelegramMock = Telegram as unknown as ReturnType<typeof vi.fn>;
    TelegramMock.mockImplementation(() => ({
      getUserProfilePhotos: vi.fn().mockResolvedValue({
        photos: opts.photos ?? [],
      }),
      getFileLink:
        opts.getFileLink ??
        vi.fn().mockResolvedValue(new URL("https://api.telegram.org/file/botX/path.jpg")),
    }));
  }

  it("returns 404 with 1h cache when user has no photos", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    setupTelegramMock({ photos: [] });
    const res = await request(app).get("/api/avatar/123?auth=ok");
    expect(res.status).toBe(404);
    expect(res.header["cache-control"]).toMatch(/max-age=3600/);
    expect(res.header["cache-control"]).toMatch(/s-maxage=3600/);
  });

  it("returns 200 + JPEG with long cache on happy path", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    setupTelegramMock({
      photos: [
        [
          { file_id: "small", file_unique_id: "u-s" },
          { file_id: "big", file_unique_id: "u-b" },
        ],
      ],
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () =>
        Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff]).buffer),
    });
    const res = await request(app).get("/api/avatar/123?auth=ok");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toMatch(/image\/jpeg/);
    expect(res.header["cache-control"]).toMatch(/max-age=86400/);
    expect(res.header["cache-control"]).toMatch(/s-maxage=604800/);
    expect(res.header["cache-control"]).toMatch(/stale-while-revalidate=604800/);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("picks the largest size variant", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    const getFileLinkMock = vi.fn().mockResolvedValue(
      new URL("https://api.telegram.org/file/botX/path.jpg"),
    );
    const TelegramMock = Telegram as unknown as ReturnType<typeof vi.fn>;
    TelegramMock.mockImplementation(() => ({
      getUserProfilePhotos: vi.fn().mockResolvedValue({
        photos: [
          [
            { file_id: "small", file_unique_id: "u-s" },
            { file_id: "medium", file_unique_id: "u-m" },
            { file_id: "big", file_unique_id: "u-b" },
          ],
        ],
      }),
      getFileLink: getFileLinkMock,
    }));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([0xff]).buffer),
    });
    await request(app).get("/api/avatar/123?auth=ok");
    expect(getFileLinkMock).toHaveBeenCalledWith("big");
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

```bash
cd apps/lambda && npx vitest run api/avatar.test.ts
```

Expected: FAIL — happy path returns 404 from stub, etc.

- [ ] **Step 3: Replace the stub with the Telegram fetch implementation**

Replace `// 3. Stub — Telegram fetch added next task. \n return res.status(404).end();` in `apps/lambda/api/avatar.ts` with:

```ts
  // 3. Telegram fetch — token URL stays inside this function
  let bytes: Buffer;
  try {
    const photos = await teleBot.getUserProfilePhotos(Number(targetId), 0, 1);
    const biggest = photos.photos[0]?.at(-1);
    if (!biggest) {
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
      return res.status(404).end();
    }
    const fileLink = await teleBot.getFileLink(biggest.file_id);
    const upstream = await fetch(fileLink.toString());
    if (!upstream.ok) {
      return res.status(502).end();
    }
    bytes = Buffer.from(await upstream.arrayBuffer());
  } catch (err) {
    console.warn("avatar fetch failed", {
      targetId: targetId.toString(),
      err,
    });
    return res.status(502).end();
  }

  // 4. Stream + cache
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader(
    "Cache-Control",
    "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
  );
  return res.status(200).send(bytes);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/lambda && npx vitest run api/avatar.test.ts
```

Expected: PASS — all 9-10 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/lambda/api/avatar.ts apps/lambda/api/avatar.test.ts
git commit -m "feat(lambda): wire avatar route Telegram fetch + cache headers

getUserProfilePhotos -> getFile -> stream JPEG bytes with
Cache-Control max-age=86400, s-maxage=604800, swr=604800.
404 + 1h cache for users with no photo (or privacy-hidden).
Bot token URL stays inside the function — never returned."
```

---

### Task 5: Avatar route — error paths (TDD)

**Files:**
- Modify: `apps/lambda/api/avatar.test.ts`

- [ ] **Step 1: Add failing tests for error scenarios**

Append to `apps/lambda/api/avatar.test.ts`:

```ts
describe("GET /api/avatar/:userId — error paths", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  it("returns 502 when telegraf throws", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    const TelegramMock = Telegram as unknown as ReturnType<typeof vi.fn>;
    TelegramMock.mockImplementation(() => ({
      getUserProfilePhotos: vi.fn().mockRejectedValue(new Error("flood wait")),
      getFileLink: vi.fn(),
    }));
    const res = await request(app).get("/api/avatar/123?auth=ok");
    expect(res.status).toBe(502);
  });

  it("returns 502 when upstream fetch fails", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    const TelegramMock = Telegram as unknown as ReturnType<typeof vi.fn>;
    TelegramMock.mockImplementation(() => ({
      getUserProfilePhotos: vi.fn().mockResolvedValue({
        photos: [[{ file_id: "big", file_unique_id: "u-b" }]],
      }),
      getFileLink: vi
        .fn()
        .mockResolvedValue(new URL("https://api.telegram.org/file/botX/p.jpg")),
    }));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const res = await request(app).get("/api/avatar/123?auth=ok");
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

The error-path implementation already lives in Task 4's code (`try/catch` and `if (!upstream.ok)`). These tests should pass without code changes — they verify behavior, not add it.

```bash
cd apps/lambda && npx vitest run api/avatar.test.ts
```

Expected: PASS — error tests green.

- [ ] **Step 3: Commit**

```bash
git add apps/lambda/api/avatar.test.ts
git commit -m "test(lambda): cover avatar route error paths

Verifies 502 on telegraf throw and on upstream fetch failure."
```

---

### Task 6: Chat-photo route — auth + authz (TDD)

**Files:**
- Create: `apps/lambda/api/chat-photo.test.ts`
- Create: `apps/lambda/api/chat-photo.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/lambda/api/chat-photo.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { validateMock, parseMock } = vi.hoisted(() => {
  process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
  process.env.API_KEY = "test-api-key";
  process.env.INTERNAL_AGENT_KEY = "test-internal-agent-key";
  return {
    validateMock: vi.fn(),
    parseMock: vi.fn(),
  };
});

vi.mock("@telegram-apps/init-data-node", () => ({
  validate: validateMock,
  parse: parseMock,
}));

vi.mock("@dko/database", () => ({
  prisma: {
    chat: { findFirst: vi.fn() },
  },
}));

vi.mock("telegraf", () => ({
  Telegram: vi.fn().mockImplementation(() => ({
    getChat: vi.fn(),
    getFileLink: vi.fn(),
  })),
}));

import chatPhotoRouter from "./chat-photo.js";
import { prisma } from "@dko/database";

const app = express();
app.use("/api/chat-photo", chatPhotoRouter);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/chat-photo/:chatId — auth + authz", () => {
  it("returns 401 when no auth", async () => {
    const res = await request(app).get("/api/chat-photo/-1001");
    expect(res.status).toBe(401);
  });

  it("returns 401 when initData signature invalid", async () => {
    validateMock.mockImplementationOnce(() => {
      throw new Error("invalid");
    });
    const res = await request(app).get("/api/chat-photo/-1001?auth=bogus");
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not a member of the chat", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 100 } });
    (prisma.chat.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      null,
    );
    const res = await request(app).get("/api/chat-photo/-1001?auth=ok");
    expect(res.status).toBe(403);
  });

  it("proceeds when caller is a member of the chat", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 100 } });
    (prisma.chat.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: -1001n,
    });
    const res = await request(app).get("/api/chat-photo/-1001?auth=ok");
    // Authz passes; falls through to 404 stub for now.
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/lambda && npx vitest run api/chat-photo.test.ts
```

Expected: FAIL — `Cannot find module './chat-photo.js'`.

- [ ] **Step 3: Create chat-photo.ts with auth + authz + 404 stub**

Create `apps/lambda/api/chat-photo.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { Telegram } from "telegraf";
import { prisma } from "@dko/database";
import {
  validate as validateInitData,
  parse as parseInitData,
} from "@telegram-apps/init-data-node";
import { env } from "./env.js";

const router = Router();
const teleBot = new Telegram(env.TELEGRAM_BOT_TOKEN);

router.get("/:chatId", async (req: Request, res: Response) => {
  // 1. Auth — TMA initData (header OR query string)
  const headerAuth = req.header("authorization");
  const initData =
    (headerAuth?.startsWith("tma ") ? headerAuth.slice(4) : null) ??
    (typeof req.query.auth === "string" ? req.query.auth : null);
  if (!initData) {
    return res.status(401).end();
  }
  let callerId: number;
  try {
    validateInitData(initData, env.TELEGRAM_BOT_TOKEN);
    const parsed = parseInitData(initData);
    if (!parsed.user?.id) {
      return res.status(401).end();
    }
    callerId = parsed.user.id;
  } catch {
    return res.status(401).end();
  }

  // 2. Authz — caller is a member of the chat (no self-bypass)
  const chatId = BigInt(req.params.chatId);
  const member = await prisma.chat.findFirst({
    where: {
      id: chatId,
      members: { some: { id: BigInt(callerId) } },
    },
    select: { id: true },
  });
  if (!member) {
    return res.status(403).end();
  }

  // 3. Stub — Telegram fetch added next task.
  void teleBot;
  return res.status(404).end();
});

export default router;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/lambda && npx vitest run api/chat-photo.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/lambda/api/chat-photo.ts apps/lambda/api/chat-photo.test.ts
git commit -m "feat(lambda): add chat-photo route auth + authz

New /api/chat-photo/:chatId stub. Caller must be a member of the
chat. Telegram fetch follows."
```

---

### Task 7: Chat-photo route — Telegram fetch + cache (TDD)

**Files:**
- Modify: `apps/lambda/api/chat-photo.test.ts`
- Modify: `apps/lambda/api/chat-photo.ts`

- [ ] **Step 1: Add failing tests**

Append to `apps/lambda/api/chat-photo.test.ts`:

```ts
import { Telegram } from "telegraf";

describe("GET /api/chat-photo/:chatId — Telegram fetch", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  function setupTelegramMock(opts: {
    chat: { photo?: { big_file_id?: string } };
  }) {
    const TelegramMock = Telegram as unknown as ReturnType<typeof vi.fn>;
    TelegramMock.mockImplementation(() => ({
      getChat: vi.fn().mockResolvedValue(opts.chat),
      getFileLink: vi
        .fn()
        .mockResolvedValue(new URL("https://api.telegram.org/file/botX/p.jpg")),
    }));
  }

  it("returns 404 with 1h cache when chat has no photo", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 100 } });
    (prisma.chat.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: -1001n,
    });
    setupTelegramMock({ chat: {} });
    const res = await request(app).get("/api/chat-photo/-1001?auth=ok");
    expect(res.status).toBe(404);
    expect(res.header["cache-control"]).toMatch(/max-age=3600/);
  });

  it("returns 200 + JPEG with long cache on happy path", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 100 } });
    (prisma.chat.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: -1001n,
    });
    setupTelegramMock({ chat: { photo: { big_file_id: "big" } } });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () =>
        Promise.resolve(new Uint8Array([0xff, 0xd8]).buffer),
    });
    const res = await request(app).get("/api/chat-photo/-1001?auth=ok");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toMatch(/image\/jpeg/);
    expect(res.header["cache-control"]).toMatch(/max-age=86400/);
    expect(res.header["cache-control"]).toMatch(/s-maxage=604800/);
  });

  it("returns 502 when telegraf throws", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 100 } });
    (prisma.chat.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: -1001n,
    });
    const TelegramMock = Telegram as unknown as ReturnType<typeof vi.fn>;
    TelegramMock.mockImplementation(() => ({
      getChat: vi.fn().mockRejectedValue(new Error("flood")),
      getFileLink: vi.fn(),
    }));
    const res = await request(app).get("/api/chat-photo/-1001?auth=ok");
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/lambda && npx vitest run api/chat-photo.test.ts
```

Expected: FAIL — happy path returns 404 from stub.

- [ ] **Step 3: Replace stub in chat-photo.ts with Telegram fetch**

Replace the stub block (`// 3. Stub — Telegram fetch added next task. \n void teleBot; \n return res.status(404).end();`) in `apps/lambda/api/chat-photo.ts` with:

```ts
  // 3. Telegram fetch — token URL stays inside this function
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
    if (!upstream.ok) {
      return res.status(502).end();
    }
    bytes = Buffer.from(await upstream.arrayBuffer());
  } catch (err) {
    console.warn("chat-photo fetch failed", {
      chatId: chatId.toString(),
      err,
    });
    return res.status(502).end();
  }

  // 4. Stream + cache
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader(
    "Cache-Control",
    "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
  );
  return res.status(200).send(bytes);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/lambda && npx vitest run api/chat-photo.test.ts
```

Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/lambda/api/chat-photo.ts apps/lambda/api/chat-photo.test.ts
git commit -m "feat(lambda): wire chat-photo route Telegram fetch + cache

getChat -> getFile -> stream JPEG bytes with the same cache
strategy as user avatars. 404 + 1h cache for chats with no photo.
Bot token URL stays inside the function — never returned."
```

---

### Task 8: Mount both routes on the lambda app

**Files:**
- Modify: `apps/lambda/api/index.ts`

- [ ] **Step 1: Inspect current router mounting**

```bash
grep -n "router.use" /Users/bubuding/code/banana-split-tma/apps/lambda/api/index.ts
```

Expected: existing `router.use("/trpc", ...)`, `router.use("/rest", ...)`, `router.use("/internal", ...)`.

- [ ] **Step 2: Add imports**

In `apps/lambda/api/index.ts`, after the existing `import recurringExpenseTickRouter from "./recurring-expense-tick.js";` line (around line 24), add:

```ts
import avatarRouter from "./avatar.js";
import chatPhotoRouter from "./chat-photo.js";
```

- [ ] **Step 3: Mount the routes**

After the existing `router.use("/internal", express.json({ limit: "1mb" }), recurringExpenseTickRouter);` block (around line 154-158), add:

```ts
router.use("/avatar", avatarRouter);
router.use("/chat-photo", chatPhotoRouter);
```

- [ ] **Step 4: Verify type check passes**

```bash
cd apps/lambda && npx tsc --noEmit
```

Expected: clean exit (no errors).

- [ ] **Step 5: Run lambda tests to confirm nothing regressed**

```bash
cd apps/lambda && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/lambda/api/index.ts
git commit -m "feat(lambda): mount avatar and chat-photo routes

Mounts the new /api/avatar/:userId and /api/chat-photo/:chatId
proxy routes on the express app."
```

---

### Task 9: Strip `photoUrl` from `getChat` tRPC handler

**Files:**
- Modify: `packages/trpc/src/routers/telegram/getChat.ts`

- [ ] **Step 1: Replace the handler body**

Open `packages/trpc/src/routers/telegram/getChat.ts` and replace the entire `getChatHandler` function (lines 8-29 of the current file) with:

```ts
export const getChatHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Telegram,
) => {
  const chat = await teleBot.getChat(input.chatId);
  // chat.photo is intentionally not surfaced — clients use
  // /api/chat-photo/:chatId to render group photos. Returning the
  // file_id here would tempt callers to construct token-bearing URLs.
  const { photo: _photo, ...rest } = chat;
  return rest;
};
```

The complete file should now be:

```ts
import { z } from "zod";
import { protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { Telegram } from "telegraf";

const inputSchema = z.object({ chatId: z.number() });

export const getChatHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Telegram,
) => {
  const chat = await teleBot.getChat(input.chatId);
  // chat.photo is intentionally not surfaced — clients use
  // /api/chat-photo/:chatId to render group photos. Returning the
  // file_id here would tempt callers to construct token-bearing URLs.
  const { photo: _photo, ...rest } = chat;
  return rest;
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    return getChatHandler(input, ctx.teleBot);
  });
```

- [ ] **Step 2: Verify package type check passes**

```bash
cd packages/trpc && npx tsc --noEmit
```

Expected: clean exit. (If callers reference `tChatData.photoUrl` they'll fail in a later step — that's the web surface fix in Task 12.)

- [ ] **Step 3: Commit**

```bash
git add packages/trpc/src/routers/telegram/getChat.ts
git commit -m "fix(trpc): stop returning bot-token-bearing photoUrl from getChat

The previous handler called teleBot.getFileLink(big_file_id) and
returned the resulting URL — which contained the bot token in its
path — to the client. Anyone with DevTools could read the token.

Strip the photo field entirely; clients use /api/chat-photo/:chatId
to render group photos via the new lambda proxy."
```

---

### Task 10: Delete `getUserProfilePhotoUrl` stub

**Files:**
- Delete: `packages/trpc/src/routers/telegram/getUserProfilePhotoUrl.ts`
- Modify: `packages/trpc/src/routers/telegram/index.ts`

- [ ] **Step 1: Delete the stub file**

```bash
rm /Users/bubuding/code/banana-split-tma/packages/trpc/src/routers/telegram/getUserProfilePhotoUrl.ts
```

- [ ] **Step 2: Remove the import + router entry**

In `packages/trpc/src/routers/telegram/index.ts`:

- Remove the line `import getUserProfilePhotoUrl from "./getUserProfilePhotoUrl.js";`
- Remove the line `getUserProfilePhotoUrl,` from inside `createTRPCRouter({ ... })`.

The complete file should be:

```ts
import { createTRPCRouter } from "../../trpc.js";
import getChat from "./getChat.js";
import getChatMember from "./getChatMember.js";
import sendMessage from "./sendMessage.js";
import sendDebtReminderMessage from "./sendDebtReminderMessage.js";
import sendSettlementNotificationMessage from "./sendSettlementNotificationMessage.js";
import sendExpenseNotificationMessage from "./sendExpenseNotificationMessage.js";
import sendGroupReminderMessage from "./sendGroupReminderMessage.js";

export const telegramRouter = createTRPCRouter({
  getChat,
  getChatMember,
  sendMessage,
  sendDebtReminderMessage,
  sendSettlementNotificationMessage,
  sendExpenseNotificationMessage,
  sendGroupReminderMessage,
});
```

- [ ] **Step 3: Verify trpc package type check still passes**

```bash
cd packages/trpc && npx tsc --noEmit
```

Expected: clean exit. (Web side will fail at this point — fixed in Task 11.)

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/src/routers/telegram/getUserProfilePhotoUrl.ts packages/trpc/src/routers/telegram/index.ts
git commit -m "chore(trpc): delete dead getUserProfilePhotoUrl stub

The procedure has been returning null since the previous user-avatar
attempt was rolled back due to a token leak. The new web component
reads photos via /api/avatar/:userId proxy and initData."
```

---

### Task 11: Rewrite `ChatMemberAvatar` with three-layer logic

**Files:**
- Modify: `apps/web/src/components/ui/ChatMemberAvatar.tsx`

- [ ] **Step 1: Replace the component**

Overwrite `apps/web/src/components/ui/ChatMemberAvatar.tsx` with:

```tsx
import { getAnimalAvatarEmoji } from "@/utils/emoji";
import { Avatar, ImageProps } from "@telegram-apps/telegram-ui";
import {
  initData,
  initDataRaw,
  useSignal,
} from "@telegram-apps/sdk-react";
import { useMemo, useState } from "react";

const TRPC_URL = import.meta.env.VITE_TRPC_URL;
// VITE_TRPC_URL points to the lambda's /api/trpc — derive the
// sibling /api/avatar base.
const AVATAR_BASE = TRPC_URL
  ? TRPC_URL.replace(/\/api\/trpc\/?$/, "/api/avatar")
  : "/api/avatar";

interface ChatMemberProps {
  userId: number;
  size?: ImageProps["size"];
}

const ChatMemberAvatar = ({ userId, size = 24 }: ChatMemberProps) => {
  const tUser = useSignal(initData.user);
  const rawAuth = initDataRaw();
  const [failed, setFailed] = useState(false);

  const src = useMemo<string | undefined>(() => {
    if (failed) return undefined;
    // Self → use the Telegram CDN URL from initData (no backend hit).
    if (tUser?.id === userId && tUser.photoUrl) {
      return tUser.photoUrl;
    }
    // Others → proxy. Drop out if we can't authenticate.
    if (!rawAuth) return undefined;
    return `${AVATAR_BASE}/${userId}?auth=${encodeURIComponent(rawAuth)}`;
  }, [failed, tUser, rawAuth, userId]);

  if (!src) {
    return (
      <Avatar size={size}>{getAnimalAvatarEmoji(userId.toString())}</Avatar>
    );
  }

  return (
    <Avatar
      size={size}
      src={src}
      onError={() => setFailed(true)}
      fallbackIcon={getAnimalAvatarEmoji(userId.toString())}
    />
  );
};

export default ChatMemberAvatar;
```

- [ ] **Step 2: Verify web type check passes**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.app.json
```

Expected: clean exit.

If it fails complaining about `tUser.photoUrl` not existing, the SDK signal type is different in this version — fall back to optional chaining: `(tUser as { photoUrl?: string } | null)?.photoUrl`.

- [ ] **Step 3: Run any existing component tests**

```bash
cd apps/web && npx vitest run components/ui
```

Expected: PASS (or "no tests found", which is fine).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/ChatMemberAvatar.tsx
git commit -m "feat(web): wire ChatMemberAvatar to real photos

Three layers:
1. Self -> initData.user.photoUrl (Telegram CDN, no backend hit)
2. Others -> /api/avatar/:userId proxy (token-safe)
3. onError -> existing animal emoji fallback

Drops the dead trpc.telegram.getUserProfilePhotoUrl query."
```

---

### Task 12: Update `GroupPage.tsx` chat-photo srcs

**Files:**
- Modify: `apps/web/src/components/features/Chat/GroupPage.tsx`

- [ ] **Step 1: Add the chat-photo URL helper near the top of the component**

Find the imports section of `apps/web/src/components/features/Chat/GroupPage.tsx`. Confirm it already imports `initDataRaw` from `@telegram-apps/sdk-react`; if not, add to the existing SDK import:

```tsx
import { initDataRaw } from "@telegram-apps/sdk-react";
```

After the existing `chatId` extraction inside the component body (search for `const chatId = ` near the top of the function), add:

```tsx
const TRPC_URL = import.meta.env.VITE_TRPC_URL;
const CHAT_PHOTO_BASE = TRPC_URL
  ? TRPC_URL.replace(/\/api\/trpc\/?$/, "/api/chat-photo")
  : "/api/chat-photo";
const rawAuth = initDataRaw();
const chatPhotoSrc = rawAuth
  ? `${CHAT_PHOTO_BASE}/${chatId}?auth=${encodeURIComponent(rawAuth)}`
  : undefined;
```

- [ ] **Step 2: Replace the two `<Avatar src=...>` instances**

Find line ~345:

```tsx
<Avatar size={28} src={tChatData?.photoUrl?.href} />
```

Replace with:

```tsx
<Avatar size={28} src={chatPhotoSrc} />
```

Find line ~376:

```tsx
src={tChatData?.photoUrl?.toString() ?? chatData.photo}
```

Replace with:

```tsx
src={chatPhotoSrc}
```

(Keep all other props on those `<Avatar>` elements — only the `src` value changes.)

- [ ] **Step 3: Verify the web app type-checks**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.app.json
```

Expected: clean exit. The `tChatData?.photoUrl` references are gone, matching the tRPC change in Task 9.

- [ ] **Step 4: Quick grep to confirm no other consumers of `tChatData?.photoUrl`**

```bash
grep -rn "photoUrl" /Users/bubuding/code/banana-split-tma/apps/web/src 2>/dev/null
```

Expected: only the legitimate `tUser.photoUrl` reference in `ChatMemberAvatar.tsx` from Task 11. If any other file references `tChatData?.photoUrl`, fix it the same way (replace with `chatPhotoSrc`-style URL).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Chat/GroupPage.tsx
git commit -m "feat(web): render group photos via /api/chat-photo proxy

Both <Avatar src=...> instances in GroupPage now point to the
new chat-photo proxy URL on the lambda. Drops the leaky
tChatData?.photoUrl reference (which exposed the bot token)
and the now-dead chatData.photo fallback."
```

---

### Task 13: Cross-package type check + lint

**Files:**
- (no file changes — verification only)

- [ ] **Step 1: Type-check the whole monorepo touch path**

```bash
cd /Users/bubuding/code/banana-split-tma
pnpm --filter lambda check-types && pnpm --filter web check-types && pnpm --filter @dko/trpc check-types
```

Expected: all three pass cleanly.

If `pnpm` filter syntax differs from this repo, fall back to:

```bash
cd apps/lambda && npx tsc --noEmit && \
cd ../web && npx tsc --noEmit -p tsconfig.app.json && \
cd ../../packages/trpc && npx tsc --noEmit
```

- [ ] **Step 2: Run all lambda tests one more time**

```bash
cd apps/lambda && npx vitest run
```

Expected: all PASS, including avatar + chat-photo new test files.

- [ ] **Step 3: Lint the changed files**

```bash
cd /Users/bubuding/code/banana-split-tma
npx eslint apps/lambda/api/avatar.ts apps/lambda/api/avatar.test.ts apps/lambda/api/chat-photo.ts apps/lambda/api/chat-photo.test.ts apps/lambda/api/index.ts apps/web/src/components/ui/ChatMemberAvatar.tsx apps/web/src/components/features/Chat/GroupPage.tsx packages/trpc/src/routers/telegram/getChat.ts packages/trpc/src/routers/telegram/index.ts
```

Expected: no errors. Fix any flagged issues in-place.

- [ ] **Step 4: Confirm no `bot<TOKEN>` URLs remain in the codebase paths we changed**

```bash
grep -rn "getFileLink\|api.telegram.org/file/bot" /Users/bubuding/code/banana-split-tma/apps/web/src /Users/bubuding/code/banana-split-tma/packages/trpc/src 2>/dev/null
```

Expected: zero results. All `getFileLink` callers now live inside `apps/lambda/api/` (the proxy routes), where the URL is safely consumed and never returned.

- [ ] **Step 5: Commit any lint fixes**

```bash
git status
# If anything was modified by lint:
git add <files>
git commit -m "chore: lint fixes for avatars-overhaul"
```

If nothing changed, skip the commit.

---

### Task 14: Open the PR

**Files:**
- (no file changes — git/GitHub only)

- [ ] **Step 1: Push the branch**

```bash
cd /Users/bubuding/code/banana-split-tma
git push
```

Expected: branch pushed to origin.

- [ ] **Step 2: Open PR with merge-readiness ask for @claude**

Per project convention (tag @claude on every PR with merge-readiness verdict — see auto-memory):

```bash
gh pr create --title "feat: real avatars + close group-photo token leak" --body "$(cat <<'EOF'
## Summary

Implements [Avatars Overhaul spec](docs/superpowers/specs/2026-04-26-avatars-overhaul-design.md).

- **Self avatar** → uses `initData.user.photoUrl` directly (Telegram CDN, no backend hit).
- **Other members' avatars** → new `/api/avatar/:userId` proxy on the lambda; bot token stays server-side.
- **Group photos** → new `/api/chat-photo/:chatId` proxy. **Closes a token leak that ships in production today** in `getChat.ts`.

## What changed

- `apps/lambda/api/avatar.ts` (new) + `chat-photo.ts` (new) — Express routes with TMA initData auth, shared-chat / membership authz, and a 24h browser / 7d CDN cache.
- `apps/lambda/api/index.ts` — mount the two routes.
- `ChatMemberAvatar.tsx` rewrite — three-layer logic (initData → proxy → emoji).
- `GroupPage.tsx` — both `<Avatar src>` references now point at `/api/chat-photo`.
- `getChat.ts` — strips the `photoUrl` field (was returning a bot-token-bearing URL).
- `getUserProfilePhotoUrl.ts` — deleted (was a `null` stub).

No DB migrations, no new env vars, no new tRPC procedures.

## Test plan

- [x] Unit: `avatar.test.ts` + `chat-photo.test.ts` cover auth, authz, happy path, 404, 502.
- [ ] Manual UAT walked through via AskUserQuestion (self / others / group / privacy fallback / token-leak audit in DevTools).

## Token-leak audit

After this lands, every screen with an avatar should show **zero** requests to `api.telegram.org/file/bot...` in DevTools' Network tab. Verify on a group page (chat header + member list) and on an expense detail modal.

@claude verify merge-readiness — verdict (READY / NEEDS CHANGES / UNCERTAIN) per spec compliance, security (no token egress), and the test plan. Pause for user UAT before auto-merge — this PR touches a live security issue.
EOF
)"
```

- [ ] **Step 3: Capture the PR URL**

```bash
gh pr view --json url --jq .url
```

Expected: prints the PR URL. Share with the user.

- [ ] **Step 4: Do NOT enable auto-merge yet**

Per the *Don't arm auto-merge before UAT* preference: this PR is a security fix with user-visible behavior changes. Wait for user "ok merge" before:

```bash
# DO NOT RUN until user explicitly approves:
# gh pr merge --auto --squash --delete-branch
```

---

### Task 15: Manual UAT walk-through (post-PR)

**Files:**
- (no file changes — UAT only)

- [ ] **Step 1: Wait for Vercel preview deploy**

The PR triggers a preview deploy of the lambda. Wait for it; copy the preview URL.

- [ ] **Step 2: Walk the user through manual UAT**

Per the *Manual UAT via AskUserQuestion* preference, ask one step at a time:

1. *Self avatar:* "Open any chat. In the member list, do you see your own real Telegram photo (not an animal emoji)?" Verify in DevTools Network: request goes to `t.me/i/userpic/...`, NOT to the lambda.
2. *Other members:* "Same chat — are other members' real photos showing? Anyone with photo privacy = 'contacts only' should still get an emoji."
3. *Group photo:* "Chat header — real group photo rendering?"
4. *Token-leak audit:* "Open DevTools → Network. Reload. Filter by 'telegram'. Do you see ANY request to `api.telegram.org/file/bot...`? (Should be zero.)"
5. *Cross-screens:* "Open an expense detail modal, then a settlement screen. Avatars consistent?"
6. *Hard reload:* "Cmd-Shift-R. Avatars still load? DevTools → Network shows them as 'from disk cache' on second load?"
7. *Group with no photo:* if a test chat has no photo, verify the chat-photo proxy 404s and the avatar slot shows the default placeholder (not a broken image icon, not the `xelene.me/telegram.gif` unicorn).

- [ ] **Step 3: On user "ok merge" → enable auto-merge**

```bash
gh pr merge --auto --squash --delete-branch
```

Expected: auto-merge armed; CI gates run; on green, squashed merge to main + branch deleted.

- [ ] **Step 4: Post-merge — watch Edge Requests on Vercel dashboard**

Per spec: monitor Vercel project dashboard daily for the first week. If Edge Requests crosses 50% of Hobby's 1 M monthly quota at any point, flag for migration to Option B (Blob re-host).

---

## Self-review checklist

- [x] **Spec coverage:**
  - Self avatar via initData → Task 11
  - Other members via proxy → Tasks 2-5, 11
  - Group photos via proxy → Tasks 6-7, 12
  - `getChat` cleanup → Task 9
  - Dead stub deletion → Task 10
  - Cross-package type check → Task 13
  - PR + UAT + monitoring → Tasks 14-15
- [x] **No placeholders:** every step shows actual code or commands.
- [x] **Type consistency:** `chatPhotoSrc` named identically across Tasks 12 (definition + 2 usages); `AVATAR_BASE`/`CHAT_PHOTO_BASE` derived the same way; mock variable names (`validateMock`, `parseMock`, `findFirstMock`, `fetchMock`, `setupTelegramMock`) consistent across Tasks 2-7.
- [x] **TDD:** every code-bearing task starts with a failing test (Tasks 2-7); follow-up tasks (8-12) are mechanical edits where TDD doesn't add value.
- [x] **Frequent commits:** 13 commits (one per task that touches code).
