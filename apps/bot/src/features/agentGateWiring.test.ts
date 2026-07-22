import { describe, expect, it, vi, beforeEach } from "vitest";
import type { BotContext } from "../types.js";

// The real @repo/agent module builds a Postgres-backed mastra Agent at
// import time (packages/agent/src/memory.ts constructs a PostgresStore).
// These wiring tests only care about whether the gate lets a message reach
// handleAgentMessage, not about the agent's actual behavior, so stub it out
// to keep the test hermetic and fast.
vi.mock("@repo/agent", () => ({
  bananaAgent: {
    stream: vi.fn().mockResolvedValue({
      fullStream: (async function* () {})(),
    }),
  },
}));

const { groupFeature } = await import("./group.js");
const { agentFeature } = await import("./agent.js");

const BOT_ID = 999;
const BOT_USERNAME = "testbot";

function makeGetChat(agentEnabled: boolean) {
  return vi.fn().mockResolvedValue({ agentEnabled });
}

// Minimal mock ctx shared shape. Individual tests override `message` /
// `update` to drive a specific composer branch.
function makeCtx(overrides: {
  message: Record<string, unknown>;
  agentEnabled: boolean;
}): BotContext {
  const { message, agentEnabled } = overrides;

  const ctx = {
    chat: { id: 555, type: "supergroup" },
    me: { id: BOT_ID, username: BOT_USERNAME, is_bot: true },
    from: { id: 111, first_name: "Test", is_bot: false },
    message,
    update: { update_id: 1, message },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    trpc: {
      chat: {
        getChat: makeGetChat(agentEnabled),
      },
    },
    api: {
      sendChatAction: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
    },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
  };

  return ctx as unknown as BotContext;
}

describe("agent gate wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("mention path (group.ts)", () => {
    function makeMentionCtx(agentEnabled: boolean) {
      return makeCtx({
        message: {
          message_id: 1,
          text: `@${BOT_USERNAME} hello`,
          entities: [
            { type: "mention", offset: 0, length: BOT_USERNAME.length + 1 },
          ],
        },
        agentEnabled,
      });
    }

    it("does NOT invoke the agent when the group is gated (agentEnabled=false)", async () => {
      const ctx = makeMentionCtx(false);
      const next = vi.fn();

      await groupFeature.middleware()(ctx, next);

      expect(ctx.trpc.chat.getChat).toHaveBeenCalledWith({ chatId: 555 });
      expect(ctx.api.sendChatAction).not.toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("proceeds past the gate when the group has opted in (agentEnabled=true)", async () => {
      const ctx = makeMentionCtx(true);
      const next = vi.fn();

      await groupFeature.middleware()(ctx, next);

      expect(ctx.trpc.chat.getChat).toHaveBeenCalledWith({ chatId: 555 });
      // handleAgentMessage's first side effect is a typing indicator — its
      // presence proves the mention handler passed the gate and ran.
      expect(ctx.api.sendChatAction).toHaveBeenCalledWith(555, "typing");
    });
  });

  describe("/ask command path (agent.ts)", () => {
    function makeAskCtx(agentEnabled: boolean) {
      const text = "/ask do something";
      return makeCtx({
        message: {
          message_id: 2,
          text,
          entities: [{ type: "bot_command", offset: 0, length: 4 }],
        },
        agentEnabled,
      });
    }

    it("does NOT invoke the agent for /ask when the group is gated", async () => {
      const ctx = makeAskCtx(false);
      const next = vi.fn();

      await agentFeature.middleware()(ctx, next);

      expect(ctx.trpc.chat.getChat).toHaveBeenCalledWith({ chatId: 555 });
      expect(ctx.api.sendChatAction).not.toHaveBeenCalled();
    });

    it("proceeds past the gate for /ask when the group has opted in", async () => {
      const ctx = makeAskCtx(true);
      const next = vi.fn();

      await agentFeature.middleware()(ctx, next);

      expect(ctx.trpc.chat.getChat).toHaveBeenCalledWith({ chatId: 555 });
      expect(ctx.api.sendChatAction).toHaveBeenCalledWith(555, "typing");
    });
  });
});
