import type { PrismaClient } from "@dko/database";

export async function shareSnapshotMessageHandler(
  input: { snapshotId: string },
  db: PrismaClient,
  teleBot: any,
  callerUserId: bigint
): Promise<void> {
  throw new Error("Not implemented");
}
