import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "./createLogger.js";

// Spy on Axiom's ingest method without making real HTTP calls. We replace
// the prototype method so any client constructed inside createLogger picks
// up the spy.
vi.mock("@axiomhq/js", async () => {
  const ingest = vi.fn();
  const flush = vi.fn(async () => {});
  class FakeAxiom {
    ingest = ingest;
    flush = flush;
  }
  return { Axiom: FakeAxiom, __ingest: ingest, __flush: flush };
});

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

describe("createLogger Axiom transport", () => {
  const originalToken = process.env.AXIOM_TOKEN;
  const originalDataset = process.env.AXIOM_DATASET;

  beforeEach(async () => {
    const mod = (await import("@axiomhq/js")) as unknown as {
      __ingest: { mockClear: () => void };
      __flush: { mockClear: () => void };
    };
    mod.__ingest.mockClear();
    mod.__flush.mockClear();
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.AXIOM_TOKEN;
    else process.env.AXIOM_TOKEN = originalToken;
    if (originalDataset === undefined) delete process.env.AXIOM_DATASET;
    else process.env.AXIOM_DATASET = originalDataset;
  });

  it("bypasses Axiom when an explicit destination is provided", async () => {
    process.env.AXIOM_TOKEN = "test-token";
    process.env.AXIOM_DATASET = "test-dataset";

    const lines: string[] = [];
    const logger = createLogger("lambda", {
      destination: { write: (s) => lines.push(s) },
    });

    logger.info("explicit-destination-wins");

    expect(lines).toHaveLength(1);
    const mod = (await import("@axiomhq/js")) as unknown as {
      __ingest: { mock: { calls: unknown[] } };
    };
    expect(mod.__ingest.mock.calls).toHaveLength(0);
  });

  it("does not spin up an Axiom transport when env vars are missing", async () => {
    delete process.env.AXIOM_TOKEN;
    delete process.env.AXIOM_DATASET;

    const logger = createLogger("bot");

    // Should not throw — just stdout-only.
    logger.info("no-axiom-config");

    const mod = (await import("@axiomhq/js")) as unknown as {
      __ingest: { mock: { calls: unknown[] } };
    };
    expect(mod.__ingest.mock.calls).toHaveLength(0);
  });

  it("forwards log lines to Axiom when AXIOM_TOKEN + AXIOM_DATASET are set", async () => {
    process.env.AXIOM_TOKEN = "test-token";
    process.env.AXIOM_DATASET = "test-dataset";

    const logger = createLogger("lambda");
    logger.info({ chat_id: "-100" }, "axiom.flow");

    const mod = (await import("@axiomhq/js")) as unknown as {
      __ingest: { mock: { calls: unknown[][] } };
    };

    // pino.multistream may write asynchronously; give it a tick.
    await new Promise((r) => setImmediate(r));

    expect(mod.__ingest.mock.calls.length).toBeGreaterThanOrEqual(1);
    const [dataset, events] = mod.__ingest.mock.calls[0]! as [
      string,
      Array<Record<string, unknown>>,
    ];
    expect(dataset).toBe("test-dataset");
    expect(Array.isArray(events)).toBe(true);
    const event = events[0]!;
    expect(event.service).toBe("lambda");
    expect(event.msg).toBe("axiom.flow");
    expect(event.chat_id).toBe("-100");
  });
});
