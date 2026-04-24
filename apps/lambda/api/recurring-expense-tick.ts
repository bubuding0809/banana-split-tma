import { Router, type Request, type Response } from "express";
import { Telegram } from "telegraf";
import { prisma } from "@dko/database";
import {
  createExpenseHandler,
  verifyRecurringExpenseSignature,
} from "@dko/trpc";
import { env } from "./env.js";

/**
 * Webhook hit by the external RecurringExpenseLambda each time an EventBridge
 * Schedule fires for an active RecurringExpenseTemplate. The Lambda signs
 * the templateId with HMAC-SHA256 (shared secret RECURRING_EXPENSE_WEBHOOK_SECRET)
 * and posts:
 *
 *   { templateId: "<uuid>", occurrenceDate: "<ISO timestamp>" }
 *
 * with header  X-Recurring-Signature: <hex hmac of templateId>.
 *
 * Replay/dup defenses:
 *   - HMAC verification (signature over templateId).
 *   - Freshness window: |now - occurrenceDate| <= 15 minutes.
 *   - Template must exist & be ACTIVE & within endDate.
 *   - Unique index on (recurringTemplateId, date) makes the materialised
 *     write idempotent against AWS retries.
 */

const FRESHNESS_WINDOW_MS = 15 * 60 * 1000;

const router = Router();

router.post("/recurring-expense-tick", async (req: Request, res: Response) => {
  const sig = req.header("x-recurring-signature");
  const { templateId, occurrenceDate } = (req.body ?? {}) as {
    templateId?: string;
    occurrenceDate?: string;
  };

  if (!sig || !templateId || !occurrenceDate) {
    return res.status(401).json({ error: "missing signature or fields" });
  }

  // 1. Verify HMAC.
  if (
    !verifyRecurringExpenseSignature(
      templateId,
      sig,
      env.RECURRING_EXPENSE_WEBHOOK_SECRET
    )
  ) {
    return res.status(401).json({ error: "bad signature" });
  }

  // 2. Freshness window — reject if occurrenceDate is more than +-15 min
  //    from now. Catches replayed packets long after they were issued.
  const occurrenceMs = Date.parse(occurrenceDate);
  if (
    Number.isNaN(occurrenceMs) ||
    Math.abs(Date.now() - occurrenceMs) > FRESHNESS_WINDOW_MS
  ) {
    return res.status(401).json({ error: "stale or invalid occurrenceDate" });
  }

  // 3. Load template.
  const tmpl = await prisma.recurringExpenseTemplate.findUnique({
    where: { id: templateId },
  });
  if (!tmpl || tmpl.status !== "ACTIVE") {
    return res.status(410).json({ error: "template missing or not active" });
  }

  // 4. End-date guard.
  if (tmpl.endDate && new Date(occurrenceMs) > tmpl.endDate) {
    return res.status(410).json({ error: "past template endDate" });
  }

  // 5. Biweekly skip — for WEEKLY interval > 1, only fire if the week-of-year
  //    delta from startDate is divisible by interval. EventBridge fires every
  //    week regardless of interval, so we filter on each firing.
  if (tmpl.frequency === "WEEKLY" && tmpl.interval > 1) {
    const weeks = Math.floor(
      (occurrenceMs - tmpl.startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    if (weeks % tmpl.interval !== 0) {
      return res.status(200).json({ skipped: "interval-skip" });
    }
  }

  // 6. Materialise the occurrence. The (recurringTemplateId, date) unique
  //    index makes this idempotent against AWS retries.
  const occurrenceDateOnly = new Date(occurrenceMs);
  occurrenceDateOnly.setUTCHours(0, 0, 0, 0);

  // customSplits is stored as JSON-safe (userId stringified for BigInt).
  // Rehydrate to bigint before handing to createExpenseHandler.
  const customSplits = tmpl.customSplits
    ? (
        tmpl.customSplits as unknown as Array<{
          userId: string | number;
          amount: number;
        }>
      ).map((s) => ({ userId: BigInt(s.userId), amount: s.amount }))
    : undefined;

  try {
    const created = await createExpenseHandler(
      {
        chatId: tmpl.chatId,
        creatorId: tmpl.creatorId,
        payerId: tmpl.payerId,
        description: tmpl.description,
        amount: Number(tmpl.amount),
        date: occurrenceDateOnly,
        currency: tmpl.currency,
        splitMode: tmpl.splitMode,
        participantIds: tmpl.participantIds,
        customSplits,
        categoryId: tmpl.categoryId ?? null,
        sendNotification: true,
      },
      prisma,
      new Telegram(env.TELEGRAM_BOT_TOKEN)
    );
    await prisma.expense.update({
      where: { id: created.id },
      data: { recurringTemplateId: tmpl.id },
    });
    return res.status(200).json({ expenseId: created.id });
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return res.status(200).json({ skipped: "duplicate" });
    }
    console.error("recurring-expense-tick failed", err);
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "unknown" });
  }
});

export default router;
