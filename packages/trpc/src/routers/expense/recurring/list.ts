import { z } from "zod";
import { protectedProcedure } from "../../../trpc.js";
import { assertChatAccess } from "../../../middleware/chatScope.js";
import { markEndedTemplates } from "./markEnded.js";

export const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
});

export default protectedProcedure
  .input(inputSchema)
  .output(z.any())
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    // Note: this query writes — lazily flips expired templates to ENDED.
    await markEndedTemplates(ctx.db, { chatId: input.chatId });
    return ctx.db.recurringExpenseTemplate.findMany({
      where: { chatId: input.chatId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
  });
