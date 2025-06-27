import { z } from "zod";
import { Db, publicProcedure } from "../../trpc.js";

export const inputSchema = z.object({
  userId: z.preprocess((arg) => Number(arg), z.number()),
});
export const outputSchema = z
  .object({
    id: z.preprocess((arg) => String(arg), z.string()),
    firstName: z.string(),
    lastName: z.string().nullable(),
    username: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .nullable();

export const getUserHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const user = await db.user.findUnique({ where: { id: input.userId } });
  return user;
};

export default publicProcedure
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
