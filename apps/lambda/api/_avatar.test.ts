import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { validateMock, parseMock, getUserProfilePhotosMock, getFileMock } =
  vi.hoisted(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
    process.env.API_KEY = "test-api-key";
    process.env.INTERNAL_AGENT_KEY = "test-internal-agent-key";
    process.env.RECURRING_EXPENSE_WEBHOOK_SECRET = "x".repeat(64);
    process.env.CRON_SECRET = "c".repeat(64);
    process.env.AWS_GROUP_REMINDER_LAMBDA_ARN =
      "arn:aws:lambda:ap-southeast-1:000000000000:function:GroupReminderLambda";
    // Pin the download URL the file helper builds; "" reads back as undefined.
    process.env.TELEGRAM_API_ROOT = "";
    return {
      validateMock: vi.fn(),
      parseMock: vi.fn(),
      getUserProfilePhotosMock: vi.fn(),
      getFileMock: vi.fn(),
    };
  });

const FILE_URL = "https://api.telegram.org/file/bottest-bot-token/photos/x.jpg";

vi.mock("@telegram-apps/init-data-node", () => ({
  validate: validateMock,
  parse: parseMock,
}));

vi.mock("@dko/database", () => ({
  prisma: {
    chat: { findFirst: vi.fn() },
  },
}));

vi.mock("grammy", () => ({
  Api: vi.fn(function (this: Record<string, unknown>) {
    this.getUserProfilePhotos = getUserProfilePhotosMock;
    this.getFile = getFileMock;
  }),
}));

import avatarRouter from "./avatar.js";
import { prisma } from "@dko/database";

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

describe("GET /api/avatar/:userId — authz", () => {
  it("returns 403 when caller and target do not share a chat", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 100 } });
    (prisma.chat.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      null
    );
    const res = await request(app).get("/api/avatar/200?auth=ok");
    expect(res.status).toBe(403);
  });

  it("allows self-lookup without checking shared chat", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    const findFirstMock = prisma.chat.findFirst as ReturnType<typeof vi.fn>;
    const res = await request(app).get("/api/avatar/123?auth=ok");
    expect(res.status).not.toBe(403);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("proceeds when caller and target share a chat", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 100 } });
    (prisma.chat.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 999n,
    });
    getUserProfilePhotosMock.mockResolvedValueOnce({ photos: [] });
    const res = await request(app).get("/api/avatar/200?auth=ok");
    // Authz passes; proceeds to Telegram fetch (no photos → 404).
    expect(res.status).toBe(404);
  });
});

describe("GET /api/avatar/:userId — Telegram fetch", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
    getUserProfilePhotosMock.mockReset();
    getFileMock.mockReset();
    getFileMock.mockResolvedValue({
      file_id: "f",
      file_unique_id: "u",
      file_path: "photos/x.jpg",
    });
  });

  it("returns 404 with 1h cache when user has no photos", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    getUserProfilePhotosMock.mockResolvedValueOnce({ photos: [] });
    const res = await request(app).get("/api/avatar/123?auth=ok");
    expect(res.status).toBe(404);
    expect(res.header["cache-control"]).toMatch(/max-age=3600/);
    expect(res.header["cache-control"]).toMatch(/s-maxage=3600/);
  });

  it("returns 200 + JPEG with long cache on happy path", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    getUserProfilePhotosMock.mockResolvedValueOnce({
      photos: [
        [
          { file_id: "small", file_unique_id: "u-s" },
          { file_id: "big", file_unique_id: "u-b" },
        ],
      ],
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () =>
        Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff]).buffer),
    });
    const res = await request(app).get("/api/avatar/123?auth=ok");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toMatch(/image\/jpeg/);
    expect(res.header["cache-control"]).toMatch(/max-age=86400/);
    expect(res.header["cache-control"]).toMatch(/s-maxage=604800/);
    expect(res.header["cache-control"]).toMatch(
      /stale-while-revalidate=604800/
    );
    expect(res.body.length).toBeGreaterThan(0);
    expect(getUserProfilePhotosMock).toHaveBeenCalledWith(123, {
      offset: 0,
      limit: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(FILE_URL);
  });

  it("picks the largest size variant", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    getUserProfilePhotosMock.mockResolvedValueOnce({
      photos: [
        [
          { file_id: "small", file_unique_id: "u-s" },
          { file_id: "medium", file_unique_id: "u-m" },
          { file_id: "big", file_unique_id: "u-b" },
        ],
      ],
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([0xff]).buffer),
    });
    await request(app).get("/api/avatar/123?auth=ok");
    expect(getFileMock).toHaveBeenCalledWith("big");
  });
});

describe("GET /api/avatar/:userId — error paths", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
    getUserProfilePhotosMock.mockReset();
    getFileMock.mockReset();
  });

  it("returns 502 when the Telegram client throws", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    getUserProfilePhotosMock.mockRejectedValueOnce(new Error("flood wait"));
    const res = await request(app).get("/api/avatar/123?auth=ok");
    expect(res.status).toBe(502);
  });

  it("returns 502 when upstream fetch fails", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    getUserProfilePhotosMock.mockResolvedValueOnce({
      photos: [[{ file_id: "big", file_unique_id: "u-b" }]],
    });
    getFileMock.mockResolvedValueOnce({
      file_id: "big",
      file_unique_id: "u-b",
      file_path: "photos/x.jpg",
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const res = await request(app).get("/api/avatar/123?auth=ok");
    expect(res.status).toBe(502);
  });

  it("returns 502 when Telegram returns no file_path", async () => {
    validateMock.mockImplementationOnce(() => {});
    parseMock.mockReturnValueOnce({ user: { id: 123 } });
    getUserProfilePhotosMock.mockResolvedValueOnce({
      photos: [[{ file_id: "big", file_unique_id: "u-b" }]],
    });
    getFileMock.mockResolvedValueOnce({
      file_id: "big",
      file_unique_id: "u-b",
    });
    const res = await request(app).get("/api/avatar/123?auth=ok");
    expect(res.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
