// Dev-only preview: render all three snapshot views (category / date /
// payer) for the latest (or a specified) snapshot against a real
// Telegraf client so live getChatMember lookups actually hit Telegram,
// then print each to stdout without sending.
//
// Run with:
//   pnpm --filter lambda exec tsx ../../scripts/preview-snapshot-share.ts [snapshotId]

import { PrismaClient } from "@dko/database";
import { Telegraf } from "telegraf";
import { config as loadEnv } from "dotenv";
import {
  loadSnapshotContext,
  buildSnapshotMessage,
  SNAPSHOT_VIEWS,
} from "../packages/trpc/src/routers/snapshot/shareSnapshotMessage.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  console.error(`Previewing snapshot "${target.title}" (${target.id})\n`);

  const ctx = await loadSnapshotContext(
    db as any,
    telegraf.telegram,
    target.id,
    target.creatorId
  );

  for (const view of SNAPSHOT_VIEWS) {
    const { text, replyMarkup } = buildSnapshotMessage(ctx, view);
    console.log(`\n========== VIEW: ${view} ==========`);
    console.log(text);
    console.log("\n[inline_keyboard rows]");
    for (const row of replyMarkup.inline_keyboard) {
      console.log(
        "  " +
          row
            .map((b) =>
              "callback_data" in b
                ? `[${b.text}] -> ${b.callback_data}`
                : `[${b.text}] -> ${b.url}`
            )
            .join("  ")
      );
    }
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
