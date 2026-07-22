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

  it("logs agent.gated.no_chat at info (not error) when the lookup 404s", async () => {
    const ctx = makeCtx();
    ctx.trpc.chat.getChat.mockRejectedValue({
      code: "NOT_FOUND",
      message: "Chat not found",
    });
    await expect(isAgentAllowed(ctx)).resolves.toBe(false);
    expect(ctx.log.info).toHaveBeenCalledWith(
      { chat_id: 42 },
      "agent.gated.no_chat"
    );
    expect(ctx.log.error).not.toHaveBeenCalled();
  });

  it("memoizes the gate result per ctx so getChat is only called once", async () => {
    const ctx = makeCtx();
    const [first, second] = await Promise.all([
      isAgentAllowed(ctx),
      isAgentAllowed(ctx),
    ]);
    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(ctx.trpc.chat.getChat).toHaveBeenCalledTimes(1);

    // A later call against the same ctx object still reuses the cached
    // result instead of issuing a second lookup.
    await isAgentAllowed(ctx);
    expect(ctx.trpc.chat.getChat).toHaveBeenCalledTimes(1);
  });

  it("does not share the memoized result across different ctx objects", async () => {
    const ctxA = makeCtx();
    const ctxB = makeCtx();
    await isAgentAllowed(ctxA);
    await isAgentAllowed(ctxB);
    expect(ctxA.trpc.chat.getChat).toHaveBeenCalledTimes(1);
    expect(ctxB.trpc.chat.getChat).toHaveBeenCalledTimes(1);
  });
});
