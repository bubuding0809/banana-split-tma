import { createHash } from "node:crypto";

// Copy of packages/trpc/src/testing/fakeTelegramServer.ts parseTelegramBody.
// Kept in sync by hand; lambda consumes @dko/trpc via dist so test helpers
// are not importable.

export type FileSummary = { filename: string; bytes: number; sha256: string };

function parseScalar(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Collapse `attach://<name>` references onto the file part they point at,
 * then append any file part that was sent directly under its own field
 * name. Both telegraf and grammy end up producing the same shape.
 */
function resolveAttachRefs(
  fields: Record<string, unknown>,
  files: Record<string, FileSummary>
): Record<string, unknown> {
  const consumed = new Set<string>();
  const walk = (value: unknown): unknown => {
    if (typeof value === "string" && value.startsWith("attach://")) {
      const name = value.slice("attach://".length);
      const file = files[name];
      if (file) {
        consumed.add(name);
        return file;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          walk(v),
        ])
      );
    }
    return value;
  };
  const out = walk(fields) as Record<string, unknown>;
  for (const [name, file] of Object.entries(files)) {
    if (!consumed.has(name)) out[name] = file;
  }
  return out;
}

/**
 * Parse a Bot API request body into a plain object. JSON bodies parse as-is.
 * Multipart bodies collapse file parts into { filename, bytes, sha256 }.
 */
export async function parseTelegramBody(
  contentType: string,
  raw: Buffer
): Promise<Record<string, unknown>> {
  if (contentType.startsWith("application/json")) {
    return raw.length
      ? (JSON.parse(raw.toString("utf8")) as Record<string, unknown>)
      : {};
  }
  if (contentType.startsWith("multipart/form-data")) {
    const form = await new Response(raw, {
      headers: { "content-type": contentType },
    }).formData();
    const fields: Record<string, unknown> = {};
    const files: Record<string, FileSummary> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        fields[key] = parseScalar(value);
      } else {
        const buf = Buffer.from(await value.arrayBuffer());
        files[key] = {
          filename: value.name,
          bytes: buf.length,
          sha256: createHash("sha256").update(buf).digest("hex"),
        };
      }
    }
    return resolveAttachRefs(fields, files);
  }
  if (contentType.startsWith("application/x-www-form-urlencoded")) {
    return Object.fromEntries(
      [...new URLSearchParams(raw.toString("utf8"))].map(([k, v]) => [
        k,
        parseScalar(v),
      ])
    );
  }
  return { raw: raw.toString("utf8") };
}
