import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";

export const inputSchema = z.object({
  userId: z.number().transform((val) => BigInt(val)),
});
export const outputSchema = z.object({
  id: z.preprocess((arg) => String(arg), z.string()),
  firstName: z.string(),
  lastName: z.string().nullable(),
  username: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const getUserHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    const user = await db.user.findUnique({ where: { id: input.userId } });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `User with ID ${input.userId} not found`,
      });
    }

    return user;
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to retrieve user",
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/user/{userId}",
      contentTypes: ["application/json"],
      tags: ["user"],
      summary: "Get user by ID",
      description: "Retrieve a user by their unique identifier",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    return getUserHandler(input, ctx.db);
  });
