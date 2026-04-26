import { describe, it, expect } from "vitest";
import { redactBotToken } from "./_redact.js";

describe("redactBotToken", () => {
  it("redacts a Telegram bot token from an Error message", () => {
    const err = new Error(
      "ECONNREFUSED https://api.telegram.org/file/bot7234567890:AAabcDEF-_xyz/photos/file_42.jpg"
    );
    const out = redactBotToken(err);
    expect(out).not.toMatch(/AAabcDEF/);
    expect(out).toMatch(/bot\[REDACTED\]/);
  });

  it("redacts multiple occurrences (global flag)", () => {
    const err = new Error("tried bot1234:abc then retried bot5678:xyz");
    const out = redactBotToken(err);
    expect(out).toBe("tried bot[REDACTED] then retried bot[REDACTED]");
  });

  it("redacts even when err is a bare string (defense-in-depth)", () => {
    const out = redactBotToken(
      "GET https://api.telegram.org/file/bot999:secretToken failed"
    );
    expect(out).not.toMatch(/secretToken/);
    expect(out).toMatch(/bot\[REDACTED\]/);
  });

  it("returns the original message unchanged when no token present", () => {
    expect(redactBotToken(new Error("flood wait"))).toBe("flood wait");
  });

  it("stringifies non-Error non-string values", () => {
    expect(redactBotToken(42)).toBe("42");
    expect(redactBotToken({ code: "X" })).toBe("[object Object]");
  });
});
