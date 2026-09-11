import { createServer } from "node:http";
import { createHash } from "node:crypto";

export type FileSummary = { filename: string; bytes: number; sha256: string };
export type RecordedCall = { method: string; body: Record<string, unknown> };

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

export type Responder = (
  method: string,
  body: Record<string, unknown>
) => unknown;

const photo = [
  {
    file_id: "photo-file-id",
    file_unique_id: "photo-unique",
    width: 1,
    height: 1,
  },
];
const video = {
  file_id: "video-file-id",
  file_unique_id: "video-unique",
  width: 1,
  height: 1,
  duration: 1,
};

export const defaultResponder: Responder = (method, body) => {
  const chat = { id: body.chat_id ?? 0, type: "private" };
  switch (method) {
    case "getMe":
      return {
        id: 1,
        is_bot: true,
        first_name: "Test Bot",
        username: "testbot",
      };
    case "deleteMessage":
      return true;
    case "sendPhoto":
      return { message_id: 1, date: 0, chat, photo };
    case "sendVideo":
      return { message_id: 1, date: 0, chat, video };
    case "editMessageMedia": {
      const media = body.media as { type?: string } | undefined;
      return media?.type === "video"
        ? { message_id: Number(body.message_id ?? 1), date: 0, chat, video }
        : { message_id: Number(body.message_id ?? 1), date: 0, chat, photo };
    }
    default:
      return {
        message_id: Number(body.message_id ?? 1),
        date: 0,
        chat,
        text: typeof body.text === "string" ? body.text : "",
      };
  }
};

export type FakeTelegramServer = {
  url: string;
  calls: RecordedCall[];
  close(): Promise<void>;
};

export async function startFakeTelegramServer(
  responder: Responder = defaultResponder
): Promise<FakeTelegramServer> {
  const calls: RecordedCall[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    const method = (req.url ?? "").split("?")[0]!.split("/").pop() ?? "";
    const body = await parseTelegramBody(
      req.headers["content-type"] ?? "",
      raw
    );
    // telegraf echoes the method name inside multipart bodies; grammy does not.
    // Telegram ignores it, so it is not part of the wire contract we snapshot.
    if (body.method === method) delete body.method;
    calls.push({ method, body });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, result: responder(method, body) }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("fake telegram server did not bind a port");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}
