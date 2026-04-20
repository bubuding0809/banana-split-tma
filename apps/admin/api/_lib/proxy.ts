import type { VercelRequest, VercelResponse } from "@vercel/node";
import { env } from "./env.js";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "host",
  "content-length",
]);

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function buildForwardHeaders(req: VercelRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower === "cookie") continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  headers.set("x-api-key", env.ADMIN_LAMBDA_API_KEY);
  return headers;
}

export async function proxyToLambda(
  req: VercelRequest,
  res: VercelResponse,
  targetUrl: string
): Promise<void> {
  const method = req.method ?? "GET";
  const methodAllowsBody = method !== "GET" && method !== "HEAD";
  const body = methodAllowsBody ? await readRawBody(req) : undefined;

  const upstream = await fetch(targetUrl, {
    method,
    headers: buildForwardHeaders(req),
    body: body && body.length > 0 ? body : undefined,
    redirect: "manual",
  });

  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower === "set-cookie") return;
    // fetch() auto-decompressed the body; don't claim it's still encoded.
    if (lower === "content-encoding") return;
    res.setHeader(key, value);
  });

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.send(buf);
}
