# Per-Group AI Agent Opt-In Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the bot's AI agent behind a per-group `agentEnabled` flag (default off), toggleable from a new "Bot" subpage in TMA group settings.

**Architecture:** Boolean column on `Chat` following the existing toggle pattern (`debtSimplificationEnabled`, `notifyOn*`). The bot checks the flag via its tRPC caller (`ctx.trpc.chat.getChat`) only on messages that would trigger the agent; disabled or errored lookups silently skip the agent (fail closed). TMA gets a hub row + subpage with one Switch.

**Tech Stack:** Prisma (Postgres), tRPC v11, grammY, React + TanStack Router + `@telegram-apps/telegram-ui`, vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-agent-opt-in-gate-design.md`

## Global Constraints

- Default is `false` for ALL groups, including existing rows (migration default, no backfill-to-true).
- Private DM agent path is untouched — gate applies to group chats only.
- Disabled behavior is **silent ignore**: no reply, no hint. Log `agent.gated` at info level.
- Bot gate **fails closed**: any `getChat` lookup error → agent does not run; log `agent.gate.check.failed` at error level.
- TMA UI uses `@telegram-apps/telegram-ui` components only — no inline `<div style>`, no raw `<select>`, no `window.confirm`/`alert`.
- Work on branch `feat/agent-opt-in-gate`; never commit to main. TDD: failing test before implementation.
- CLI, Raycast, MCP surfaces: no changes.

---

### Task 1: Database column + migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma:32` (Chat model)
- Create: `packages/database/prisma/migrations/<timestamp>_add_agent_enabled/migration.sql` (generated)

**Interfaces:**
- Produces: `Chat.agentEnabled: boolean` on the Prisma client (default `false`). Tasks 2–4 rely on this field name exactly.

- [ ] **Step 1: Add column to schema**

In `packages/database/prisma/schema.prisma`, inside `model Chat`, after `debtSimplificationEnabled`:

```prisma
  debtSimplificationEnabled Boolean                    @default(false)
  agentEnabled              Boolean                    @default(false)
```

- [ ] **Step 2: Generate migration**

Run (DATABASE_URL comes from direnv env):

```bash
cd packages/database && npm run db:migrate -- --name add_agent_enabled
```

Expected: new folder `prisma/migrations/<timestamp>_add_agent_enabled/` containing:

```sql
-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "agentEnabled" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Regenerate client + typecheck**

```bash
cd packages/database && npm run db:generate && npm run check-types
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma
git commit -m "feat(db): add Chat.agentEnabled column, default false"
```

---

### Task 2: tRPC — expose `agentEnabled` in updateChat/getChat

**Files:**
- Create: `packages/trpc/src/routers/chat/updateChat.test.ts`
- Modify: `packages/trpc/src/routers/chat/updateChat.ts`
- Modify: `packages/trpc/src/routers/chat/getChat.ts:28`

**Interfaces:**
- Consumes: `Chat.agentEnabled` from Task 1.
- Produces: `chat.updateChat` accepts optional `agentEnabled: boolean` and returns it; `chat.getChat` returns `agentEnabled: boolean` (spread already includes it; an explicit default line is added for parity with siblings). Tasks 3 and 4 call these procedures.

- [ ] **Step 1: Write failing tests**

Create `packages/trpc/src/routers/chat/updateChat.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { updateChatHandler } from "./updateChat.js";

const stubLog = { error: () => {} } as any;

