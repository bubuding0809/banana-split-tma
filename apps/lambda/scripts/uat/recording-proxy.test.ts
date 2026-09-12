import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRecordingProxy } from "./recording-proxy.js";

async function withProxy(
  upstream: string,
  fn: (proxyUrl: string, logPath: string) => Promise<void>
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "uat-proxy-"));
  const logPath = join(dir, "rec.jsonl");
  const proxy = await startRecordingProxy({ port: 0, upstream, logPath });
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    await fn(proxy.url, logPath);
    expect(unhandled).toEqual([]);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    await proxy.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const PROXY_ERROR_BODY = {
  ok: false,
  error_code: 502,
  description: "recording proxy error",
};

describe("recording proxy error handling", () => {
  it("answers 502 and logs a redacted entry when the upstream is unreachable", async () => {
    await withProxy("http://127.0.0.1:1", async (proxyUrl, logPath) => {
      // Two calls: the second proves the proxy is still serving.
      for (let i = 0; i < 2; i++) {
        const res = await fetch(`${proxyUrl}/bot123:ABC/getMe`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
          signal: AbortSignal.timeout(5000),
        });
        expect(res.status).toBe(502);
        expect(await res.json()).toEqual(PROXY_ERROR_BODY);
      }
      const raw = readFileSync(logPath, "utf8");
      expect(raw).not.toContain("123:ABC");
      const lines = raw.trim().split("\n");
      expect(lines).toHaveLength(2);
      const entry = JSON.parse(lines[0]!);
      expect(entry).toMatchObject({ seq: 1, method: "getMe", request: {} });
      expect(typeof entry.response.proxyError).toBe("string");
    });
  });

  it("answers 502 when the request body cannot be parsed", async () => {
    const upstream = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, result: true }));
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
    const { port } = upstream.address() as { port: number };
    try {
      await withProxy(`http://127.0.0.1:${port}`, async (proxyUrl, logPath) => {
        const res = await fetch(`${proxyUrl}/bot123:ABC/sendPhoto`, {
          method: "POST",
          // multipart without a boundary makes parseTelegramBody throw.
          headers: { "content-type": "multipart/form-data" },
          body: "garbage",
          signal: AbortSignal.timeout(5000),
        });
        expect(res.status).toBe(502);
        expect(await res.json()).toEqual(PROXY_ERROR_BODY);
        const raw = readFileSync(logPath, "utf8");
        expect(raw).not.toContain("123:ABC");
        expect(JSON.parse(raw.trim())).toMatchObject({
          method: "sendPhoto",
          request: {},
          response: { proxyError: expect.stringContaining("boundary") },
        });
      });
    } finally {
      await new Promise<void>((r) => upstream.close(() => r()));
    }
  });
});
