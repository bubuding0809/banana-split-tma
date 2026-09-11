import { z } from "zod";
import { protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import type { Api } from "grammy";

const inputSchema = z.object({
  chatId: z.number(),
  userId: z.number(),
});

export const getChatMemberHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Api
) => {
  return teleBot.getChatMember(input.chatId, input.userId);
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    return getChatMemberHandler(input, ctx.teleBot);
  });
