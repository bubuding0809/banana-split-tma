import { z } from "zod";
import { publicProcedure } from "../trpc.js";

export const helloRouter = {
  helloWorld: publicProcedure.query(() => {
    return {
      greeting: `Hello World!`,
    };
  }),
  workItems: publicProcedure.query(() => {
    return [
      {
        id: 1,
        title: "Work Item 1",
        description: "Description for Work Item 1",
      },
      {
        id: 2,
        title: "Work Item 2",
        description: "Description for Work Item 2",
      },
      {
        id: 3,
        title: "Work Item 3",
        description: "Description for Work Item 3",
      },
    ];
  }),
  user: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.id },
      });
      return user;
    }),
  users: publicProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany();
    return users;
  }),
};
