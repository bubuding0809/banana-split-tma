import { z } from "zod";
import { publicProcedure } from "../../trpc.js";
import { Telegram } from "telegraf";

const inputSchema = z.object({
  chatId: z.number(),
  message: z.string(),
});

export const sendMessageHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Telegram
) => {
  const message = await teleBot.sendMessage(input.chatId, input.message);
  return message.message_id;
};

export default publicProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    return sendMessageHandler(input, ctx.teleBot);
  });
