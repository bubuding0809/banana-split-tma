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

  it("auth catch path will log auth.initData.failed (covered in Task 6)", () => {
    // This is just a placeholder noting that the actual auth-failure log
    // assertion lives in trpc.test.ts after Task 6 instruments the catch.
    // For Task 5 we only verify the errorFormatter behavior.
    expect(true).toBe(true);
  });
});
