import { describe, it, expect } from "vitest";
import { createLogger } from "@repo/logger";
import { type BotContext } from "../types.js";

import { makeLoggerMiddleware } from "./logger.js";

type MiddlewareFn = (
  ctx: BotContext,
  next: () => Promise<void>
) => Promise<void>;

describe("bot logger middleware", () => {
  it("logs bot.update.start with request_id and chat/user context", async () => {
    const lines: string[] = [];
    const log = createLogger("bot", {
      destination: { write: (s) => lines.push(s) },
    });

    const middleware = makeLoggerMiddleware(log) as MiddlewareFn;
    const ctx = {
      update: { update_id: 42 },
      message: { text: "/start" },
      chat: { id: -123 },
      from: { id: 9, username: "alice" },
    } as unknown as BotContext;

    await middleware(ctx, async () => {});

    const start = lines
      .map((l) => JSON.parse(l))
      .find((p) => p.msg === "bot.update.start");
    expect(start).toBeDefined();
    expect(start.update_id).toBe(42);
    expect(start.chat_id).toBe("-123");
    expect(start.user_id).toBe("9");
    expect(start.username).toBe("alice");
    expect(start.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect((ctx as unknown as { log: unknown }).log).toBeDefined();
    expect((ctx as unknown as { requestId: string }).requestId).toBe(
      start.request_id
    );
  });

  it("logs bot.update.unhandled when next throws", async () => {
    const lines: string[] = [];
    const log = createLogger("bot", {
      destination: { write: (s) => lines.push(s) },
    });

    const middleware = makeLoggerMiddleware(log) as MiddlewareFn;
    const ctx = { update: { update_id: 7 } } as unknown as BotContext;

    await expect(
      middleware(ctx, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    const fail = lines
      .map((l) => JSON.parse(l))
      .find((p) => p.msg === "bot.update.unhandled");
    expect(fail).toBeDefined();
    expect(fail.err.message).toBe("boom");
    expect(fail.update_id).toBe(7);
  });

  it("logs bot.update.end with duration on success", async () => {
    const lines: string[] = [];
    const log = createLogger("bot", {
      destination: { write: (s) => lines.push(s) },
    });

    const middleware = makeLoggerMiddleware(log) as MiddlewareFn;
    const ctx = { update: { update_id: 1 } } as unknown as BotContext;

    await middleware(ctx, async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

    const end = lines
      .map((l) => JSON.parse(l))
      .find((p) => p.msg === "bot.update.end");
    expect(end).toBeDefined();
    expect(end.duration_ms).toBeGreaterThanOrEqual(5);
  });
});
