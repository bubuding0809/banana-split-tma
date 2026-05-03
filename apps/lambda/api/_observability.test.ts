import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import {
  createLogger,
  withRequestContext,
  withRequestLogger,
} from "@repo/logger";

describe("lambda observability", () => {
  it("returns x-request-id header on every response and logs req.start/end", async () => {
    const lines: string[] = [];
    const log = createLogger("lambda", {
      destination: { write: (s) => lines.push(s) },
    });

    const app = express();
    app.use(withRequestContext());
    app.use(withRequestLogger(log));
    app.get("/health", (_req, res) => res.json({ ok: true }));

    const r = await request(app).get("/health").expect(200);
    expect(r.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

    const events = lines.map((l) => JSON.parse(l).msg);
    expect(events).toContain("req.start");
    expect(events).toContain("req.end");
  });
});
