import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { validateMock, parseMock } = vi.hoisted(() => {
  process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
  process.env.API_KEY = "test-api-key";
  process.env.INTERNAL_AGENT_KEY = "test-internal-agent-key";
  process.env.RECURRING_EXPENSE_WEBHOOK_SECRET = "x".repeat(64);
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
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    chatApiKey: { findUnique: vi.fn().mockResolvedValue(null) },
    userApiKey: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

import * as trpcExpress from "@trpc/server/adapters/express";
import { z } from "zod";
import { withRequestContext } from "@repo/logger";

import {
  protectedProcedure,
  createTRPCRouter,
  withCreateTRPCContext,
  trpcLogger,
} from "./trpc.js";

beforeEach(() => {
  validateMock.mockReset();
  parseMock.mockReset();
});

describe("tRPC observability", () => {
  it("includes requestId in the shaped error response", async () => {
    validateMock.mockImplementation(() => {
      throw new Error("Init data is expired");
    });

    const router = createTRPCRouter({
      ping: protectedProcedure.input(z.object({})).query(() => ({ ok: true })),
    });

    const app = express();
    app.use(withRequestContext());
    app.use(
      "/trpc",
      trpcExpress.createExpressMiddleware({
        router,
        createContext: withCreateTRPCContext({
          TELEGRAM_BOT_TOKEN: "tok",
        } as Record<string, string>),
      })
    );

    const r = await request(app)
      .get("/trpc/ping?input=%7B%7D")
      .set("authorization", "tma BAD");

    expect(r.status).toBe(401);
    // superjson wraps the JSON-RPC error payload under .json
    const data = r.body.error.json.data;
    expect(data.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.code).toBe("UNAUTHORIZED");
  });

  it("logs auth.initData.failed with the original error before rethrowing UNAUTHORIZED", async () => {
    validateMock.mockImplementation(() => {
      throw new Error("Init data is expired");
    });

    const warnSpy = vi.spyOn(trpcLogger, "warn");
    const errorSpy = vi.spyOn(trpcLogger, "error");

    try {
      const router = createTRPCRouter({
        ping: protectedProcedure
          .input(z.object({}))
          .query(() => ({ ok: true })),
      });

      const app = express();
      app.use(withRequestContext());
      app.use(
        "/trpc",
        trpcExpress.createExpressMiddleware({
          router,
          createContext: withCreateTRPCContext({
            TELEGRAM_BOT_TOKEN: "tok",
          } as Record<string, string>),
        })
      );

      await request(app)
        .get("/trpc/ping?input=%7B%7D")
        .set("authorization", "tma BAD")
        .expect(401);

      const authFailureCalls = warnSpy.mock.calls.filter(
        (call) => call[1] === "auth.initData.failed"
      );
      expect(authFailureCalls.length).toBeGreaterThan(0);
      const payload = authFailureCalls[0]![0] as {
        err: Error;
        request_id: string;
      };
      expect(payload.err).toBeInstanceOf(Error);
      expect(payload.err.message).toBe("Init data is expired");
      expect(payload.request_id).toMatch(/^[0-9a-f-]{36}$/);

      // Lock in the cause-propagation contract: the errorFormatter's
      // trpc.procedure.error log must surface the ORIGINAL error
      // (via err.cause ?? err), not the wrapped TRPCError. If someone
      // later removes `cause: error` from the rethrow this fails loudly.
      const procErrorCalls = errorSpy.mock.calls.filter(
        (call) => call[1] === "trpc.procedure.error"
      );
      expect(procErrorCalls.length).toBeGreaterThan(0);
      const procPayload = procErrorCalls[0]![0] as { err: Error };
      expect(procPayload.err.message).toBe("Init data is expired");
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
