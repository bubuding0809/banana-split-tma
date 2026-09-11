import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { GrammyError, HttpError } from "grammy";
import { stdSerializers } from "pino";
import { createTelegramApi } from "./telegramClient.js";
import {
  startFakeTelegramServer,
  type FakeTelegramServer,
} from "../testing/fakeTelegramServer.js";

const SECRET = "ABCdef-SECRET_xyz";
const TOKEN = `123456:${SECRET}`;

describe("createTelegramApi", () => {
  it("redacts the bot token from network errors before they reach a logger", async () => {
    // Port 1 refuses connections, so the fetch fails and grammy wraps the
    // node-fetch error (whose message and stack carry the request URL).
    const api = createTelegramApi(TOKEN, "http://127.0.0.1:1");
    const e = await api.getMe().then(
      () => {
        throw new Error("expected getMe to reject");
      },
      (err: unknown) => err
    );

    expect(e).toBeInstanceOf(HttpError);
    const inner = (e as HttpError).error as {
      message?: string;
      stack?: string;
      cause?: { message?: string; stack?: string };
    };
    expect(String((e as Error).message)).not.toContain(SECRET);
    expect(String((e as Error).stack)).not.toContain(SECRET);
    expect(String(inner?.message)).not.toContain(SECRET);
    expect(String(inner?.stack)).not.toContain(SECRET);
    expect(String(inner?.cause?.message)).not.toContain(SECRET);
    expect(JSON.stringify(stdSerializers.err(e as Error))).not.toContain(
      SECRET
    );
  });

  describe("against the fake Bot API", () => {
    let server: FakeTelegramServer;

    beforeAll(async () => {
      server = await startFakeTelegramServer();
    });

    afterAll(async () => {
      await server.close();
    });

    it("passes ordinary calls through unchanged", async () => {
      server.calls.length = 0;
      const api = createTelegramApi(TOKEN, server.url);
      const me = await api.getMe();
      expect(me.username).toBe("testbot");
      const sent = await api.sendMessage(42, "hi *there*", {
        parse_mode: "MarkdownV2",
      });
      expect(sent.message_id).toBe(1);
      expect(server.calls).toEqual([
        { method: "getMe", body: {} },
        {
          method: "sendMessage",
          body: { chat_id: 42, text: "hi *there*", parse_mode: "MarkdownV2" },
        },
      ]);
    });
  });

  it("keeps GrammyError instances and their messages intact", async () => {
    const { createServer } = await import("node:http");
    const srv = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: false,
          error_code: 400,
          description: "Bad Request: chat not found",
        })
      );
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const addr = srv.address() as { port: number };
    try {
      const api = createTelegramApi(TOKEN, `http://127.0.0.1:${addr.port}`);
      const e = await api.sendMessage(1, "x").catch((err: unknown) => err);
      expect(e).toBeInstanceOf(GrammyError);
      expect((e as GrammyError).message).toContain("chat not found");
      expect((e as GrammyError).error_code).toBe(400);
    } finally {
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });
});
