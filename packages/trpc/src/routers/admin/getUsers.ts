import { adminProcedure } from "../../trpc.js";

export default adminProcedure.query(async ({ ctx }) => {
  const users = await ctx.db.user.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
    },
  });

  return users;
});
