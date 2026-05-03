import { describe, it, expect } from "vitest";
import { createLogger } from "./createLogger.js";

describe("createLogger", () => {
  it("emits structured JSON with the service field", () => {
    const lines: string[] = [];
    const logger = createLogger("lambda", {
      destination: { write: (s) => lines.push(s) },
    });

    logger.info({ chat_id: "-100" }, "auth.ok");

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.service).toBe("lambda");
    expect(parsed.msg).toBe("auth.ok");
    expect(parsed.chat_id).toBe("-100");
    expect(parsed.level).toBe(30);
  });

  it("respects LOG_LEVEL env override", () => {
    const lines: string[] = [];
    const logger = createLogger("bot", {
      level: "warn",
      destination: { write: (s) => lines.push(s) },
    });

    logger.info("ignored");
    logger.warn("kept");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).msg).toBe("kept");
  });

  it("serializes errors with type/message/stack", () => {
    const lines: string[] = [];
    const logger = createLogger("lambda", {
      destination: { write: (s) => lines.push(s) },
    });

    class ExpiredError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "ExpiredError";
      }
    }
    logger.error(
      { err: new ExpiredError("Init data is expired") },
      "auth.failed"
    );

    const parsed = JSON.parse(lines[0]!);
    expect(parsed.err.type).toBe("ExpiredError");
    expect(parsed.err.message).toBe("Init data is expired");
    expect(parsed.err.stack).toContain("ExpiredError");
  });
});
