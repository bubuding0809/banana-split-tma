import { z } from "zod";
import { publicProcedure } from "../../trpc.js";
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

export default publicProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getChatMemberHandler(input, ctx.teleBot);
  });
