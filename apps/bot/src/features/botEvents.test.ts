import { describe, expect, it, vi, beforeEach } from "vitest";
import type { BotContext } from "../types.js";

// bot_events.ts imports ../env.js, which validates required env vars at
// module load. CI has none, so stub it (same reason as agentGateWiring.test).
vi.mock("../env.js", () => ({
  env: {
    TELEGRAM_BOT_TOKEN: "test-token",
    NODE_ENV: "test",
    MINI_APP_DEEPLINK: "https://t.me/testbot",
  },
}));

const { botEventsFeature } = await import("./bot_events.js");

const CHAT_ID = -1001234;

function makeCtx(update: Record<string, unknown>, extra = {}) {
  return {
    update: { update_id: 1, ...update },
    me: { id: 999, username: "testbot", is_bot: true },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    trpc: {
      chat: {
        getChat: vi.fn(),
        createChat: vi.fn().mockResolvedValue({}),
        updateChat: vi.fn().mockResolvedValue({}),
      },
    },
    api: {
      getChat: vi.fn().mockResolvedValue({ id: CHAT_ID }),
      getFile: vi.fn(),
      sendMessage: vi.fn(),
    },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
    ...extra,
  } as unknown as BotContext;
}

function renameCtx(newTitle: string) {
  const chat = { id: CHAT_ID, type: "supergroup", title: newTitle };
  const message = {
    message_id: 10,
    date: 0,
    chat,
    new_chat_title: newTitle,
  };
  return makeCtx({ message }, { chat, message });
}

function reAddCtx(currentTitle: string, storedTitle: string) {
  const chat = { id: CHAT_ID, type: "supergroup", title: currentTitle };
  const myChatMember = {
    chat,
    from: { id: 1, is_bot: false, first_name: "A" },
    date: 0,
    old_chat_member: { status: "left", user: { id: 999 } },
    new_chat_member: { status: "member", user: { id: 999 } },
  };
  const ctx = makeCtx({ my_chat_member: myChatMember }, { chat, myChatMember });
  vi.mocked(ctx.trpc.chat.getChat).mockResolvedValue({
    title: storedTitle,
    migratedFromChatId: null,
  } as never);
  return ctx;
}

describe("bot_events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("new_chat_title", () => {
    it("syncs the new title to the DB without replying in the group", async () => {
      const ctx = renameCtx("Bali 2027");

      await botEventsFeature.middleware()(ctx, vi.fn());

      expect(ctx.trpc.chat.updateChat).toHaveBeenCalledWith({
        chatId: CHAT_ID,
        title: "Bali 2027",
      });
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("swallows a failed update (e.g. chat not in DB) without replying", async () => {
      const ctx = renameCtx("Bali 2027");
      vi.mocked(ctx.trpc.chat.updateChat).mockRejectedValue(
        Object.assign(new Error("not found"), { code: "NOT_FOUND" })
      );

      await expect(
        botEventsFeature.middleware()(ctx, vi.fn())
      ).resolves.not.toThrow();

      expect(ctx.reply).not.toHaveBeenCalled();
      expect(ctx.log.warn).toHaveBeenCalled();
    });
  });

  describe("my_chat_member re-add of an existing chat", () => {
    it("heals a stale title", async () => {
      const ctx = reAddCtx("New Name", "Old Name");

      await botEventsFeature.middleware()(ctx, vi.fn());

      expect(ctx.trpc.chat.updateChat).toHaveBeenCalledWith({
        chatId: CHAT_ID,
        title: "New Name",
      });
      expect(ctx.trpc.chat.createChat).not.toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("leaves a matching title alone", async () => {
      const ctx = reAddCtx("Same", "Same");

      await botEventsFeature.middleware()(ctx, vi.fn());

      expect(ctx.trpc.chat.updateChat).not.toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });
});
