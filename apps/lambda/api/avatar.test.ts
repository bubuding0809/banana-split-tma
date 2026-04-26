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
    chat: { findFirst: vi.fn() },
  },
}));

vi.mock("telegraf", () => ({
  Telegram: vi.fn(function (this: Record<string, unknown>) {
    this.getUserProfilePhotos = vi.fn();
    this.getFileLink = vi.fn();
  }),
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
