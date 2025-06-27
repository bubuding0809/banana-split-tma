
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { Db, publicProcedure } from '../../trpc.js'
import { ChatType } from '@dko/database'

export const inputSchema = z.object({
  chatId: z.number().transform(val => BigInt(val)),
  chatTitle: z.string(),
  chatType: z.string(),
  chatPhoto: z.string().nullish(),
})

export const outputSchema = z.object({
  id: z.preprocess((arg) => String(arg), z.string()),
  title: z.string(),
  photo: z.string(),
  type: z.nativeEnum(ChatType),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const createChatHandler = async (input: z.infer<typeof inputSchema>, db: Db) => {
  try {
    // Validate chat type
    if (!Object.values(ChatType).includes(input.chatType as ChatType)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Invalid chat type: ${input.chatType}. Must be one of: ${Object.values(ChatType).join(', ')}`,
      })
    }

    // Check if chat already exists
    const existingChat = await db.chat.findUnique({ where: { id: input.chatId } })
    if (existingChat) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Chat with ID ${input.chatId} already exists`,
      })
    }

    return db.chat.create({
      data: {
        id: input.chatId,
        title: input.chatTitle,
        type: input.chatType as ChatType,
        ...(input.chatPhoto && { photo: input.chatPhoto }),
      },
    })
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error
    }
    
    // Handle Prisma unique constraint violations
    if (error instanceof Error && error.message.includes('Unique constraint failed')) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Chat with ID ${input.chatId} already exists`,
      })
    }
    
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create chat',
    })
  }
}

export default publicProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/chat",
      contentTypes: ["application/json"],
      tags: ["chat"],
      summary: "Create a new chat",
      description: "Create a new chat with the provided information",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return createChatHandler(input, ctx.db)
  })
