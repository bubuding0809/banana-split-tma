import { describe, it, expect } from "vitest";
import { stdSerializers } from "pino";
import { createLogger, redactingErrSerializer } from "./index.js";

const SECRET = "ABCdef-SECRET_xyz";
const TOKEN_URL = `https://api.telegram.org/bot123456:${SECRET}/getMe`;

function tokenBearingError(): Error {
  const inner = new Error(`request to ${TOKEN_URL} failed, reason: ECONNRESET`);
  inner.stack = `FetchError: request to ${TOKEN_URL} failed\n    at x (y.js:1:1)`;
  const cause = new Error(`cause: ${TOKEN_URL}`);
  const err = new Error(`outer ${TOKEN_URL}`, { cause });
  err.stack = `Error: outer ${TOKEN_URL}\n    at z (w.js:1:1)`;
  Object.assign(err, {
    error: inner,
    context: { url: TOKEN_URL, nested: [TOKEN_URL, 42] },
  });
  return err;
}

describe("redactingErrSerializer", () => {
  it("scrubs the bot token from message, stack, nested error, cause and extra fields", () => {
    const out = redactingErrSerializer(tokenBearingError());
    const json = JSON.stringify(out);
    expect(json).not.toContain(SECRET);
    expect(json).toContain("bot[REDACTED]");
    const o = out as unknown as {
      message: string;
      stack: string;
      error: { message: string; stack: string };
      context: { url: string; nested: unknown[] };
    };
    expect(o.message).not.toContain(SECRET);
    expect(o.stack).not.toContain(SECRET);
    expect(o.error.message).not.toContain(SECRET);
    expect(o.error.stack).not.toContain(SECRET);
    expect(o.context.url).not.toContain(SECRET);
    expect(o.context.nested[1]).toBe(42);
  });

  it("does not mutate the caller's objects", () => {
    const err = tokenBearingError();
    redactingErrSerializer(err);
    expect((err as unknown as { context: { url: string } }).context.url).toBe(
      TOKEN_URL
    );
  });

  it("serializes a token-free error identically to pino's stdSerializers.err", () => {
    const err = new Error("plain failure");
    Object.assign(err, { code: "E_PLAIN", detail: { n: 1, list: ["a"] } });
    expect(JSON.stringify(redactingErrSerializer(err))).toBe(
      JSON.stringify(stdSerializers.err(err))
    );
  });

  it("is the err serializer createLogger installs", () => {
    const lines: string[] = [];
    const logger = createLogger("lambda", {
      destination: { write: (s) => lines.push(s) },
    });
    logger.error({ err: tokenBearingError() }, "telegram.send.failed");
    logger.error(tokenBearingError(), "telegram.send.failed.direct");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).not.toContain(SECRET);
      expect(JSON.parse(line).err.type).toBe("Error");
    }
  });
});
