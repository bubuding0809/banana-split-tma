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
    // Fetch only chatId first to gate access. Doing the access check before
    // the full read avoids leaking template existence to callers without
    // chat access.
    const tmplMeta = await ctx.db.recurringExpenseTemplate.findUnique({
      where: { id: input.templateId },
      select: { chatId: true },
    });
    if (!tmplMeta) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
    }
    await assertChatAccess(ctx.session, ctx.db, tmplMeta.chatId);

    // Now fetch the full template (with related expenses) for the response.
    const tmpl = await ctx.db.recurringExpenseTemplate.findUnique({
      where: { id: input.templateId },
      include: {
        expenses: { orderBy: { date: "desc" }, take: 10 },
      },
    });
    // Defense-in-depth — should never be null here since the meta fetch
    // succeeded a moment ago, but guard anyway.
    if (!tmpl) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
    }
    return tmpl;
  });
