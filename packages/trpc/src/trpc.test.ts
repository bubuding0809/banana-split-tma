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

      // UNAUTHORIZED is in SELF_LOGGED_OR_EXPECTED_CODES — the auth
      // middleware already emitted auth.initData.failed at warn above,
      // so the errorFormatter must NOT re-emit at error level. Re-emitting
      // would inflate the procedure-error spike monitor with routine
      // failed-auth traffic.
      const procErrorCalls = errorSpy.mock.calls.filter(
        (call) => call[1] === "trpc.procedure.error"
      );
      expect(procErrorCalls.length).toBe(0);
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("logs trpc.procedure.error for INTERNAL_SERVER_ERROR via ctx.log (request-scoped child)", async () => {
    // The errorFormatter prefers ctx.log (built by createTRPCContext with a
    // request_id child binding) over the module-level trpcLogger so the
    // request_id binding doesn't have to be re-derived per call. Spy on
    // trpcLogger.child so we can capture the request-scoped child and
    // assert it (not the parent) was used to emit the error event.
    //
    // Note: middleware-augmented ctx (auth_type binding added by
    // protectedProcedure) does NOT propagate to errorFormatter — tRPC's
    // ctxManager only exposes the original createContext value — so we
    // can only verify the createTRPCContext-level child here.
    const childLoggerSpies: Array<{
      bindings: Record<string, unknown>;
      errorSpy: ReturnType<typeof vi.fn>;
    }> = [];
    const realChild = trpcLogger.child.bind(trpcLogger) as unknown as (
      ...args: unknown[]
    ) => typeof trpcLogger;
    const childSpy = vi.spyOn(trpcLogger, "child").mockImplementation(((
      ...args: unknown[]
    ) => {
      const bindings = (args[0] as Record<string, unknown>) ?? {};
      const child = realChild(...args);
      const errorSpy = vi.fn();
      const realError = child.error.bind(child) as (...a: unknown[]) => unknown;
      // Wrap so the original transport still fires (test is integration-y).
      child.error = ((...callArgs: unknown[]) => {
        errorSpy(...callArgs);
        return realError(...callArgs);
      }) as typeof child.error;
      childLoggerSpies.push({ bindings, errorSpy });
      return child;
    }) as unknown as typeof trpcLogger.child);
    const parentErrorSpy = vi.spyOn(trpcLogger, "error");

    try {
      const router = createTRPCRouter({
        boom: protectedProcedure.input(z.object({})).query(() => {
          throw new Error("boom");
        }),
      });

      // Make initData validation succeed so we get past auth and into
      // the handler that throws (which tRPC wraps as INTERNAL_SERVER_ERROR).
      validateMock.mockImplementation(() => undefined);
      parseMock.mockImplementation(() => ({
        user: { id: 42, first_name: "Test" },
      }));

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

      // superjson transformer requires the input to be wrapped as
      // {"json": <value>} on the wire; %7B%22json%22%3A%7B%7D%7D = {"json":{}}.
      await request(app)
        .get("/trpc/boom?input=%7B%22json%22%3A%7B%7D%7D")
        .set("authorization", "tma GOOD")
        .expect(500);

      // The child logger built by createTRPCContext binds request_id. Find
      // the one that was used to emit trpc.procedure.error.
      const requestChild = childLoggerSpies.find(
        (c) =>
          typeof c.bindings.request_id === "string" &&
          /^[0-9a-f-]{36}$/.test(c.bindings.request_id)
      );
      expect(requestChild).toBeDefined();
      const procErrorCalls = requestChild!.errorSpy.mock.calls.filter(
        (call) => call[1] === "trpc.procedure.error"
      );
      expect(procErrorCalls.length).toBeGreaterThan(0);
      const payload = procErrorCalls[0]![0] as {
        err: Error;
        code: string;
      };
      expect(payload.code).toBe("INTERNAL_SERVER_ERROR");
      expect(payload.err.message).toBe("boom");

      // Parent logger should NOT have been called for trpc.procedure.error
      // — the errorFormatter must prefer the child to inherit request_id.
      const parentProcErrorCalls = parentErrorSpy.mock.calls.filter(
        (call) => call[1] === "trpc.procedure.error"
      );
      expect(parentProcErrorCalls.length).toBe(0);
    } finally {
      childSpy.mockRestore();
      parentErrorSpy.mockRestore();
    }
  });
});
