import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { ChatType } from "@dko/database";

export const inputSchema = z.object({
  userId: z.number().transform((val) => BigInt(val)),
  firstName: z.string(),
  lastName: z.string().nullable(),
  userName: z.string().nullable(),
  phoneNumber: z.string().nullable().optional(),
});

export const outputSchema = z.object({
  id: z.preprocess((arg) => String(arg), z.string()),
  firstName: z.string(),
  lastName: z.string().nullable(),
  username: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  phoneNumberRequested: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createUserHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { id: input.userId },
    });
    if (existingUser) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `User with ID ${input.userId} already exists`,
      });
    }

    const user = await db.user.create({
      data: {
        id: input.userId,
        firstName: input.firstName,
        lastName: input.lastName,
        username: input.userName,
        phoneNumber: input.phoneNumber,
      },
    });

    // Create personal chat for the user. This is intentionally NOT in a $transaction
    // with user creation -- if chat creation fails, the user is still valid and the
    // backfill script (packages/database/scripts/backfill-personal-chats.ts) can fix
    // any missing personal chats.
    try {
      await db.chat.create({
        data: {
          id: input.userId,
          title: input.firstName,
          type: ChatType.private,
          members: { connect: { id: input.userId } },
        },
      });
    } catch (chatError) {
      if (
        chatError instanceof Error &&
        chatError.message.includes("Unique constraint failed")
      ) {
        console.warn(
          `Personal chat already exists for user ${input.userId}, skipping creation`
        );
      } else {
        console.error(
          `Failed to create personal chat for user ${input.userId}:`,
          chatError
        );
      }
    }

    return user;
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    // Handle Prisma unique constraint violations
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint failed")
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `User with ID ${input.userId} already exists`,
      });
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create user",
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/user",
      contentTypes: ["application/json"],
      tags: ["user"],
      summary: "Create a new user",
      description: "Create a new user with the provided information",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    return createUserHandler(input, ctx.db);
  });
