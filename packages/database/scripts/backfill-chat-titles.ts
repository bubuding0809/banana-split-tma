/**
 * Backfill stale group titles from Telegram.
 *
 * Background: Chat.title was only written once, when the bot joined a group.
 * Renames in Telegram never reached the DB until the new_chat_title handler
 * shipped (2026-09-26), so older rows can carry a group's original name.
 * The source of truth lives in Telegram, so this can't be a SQL migration —
 * it asks the Bot API for each group's current title.
 *
 * Usage:
 *   pnpm --filter @dko/database backfill:chat-titles
 *     # dry-run: prints every group whose title differs, plus the ones the
 *     # bot can no longer read. Writes a CSV to $TMPDIR. No DB writes.
 *
 *   pnpm --filter @dko/database backfill:chat-titles -- --apply
 *     # updates only the rows classified `stale`.
 *
 * Required env: DATABASE_URL, TELEGRAM_BOT_TOKEN (the PROD bot's token when
 * pointed at prod — a different bot can't see the chats and every row will
 * come back `unreachable`, which is harmless but useless).
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "../generated/client/index.js";

const APPLY = process.argv.includes("--apply");
// Bot API allows ~30 req/s globally; stay well under.
const DELAY_MS = 50;
const MAX_RETRIES = 3;

type Classification = "ok" | "stale" | "unreachable";

type Row = {
  chatId: bigint;
  storedTitle: string;
  telegramTitle: string;
  classification: Classification;
  notes: string;
};

type TelegramResponse<T> =
  | { ok: true; result: T }
  | {
      ok: false;
      error_code: number;
      description: string;
      parameters?: { retry_after?: number; migrate_to_chat_id?: number };
    };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callBotApi<T>(
  token: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<TelegramResponse<T>> {
  for (let attempt = 0; ; attempt++) {
    const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const body = (await resp.json()) as TelegramResponse<T>;
    if (
      !body.ok &&
      body.error_code === 429 &&
      body.parameters?.retry_after &&
      attempt < MAX_RETRIES
    ) {
      await sleep(body.parameters.retry_after * 1000);
      continue;
    }
    return body;
  }
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function backfillChatTitles() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const databaseUrl = process.env.DATABASE_URL;
  if (!token || !databaseUrl) {
    console.error("DATABASE_URL and TELEGRAM_BOT_TOKEN must be set. Exiting.");
    process.exit(1);
  }

  try {
    const url = new URL(databaseUrl);
    console.log(`Target database: ${url.hostname}${url.pathname}`);
  } catch {
    console.log("Target database: (unable to parse DATABASE_URL)");
  }

  const me = await callBotApi<{ username: string }>(token, "getMe");
  if (!me.ok) {
    console.error(`getMe failed: ${me.description}. Exiting.`);
    process.exit(1);
  }
  console.log(`Bot: @${me.result.username}`);
  console.log(`Mode: ${APPLY ? "APPLY" : "dry-run"}\n`);

  const db = new PrismaClient();
  try {
    const chats = await db.chat.findMany({
      where: { type: { in: ["group", "supergroup"] } },
      select: { id: true, title: true },
      orderBy: { createdAt: "asc" },
    });
    console.log(`Checking ${chats.length} group chats...`);

    const rows: Row[] = [];
    for (const chat of chats) {
      const resp = await callBotApi<{ title?: string }>(token, "getChat", {
        chat_id: chat.id.toString(),
      });
      await sleep(DELAY_MS);

      if (!resp.ok) {
        const migratedTo = resp.parameters?.migrate_to_chat_id;
        rows.push({
          chatId: chat.id,
          storedTitle: chat.title,
          telegramTitle: "",
          classification: "unreachable",
          notes: migratedTo
            ? `migrated to ${migratedTo}`
            : `${resp.error_code}: ${resp.description}`,
        });
        continue;
      }

      const telegramTitle = resp.result.title ?? "";
      rows.push({
        chatId: chat.id,
        storedTitle: chat.title,
        telegramTitle,
        classification:
          telegramTitle && telegramTitle !== chat.title ? "stale" : "ok",
        notes: "",
      });
    }

    const stale = rows.filter((r) => r.classification === "stale");
    const unreachable = rows.filter((r) => r.classification === "unreachable");

    console.log(`\nStale titles (${stale.length}):`);
    for (const r of stale) {
      console.log(`  ${r.chatId}: "${r.storedTitle}" -> "${r.telegramTitle}"`);
    }
    console.log(`\nUnreachable (${unreachable.length}) — left untouched:`);
    for (const r of unreachable) {
      console.log(`  ${r.chatId}: "${r.storedTitle}" (${r.notes})`);
    }

    const csvPath = join(tmpdir(), `chat-title-backfill-${Date.now()}.csv`);
    writeFileSync(
      csvPath,
      [
        "chat_id,classification,stored_title,telegram_title,notes",
        ...rows.map((r) =>
          [
            r.chatId.toString(),
            r.classification,
            csvEscape(r.storedTitle),
            csvEscape(r.telegramTitle),
            csvEscape(r.notes),
          ].join(",")
        ),
      ].join("\n")
    );
    console.log(`\nCSV: ${csvPath}`);

    if (!APPLY) {
      console.log("\nDry-run only. Re-run with --apply to update stale rows.");
      return;
    }

    let updated = 0;
    let failed = 0;
    for (const r of stale) {
      try {
        await db.chat.update({
          where: { id: r.chatId },
          data: { title: r.telegramTitle },
        });
        updated++;
      } catch (error) {
        failed++;
        console.error(`Failed to update ${r.chatId}:`, error);
      }
    }
    console.log(`\nApplied: ${updated} updated, ${failed} failed.`);
  } finally {
    await db.$disconnect();
  }
}

backfillChatTitles().catch((error) => {
  console.error("Backfill script failed:", error);
  process.exit(1);
});
