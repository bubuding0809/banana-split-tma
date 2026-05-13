/**
 * One-shot smoke test for cross-group DM templates.
 * Renders sample nudge + settle messages and DMs them to a target user
 * via the Telegram Bot API.
 *
 * Run from repo root:
 *   pnpm tsx scripts/smoke-cross-group-dm.ts [--username bubuding0809]
 *
 * Requires:
 *   - apps/bot/.env  → TELEGRAM_BOT_TOKEN
 *   - packages/database/.env → DATABASE_URL
 */
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@dko/database";
import {
  buildNudgeCaption,
  buildSettleNotificationCaption,
  type CrossGroupSummary,
} from "../packages/trpc/src/services/crossGroupDmTemplates.js";
import {
  buildCounterpartyDeepLinkPayload,
  buildMiniAppUrl,
} from "../packages/trpc/src/utils/counterpartyDeepLink.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
config({ path: resolve(repoRoot, "apps/bot/.env") });
config({ path: resolve(repoRoot, "packages/database/.env") });

const args = process.argv.slice(2);
const usernameIdx = args.indexOf("--username");
const targetUsername =
  usernameIdx >= 0 && args[usernameIdx + 1]
    ? args[usernameIdx + 1]
    : "bubuding0809";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN missing — check apps/bot/.env");
  process.exit(1);
}

const sample: CrossGroupSummary = {
  senderName: "Sean",
  baseCurrency: "SGD",
  totalBaseAbs: 391.88,
  groups: [
    {
      chatId: 1,
      chatTitle: "🥟 Ding & Ting 🍳",
      currency: "SGD",
      nativeAbs: 322.67,
      baseAbs: 322.67,
    },
    {
      chatId: 2,
      chatTitle: "DEV-BOX-3",
      currency: "SGD",
      nativeAbs: 40.33,
      baseAbs: 40.33,
    },
    {
      chatId: 2,
      chatTitle: "DEV-BOX-3",
      currency: "AED",
      nativeAbs: 83.33,
      baseAbs: 28.88,
    },
  ],
};

async function send(
  chatId: number | string,
  text: string,
  label: string,
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; url: string }>> }
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
    link_preview_options: { is_disabled: true },
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: { ok: boolean; description?: string; result?: unknown } =
    (await res.json()) as never;
  if (!res.ok || !json.ok) {
    console.error(`✗ ${label}: HTTP ${res.status}`, json.description ?? json);
    return false;
  }
  console.log(`✓ ${label} sent`);
  return true;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { username: targetUsername },
      select: { id: true, firstName: true, username: true },
    });
    if (!user) {
      console.error(`User @${targetUsername} not found in DB`);
      process.exit(1);
    }
    const targetId = Number(user.id);
    console.log(
      `Sending smoke samples to ${user.firstName} (@${user.username}, id=${targetId})\n`
    );

    // Pretend "Sean" (a different user id) is the counterparty for the
    // inline-button deep link — opens TMA → counterparty sheet for Sean.
    const fakeCounterpartyId = BigInt(700700700);
    const botUsername = process.env.SMOKE_BOT_USERNAME ?? "BananaSplitzStgBot";
    const nudgePayload = buildCounterpartyDeepLinkPayload(
      BigInt(targetId),
      fakeCounterpartyId
    );
    const settlePayload = buildCounterpartyDeepLinkPayload(
      BigInt(targetId),
      fakeCounterpartyId
    );

    await send(
      targetId,
      "🧪 *Smoke test* — cross\\-group DM templates incoming",
      "banner"
    );
    await send(targetId, buildNudgeCaption(sample), "nudge", {
      inline_keyboard: [
        [
          {
            text: "💁 Open Balances",
            url: buildMiniAppUrl(botUsername, nudgePayload),
          },
        ],
      ],
    });
    await send(targetId, buildSettleNotificationCaption(sample), "settle", {
      inline_keyboard: [
        [
          {
            text: "📊 View Balances",
            url: buildMiniAppUrl(botUsername, settlePayload),
          },
        ],
      ],
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
