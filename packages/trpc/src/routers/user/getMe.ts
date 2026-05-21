import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc.js";

const outputSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  username: z.string().nullable(),
  baseCurrency: z.string(),
});

/**
 * Returns the user the current API key is authenticated as. Unlike `getUser`,
 * it takes no input — the caller is resolved from the session. Lets clients
 * (e.g. the Raycast extension) identify "me" without already knowing the ID.
 */
export default protectedProcedure
  .output(outputSchema)
  .query(async ({ ctx }) => {
    const sessionUser = ctx.session.user;
    if (!sessionUser) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "This API key is not associated with a user",
      });
    }

    const user = await ctx.db.user.findUnique({
      where: { id: BigInt(sessionUser.id) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        baseCurrency: true,
      },
    });
    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    return { ...user, id: Number(user.id) };
  });
