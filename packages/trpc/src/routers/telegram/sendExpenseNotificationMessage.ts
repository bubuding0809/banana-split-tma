import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { Telegram } from "telegraf";
import {
  mentionMarkdown,
  escapeMarkdown,
  createDeepLinkedUrl,
} from "../../utils/telegram.js";
import { encodeV1DeepLink } from "../../utils/deepLinkProtocol.js";
import { inlineKeyboard } from "telegraf/markup";

// Fields that can be marked with ✏️ on an edited notification. Kept in
// lockstep with `CHANGED_FIELDS` in sendBatchExpenseSummary.ts so the
// ✏️ signal reads the same in singular edits and batch summaries.
export const EXPENSE_CHANGED_FIELDS = [
  "description",
  "amount",
  "payer",
  "category",
  "split",
] as const;
export type ExpenseChangedField = (typeof EXPENSE_CHANGED_FIELDS)[number];

const participantSchema = z.object({
  userId: z.number(),
  name: z.string().min(1, "Participant name is required"),
  username: z.string().optional(),
  amount: z.number().positive("Amount must be positive"),
});

const inputSchema = z.object({
  chatId: z.number(),
  chatType: z.string().default("group"),
  // Expense UUID — required so the "View Expense" CTA can deep-link
  // straight into the expense in the TMA via entity_type="e" on the
  // v1 deep link payload.
  expenseId: z.string().uuid(),
  payerId: z.number(),
  payerName: z.string().min(1, "Payer name is required"),
  creatorUserId: z.number(),
  creatorName: z.string().min(1, "Creator name is required"),
  creatorUsername: z.string().optional(),
  expenseDescription: z.string().min(1, "Expense description is required"),
  totalAmount: z.number().positive("Total amount must be positive"),
  participants: z
    .array(participantSchema)
    .min(1, "At least one participant is required"),
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter code")
    .default("SGD"),
  // Resolved category label for the notification. Caller resolves
  // `categoryId` against base + chat categories so this handler stays
  // purely presentational. Both fields are required together — pass
  // both to show a category row, or neither to skip it.
  categoryEmoji: z.string().optional(),
  categoryTitle: z.string().optional(),
  // Expense date, used to render the 🗓 row ("Today" / "Yesterday" /
  // short date). Required — the bot's private-chat flow and every
  // Mini App create/edit path already have it, and we want the label
  // in every notification.
  expenseDate: z.date(),
  threadId: z.number().optional(),
  force: z.boolean().default(false),
});

// Exported type for use in other handlers
export type ExpenseNotificationData = z.infer<typeof inputSchema>;
export type ExpenseParticipant = z.infer<typeof participantSchema>;

// Human-friendly date label — "Today" / "Yesterday" / "Tomorrow" for
// near dates, short ISO-ish date otherwise. Kept local to this file to
// avoid a cross-package shared-utils dance; the bot's private-chat
// flow duplicates this (apps/bot/src/features/expenses.ts).
const formatDateLabel = (date: Date): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / 86_400_000
  );
  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// Raw currency format — `SGD 50.00` — matches web + CLI + the bot's
// parse-expense input. Avoids Intl locale surprises across currencies.
const formatAmount = (currency: string, amount: number): string =>
  `${currency} ${amount.toFixed(2)}`;

/**
 * Formats the expense notification message
 * This is shared between create and edit operations
 *
 * When `opts.isUpdate` is true, the title reads "🧾 Expense" (not
 * "🧾 New Expense") and fields listed in `opts.changedFields` get a
 * trailing ✏️ so the reader can see at a glance what was edited.
 */
