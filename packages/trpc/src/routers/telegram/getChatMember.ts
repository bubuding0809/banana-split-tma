import { z } from "zod";
import { protectedProcedure } from "../../trpc.js";
import { Telegram } from "telegraf";

const inputSchema = z.object({
  chatId: z.number(),
  userId: z.number(),
});

export const getChatMemberHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Telegram
) => {
  return teleBot.getChatMember(input.chatId, input.userId);
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getChatMemberHandler(input, ctx.teleBot);
  });
