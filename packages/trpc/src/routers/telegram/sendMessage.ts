import { z } from "zod";
import { protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import type { Api } from "grammy";

const inputSchema = z.object({
  chatId: z.number(),
  message: z.string(),
  threadId: z.number().optional(),
});

export const sendMessageHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Api
) => {
  const message = await teleBot.sendMessage(input.chatId, input.message, {
    message_thread_id: input.threadId,
  });
  return message.message_id;
};

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    return sendMessageHandler(input, ctx.teleBot);
  });
