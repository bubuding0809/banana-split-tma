import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../../trpc.js";
import { assertChatAccess } from "../../../middleware/chatScope.js";

export const inputSchema = z.object({
  templateId: z.string().uuid(),
});

export default protectedProcedure
  .input(inputSchema)
  .output(z.any())
  .query(async ({ input, ctx }) => {
    const tmpl = await ctx.db.recurringExpenseTemplate.findUnique({
      where: { id: input.templateId },
      include: {
        expenses: { orderBy: { date: "desc" }, take: 10 },
      },
    });
    if (!tmpl) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
    }
    await assertChatAccess(ctx.session, ctx.db, tmpl.chatId);
    return tmpl;
  });
