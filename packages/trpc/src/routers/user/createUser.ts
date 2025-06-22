import { z } from 'zod'
import { Db, publicProcedure } from '../../trpc.js'

export const inputSchema = z.object({
  userId: z.number(),
  firstName: z.string(),
  lastName: z.string().optional(),
  userName: z.string().optional(),
})

export const createUserHandler = async (input: z.infer<typeof inputSchema>, db: Db) => {
  return db.user.create({
    data: {
      id: input.userId,
      firstName: input.firstName,
      lastName: input.lastName,
      username: input.userName,
    },
  })
}

export default publicProcedure.input(inputSchema).mutation(async ({ input, ctx }) => {
  return createUserHandler(input, ctx.db)
})
