import { z } from 'zod'
import { Db, publicProcedure } from '../../trpc.js'

export const inputSchema = z.object({ userId: z.preprocess(arg => Number(arg), z.number()) })

export const getUserHandler = async (input: z.infer<typeof inputSchema>, db: Db) => {
  return db.user.findUnique({ where: { id: input.userId } })
}

export default publicProcedure.input(inputSchema).query(async ({ input, ctx }) => {
  return getUserHandler(input, ctx.db)
})
