import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { validateMock, parseMock, getChatMock, getFileLinkMock } = vi.hoisted(
  () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
    process.env.API_KEY = "test-api-key";
    process.env.INTERNAL_AGENT_KEY = "test-internal-agent-key";
    process.env.RECURRING_EXPENSE_WEBHOOK_SECRET = "x".repeat(64);
    return {
      validateMock: vi.fn(),
      parseMock: vi.fn(),
      getChatMock: vi.fn(),
      getFileLinkMock: vi.fn(),
    };
  }
);

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
    this.getChat = getChatMock;
    this.getFileLink = getFileLinkMock;
  }),
}));

import chatPhotoRouter from "./chat-photo.js";
import { prisma } from "@dko/database";

const app = express();
app.use("/api/chat-photo", chatPhotoRouter);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/chat-photo/:chatId — auth + authz", () => {
  it("returns 401 when no auth", async () => {
    const res = await request(app).get("/api/chat-photo/-1001");
    expect(res.status).toBe(401);
  });

  it("returns 401 when initData signature invalid", async () => {
    validateMock.mockImplementationOnce(() => {
      throw new Error("invalid");
    });
    const res = await request(app).get("/api/chat-photo/-1001?auth=bogus");
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not a member of the chat", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 100 } });
    (prisma.chat.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      null
    );
    const res = await request(app).get("/api/chat-photo/-1001?auth=ok");
    expect(res.status).toBe(403);
  });

  it("proceeds when caller is a member of the chat", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 100 } });
    (prisma.chat.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: -1001n,
    });
    const res = await request(app).get("/api/chat-photo/-1001?auth=ok");
    // Authz passes; falls through to 404 stub for now.
    expect(res.status).toBe(404);
  });
});
