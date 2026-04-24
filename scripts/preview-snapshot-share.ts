// Dev-only preview: invoke the actual shareSnapshotMessageHandler
// against the latest (or a specific) snapshot with a real Telegraf
// client so the live getChatMember lookups hit Telegram, then capture
// and print the rendered message WITHOUT actually sending it.
//
// Requires TELEGRAM_BOT_TOKEN in env (inherited from apps/bot/.env via
// the dotenv call below). Run with:
//   pnpm --filter lambda exec tsx ../../scripts/preview-snapshot-share.ts [snapshotId]

import { PrismaClient } from "@dko/database";
import { Telegraf } from "telegraf";
import { config as loadEnv } from "dotenv";
import { shareSnapshotMessageHandler } from "../packages/trpc/src/routers/snapshot/shareSnapshotMessage.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/bot/.env holds TELEGRAM_BOT_TOKEN in dev
loadEnv({ path: path.join(__dirname, "..", "apps", "bot", ".env") });

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN not found");
  process.exit(1);
}

const db = new PrismaClient();
const telegraf = new Telegraf(token);

async function main() {
  const snapshotId = process.argv[2];

  const target = snapshotId
    ? await db.expenseSnapshot.findUnique({
        where: { id: snapshotId },
        select: { id: true, title: true, creatorId: true },
      })
    : await db.expenseSnapshot.findFirst({
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, creatorId: true },
      });

  if (!target) {
    console.error("No snapshot found.");
    process.exit(1);
  }
  console.error(`Previewing snapshot "${target.title}" (${target.id})`);

  // Wrap the real telegram client so sendMessage captures instead of
  // posting, but all other calls (getChatMember, getMe) hit the real API.
  const wrappedBot = new Proxy(telegraf.telegram, {
    get(obj, prop) {
      if (prop === "sendMessage") {
        return async (_chatId: number, message: string) => {
          console.log("==== RENDERED MESSAGE ====");
          console.log(message);
          console.log("==== END ====");
          return { message_id: 0 };
        };
      }
      // @ts-expect-error dynamic proxy forwarding
      return obj[prop];
    },
  });

  await shareSnapshotMessageHandler(
    { snapshotId: target.id },
    db as any,
    wrappedBot as any,
    target.creatorId
  );

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