export const formatExpenseMessage = (
  payerId: number,
  payerName: string,
  expenseDescription: string,
  totalAmount: number,
  participants: ExpenseParticipant[],
  currency: string,
  expenseDate: Date,
  categoryEmoji?: string,
  categoryTitle?: string,
  opts?: {
    isUpdate?: boolean;
    changedFields?: readonly ExpenseChangedField[];
  }
): string => {
  const escapedDescription = escapeMarkdown(expenseDescription, 2);
  const escapedTotal = escapeMarkdown(formatAmount(currency, totalAmount), 2);

  let payerMention: string;
  try {
    payerMention = mentionMarkdown(payerId, payerName, 2);
  } catch {
    payerMention = escapeMarkdown(payerName, 2);
  }

  const isUpdate = opts?.isUpdate ?? false;
  const changed = new Set<ExpenseChangedField>(opts?.changedFields ?? []);
  const mark = (field: ExpenseChangedField, body: string): string =>
    changed.has(field) ? `${body} ✏️` : body;

  // Tree-style share list — `┣` for each branch, `┗` to close the
  // list. Mirrors the style already used in the group reminder +
  // snapshot messages (see sendGroupReminderMessage / shareSnapshotMessage).
  const participantList = participants
    .map((participant, index) => {
      const amount = escapeMarkdown(
        formatAmount(currency, participant.amount),
        2
      );
      let mention: string;
      try {
        mention = mentionMarkdown(participant.userId, participant.name, 2);
      } catch {
        mention = escapeMarkdown(participant.name, 2);
      }
      const prefix = index === participants.length - 1 ? "┗" : "┣";
      return `${prefix} ${mention}: ${amount}`;
    })
    .join("\n");

  const categoryLine =
    categoryEmoji && categoryTitle
      ? `> 🏷 • ${mark("category", `${categoryEmoji} ${escapeMarkdown(categoryTitle, 2)}`)}\n`
      : "";

  const dateLabel = escapeMarkdown(formatDateLabel(expenseDate), 2);
  const titleVerb = isUpdate ? "Expense" : "New Expense";
  const titleLine = `🧾 ${titleVerb} by ${mark("payer", payerMention)}`;
  const splitsHeader = `💸 Splits${changed.has("split") ? " ✏️" : ""}`;

  return `${titleLine}

> 📝 • ${mark("description", escapedDescription)}
${categoryLine}> 📅 • ${dateLabel}

Total: ${mark("amount", escapedTotal)}

${splitsHeader}
${participantList}`;
};

export const sendExpenseNotificationMessageHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Telegram
) => {
  // Validate business logic
  if (input.chatId === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid chat ID. Cannot send message to chat ID 0.",
    });
  }

  if (input.participants.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot send expense notification without participants.",
    });
  }

  // Respect the per-chat notification preference unless caller explicitly forces.
  if (!input.force) {
    const chat = await db.chat.findUnique({
      where: { id: BigInt(input.chatId) },
      select: { notifyOnExpense: true },
    });
    if (!chat?.notifyOnExpense) {
      return null;
    }
  }

  const message = formatExpenseMessage(
    input.payerId,
    input.payerName,
    input.expenseDescription,
    input.totalAmount,
    input.participants,
    input.currency,
    input.expenseDate,
    input.categoryEmoji,
    input.categoryTitle
  );

  const botInfo = await teleBot.getMe();
  const deepLinkPayload = encodeV1DeepLink(
    BigInt(input.chatId),
    input.chatType === "private" ? "p" : "g",
    "e",
    input.expenseId
  );
  const deepLink = createDeepLinkedUrl(
    botInfo.username,
    deepLinkPayload,
    "app"
  );
  const keyboard = inlineKeyboard([{ text: "View Expense", url: deepLink }]);

  // Send the message directly (components are pre-escaped)
  try {
    const sentMessage = await teleBot.sendMessage(input.chatId, message, {
      parse_mode: "MarkdownV2",
      message_thread_id: input.threadId,
      ...keyboard,
    });

    return sentMessage.message_id;
  } catch (error) {
    console.error("Error sending expense notification message:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to send expense notification: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

export default protectedProcedure
  .input(inputSchema.omit({ force: true }))
  .mutation(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    return sendExpenseNotificationMessageHandler(
      { ...input, force: false },
      ctx.db,
      ctx.teleBot
    );
  });
