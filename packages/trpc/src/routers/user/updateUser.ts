import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";

export const inputSchema = z.object({
  userId: z.number().transform((val) => BigInt(val)),
  firstName: z.string().optional(),
  lastName: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  phoneNumberRequested: z.boolean().optional(),
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

export const updateUserHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    // Check if user exists
    const existingUser = await db.user.findUnique({
      where: { id: input.userId },
    });

    if (!existingUser) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `User with ID ${input.userId} not found`,
      });
    }

    // Build update data object with only provided fields
    const updateData: {
      firstName?: string;
      lastName?: string | null;
      username?: string | null;
      phoneNumber?: string | null;
      phoneNumberRequested?: boolean;
    } = {};

    if (input.firstName !== undefined) {
      updateData.firstName = input.firstName;
    }
    if (input.lastName !== undefined) {
      updateData.lastName = input.lastName;
    }
    if (input.username !== undefined) {
      updateData.username = input.username;
    }
    if (input.phoneNumber !== undefined) {
      updateData.phoneNumber = input.phoneNumber;
    }
    if (input.phoneNumberRequested !== undefined) {
      updateData.phoneNumberRequested = input.phoneNumberRequested;
    }

    const updatedUser = await db.user.update({
      where: { id: input.userId },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        phoneNumber: true,
        phoneNumberRequested: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to update user",
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "PATCH",
      path: "/user/{userId}",
      contentTypes: ["application/json"],
      tags: ["user"],
      summary: "Update user information",
      description:
        "Update user properties using a patch approach - only provided fields will be updated",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return updateUserHandler(input, ctx.db);
  });
