import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { withRequestContext, withRequestLogger } from "./middleware.js";
import { createLogger } from "./createLogger.js";
import { getRequestId } from "./requestContext.js";

describe("withRequestContext", () => {
  it("assigns a UUID request_id available via getRequestId", async () => {
    const app = express();
    let observed: string | undefined;

    app.use(withRequestContext());
    app.get("/x", (_req, res) => {
      observed = getRequestId();
      res.json({ ok: true });
    });

    const r = await request(app).get("/x").expect(200);
    expect(observed).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.headers["x-request-id"]).toBe(observed);
  });

  it("uses incoming x-request-id header when present", async () => {
    const app = express();
    let observed: string | undefined;

    app.use(withRequestContext());
    app.get("/x", (_req, res) => {
      observed = getRequestId();
      res.json({ ok: true });
    });

    const r = await request(app)
      .get("/x")
      .set("x-request-id", "incoming-id")
      .expect(200);
    expect(observed).toBe("incoming-id");
    expect(r.headers["x-request-id"]).toBe("incoming-id");
  });
});

describe("withRequestLogger", () => {
  it("logs req.start and req.end with status + duration_ms", async () => {
    const lines: string[] = [];
    const log = createLogger("lambda", {
      destination: { write: (s) => lines.push(s) },
    });

    const app = express();
    app.use(withRequestContext());
    app.use(withRequestLogger(log));
    app.get("/x", (_req, res) => res.status(201).json({ ok: true }));

    await request(app).get("/x").expect(201);

    const parsed = lines.map((l) => JSON.parse(l));
    const start = parsed.find((p) => p.msg === "req.start");
    const end = parsed.find((p) => p.msg === "req.end");

    expect(start).toBeDefined();
    expect(start.method).toBe("GET");
    expect(start.path).toBe("/x");
    expect(start.request_id).toMatch(/^[0-9a-f-]{36}$/);

    expect(end).toBeDefined();
    expect(end.status).toBe(201);
    expect(typeof end.duration_ms).toBe("number");
    expect(end.duration_ms).toBeGreaterThanOrEqual(0);
    expect(end.request_id).toBe(start.request_id);
    expect(end.aborted).toBe(false);
  });
});
