// Dev-only preview: render the snapshot share message for the latest
// snapshot in the dev DB (or a specific id via argv) and print to stdout
// WITHOUT sending to Telegram. Run with:
//   pnpm --filter @dko/database exec tsx ../../scripts/preview-snapshot-share.ts [snapshotId]

import { PrismaClient } from "@dko/database";
import { shareSnapshotMessageHandler } from "../packages/trpc/src/routers/snapshot/shareSnapshotMessage.js";

const db = new PrismaClient();

async function main() {
  const snapshotId = process.argv[2];

  let target;
  if (snapshotId) {
    target = await db.expenseSnapshot.findUnique({
      where: { id: snapshotId },
      select: { id: true, title: true, creatorId: true },
    });
  } else {
    target = await db.expenseSnapshot.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, creatorId: true },
    });
  }

  if (!target) {
    console.error("No snapshot found.");
    process.exit(1);
  }

  console.error(`Previewing snapshot "${target.title}" (${target.id})`);

  const fakeTeleBot = {
    getMe: async () => ({ username: "bananasplitz_dev_bot" }),
    sendMessage: async (_chatId: number, message: string) => {
      console.log("==== RENDERED MESSAGE ====");
      console.log(message);
      console.log("==== END ====");
      return { message_id: 0 };
    },
  };

  await shareSnapshotMessageHandler(
    { snapshotId: target.id },
    db as any,
    fakeTeleBot as any,
    target.creatorId
  );

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
