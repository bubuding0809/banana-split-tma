import {
  getCurrencyDecimalDigits,
  getCurrencySymbol,
} from "../utils/currencyApi.js";

export interface ChatBucket {
  chatId: number;
  chatTitle: string;
  currency: string;
  nativeAbs: number;
  baseAbs: number;
}

export interface CrossGroupSummary {
  senderName: string;
  baseCurrency: string;
  totalBaseAbs: number;
  groups: ChatBucket[];
}

// Telegram MarkdownV2 reserved characters (per Bot API docs).
// Escape these outside `pre`/`code` blocks.
function escapeMd(s: string): string {
  return s.replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

function fmt(amount: number, currency: string): string {
  const digits = getCurrencyDecimalDigits(currency);
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${amount.toFixed(digits)}`;
}

function countChats(groups: ChatBucket[]): number {
  return new Set(groups.map((g) => g.chatId)).size;
}

// Builds a monospaced tree-style breakdown grouped by chat. Wrapped in
// a MarkdownV2 ```code``` block so Telegram renders it in a monospace
// font, keeping the box-drawing characters aligned.
function buildTreeBlock(s: CrossGroupSummary): string {
  type ChatNode = { chatTitle: string; buckets: ChatBucket[] };
  const byChat: ChatNode[] = [];
  const chatIndex = new Map<number, number>();
  for (const g of s.groups) {
    const i = chatIndex.get(g.chatId);
    if (i === undefined) {
      chatIndex.set(g.chatId, byChat.length);
      byChat.push({ chatTitle: g.chatTitle, buckets: [g] });
    } else {
      byChat[i]!.buckets.push(g);
    }
  }

  const lines: string[] = [];
  byChat.forEach((chat, ci) => {
    const isLastChat = ci === byChat.length - 1;
    const chatPrefix = isLastChat ? "└─" : "├─";
    const childIndent = isLastChat ? "   " : "│  ";
    lines.push(`${chatPrefix} ${chat.chatTitle}`);
    chat.buckets.forEach((b, bi) => {
      const isLastBucket = bi === chat.buckets.length - 1;
      const bucketPrefix = isLastBucket ? "└─" : "├─";
      const parts = [fmt(b.nativeAbs, b.currency)];
      if (b.currency !== s.baseCurrency) {
        parts.push(`≈ ${fmt(b.baseAbs, s.baseCurrency)}`);
      }
      lines.push(`${childIndent}${bucketPrefix} ${parts.join("  ")}`);
    });
  });

  // Inside a MarkdownV2 ```pre``` block, no character escaping is needed.
  return "```\n" + lines.join("\n") + "\n```";
}

export function buildSettleNotificationCaption(s: CrossGroupSummary): string {
  const total = fmt(s.totalBaseAbs, s.baseCurrency);
  const n = countChats(s.groups);
  const groupWord = n === 1 ? "group" : "groups";
  return [
    "✅ *Debts Settled*",
    "",
    `${escapeMd(s.senderName)} just settled with you ≈ ${escapeMd(total)} across ${n} ${groupWord}`,
    "",
    buildTreeBlock(s),
    "",
    "All shared balances are now zeroed 🎉",
  ].join("\n");
}

export function buildNudgeCaption(s: CrossGroupSummary): string {
  const total = fmt(s.totalBaseAbs, s.baseCurrency);
  const n = countChats(s.groups);
  const groupWord = n === 1 ? "group" : "groups";
  return [
    "🔔 *Settlement Reminder*",
    "",
    `You owe ${escapeMd(s.senderName)} ≈ ${escapeMd(total)} across ${n} ${groupWord}`,
    "",
    buildTreeBlock(s),
    "",
    "💁 Open Balances in your personal chat to settle",
  ].join("\n");
}
