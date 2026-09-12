import { createServer } from "node:http";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseTelegramBody } from "./wire.js";
import { redactBotToken } from "../../api/_redact.js";

export type RecordedEntry = {
  seq: number;
  method: string;
  request: Record<string, unknown>;
  response: unknown;
};

function safeJson(buf: Buffer): unknown {
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return { raw: buf.toString("utf8").slice(0, 500) };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Forward one request upstream, retrying only when fetch itself rejects
 * (DNS, ECONNRESET, TLS). api.telegram.org resets the occasional connection,
 * and without this a blip fails a UAT step that has nothing wrong with it —
 * a run once lost its first three calls that way. An HTTP error response is
 * NOT retried: a real 400 from Telegram must still reach the caller and fail
 * the step. The body is a Buffer, so replaying it is safe.
 */
async function fetchUpstream(
  url: string,
  init: RequestInit,
  attempts = 3
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(250 * (i + 1));
    }
  }
  throw lastErr;
}

/**
 * Forwards every request to the real Bot API and appends one JSONL line per
 * call. File downloads (/file/bot<token>/...) are logged as method "file"
 * with only the byte count and sha256 of the response; the token never
 * reaches the log.
 */
export async function startRecordingProxy(opts: {
  port?: number;
  upstream?: string;
  logPath: string;
}): Promise<{ url: string; close(): Promise<void> }> {
  const upstream = (opts.upstream ?? "https://api.telegram.org").replace(
    /\/$/,
    ""
  );
  mkdirSync(dirname(opts.logPath), { recursive: true });
  let seq = 0;

  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    const isFile = url.startsWith("/file/");
    const method = isFile
      ? "file"
      : (url.split("?")[0]!.split("/").pop() ?? "");
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks);
      const contentType = req.headers["content-type"] ?? "";

      const upstreamRes = await fetchUpstream(upstream + url, {
        method: req.method,
        headers: contentType ? { "content-type": contentType } : undefined,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : raw,
      });
      const resBuf = Buffer.from(await upstreamRes.arrayBuffer());

      const request = isFile ? {} : await parseTelegramBody(contentType, raw);
      // telegraf echoes the method name inside multipart bodies; grammy does not.
      // Telegram ignores it, so it is not part of the wire contract we record.
      if (request.method === method) delete request.method;

      const entry: RecordedEntry = {
        seq: ++seq,
        method,
        request,
        response: isFile
          ? {
              status: upstreamRes.status,
              bytes: resBuf.length,
              sha256: createHash("sha256").update(resBuf).digest("hex"),
            }
          : safeJson(resBuf),
      };
      appendFileSync(opts.logPath, JSON.stringify(entry) + "\n");

      res.statusCode = upstreamRes.status;
      const ct = upstreamRes.headers.get("content-type");
      if (ct) res.setHeader("content-type", ct);
      res.end(resBuf);
    } catch (err) {
      // Never rethrow: an unhandled rejection here kills the runner before its
      // finally block stops the dev server and deletes the rows it created.
      const cause =
        err instanceof Error && err.cause instanceof Error
          ? ` (${err.cause.message})`
          : "";
      const detail = err instanceof Error ? err.message : String(err);
      const entry: RecordedEntry = {
        seq: ++seq,
        method,
        request: {},
        response: { proxyError: redactBotToken(detail + cause) },
      };
      try {
        appendFileSync(opts.logPath, JSON.stringify(entry) + "\n");
      } catch {
        // Recording is best effort once something has already gone wrong.
      }
      if (!res.headersSent) {
        res.statusCode = 502;
        res.setHeader("content-type", "application/json");
      }
      res.end(
        JSON.stringify({
          ok: false,
          error_code: 502,
          description: "recording proxy error",
        })
      );
    }
  });

  await new Promise<void>((resolve) =>
    server.listen(opts.port ?? 8082, "127.0.0.1", resolve)
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("proxy did not bind a port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const logIdx = process.argv.indexOf("--log");
  const logPath = logIdx >= 0 ? process.argv[logIdx + 1] : undefined;
  if (!logPath) {
    console.error(
      "usage: tsx scripts/uat/recording-proxy.ts --log <file.jsonl> [--port 8082]"
    );
    process.exit(2);
  }
  const portIdx = process.argv.indexOf("--port");
  const port = portIdx >= 0 ? Number(process.argv[portIdx + 1]) : 8082;
  startRecordingProxy({ port, logPath }).then((proxy) => {
    console.log(
      `recording proxy on ${proxy.url} -> https://api.telegram.org, log ${logPath}`
    );
  });
}