const existingChat = {
  id: 42n,
  title: "test group",
  photo: "p",
  type: "group",
  threadId: null,
  baseCurrency: "SGD",
  debtSimplificationEnabled: false,
  agentEnabled: false,
  notifyOnExpense: true,
  notifyOnExpenseUpdate: true,
  notifyOnSettlement: true,
  notifyOnTransfer: true,
  timezone: null,
  migratedFromChatId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makeDb = () => {
  const calls: { data?: Record<string, unknown> } = {};
  const db = {
    chat: {
      findUnique: async () => existingChat,
      update: async (args: { data: Record<string, unknown> }) => {
        calls.data = args.data;
        return { ...existingChat, ...args.data };
      },
    },
  } as any;
  return { db, calls };
};

describe("updateChatHandler agentEnabled", () => {
  it("updates agentEnabled when provided", async () => {
    const { db, calls } = makeDb();
    const result = await updateChatHandler(
      { chatId: 42n, agentEnabled: true } as any,
      db,
      stubLog
    );
    expect(calls.data).toEqual({ agentEnabled: true });
    expect((result as any).agentEnabled).toBe(true);
  });

  it("leaves agentEnabled out of the update when omitted", async () => {
    const { db, calls } = makeDb();
    await updateChatHandler({ chatId: 42n, title: "renamed" } as any, db, stubLog);
    expect(calls.data).toEqual({ title: "renamed" });
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

```bash
cd packages/trpc && npx vitest run src/routers/chat/updateChat.test.ts
```

Expected: first test FAILS — `calls.data` equals `{}` because the handler ignores `agentEnabled` (input schema strips it / no plumbing). Second test may already pass.

- [ ] **Step 3: Implement**

In `packages/trpc/src/routers/chat/updateChat.ts`:

Input schema — after `debtSimplificationEnabled` line:

```ts
  debtSimplificationEnabled: z.boolean().optional(),
  agentEnabled: z.boolean().optional(),
```

Output schema — after `debtSimplificationEnabled: z.boolean(),`:

```ts
  debtSimplificationEnabled: z.boolean(),
  agentEnabled: z.boolean(),
```

`updateData` type — after `debtSimplificationEnabled?: boolean;`:

```ts
      debtSimplificationEnabled?: boolean;
      agentEnabled?: boolean;
```

Plumbing — after the `debtSimplificationEnabled` if-block:

```ts
    if (input.agentEnabled !== undefined) {
      updateData.agentEnabled = input.agentEnabled;
    }
```

In `packages/trpc/src/routers/chat/getChat.ts`, after line 28 (`debtSimplificationEnabled: ...`):

```ts
    debtSimplificationEnabled: chat?.debtSimplificationEnabled ?? false,
    agentEnabled: chat?.agentEnabled ?? false,
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd packages/trpc && npx vitest run src/routers/chat/updateChat.test.ts && npm run check-types
```

Expected: 2 passed, typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/chat/updateChat.ts packages/trpc/src/routers/chat/updateChat.test.ts packages/trpc/src/routers/chat/getChat.ts
git commit -m "feat(trpc): expose Chat.agentEnabled via getChat/updateChat"
```

---

### Task 3: Bot gate — `isAgentAllowed` + wiring

**Files:**
- Create: `apps/bot/src/utils/agentGate.ts`
- Create: `apps/bot/src/utils/agentGate.test.ts`
- Modify: `apps/bot/src/features/group.ts:238` (mention/reply handler)
- Modify: `apps/bot/src/features/agent.ts:378` (`/ask` `/do` command)

**Interfaces:**
- Consumes: `ctx.trpc.chat.getChat({ chatId: number })` returning `{ agentEnabled: boolean }` (Task 2); `BotContext` from `apps/bot/src/types.ts`.
- Produces: `isAgentAllowed(ctx: BotContext): Promise<boolean>` — `true` for private chats always; for groups, `true` only when `agentEnabled` is true; `false` on any lookup error.

- [ ] **Step 1: Write failing tests**

Create `apps/bot/src/utils/agentGate.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { isAgentAllowed } from "./agentGate.js";

const makeCtx = (overrides: Record<string, unknown> = {}) =>
  ({
    chat: { id: 42, type: "supergroup" },
    log: { info: vi.fn(), error: vi.fn() },
    trpc: {
      chat: {
        getChat: vi.fn().mockResolvedValue({ agentEnabled: true }),
      },
    },
    ...overrides,
  }) as any;

describe("isAgentAllowed", () => {
  it("allows private chats without a lookup", async () => {
    const ctx = makeCtx({ chat: { id: 7, type: "private" } });
    await expect(isAgentAllowed(ctx)).resolves.toBe(true);
    expect(ctx.trpc.chat.getChat).not.toHaveBeenCalled();
  });

  it("allows groups with agentEnabled=true", async () => {
    const ctx = makeCtx();
    await expect(isAgentAllowed(ctx)).resolves.toBe(true);
    expect(ctx.trpc.chat.getChat).toHaveBeenCalledWith({ chatId: 42 });
  });

  it("blocks groups with agentEnabled=false and logs agent.gated", async () => {
    const ctx = makeCtx();
    ctx.trpc.chat.getChat.mockResolvedValue({ agentEnabled: false });
    await expect(isAgentAllowed(ctx)).resolves.toBe(false);
    expect(ctx.log.info).toHaveBeenCalledWith(
      { chat_id: 42 },
      "agent.gated"
    );
  });

  it("fails closed when the lookup throws", async () => {
    const ctx = makeCtx();
    ctx.trpc.chat.getChat.mockRejectedValue(new Error("boom"));
    await expect(isAgentAllowed(ctx)).resolves.toBe(false);
    expect(ctx.log.error).toHaveBeenCalled();
  });

  it("blocks when ctx.chat is missing", async () => {
    const ctx = makeCtx({ chat: undefined });
    await expect(isAgentAllowed(ctx)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

```bash
cd apps/bot && npx vitest run src/utils/agentGate.test.ts
```

Expected: FAIL — `Cannot find module './agentGate.js'`.

- [ ] **Step 3: Implement `agentGate.ts`**

Create `apps/bot/src/utils/agentGate.ts`:

```ts
import { BotContext } from "../types.js";

// Group-side gate for the experimental AI agent. Private DMs are always
// allowed; groups must have opted in via Chat.agentEnabled. Fails closed:
// a broken lookup must not fire a flaky experimental feature.
export const isAgentAllowed = async (ctx: BotContext): Promise<boolean> => {
  if (!ctx.chat) return false;
  if (ctx.chat.type === "private") return true;

  try {
    const chat = await ctx.trpc.chat.getChat({ chatId: ctx.chat.id });
    if (!chat.agentEnabled) {
      ctx.log.info({ chat_id: ctx.chat.id }, "agent.gated");
      return false;
    }
    return true;
  } catch (err) {
    ctx.log.error({ err, chat_id: ctx.chat.id }, "agent.gate.check.failed");
    return false;
  }
};
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd apps/bot && npx vitest run src/utils/agentGate.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Wire into group mention/reply handler**

In `apps/bot/src/features/group.ts`, add import at top:

```ts
import { isAgentAllowed } from "../utils/agentGate.js";
```

Inside the `groupFeature.on("message", ...)` handler, at the start of the `if (isMentioned || isReplyToBot) {` block (before payload stripping):

```ts
  if (isMentioned || isReplyToBot) {
    // Experimental AI agent is opt-in per group; silently ignore when gated.
    if (!(await isAgentAllowed(ctx))) return;
```

- [ ] **Step 6: Wire into `/ask` `/do` command**

In `apps/bot/src/features/agent.ts`, add import at top:

```ts
import { isAgentAllowed } from "../utils/agentGate.js";
```

In the command handler:

```ts
agentFeature.command(["ask", "do"], async (ctx) => {
  const text = ctx.match;
  if (!text && !ctx.message?.photo) return;

  // Experimental AI agent is opt-in per group; silently ignore when gated.
  if (!(await isAgentAllowed(ctx))) return;

  await handleAgentMessage(ctx, text?.trim() || "");
});
```

The private-chat auto-handler at the bottom of `agent.ts` (`agentFeature.on(["message:photo", "message:text"], ...)`) is NOT modified — it already early-returns for non-private chats.

- [ ] **Step 7: Full bot test suite + typecheck**

```bash
cd apps/bot && npm test && npm run check-types
```

Expected: all tests pass, typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/bot/src/utils/agentGate.ts apps/bot/src/utils/agentGate.test.ts apps/bot/src/features/group.ts apps/bot/src/features/agent.ts
git commit -m "feat(bot): gate group AI agent behind Chat.agentEnabled, fail closed"
```

---

### Task 4: TMA — Bot settings subpage + hub row

**Files:**
- Create: `apps/web/src/components/features/Settings/BotSettingsSubPage.tsx`
- Create: `apps/web/src/routes/_tma/chat.$chatId_.settings.bot.tsx`
- Modify: `apps/web/src/components/features/Settings/SettingsHubPage.tsx`

**Interfaces:**
- Consumes: `trpc.chat.getChat` (`agentEnabled: boolean`) and `trpc.chat.updateChat` (`{ chatId, agentEnabled }`) from Task 2; `IconSquare` (`color: "indigo"` exists in `ICON_COLOR`); `RowLink` (local to `SettingsHubPage.tsx`).
- Produces: route `/chat/$chatId/settings/bot`.

- [ ] **Step 1: Create `BotSettingsSubPage.tsx`**

Create `apps/web/src/components/features/Settings/BotSettingsSubPage.tsx` (mirrors `EventAlertsSubPage.tsx`):

```tsx
import { useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import { Cell, Section, Skeleton, Switch } from "@telegram-apps/telegram-ui";
import { Sparkles } from "lucide-react";
import { trpc } from "@/utils/trpc";
import IconSquare from "./IconSquare";

interface BotSettingsSubPageProps {
  chatId: number;
}

export default function BotSettingsSubPage({ chatId }: BotSettingsSubPageProps) {
  const navigate = useNavigate();
  const trpcUtils = trpc.useUtils();
  const { data: chat, isPending } = trpc.chat.getChat.useQuery({ chatId });

  const updateChat = trpc.chat.updateChat.useMutation({
    onMutate: (input) => {
      trpcUtils.chat.getChat.setData({ chatId }, (prev) =>
        prev ? { ...prev, ...input } : prev
      );
    },
    onSuccess: () => trpcUtils.chat.getChat.invalidate({ chatId }),
    onError: () => trpcUtils.chat.getChat.invalidate({ chatId }),
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

  const toggleAgent = useCallback(() => {
    const next = !(chat?.agentEnabled ?? false);
    updateChat.mutate(
      { chatId, agentEnabled: next },
      {
        onSuccess: () => hapticFeedback.notificationOccurred("success"),
        onError: () => hapticFeedback.notificationOccurred("error"),
      }
    );
  }, [chat, chatId, updateChat]);

  return (
    <main className="px-3 pb-8">
      <Section
        header="AI assistant"
        footer="Experimental. When on, the bot answers @mentions, replies, /ask and /do in this group. When off, it stays silent."
      >
        <Cell
          Component="label"
          before={
            <IconSquare color="indigo">
              <Sparkles size={14} />
            </IconSquare>
          }
          after={
            <Skeleton visible={isPending}>
              <Switch
                checked={chat?.agentEnabled ?? false}
                onChange={toggleAgent}
                disabled={isPending}
              />
            </Skeleton>
          }
        >
          AI assistant
        </Cell>
      </Section>
    </main>
  );
}
```

- [ ] **Step 2: Create route file**

Create `apps/web/src/routes/_tma/chat.$chatId_.settings.bot.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import BotSettingsSubPage from "@/components/features/Settings/BotSettingsSubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/bot")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <BotSettingsSubPage chatId={Number(chatId)} />;
}
```

- [ ] **Step 3: Add hub row**

In `apps/web/src/components/features/Settings/SettingsHubPage.tsx`:

Add `Bot` to the lucide import:

```ts
import {
  Bell,
  Bot,
  Clock,
  DollarSign,
  Key,
  Tag,
  User as UserIcon,
  Users,
} from "lucide-react";
```

Extend `SubKey` and `SUB_PATHS`:

```ts
type SubKey =
  | "members"
  | "currency"
  | "categories"
  | "notifications"
  | "reminders"
  | "bot"
  | "account"
  | "developer";

const SUB_PATHS: Record<
  SubKey,
  | "/chat/$chatId/settings/members"
  | "/chat/$chatId/settings/currency"
  | "/chat/$chatId/settings/categories"
  | "/chat/$chatId/settings/notifications"
  | "/chat/$chatId/settings/reminders"
  | "/chat/$chatId/settings/bot"
  | "/chat/$chatId/settings/account"
  | "/chat/$chatId/settings/developer"
> = {
  members: "/chat/$chatId/settings/members",
  currency: "/chat/$chatId/settings/currency",
  categories: "/chat/$chatId/settings/categories",
  notifications: "/chat/$chatId/settings/notifications",
  reminders: "/chat/$chatId/settings/reminders",
  bot: "/chat/$chatId/settings/bot",
  account: "/chat/$chatId/settings/account",
  developer: "/chat/$chatId/settings/developer",
};
```

In the `Section header="Group"` block, after the Categories `RowLink`:

```tsx
          <RowLink
            color="indigo"
            icon={<Bot size={16} />}
            label="AI assistant"
            value={chat?.agentEnabled ? "On" : "Off"}
            loading={chatPending}
            onClick={() => goto("bot")}
          />
```

- [ ] **Step 4: Typecheck + build (regenerates route tree)**

```bash
cd apps/web && npm run build
```

Expected: build succeeds; generated route tree includes `/_tma/chat/$chatId_/settings/bot`. If the repo uses a `check-types` script, run it too:

```bash
cd apps/web && npm run check-types
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Settings/BotSettingsSubPage.tsx apps/web/src/routes/_tma/chat.\$chatId_.settings.bot.tsx apps/web/src/components/features/Settings/SettingsHubPage.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat(web): AI assistant opt-in toggle in group settings"
```

(Only add `routeTree.gen.ts` if the build regenerated it.)

---

### Task 5: Workspace verification + PR

**Files:** none new.

- [ ] **Step 1: Full test + typecheck sweep**

```bash
npm test --workspaces --if-present
npm run check-types --workspaces --if-present
```

Expected: all pass. If the repo root uses turbo, `npx turbo run test check-types` is equivalent.

- [ ] **Step 2: Push branch + open PR**

```bash
git push -u origin feat/agent-opt-in-gate
gh pr create --title "feat: per-group opt-in gate for AI agent" --body "..."
```

PR body: link spec blob URLs, summarize the four components, note UAT pending. Tag `@claude` with merge-readiness request per PR flow. Do NOT arm auto-merge — user UATs first (migration touches prod DB on merge; deploy.yml auto-deploys main).

- [ ] **Step 3: Manual UAT (user-driven, AskUserQuestion one step at a time)**

1. Open TMA group settings → see "AI assistant · Off" row.
2. Mention bot in that group → expect silence; `agent.gated` in logs.
3. `/ask hello` in group → silence.
4. Toggle on in subpage → haptic + "On" preview in hub.
5. Mention bot → agent responds.
6. DM bot → agent responds regardless of any group toggle.

---

## Self-Review Notes

- Spec coverage: schema (Task 1), tRPC (Task 2), bot gate incl. fail-closed + logging (Task 3), TMA hub+subpage (Task 4), out-of-scope surfaces untouched, testing section mapped to Tasks 2/3 unit tests + Task 5 UAT.
- `getChat` spreads the chat row, so `agentEnabled` flows through automatically; the explicit default line is for parity and missing-row safety only.
- Names consistent across tasks: `agentEnabled`, `isAgentAllowed`, route `/chat/$chatId/settings/bot`.
