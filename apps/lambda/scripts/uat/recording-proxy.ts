import { createServer } from "node:http";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseTelegramBody } from "./wire.js";

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
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    const url = req.url ?? "/";
    const isFile = url.startsWith("/file/");
    const method = isFile
      ? "file"
      : (url.split("?")[0]!.split("/").pop() ?? "");
    const contentType = req.headers["content-type"] ?? "";

    const upstreamRes = await fetch(upstream + url, {
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
