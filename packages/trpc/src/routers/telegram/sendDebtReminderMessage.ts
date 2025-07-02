import { z } from "zod";
import { publicProcedure } from "../../trpc.js";
import { Telegram } from "telegraf";
import { mentionMarkdown } from "../../utils/telegram.js";

const inputSchema = z.object({
  chatId: z.number(),
  debtorUserId: z.number(),
  debtorName: z.string(),
  debtorUsername: z.string().optional(),
  creditorName: z.string(),
  amount: z.number(),
  currency: z.string().default("SGD"),
});

export const sendDebtReminderMessageHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Telegram
) => {
  // Format the amount as currency
  const formattedAmount = new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: input.currency,
  }).format(input.amount);

  // Create user mention - prefer username if available, otherwise use name with user ID
  const debtorMention = input.debtorUsername
    ? `@${input.debtorUsername}`
    : mentionMarkdown(input.debtorUserId, input.debtorName, 2);

  // Create the reminder message
  const message = `💁 Hey ${debtorMention}, you still owe ${input.creditorName} ${formattedAmount}\\. Don't forget to settle up\\!`;

  // Send the message
  const sentMessage = await teleBot.sendMessage(input.chatId, message, {
    parse_mode: "MarkdownV2",
  });

  return sentMessage.message_id;
};

export default publicProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    return sendDebtReminderMessageHandler(input, ctx.teleBot);
  });
