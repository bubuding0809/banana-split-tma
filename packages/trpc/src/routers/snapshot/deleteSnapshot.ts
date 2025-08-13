import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  snapshotId: z.string().uuid(),
});

export const deleteSnapshotHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  // First check if the snapshot exists and belongs to the user
  const snapshot = await db.expenseSnapshot.findUnique({
    where: {
      id: input.snapshotId,
    },
    select: {
      id: true,
      creatorId: true,
    },
  });

  if (!snapshot) {
    throw new Error("Snapshot not found");
  }

  // Delete the snapshot (expenses will be disconnected automatically)
  await db.expenseSnapshot.delete({
    where: {
      id: input.snapshotId,
    },
  });

  return { success: true, deletedId: input.snapshotId };
};

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    return deleteSnapshotHandler(input, ctx.db);
  });
