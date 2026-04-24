import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { signRecurringExpensePayload } from "@dko/trpc";

// Set env BEFORE env.ts is imported (transitively via the route).
// vi.hoisted runs before any module imports.
const { SECRET, createExpenseHandlerMock, findUniqueMock } = vi.hoisted(() => {
  process.env.RECURRING_EXPENSE_WEBHOOK_SECRET = "x".repeat(64);
  process.env.TELEGRAM_BOT_TOKEN ??= "test-bot-token";
  process.env.API_KEY ??= "test-api-key";
  process.env.INTERNAL_AGENT_KEY ??= "test-internal-agent-key";
  return {
    SECRET: process.env.RECURRING_EXPENSE_WEBHOOK_SECRET!,
    createExpenseHandlerMock: vi.fn(),
    findUniqueMock: vi.fn(),
  };
});

vi.mock("@dko/trpc", async (orig) => {
  const real = await orig<typeof import("@dko/trpc")>();
  return { ...real, createExpenseHandler: createExpenseHandlerMock };
});

vi.mock("@dko/database", async (orig) => {
  const real = await orig<typeof import("@dko/database")>();
  return {
    ...real,
    prisma: {
      recurringExpenseTemplate: { findUnique: findUniqueMock },
      expense: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
    },
  };
});

import recurringExpenseTickRouter from "./recurring-expense-tick.js";

const app = express();
app.use(express.json());
app.use("/api/internal", recurringExpenseTickRouter);

beforeEach(() => {
  vi.clearAllMocks();
});

const TEMPLATE_ID = "11111111-1111-1111-1111-111111111111";
const NOW = new Date().toISOString();
const PAST_30M = new Date(Date.now() - 30 * 60_000).toISOString();

describe("POST /api/internal/recurring-expense-tick", () => {
  it("rejects 401 on missing signature", async () => {
    const res = await request(app)
      .post("/api/internal/recurring-expense-tick")
      .send({ templateId: TEMPLATE_ID, occurrenceDate: NOW });
    expect(res.status).toBe(401);
  });

  it("rejects 401 on bad signature", async () => {
    const res = await request(app)
      .post("/api/internal/recurring-expense-tick")
      .set("X-Recurring-Signature", "deadbeef".repeat(8))
      .send({ templateId: TEMPLATE_ID, occurrenceDate: NOW });
    expect(res.status).toBe(401);
  });

  it("rejects 401 when occurrenceDate is too stale", async () => {
    const sig = signRecurringExpensePayload(TEMPLATE_ID, PAST_30M, SECRET);
    const res = await request(app)
      .post("/api/internal/recurring-expense-tick")
      .set("X-Recurring-Signature", sig)
      .send({ templateId: TEMPLATE_ID, occurrenceDate: PAST_30M });
    expect(res.status).toBe(401);
  });

  it("returns 410 when template not found", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const sig = signRecurringExpensePayload(TEMPLATE_ID, NOW, SECRET);
    const res = await request(app)
      .post("/api/internal/recurring-expense-tick")
      .set("X-Recurring-Signature", sig)
      .send({ templateId: TEMPLATE_ID, occurrenceDate: NOW });
    expect(res.status).toBe(410);
  });

  it("returns 410 when template is canceled", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: TEMPLATE_ID,
      status: "CANCELED",
    });
    const sig = signRecurringExpensePayload(TEMPLATE_ID, NOW, SECRET);
    const res = await request(app)
      .post("/api/internal/recurring-expense-tick")
      .set("X-Recurring-Signature", sig)
      .send({ templateId: TEMPLATE_ID, occurrenceDate: NOW });
    expect(res.status).toBe(410);
  });
});
