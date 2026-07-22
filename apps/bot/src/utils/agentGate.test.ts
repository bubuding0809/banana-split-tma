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
    expect(ctx.log.info).toHaveBeenCalledWith({ chat_id: 42 }, "agent.gated");
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
