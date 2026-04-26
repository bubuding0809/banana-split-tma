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

  it("returns 200 with skipped:duplicate when createExpenseHandler throws a unique-constraint error", async () => {
    // Verifies the dedupe path works end-to-end: when AWS Scheduler retries
    // a fire (or when a manual same-day expense already exists for this
    // template+date), the (recurringTemplateId, date) unique index trips and
    // Prisma throws P2002. createExpenseHandler now preserves the underlying
    // message, so the webhook's `/unique/i` check matches and we return a
    // 200 instead of a 500 that AWS would treat as a retryable failure.
    findUniqueMock.mockResolvedValueOnce({
      id: TEMPLATE_ID,
      chatId: 1n,
      creatorId: 1n,
      payerId: 1n,
      description: "Rent",
      amount: { toString: () => "100" },
      currency: "SGD",
      splitMode: "EQUAL",
      participantIds: [1n],
      customSplits: null,
      categoryId: null,
      frequency: "WEEKLY",
      interval: 1,
      weekdays: ["SAT"],
      anchorDate: new Date("2026-04-24T16:00:00Z"),
      endDate: null,
      timezone: "Asia/Singapore",
      status: "ACTIVE",
    });
    createExpenseHandlerMock.mockRejectedValueOnce(
      new Error(
        "Unique constraint failed on the fields: (`recurringTemplateId`,`date`)"
      )
    );

    const occurrenceDate = NOW;
    const sig = signRecurringExpensePayload(
      TEMPLATE_ID,
      occurrenceDate,
      SECRET
    );
    const res = await request(app)
      .post("/api/internal/recurring-expense-tick")
      .set("X-Recurring-Signature", sig)
      .send({ templateId: TEMPLATE_ID, occurrenceDate });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ skipped: "duplicate" });
  });

  it("materialises Expense.date as template-tz midnight, not UTC midnight", async () => {
    // Freeze "now" inside the freshness window for the chosen occurrence.
    // 2026-04-25T08:33:00Z = 2026-04-25 16:33 SGT, so SGT-midnight of the
    // local day is 2026-04-24T16:00:00Z — NOT the UTC-midnight of
    // 2026-04-25T00:00:00Z that the buggy `setUTCHours(0,0,0,0)` would
    // produce.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T08:33:00Z"));
    try {
      findUniqueMock.mockResolvedValueOnce({
        id: TEMPLATE_ID,
        chatId: 1n,
        creatorId: 1n,
        payerId: 1n,
        description: "Rent",
        amount: { toString: () => "100" },
        currency: "SGD",
        splitMode: "EQUAL",
        participantIds: [1n],
        customSplits: null,
        categoryId: null,
        frequency: "WEEKLY",
        interval: 1,
        weekdays: ["SAT"],
        anchorDate: new Date("2026-04-24T16:00:00Z"),
        endDate: null,
        timezone: "Asia/Singapore",
        status: "ACTIVE",
      });
      createExpenseHandlerMock.mockResolvedValueOnce({ id: "exp-new" });

      const occurrenceDate = "2026-04-25T08:33:00Z";
      const sig = signRecurringExpensePayload(
        TEMPLATE_ID,
        occurrenceDate,
        SECRET
      );
      const res = await request(app)
        .post("/api/internal/recurring-expense-tick")
        .set("X-Recurring-Signature", sig)
        .send({ templateId: TEMPLATE_ID, occurrenceDate });

      expect(res.status).toBe(200);
      expect(createExpenseHandlerMock).toHaveBeenCalledTimes(1);
      const passedDate = createExpenseHandlerMock.mock.calls[0][0].date as Date;
      // SGT midnight of 2026-04-25 → 2026-04-24T16:00:00Z (UTC+8 offset).
      expect(passedDate.toISOString()).toBe("2026-04-24T16:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
});
