import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Telegram } from "telegraf";
import { SplitMode } from "@dko/database";
import { BASE_CATEGORIES } from "@repo/categories";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { escapeMarkdown } from "../../utils/telegram.js";

const MAX_ITEMS_SHOWN = 10;

const summaryItemSchema = z.object({
  description: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  categoryId: z.string().nullable().optional(),
  payerId: z
    .number()
    .transform((v) => BigInt(v))
    .optional(),
  splitMode: z.nativeEnum(SplitMode).optional(),
  participantCount: z.number().int().positive().optional(),
});

export const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  kind: z.enum(["created", "updated"]),
  items: z.array(summaryItemSchema).min(1, "At least one item required"),
  actorName: z.string().min(1).optional(),
  threadId: z.number().optional(),
});

export const outputSchema = z.object({
  sent: z.boolean(),
  messageId: z.number().nullable(),
});

const formatAmount = (currency: string, amount: number): string =>
  `${currency} ${amount.toFixed(2)}`;

type ResolvedItem = {
  description: string;
  amount: number;
  currency: string;
  categoryEmoji?: string;
  categoryTitle?: string;
  payerName?: string;
  splitMode?: SplitMode;
  participantCount?: number;
};

export const formatBatchSummaryMessage = (
  kind: "created" | "updated",
  items: ResolvedItem[],
  actorName?: string
): string => {
  const count = items.length;
  const icon = kind === "created" ? "📥" : "📝";
  const action = kind === "created" ? "imported" : "updated";
  const noun = count === 1 ? "expense" : "expenses";
  const header = `${icon} *${count} ${noun} ${action}*`;

  const shown = items.slice(0, MAX_ITEMS_SHOWN);
  const overflow = count - shown.length;

  // Each row becomes a Telegram MarkdownV2 blockquote (`>` line prefix),
  // which renders as a muted/tighter block that visually shrinks the
  // item next to the header. Every field lives on its own ┣/┗ branch;
  // fields that aren't provided just drop out of the block.
  const blocks = shown.map((item) => {
    const desc = escapeMarkdown(item.description, 2);
    const amt = escapeMarkdown(formatAmount(item.currency, item.amount), 2);

    // Order matters — these are the branches under the 🧾 title line.
    const branches: string[] = [amt];
    if (item.payerName) {
      branches.push(`paid by ${escapeMarkdown(item.payerName, 2)}`);
    }
    if (item.categoryEmoji && item.categoryTitle) {
      branches.push(
        `${item.categoryEmoji} ${escapeMarkdown(item.categoryTitle, 2)}`
      );
    }
    if (item.splitMode !== undefined || item.participantCount !== undefined) {
      const mode = item.splitMode
        ? escapeMarkdown(String(item.splitMode), 2)
        : "split";
      const acrossN =
        item.participantCount !== undefined
          ? ` split across ${item.participantCount}`
          : "";
      branches.push(`${mode}${acrossN}`);
    }

    const lastIdx = branches.length - 1;
    const lines = [
      `>🧾 ${desc}`,
      ...branches.map((b, i) => `>${i === lastIdx ? "┗" : "┣"} ${b}`),
    ];

    return lines.join("\n");
  });

  if (overflow > 0) {
    blocks.push(`_…and ${overflow} more_`);
  }

  const footer = actorName
    ? `\n\n_— ${action} by ${escapeMarkdown(actorName, 2)}_`
    : "";

  return `${header}\n\n${blocks.join("\n\n")}${footer}`;
};

export const sendBatchExpenseSummaryHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Telegram
) => {
  const chat = await db.chat.findUnique({
    where: { id: input.chatId },
    select: { id: true, threadId: true },
  });
  if (!chat) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found" });
  }

  // Resolve category labels in one DB round-trip per chat.
  const chatCategoryUuids = new Set<string>();
  for (const item of input.items) {
    if (item.categoryId?.startsWith("chat:")) {
      chatCategoryUuids.add(item.categoryId.slice("chat:".length));
    }
  }
  const chatCategoryRows = chatCategoryUuids.size
    ? await db.chatCategory.findMany({
        where: {
          chatId: input.chatId,
          id: { in: Array.from(chatCategoryUuids) },
        },
        select: { id: true, emoji: true, title: true },
      })
    : [];
  const chatCategoryById = new Map(
    chatCategoryRows.map((r) => [r.id, { emoji: r.emoji, title: r.title }])
  );

  // Resolve payer firstNames in one round-trip across the batch.
  const payerIds = new Set<bigint>();
  for (const item of input.items) {
    if (item.payerId !== undefined) payerIds.add(item.payerId);
  }
  const payerRows = payerIds.size
    ? await db.user.findMany({
        where: { id: { in: Array.from(payerIds) } },
        select: { id: true, firstName: true },
      })
    : [];
  const payerById = new Map(
    payerRows.map((r) => [r.id.toString(), r.firstName])
  );

  const resolved: ResolvedItem[] = input.items.map((item) => {
    let categoryEmoji: string | undefined;
    let categoryTitle: string | undefined;
    if (item.categoryId?.startsWith("base:")) {
      const base = BASE_CATEGORIES.find((c) => c.id === item.categoryId);
      if (base) {
        categoryEmoji = base.emoji;
        categoryTitle = base.title;
      }
    } else if (item.categoryId?.startsWith("chat:")) {
      const uuid = item.categoryId.slice("chat:".length);
      const row = chatCategoryById.get(uuid);
      if (row) {
        categoryEmoji = row.emoji;
        categoryTitle = row.title;
      }
    }
    const payerName =
      item.payerId !== undefined
        ? payerById.get(item.payerId.toString())
        : undefined;
    return {
      description: item.description,
      amount: item.amount,
      currency: item.currency,
      categoryEmoji,
      categoryTitle,
      payerName,
      splitMode: item.splitMode,
      participantCount: item.participantCount,
    };
  });

  const message = formatBatchSummaryMessage(
    input.kind,
    resolved,
    input.actorName
  );

  const threadId =
    input.threadId ??
    (chat.threadId != null ? Number(chat.threadId) : undefined);

  try {
    const result = await teleBot.sendMessage(Number(input.chatId), message, {
      parse_mode: "MarkdownV2",
      message_thread_id: threadId,
    });
    return { sent: true, messageId: result.message_id };
  } catch (err) {
    // Non-fatal: the batch itself already committed; a failed summary
    // notification shouldn't surface as a batch failure.
    console.error("sendBatchExpenseSummary: teleBot.sendMessage failed", err);
    return { sent: false, messageId: null };
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/expense/batch-summary",
      contentTypes: ["application/json"],
      tags: ["expense"],
      summary: "Send a one-off Telegram summary message for a batch operation",
      description:
        "Emits a single consolidated MarkdownV2 message listing the expenses in a batch (created or updated). Each row can carry payer / split-mode / participant-count for a richer tree-style layout; missing fields collapse the block gracefully. Intended to be called by CLI bulk commands after the batch completes — replaces per-row notifications.",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    const actorName =
      input.actorName ??
      (ctx.session?.user?.first_name ? ctx.session.user.first_name : undefined);
    return sendBatchExpenseSummaryHandler(
      { ...input, actorName },
      ctx.db,
      ctx.teleBot
    );
  });
