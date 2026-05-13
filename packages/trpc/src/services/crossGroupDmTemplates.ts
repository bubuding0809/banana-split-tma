import {
  getCurrencySymbol,
  getCurrencyDecimalDigits,
} from "../utils/currencyApi.js";

export interface CrossGroupSummary {
  senderName: string;
  baseCurrency: string;
  totalBaseAbs: number;
  groups: Array<{ chatTitle: string; currency: string; nativeAbs: number }>;
}

function fmt(amount: number, currency: string): string {
  const digits = getCurrencyDecimalDigits(currency);
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${amount.toFixed(digits)}`;
}

function groupsLine(groups: CrossGroupSummary["groups"]): string {
  return groups
    .map((g) => `${g.chatTitle}: ${fmt(g.nativeAbs, g.currency)}`)
    .join(" · ");
}

export function buildSettleNotificationCaption(s: CrossGroupSummary): string {
  const total = fmt(s.totalBaseAbs, s.baseCurrency);
  return [
    `${s.senderName} just settled with you across ${s.groups.length} group${s.groups.length === 1 ? "" : "s"}.`,
    `Approx ${total}.`,
    groupsLine(s.groups),
  ].join("\n");
}

export function buildNudgeCaption(s: CrossGroupSummary): string {
  const total = fmt(s.totalBaseAbs, s.baseCurrency);
  return [
    `${s.senderName} is awaiting settlement.`,
    `You owe ≈ ${total} across ${s.groups.length} group${s.groups.length === 1 ? "" : "s"}.`,
    groupsLine(s.groups),
    `Open the Balances tab in your personal chat to view.`,
  ].join("\n");
}
